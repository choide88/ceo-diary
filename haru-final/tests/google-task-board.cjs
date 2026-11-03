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

 const fixture={work:[
 {id:'today',title:'오늘 투자 검토',due:'2026-11-04T00:00:00Z',status:'needsAction',notes:'확인할 내용'},
 {id:'tomorrow',title:'내일 투자 검토',due:'2026-11-05T00:00:00Z',status:'needsAction'},
 {id:'boundary',title:'주 경계 제외',due:'2026-11-09T00:00:00Z',status:'needsAction'},
 {id:'nextmonth',title:'다음달 제외',due:'2026-12-01T00:00:00Z',status:'needsAction'},
 {id:'done',title:'완료된 업무',due:'2026-11-04T00:00:00Z',status:'completed'},
 ...Array.from({length:7},(_,i)=>({id:'u'+i,title:'날짜 없는 업무 '+i,status:'needsAction'}))],personal:[{id:'p',title:'개인 볼일',due:'2026-11-04T00:00:00Z',status:'needsAction'}],family:[{id:'f',title:'가족 저녁',due:'2026-11-04T00:00:00Z',status:'needsAction'}],memo:[{id:'m',title:'메모 <img src=x onerror="window.boardInjected=true">',notes:'아이디어 상세',due:'2026-11-04T00:00:00Z',status:'needsAction'}],misc:[{id:'o',title:'기타 업무',due:'2026-11-04T00:00:00Z',status:'needsAction'}]};let googleWrites=0;
 await context.route('https://tasks.googleapis.com/tasks/v1/**',async route=>{const req=route.request(),u=new URL(req.url());if(!['GET','OPTIONS'].includes(req.method()))googleWrites++;const reply=data=>route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(data)});if(req.method()==='OPTIONS')return reply({});if(u.pathname.endsWith('/users/@me/lists'))return reply({items:[{id:'work',title:'KRP'},{id:'personal',title:'CDE'},{id:'family',title:'가족'},{id:'memo',title:'메모'},{id:'misc',title:'기타'}]});const list=u.pathname.split('/lists/')[1]?.split('/tasks')[0];return reply({items:fixture[list]||[]});});
 await p.goto(SITE);await p.locator('#cloud-login-form [name=email]').fill('a@example.test');await p.locator('#cloud-login-form [name=password]').fill('mock-password');await p.locator('#cloud-login-form button').click();await p.locator('[data-life-overview]').waitFor();
 await p.locator('.google-calendar [data-gcal=settings]').first().click();await p.locator('#calendar-settings-form [name=clientId]').fill(CLIENT);await p.locator('#calendar-settings-form [name=enableTasks]').check();await p.locator('#calendar-settings-form button.primary').click();await saved();await p.waitForFunction(()=>!!window.google?.accounts?.oauth2);await p.getByRole('button',{name:'Google Calendar 연결',exact:true}).click();await p.locator('[data-page=calendar]').first().click();await p.locator('.task-board').first().waitFor();
 await p.locator('[data-gcal=task-lists]').click();for(const el of await p.locator('#google-task-lists-form [name=lists]').all())await el.check();await p.locator('#google-task-lists-form button.primary').click();await saved();
 const board=()=>p.locator('.google-tasks > .task-board');
 await board().getByText('오늘 투자 검토',{exact:true}).waitFor();assert.equal(await board().locator('.task-board-column').count(),4);assert.equal(await board().getByText('내일 투자 검토',{exact:true}).count(),1);assert.equal(await board().getByText('주 경계 제외',{exact:true}).count(),0);assert.equal(await board().getByText('다음달 제외',{exact:true}).count(),0);assert.equal(await board().getByText('날짜 없는 업무 0',{exact:true}).count(),0);assert.equal(await p.locator('.task-undated').evaluate(el=>el.open),false);
 assert.equal(await p.locator('.google-task').getByText('KRP',{exact:true}).count(),0);assert.equal(await p.getByText('내 기록에 반영됨',{exact:true}).count(),0);assert.equal(await board().locator('[data-task-category=other]').getByText('가족 저녁',{exact:true}).count(),1);assert.equal(await board().locator('[data-task-category=memo]').getByText(/메모 <img/).count(),1);assert.equal(await p.locator('.task-board img').count(),0);assert(!(await p.evaluate(()=>HaruCalendar.dashboardSnapshot().tasks)).some(t=>t.listId==='memo'));
 await p.locator('.google-calendar [data-gcal=range][data-range=today]').click();await board().getByText('오늘 투자 검토',{exact:true}).waitFor();assert.equal(await board().getByText('내일 투자 검토',{exact:true}).count(),0);assert((await p.locator('[data-task-range]').innerText()).includes('2026-11-04'));
 await p.locator('[data-action=calendar-tab][data-tab=tasks]').click();await p.locator('[data-calendar-slot=tasks]').waitFor();assert.equal(await board().getByText('내일 투자 검토',{exact:true}).count(),0);await p.locator('.task-range-controls [data-range=week]').click();await board().getByText('내일 투자 검토',{exact:true}).waitFor();
 const task=()=>board().locator('.google-task').filter({has:p.getByRole('heading',{name:'오늘 투자 검토',exact:true})});assert.equal(await task().locator('[data-task-company-key]').inputValue(),'invest');await task().locator('[data-task-company-key]').selectOption('works');await p.getByRole('heading',{name:'이동할 목록을 선택해주세요'}).waitFor();await p.locator('#calendar-dialog .close').click();assert.equal((await p.evaluate(()=>HaruCalendar.dashboardSnapshot().tasks)).find(t=>t.id==='today').role,'invest');
 await p.locator('.task-range-controls [data-range=next]').click();await board().getByText('주 경계 제외',{exact:true}).waitFor();assert.equal(await board().getByText('오늘 투자 검토',{exact:true}).count(),0);await p.locator('.task-range-controls [data-range=month]').click();await board().getByText('주 경계 제외',{exact:true}).waitFor();assert.equal(await board().getByText('다음달 제외',{exact:true}).count(),0);
 await p.evaluate(()=>HaruCalendar.setMonth('2026-12'));await board().getByText('다음달 제외',{exact:true}).waitFor();assert.equal(await board().getByText('오늘 투자 검토',{exact:true}).count(),0);await p.locator('.task-range-controls [data-range=today]').click();
 await p.locator('[data-gcal=tasks-completed]').click();await board().getByText('완료된 업무',{exact:true}).waitFor();await p.locator('.task-undated>summary').click();const more=p.locator('.task-undated .task-board-more');await more.locator('summary').click();assert.equal(await p.locator('.task-undated .google-task:visible').count(),7);
 const memo=board().locator('.google-task').filter({has:p.getByRole('heading',{name:/메모 <img/})});await memo.locator('[data-gcal=task-memo]').click();await p.locator('#task-memo-form [name=text]').fill('확인한 메모만 저장');await p.locator('#task-memo-form button.primary').click();await saved();assert.equal(documents.get('A').payload.notes.length,1);assert.equal(documents.get('A').payload.tasks.length,0);assert.equal(documents.get('A').payload.timeLogs.length,0);
 // Company selection survives reload, and local task review uses that company.
 await p.reload();await task().waitFor();assert.equal(await task().locator('[data-task-company-key]').inputValue(),'invest');await task().locator('[data-gcal=task-import]').click();assert.equal(await p.locator('#google-task-review-form [name=role]').inputValue(),'invest');await p.locator('#google-task-review-form button.primary').click();await saved();assert.equal(documents.get('A').payload.tasks[0].role,'invest');
 await p.screenshot({path:'/tmp/secret-tasks-compact-desktop.png',fullPage:false});
 // Short work journal, company cards, optional details, persistence and escaping.
 await p.locator('[data-page=work]').first().click();assert.equal(await p.locator('.work-company-grid>.card').count(),3);assert.equal(await p.locator('.work-company-grid').getByText('본업',{exact:true}).count(),0);assert.equal(await p.locator('.work-company-grid').getByText('사이드프로젝트',{exact:true}).count(),0);assert.equal(await p.locator('.work-stats').evaluate(el=>el.open),false);
 await p.locator('[data-action=work-entry-new]').first().click();await p.locator('#work-entry-form [name=role]').selectOption('pwr');await p.locator('#work-entry-form [name=title]').fill('초안 <img src=x onerror="window.workInjected=true">');await p.locator('#work-entry-form [name=result]').fill('검토할 질문 세 개');await p.locator('#work-entry-form [name=next]').fill('고객 한 명에게 확인');await p.locator('#work-entry-form button.primary').click();await saved();assert.equal(JSON.parse(documents.get('A').payload.profile.workEntries).length,1);assert.equal(await p.locator('.work-entry img').count(),0);assert((await p.locator('.work-entry').innerText()).includes('고객 한 명에게 확인'));
 await p.locator('[data-action=work-entry-filter][data-value=invest]').click();assert.equal(await p.locator('.work-entry').count(),0);await p.locator('[data-action=work-entry-filter][data-value=pwr]').click();await p.locator('.work-entry [data-action=work-entry-edit]').click();await p.locator('#work-entry-form [name=result]').fill('초안 검토 완료');await p.locator('#work-entry-form button.primary').click();await saved();await p.reload();await p.locator('.work-entry').waitFor();assert((await p.locator('.work-entry').innerText()).includes('초안 검토 완료'));assert.equal(JSON.parse(documents.get('A').payload.profile.workEntries)[0].role,'pwr');
 await p.locator('[data-work-companies]').getByText('내일 투자 검토',{exact:true}).waitFor();fixture.work.find(t=>t.id==='tomorrow').status='completed';await p.clock.fastForward(61000);await p.evaluate(()=>window.dispatchEvent(new Event('focus')));await p.waitForFunction(()=>HaruCalendar.dashboardSnapshot().tasks.find(t=>t.id==='tomorrow')?.status==='completed');assert.equal(await p.locator('[data-work-companies]').getByText('내일 투자 검토',{exact:true}).count(),0);assert.equal(JSON.parse(documents.get('A').payload.profile.workEntries).length,1);
 await p.screenshot({path:'/tmp/secret-work-compact-desktop.png',fullPage:false});await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:'/tmp/secret-work-compact-mobile.png',fullPage:true});assert.equal(await p.evaluate(()=>!!window.boardInjected||!!window.workInjected),false);assert.equal(googleWrites,0);await p.locator('.work-entry [data-action=work-entry-edit]').click();await p.locator('[data-action=work-entry-delete]').click();await saved();assert.equal(JSON.parse(documents.get('A').payload.profile.workEntries).length,0);assert.deepEqual(errors,[]);await browser.close();console.log('PASS: calendar-linked day/week/next/month/custom bounds, separate undated tasks, four categories, read-only reassignment guard/reload/review, legacy memo preservation, compact work journal CRUD/filter/persistence, no Google writes, escaping and mobile.');
})().catch(e=>{console.error(e);process.exit(1)});
