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
 setTimeout(()=>config.callback({access_token:'google-mock-token',expires_in:window.googleTestMode==='expire'?1:3600,scope:window.googleTestMode==='partial'?'https://www.googleapis.com/auth/calendar.events.readonly':config.scope}),0);
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

 let bodyFetches=0,expectMemo=true;await context.route(GOOGLE+'**',async route=>{const u=new URL(route.request().url());if(u.pathname.endsWith('/users/me/calendarList'))return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify({items:[{id:calendarA,summary:'업무',primary:true,accessRole:'owner'},{id:calendarB,summary:'메모',accessRole:'owner'},{id:'personal',summary:'개인',accessRole:'reader'},{id:'family',summary:'가족',accessRole:'reader'}]})});if(u.pathname.includes(encodeURIComponent(calendarB))&&u.pathname.endsWith('/events')){bodyFetches++;assert.equal(u.searchParams.get('fields').includes('description'),expectMemo);return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify({items:[{id:'memo-one',summary:'[알바] 다음 아이디어 (50)',description:'중요한 생각 <script>window.memoInjected=true</script>',start:{dateTime:'2026-11-04T09:00:00+09:00'},end:{dateTime:'2026-11-04T18:00:00+09:00'}},{id:'memo-future',summary:'앞으로 생각할 것',start:{date:'2026-11-06'},end:{date:'2026-11-07'}}]})});}return route.fallback();});
 const saved=()=>p.locator('#cloud-status').filter({hasText:'서버 저장 완료'}).waitFor();await p.goto(SITE);await p.locator('#cloud-login-form [name=email]').fill('a@example.test');await p.locator('#cloud-login-form [name=password]').fill('mock-password');await p.locator('#cloud-login-form button').click();await p.locator('#quickForm').waitFor();await p.locator('.google-calendar [data-gcal=settings]').first().click();await p.locator('#calendar-settings-form [name=clientId]').fill(CLIENT);await p.locator('#calendar-settings-form button.primary').click();await saved();await p.waitForFunction(()=>!!window.google?.accounts?.oauth2);await p.getByRole('button',{name:'Google Calendar 연결',exact:true}).click();await p.locator('.google-calendar').getByText('읽기 전용 연결',{exact:true}).waitFor();await p.locator('.google-calendar [data-gcal=settings]').first().click();await p.locator('#calendar-settings-form [name=selected]').nth(1).check();assert.equal(await p.locator('#calendar-settings-form [name=type-1]').inputValue(),'memo');await p.locator('#calendar-settings-form button.primary').click();await saved();await p.locator('.calendar-memos').getByText('[알바] 다음 아이디어 (50)',{exact:true}).waitFor();assert(bodyFetches);assert.equal(await p.locator('.google-home-card').getByText('[알바] 다음 아이디어 (50)',{exact:true}).count(),0);
 await p.locator('#nav [data-page=calendar]').click();await p.locator('.calendar-memos').waitFor();assert.equal(await p.locator('.visual-time-event,.calendar-visual-event').filter({hasText:'다음 아이디어'}).count(),0);assert(!(await p.evaluate(()=>HaruCalendar.snapshot().events)).some(e=>e.calendarName==='메모'));const memo=p.locator('.calendar-memo').filter({hasText:'다음 아이디어'});assert.equal(await memo.locator('[data-gcal=import],[data-gcal=income]').count(),0);await memo.locator('[data-gcal=memo-import]').click();assert.equal(documents.get('A').payload.notes.length,0);await p.locator('#calendar-memo-form [name=text]').fill('내가 확인한 아이디어');await p.locator('#calendar-memo-form button.primary').click();await saved();assert.equal(documents.get('A').payload.notes.length,1,JSON.stringify({errors,form:await p.locator('dialog[open]').innerText().catch(()=>''),status:await p.locator('#cloud-status').innerText()}));assert.equal(documents.get('A').payload.notes[0].text,'내가 확인한 아이디어');assert.equal(documents.get('A').payload.timeLogs.length,0);assert.equal(documents.get('A').payload.incomes.length,0);
 await memo.locator('[data-gcal=memo-import]').click();await p.locator('#entityForm').waitFor();assert.equal(await p.locator('#entityForm [name=text]').inputValue(),'내가 확인한 아이디어');await p.locator('#entityForm button.primary').click();await saved();assert.equal(documents.get('A').payload.notes.length,1);
 const future=p.locator('.calendar-memo').filter({hasText:'앞으로 생각할 것'});await future.locator('[data-gcal=memo-import]').click();assert.equal(await p.locator('#calendar-memo-form [name=date]').inputValue(),'2026-11-04');await p.locator('#calendar-memo-form button.primary').click();await saved();assert.equal(documents.get('A').payload.notes[1].googleMemoDate,'2026-11-06');await memo.locator('[data-gcal=hide]').click();await saved();assert.equal(await p.locator('.calendar-memos').getByText('[알바] 다음 아이디어 (50)',{exact:true}).count(),0);await p.reload();await p.locator('.calendar-memos').getByText('앞으로 생각할 것',{exact:true}).waitFor();assert.equal(documents.get('A').payload.notes.length,2);await p.locator('.calendar-hidden>summary').click();await p.locator('[data-gcal=unhide]').click();await saved();await p.locator('.calendar-memos').getByText('[알바] 다음 아이디어 (50)',{exact:true}).waitFor();await p.locator('.google-calendar [data-gcal=settings]').first().click();await p.locator('#calendar-settings-form [name=type-1]').selectOption('schedule');expectMemo=false;await p.locator('#calendar-settings-form button.primary').click();await saved();await p.waitForFunction(()=>HaruCalendar.snapshot().events.some(e=>e.calendarName==='메모'));assert(await p.locator('.visual-time-event').filter({hasText:'다음 아이디어'}).count());await p.locator('.google-calendar [data-gcal=settings]').first().click();await p.locator('#calendar-settings-form [name=type-1]').selectOption('memo');expectMemo=true;await p.locator('#calendar-settings-form button.primary').click();await saved();await p.locator('.calendar-memos').getByText('[알바] 다음 아이디어 (50)',{exact:true}).waitFor();assert.equal(documents.get('A').payload.notes.length,2);assert.equal(await p.evaluate(()=>!!window.memoInjected),false);await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await browser.close();console.log('PASS: 메모 auto classification, description projection, no scheduled/actual/income attribution, confirmed notes import/dedup, future source date, hide/restore, server persistence, escaping and mobile.');
})().catch(e=>{console.error(e);process.exit(1)});
