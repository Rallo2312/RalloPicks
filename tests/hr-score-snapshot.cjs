const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const row={score:95,hr:30,pa:500,contactQuality:{barrelRate:12,bbe:250},research:{pitcher:{hr9:1.5,ip:100,missing:false},split:{hr:15,pa:200},profile:{windows:[{window:20,n:20,hrGames:4}]}}};
function score(rows){return JSON.parse(execFileSync('node',['scripts/hr_score_snapshot.cjs','index.html'],{input:JSON.stringify(rows)}));}
const results=score([row,{...row,score:2},{...row,lineup:{status:'confirmed',spot:1}},{}]);
assert.equal(results[0].score,results[1].score); // Ignore stale published scores.
assert.equal(results[2].score,Math.round((results[0].score+2.4)*10)/10);
assert.equal(results[3].score,50);
assert.ok(results[0].modelVersion.startsWith('hr-evidence-'));
assert.equal(new Set(results.map(x=>x.modelVersion)).size,1);
assert.ok(results[0].contributions.length>=5);
console.log('PASS exact scoring, old-score isolation, confirmed batting order, missing evidence, version identity');
