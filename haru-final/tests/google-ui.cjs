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
 await context.route('https://accounts.google.com/gsi/client',route=>route.fulfill({contentType:'application/javascript',body:`
 window.google={accounts:{oauth2:{initTokenClient(config){window.lastGoogleConfig=config;return {requestAccessToken(){
 if(window.googleTestMode==='closed'){config.error_callback({type:'popup_closed'});return;}
 if(window.googleTestMode==='deferred'){window.googleDeferredCallback=()=>config.callback({access_token:'google-mock-token',expires_in:3600,scope:config.scope});return;}
 setTimeout(()=>config.callback({access_token:'google-mock-token',expires_in:window.googleTestMode==='expire'?1:3600,scope:window.googleTestMode==='tasks-deny'?config.scope.split(' ').filter(s=>!s.includes('/auth/tasks')).join(' '):window.googleTestMode==='partial'?'https://www.googleapis.com/auth/calendar.events.readonly':config.scope}),0);
 }};},revoke(token,callback){window.googleRevoked=true;callback({});}}}};
 `}));
 await context.route(GOOGLE+'**',async route=>{
  const req=route.request(),u=new URL(req.url());const reply=(status,data)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(data)});
  if(req.method()==='OPTIONS')return reply(200,{});
  requests.push({path:u.pathname,params:Object.fromEntries(u.searchParams),method:req.method()});
  assert.equal(req.headers().authorization,'Bearer google-mock-token');
  if(u.pathname.endsWith('/users/me/calendarList'))return u.searchParams.get('pageToken')?reply(200,{items:[{id:calendarB,summary:'워크스워크',accessRole:'reader'},{id:'freebusy',summary:'일정 상세 없음',accessRole:'freeBusyReader'}]}):reply(200,{items:[{id:calendarA,summary:'투자 회사',primary:true,accessRole:'owner'}],nextPageToken:'cal-page-2'});
  const cal=decodeURIComponent(u.pathname.split('/calendars/')[1]?.split('/events')[0]||'');
  if(cal===calendarB)return partial?reply(403,{error:{message:'forbidden'}}):reply(200,{items:[{id:'duplicate-invite',iCalUID:'same-meeting@example.test',summary:'중복 초대 일정',start:{dateTime:'2026-11-03T10:00:00+09:00'},end:{dateTime:'2026-11-03T11:00:00+09:00'}},{id:'work',summary:'팀 작업',start:{dateTime:'2026-11-04T09:00:00+09:00'},end:{dateTime:'2026-11-04T10:00:00+09:00'}}]});
  if(cal===calendarA){
   if(u.searchParams.get('pageToken'))return reply(200,{items:[{id:'all',summary:'종일 일정',start:{date:'2026-11-02'},end:{date:'2026-11-03'}},{id:'cancelled',summary:'취소된 일정',status:'cancelled',start:{dateTime:'2026-11-04T09:00:00+09:00'},end:{dateTime:'2026-11-04T10:00:00+09:00'}}]});
   return reply(200,{items:[{id:'past',iCalUID:'same-meeting@example.test',summary:'투자 검토',start:{dateTime:'2026-11-03T10:00:00+09:00'},end:{dateTime:'2026-11-03T11:00:00+09:00'}},{id:'future',summary:'미래 미팅',start:{dateTime:'2026-11-05T10:00:00+09:00'},end:{dateTime:'2026-11-05T11:00:00+09:00'}},{id:'html',summary:'<img src=x onerror="window.injected=true">',location:'<svg onload="window.injected=true">',start:{dateTime:'2026-11-04T00:00:00Z'},end:{dateTime:'2026-11-04T01:00:00Z'}},{id:'overnight',summary:'밤샘 준비',start:{dateTime:'2026-11-02T23:30:00+09:00'},end:{dateTime:'2026-11-03T00:30:00+09:00'}},{id:'recurring_20261103',summary:'반복 일정',originalStartTime:{dateTime:'2026-11-03T13:00:00+09:00'},start:{dateTime:'2026-11-03T13:00:00+09:00'},end:{dateTime:'2026-11-03T13:30:00+09:00'}}],nextPageToken:'events-page-2'});
  }
  return reply(404,{});
 });
 let googleDone=false,taskFailure=false;const taskCalls=[];
 await context.route('https://tasks.googleapis.com/tasks/v1/**',async route=>{
  const req=route.request(),u=new URL(req.url());const reply=(status,data)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(data)});if(req.method()==='OPTIONS')return reply(200,{});taskCalls.push({method:req.method(),url:u.href});assert.equal(req.headers().authorization,'Bearer google-mock-token');
  if(u.pathname.endsWith('/users/@me/lists'))return reply(200,u.searchParams.has('pageToken')?{items:[{id:'jobs',title:'알바'}]}:{items:[{id:'work',title:'본업'}],nextPageToken:'more-lists'});
  if(u.pathname.includes('/lists/work/tasks')){
   const completed=u.searchParams.get('showCompleted')==='true';if(u.searchParams.has('pageToken'))return reply(200,completed?{items:[{id:'old-done',title:'이미 끝낸 일',status:'completed',completed:'2026-11-02T10:00:00Z'}]}:{});
   return reply(200,{items:[...(!googleDone||completed?[{id:'work-task',title:'투자 검토 자료 준비',notes:'상세 설명',due:'2026-11-04T00:00:00.000Z',status:googleDone?'completed':'needsAction'}]:[]),{id:'deleted-task',title:'삭제된 일',deleted:true}],nextPageToken:'more-tasks'});
  }
  if(u.pathname.includes('/lists/jobs/tasks'))return taskFailure?reply(403,{}):reply(200,{items:[{id:'job-task',title:'카페 알바 준비',status:'needsAction',notes:'근무 전 준비'}]});
  return reply(404,{});
 });
 const saved=()=>p.locator('#cloud-status').filter({hasText:'서버 저장 완료'}).waitFor();

 await p.goto(SITE);await p.locator('#cloud-login-form [name=email]').fill('a@example.test');await p.locator('#cloud-login-form [name=password]').fill('mock-password');await p.locator('#cloud-login-form button').click();await p.locator('[data-life-overview]').waitFor();await p.locator('.google-calendar [data-gcal=settings]').first().click();await p.locator('#calendar-settings-form [name=clientId]').fill(CLIENT);await p.locator('#calendar-settings-form [name=enableTasks]').check();await p.locator('#calendar-settings-form button.primary').click();await saved();await p.waitForFunction(()=>!!window.google?.accounts?.oauth2);await p.getByRole('button',{name:'Google Calendar 연결',exact:true}).click();await p.getByText('투자 검토 자료 준비',{exact:true}).waitFor();assert(await p.locator('.google-home-item').count()<=4);
 const task=p.locator('.google-home-item').filter({hasText:'투자 검토 자료 준비'});await task.locator('[data-gcal=hide]').click();await saved();assert.equal(await p.locator('.google-home-item').filter({hasText:'투자 검토 자료 준비'}).count(),0);assert.equal(documents.get('A').payload.tasks.length,0);let pref=JSON.parse(documents.get('A').payload.profile.googleCalendar);assert.equal(pref.hiddenItems.length,1);
 await p.reload();await p.locator('.google-calendar').getByText('읽기 전용 연결',{exact:true}).waitFor();assert.equal(await p.locator('.google-home-item').filter({hasText:'투자 검토 자료 준비'}).count(),0);await p.locator('#nav [data-page=calendar]').click();await p.locator('.visual-week').waitFor();await p.locator('.calendar-hidden>summary').click();await p.locator('[data-gcal=unhide]').click();await saved();await p.locator('.google-task').filter({hasText:'투자 검토 자료 준비'}).waitFor();assert(requests.every(r=>r.method==='GET'));assert(taskCalls.every(r=>r.method==='GET'));
 const event=p.locator('.visual-time-event').filter({hasText:'투자 검토'});await event.click();await p.locator('#calendar-dialog .calendar-event-info b').filter({hasText:'투자 검토'}).waitFor();await p.locator('#calendar-dialog [data-gcal=import]').click();await p.locator('#calendar-import-form button.primary').click();await saved();assert.equal(documents.get('A').payload.timeLogs.length,1);await p.locator('[data-gcal=visual-view][data-view=month]').click();await p.locator('.visual-month').waitFor();await p.screenshot({path:'/tmp/haru-calendar-upgraded.png',fullPage:true});await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 // Hide an event from presentation only: keep planned source data for analysis.
 await p.locator('.calendar-review-list>summary').click();const ev=p.locator('.calendar-review-list .calendar-event').filter({hasText:'미래 미팅'});await ev.locator('[data-gcal=hide]').click();await saved();assert((await p.evaluate(()=>HaruCalendar.snapshot().events)).some(e=>e.title==='미래 미팅'));assert.equal(await p.locator('.visual-month .calendar-visual-event').filter({hasText:'미래 미팅'}).count(),0);
 // Mock the configured server's token endpoint to prove restore/expiry paths without a real refresh token in the client.
 let renewals=0;await context.route(CLOUD+'/functions/v1/google-connect',async route=>{const data=route.request().postDataJSON();renewals++;assert.equal(data.action,'token');return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify({access_token:'google-mock-token',expires_in:3600,tasksAllowed:true})});});
 const doc=documents.get('A');pref=JSON.parse(doc.payload.profile.googleCalendar);pref.persistent=true;doc.payload.profile.googleCalendar=JSON.stringify(pref);await p.evaluate(()=>{for(const k of Object.keys(sessionStorage))if(k.startsWith('haru-google-session:'))sessionStorage.removeItem(k)});await p.reload();await p.locator('.visual-month,.visual-week').first().waitFor();assert.equal(renewals,1);assert(!JSON.stringify(documents.get('A')).includes('google-mock-token'));await p.clock.runFor(3601000);await p.waitForFunction(()=>document.querySelector('.google-calendar .tone')?.textContent.includes('읽기 전용')).catch(async()=>{const state=await p.evaluate(()=>({connected:HaruCalendar.snapshot().connected,status:HaruCalendar.snapshot().status,tones:[...document.querySelectorAll('.google-calendar .tone')].map(e=>e.textContent),cloud:document.querySelector('#cloud-status')?.textContent,notices:[...document.querySelectorAll('.calendar-message')].map(e=>e.textContent)}));throw Error(JSON.stringify({renewals,state,errors}));});assert(renewals>=2);await p.locator('#cloud-account').click();await p.locator('[data-cloud=logout]').click();await p.locator('#cloud-login-form').waitFor();assert(!await p.evaluate(()=>JSON.stringify({...sessionStorage}).includes('google-mock-token')));assert.deepEqual(errors,[]);await browser.close();console.log('PASS: compact home, hide/restore across reload, read-only sources, visual week/month and import, hidden source retained in stats, mobile, server restore/renew, logout token cleanup.');
})().catch(e=>{console.error(e);process.exit(1)});
