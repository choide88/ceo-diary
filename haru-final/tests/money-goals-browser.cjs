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


 await p.goto(SITE);await p.locator('#cloud-login-form [name=email]').fill('a@example.test');await p.locator('#cloud-login-form [name=password]').fill('mock-password');await p.locator('#cloud-login-form button').click();await p.locator('#quickForm').waitFor();const saved=()=>p.locator('#cloud-status').filter({hasText:'서버 저장 완료'}).waitFor();
 await p.locator('[data-page=money]').first().click();await p.getByRole('button',{name:'비상자금부터',exact:true}).click();await p.getByLabel('목표 이름').fill('비상자금 <안심>');await p.getByLabel('목표 금액 (원)').fill('8000000');await p.getByLabel('목표 날짜').fill('2027-04-04');await p.getByLabel('현재 확보액 (원)').fill('3000000');await p.locator('#moneyGoalForm button.primary').click();await saved();let plan=JSON.parse(documents.get('A').payload.profile.moneyPlan);const goal=plan.goals[0];assert.equal(goal.kind,'reserve');assert((await p.locator('#app').innerText()).includes('월 약 ₩ 1,000,000'));
 await p.locator(`[data-action=money-goal-update][data-id="${goal.id}"]`).click();await p.getByLabel('현재 확보액 (원)').fill('4000000');await p.getByLabel('이번 점검에서 기억할 것').fill('실제로 옮긴 금액 확인');await p.locator('#moneyCheckForm button.primary').click();await saved();plan=JSON.parse(documents.get('A').payload.profile.moneyPlan);assert.equal(plan.goals[0].history.length,1);assert.equal(plan.goals[0].history[0].current,4000000);
 await p.reload();await p.locator('[data-page=money]').first().waitFor();await p.locator('[data-page=money]').first().click();assert((await p.locator('#app').innerText()).includes('비상자금 <안심>'));assert((await p.locator('#app').innerText()).includes('50%'));await p.locator('[data-page=home]').first().click();await p.getByText('나의 자금 목표',{exact:true}).waitFor();assert((await p.locator('#app').innerText()).includes('50%'));
 await p.locator('[data-page=money]').first().click();await p.locator(`[data-action=money-goal-edit][data-id="${goal.id}"]`).click();await p.getByLabel('목표 금액 (원)').fill('10000000');await p.locator('#moneyGoalForm button.primary').click();await saved();plan=JSON.parse(documents.get('A').payload.profile.moneyPlan);assert.equal(plan.goals[0].history[0].target,8000000);await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await p.locator(`[data-action=money-goal-edit][data-id="${goal.id}"]`).click();await p.getByRole('button',{name:'목표 삭제',exact:true}).click();await p.getByRole('button',{name:'목표 삭제하기',exact:true}).click();await saved();assert.equal(JSON.parse(documents.get('A').payload.profile.moneyPlan).goals.length,0);
 await p.setViewportSize({width:1440,height:1050});await p.getByRole('button',{name:'＋ 대출',exact:true}).click();await p.getByLabel('대출명').fill('목표 연동 대출');await p.getByLabel('남은 원금 (원)').fill('10000000');await p.getByLabel('연 금리 (%)').fill('5');await p.getByLabel('월 상환액 (원)').fill('200000');await p.locator('#entityForm button.primary').click();await saved();const loan=documents.get('A').payload.loans[0];await p.getByRole('button',{name:'대출 줄이기',exact:true}).click();await p.getByLabel('목표 이름').fill('원금 500만원 줄이기');await p.getByLabel('목표 금액 (원)').fill('5000000');await p.getByLabel('목표 날짜').fill('2027-04-04');assert.equal(await p.getByLabel('상환 시작 시점').inputValue(),'10000000');await p.locator('#moneyGoalForm button.primary').click();await saved();const loanGoal=JSON.parse(documents.get('A').payload.profile.moneyPlan).goals[0];await p.locator(`#app [data-action=edit][data-table=loans][data-id="${loan.id}"]`).click();await p.getByLabel('남은 원금 (원)').fill('8000000');await p.locator('#entityForm button.primary').click();await saved();assert((await p.locator('.money-goal').innerText()).includes('40%'));await p.locator(`[data-action=money-goal-update][data-id="${loanGoal.id}"]`).click();await p.getByRole('button',{name:'이 현황으로 점검 저장',exact:true}).click();await saved();assert.equal(JSON.parse(documents.get('A').payload.profile.moneyPlan).goals[0].history[0].current,2000000);await p.locator(`#app [data-action=edit][data-table=loans][data-id="${loan.id}"]`).click();await p.locator('#modal').getByRole('button',{name:'삭제',exact:true}).click();await p.getByRole('button',{name:'삭제하기',exact:true}).click();await saved();assert((await p.locator('.money-goal').innerText()).includes('연결한 기록이 삭제되었습니다'));assert(!(await p.locator('.money-goal').innerText()).includes('100%'));
assert.deepEqual(errors,[]);await browser.close();console.log('PASS: goal creation, real balance checkpoint, server persistence, historical target, home summary, escaping, mobile, deletion, live debt progress, linked snapshot, missing source.');
})().catch(e=>{console.error(e);process.exit(1)});
