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

 const fixture=[{id:'t1',title:'오늘 준비할 자료',due:'2026-11-04T00:00:00Z',status:'needsAction'},{id:'t2',title:'긴 제목도 정렬 유지하기 위한 테스트 업무입니다',due:'2026-11-04T00:00:00Z',status:'needsAction'}];let writes=0;await context.route('https://tasks.googleapis.com/tasks/v1/**',async route=>{const req=route.request(),u=new URL(req.url());if(!['GET','OPTIONS'].includes(req.method()))writes++;return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(u.pathname.endsWith('/users/@me/lists')?{items:[{id:'work',title:'KRP'}]}:{items:fixture})});});
 const layout=async()=>{const geometry=await p.evaluate(()=>{const rect=el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,width:r.width}};return {cards:[...document.querySelectorAll('.home-priority .google-home-card')].map(rect),second:[...document.querySelectorAll('.home-secondary-grid>div>.card')].map(rect),overview:rect(document.querySelector('[data-life-overview]')),overflow:document.documentElement.scrollWidth>innerWidth+1}});const pairs=await p.locator('.home-layout .two>.card').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {top:r.top,height:r.height}}));if(pairs.length===2){assert(Math.abs(pairs[0].top-pairs[1].top)<1);assert(Math.abs(pairs[0].height-pairs[1].height)<1);}assert.equal(geometry.cards.length,3);assert.equal(geometry.overflow,false);for(const r of geometry.cards){assert(Math.abs(r.top-geometry.cards[0].top)<1);assert(Math.abs(r.height-geometry.cards[0].height)<1);}assert(Math.abs(geometry.second[0].top-geometry.second[1].top)<1);assert(Math.abs(geometry.second[0].height-geometry.second[1].height)<1);assert(geometry.second[0].top>=geometry.cards[0].bottom+14);assert(geometry.overview.top>=geometry.second[0].bottom+14);};
 await p.goto(SITE);await p.locator('#cloud-login-form [name=email]').fill('a@example.test');await p.locator('#cloud-login-form [name=password]').fill('mock-password');await p.locator('#cloud-login-form button').click();await p.locator('.home-health-card').waitFor();await layout();assert.equal(await p.locator('[data-home-time]').count(),0);assert.equal(await p.locator('.home-rail').getByRole('heading',{name:'건강',exact:true}).count(),0);assert(!/이번 주 일정|실제 기록|시간|미지정/.test(await p.locator('[data-home-work]').innerText()));assert((await p.locator('.home-health-card').innerText()).includes('미기록'));
 await p.locator('.home-health-card [data-action=health-date]').click();await p.locator('#entityForm [name=sleep]').fill('7.5');await p.locator('#entityForm [name=minutes]').fill('30');await p.locator('#entityForm [name=exercise]').selectOption('운동함');await p.locator('#entityForm [name=drink]').selectOption('안 마심');await p.locator('#entityForm button.primary').click();await saved();assert.equal(documents.get('A').payload.health.length,1);assert((await p.locator('.home-health-card').innerText()).includes('7.5h'));assert((await p.locator('.home-health-card').innerText()).includes('30분'));await layout();await p.locator('.home-health-card [data-action=health-date]').click();assert.equal(await p.locator('#entityForm [name=sleep]').inputValue(),'7.5');await p.locator('#entityForm [name=minutes]').fill('45');await p.locator('#entityForm button.primary').click();await saved();assert.equal(documents.get('A').payload.health.length,1);
 await p.locator('.google-calendar [data-gcal=settings]').first().click();await p.locator('#calendar-settings-form [name=clientId]').fill(CLIENT);await p.locator('#calendar-settings-form [name=enableTasks]').check();await p.locator('#calendar-settings-form button.primary').click();await saved();await p.waitForFunction(()=>!!window.google?.accounts?.oauth2);await p.getByRole('button',{name:'Google Calendar 연결',exact:true}).click();await p.locator('.google-home-grid>.google-home-card').nth(1).getByText('오늘 준비할 자료',{exact:true}).waitFor();await layout();await p.locator('[data-home-work]').getByText('오늘 준비할 자료',{exact:true}).waitFor();assert(!/이번 주 일정|실제 기록|미지정/.test(await p.locator('[data-home-work]').innerText()));await p.locator('#weekNote [name=next]').fill('작성 중 유지');await p.locator('.google-calendar [data-gcal=refresh]').click();await p.locator('.home-health-card').getByText('45분',{exact:true}).waitFor();assert.equal(await p.locator('#weekNote [name=next]').inputValue(),'작성 중 유지');await layout();await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:'/tmp/secret-home-priority-desktop.png',fullPage:false});
 for(const width of [1024,820]){await p.setViewportSize({width,height:1050});await layout();}await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const mobile=await p.locator('.home-priority .google-home-card').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom}}));assert(mobile[1].top>=mobile[0].bottom+14);assert(mobile[2].top>=mobile[1].bottom+14);await p.screenshot({path:'/tmp/secret-home-priority-mobile.png',fullPage:true});await p.reload();await p.locator('.home-health-card').getByText('45분',{exact:true}).waitFor();assert.equal(writes,0);assert.deepEqual(errors,[]);await browser.close();console.log('PASS: schedule/Tasks/health priority order, equal card tops/heights desktop/tablet, consistent diary gap, compact task-only work summary, same-day health add/edit/persistence, async refresh preserves input, mobile stacking and no overflow.');
})().catch(e=>{console.error(e);process.exit(1)});
