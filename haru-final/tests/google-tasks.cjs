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
 await p.goto(SITE);await p.locator('#cloud-login-form [name=email]').fill('a@example.test');await p.locator('#cloud-login-form [name=password]').fill('mock-password');await p.locator('#cloud-login-form button').click();await p.locator('#nav [data-page=home]').waitFor();
 await p.locator('.google-calendar [data-gcal=settings]').click();await p.locator('#calendar-settings-form [name=clientId]').fill(CLIENT);await p.locator('#calendar-settings-form [name=enableTasks]').check();await p.locator('#calendar-settings-form button.primary').click();await saved();await p.waitForFunction(()=>!!window.google?.accounts?.oauth2);await p.getByRole('button',{name:'Google Calendar 연결',exact:true}).click();await p.getByText('투자 검토 자료 준비',{exact:true}).waitFor();
 assert.ok((await p.evaluate(()=>window.lastGoogleConfig.scope)).includes('https://www.googleapis.com/auth/tasks.readonly'));assert.equal(documents.get('A').payload.tasks.length,0,'fetched tasks are unconfirmed');assert.equal(documents.get('A').payload.timeLogs.length,0);
 await p.locator('#nav [data-page=calendar]').click();await p.locator('[data-gcal=task-lists]').click();await p.locator('#google-task-lists-form [name="role-0"]').selectOption('invest');await p.locator('#google-task-lists-form [name=lists]').nth(1).check();await p.locator('#google-task-lists-form button.primary').click();await saved();await p.getByText('카페 알바 준비',{exact:true}).waitFor();assert.ok(taskCalls.some(r=>r.url.includes('pageToken=more-lists')));assert.ok(taskCalls.some(r=>r.url.includes('pageToken=more-tasks')));assert.equal(await p.getByText('삭제된 일',{exact:true}).count(),0);
 const work=p.locator('.google-task').filter({hasText:'투자 검토 자료 준비'});await work.locator('[data-gcal=task-import]').click();assert.equal(documents.get('A').payload.tasks.length,0,'review must not save');assert.equal(await p.locator('#google-task-review-form [name=date]').inputValue(),'2026-11-05');assert.equal(await p.locator('#google-task-review-form [name=role]').inputValue(),'invest');await p.locator('#calendar-dialog [data-gcal=close]').first().click();assert.equal(documents.get('A').payload.tasks.length,0,'cancel review preserves no local task');
 await work.locator('[data-gcal=task-import]').click();await p.locator('#google-task-review-form [name=title]').fill('내가 확인한 투자 업무');await p.locator('#google-task-review-form button.primary').click();await saved();assert.equal(documents.get('A').payload.tasks.length,1);const importedId=documents.get('A').payload.tasks[0].id;assert.equal(documents.get('A').payload.tasks[0].done,false);
 await p.locator('[data-gcal=tasks-completed]').click();googleDone=true;await p.locator('[data-gcal=tasks-refresh]').click();await work.getByText('Google 완료',{exact:false}).waitFor();assert.equal(documents.get('A').payload.tasks[0].done,false,'Google updates must not auto-write');await work.locator('[data-gcal=task-import]').click();assert.equal(await p.locator('#google-task-review-form [name=done]').isChecked(),true);await p.locator('#google-task-review-form button.primary').click();await saved();assert.equal(documents.get('A').payload.tasks.length,1);assert.equal(documents.get('A').payload.tasks[0].id,importedId);assert.equal(documents.get('A').payload.tasks[0].done,true);
 const past=p.locator('.calendar-event').filter({hasText:'투자 검토'});await past.locator('[data-gcal=import]').click();await p.locator('#calendar-import-form [name=workKind]').selectOption('알바');await p.locator('#calendar-import-form [name=minutes]').fill('120');await p.locator('#calendar-import-form summary').click();await p.locator('#calendar-import-form [name=employer]').fill('주말 카페');await p.locator('#calendar-import-form [name=hourlyRate]').fill('12000');assert.equal(documents.get('A').payload.timeLogs.length,0);await p.locator('#calendar-import-form button.primary').click();await saved();assert.equal(documents.get('A').payload.incomes.length,0,'estimate is not an actual income');assert.equal(documents.get('A').payload.timeLogs[0].workKind,'알바');await p.locator('#nav [data-page=work]').click();const jobs=p.locator('section.card').filter({has:p.getByRole('heading',{name:'알바 기록',exact:true})});assert.ok(await jobs.getByText('₩ 24,000',{exact:true}).count());await jobs.getByRole('button',{name:'편집',exact:true}).click();await p.locator('#entityForm [name=minutes]').fill('90');await p.locator('#entityForm button.primary').click();await saved();assert.ok(await jobs.getByText('₩ 18,000',{exact:true}).count(),'estimate recomputed after editing actual time');
 await p.locator('#nav [data-page=calendar]').click();taskFailure=true;await p.locator('[data-gcal=tasks-refresh]').click();await p.locator('.google-tasks .notice').filter({hasText:'일부 목록 조회 실패'}).waitFor();assert.ok(await p.getByText('투자 검토',{exact:true}).count(),'Tasks failure must not break calendars');assert.ok(taskCalls.every(c=>c.method==='GET'));
 const stored=await p.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}));assert.ok(!stored.includes('google-mock-token'));await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.setViewportSize({width:1440,height:1050});await p.emulateMedia({reducedMotion:'reduce'});await p.screenshot({path:'/tmp/haru-google-tasks.png',fullPage:true});
 await p.evaluate(()=>window.googleTestMode='tasks-deny');await p.locator('[data-gcal=disconnect]').click();const count=taskCalls.length;await p.getByRole('button',{name:'Google Calendar 연결',exact:true}).click();await p.locator('.google-calendar').getByText('투자 검토',{exact:true}).waitFor();assert.equal(taskCalls.length,count,'declined Tasks scope must not call Tasks API');assert.ok(await p.getByRole('button',{name:'Google Tasks 연결',exact:true}).count());
 assert.deepEqual(errors,[]);console.log('PASS: Tasks read-only, pagination, confirmation/cancel, due date, role mapping, explicit status refresh, idempotent updates, part-time actual hours and optional pay, no income auto-creation, partial failures, granular consent, mobile.');await browser.close();
})().catch(e=>{console.error(e.message);process.exit(1)});
