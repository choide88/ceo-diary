/* Supabase Auth + private JSON document store. No third-party SDK or secret keys. */
(() => {
  'use strict';
  const config = window.HARU_CLOUD_CONFIG || {};
  const url = config.url || '';
  const DEMO = new URLSearchParams(location.search).get('demo') === '1';
  const project = new URL(url || location.origin).hostname;
  const keyStorage = 'haru-public-key:' + project;
  const sessionStorageKey = 'haru-session:' + project;
  let publicKey = config.publishableKey || '';
  try { publicKey ||= localStorage.getItem(keyStorage) || ''; } catch {}
  let bridge, session = null, user = null, refreshPromise = null;
  let phase = 'starting', notice = '', loaded = false, serverVersion = 0;
  let pending = null, sending = false, syncError = '', conflict = false, epoch = 0;
  let lastServerTime = '', polling = null, localRevision = 0;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const error = (code, message) => Object.assign(new Error(message), {code});
  const accountKey = () => 'haru-pending:' + project + ':' + user.id;
  const stable = value => Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
  const equal = (a,b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
  function publicKeyValid(key) {
    if (key.startsWith('sb_publishable_') && key.length > 20) return true;
    if (key.startsWith('sb_secret_')) return false;
    try { return JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role === 'anon'; }
    catch { return false; }
  }
  function repaint() {
    if (!loaded) bridge?.render();
    const status = document.querySelector('#cloud-status');
    if (status) {
      const label = !loaded ? (phase==='login'?'로그인 필요':phase==='config'?'연결 설정 필요':notice||'서버 연결 중') :
        conflict ? '다른 기기 변경 · 확인 필요' : syncError ? '서버 미저장 · 재시도 필요' : pending ? '서버 저장 중…' : serverVersion===0?'서버 연결됨 · 첫 저장 전':'서버 저장 완료';
      status.textContent = label;
      status.dataset.state = conflict || syncError ? 'error' : pending ? 'pending' : 'ready';
    }
    const account = document.querySelector('#cloud-account');
    if (account) { account.textContent = user ? '계정 · 동기화' : '로그인'; account.disabled = phase==='starting'; }
  }
  async function raw(path, options={}) {
    const ctrl = new AbortController(); const timeout = setTimeout(()=>ctrl.abort(),15000);
    try {
      const res = await fetch(url.replace(/\/$/,'') + path, {
        ...options, signal:ctrl.signal, credentials:'omit', redirect:'error',
        headers:{apikey:publicKey,'Content-Type':'application/json',...(options.headers||{})}
      });
      const body = await res.json().catch(()=>null);
      if (!res.ok) {
        const text = typeof body?.message==='string'?body.message:'';
        if (text.includes('HARU_CONFLICT')) throw error('CONFLICT','다른 기기에서 기록이 변경되었습니다.');
        if (text.includes('HARU_ACCESS_DENIED')) throw error('ACCESS','이 계정의 사용 권한이 아직 등록되지 않았습니다.');
        if (res.status===401) throw error('AUTH','로그인이 만료되었습니다. 다시 로그인해주세요.');
        if (res.status===403) throw error('ACCESS','데이터 접근이 거부되었습니다. 계정 권한을 확인해주세요.');
        if (res.status===404 || ['PGRST202','PGRST205','42P01'].includes(body?.code)) throw error('SCHEMA','서버 테이블 설정이 필요합니다. 설정 안내의 SQL을 먼저 실행해주세요.');
        if (path.startsWith('/auth/')) throw error('LOGIN','로그인하지 못했습니다. 이메일·비밀번호와 계정 확인 상태를 확인해주세요.');
        throw error('SERVER','서버 요청에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }
      return body;
    } catch (e) {
      if (typeof e.code==='string') throw e;
      throw error('NETWORK','서버에 연결하지 못했습니다. 변경 사항은 아직 서버에 저장되지 않았습니다.');
    } finally { clearTimeout(timeout); }
  }
  function keepSession(data) {
    if (!data?.access_token || !data.refresh_token || !data.user?.id) throw error('AUTH','로그인 정보를 확인할 수 없습니다.');
    session={access_token:data.access_token,refresh_token:data.refresh_token,expires:Date.now()+(data.expires_in||3600)*1000};
    user={id:data.user.id,email:data.user.email||''};
    try { sessionStorage.setItem(sessionStorageKey,data.refresh_token); } catch {}
  }
  async function refresh() {
    if (refreshPromise) return refreshPromise;
    const ticket=epoch;refreshPromise=(async()=>{
      if (!session?.refresh_token) throw error('AUTH','다시 로그인해주세요.');
      const data=await raw('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:session.refresh_token})});
      if(ticket!==epoch)throw error('STALE','계정이 변경되었습니다.');keepSession(data);
    })().finally(()=>{refreshPromise=null;});
    return refreshPromise;
  }
  async function request(path,options={},retry=true) {
    if (!session) throw error('AUTH','로그인이 필요합니다.');
    if (session.expires < Date.now()+30000) await refresh();
    try { return await raw(path,{...options,headers:{...(options.headers||{}),Authorization:'Bearer '+session.access_token}}); }
    catch(e) { if (e.code==='AUTH'&&retry) { await refresh();return request(path,options,false); } throw e; }
  }
  async function readRemote() {
    const member=await request('/rest/v1/haru_members?select=user_id&user_id=eq.'+encodeURIComponent(user.id));
    if (!Array.isArray(member)||!member.length) throw error('ACCESS','본인 계정의 사용 권한을 SQL로 먼저 등록해주세요.');
    const rows=await request('/rest/v1/haru_documents?select=payload,version,updated_at&user_id=eq.'+encodeURIComponent(user.id));
    if (!Array.isArray(rows)) throw error('SCHEMA','서버 응답 형식을 확인할 수 없습니다.');
    if (!rows.length) return {payload:bridge.defaults(),version:0,updated_at:''};
    const row=rows[0];
    if (!bridge.validate(row.payload)||!Number.isSafeInteger(Number(row.version))) throw error('DATA','서버 기록 형식이 맞지 않아 덮어쓰기를 중지했습니다.');
    return {payload:row.payload,version:Number(row.version),updated_at:row.updated_at};
  }
  function persistPending() {
    if (pending) localStorage.setItem(accountKey(),JSON.stringify(pending));
    else localStorage.removeItem(accountKey());
  }
  function readPending() {
    const raw=localStorage.getItem(accountKey());
    if (!raw) return null;
    const data=JSON.parse(raw);
    if (!bridge.validate(data.payload)||!Number.isSafeInteger(data.baseVersion)||data.baseVersion<0) throw error('LOCAL','기기의 미저장 기록을 읽지 못해 자동 교체를 중지했습니다.');
    return data;
  }
  async function connectAccount() {
    if(sending)return;
    const ticket=epoch;
    phase='loading';loaded=false;notice='서버 기록 불러오는 중';repaint();
    try {
      const remote=await readRemote(); if (ticket!==epoch) return;
      let local;
      try { local=readPending(); } catch(e) { throw e.code?e:error('LOCAL','기기 저장소를 읽지 못했습니다. 브라우저 저장 권한을 확인해주세요.'); }
      serverVersion=remote.version;lastServerTime=remote.updated_at;
      loaded=true;phase='ready';syncError='';conflict=false;
      if (local) {
        pending=local;bridge.setState(local.payload);
        if (remote.version===local.baseVersion) { repaint();await flush(); }
        else if (equal(remote.payload,local.payload)) {pending=null;persistPending();bridge.setState(remote.payload);repaint();}
        else {conflict=true;syncError='다른 기기의 변경과 기기 미저장 기록이 함께 있습니다.';repaint();}
      } else { pending=null;bridge.setState(remote.payload);repaint(); }
      clearInterval(polling);polling=setInterval(()=>{if(document.visibilityState==='visible')pull();},45000);
    } catch(e) { if(ticket!==epoch)return;phase='blocked';notice=e.message;loaded=false;repaint(); }
  }
  async function login(email,password) {
    const ticket=++epoch;phase='loading';notice='로그인 중';repaint();
    try { const data=await raw('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});
      if(ticket!==epoch)return;keepSession(data);await connectAccount();
    } catch(e) {if(ticket!==epoch)return;phase='login';notice=e.message;repaint();}
  }
  function commit(payload) {
    if (!loaded||conflict) {bridge.toast(conflict?'다른 기기와의 변경을 먼저 확인해주세요.':'로그인하고 서버 기록을 불러온 후 저장해주세요.');return false;}
    const next={payload:structuredClone(payload),baseVersion:serverVersion};
    try {localStorage.setItem(accountKey(),JSON.stringify(next));}catch{bridge.toast('기기 임시 저장에 실패했습니다. 변경을 적용하지 않았습니다.');return false;}
    pending=next;localRevision++;bridge.setState(payload);repaint();
    if (!syncError) void flush();
    return true;
  }
  async function flush() {
    if(sending||!pending||!loaded||conflict||syncError)return;
    sending=true;const ticket=epoch,revision=localRevision,snapshot=structuredClone(pending.payload),expected=serverVersion;
    repaint();
    try {
      const result=await request('/rest/v1/rpc/haru_save_document',{method:'POST',body:JSON.stringify({p_payload:snapshot,p_expected_version:expected})});
      if(ticket!==epoch)return;
      if(!Number.isSafeInteger(Number(result?.version))||Number(result.version)!==expected+1)throw error('SERVER','저장 결과를 확인하지 못했습니다. 다시 연결해 상태를 확인해주세요.');
      serverVersion=Number(result.version);lastServerTime=result.updated_at||'';
      if(revision===localRevision)pending=null;
      else pending={payload:pending.payload,baseVersion:serverVersion};
      try{persistPending();}catch{syncError='서버 응답은 받았지만 기기 임시 상태 정리에 실패했습니다. 다시 연결해 확인해주세요.';}
    } catch(e) {
      if(ticket!==epoch)return;
      if(e.code==='CONFLICT')conflict=true;
      syncError=e.message;
    } finally {
      if(ticket===epoch){sending=false;repaint();if(pending&&!syncError&&!conflict)void flush();}
    }
  }
  async function retry() {
    if(!user||sending)return;
    const ticket=epoch;
    try {
      const remote=await readRemote();if(ticket!==epoch)return;
      if(pending) {
        if(remote.version===pending.baseVersion){serverVersion=remote.version;syncError='';conflict=false;repaint();await flush();}
        else if(equal(remote.payload,pending.payload)){serverVersion=remote.version;lastServerTime=remote.updated_at;pending=null;persistPending();syncError='';conflict=false;bridge.setState(remote.payload);repaint();}
        else {conflict=true;syncError='다른 기기에 더 최근의 기록이 있습니다. 저장 방식을 선택해주세요.';repaint();accountPanel();}
      } else {serverVersion=remote.version;lastServerTime=remote.updated_at;syncError='';conflict=false;bridge.setState(remote.payload);repaint();}
    } catch(e){syncError=e.message;repaint();}
  }
  function hasUnsavedForm(){return [...document.querySelectorAll('#app form input,#app form textarea,#app form select')].some(el=>el.tagName==='SELECT'?[...el.options].some(o=>o.selected!==o.defaultSelected):(el.type==='checkbox'?el.checked!==el.defaultChecked:el.value!==el.defaultValue));}
  async function pull() {
    if(!loaded||pending||sending||document.querySelector('dialog[open]')||document.querySelector('#app form:focus-within')||hasUnsavedForm())return;
    const ticket=epoch,version=serverVersion,revision=localRevision;
    try {const head=await request('/rest/v1/haru_documents?select=version,updated_at&user_id=eq.'+encodeURIComponent(user.id));if(ticket!==epoch||!Array.isArray(head))return;if(!head.length||Number(head[0].version)===serverVersion)return;const remote=await readRemote();if(ticket!==epoch||pending||sending||version!==serverVersion||revision!==localRevision)return;
      if(remote.version!==serverVersion){serverVersion=remote.version;lastServerTime=remote.updated_at;bridge.setState(remote.payload);repaint();bridge.toast('다른 기기의 변경을 불러왔어요.');}
    }catch{/* Do not label an unsent edit as saved; explicit refresh reports connection errors. */}
  }
  function logout() {
    const token=session?.access_token;++epoch;clearInterval(polling);session=null;user=null;pending=null;loaded=false;sending=false;syncError='';conflict=false;
    try{sessionStorage.removeItem(sessionStorageKey);}catch{}
    bridge.setState(bridge.defaults());phase='login';notice='';repaint();
    if(token)raw('/auth/v1/logout?scope=local',{method:'POST',headers:{Authorization:'Bearer '+token}}).catch(()=>{});
  }
  function dialog(title,html) {
    let el=document.querySelector('#cloud-dialog');if(!el){el=document.createElement('dialog');el.id='cloud-dialog';el.setAttribute('aria-labelledby','cloud-dialog-title');document.body.append(el);}
    el.innerHTML='<button type="button" class="close" data-cloud="close" aria-label="닫기">×</button><h2 id="cloud-dialog-title">'+esc(title)+'</h2>'+html;
    if(!el.open)el.showModal();
  }
  function close(){document.querySelector('#cloud-dialog')?.close();}
  function exportPayload(payload,kind='unsaved') {
    const a=document.createElement('a'),u=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    a.href=u;a.download='haru-'+kind+'-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
  }
  function legacyState(){try{const state=JSON.parse(localStorage.getItem(bridge.legacyKey)||'null');return bridge.validate(state)?state:null;}catch{return null;}}
  function accountPanel() {
    if(!loaded){repaint();return;}
    dialog('계정과 서버 저장',`<p class="intro">${esc(user.email)}<br>서버 버전 ${serverVersion} · ${esc(lastServerTime?'최근 서버 저장 '+new Date(lastServerTime).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'아직 서버 기록 없음')}</p>${pending?'<div class="notice">이 기기에 서버 저장이 끝나지 않은 변경이 있습니다. 로그아웃해도 이 계정의 미저장 기록은 이 기기에 보관됩니다.</div>':''}${syncError?'<p class="error">'+esc(syncError)+'</p>':''}<div class="cloud-options"><button class="outline" data-cloud="retry">서버 상태 확인 · 재시도</button><button class="outline" data-cloud="export">현재 기록 백업</button>${conflict?'<button class="outline" data-cloud="remote-confirm">서버 기록으로 불러오기</button><button class="outline" data-cloud="local-confirm">내 변경으로 서버 교체</button>':''}${legacyState()?'<button class="outline" data-cloud="legacy">기존 브라우저 기록 가져오기</button>':''}<button class="quiet" data-cloud="logout">로그아웃</button></div>`);
  }
  async function chooseConflict(which,confirmed=false) {
    if(!confirmed){dialog('어떤 기록을 사용할까요?',`<p class="intro">${which==='remote'?'이 기기의 미저장 변경 대신 최신 서버 기록을 불러옵니다.':'현재 이 기기의 기록으로 서버 전체 기록을 교체합니다. 다른 기기의 변경을 잃을 수 있습니다.'} 필요하면 먼저 현재 기록을 백업해주세요.</p><div class="form-actions"><button class="outline" data-cloud="export">현재 기록 백업</button><button class="primary" data-cloud="${which==='remote'?'remote-apply':'local-apply'}">확인 후 적용</button></div>`);return;}
    const ticket=epoch;
    try {
      const remote=await readRemote();if(ticket!==epoch)return;
      if(which==='remote') {
        if(pending)localStorage.setItem(accountKey()+':recovery:'+Date.now(),JSON.stringify(pending));
        pending=null;persistPending();serverVersion=remote.version;lastServerTime=remote.updated_at;syncError='';conflict=false;bridge.setState(remote.payload);
      } else {
        if(!pending)return;serverVersion=remote.version;pending.baseVersion=remote.version;persistPending();syncError='';conflict=false;await flush();
      }
      close();repaint();
    }catch(e){syncError=e.message;repaint();}
  }
  function gateHTML() {
    if(phase==='config')return `<section class="card cloud-gate"><span class="eyebrow">CONNECT YOUR PRIVATE SPACE</span><h1>서버 연결을 준비해요</h1><p>프로젝트 주소는 연결했습니다. Supabase의 공개용 Publishable key가 필요합니다.</p><form id="cloud-config-form"><label class="form-field">Publishable key<input name="key" autocomplete="off" required placeholder="sb_publishable_…"></label><p class="muted">Secret key · service_role · 데이터베이스 비밀번호는 입력하지 마세요.</p><p class="error" role="alert">${esc(notice)}</p><div class="form-actions"><button class="primary">공개 키 설정</button></div></form><a href="?demo=1">예시 화면 둘러보기 ↗</a></section>`;
    if(phase==='login')return `<section class="card cloud-gate"><span class="eyebrow">YOUR PRIVATE SPACE</span><h1>나의 하루에 로그인</h1><p>같은 계정으로 로그인하면 다른 브라우저에서도 기록을 이어갈 수 있어요.</p><form id="cloud-login-form"><label class="form-field">이메일<input type="email" name="email" autocomplete="username" required></label><label class="form-field">비밀번호<input type="password" name="password" autocomplete="current-password" required></label><p class="error" role="alert">${esc(notice)}</p><div class="form-actions"><button class="primary">로그인</button></div></form><p class="muted">개인용 서비스입니다. Supabase에서 만든 본인 계정과 허용 목록을 사용합니다. 공개 회원가입은 제공하지 않습니다.</p><a href="?demo=1">예시 화면 둘러보기 ↗</a></section>`;
    return `<section class="card cloud-gate"><h1>${phase==='blocked'?'연결 설정을 확인해주세요':'나의 기록을 불러오는 중'}</h1><p>${esc(notice)}</p>${phase==='blocked'?'<div class="cloud-options"><button class="primary" data-cloud="reconnect">다시 연결</button><button class="quiet" data-cloud="logout">다른 계정으로 로그인</button></div><p class="muted">SQL 테이블과 본인 계정 허용 목록 설정이 필요할 수 있습니다. SUPABASE_SETUP.md를 확인해주세요.</p>':''}</section>`;
  }
  async function start(b) {
    bridge=b;
    if(DEMO)return;
    const controls=document.createElement('div');controls.className='cloud-controls';controls.innerHTML='<button id="cloud-status" class="cloud-status" data-cloud="account">연결 중</button><button id="cloud-account" class="quiet" data-cloud="account">로그인</button>';
    document.querySelector('.topbar')?.after(controls);
    const side=document.querySelector('.sidebar-bottom');if(side)side.childNodes.forEach(n=>{if(n.nodeType===Node.TEXT_NODE&&n.textContent.includes('브라우저'))n.textContent=' 내 계정의 서버에 저장';});
    const footer=document.querySelector('footer');if(footer)footer.textContent='개인 계정 서버 저장 · Google·금융 자동 연동 및 알림 없음 · 서버 미저장 상태에서는 기기를 옮기기 전 확인해주세요.';
    if(!publicKeyValid(publicKey)){phase='config';repaint();return;}
    let token='';try{token=sessionStorage.getItem(sessionStorageKey)||'';}catch{}
    if(!token){phase='login';repaint();return;}
    phase='loading';notice='로그인 확인 중';repaint();
    try{session={refresh_token:token,expires:0};await refresh();await connectAccount();}
    catch(e){phase='login';notice=e.message;repaint();}
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pull();});
  }
  document.addEventListener('click',e=>{
    const el=e.target.closest('[data-cloud]');if(!el)return;
    switch(el.dataset.cloud){
      case 'close':close();break;
      case 'account':accountPanel();break;
      case 'retry':close();void retry();break;
      case 'reconnect':if(user)void connectAccount();else {phase='login';repaint();}break;
      case 'logout':close();logout();break;
      case 'export':exportPayload(bridge.getState());break;
      case 'remote-confirm':void chooseConflict('remote');break;
      case 'local-confirm':void chooseConflict('local');break;
      case 'remote-apply':void chooseConflict('remote',true);break;
      case 'local-apply':void chooseConflict('local',true);break;
      case 'legacy':{const old=legacyState();if(!old)return;dialog('기존 브라우저 기록 가져오기',`<p class="intro">일기·점검 ${old.reviews.length}개, 자유 기록 ${old.notes.length}개, 목표 ${old.goals.length}개입니다. 현재 서버 기록 전체를 이 내용으로 교체합니다. 기존 브라우저 원본은 그대로 보관합니다.</p><div class="form-actions"><button class="outline" data-cloud="export">현재 기록 백업</button><button class="primary" data-cloud="legacy-apply">확인 후 가져오기</button></div>`);break;}
      case 'legacy-apply':{const old=legacyState();if(old&&commit(old)){close();bridge.toast('가져온 기록을 서버에 저장하는 중입니다.');}break;}
    }
  });
  document.addEventListener('submit',e=>{
    if(e.target.id==='cloud-config-form'){e.preventDefault();const key=e.target.key.value.trim();if(!publicKeyValid(key)){notice='웹용 Publishable key 또는 기존 anon 키만 사용할 수 있습니다.';repaint();return;}publicKey=key;try{localStorage.setItem(keyStorage,key);}catch{}phase='login';notice='';repaint();}
    if(e.target.id==='cloud-login-form'){e.preventDefault();const email=e.target.email.value.trim(),password=e.target.password.value;e.target.password.value='';void login(email,password);}
  });
  window.addEventListener('beforeunload',e=>{if(pending&&loaded){e.preventDefault();e.returnValue='';}});
  window.HaruSync=Object.freeze({start,commit,isLoaded:()=>loaded,isCloud:()=>!DEMO,gate:()=>!loaded,gateHTML,repaint,accountPanel});
})();
