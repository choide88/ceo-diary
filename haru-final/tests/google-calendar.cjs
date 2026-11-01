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
 let saveStep=0;const saved=async()=>{saveStep++;try{await p.locator('#cloud-status').filter({hasText:'서버 저장 완료'}).waitFor({timeout:5000});}catch(e){throw Error('save step '+saveStep+' status '+await p.locator('#cloud-status').innerText()+' dialog '+await p.locator('dialog[open]').innerText().catch(()=>''));}};
 const login=async(email)=>{await p.locator('#cloud-login-form [name=email]').fill(email);await p.locator('#cloud-login-form [name=password]').fill('mock-password');await p.locator('#cloud-login-form button').click();await p.locator('#nav [data-page=home]').waitFor();};
 await p.goto(SITE);await login('a@example.test');await p.locator('.google-calendar [data-gcal=settings]').first().click();await p.locator('#calendar-settings-form [name=clientId]').fill(CLIENT);await p.locator('#calendar-settings-form button.primary').click();await saved();await p.waitForFunction(()=>!!window.google?.accounts?.oauth2);await p.getByRole('button',{name:'Google Calendar 연결',exact:true}).click();await p.locator('.google-calendar').getByText('읽기 전용 연결',{exact:true}).waitFor();
 await p.locator('#nav [data-page=calendar]').click();await p.locator('.calendar-review-list > summary').waitFor();if(!await p.locator('.calendar-review-list').evaluate(el=>el.open))await p.locator('.calendar-review-list > summary').click();await p.locator('.calendar-event').filter({hasText:'투자 검토'}).waitFor();
 assert.ok(requests.some(r=>r.params.pageToken==='cal-page-2'));assert.ok(requests.some(r=>r.params.pageToken==='events-page-2'));assert.equal(await p.getByText('취소된 일정',{exact:true}).count(),0);
 assert.deepEqual((await p.evaluate(()=>window.lastGoogleConfig.scope)).split(' ').sort(),scopes.sort());assert.equal(await p.locator('.google-calendar img,.google-calendar svg').count(),0);assert.equal(await p.evaluate(()=>!!window.injected),false);
 const future=p.locator('.calendar-event').filter({hasText:'미래 미팅'});assert.equal(await future.locator('[data-gcal=import]').count(),0);
 await p.locator('.google-calendar [data-gcal=settings]').first().click();await p.locator('#calendar-settings-form input[name=selected]').nth(1).check();await p.locator('#calendar-settings-form [name="role-0"]').selectOption('invest');await p.locator('#calendar-settings-form [name="role-1"]').selectOption('works');await p.locator('#calendar-settings-form button.primary').click();await saved();await p.getByText('팀 작업',{exact:true}).waitFor();assert.equal(await p.getByText('중복 초대 일정',{exact:true}).count(),0,'same meeting across calendars is deduplicated');
 const past=p.locator('.calendar-event').filter({hasText:'투자 검토'});await past.locator('[data-gcal=import]').click();assert.equal(documents.get('A').payload.timeLogs.length,0,'no automatic actual time');assert.equal(await p.locator('#calendar-import-form [name=minutes]').inputValue(),'60');assert.equal(await p.locator('#calendar-import-form [name=role]').inputValue(),'invest');await p.locator('#calendar-import-form [name=minutes]').fill('45');await p.locator('#calendar-import-form button.primary').click();await saved();assert.equal(documents.get('A').payload.timeLogs[0].minutes,'45');assert.equal(documents.get('A').payload.timeLogs[0].date,'2026-11-03');await past.getByRole('button',{name:'기록됨 · 보기',exact:true}).click();await p.locator('#entityForm [name=minutes]').fill('50');await p.locator('#entityForm button.primary').click();await saved();assert.ok(documents.get('A').payload.timeLogs[0].googleEventKey,'metadata survives edit');assert.equal(documents.get('A').payload.timeLogs.length,1);
 const allDay=p.locator('.calendar-event').filter({hasText:'종일 일정'});await allDay.locator('[data-gcal=import]').click();assert.equal(await p.locator('#calendar-import-form [name=minutes]').inputValue(),'');await p.locator('#calendar-import-form [name=minutes]').fill('30');await p.locator('#calendar-import-form button.primary').click();await saved();assert.equal(documents.get('A').payload.timeLogs.length,2);
 partial=true;await p.locator('.google-calendar [data-gcal=refresh]').click();await p.locator('.google-calendar .notice').filter({hasText:'일부 캘린더'}).waitFor();assert.ok(await p.getByText('투자 검토',{exact:true}).count());partial=false;
 assert.ok(requests.every(r=>r.method==='GET'),'Google calendar access is read-only');assert.ok(requests.filter(r=>r.path.endsWith('/events')).every(r=>r.params.singleEvents==='true'&&r.params.timeZone==='Asia/Seoul'));
 const stored=await p.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}));assert.ok(stored.includes('google-mock-token'));assert.ok(!await p.evaluate(()=>JSON.stringify({...localStorage}).includes('google-mock-token')));assert.ok(!JSON.stringify(documents.get('A')).includes('google-mock-token'));
 await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.setViewportSize({width:1440,height:1050});await p.emulateMedia({reducedMotion:'reduce'});await p.screenshot({path:'/tmp/haru-google-calendar.png',fullPage:true});
 const before=requests.length;await p.reload();await p.locator('.google-calendar').getByText('읽기 전용 연결',{exact:true}).waitFor();await p.locator('.calendar-event').first().waitFor({state:'attached'});assert.ok(requests.length>before,'reload restores tab session without consent');await p.locator('[data-gcal=disconnect]').click();await p.waitForFunction(()=>!!window.google?.accounts?.oauth2);
 await p.evaluate(()=>window.googleTestMode='partial');await p.getByRole('button',{name:'Google Calendar 연결',exact:true}).click();await p.getByText('일정과 캘린더 목록의 읽기 권한이 필요합니다. 동의하지 않은 항목을 확인해주세요.',{exact:true}).waitFor();assert.ok(!await p.evaluate(()=>JSON.stringify({...sessionStorage}).includes('google-mock-token')));
 await p.evaluate(()=>window.googleTestMode='expire');await p.getByRole('button',{name:'Google Calendar 연결',exact:true}).click();await p.locator('.google-calendar').getByText('다시 연결 필요',{exact:true}).waitFor();
 await p.evaluate(()=>window.googleTestMode='closed');await p.getByRole('button',{name:'Google Calendar 연결',exact:true}).click();await p.getByText('연결 창을 닫았습니다. 원할 때 다시 연결하세요.',{exact:true}).waitFor();
 await p.evaluate(()=>window.googleTestMode='deferred');await p.getByRole('button',{name:'Google Calendar 연결',exact:true}).click();await p.locator('#cloud-account').click();await p.locator('[data-cloud=logout]').click();await p.locator('#cloud-login-form').waitFor();await login('b@example.test');const count=requests.length;await p.evaluate(()=>window.googleDeferredCallback());assert.equal(requests.length,count);assert.equal(await p.getByText('투자 검토',{exact:true}).count(),0);assert.ok(await p.getByRole('button',{name:'처음 연결하기',exact:true}).count());
 assert.deepEqual(errors,[]);console.log('PASS: read-only scopes, paginated calendars/events, KST, cancelled/future/all-day handling, user-confirmed actual time, metadata/dedup, role mapping, partial failure, tab session restore without token in account data, reauth/expiry/cancel, account isolation, mobile.');await browser.close();
})().catch(e=>{console.error(e.message);process.exit(1)});
