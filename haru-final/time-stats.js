/* Pure time accounting. Planned intervals never become actual intervals implicitly. */
(function(root){
 'use strict';
 const MINUTE=60000;
 const dayOf=d=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(d);
 const stamp=day=>Date.parse(day+'T00:00:00+09:00');
 function shift(day,n){const d=new Date(day+'T12:00:00+09:00');d.setUTCDate(d.getUTCDate()+n);return dayOf(d);}
 function union(intervals){const sorted=intervals.map(i=>[i[0],i[1]]).filter(i=>Number.isFinite(i[0])&&Number.isFinite(i[1])&&i[1]>i[0]).sort((a,b)=>a[0]-b[0]);const result=[];for(const i of sorted){const last=result[result.length-1];if(last&&i[0]<=last[1])last[1]=Math.max(last[1],i[1]);else result.push([...i]);}return result;}
 const length=intervals=>intervals.reduce((n,i)=>n+(i[1]-i[0])/MINUTE,0);
 function actual(log,now=Date.now()){
  const start=Date.parse(log.actualStart||''),end=Date.parse(log.actualEnd||''),minutes=Number(log.minutes);
  return Number.isFinite(start)&&Number.isFinite(end)&&end>start&&end<=now&&Number.isFinite(minutes)&&Math.abs((end-start)/MINUTE-minutes)<0.51?{start,end}:null;
 }
 function analyze({logs,planned=[],start,end,now=Date.now()}){
  if(!Number.isFinite(stamp(start))||!Number.isFinite(stamp(end))||end<=start||(stamp(end)-stamp(start))/86400000>62)throw new Error('Invalid time range');
  const periodLogs=logs.filter(l=>l.date>=start&&l.date<end&&Number.isFinite(Number(l.minutes))&&Number(l.minutes)>=0);
  const roles=new Map();for(const l of periodLogs)roles.set(l.role||'',(roles.get(l.role||'')||0)+Number(l.minutes));
  const days=[];
  for(let date=start;date<end;date=shift(date,1)){
   const a=stamp(date),b=stamp(shift(date,1)),elapsed=Math.max(0,Math.min(b,now)-a)/MINUTE;
   const placed=logs.map(l=>({log:l,time:actual(l,now)})).filter(x=>x.time&&x.time.start<b&&x.time.end>a).map(x=>({id:x.log.id,title:x.log.title,role:x.log.role,start:Math.max(a,x.time.start),end:Math.min(b,x.time.end)}));
   const appointments=planned.filter(e=>!e.allDay&&e.startMs<b&&e.endMs>a&&Number.isFinite(e.startMs)&&Number.isFinite(e.endMs)).map(e=>({key:e.key,title:e.title,start:Math.max(a,e.startMs),end:Math.min(b,e.endMs)}));
   const confirmed=union(placed.map(x=>[x.start,x.end])),scheduled=union(appointments.map(x=>[x.start,x.end]));
   let cursor=a;const gaps=[];for(const [s,e] of confirmed){if(s>cursor&&cursor<Math.min(b,now))gaps.push([cursor,Math.min(s,b,now)]);cursor=Math.max(cursor,e);}if(cursor<Math.min(b,now))gaps.push([cursor,Math.min(b,now)]);
   const records=periodLogs.filter(l=>l.date===date),unplaced=records.filter(l=>!actual(l,now));
   days.push({date,recordMinutes:records.reduce((n,l)=>n+Number(l.minutes),0),records:records.length,confirmedMinutes:length(confirmed),plannedMinutes:length(scheduled),overlapMinutes:Math.max(0,length(placed.map(x=>[x.start,x.end]))-length(confirmed)),unplacedMinutes:unplaced.reduce((n,l)=>n+Number(l.minutes),0),unplaced,elapsedMinutes:elapsed,gapMinutes:length(gaps),gaps,actual:placed,planned:appointments,allDayCount:planned.filter(e=>e.allDay&&e.startMs<b&&e.endMs>a).length});
  }
  const sum=key=>days.reduce((n,d)=>n+d[key],0);
  return {start,end,days,recordCount:periodLogs.length,recordMinutes:sum('recordMinutes'),confirmedMinutes:sum('confirmedMinutes'),plannedMinutes:sum('plannedMinutes'),overlapMinutes:sum('overlapMinutes'),unplacedMinutes:sum('unplacedMinutes'),gapMinutes:sum('gapMinutes'),roles:[...roles].map(([role,minutes])=>({role,minutes})).sort((a,b)=>b.minutes-a.minutes)};
 }
 function local(iso){if(!Number.isFinite(Date.parse(iso||'')))return '';const d=new Date(iso);return dayOf(d)+'T'+new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);}
 function validateActual(startLocal,endLocal,minutes,date,now=Date.now()){
  if(!startLocal&&!endLocal)return {actualStart:'',actualEnd:''};
  if(!startLocal||!endLocal)throw new Error('실제 시작과 종료 시각을 함께 입력하거나 둘 다 비워주세요.');
  const a=Date.parse(startLocal+'+09:00'),b=Date.parse(endLocal+'+09:00');
  if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a||b>now)throw new Error('실제 구간은 종료가 시작보다 늦고 현재 시각을 넘지 않아야 합니다.');
  if(startLocal.slice(0,10)!==date)throw new Error('기록 날짜를 실제 시작일과 맞춰주세요.');
  if(Math.abs((b-a)/MINUTE-Number(minutes))>=0.51)throw new Error('시작·종료 구간과 실제 분이 다릅니다. 휴게시간은 구간을 나누거나 시각을 비우고 실제 분만 기록하세요.');
  return {actualStart:new Date(a).toISOString(),actualEnd:new Date(b).toISOString()};
 }
 const api=Object.freeze({analyze,actual,union,shift,stamp,local,validateActual});if(typeof module==='object'&&module.exports)module.exports=api;else root.HaruTimeStats=api;
})(typeof window!=='undefined'?window:globalThis);
