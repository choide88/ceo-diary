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
   return reply(200,{items:[...(!googleDone||completed?[{id:'work-task',title:'투자 검토 자료 준비',notes:'상세 설명',due:'2026-11-05T00:00:00.000Z',status:googleDone?'completed':'needsAction'}]:[]),{id:'deleted-task',title:'삭제된 일',deleted:true}],nextPageToken:'more-tasks'});
  }
  if(u.pathname.includes('/lists/jobs/tasks'))return taskFailure?reply(403,{}):reply(200,{items:[{id:'job-task',title:'카페 알바 준비',status:'needsAction',notes:'근무 전 준비'}]});
  return reply(404,{});
 });
 const saved=()=>p.locator('#cloud-status').filter({hasText:'서버 저장 완료'}).waitFor();

 await p.goto(SITE);await p.locator('#cloud-login-form [name=email]').fill('a@example.test');await p.locator('#cloud-login-form [name=password]').fill('mock-password');await p.locator('#cloud-login-form button').click();await p.locator('#quickForm').waitFor();await p.locator('[data-page=goals]').first().click();await p.getByRole('button',{name:'＋ 목표·버킷',exact:true}).click();await p.locator('#entityForm [name=title]').fill('올해 투자 목표');await p.locator('#entityForm [name=role]').selectOption('invest');await p.locator('#entityForm button.primary').click();await saved();const goal=documents.get('A').payload.goals[0];await p.locator('[data-page=home]').first().click();await p.locator('.google-calendar [data-gcal=settings]').first().click();await p.locator('#calendar-settings-form [name=clientId]').fill(CLIENT);await p.locator('#calendar-settings-form [name=enableTasks]').check();await p.locator('#calendar-settings-form button.primary').click();await saved();await p.waitForFunction(()=>!!window.google?.accounts?.oauth2);await p.getByRole('button',{name:'Google Calendar 연결',exact:true}).click();await p.locator('[data-life-overview]').getByText('예정 4시간 30분',{exact:true}).waitFor();await p.locator('[data-life-overview]').getByText('1 / 2',{exact:true}).waitFor();assert.equal(documents.get('A').payload.tasks.length,0);assert.equal(documents.get('A').payload.timeLogs.length,0);
 await p.locator('#quickForm [name=text]').fill('작성 중 글 유지');await p.locator('.google-calendar [data-gcal=refresh]').click();await p.locator('[data-life-overview]').getByText('예정 4시간 30분',{exact:true}).waitFor();assert.equal(await p.locator('#quickForm [name=text]').inputValue(),'작성 중 글 유지');await p.locator('[data-gcal=task-lists]').click();await p.locator('#google-task-lists-form [name=goal-0]').selectOption(goal.id);await p.locator('#google-task-lists-form button.primary').click();await saved();await p.locator('[data-life-overview]').getByText('1 / 2',{exact:true}).first().waitFor();await p.locator(`[data-goal-card="${goal.id}"]`).getByText('1/2 단계',{exact:true}).waitFor();await p.locator('[data-home-work] [data-action=review-google-task]').first().click();assert.equal(await p.locator('#google-task-review-form [name=goal]').inputValue(),goal.id);await p.locator('#google-task-review-form [name=title]').fill('수정한 투자 업무');await p.locator('#google-task-review-form button.primary').click();await saved();assert.equal(documents.get('A').payload.tasks[0].goal,goal.id);assert.equal(documents.get('A').payload.tasks[0].role,'invest');assert.equal(documents.get('A').payload.tasks.length,1);await p.locator('[data-life-overview]').getByText('1 / 2',{exact:true}).first().waitFor();
 await p.locator('.google-calendar [data-gcal=settings]').first().click();await p.locator('#calendar-settings-form [name=goal-0]').selectOption(goal.id);await p.locator('#calendar-settings-form button.primary').click();await saved();await p.locator(`[data-goal-card="${goal.id}"]`).getByText(/이번 주 예정 4시간 30분/).waitFor();await p.locator('[data-home-time] [data-gcal=dashboard-event]').first().click();assert.equal(await p.locator('#calendar-import-form [name=goal]').inputValue(),goal.id);await p.locator('#calendar-import-form [name=minutes]').fill('40');await p.locator('#calendar-import-form button.primary').click();await saved();assert.equal(documents.get('A').payload.timeLogs[0].goal,goal.id);await p.locator('[data-life-overview]').getByText(/확인한 실제 40분/).waitFor();await p.locator(`[data-goal-card="${goal.id}"]`).getByText(/실제 40분/).waitFor();
 await p.locator('[data-page=calendar]').first().click();await p.locator('.visual-time-event').filter({hasText:'미래 미팅'}).click();await p.locator('#calendar-dialog [data-gcal=event-links]').click();await p.locator('#calendar-links-form [name=goal]').selectOption('');await p.locator('#calendar-links-form button.primary').click();await saved();assert((await p.evaluate(()=>HaruCalendar.dashboardSnapshot().events)).find(e=>e.title==='미래 미팅').goal==='');assert.equal(documents.get('A').payload.timeLogs.length,1);await p.locator('[data-gcal=range][data-range=previous-month]').click();await p.waitForFunction(()=>HaruCalendar.snapshot().start==='2026-10-01');await p.waitForFunction(()=>HaruCalendar.dashboardSnapshot().available);assert((await p.evaluate(()=>HaruCalendar.dashboardSnapshot().events)).some(e=>e.title==='투자 검토'));await p.locator('[data-page=home]').first().click();await p.locator('[data-life-overview]').getByText('예정 4시간 30분',{exact:true}).waitFor();await p.reload();await p.locator('[data-life-overview]').getByText(/확인한 실제 40분/).waitFor();await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await p.screenshot({path:'/tmp/life-overview-final.png',fullPage:true});await browser.close();console.log('PASS: automatic overview/work/goal/time, no implicit saves, exact role/default goal mappings, editable imports/dedup, future per-event opt-out, independent weekly data, reload, typing and mobile.');
})().catch(e=>{console.error(e);process.exit(1)});
