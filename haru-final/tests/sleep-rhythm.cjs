const assert=require('node:assert/strict'),S=require('../sleep-rhythm.js');
assert.equal(S.validate('2026-11-01T23:30','2026-11-02T07:00','2026-11-02',Date.parse('2026-11-02T00:00:00Z')).sleep,'7.5');
assert.equal(S.validate('2026-11-02T01:00','2026-11-02T08:00','2026-11-02',Date.parse('2026-11-02T01:00:00Z')).sleepMinutes,'420');
assert.equal(S.validate('','','2026-11-02'),null);
for(const args of [['','2026-11-02T07:00','2026-11-02'],['2026-11-02T08:00','2026-11-02T07:00','2026-11-02'],['2026-10-31T23:00','2026-11-02T07:00','2026-11-02'],['2026-11-01T23:00','2026-11-02T07:00','2026-11-01'],['2026-02-30T23:00','2026-03-01T07:00','2026-03-01']])assert.throws(()=>S.validate(...args));
assert.throws(()=>S.validate('2026-11-01T23:00','2026-11-02T07:00','2026-11-02',Date.parse('2026-11-01T20:00:00Z')));
assert.equal(S.deviation('00:10','23:50'),20);assert.equal(S.deviation('06:30','07:00'),-30);assert.equal(S.deviation('bad','07:00'),null);
console.log('PASS: KST overnight and post-midnight sleep, exact duration, missing/reversed/overlong/future/invalid dates, wake-day attribution and circular target differences.');
