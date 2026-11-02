/* Explicit Google original edits; receives a scoped transport, never credentials. */
(() => {
  'use strict';
  let generation=0;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  const shift=(date,n)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
  const local=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value)).replace(' ','T');
  const input=(name,label,value,type='text',attrs='')=>`<label class="form-field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
  const textarea=(name,label,value)=>`<label class="form-field">${label}<textarea name="${name}" maxlength="8000">${esc(value)}</textarea></label>`;
  const select=(name,label,value,options,disabled=false)=>`<label class="form-field">${label}<select name="${name}" ${disabled?'disabled':''}>${options.map(([id,title])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(title)}</option>`).join('')}</select></label>`;
  async function open(ctx,key){
    const serial=++generation,editing=!!key,kind=ctx.kind,item=ctx.item;
    const destinations=kind==='event'?ctx.calendars:ctx.lists;
    if(!destinations.length){ctx.modal('저장할 곳이 없어요','<p class="intro">편집 가능한 캘린더 또는 Google Tasks 목록이 필요합니다. Google에서 만든 뒤 새로고침해주세요.</p>');return;}
    const destination=editing?(kind==='event'?item.calendarId:item.listId):(destinations[0].id);
    if(!destinations.some(d=>d.id===destination)){ctx.modal('읽기 전용 캘린더','<p class="intro">이 캘린더에는 일정을 수정할 수 없습니다. 소유자에게 편집 권한을 요청해주세요.</p>');return;}
    const collection=id=>kind==='event'?'calendars/'+encodeURIComponent(id)+'/events':'lists/'+encodeURIComponent(id)+'/tasks';
    const path=collection(destination)+(editing?'/'+encodeURIComponent(item.id):'');
    ctx.modal(editing?'Google 원본 수정':'Google에 새로 추가',`<p class="intro" data-google-editor-loading="${serial}">최신 원본을 준비하고 있어요.</p>`);
    const loadingCurrent=()=>serial===generation&&ctx.current()&&document.querySelector('#calendar-dialog')?.open&&document.querySelector(`[data-google-editor-loading="${serial}"]`);
    let source={};
    try{if(editing)source=await ctx.request(path,'GET');}catch(error){if(loadingCurrent())ctx.modal('원본을 열지 못했어요',`<p class="error">${esc(error.message)}</p>`);return;}
    if(!loadingCurrent())return;
    if(editing&&!source.etag){ctx.modal('원본을 확인할 수 없어요','<p class="error">변경 버전을 확인하지 못해 편집을 중지했습니다. 새로고침한 뒤 다시 열어주세요.</p>');return;}
    const allDay=kind==='event'&&!!source.start?.date;
    const dayStart=allDay?source.start.date:ctx.today,dayEnd=allDay?shift(source.end.date,-1):ctx.today;
    let fields=select('destination',kind==='event'?'저장할 Google 캘린더':'저장할 Google Tasks 목록',destination,destinations.map(d=>[d.id,kind==='event'?d.summary||'캘린더':d.title||'할 일 목록']),editing)+input('title','제목',source.summary||source.title||'','text','required maxlength="1000"');
    if(kind==='event')fields+=`<label class="check"><input name="allDay" type="checkbox" ${allDay?'checked':''}><span>종일 일정</span></label><div class="google-time-fields" ${allDay?'hidden':''}>${input('start','시작 · 한국 시간',source.start?.dateTime?local(source.start.dateTime):ctx.today+'T09:00','datetime-local')}${input('end','종료 · 한국 시간',source.end?.dateTime?local(source.end.dateTime):ctx.today+'T10:00','datetime-local')}</div><div class="google-date-fields" ${allDay?'':'hidden'}>${input('dayStart','시작일',dayStart,'date')}${input('dayEnd','마지막 날 · 포함',dayEnd,'date')}</div>${input('location','장소 · 선택',source.location||'','text','maxlength="1000"')}${textarea('description','상세 메모 · 선택',source.description||'')}`;
    else fields+=input('due','기한 · 선택, 비우면 날짜 없음',source.due?.slice(0,10)||'','date')+select('status','완료 상태',source.status||'needsAction',[['needsAction','미완료'],['completed','완료']])+textarea('notes','상세 메모 · 선택',source.notes||'');
    ctx.modal(editing?'Google 원본 수정':'Google에 새로 추가',`<p class="intro">아래 저장 버튼을 누르면 <b>Google ${kind==='event'?'캘린더':'Tasks'} 원본에 ${editing?'수정':'추가'}</b>됩니다.${source.recurringEventId?' 반복 일정 중 선택한 이번 회차만 수정합니다.':''}</p><form id="google-original-form">${fields}<p class="muted">시크릿에 이미 확인한 실제 시간·수입·기록은 그대로 유지됩니다. 필요하면 따로 검토해주세요.</p><p id="google-write-error" class="error" role="alert"></p><div class="form-actions">${editing?'<button type="button" class="delete" id="google-delete-open">Google 원본 삭제</button>':''}<button type="button" data-gcal="close" class="quiet">취소</button><button class="primary">${editing?'Google 원본에 수정 저장':'Google에 추가'}</button></div></form>`);
    const form=document.querySelector('#google-original-form');
    form.addEventListener('change',e=>{if(e.target.name==='allDay'){form.querySelector('.google-time-fields').hidden=e.target.checked;form.querySelector('.google-date-fields').hidden=!e.target.checked;}});
    let busy=false,uncertain=false;
    form.querySelector('#google-delete-open')?.addEventListener('click',()=>{
      if(busy||uncertain||!ctx.current())return;
      // Keep the form mounted so the existing submit handler cannot save after choosing delete.
      const confirm=document.createElement('section');confirm.className='google-delete-confirm';
      confirm.innerHTML=`<h3>Google 원본을 삭제할까요?</h3><p><b>${esc(source.summary||source.title)}</b></p><p>${source.recurringEventId?'반복 일정 중 선택한 이번 회차만 삭제합니다.':'Google 원본에서 삭제됩니다.'}${kind==='task'?' 하위 할 일이 있으면 함께 삭제될 수 있습니다.':''} 시크릿에 이미 저장한 실제 시간·수입·기록은 유지됩니다.</p><p class="error" role="alert"></p><div class="form-actions"><button type="button" class="outline" data-delete-cancel>돌아가기</button><button type="button" class="delete" data-delete-confirm>Google에서 삭제하기</button></div>`;
      form.classList.add('google-delete-mode');Array.from(form.children).forEach(el=>el.hidden=true);form.append(confirm);
      confirm.querySelector('[data-delete-cancel]').onclick=()=>{if(uncertain){ctx.close();return;}form.classList.remove('google-delete-mode');confirm.remove();Array.from(form.children).forEach(el=>el.hidden=false);const toggle=form.elements.allDay;if(toggle){form.querySelector('.google-time-fields').hidden=toggle.checked;form.querySelector('.google-date-fields').hidden=!toggle.checked;}};
      confirm.querySelector('[data-delete-confirm]').onclick=async()=>{
        if(busy||uncertain||!ctx.current())return;busy=true;confirm.querySelectorAll('button').forEach(b=>b.disabled=true);
        const dialog=document.querySelector('#calendar-dialog'),closer=dialog.querySelector('.close'),prevent=e=>e.preventDefault();closer.disabled=true;dialog.addEventListener('cancel',prevent);
        try{await ctx.request(path+(kind==='event'?'?sendUpdates=none':''),'DELETE',null,source.etag);if(ctx.current()){ctx.close();ctx.toast('Google 원본을 삭제했어요. 저장한 시크릿 기록은 유지됩니다.');await ctx.saved(destination);}}
        catch(error){if(ctx.current()){confirm.querySelector('.error').textContent=error.message;uncertain=/결과|응답|저장 여부/.test(error.message);}}
        finally{busy=false;closer.disabled=false;dialog.removeEventListener('cancel',prevent);confirm.querySelectorAll('button').forEach(b=>b.disabled=false);if(uncertain){confirm.querySelector('[data-delete-confirm]').disabled=true;confirm.querySelector('[data-delete-cancel]').textContent='닫기';}}
      };
    });
    form.addEventListener('submit',async e=>{
      e.preventDefault();if(busy||uncertain||form.querySelector('.google-delete-confirm'))return;const errorEl=form.querySelector('#google-write-error');errorEl.textContent='';
      if(!ctx.current()){errorEl.textContent='연결이 바뀌었습니다. 다시 연결해주세요.';return;}
      const f=new FormData(form),title=String(f.get('title')||'').trim(),target=editing?destination:String(f.get('destination')||'');
      if(!title||!destinations.some(d=>d.id===target)){errorEl.textContent='제목과 저장할 곳을 확인해주세요.';return;}
      let body;
      if(kind==='event'){
        body={summary:title,location:String(f.get('location')||''),description:String(f.get('description')||'')};
        if(f.has('allDay')){const a=String(f.get('dayStart')),b=String(f.get('dayEnd'));if(!validDate(a)||!validDate(b)||a>b){errorEl.textContent='시작일과 마지막 날을 확인해주세요.';return;}body.start={date:a,dateTime:null,timeZone:null};body.end={date:shift(b,1),dateTime:null,timeZone:null};}
        else{const a=String(f.get('start')),b=String(f.get('end'));if(!validDate(a.slice(0,10))||!validDate(b.slice(0,10))||!Number.isFinite(Date.parse(a+'+09:00'))||Date.parse(a+'+09:00')>=Date.parse(b+'+09:00')){errorEl.textContent='종료는 시작보다 뒤여야 합니다. 한국 시간을 확인해주세요.';return;}body.start={date:null,dateTime:a+':00+09:00',timeZone:'Asia/Seoul'};body.end={date:null,dateTime:b+':00+09:00',timeZone:'Asia/Seoul'};}
        const sameTime=editing&&f.has('allDay')===allDay&&(allDay?String(f.get('dayStart'))===dayStart&&String(f.get('dayEnd'))===dayEnd:String(f.get('start'))===local(source.start.dateTime)&&String(f.get('end'))===local(source.end.dateTime));
        if(sameTime){delete body.start;delete body.end;}
      }else{const due=String(f.get('due')||''),status=String(f.get('status'));if(due&&!validDate(due)||!['completed','needsAction'].includes(status)){errorEl.textContent='기한과 완료 상태를 확인해주세요.';return;}body={title,notes:String(f.get('notes')||''),due:due?due+'T00:00:00.000Z':null,status};if(editing&&status!==source.status)body.completed=status==='completed'?new Date().toISOString():null;}
      busy=true;form.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=true);
      const dialog=document.querySelector('#calendar-dialog'),closeButton=dialog.querySelector('.close');if(closeButton)closeButton.disabled=true;
      const preventCancel=e=>e.preventDefault();dialog.addEventListener('cancel',preventCancel);
      try{const writePath=collection(target)+(editing?'/'+encodeURIComponent(item.id):'')+(kind==='event'?'?sendUpdates=none':'');await ctx.request(writePath,editing?'PATCH':'POST',body,editing?source.etag:'');if(ctx.current()){ctx.close();ctx.toast('Google 원본에 저장했어요.');await ctx.saved(target);}}
      catch(error){if(ctx.current()&&serial===generation){errorEl.textContent=error.message;uncertain=/결과|응답|저장 여부/.test(error.message);}}
      finally{busy=false;dialog.removeEventListener('cancel',preventCancel);if(closeButton)closeButton.disabled=false;form.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=false);if(editing)form.elements.destination.disabled=true;if(uncertain)form.querySelector('button.primary').disabled=true;}
    });
  }
  window.SecretGoogleEditor=Object.freeze({open});
})();
