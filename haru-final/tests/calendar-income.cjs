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
   return reply(200,{items:[{id:'past',iCalUID:'same-meeting@example.test',summary:'[알바] 투자 심사 (50)',start:{dateTime:'2026-11-03T10:00:00+09:00'},end:{dateTime:'2026-11-03T11:00:00+09:00'}},{id:'future',summary:'[알바] 다음 심사 (20)',start:{dateTime:'2026-11-05T10:00:00+09:00'},end:{dateTime:'2026-11-05T11:00:00+09:00'}},{id:'html',summary:'<img src=x onerror="window.injected=true">',location:'<svg onload="window.injected=true">',start:{dateTime:'2026-11-04T00:00:00Z'},end:{dateTime:'2026-11-04T01:00:00Z'}},{id:'overnight',summary:'밤샘 준비',start:{dateTime:'2026-11-02T23:30:00+09:00'},end:{dateTime:'2026-11-03T00:30:00+09:00'}},{id:'recurring_20261103',summary:'반복 일정',originalStartTime:{dateTime:'2026-11-03T13:00:00+09:00'},start:{dateTime:'2026-11-03T13:00:00+09:00'},end:{dateTime:'2026-11-03T13:30:00+09:00'}}],nextPageToken:'events-page-2'});
  }
  return reply(404,{});
 });
 const saved=()=>p.locator('#cloud-status').filter({hasText:'서버 저장 완료'}).waitFor();
 await p.goto(SITE);await p.locator('#cloud-login-form [name=email]').fill('a@example.test');await p.locator('#cloud-login-form [name=password]').fill('mock-password');await p.locator('#cloud-login-form button').click();await p.locator('#nav [data-page=home]').waitFor();await p.locator('.google-calendar [data-gcal=settings]').click();await p.locator('#calendar-settings-form [name=clientId]').fill(CLIENT);await p.locator('#calendar-settings-form button.primary').click();await saved();await p.waitForFunction(()=>!!window.google?.accounts?.oauth2);await p.getByRole('button',{name:'Google Calendar 연결',exact:true}).click();await p.locator('#nav [data-page=calendar]').click();
 const event=p.locator('.calendar-event').filter({hasText:'[알바] 투자 심사 (50)'});await event.waitFor();await p.locator('[data-gcal=range][data-range=previous-month]').click();await p.waitForFunction(()=>document.querySelector('.google-calendar .calendar-foot')?.textContent.includes('2026-10-01'));assert.ok(requests.some(r=>r.params.timeMin==='2026-10-01T00:00:00+09:00'&&r.params.timeMax==='2026-11-01T00:00:00+09:00'));await p.locator('[data-gcal=range][data-range=week]').click();await p.locator('.google-calendar .calendar-foot').filter({hasText:'2026-11-02'}).waitFor();assert.equal(documents.get('A').payload.incomes.length,0);assert.equal(documents.get('A').payload.timeLogs.length,0);await event.locator('[data-gcal=income]').click();assert.equal(await p.locator('#income-record-form [name=amount]').inputValue(),'500000');assert.equal(await p.locator('#income-record-form [name=role]').inputValue(),'invest');assert.equal(await p.locator('#income-record-form [name=stage]').inputValue(),'earned');assert.equal(documents.get('A').payload.incomes.length,0);await p.locator('#modal [data-action=close]').first().click();assert.equal(documents.get('A').payload.incomes.length,0);
 await event.locator('[data-gcal=income]').click();await p.locator('#income-record-form button.primary').click();await saved();assert.equal(documents.get('A').payload.incomes.length,1);assert.equal(documents.get('A').payload.incomes[0].amount,'500000');assert.equal(documents.get('A').payload.incomes[0].done,false);assert.equal(documents.get('A').payload.timeLogs.length,0,'income confirmation must not create actual hours');
 await p.locator('#nav [data-page=money]').click();const ledger=p.locator('section.card').filter({has:p.getByRole('heading',{name:'월별 추가 알바 수입',exact:true})});await ledger.waitFor();const earned=ledger.locator('.metric').filter({hasText:'수행월 기준 확정 수입'});const paid=ledger.locator('.metric').filter({hasText:'입금월 기준 실제 입금'});assert.ok(await earned.getByText('₩ 500,000',{exact:true}).count());assert.ok(await paid.getByText('₩ 0',{exact:true}).count());
 await ledger.getByRole('button',{name:'수입 검토·수정',exact:true}).click();await p.locator('#income-record-form [name=date]').fill('2026-10-31');await p.locator('#income-record-form summary').click();await p.locator('#income-record-form [name=done]').check();await p.locator('#income-record-form [name=receivedDate]').fill('2026-11-04');await p.locator('#income-record-form [name=receivedAmount]').fill('483500');await p.locator('#income-record-form button.primary').click();await saved();assert.ok(await earned.getByText('₩ 0',{exact:true}).count());assert.ok(await paid.getByText('₩ 483,500',{exact:true}).count());await p.locator('#income-month').fill('2026-10');await p.locator('#income-month-form button').click();assert.ok(await earned.getByText('₩ 500,000',{exact:true}).count());assert.ok(await paid.getByText('₩ 0',{exact:true}).count());
 await p.locator('#nav [data-page=calendar]').click();await event.locator('[data-gcal=import]').click();assert.equal(await p.locator('#calendar-import-form [name=workKind]').inputValue(),'알바');await p.locator('#calendar-import-form [name=minutes]').fill('120');await p.locator('#calendar-import-form summary').click();await p.locator('#calendar-import-form [name=hourlyRate]').fill('10000');await p.locator('#calendar-import-form button.primary').click();await saved();assert.equal(documents.get('A').payload.incomes.length,1);await p.locator('#nav [data-page=work]').click();await p.getByRole('button',{name:'수입으로 검토',exact:true}).click();assert.equal(await p.locator('#income-record-form [name=amount]').inputValue(),'500000','fixed fee must take precedence over hourly estimate');await p.locator('#income-record-form button.primary').click();await saved();assert.equal(documents.get('A').payload.incomes.length,1,'same calendar fee must not be counted twice');
 await p.locator('#nav [data-page=calendar]').click();const future=p.locator('.calendar-event').filter({hasText:'[알바] 다음 심사 (20)'});await future.locator('[data-gcal=income]').click();assert.equal(await p.locator('#income-record-form [name=stage]').inputValue(),'expected');await p.locator('#income-record-form [name=stage]').selectOption('earned');await p.locator('#income-record-form button.primary').click();await p.locator('#income-error').filter({hasText:'미래 수행일'}).waitFor();assert.equal(documents.get('A').payload.incomes.length,1);await p.locator('#income-record-form [name=stage]').selectOption('expected');await p.locator('#income-record-form button.primary').click();await saved();await p.locator('#nav [data-page=money]').click();await p.locator('#income-month').fill('2026-11');await p.locator('#income-month-form button').click();assert.ok(await ledger.locator('.metric').filter({hasText:'선택한 달의 예정 수입'}).getByText('₩ 200,000',{exact:true}).count());assert.ok(await earned.getByText('₩ 0',{exact:true}).count());
 await p.reload();await ledger.waitFor();assert.ok(await paid.getByText('₩ 483,500',{exact:true}).count());assert.equal(documents.get('A').payload.incomes.length,2);await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.setViewportSize({width:1440,height:1050});await p.emulateMedia({reducedMotion:'reduce'});await p.screenshot({path:'/tmp/haru-monthly-income.png',fullPage:true});assert.ok(requests.every(r=>r.method==='GET'));assert.deepEqual(errors,[]);
 console.log('PASS: fixed calendar fees require confirmation, no automatic hours, performed/received months separated, net receipts, hourly estimates not double-counted, future forecasts excluded, reload and mobile.');await browser.close();
})().catch(e=>{console.error(e.message);process.exit(1)});
