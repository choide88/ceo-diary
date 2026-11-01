const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const SITE=process.env.HARU_TEST_URL||'http://127.0.0.1:8020';
const BASE='https://syyfpdcylvumvyrlgezc.supabase.co';
const A='00000000-0000-0000-0000-000000000001', B='00000000-0000-0000-0000-000000000002';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const documents=new Map(),errors=[];let failBefore=false,failAfter=false,writes=0,hold=null;
 const headers={'access-control-allow-origin':'*','access-control-allow-headers':'apikey,authorization,content-type','access-control-allow-methods':'GET,POST,OPTIONS'};
 async function context(){const c=await browser.newContext({viewport:{width:1440,height:1000}});await c.route(BASE+'/**',async route=>{
  const req=route.request(),u=new URL(req.url());
  const reply=(status,data)=>route.fulfill({status,contentType:'application/json',headers,body:JSON.stringify(data)});
  if(req.method()==='OPTIONS')return reply(200,{});
  if(u.pathname==='/auth/v1/token'){
   const body=req.postDataJSON();const uid=(body.email?.startsWith('b')||body.refresh_token==='refresh-b')?B:A;
   if(body.email?.startsWith('bad'))return reply(400,{message:'Invalid login credentials'});
   return reply(200,{access_token:uid===A?'access-a':'access-b',refresh_token:uid===A?'refresh-a':'refresh-b',expires_in:3600,user:{id:uid,email:uid===A?'a@example.test':'b@example.test'}});
  }
  if(u.pathname==='/auth/v1/logout')return reply(200,{});
  const uid=req.headers().authorization==='Bearer access-a'?A:req.headers().authorization==='Bearer access-b'?B:null;
  if(!uid)return reply(401,{message:'unauthorized'});
  if(u.pathname==='/rest/v1/haru_members')return reply(200,[{user_id:uid}]);
  if(u.pathname==='/rest/v1/haru_documents'){const d=documents.get(uid);return reply(200,d?[d]:[]);}
  if(u.pathname==='/rest/v1/rpc/haru_save_document'){
   writes++;if(failBefore){failBefore=false;return route.abort('failed');}
   const body=req.postDataJSON(),old=documents.get(uid),version=old?.version||0;
   if(body.p_expected_version!==version)return reply(400,{message:'HARU_CONFLICT',code:'P0001'});
   const doc={payload:canonical(body.p_payload),version:version+1,updated_at:new Date().toISOString()};documents.set(uid,doc);
   if(failAfter){failAfter=false;return route.abort('failed');}
   if(hold){const wait=hold;hold=null;await wait;}
   return reply(200,{version:doc.version,updated_at:doc.updated_at});
  }
  return reply(404,{message:'not found'});
 });return c;}
 const newPage=async(c)=>{const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(SITE);return p;};
 const login=async(p,email)=>{await p.locator('#cloud-login-form [name=email]').fill(email);await p.locator('#cloud-login-form [name=password]').fill('mock-password-not-a-real-credential');await p.locator('#cloud-login-form button').click();await p.locator('[data-life-overview]').waitFor();};
 const note=async(p,text)=>{await p.locator('.topbar [data-action=capture]').click();await p.locator('#modal [data-table=notes]').click();await p.locator('#entityForm [name=text]').fill(text);await p.locator('#entityForm button.primary').click();};
 const saved=async(p)=>p.locator('#cloud-status').filter({hasText:'서버 저장 완료'}).waitFor();
 const c1=await context(),p1=await newPage(c1);assert.equal(await p1.locator('[data-life-overview]').count(),0,'login gate must hide records');await login(p1,'a@example.test');await note(p1,'첫 번째 서버 기록');await saved(p1);assert.equal(documents.get(A).version,1);
 // A fresh browser has no local copy but sees the same server account.
 const c2=await context(),p2=await newPage(c2);await login(p2,'a@example.test');await p2.locator('#nav [data-page=notes]').click();assert.ok(await p2.getByText('첫 번째 서버 기록',{exact:true}).count());await p2.locator('#nav [data-page=home]').click();
 await note(p1,'다른 기기의 새 기록');await saved(p1);const remoteVersion=documents.get(A).version;
 await note(p2,'오래된 기기에서 쓴 기록');await p2.locator('#cloud-status').filter({hasText:'확인 필요'}).waitFor();assert.equal(documents.get(A).version,remoteVersion,'stale write must not overwrite');
 await p2.locator('#cloud-account').click();await p2.locator('[data-cloud=remote-confirm]').click();await p2.locator('[data-cloud=remote-apply]').click();await saved(p2);assert.ok((await p2.evaluate(()=>Object.keys(localStorage))).some(k=>k.includes(':recovery:')),'conflicting local copy retained');
 // Offline edits remain pending. A failed acknowledgement is reconciled against canonical JSONB.
 failAfter=true;await note(p1,'응답을 잃었지만 서버에 저장된 기록');await p1.locator('#cloud-status').filter({hasText:'미저장'}).waitFor();const calls=writes;await p1.locator('#cloud-account').click();await p1.locator('[data-cloud=retry]').click();await saved(p1);assert.equal(writes,calls,'successful write with lost response must not be duplicated');
 failBefore=true;await note(p1,'연결 끊김 중 작성한 기록');await p1.locator('#cloud-status').filter({hasText:'미저장'}).waitFor();await p1.reload();await saved(p1);assert.ok(documents.get(A).payload.notes.some(n=>n.text==='연결 끊김 중 작성한 기록'),'pending edit recovered after reload');
 // Saving one change must not erase typing in another form on the acknowledgement.
 let release;hold=new Promise(r=>release=r);await note(p1,'지연 응답 검증');await p1.locator('#weekNote [name=next]').fill('아직 저장하지 않은 입력');release();await saved(p1);assert.equal(await p1.locator('#weekNote [name=next]').inputValue(),'아직 저장하지 않은 입력');
 // A different account must not inherit another account's data or unsaved local state.
 const c3=await context(),p3=await newPage(c3);await login(p3,'b@example.test');await p3.locator('#nav [data-page=notes]').click();assert.equal(await p3.getByText('첫 번째 서버 기록',{exact:true}).count(),0);await p3.locator('#nav [data-page=home]').click();await note(p3,'B 계정 기록');await saved(p3);assert.equal(documents.get(B).payload.notes.length,1);assert.ok(documents.get(A).payload.notes.length>1);
 // Restoring login refreshes tokens, never stores passwords in browser persistence.
 await p3.reload();await p3.locator('[data-life-overview]').waitFor();const persisted=await p3.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}));assert.ok(!persisted.includes('mock-password-not-a-real-credential'));
 await p3.setViewportSize({width:390,height:844});assert.equal(await p3.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 // Existing local data is opt-in, and backup restore writes to the server path.
 const legacy=structuredClone(documents.get(A).payload);legacy.notes=[{id:'legacy-note',text:'기존 로컬 기록',date:'2026-11-01',role:''}];
 const c4=await context();await c4.addInitScript(state=>{if(!localStorage.getItem('legacy-seeded')){localStorage.setItem('haru-integrated-v1',JSON.stringify(state));localStorage.setItem('legacy-seeded','1')}},legacy);
 const p4=await newPage(c4);await login(p4,'a@example.test');assert.ok(!documents.get(A).payload.notes.some(n=>n.id==='legacy-note'),'must not auto-upload legacy');
 await p4.locator('#cloud-account').click();await p4.locator('[data-cloud=legacy]').click();await p4.locator('[data-cloud=legacy-apply]').click();await saved(p4);assert.equal(documents.get(A).payload.notes[0].text,'기존 로컬 기록');assert.equal(JSON.parse(await p4.evaluate(()=>localStorage.getItem('haru-integrated-v1'))).notes[0].id,'legacy-note');
 const restored=structuredClone(documents.get(A).payload);restored.notes.push({id:'restored-note',text:'백업에서 복원한 기록',date:'2026-11-01',role:''});
 await p4.locator('.topbar [data-action=backup]').click();await p4.locator('#restoreFile').setInputFiles({name:'restore.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(restored))});await p4.locator('#restoreForm button').click();await p4.locator('dialog [data-action=restore-confirm]').waitFor();await p4.locator('dialog [data-action=restore-confirm]').click();await saved(p4);assert.ok(documents.get(A).payload.notes.some(n=>n.id==='restored-note'),'restore must use server commit');
 await p4.locator('#cloud-account').click();await p4.locator('[data-cloud=logout]').click();await p4.locator('#cloud-login-form').waitFor();assert.equal(await p4.getByText('백업에서 복원한 기록',{exact:true}).count(),0);await login(p4,'b@example.test');await p4.locator('#nav [data-page=notes]').click();assert.equal(await p4.getByText('기존 로컬 기록',{exact:true}).count(),0,'legacy data must not appear in a different account');
 // Demonstration remains separate and never invokes account storage.
 const before=writes;await p3.goto(SITE+'/?demo=1');await p3.locator('[data-life-overview]').waitFor();await note(p3,'데모 전용');assert.equal(writes,before);
 assert.deepEqual(errors,[]);console.log('PASS: login gate, two-browser persistence, account isolation, version conflicts, offline recovery, lost acknowledgement, typing preservation, session restore, explicit legacy migration, server backup restore, logout isolation, demo isolation, mobile.');
 await browser.close();
})().catch(e=>{console.error(e.message);process.exit(1)});
