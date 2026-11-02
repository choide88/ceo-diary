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

 const external=[];let cgFail=false;await context.route('https://api.upbit.com/**',route=>{external.push(route.request().url());return route.fulfill({json:[{market:'KRW-SOL',trade_price:100000,trade_timestamp:Date.parse('2026-11-04T03:00Z')} ]});});await context.route('https://api.coingecko.com/**',route=>{external.push(route.request().url());return route.fulfill(cgFail?{status:429,json:{}}:{json:{'staked-ether':{krw:2000000,last_updated_at:Date.parse('2026-11-04T03:00Z')/1000},elizaos:{krw:0.25,last_updated_at:Date.parse('2026-11-04T03:00Z')/1000}}});});
 const make=(key,market,q,status='보유')=>({name:'가상 보유분 '+key,assetType:'crypto',valuation:'crypto',quantity:q,assetUnit:market==='CG:staked-ether'?'STETH':market==='CG:elizaos'?'ELIZAOS':'SOL',market,date:'2026-11-03',principal:'',value:'',importKey:key,venue:'테스트 지갑',holdingStatus:status,reason:'가상 테스트 자료'});const file={format:'secret-assets-v1',assets:[make('spot','KRW-SOL','2'),make('stake','KRW-SOL','3','스테이킹'),make('liquid','CG:staked-ether','4.1234567891234567','유동 스테이킹'),make('unlisted','CG:elizaos','1000.12345678','상장폐지 표시')]};const upload=async()=>p.locator('#asset-import-file').setInputFiles({name:'synthetic-assets.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});
 await p.goto(SITE);await p.locator('#cloud-login-form [name=email]').fill('a@example.test');await p.locator('#cloud-login-form [name=password]').fill('mock-password');await p.locator('#cloud-login-form button').click();await p.locator('[data-life-overview]').waitFor();await p.locator('[data-page=money]').first().click();await upload();await p.locator('#asset-import-form').waitFor();assert.equal(documents.get('A')?.payload?.investments?.length||0,0);await p.locator('[data-asset-import-value="2"]').filter({hasText:'CoinGecko'}).waitFor();assert((await p.locator('.asset-import-row').nth(2).innerText()).includes('4.1234567891234567 STETH'));await p.locator('#asset-import-form button.primary').click();await saved();let rows=documents.get('A').payload.investments;assert.equal(rows.length,4);assert.equal(rows.find(a=>a.importKey==='liquid').quantity,'4.1234567891234567');assert.equal(rows.filter(a=>a.market==='KRW-SOL').length,2);const ids=rows.map(a=>a.id).sort();await upload();await p.locator('#asset-import-form button.primary').click();await saved();rows=documents.get('A').payload.investments;assert.equal(rows.length,4);assert.deepEqual(rows.map(a=>a.id).sort(),ids);const result=await p.evaluate(assets=>SecretAssets.portfolio(assets,SecretMarket.snapshot(),'2026-11-04'),rows);assert.equal(result.known,4);assert(Math.abs(result.total-(500000+4.1234567891234567*2000000+1000.12345678*.25))<.001);assert.equal(rows.find(a=>a.importKey==='liquid').value,'');
 const steth=p.locator('.asset-row').filter({hasText:'가상 보유분 liquid'});await steth.getByRole('button',{name:'편집',exact:true}).click();assert.equal(await p.locator('#asset-form [name=assetUnit]').inputValue(),'STETH');await p.locator('#asset-form [name=market]').selectOption('CG:elizaos');assert.equal(await p.locator('#asset-form [name=assetUnit]').inputValue(),'ELIZAOS');await p.locator('#modal [data-action=close]').last().click();cgFail=true;const version=documents.get('A').version;await p.locator('[data-action=asset-refresh]').click();await p.locator('[data-assets-panel] .error').filter({hasText:'coingecko'}).waitFor();const mixed=await p.evaluate(assets=>SecretAssets.portfolio(assets,SecretMarket.snapshot(),'2026-11-04'),rows);assert.equal(mixed.stale,2);assert.equal(mixed.live,2);assert.equal(documents.get('A').version,version);assert(external.every(u=>!decodeURIComponent(u).includes('테스트 지갑')&&!u.includes('4.123456789')&&!u.includes('1000.12345678')));await p.reload();await p.locator('.asset-row').first().waitFor();assert.equal(documents.get('A').payload.investments.length,4);await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await upload();await p.locator('#asset-import-form').waitFor();await p.evaluate(()=>document.dispatchEvent(new Event('haru:account')));assert.equal(await p.locator('#modal').evaluate(el=>el.open),false);assert.equal(documents.get('A').payload.investments.length,4);assert.deepEqual(errors,[]);await browser.close();console.log('PASS: private file preview/import, repeat dedup, exact quantities, separate SOL staking, stETH/ELIZAOS independent reference prices, live units, source-specific stale cache without writes, privacy and mobile.');
})().catch(e=>{console.error(e);process.exit(1)});
