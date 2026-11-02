/* CEO Diary convention: [알바] ... (50) is a flat total of 50만원, not an hourly rate. */
(function(root){
 'use strict';
 const LIMIT=1000000000000;
 function parseAlbaTitle(value){
  const raw=String(value||''),tagged=/\[\s*알바\s*\]/.test(raw);
  if(!tagged)return {tagged:false,title:raw,amountWon:null};
  let title=raw.replace(/\[\s*알바\s*\]/g,'').trim(),amountWon=null;
  const tail=title.match(/(?:\(([^()]*)\)|（([^（）]*)）)\s*$/u);
  if(tail){
   const amount=(tail[1]??tail[2]).trim();
   const match=amount.match(/^((?:\d{1,3}(?:,\d{3})+|\d+))(?:\.(\d{1,4}))?\s*(만\s*원|만|원)?$/u);
   if(match){const unit=match[3]?.replace(/\s/g,'')||'만원',whole=BigInt(match[1].replace(/,/g,'')),fraction=match[2]||'';let won;
    if(unit==='원'){if(!fraction||/^0+$/.test(fraction))won=whole;}
    else won=whole*10000n+BigInt(fraction.padEnd(4,'0')||'0');
    if(won!==undefined&&won>=0n&&won<=BigInt(LIMIT))amountWon=Number(won);
   }
   title=title.slice(0,tail.index).trim();
  }
  return {tagged:true,title:title||'추가 알바 수입',amountWon};
 }
 function knownAmount(value){if(value===''||value===null||value===undefined)return null;const n=Number(value);return Number.isSafeInteger(n)&&n>=0&&n<=LIMIT?n:null;}
 function stage(row){return ['earned','expected','draft'].includes(row.stage)?row.stage:row.done?'earned':'expected';}
 function receipt(row){
  if(!row.done||stage(row)==='draft')return null;
  const legacy=row.stage===undefined;const date=row.receivedDate||(legacy?row.date:'');
  const amount=knownAmount(row.receivedAmount!==undefined&&row.receivedAmount!==''?row.receivedAmount:legacy?row.amount:null);
  return /^\d{4}-\d{2}-\d{2}$/.test(date||'')&&amount!==null?{date,amount}:null;
 }
 function summarize(rows,month){
  const earned=rows.filter(r=>r.date?.slice(0,7)===month&&stage(r)==='earned');
  const expected=rows.filter(r=>r.date?.slice(0,7)===month&&stage(r)==='expected');
  const drafts=rows.filter(r=>r.date?.slice(0,7)===month&&stage(r)==='draft');
  const paid=rows.map(r=>receipt(r)).filter(r=>r&&r.date.slice(0,7)===month);
  const total=list=>list.reduce((sum,r)=>sum+(knownAmount(r.amount)??0),0);
  return {draft:total(drafts),draftCount:drafts.length,earned:total(earned),earnedCount:earned.length,expected:total(expected),expectedCount:expected.length,received:paid.reduce((sum,r)=>sum+r.amount,0),receivedCount:paid.length,unpaid:total(earned.filter(r=>!r.done)),unpaidCount:earned.filter(r=>!r.done).length};
 }
 const api=Object.freeze({parseAlbaTitle,knownAmount,stage,receipt,summarize,LIMIT});
 if(typeof module==='object'&&module.exports)module.exports=api;else root.HaruIncomeFormat=api;
})(typeof window!=='undefined'?window:globalThis);
