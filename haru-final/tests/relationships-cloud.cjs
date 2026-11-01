const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const SITE=process.env.HARU_TEST_URL||'http://127.0.0.1:8021';
const CLOUD='https://syyfpdcylvumvyrlgezc.supabase.co';
const GOOGLE='https://www.googleapis.com/calendar/v3/';
const CLIENT='123456789-haru-test.apps.googleusercontent.com';
const scopes=['https://www.googleapis.com/auth/calendar.events.readonly','https://www.googleapis.com/auth/calendar.calendarlist.readonly'];
const calendarA='primary@example.test',calendarB='team+work@example.test';
(async()=>{
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

 await p.goto(SITE);await p.locator('#cloud-login-form [name=email]').fill('a@example.test');await p.locator('#cloud-login-form [name=password]').fill('mock-password');await p.locator('#cloud-login-form button').click();await p.locator('#quickForm').waitFor();await p.locator('[data-page=relations]').first().click();await p.getByRole('button',{name:'＋ 사람 추가',exact:true}).click();await p.getByLabel('이름·별칭').fill('서버 관계');await p.locator('#relationPersonForm button.primary').click();await p.locator('#cloud-status').filter({hasText:'서버 저장 완료'}).waitFor();assert.equal(documents.get('A').payload.people[0].name,'서버 관계');const key=documents.get('A').payload.people[0].id;await p.locator(`[data-action=relation-contact][data-id="${key}"]`).click();await p.locator('#relationActionForm button.primary').click();await p.locator('#cloud-status').filter({hasText:'서버 저장 완료'}).waitFor();assert.equal(documents.get('A').payload.moments[0].kind,'contact');await p.reload();await p.locator('[data-page=relations]').first().waitFor();await p.locator('[data-page=relations]').first().click();assert((await p.locator('#app').innerText()).includes('2026-11-04'));assert.deepEqual(errors,[]);await browser.close();console.log('PASS: relationship person/contact payload accepted, server save and reload.');
})().catch(e=>{console.error(e);process.exit(1)});
