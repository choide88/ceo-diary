const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const SITE=process.env.HARU_TEST_URL||'http://127.0.0.1:8021';
const CLOUD='https://syyfpdcylvumvyrlgezc.supabase.co';
const GOOGLE='https://www.googleapis.com/calendar/v3/';
const CLIENT='123456789-haru-test.apps.googleusercontent.com';
const scopes=['https://www.googleapis.com/auth/calendar.events.readonly','https://www.googleapis.com/auth/calendar.calendarlist.readonly'];
const calendarA='primary@example.test',calendarB='team+work@example.test';
(async()=>{
 setTimeout(()=>{console.error('test overall timeout');process.exit(1)},90000).unref();
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

 const writeCalls=[],eventStore=new Map(),taskStore=new Map();let conflict=false,writeFailure=0;
 const cal='primary@example.test';
 for(let i=0;i<8;i++)eventStore.set('job'+i,{id:'job'+i,etag:'"e'+i+'"',summary:'[알바] 기관 '+i+' (40)',description:'원본 설명',attendees:[{email:'preserved@example.test'}],start:{dateTime:'2026-11-04T09:00:00+09:00'},end:{dateTime:'2026-11-04T10:00:00+09:00'}});
 eventStore.set('repeat',{id:'repeat',etag:'"repeat"',summary:'반복 회의',recurringEventId:'master',originalStartTime:{dateTime:'2026-11-04T13:00:00+09:00'},start:{dateTime:'2026-11-04T13:00:00+09:00'},end:{dateTime:'2026-11-04T14:00:00+09:00'}});
 taskStore.set('t1',{id:'t1',etag:'"t1"',title:'기존 업무',status:'needsAction',notes:'원본 설명',due:'2026-11-04T00:00:00Z'});
 const reply=(route,status,data)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(data)});
 await context.route(GOOGLE+'**',async route=>{const r=route.request(),u=new URL(r.url()),method=r.method();if(method==='OPTIONS')return reply(route,200,{});if(u.pathname.endsWith('/users/me/calendarList'))return reply(route,200,{items:[{id:cal,summary:'KRP',primary:true,accessRole:'owner'},{id:'read',summary:'공유 읽기',accessRole:'reader'}]});const id=decodeURIComponent(u.pathname.split('/events/')[1]||'');if(method!=='GET'){writeCalls.push({kind:'event',method,id,params:Object.fromEntries(u.searchParams),body:r.postDataJSON(),headers:r.headers()});if(conflict)return reply(route,412,{});if(method==='DELETE'){assert.equal(r.headers()['if-match'],eventStore.get(id).etag);eventStore.delete(id);return route.fulfill({status:204,headers});}if(method==='POST'){const body=r.postDataJSON(),key='new'+writeCalls.length;eventStore.set(key,{...body,id:key,etag:'"new"'});return reply(route,200,eventStore.get(key));}if(method==='PATCH'){const original=eventStore.get(id);assert.equal(r.headers()['if-match'],original.etag);eventStore.set(id,{...original,...r.postDataJSON(),etag:'"changed"'});return reply(route,200,eventStore.get(id));}}if(id)return reply(route,eventStore.has(id)?200:404,eventStore.get(id)||{});if(u.pathname.includes('/calendars/read/'))return reply(route,200,{items:[]});return reply(route,200,{items:[...eventStore.values()]});});
 await context.route('https://tasks.googleapis.com/tasks/v1/**',async route=>{const r=route.request(),u=new URL(r.url()),method=r.method();if(method==='OPTIONS')return reply(route,200,{});if(u.pathname.endsWith('/users/@me/lists'))return reply(route,200,{items:[{id:'krp',title:'KRP'},{id:'cde',title:'CDE'}]});const id=decodeURIComponent(u.pathname.match(/\/lists\/[^/]+\/tasks\/([^/]+)$/)?.[1]||'');if(method!=='GET'){writeCalls.push({kind:'task',method,id,body:r.postDataJSON(),headers:r.headers()});if(writeFailure)return reply(route,writeFailure,{});if(method==='DELETE'){assert.equal(r.headers()['if-match'],taskStore.get(id).etag);taskStore.delete(id);return route.fulfill({status:204,headers});}if(method==='POST'){const body=r.postDataJSON(),key='nt'+writeCalls.length;taskStore.set(key,{...body,id:key,etag:'"nt"'});return reply(route,200,taskStore.get(key));}const original=taskStore.get(id);assert.equal(r.headers()['if-match'],original.etag);taskStore.set(id,{...original,...r.postDataJSON(),etag:'"tchanged"'});return reply(route,200,taskStore.get(id));}if(id)return reply(route,200,taskStore.get(id));return reply(route,200,{items:u.pathname.includes('/lists/krp/')?[...taskStore.values()]:[]});});


 await context.route('https://www.googleapis.com/books/v1/**',r=>r.fulfill({json:{items:[]}}));await context.route('https://openlibrary.org/**',r=>r.fulfill({json:{docs:[]}}));await context.route('https://itunes.apple.com/**',r=>r.fulfill({json:{results:[]}}));await context.route('https://ko.wikipedia.org/**',r=>r.fulfill({json:{query:{pages:{}}}}));
 await p.goto(SITE);const fixture=await p.evaluate(()=>defaults());
 fixture.profile.googleCalendar=JSON.stringify({clientId:CLIENT,enableTasks:true,taskListIds:['krp'],selectedIds:[cal],taskGoals:{krp:'launch'},taskRoles:{krp:'pwr'},roles:{[cal]:'invest'}});
 fixture.profile.noteCategories=JSON.stringify([{id:'memo',label:'메모',format:'memo'},{id:'book',label:'독서',format:'book'},{id:'movie',label:'영화',format:'movie'},{id:'culture',label:'감상',format:'culture'}]);
 const note=(id,title,category,date,status='완료')=>({id,title,category,date,status,role:'self',text:'',rating:'4'});
 fixture.notes=[note('b1','최근 책','book','2026-11-04'),note('b2','둘째 책','book','2026-11-02'),note('old','올해 먼저 읽은 책','book','2026-06-01'),note('m1','최근 영화','movie','2026-11-01'),{id:'memo',date:'2026-11-02',role:'',text:'한 줄 메모'},note('wish','보고 싶은 책','book','2026-11-03','보고 싶음'),note('future','미래 기록 제외','book','2026-11-05')];
 const goal=(id,title,role)=>({id,title,role,kind:'올해 목표',why:'',outcome:'',target:'올해',obstacle:'',plan:''});fixture.goals=[goal('read','올해 책 12권','self'),goal('launch','PWR 출시','pwr'),goal('unknown','여행 꿈','self')];
 fixture.tasks=[{id:'t1',title:'이미 확인한 단계',goal:'launch',role:'pwr',date:'2026-11-04',done:true,googleTaskKey:JSON.stringify(['krp','t1']),googleSourceStatus:'needsAction'},{id:'t2',title:'다음 출시 단계',goal:'launch',role:'pwr',date:'2026-11-04',done:false}];
 fixture.timeLogs=[{id:'l1',title:'집중 작업',goal:'launch',role:'pwr',date:'2026-11-03',minutes:'90',note:''},{id:'l2',title:'본업 검토',goal:'',role:'invest',date:'2026-11-02',minutes:'60',note:''}];
 fixture.health=[{id:'h1',date:'2026-11-03',sleep:'7.5',weight:'',minutes:'20',mood:'괜찮아요',drink:'',memo:'',sleepStartLocal:'2026-11-02T23:30',sleepEndLocal:'2026-11-03T07:00'}];fixture.profile.sleepPlan=JSON.stringify({bed:'23:30',wake:'07:00'});
 fixture.incomes=[{id:'i1',title:'확정 알바',amount:'500000',date:'2026-11-02',role:'invest',done:false,stage:'earned'},{id:'i2',title:'예정 알바',amount:'700000',date:'2026-11-05',role:'invest',done:false,stage:'expected'}];
 fixture.people=[{id:'person',name:'친구 A',group:'친구',note:'',birthday:'11-10'}];fixture.moments=[{id:'contact',person:'person',title:'안부 전화',date:'2026-11-03',minutes:'10',note:'',kind:'contact'}];fixture.reviews=[{id:'diary',kind:'일간',period:'2026-11-03',result:'오늘의 장면',obstacle:'',next:'다음 시도',stop:'',experiment:'내일 걷기'}];documents.set('A',{payload:fixture,version:1,updated_at:'2026-11-04T03:00:00Z'});
 const saved=()=>p.locator('#cloud-status').filter({hasText:'서버 저장 완료'}).waitFor();await p.locator('#cloud-login-form [name=email]').fill('a@example.test');await p.locator('#cloud-login-form [name=password]').fill('mock-password');await p.locator('#cloud-login-form button').click();await p.locator('[data-dashboard=home]').waitFor();assert.deepEqual(await p.locator('#nav button').evaluateAll(bs=>bs.slice(0,4).map(b=>b.dataset.page)),['home','calendar','work','notes']);assert.equal(documents.get('A').version,1);
 const tab=async name=>{await p.locator('#nav [data-page='+name+']').click();await p.locator('[data-dashboard='+name+']').waitFor();};const value=async(label)=>p.locator('.dash-kpi').filter({has:p.locator('small').filter({hasText:label})}).locator('strong').innerText();
 await tab('notes');
 assert.equal(await value('기록을 남긴 날'),'4 / 30일');assert.equal(await value('최근 30일 기록'),'5건');assert.equal(await value('완료로 남긴 감상'),'3건');assert.equal(await value('최근 감상일'),'2026-11-04');assert.equal(await p.locator('.dash-heat').count(),28);await p.screenshot({path:'/tmp/secret-notes-dashboard-desktop.png',fullPage:false});
 await tab('goals');const blank=p.locator('.goalbox[data-goal-card=unknown]');assert.equal(await blank.locator('.goal-outcome').count(),0);await p.locator('.goalbox[data-goal-card=read] [data-action=goal-progress]').click();await p.locator('#goal-progress-form [name=progressSource]').selectOption('books');await p.locator('#goal-progress-form [name=progressTarget]').fill('12');await p.locator('.goal-progress-preview').filter({hasText:'3 / 12'}).waitFor();await p.locator('#goal-progress-form button.primary').click();await saved();assert.equal(documents.get('A').payload.goals[0].progressSource,'books');assert((await p.locator('.goalbox[data-goal-card=read] .goal-outcome').innerText()).includes('25%'));
 await p.locator('.goalbox[data-goal-card=launch] [data-action=goal-progress]').click();await p.locator('#goal-progress-form [name=progressSource]').selectOption('goalTime');await p.locator('#goal-progress-form [name=progressTarget]').fill('5');await p.locator('#goal-progress-form button.primary').click();await saved();assert((await p.locator('.goalbox[data-goal-card=launch] .goal-outcome').innerText()).includes('30%'));
 await tab('notes');await p.locator('[data-action=note-filter][data-category=book]').click();await p.getByRole('button',{name:'＋ 기록',exact:true}).last().click();await p.locator('#entityForm [name=title]').fill('새로 완료한 책');await p.locator('#entityForm button.primary').click();await saved();await tab('goals');assert((await p.locator('.goalbox[data-goal-card=read] .goal-outcome').innerText()).includes('33%'));await p.screenshot({path:'/tmp/secret-goals-dashboard-desktop.png',fullPage:false});
 await tab('home');assert.equal(await p.locator('[data-dashboard=home] .overview-tile').count(),4);assert.equal(await p.locator('.hero').count(),0);assert.equal(await p.locator('[data-method-note=home]').count(),0);await p.waitForFunction(()=>!!window.google?.accounts?.oauth2);await p.getByRole('button',{name:'Google Calendar 연결',exact:true}).click();await p.waitForFunction(()=>HaruCalendar.dashboardSnapshot().tasksAvailable);await p.locator('.google-home-summary').filter({hasText:'오늘 9개'}).waitFor();
 await tab('calendar');assert.equal(await value('조회 기간 일정'),'9개');assert.equal(await value('캘린더 예정 시간'),'2시간');await p.screenshot({path:'/tmp/secret-calendar-dashboard-desktop.png',fullPage:false});await tab('goals');assert.equal(await value('완료한 준비 단계'),'1 / 2');const version=documents.get('A').version;for(const name of ['home','calendar','work','notes','goals','money','relations','health','review']){await tab(name);assert.equal(await p.locator('[data-dashboard]').count(),1);assert(await p.locator('[data-dashboard]').evaluate(el=>el.closest('[data-tab-dashboard-slot]').previousElementSibling?.classList.contains('heading')));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}assert.equal(documents.get('A').version,version);await tab('money');assert.equal(await value('확정 추가 수입'),'₩ 500,000');assert.equal(await value('예정 추가 수입'),'₩ 700,000');
 await p.reload();await p.locator('[data-dashboard=money]').waitFor();await tab('goals');assert((await p.locator('.goalbox[data-goal-card=read] .goal-outcome').innerText()).includes('33%'));await p.setViewportSize({width:390,height:844});for(const name of ['home','calendar','work','notes','goals','money','relations','health','review']){await tab(name);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+name);}await tab('notes');await p.screenshot({path:'/tmp/secret-notes-dashboard-mobile.png',fullPage:true});await tab('goals');await p.screenshot({path:'/tmp/secret-goals-dashboard-mobile.png',fullPage:true});assert.deepEqual(errors,[]);assert.equal(writeCalls.length,0);await browser.close();console.log('PASS: home-first navigation, per-tab visual summaries, note-day/media boundaries, goal auto source configuration and live counts, actual time, Google dedup and live update, overlap-safe planned hours, financial stage separation, reload, no synthetic writes and all-tab desktop/mobile layouts.');
})().catch(e=>{console.error(e);process.exit(1)});
