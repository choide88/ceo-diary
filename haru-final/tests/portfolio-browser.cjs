const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const SITE=process.env.HARU_TEST_URL||'http://127.0.0.1:8021';
const CLOUD='https://syyfpdcylvumvyrlgezc.supabase.co';
const GOOGLE='https://www.googleapis.com/calendar/v3/';
const CLIENT='123456789-haru-test.apps.googleusercontent.com';
const scopes=['https://www.googleapis.com/auth/calendar.events.readonly','https://www.googleapis.com/auth/calendar.calendarlist.readonly'];
const calendarA='primary@example.test',calendarB='team+work@example.test';
(async()=>{setTimeout(()=>{console.error('overall timeout');process.exit(1)},150000).unref();
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



 const prices={'KRW-BTC':100000000};let fail=false;const external=[];const quoteTime=Date.parse('2026-11-04T03:00:00Z');
 await context.route('https://api.upbit.com/**',async r=>{external.push(r.request().url());assert.equal(r.request().method(),'GET');const u=new URL(r.request().url());if(fail)return r.fulfill({status:429,json:{error:{name:'too_many_requests'}}});if(u.pathname.endsWith('/market/all'))return r.fulfill({json:[{market:'KRW-BTC',korean_name:'비트코인'},{market:'KRW-ETH',korean_name:'이더리움'}]});return r.fulfill({json:u.searchParams.get('markets').split(',').map(m=>({market:m,trade_price:prices[m]||2000000,trade_timestamp:quoteTime,timestamp:quoteTime}))});});
 await context.route('https://api.frankfurter.dev/**',r=>{external.push(r.request().url());return r.fulfill({json:{amount:1,base:'USD',date:'2026-11-03',rates:{KRW:1500}}});});
 await p.goto(SITE);await p.locator('#cloud-login-form [name=email]').fill('a@example.test');await p.locator('#cloud-login-form [name=password]').fill('mock-password');await p.locator('#cloud-login-form button').click();await p.locator('[data-life-overview]').waitFor();const saved=()=>p.locator('#cloud-status').filter({hasText:'서버 저장 완료'}).waitFor();await p.locator('#nav [data-page=money]').click();
 const add=async(type,name,qty,price)=>{await p.getByRole('button',{name:'＋ 자산',exact:true}).click();await p.locator('#asset-form [name=assetType]').selectOption(type);if(name)await p.locator('#asset-form [name=name]').fill(name);if(qty!==undefined)await p.locator('#asset-form [name=quantity]').fill(qty);if(price!==undefined)await p.locator('#asset-form [name=unitPrice]').fill(price);};const saveAsset=async()=>{await p.locator('#asset-form button.primary').click();await saved();};
 await add('private-stock','비상장 테스트기업','100','20000');await p.locator('#asset-form details>summary').click();await p.locator('#asset-form [name=principal]').fill('1000000');await p.locator('#asset-form [name=dividendAnnual]').fill('120000');await p.locator('#asset-form [name=dividendAsOf]').fill('2026-11-04');await saveAsset();await add('private-fund','비상장 펀드','10','300000');await saveAsset();await add('crypto','','0.02');await p.locator('.asset-preview').filter({hasText:'2,000,000'}).waitFor();await saveAsset();await add('cash','','500000');await saveAsset();await add('cash','USD 현금','1000');await p.locator('#asset-form [name=currency]').selectOption('USD');await p.locator('.asset-preview').filter({hasText:'1,500,000'}).waitFor();await saveAsset();await add('private-stock','미평가 테스트기업','30');await saveAsset();await add('property','서울 집','1');await p.locator('#asset-form [name=location]').fill('서울 강남구');await saveAsset();
 assert.equal(documents.get('A').payload.investments.length,7);assert.equal(await p.evaluate(()=>assetPortfolio().total),9000000);assert.equal(await p.evaluate(()=>assetPortfolio().unknown),2);assert.equal(documents.get('A').payload.investments.find(a=>a.assetType==='crypto').value,'');assert(external.every(u=>!u.includes('quantity')&&!decodeURIComponent(u).includes('테스트기업')&&!u.includes('0.02')));
 const goalSave=async()=>{await p.locator('#moneyGoalForm button.primary').click();await saved();};await p.getByRole('button',{name:'＋ 자금 목표',exact:true}).click();await p.locator('#moneyGoalForm [name=title]').fill('최종 자산 목표');await p.locator('#moneyGoalForm [name=selection]').selectOption('portfolio:all');await p.locator('#moneyGoalForm [name=unit]').fill('억원');await p.locator('#moneyGoalForm [name=unit]').press('Tab');await p.locator('#moneyGoalForm [name=target]').fill('20');await goalSave();let goals=JSON.parse(documents.get('A').payload.profile.moneyPlan).goals,parent=goals[0];
 const child=async(title,source,target,unit)=>{await p.locator('[data-money-goal="'+parent.id+'"] [data-action=money-goal-new]').click();assert.equal(await p.locator('#moneyGoalForm [name=parent]').inputValue(),parent.id);await p.locator('#moneyGoalForm [name=title]').fill(title);await p.locator('#moneyGoalForm [name=selection]').selectOption(source);if(unit){await p.locator('#moneyGoalForm [name=unit]').fill(unit);await p.locator('#moneyGoalForm [name=unit]').press('Tab');}await p.locator('#moneyGoalForm [name=target]').fill(target);};
 await child('가상자산 10억원','category:crypto','10','억원');await goalSave();await child('서울 부동산 1채','propertyQuantity:property','1');await p.locator('#moneyGoalForm [name=location]').fill('서울');await goalSave();await child('월 환산 배당 100만원','dividend:all','100');await goalSave();goals=JSON.parse(documents.get('A').payload.profile.moneyPlan).goals;assert.equal(goals.filter(g=>g.parent===parent.id).length,3);const crypto=goals.find(g=>g.source==='category'),property=goals.find(g=>g.source==='propertyQuantity'),dividend=goals.find(g=>g.source==='dividend');assert((await p.locator('[data-money-goal="'+crypto.id+'"]').innerText()).includes('0.02 억원'));assert((await p.locator('[data-money-goal="'+property.id+'"]').innerText()).includes('100%'));assert((await p.locator('[data-money-goal="'+dividend.id+'"]').innerText()).includes('1 만원/월'));assert.equal(await p.locator('.money-goal-branch>.money-goal-branch').count(),3);await p.screenshot({path:'/tmp/secret-portfolio-desktop.png',fullPage:false});
 // An existing unit edit preserves the same amount; old checkpoints retain their own unit.
 await p.locator('[data-money-goal="'+crypto.id+'"] [data-action=money-goal-update]').click();await p.getByRole('button',{name:'이 현황으로 점검 저장',exact:true}).click();await saved();await p.locator('[data-money-goal="'+crypto.id+'"] [data-action=money-goal-edit]').click();await p.locator('#moneyGoalForm [name=unit]').fill('만원');await p.locator('#moneyGoalForm [name=unit]').press('Tab');assert.equal(await p.locator('#moneyGoalForm [name=target]').inputValue(),'100000');await goalSave();goals=JSON.parse(documents.get('A').payload.profile.moneyPlan).goals;assert.equal(goals.find(g=>g.id===crypto.id).history[0].unit,'억원');
 const version=documents.get('A').version;prices['KRW-BTC']=200000000;await p.locator('[data-action=asset-refresh]').click();await p.clock.runFor(11000);await p.waitForFunction(()=>assetPortfolio().total===11000000);assert.equal(documents.get('A').version,version);assert((await p.locator('[data-money-goal="'+crypto.id+'"]').innerText()).includes('400 만원'));
 // Public quote updates do not replace a form the user is typing into.
 await p.locator('[data-money-goal="'+parent.id+'"] [data-action=money-goal-edit]').click();await p.locator('#moneyGoalForm [name=title]').fill('작성 중 유지');await p.evaluate(()=>SecretMarket.ensure([{valuation:'crypto',market:'KRW-BTC'}],true));await p.clock.runFor(11000);assert.equal(await p.locator('#moneyGoalForm [name=title]').inputValue(),'작성 중 유지');await p.locator('#modal [data-action=close]').first().click();fail=true;await p.locator('[data-action=asset-refresh]').click();await p.clock.runFor(11000);await p.locator('.asset-status .error').first().waitFor();assert.equal(await p.evaluate(()=>assetPortfolio().total),11000000);assert(await p.evaluate(()=>assetPortfolio().stale>=1));
 await p.reload();await p.locator('[data-assets-panel]').waitFor();assert.equal(documents.get('A').payload.investments.length,7);assert.equal(JSON.parse(documents.get('A').payload.profile.moneyPlan).goals.length,4);await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:'/tmp/secret-portfolio-mobile.png',fullPage:true});assert.deepEqual(errors,[]);await browser.close();console.log('PASS: four asset classes, quantity/manual/public KRW and FX valuation, unknown exclusions, hierarchical multi-unit targets, property/dividend metrics, unit conversion and historical units, quote update without data writes/typing loss, rate-limit cache, privacy, reload and mobile.');
})().catch(e=>{console.error(e);process.exit(1)});
