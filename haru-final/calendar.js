/* Google Identity Services token model; read-only Calendar API. Tokens stay in memory. */
(() => {
  'use strict';
  const SCOPES = ['https://www.googleapis.com/auth/calendar.events.readonly', 'https://www.googleapis.com/auth/calendar.calendarlist.readonly'];
  const API = 'https://www.googleapis.com/calendar/v3/';
  const DEMO = new URLSearchParams(location.search).get('demo') === '1';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dayOf = date => new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul'}).format(date);
  const dateNow = () => dayOf(new Date());
  const shift = (day,n) => { const d=new Date(day+'T12:00:00+09:00');d.setUTCDate(d.getUTCDate()+n);return dayOf(d); };
  const monday = () => {const day=dateNow();return shift(day,-((new Date(day+'T12:00:00+09:00').getUTCDay()+6)%7));};
  const clock = value => new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
  const clientValid = value => /^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(value || '');
  let bridge, account=null, token='', expires=0, phase='disconnected', errorText='', epoch=0;
  let calendars=[], events=[], warnings=[], lastSync='', range='week', sdkPromise=null, sdkReady=false, expiryTimer=null;
  let controllers=new Set(), configuredClient='', activeClient='', selected=[], roles={}, connecting=false;
  const action = (text,act,data={},cls='quiet') => `<button type="button" class="${cls}" data-gcal="${act}" ${act==='connect'&&connecting?'disabled':''} ${Object.entries(data).map(([k,v])=>`data-${k}="${escape(v)}"`).join(' ')}>${escape(text)}</button>`;
  function prefs(){const p=bridge?.preferences()||{};return {clientId:typeof p.clientId==='string'?p.clientId:'',selectedIds:Array.isArray(p.selectedIds)?p.selectedIds.filter(v=>typeof v==='string'):null,roles:p.roles&&typeof p.roles==='object'?p.roles:{}};}
  function configured(){return prefs().clientId || window.HARU_CLOUD_CONFIG?.googleClientId || '';}
  function bounds(){const start=range==='today'?dateNow():shift(monday(),range==='next'?7:0);return {start,end:shift(start,range==='today'?1:7)};}
  function cancelRequests(){for(const ctrl of controllers)ctrl.abort();controllers.clear();}
  function reset(){++epoch;cancelRequests();clearTimeout(expiryTimer);token='';expires=0;calendars=[];events=[];warnings=[];lastSync='';errorText='';phase='disconnected';connecting=false;activeClient='';selected=[];roles={};}
  function current(){return !!bridge?.ready() && bridge.account()===account;}
  function live(){return current()&&token&&expires>Date.now();}
  function expired(){++epoch;cancelRequests();clearTimeout(expiryTimer);token='';events=[];phase='expired';errorText='Google 연결 시간이 만료되었습니다. 다시 연결하면 일정을 불러올 수 있어요.';paint();}
  function canRecord(event){return Number.isFinite(event.endMs)&&event.endMs<=Date.now();}
  function eventKey(event){return event.icalUID?JSON.stringify(['ical',event.icalUID,event.occurrence]):JSON.stringify([event.calendarId,event.id]);}
  function normalized(event,cal){
    if(!event||typeof event.id!=='string'||event.status==='cancelled')return null;
    const allDay=!!event.start?.date;
    const start=allDay?event.start?.date:event.start?.dateTime;
    const end=allDay?event.end?.date:event.end?.dateTime;
    if(typeof start!=='string'||typeof end!=='string')return null;
    if(allDay&&(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)))return null;
    const startMs=Date.parse(allDay?start+'T00:00:00+09:00':start),endMs=Date.parse(allDay?end+'T00:00:00+09:00':end);
    if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||endMs<=startMs)return null;
    return {id:event.id,calendarId:cal.id,calendarName:cal.summary||'캘린더',title:typeof event.summary==='string'?event.summary:'제목 없는 일정',start,end,startMs,endMs,allDay,day:allDay?start:dayOf(new Date(start)),minutes:allDay?'':String(Math.round((endMs-startMs)/60000)),icalUID:typeof event.iCalUID==='string'?event.iCalUID:'',occurrence:event.originalStartTime?.dateTime||event.originalStartTime?.date||'',location:typeof event.location==='string'?event.location:''};
  }
  async function api(path,params,ticket){
    if(!live())throw Object.assign(new Error('Google 연결이 만료되었습니다.'),{kind:'expired'});
    const ctrl=new AbortController();controllers.add(ctrl);const timeout=setTimeout(()=>ctrl.abort(),15000);
    try{
      const response=await fetch(API+path+'?'+new URLSearchParams(params),{headers:{Authorization:'Bearer '+token},credentials:'omit',redirect:'error',signal:ctrl.signal});
      if(ticket!==epoch)throw Object.assign(new Error('연결이 바뀌었습니다.'),{kind:'stale'});
      if(response.status===401)throw Object.assign(new Error('Google 연결이 만료되었습니다. 다시 연결해주세요.'),{kind:'expired'});
      if(response.status===403)throw new Error('Calendar API 활성화와 읽기 권한을 확인해주세요. 일부 공유 캘린더는 접근이 제한될 수 있습니다.');
      if(response.status===429)throw new Error('Google 요청 한도에 도달했습니다. 잠시 후 새로고침해주세요.');
      if(!response.ok)throw new Error('Google 일정을 불러오지 못했습니다. 연결 후 다시 시도해주세요.');
      const data=await response.json();if(!Array.isArray(data.items))throw new Error('Google 응답 형식을 확인할 수 없습니다.');return data;
    }catch(e){if(ctrl.signal.aborted)throw new Error('일정 요청이 취소되었거나 연결 시간이 초과됐습니다.');throw e;}
    finally{clearTimeout(timeout);controllers.delete(ctrl);}
  }
  async function paged(path,params,ticket){let rows=[],next='',seen=new Set();for(let i=0;i<20;i++){
    const data=await api(path,{...params,...(next?{pageToken:next}:{})},ticket);rows.push(...data.items);
    if(!data.nextPageToken)return rows;
    if(seen.has(data.nextPageToken))throw new Error('Google 일정 페이지가 반복되어 불러오기를 중지했습니다.');
    next=data.nextPageToken;seen.add(next);
  }throw new Error('일정이 너무 많습니다. 오늘 보기나 적은 수의 캘린더를 선택해주세요.');}
  async function fetchEvents(){if(!live()){if(token)expired();return;}
    const ticket=++epoch;cancelRequests();phase='loading';errorText='';warnings=[];paint();
    const {start,end}=bounds(),chosen=calendars.filter(c=>selected.includes(c.id)),results=[];
    if(!chosen.length){events=[];phase='ready';paint();return;}
    // Bounded parallelism avoids sending a request burst for large calendar lists.
    let index=0;const worker=async()=>{while(index<chosen.length){if(ticket!==epoch||!current())return;const cal=chosen[index++];try{
      const rows=await paged('calendars/'+encodeURIComponent(cal.id)+'/events',{timeMin:start+'T00:00:00+09:00',timeMax:end+'T00:00:00+09:00',singleEvents:'true',orderBy:'startTime',maxResults:'250',showDeleted:'false',timeZone:'Asia/Seoul',fields:'items(id,iCalUID,summary,start,end,status,originalStartTime,location),nextPageToken'},ticket);
      results.push({cal,rows});
    }catch(error){results.push({cal,error});}}};
    await Promise.all(Array.from({length:Math.min(3,chosen.length)},worker));
    if(ticket!==epoch||!current())return;
    if(results.some(r=>r.error?.kind==='expired')){expired();return;}
    events=results.filter(r=>!r.error).sort((a,b)=>chosen.indexOf(a.cal)-chosen.indexOf(b.cal)).flatMap(r=>r.rows.map(e=>normalized(e,r.cal)).filter(Boolean));
    const distinct=new Map();for(const event of events)if(!distinct.has(eventKey(event)))distinct.set(eventKey(event),event);
    events=[...distinct.values()].sort((a,b)=>a.startMs-b.startMs||a.title.localeCompare(b.title));
    warnings=results.filter(r=>r.error).map(r=>(r.cal.summary||'캘린더')+': '+r.error.message);
    if(results.every(r=>r.error)){phase='error';errorText=warnings[0]||'일정을 불러오지 못했습니다.';}
    else{phase='ready';lastSync=new Date().toISOString();}
    paint();
  }
  async function fetchCalendars(ticket){
    try{
      const rows=await paged('users/me/calendarList',{maxResults:'250',minAccessRole:'reader',showHidden:'false',fields:'items(id,summary,primary,accessRole),nextPageToken'},ticket);
      if(ticket!==epoch||!current())return;
      calendars=[...new Map(rows.filter(c=>typeof c.id==='string'&&c.accessRole!=='freeBusyReader').map(c=>[c.id,c])).values()];
      const p=prefs();roles=p.roles;selected=p.selectedIds===null?[calendars.find(c=>c.primary)?.id||calendars[0]?.id].filter(Boolean):p.selectedIds.filter(id=>calendars.some(c=>c.id===id));
      phase='ready';await fetchEvents();
    }catch(e){if(ticket!==epoch||!current())return;if(e.kind==='expired'){expired();return;}phase='error';errorText=e.message;paint();}
  }
  function loadSdk(){
    if(window.google?.accounts?.oauth2){sdkReady=true;return Promise.resolve();}
    if(sdkPromise)return sdkPromise;
    sdkPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.dataset.haruGoogle='true';
      const timeout=setTimeout(()=>{script.remove();reject(new Error('Google 연결 창을 준비하지 못했습니다. 네트워크를 확인해주세요.'));},15000);
      script.onload=()=>{clearTimeout(timeout);if(window.google?.accounts?.oauth2){sdkReady=true;resolve();}else reject(new Error('Google 로그인 도구를 사용할 수 없습니다.'));};
      script.onerror=()=>{clearTimeout(timeout);script.remove();reject(new Error('Google 연결 도구를 불러오지 못했습니다. 네트워크나 차단 확장 프로그램을 확인해주세요.'));};
      document.head.append(script);
    }).catch(e=>{sdkPromise=null;throw e;});return sdkPromise;
  }
  function prepareSdk(){if(DEMO||!clientValid(configured())||sdkReady)return;void loadSdk().then(()=>{if(current())paint();}).catch(e=>{if(current()){errorText=e.message;paint();}});}
  function connect(){
    if(!current()||DEMO||connecting)return;
    const clientId=configured();if(!clientValid(clientId)){settings();return;}
    if(!sdkReady){errorText='Google 연결 도구를 준비하고 있습니다. 준비되면 연결 버튼을 다시 눌러주세요.';prepareSdk();paint();return;}
    reset();phase='authorizing';connecting=true;activeClient=clientId;
    const ticket=epoch,owner=account;paint();
    const oauth=window.google.accounts.oauth2.initTokenClient({client_id:clientId,scope:SCOPES.join(' '),include_granted_scopes:false,
      callback:response=>{
        if(ticket!==epoch||owner!==account||!current())return;connecting=false;
        const granted=new Set(String(response.scope||'').split(' '));
        if(response.error||!response.access_token||!SCOPES.every(s=>granted.has(s))){phase='disconnected';errorText='일정과 캘린더 목록의 읽기 권한이 필요합니다. 동의하지 않은 항목을 확인해주세요.';paint();return;}
        const lifetime=Number(response.expires_in);if(!Number.isFinite(lifetime)||lifetime<=0){phase='disconnected';errorText='연결 유효 시간을 확인할 수 없습니다. 다시 연결해주세요.';paint();return;}
        token=response.access_token;expires=Date.now()+lifetime*1000;expiryTimer=setTimeout(expired,Math.min(lifetime*1000,2147483647));
        phase='loading';paint();void fetchCalendars(ticket);
      },error_callback:e=>{if(ticket!==epoch)return;connecting=false;phase='disconnected';errorText=e.type==='popup_closed'?'연결 창을 닫았습니다. 원할 때 다시 연결하세요.':'Google 연결 창을 열지 못했습니다. 팝업 차단을 확인해주세요.';paint();}
    });
    try{oauth.requestAccessToken({prompt:'select_account'});}catch{connecting=false;phase='disconnected';errorText='연결 창을 열지 못했습니다. 다시 눌러주세요.';paint();}
  }
  function modal(title,html){let el=document.querySelector('#calendar-dialog');if(!el){el=document.createElement('dialog');el.id='calendar-dialog';el.setAttribute('aria-labelledby','calendar-dialog-title');document.body.append(el);}el.innerHTML=action('×','close',{},'close')+`<h2 id="calendar-dialog-title">${escape(title)}</h2>`+html;if(!el.open)el.showModal();}
  function close(){document.querySelector('#calendar-dialog')?.close();}
  function settings(){
    if(!current())return;
    const p=prefs(),clientId=configured();
    modal('Google Calendar 연결 설정',`<p class="intro">Supabase 로그인은 그대로 사용합니다. Google에서는 일정과 캘린더 목록 읽기 권한만 요청합니다.</p><details ${!clientValid(clientId)?'open':''}><summary>처음 연결할 때 · Google 설정 안내</summary><ol class="calendar-setup"><li><a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer">Google Cloud Console</a>에서 프로젝트를 선택하거나 만듭니다.</li><li>API 및 서비스 → 라이브러리에서 <b>Google Calendar API</b>를 사용 설정합니다.</li><li>Google Auth Platform에서 앱 정보·대상(External)·테스트 사용자(본인 Google 이메일)를 설정합니다.</li><li>클라이언트 → 웹 애플리케이션을 만들고 승인된 JavaScript 출처에 <b>${escape(location.origin)}</b>를 입력합니다. 경로는 넣지 않습니다.</li><li>발급된 공개 클라이언트 ID만 아래에 붙여넣습니다. Client secret은 필요 없습니다.</li></ol><p class="muted">처음에는 본인 테스트 계정으로 사용합니다. 최신 화면 명칭은 Google 콘솔에서 다를 수 있습니다.</p></details><form id="calendar-settings-form"><label class="form-field">Google OAuth 클라이언트 ID<input name="clientId" required autocomplete="off" placeholder="123456789-….apps.googleusercontent.com" value="${escape(clientId)}"></label>${calendars.length?`<h3>표시할 캘린더와 활동 분류</h3><p class="muted">선택한 캘린더만 불러옵니다. 분류는 실제 시간 기록을 확인할 때 기본값으로 사용합니다.</p>${calendars.map((cal,i)=>`<div class="calendar-preference"><label class="check"><input type="checkbox" name="selected" value="${escape(cal.id)}" ${selected.includes(cal.id)?'checked':''}><span>${escape(cal.summary||'캘린더')}${cal.primary?' · 기본':''}</span></label><label class="form-field"><span class="muted">기본 활동</span><select name="role-${i}"><option value="">미지정</option>${bridge.roles().map(r=>`<option value="${escape(r.id)}" ${(p.roles[cal.id]||roles[cal.id])===r.id?'selected':''}>${escape(r.name)}</option>`).join('')}</select></label></div>`).join('')}`:''}<p id="calendar-settings-error" class="error" role="alert"></p><div class="form-actions">${action('취소','close')}<button class="primary">연결 설정 저장</button></div></form><p class="muted">공개 클라이언트 ID와 선택만 계정에 저장합니다. Google 접근 토큰은 서버·파일·브라우저 저장소에 보관하지 않습니다.</p>`);
  }
  function importEvent(key){
    const event=events.find(e=>eventKey(e)===key);if(!event||!live()||!canRecord(event))return;
    const existing=bridge.imported(key);if(existing){bridge.openLog(existing.id);return;}
    const duration=Number(event.minutes);const minutes=!event.allDay&&duration>0&&duration<=1440?String(duration):'';
    modal('예정된 시간을 실제 기록으로 확인',`<p class="intro"><b>${escape(event.title)}</b><br>${escape(event.calendarName)} · ${escape(event.day)}${event.allDay?' · 종일 일정':` · ${clock(event.start)} ~ ${clock(event.end)}`}</p><div class="notice">${event.allDay?'종일 일정은 시간을 자동 계산하지 않습니다. 실제 사용한 분을 입력해주세요.':'일정 길이를 참고값으로 채웠습니다. 실제로 사용한 시간과 날짜를 확인한 뒤 저장해주세요.'}</div><form id="calendar-import-form" data-key="${escape(key)}"><label class="form-field">기록 제목<input name="title" value="${escape(event.title.slice(0,120))}" maxlength="120" required></label><label class="form-field">실제로 활동한 날짜<input type="date" name="date" value="${event.day}" max="${dateNow()}" required></label><label class="form-field">실제 사용 시간 (분)<input type="number" name="minutes" min="1" max="1440" step="1" value="${minutes}" required></label><label class="form-field">활동<select name="role"><option value="">미지정 · 개인</option>${bridge.roles().map(r=>`<option value="${escape(r.id)}" ${roles[event.calendarId]===r.id?'selected':''}>${escape(r.name)}</option>`).join('')}</select></label><label class="form-field">한 줄 메모 · 선택<textarea name="note" placeholder="예정과 달랐던 점이나 기억할 것"></textarea></label><p class="error" id="calendar-import-error" role="alert"></p><div class="form-actions">${action('취소','close')}<button class="primary">확인하고 실제 시간 저장</button></div></form><p class="muted">원본 Google 일정은 수정하지 않습니다. 같은 일정은 중복으로 가져오지 않습니다.</p>`);
  }
  function disconnect(){const old=token;reset();phase='disconnected';paint();if(old&&window.google?.accounts?.oauth2){window.google.accounts.oauth2.revoke(old,()=>{});}close();bridge.toast('Google 연결을 해제했습니다. 확인해서 저장한 시간 기록은 유지됩니다.');}
  function eventHTML(event){const existing=bridge.imported(eventKey(event));return `<article class="calendar-event"><div class="calendar-event-time">${event.allDay?'종일':clock(event.start)}<small>${event.allDay?event.day.slice(5):clock(event.end)}</small></div><div class="calendar-event-info"><b>${escape(event.title)}</b><small>${escape(event.calendarName)}${event.location?' · '+escape(event.location):''}</small><span class="tone">예정${event.allDay?' · 시간 미계산':' · '+event.minutes+'분'}</span></div><div>${existing?action('기록됨 · 보기','import',{key:eventKey(event)},'linkbutton'):canRecord(event)?action(event.allDay?'사용 시간 입력':'실제 시간 확인','import',{key:eventKey(event)},'outline'):'<small class="muted">종료 후 확인</small>'}</div></article>`;}
  function content(full){
    const valid=clientValid(configured()),ready=live(),status=phase==='loading'?'일정 불러오는 중':ready?'읽기 전용 연결':phase==='expired'?'다시 연결 필요':'연결 전';
    let html=`<section class="card google-calendar"><div class="cardhead"><h2>Google Calendar</h2><span class="tone">${status}</span></div>`;
    if(DEMO)return html+'<p class="empty">예시 모드에서는 Google 계정에 연결하지 않습니다. 실제 계정에 로그인한 뒤 캘린더를 연결하세요.</p></section>';
    if(!ready){html+=`<p>일정을 다시 적지 않아도 돼요.<br>오늘과 이번 주의 Google 일정을 이곳에서 확인하세요.</p>${errorText?`<p class="error calendar-message">${escape(errorText)}</p>`:''}<div class="calendar-controls">${action(valid?(sdkReady?'Google Calendar 연결':'연결 도구 준비하기'):'처음 연결하기',valid?'connect':'settings',{},'primary')}${valid?action('연결 설정','settings'):''}</div><p class="muted">일정 조회만 허용합니다. 토큰이 만료되거나 새로고침하면 다시 연결이 필요할 수 있어요.</p>`;return html+'</section>';}
    html+=`<div class="calendar-controls">${full?['today','week','next'].map((r,i)=>action(['오늘','이번 주','다음 주'][i],'range',{range:r},'chip '+(r===range?'on':''))).join(''):'<small>오늘 일정 · 한국 시간 기준</small>'}${action('새로고침','refresh')}${action('캘린더 선택','settings')}${action('연결 해제','disconnect')}</div>`;
    if(errorText)html+=`<p class="error calendar-message">${escape(errorText)}</p>`;
    if(warnings.length)html+=`<div class="notice">일부 캘린더를 불러오지 못했습니다.<br>${warnings.map(escape).join('<br>')}</div>`;
    const chosen=full?events:events.filter(e=>e.startMs<Date.parse(shift(dateNow(),1)+'T00:00:00+09:00')&&e.endMs>Date.parse(dateNow()+'T00:00:00+09:00')).slice(0,5);
    if(!selected.length)html+='<p class="empty">표시할 캘린더를 선택해주세요.</p>';
    else if(phase==='loading')html+='<p class="empty">일정을 불러오고 있어요.</p>';
    else if(phase==='error')html+='<p class="empty">불러오기에 실패했습니다. 새로고침으로 다시 시도할 수 있어요.</p>';
    else if(!chosen.length)html+='<p class="empty">'+(full?'선택한 기간에':'오늘은')+' 표시할 일정이 없습니다.</p>';
    else{let day='';for(const event of chosen){const display=event.day<bounds().start?bounds().start:event.day;if(full&&display!==day){day=display;html+=`<h3 class="calendar-day-heading">${escape(day)}</h3>`;}html+=eventHTML(event);}}
    html+=`<div class="calendar-foot"><small>${lastSync?'마지막 조회 '+clock(lastSync):''} · 조회 기간 ${bounds().start} ~ ${shift(bounds().end,-1)}</small>${!full?'<button class="linkbutton" data-action="go" data-page="calendar">캘린더 전체 보기 ↗</button>':''}</div><details class="calendar-note"><summary>예정과 실제 시간은 어떻게 다른가요?</summary><p>캘린더는 계획입니다. 끝난 일정을 ‘실제 시간 확인’으로 검토한 뒤에만 시간 통계에 포함합니다. 드러커의 실제 시간 파악을 참고한 제품 구성입니다. 종일 일정을 24시간으로 계산하거나 미기록 시간을 낭비로 판단하지 않습니다.</p></details></section>`;return html;
  }
  function paint(){if(!bridge||!current())return;for(const el of document.querySelectorAll('[data-calendar-slot]'))el.innerHTML=content(el.dataset.calendarSlot==='full');}
  function mount(){if(!bridge)return;const id=bridge.ready()?bridge.account():null;if(id!==account){reset();account=id;document.querySelector('#calendar-dialog')?.close();}if(!id)return;
    const cid=configured();if(cid!==configuredClient){if(configuredClient&&activeClient&&cid!==activeClient)reset();configuredClient=cid;sdkReady=!!window.google?.accounts?.oauth2;}
    if(document.querySelector('[data-calendar-slot=home]')&&range==='next'){range='week';if(live()){void fetchEvents();prepareSdk();return;}}
    paint();prepareSdk();
  }
  function start(b){bridge=b;mount();}
  document.addEventListener('haru:account',()=>{reset();account=null;document.querySelector('#calendar-dialog')?.close();});
  document.addEventListener('click',e=>{const el=e.target.closest('[data-gcal]');if(!el||!current())return;const d=el.dataset;switch(d.gcal){case 'close':close();break;case 'settings':settings();break;case 'connect':connect();break;case 'refresh':if(live())void fetchEvents();else connect();break;case 'range':range=d.range;if(live())void fetchEvents();break;case 'import':importEvent(d.key);break;case 'disconnect':disconnect();break;}});
  document.addEventListener('submit',e=>{
    if(e.target.id==='calendar-settings-form'){e.preventDefault();if(!current())return;const f=new FormData(e.target),clientId=String(f.get('clientId')).trim();if(!clientValid(clientId)){document.querySelector('#calendar-settings-error').textContent='공개 클라이언트 ID는 숫자로 시작하고 .apps.googleusercontent.com으로 끝납니다.';return;}
      const ids=calendars.length?f.getAll('selected'):prefs().selectedIds;const map=Object.create(null);calendars.forEach((c,i)=>{map[c.id]=String(f.get('role-'+i)||'');});
      const settingsData={clientId,selectedIds:ids,roles:calendars.length?map:prefs().roles};
      const changed=clientId!==configured();if(!bridge.savePreferences(settingsData))return;
      selected=ids||selected;roles=settingsData.roles;if(changed)reset();close();mount();if(!changed&&live())void fetchEvents();
    }
    if(e.target.id==='calendar-import-form'){e.preventDefault();if(!live()){close();expired();return;}const event=events.find(v=>eventKey(v)===e.target.dataset.key);if(!event||!canRecord(event))return;const f=new FormData(e.target),minutes=Number(f.get('minutes')),title=String(f.get('title')||'').trim(),date=String(f.get('date'));
      if(!title||!Number.isInteger(minutes)||minutes<1||minutes>1440||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>dateNow()){document.querySelector('#calendar-import-error').textContent='실제 활동한 날짜와 1~1440분 사이의 시간을 확인해주세요.';return;}
      if(bridge.recordEvent({title,date,minutes:String(minutes),role:String(f.get('role')||''),note:String(f.get('note')||'').trim(),googleEventKey:eventKey(event),googleCalendarId:event.calendarId,googleEventId:event.id,googleOccurrence:event.occurrence,googleICalUID:event.icalUID,googlePlannedStart:event.start,googlePlannedEnd:event.end})){close();paint();}
    }
  });
  window.HaruCalendar=Object.freeze({start,mount});
})();
