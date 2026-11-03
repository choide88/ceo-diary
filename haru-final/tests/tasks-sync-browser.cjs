const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const SITE=process.env.HARU_TEST_URL||'http://127.0.0.1:8021';
const CLOUD='https://syyfpdcylvumvyrlgezc.supabase.co';
const GOOGLE='https://www.googleapis.com/calendar/v3/';
const CLIENT='123456789-haru-test.apps.googleusercontent.com';
const scopes=['https://www.googleapis.com/auth/calendar.events.readonly','https://www.googleapis.com/auth/calendar.calendarlist.readonly'];
const calendarA='primary@example.test',calendarB='team+work@example.test';
(async()=>{setTimeout(()=>{console.error("overall timeout");process.exit(1)},150000).unref();
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

 const lists=[{id:'cde',title:'CDE'},{id:'krp',title:'KRP'},{id:'wsw',title:'WSW'},{id:'pwr',title:'PWR'},{id:'memo',title:'메모'},{id:'default',title:'기본 목록'}];
 const store={cde:[{id:'personal',title:'개인 일',due:'2026-11-04T00:00:00Z',status:'needsAction',etag:'v1'}],krp:[{id:'linked',title:'최신 회사 업무',due:'2026-11-04T00:00:00Z',status:'needsAction',etag:'v1'},{id:'late',title:'지난 미완료',due:'2026-10-25T00:00:00Z',status:'needsAction',etag:'v1'}],wsw:[],pwr:[],memo:[],default:[{id:'unknown',title:'미분류 일',due:'2026-11-04T00:00:00Z',status:'needsAction',etag:'v1'}]};let writes=[],fail=0,nextId=0;
 await context.route('https://tasks.googleapis.com/tasks/v1/**',async route=>{const req=route.request(),u=new URL(req.url()),parts=u.pathname.split('/');const reply=(status,data)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(data)});if(req.method()==='OPTIONS')return reply(200,{});if(u.pathname.endsWith('/users/@me/lists'))return reply(200,{items:lists});const list=decodeURIComponent(parts[parts.indexOf('lists')+1]),ix=parts.indexOf('tasks',4),id=ix>=0?decodeURIComponent(parts[ix+1]||''):'';const row=(store[list]||[]).find(t=>t.id===id);if(req.method()==='GET')return reply(200,id?row:{items:store[list]||[]});writes.push({method:req.method(),path:u.pathname,params:Object.fromEntries(u.searchParams),body:req.postData()?req.postDataJSON():null});if(fail)return reply(fail,{});if(req.method()==='POST'&&u.pathname.endsWith('/move')){assert(row);assert.equal(req.headers()['if-match'],row.etag);const dest=u.searchParams.get('destinationTasklist');store[list]=store[list].filter(t=>t!==row);store[dest].push(row);return reply(200,row);}if(req.method()==='POST'){const r={...req.postDataJSON(),id:'new-'+ ++nextId,etag:'v1'};store[list].push(r);return reply(200,r);}if(req.method()==='PATCH'){assert(row);assert.equal(req.headers()['if-match'],row.etag);Object.assign(row,req.postDataJSON(),{etag:'v'+Date.now()});return reply(200,row);}if(req.method()==='DELETE'){assert(row);store[list]=store[list].filter(t=>t!==row);return reply(204,{});}return reply(404,{});});
 await p.goto(SITE);await p.locator('#cloud-login-form [name=email]').fill('a@example.test');await p.locator('#cloud-login-form [name=password]').fill('mock-password');await p.locator('#cloud-login-form button').click();await p.locator('#day-start-form').waitFor();
 await p.evaluate(({CLIENT,ids})=>{commit(n=>{n.profile.googleCalendar=JSON.stringify({clientId:CLIENT,enableTasks:true,enableWrite:true,taskListIds:ids,taskItemRoles:{'["krp","linked"]':'works'},taskItemGroups:{'["krp","linked"]':'other'}});n.tasks.push({id:'legacy',title:'오래된 제목',role:'',goal:'',date:'',done:true,googleTaskKey:'["krp","linked"]',googleTaskId:'linked',googleTaskListId:'krp'});n.incomes.push({id:'past-income',title:'과거 수입',amount:'300',date:'2026-10-25',role:'invest',done:true,googleIncomeKey:'task:[\"krp\",\"linked\"]'});n.timeLogs.push({id:'history',title:'과거 업무',role:'invest',date:'2026-10-25',minutes:'10',note:''});});sessionStorage.setItem('haru-google-session:syyfpdcylvumvyrlgezc.supabase.co',JSON.stringify({owner:'A',clientId:CLIENT,token:'google-mock-token',expires:Date.now()+3600000,tasksAllowed:true,scopes:['https://www.googleapis.com/auth/calendar.events','https://www.googleapis.com/auth/calendar.calendarlist.readonly','https://www.googleapis.com/auth/tasks']}));},{CLIENT,ids:lists.map(l=>l.id)});await saved();await p.reload();await p.waitForFunction(()=>HaruCalendar.dashboardSnapshot().tasksAvailable);await p.locator('[data-page=work]').first().click();const company=name=>p.locator('.work-company-grid>.card').filter({has:p.getByRole('heading',{name,exact:true})});await company('크립톤').getByText('최신 회사 업무',{exact:true}).waitFor();assert.equal(await company('워크스워크').getByText('최신 회사 업무',{exact:true}).count(),0);assert.equal(documents.get('A').payload.tasks[0].title,'오래된 제목');
 // A new work task chooses the actual WSW destination and writes exactly once.
 await company('워크스워크').getByRole('button',{name:'＋ 할 일',exact:true}).click();await p.locator('#google-original-form').waitFor();assert.equal(await p.locator('#google-original-form [name=destination]').inputValue(),'wsw');await p.locator('#google-original-form [name=title]').fill('새 워크스워크 업무');await p.locator('#google-original-form [name=due]').fill('2026-11-04');await p.locator('#google-original-form button.primary').click();await p.locator('#calendar-dialog').waitFor({state:'hidden'});await company('워크스워크').getByText('새 워크스워크 업무',{exact:true}).waitFor();assert.equal(nextId,1);
 await p.locator('[data-page=calendar]').first().click();await p.locator('[data-action=calendar-tab][data-tab=tasks]').click();const card=title=>p.locator('.google-task').filter({has:p.getByRole('heading',{name:title,exact:true})});assert.equal(await card('미분류 일').locator('[data-task-group-key]').inputValue(),'other');await p.locator('.task-overdue>summary').click();await card('지난 미완료').waitFor();
 // Company reassignment uses native Tasks move, preserving the linked identity.
 await card('최신 회사 업무').locator('[data-task-company-key]').selectOption('works');await p.waitForFunction(()=>HaruCalendar.dashboardSnapshot().tasks.find(t=>t.id==='linked')?.role==='works');await saved();assert.equal(store.krp.some(t=>t.id==='linked'),false);assert(store.wsw.some(t=>t.id==='linked'));assert.equal(documents.get('A').payload.tasks[0].googleTaskListId,'wsw');assert(writes.some(w=>w.params.destinationTasklist==='wsw'));assert.equal(nextId,1);
 // Edit title/due and move to PWR via same original editor.
 await card('최신 회사 업무').locator('[data-gcal=edit-task]').click();await p.locator('#google-original-form [name=title]').fill('PWR로 옮긴 업무');await p.locator('#google-original-form [name=destination]').selectOption('pwr');await p.locator('#google-original-form [name=due]').fill('2026-11-05');await p.locator('#google-original-form button.primary').click();await p.locator('#calendar-dialog').waitFor({state:'hidden'});await card('PWR로 옮긴 업무').waitFor();await p.locator('[data-page=work]').first().click();await company('PWR').getByText('PWR로 옮긴 업무',{exact:true}).waitFor();
 await p.locator('[data-page=calendar]').first().click();await p.locator('[data-action=calendar-tab][data-tab=tasks]').click();await card('PWR로 옮긴 업무').locator('[data-gcal=complete-task]').click();await p.waitForFunction(()=>HaruCalendar.dashboardSnapshot().tasks.find(t=>t.id==='linked')?.status==='completed');assert.equal(store.pwr.find(t=>t.id==='linked').status,'completed');
 // Hiding and deleting overdue tasks never remove journal/time records.
 await p.locator('.task-overdue>summary').click();await card('지난 미완료').locator('[data-gcal=hide]').click();assert(store.krp.some(t=>t.id==='late'));await p.locator('.calendar-hidden>summary').click();await p.locator('[data-gcal=unhide]').click();await p.locator('.task-overdue>summary').click();await card('지난 미완료').locator('[data-gcal=delete-task]').click();await p.locator('#google-delete-open').click();await p.locator('[data-delete-confirm]').click();await p.locator('#calendar-dialog').waitFor({state:'hidden'});assert(!store.krp.some(t=>t.id==='late'));assert.equal(documents.get('A').payload.timeLogs.length,1);assert.equal(documents.get('A').payload.incomes.length,1);assert.equal(documents.get('A').payload.incomes[0].amount,'300');assert(JSON.parse(documents.get('A').payload.incomes[0].googleIncomeKeys).includes('task:[\"pwr\",\"linked\"]'));
 // Denied writes stay visibly failed and preserve remote classification.
 fail=403;await card('새 워크스워크 업무').locator('[data-task-company-key]').selectOption('pwr');await p.locator('#calendar-dialog .error').filter({hasText:'권한'}).waitFor();assert.equal(store.wsw.length,1);assert.equal(nextId,1);await p.locator('#calendar-dialog .close').click();fail=0;
 await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:'/tmp/haru-tasks-sync-mobile.png',fullPage:true});assert.deepEqual(errors,[]);await browser.close();console.log('PASS authoritative list mapping over legacy tags; real-list creation/move API; cross-screen title/due/status; overdue hide/restore/delete preserves history; denied-write feedback; no duplicate creation; mobile.');
})().catch(e=>{console.error(e);process.exit(1)});
