/* Calendar reminders and contact cadence, without ranking or messaging people. */
(function(root){
 'use strict';
 const date=s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return null;const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s?d:null;};
 const shift=(s,n)=>{const d=date(s);if(!d)return null;d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 const days=(a,b)=>date(a)&&date(b)?Math.round((date(b)-date(a))/86400000):null;
 function annual(monthDay,today,policy='feb28',notBeforeYear=0){if(!date(today)||!/^\d{2}-\d{2}$/.test(monthDay||'')||!date('2000-'+monthDay))return null;const start=Math.max(Number(today.slice(0,4)),notBeforeYear);for(let y=start;y<=start+8;y++){let candidate=y+'-'+monthDay;if(!date(candidate)){if(monthDay!=='02-29'||policy==='leap-only')continue;candidate=y+(policy==='mar1'?'-03-01':'-02-28');}if(candidate>=today)return candidate;}return null;}
 function anniversaries(person){try{const a=JSON.parse(person.anniversaries||'[]');return Array.isArray(a)?a.filter(e=>e&&typeof e.id==='string'&&typeof e.title==='string'&&date(e.date)&&['yearly','once'].includes(e.repeat)):[];}catch{return [];}}
 function lastContact(person,moments,today){const dates=[date(person.lastContact)&&person.lastContact<=today?person.lastContact:'',...moments.filter(m=>m.person===person.id&&m.kind==='contact'&&date(m.date)&&m.date<=today).map(m=>m.date)].filter(Boolean).sort();return dates.at(-1)||'';}
 function followUp(person,moments,today){const last=lastContact(person,moments,today),interval=Number(person.contactEveryDays);if(!Number.isInteger(interval)||interval<1||interval>3650||person.contactPaused)return {last,due:'',active:false};const anchor=last||(date(person.followupSince)?person.followupSince:today),due=shift(anchor,interval),snooze=date(person.snoozeUntil)?person.snoozeUntil:'';return {last,due,active:true,snooze,show:due<=today&&(!snooze||snooze<=today)};}
 function upcoming(people,today,horizon=30){const result=[],end=shift(today,horizon);for(const p of people){
  let birthday='';if(p.birthdayBasis==='lunar')birthday=date(p.birthdaySolarDate)&&p.birthdaySolarDate>=today?p.birthdaySolarDate:'';else birthday=annual(p.birthday,today,p.leapPolicy||'feb28');
  if(birthday&&birthday<=end)result.push({person:p.id,name:p.name,title:'생일',date:birthday,kind:'birthday',offset:days(today,birthday),basis:p.birthdayBasis==='lunar'?'직접 확인한 양력일':'양력'});
  for(const a of anniversaries(p)){const next=a.repeat==='yearly'?annual(a.date.slice(5),today,a.leapPolicy||'feb28',Number(a.date.slice(0,4))):a.date>=today?a.date:null;if(next&&next<=end)result.push({person:p.id,name:p.name,title:a.title,date:next,kind:'anniversary',id:a.id,offset:days(today,next),basis:a.repeat==='yearly'?'매년 양력':'한 번'});}
 }return result.sort((a,b)=>a.date.localeCompare(b.date)||String(a.name).localeCompare(String(b.name)));}
 function picks(people,moments,today){return people.filter(p=>p.reachOutDate===today&&p.reachOutStatus!=='dismissed').map(p=>({person:p,done:moments.some(m=>m.person===p.id&&m.kind==='contact'&&m.date===today)}));}
 const api=Object.freeze({date,shift,days,annual,anniversaries,lastContact,followUp,upcoming,picks});if(typeof module==='object'&&module.exports)module.exports=api;else root.HaruRelationships=api;
})(typeof window!=='undefined'?window:globalThis);
