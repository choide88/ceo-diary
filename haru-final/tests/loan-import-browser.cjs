const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const SITE=process.env.HARU_TEST_URL||'http://127.0.0.1:8021';
const CLOUD='https://syyfpdcylvumvyrlgezc.supabase.co';
const GOOGLE='https://www.googleapis.com/calendar/v3/';
const CLIENT='123456789-haru-test.apps.googleusercontent.com';
const scopes=['https://www.googleapis.com/auth/calendar.events.readonly','https://www.googleapis.com/auth/calendar.calendarlist.readonly'];
const calendarA='primary@example.test',calendarB='team+work@example.test';
(async()=>{
 setTimeout(()=>{console.error('test overall timeout');process.exit(1)},90000).unref();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1050}}),p=await context.newPage();
 await p.clock.install({time:new Date('2026-11-04T03:00:00Z')});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const documents=new Map(),requests=[];let partial=false;
 const headers={'access-control-allow-origin':'*','access-control-allow-headers':'apikey,authorization,content-type','access-control-allow-methods':'GET,POST,OPTIONS'};
 await context.route(CLOUD+'/**',async route=>{
  const req=route.request(),u=new URL(req.url());const reply=(status,data)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(data)});
  if(req.method()==='OPTIONS')return reply(200,{});
  if(u.pathname==='/auth/v1/token'){
   const body=req.postDataJSON(),account=body.email?.startsWith('b')?'B':'A';
   return reply(200,{access_token:'cloud-'+account,refresh_token:'cloud-refresh-'+account,expires_in:3600,user:{id:account,email:account+'@example.test'}});
  }
  if(u.pathname==='/auth/v1/logout')return reply(200,{});
  const account=req.headers().authorization==='Bearer cloud-B'?'B':'A';
  if(u.pathname==='/rest/v1/haru_members')return reply(200,[{user_id:account}]);
  if(u.pathname==='/rest/v1/haru_documents')return reply(200,documents.has(account)?[documents.get(account)]:[]);
  if(u.pathname==='/rest/v1/rpc/haru_save_document'){
   const body=req.postDataJSON(),version=documents.get(account)?.version||0;
   if(body.p_expected_version!==version)return reply(400,{message:'HARU_CONFLICT'});
   const document={payload:body.p_payload,version:version+1,updated_at:new Date().toISOString()};documents.set(account,document);return reply(200,{version:document.version,updated_at:document.updated_at});
  }
  return reply(404,{});
 });
 await context.route('https://accounts.google.com/gsi/client',route=>route.fulfill({contentType:'application/javascript',body:`
 window.google={accounts:{oauth2:{initTokenClient(config){window.lastGoogleConfig=config;return {requestAccessToken(){
 if(window.googleTestMode==='closed'){config.error_callback({type:'popup_closed'});return;}
 if(window.googleTestMode==='deferred'){window.googleDeferredCallback=()=>config.callback({access_token:'google-mock-token',expires_in:3600,scope:config.scope});return;}
 setTimeout(()=>config.callback({access_token:'google-mock-token',expires_in:window.googleTestMode==='expire'?1:3600,scope:window.googleTestMode==='tasks-deny'?config.scope.split(' ').filter(s=>!s.includes('/auth/tasks')).join(' '):window.googleTestMode==='partial'?'https://www.googleapis.com/auth/calendar.events.readonly':config.scope}),0);
 }};},revoke(token,callback){window.googleRevoked=true;callback({});}}}};
 `}));

 const writeCalls=[],eventStore=new Map(),taskStore=new Map();let conflict=false,writeFailure=0;
 const cal='primary@example.test';
 for(let i=0;i<8;i++)eventStore.set('job'+i,{id:'job'+i,etag:'"e'+i+'"',summary:'[알바] 기관 '+i+' (40)',description:'원본 설명',attendees:[{email:'preserved@example.test'}],start:{dateTime:'2026-11-04T09:00:00+09:00'},end:{dateTime:'2026-11-04T10:00:00+09:00'}});
 eventStore.set('repeat',{id:'repeat',etag:'"repeat"',summary:'반복 회의',recurringEventId:'master',originalStartTime:{dateTime:'2026-11-04T13:00:00+09:00'},start:{dateTime:'2026-11-04T13:00:00+09:00'},end:{dateTime:'2026-11-04T14:00:00+09:00'}});
 taskStore.set('t1',{id:'t1',etag:'"t1"',title:'기존 업무',status:'needsAction',notes:'원본 설명',due:'2026-11-04T00:00:00Z'});
 const reply=(route,status,data)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(data)});
 await context.route(GOOGLE+'**',async route=>{const r=route.request(),u=new URL(r.url()),method=r.method();if(method==='OPTIONS')return reply(route,200,{});if(u.pathname.endsWith('/users/me/calendarList'))return reply(route,200,{items:[{id:cal,summary:'KRP',primary:true,accessRole:'owner'},{id:'read',summary:'공유 읽기',accessRole:'reader'}]});const id=decodeURIComponent(u.pathname.split('/events/')[1]||'');if(method!=='GET'){writeCalls.push({kind:'event',method,id,params:Object.fromEntries(u.searchParams),body:r.postDataJSON(),headers:r.headers()});if(conflict)return reply(route,412,{});if(method==='DELETE'){assert.equal(r.headers()['if-match'],eventStore.get(id).etag);eventStore.delete(id);return route.fulfill({status:204,headers});}if(method==='POST'){const body=r.postDataJSON(),key='new'+writeCalls.length;eventStore.set(key,{...body,id:key,etag:'"new"'});return reply(route,200,eventStore.get(key));}if(method==='PATCH'){const original=eventStore.get(id);assert.equal(r.headers()['if-match'],original.etag);eventStore.set(id,{...original,...r.postDataJSON(),etag:'"changed"'});return reply(route,200,eventStore.get(id));}}if(id)return reply(route,eventStore.has(id)?200:404,eventStore.get(id)||{});if(u.pathname.includes('/calendars/read/'))return reply(route,200,{items:[]});return reply(route,200,{items:[...eventStore.values()]});});
 await context.route('https://tasks.googleapis.com/tasks/v1/**',async route=>{const r=route.request(),u=new URL(r.url()),method=r.method();if(method==='OPTIONS')return reply(route,200,{});if(u.pathname.endsWith('/users/@me/lists'))return reply(route,200,{items:[{id:'krp',title:'KRP'},{id:'cde',title:'CDE'}]});const id=decodeURIComponent(u.pathname.match(/\/lists\/[^/]+\/tasks\/([^/]+)$/)?.[1]||'');if(method!=='GET'){writeCalls.push({kind:'task',method,id,body:r.postDataJSON(),headers:r.headers()});if(writeFailure)return reply(route,writeFailure,{});if(method==='DELETE'){assert.equal(r.headers()['if-match'],taskStore.get(id).etag);taskStore.delete(id);return route.fulfill({status:204,headers});}if(method==='POST'){const body=r.postDataJSON(),key='nt'+writeCalls.length;taskStore.set(key,{...body,id:key,etag:'"nt"'});return reply(route,200,taskStore.get(key));}const original=taskStore.get(id);assert.equal(r.headers()['if-match'],original.etag);taskStore.set(id,{...original,...r.postDataJSON(),etag:'"tchanged"'});return reply(route,200,taskStore.get(id));}if(id)return reply(route,200,taskStore.get(id));return reply(route,200,{items:u.pathname.includes('/lists/krp/')?[...taskStore.values()]:[]});});


 const privatePath=process.env.HARU_PRIVATE_LOAN_FILE;
 const payload=privatePath?JSON.parse(require('node:fs').readFileSync(privatePath,'utf8')):{format:'secret-loans-v1',loans:[{name:'신용대출 A',lender:'예시은행 A',original:'10000000',balance:'9000000',asof:'2026-11-02',rate:'5',method:'만기일시',paymentDay:'11',maturity:'2027-10-08',importKey:'sample-a'},{name:'분할대출 B',lender:'예시은행 B',original:'2000000',balance:'',asof:'',rate:'7',method:'원리금균등',paymentDay:'30',reportedRepaid:'100000',importKey:'sample-b'}]};
 const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url'),url=SITE.replace(/#.*$/,'')+'#loan-import='+encoded;
 const saved=()=>p.locator('#cloud-status').filter({hasText:'서버 저장 완료'}).waitFor();
 await p.goto(url);await p.locator('#cloud-login-form').waitFor();assert(!p.url().includes('loan-import='));assert.equal(await p.locator('#loan-import-form').count(),0);await p.locator('#cloud-login-form [name=email]').fill('a@example.test');await p.locator('#cloud-login-form [name=password]').fill('mock-password');await p.locator('#cloud-login-form button').click();await p.locator('#loan-import-form').waitFor();assert.equal(await p.locator('.loan-review-row').count(),payload.loans.length);assert.equal(documents.get('A')?.payload?.loans?.length||0,0);await p.locator('[data-action=loan-import-cancel]').click();assert.equal(documents.get('A')?.payload?.loans?.length||0,0);
 await p.goto(url);await p.locator('#loan-import-form').waitFor();await p.locator('#loan-import-form button.primary').click();await saved();assert.equal(documents.get('A').payload.loans.length,payload.loans.length);const known=payload.loans.filter(l=>l.balance!==''&&l.balance!==undefined),unknown=payload.loans.length-known.length;await p.locator('.loan-summary').filter({hasText:'잔액 미확인 '+unknown+'건'}).waitFor();assert.equal(documents.get('A').payload.loans.filter(l=>l.balance==='').length,unknown);assert.equal(documents.get('A').payload.loans.filter(l=>l.monthly==='').length,payload.loans.length);assert.equal(documents.get('A').payload.loans.some(l=>Object.keys(l).some(k=>/account/i.test(k))),false);assert.deepEqual(documents.get('A').payload.loans.map(l=>l.rate),payload.loans.map(l=>l.rate));assert.equal(writeCalls.length,0);
 await p.locator('#loan-import-file').setInputFiles({name:'loans.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});await p.locator('#loan-import-form').waitFor();await p.locator('#loan-import-form button.primary').click();await saved();assert.equal(documents.get('A').payload.loans.length,payload.loans.length);await p.reload();await p.locator('.loan-summary').waitFor();assert.equal(await p.locator('#loan-import-form').count(),0);await p.locator('#nav [data-page=home]').click();assert.equal(await p.locator('.hero').count(),0);assert.equal(await p.locator('[data-method-note=home]').count(),0);assert.equal(await p.locator('[data-dashboard=home] .overview-tile').count(),4);await p.setViewportSize({width:390,height:844});await p.locator('#nav [data-page=money]').click();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);await browser.close();console.log('PASS: private fragment removed before login, account-gated review, cancel/no implicit save, known/unknown balances and monthly amounts, rate preservation, no account numbers, dedup on repeated import, reload, compact home and mobile.');
})().catch(e=>{console.error(e);process.exit(1)});
