// Baseline executes the deployed formula. Challengers are prospective hypotheses.
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const html = fs.readFileSync(process.argv[2], 'utf8');
const start = html.indexOf('function hrEvidenceScore(x){');
const end = html.indexOf('\nfunction renderHrModelLeaderboard', start);
if (start < 0 || end < 0) throw Error('HR scoring function not found');
const source = html.slice(start, end);
const hash = text => crypto.createHash('sha256').update(text).digest('hex').slice(0,12);
const version = 'hr-evidence-' + hash(source);
const definitions = [
 {id:'no-streak-v1',weights:{'Recent HR games':0},description:'Remove the recent HR-game boost; keep all other contributions unchanged.'},
 {id:'contact-first-v1',weights:{'Recent HR games':0,'Season HR/PA':0.5,'Handedness HR/PA':0.5,'Barrels':2},description:'Double the existing sample-shrunk barrel contribution, halve HR-rate contributions, and remove the streak boost.'}
];
// Capture exact, unrounded contributions without changing the baseline arithmetic.
const needle='score+=value;';
if (source.split(needle).length!==2) throw Error('Scoring instrumentation needs review');
const context = vm.createContext({components:{}});
vm.runInContext(source.replace(needle,needle+'components[label]=value;'),context,{timeout:1000});
const rows = JSON.parse(fs.readFileSync(0,'utf8'));
const scores=rows.map(row=>{
 context.candidate=row;context.components={};
 const result=vm.runInContext('hrEvidenceScore(candidate)',context,{timeout:1000});
 const experiments={};
 for(const test of definitions){
  const issues=[];
  if(row.lineup?.status!=='confirmed')issues.push('Starting lineup unconfirmed');
  if(test.id==='contact-first-v1'){
   const q=row.contactQuality||{},age=Date.now()-Date.parse(q.checkedAt);
   if(!(q.bbe>=100)||!Number.isFinite(q.barrelRate))issues.push('Insufficient barrel evidence');
   if(!Number.isFinite(age)||age<0||age>36*3600000)issues.push('Contact evidence is not current');
  }
  const raw=50+Object.entries(context.components).reduce((sum,[name,value])=>sum+value*(test.weights[name]??1),0);
  experiments[test.id]={version:test.id+'-'+hash(source+JSON.stringify(test)),score:issues.length?null:Math.round(Math.max(1,Math.min(99,raw))*10)/10,exclusions:issues};
 }
 return {modelVersion:version,score:result.score,contributions:result.notes,components:context.components,experiments};
});
process.stdout.write(JSON.stringify(scores));
