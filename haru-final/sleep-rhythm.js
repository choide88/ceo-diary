(function(root){'use strict';
const validDay=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const stamp=s=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)&&validDay(s.slice(0,10))&&Number(s.slice(11,13))<24&&Number(s.slice(14,16))<60?Date.parse(s+':00+09:00'):NaN;
function validate(start,end,date,now=Date.now()){if(!start&&!end)return null;if(!start||!end)throw Error('잠든 시각과 일어난 시각을 함께 입력해주세요.');const a=stamp(start),b=stamp(end),minutes=(b-a)/60000;if(!Number.isFinite(minutes)||minutes<=0||minutes>1440)throw Error('기상은 취침보다 뒤여야 하며 한 번의 수면은 24시간 이내로 입력해주세요.');if(end.slice(0,10)!==date)throw Error('기록 날짜를 일어난 날과 맞춰주세요.');if(b>now)throw Error('실제로 일어난 시각까지만 기록해주세요.');return {sleepStartLocal:start,sleepEndLocal:end,sleepMinutes:String(minutes),sleep:(minutes/60).toFixed(1)};}
const clock=s=>s?.slice(11,16)||'';
const clockMinutes=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s)?Number(s.slice(0,2))*60+Number(s.slice(3)):null;
function deviation(value,target){const a=clockMinutes(value),b=clockMinutes(target);return a===null||b===null?null:((a-b+2160)%1440)-720;}
const api={validate,clock,deviation,clockMinutes};if(typeof module!=='undefined')module.exports=api;else root.SecretSleep=Object.freeze(api);
})(typeof window==='undefined'?globalThis:window);
