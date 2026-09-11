/* Contact evidence and durable pregame outcome tracking. */
(()=>{
let quality=null,history=null;
const format=(n,d=1)=>n==null||!Number.isFinite(Number(n))?'Unavailable':Number(n).toFixed(d);
const number=(label,value,suffix='')=>`<div class="hr-list-stat"><span>${label}</span><b>${value==null?'—':format(value)+suffix}</b></div>`;
function evidence(x){
 const q=quality?.status==='ready'?quality.players?.[String(x.person.id)]:null;
 const age=quality?.updatedAt?Date.now()-Date.parse(quality.updatedAt):Infinity;
 if(!q||age>36*3600000)return '<details class="hr-list-details"><summary>Contact quality</summary><div class="hr-list-detail-body"><p>Fresh verified contact data is unavailable. No contact adjustment is applied.</p></div></details>';
 return `<details class="hr-list-details"><summary>Contact quality · ${quality.season} season</summary><div class="hr-list-detail-body"><div class="hr-evidence-windows">${number('Barrel rate / BBE',q.barrelRate,'%')}${number('Hard-hit rate / BBE',q.hardHitRate,'%')}${number('Average exit velocity',q.exitVelocity,' mph')}</div><p>${format(q.bbe,0)} tracked batted balls. ${q.bbe<100?'Small sample: trial adjustment withheld.':'Trial contact adjustment is recorded for evaluation.'} These are season totals, not L5/L10 trends. Pulled fly balls and recent contact trends are not yet available.</p><p>Barrels combine exit velocity and launch angle; hard-hit balls are at least 95 mph. Contact quality alone does not determine home-run outcomes.</p><p class="hr-list-note">Checked ${esc(new Date(quality.updatedAt).toLocaleString())}. <a href="${esc(quality.source)}" target="_blank" rel="noopener">Baseball Savant source</a></p></div></details>`;
}
const original=renderHrListRow;
renderHrListRow=function(x,...args){return original(x,...args).replace('</article>',evidence(x)+'</article>');};
function summary(){
 let el=document.getElementById('hrResultsTracking');if(!el){el=document.createElement('details');el.id='hrResultsTracking';el.className='hr-list-details';document.getElementById('top20Rows')?.before(el);}
 if(!history){el.innerHTML='<summary>HR results tracking</summary><div class="hr-list-detail-body">Results are temporarily unavailable.</div>';return;}
 const rows=history.records||[],settled=rows.filter(r=>['hit','miss'].includes(r.status)),hits=settled.filter(r=>r.status==='hit').length;
 const groups=new Map();for(const r of rows){if(r.trialScore==null)continue;const key=r.date+':'+r.board;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 let baseHits=0,trialHits=0,n=0,cohorts=0;
 for(const group of groups.values()){
  if(group.some(r=>r.status==='pending'))continue;
  const eligible=group.filter(r=>['hit','miss'].includes(r.status));if(eligible.length<5)continue;
  const base=[...eligible].sort((a,b)=>b.baseScore-a.baseScore).slice(0,5),trial=[...eligible].sort((a,b)=>b.trialScore-a.trialScore).slice(0,5);
  baseHits+=base.filter(r=>r.status==='hit').length;trialHits+=trial.filter(r=>r.status==='hit').length;n+=5;cohorts++;
 }
 el.innerHTML=`<summary>HR results tracking · ${settled.length} settled</summary><div class="hr-list-detail-body"><p>${hits} HR hits / ${settled.length} settled selections${settled.length?' · '+format(hits/settled.length*100)+'%':''}. ${rows.filter(r=>r.status==='pending').length} pending; ${rows.filter(r=>r.status==='void').length} void (no plate appearance).</p><p>Each selection is saved before its game begins. Final MLB box scores settle HR hits and misses. Missed pregame snapshots are excluded; an already-started game is never added after its result.</p><h4>Contact trial · same recorded player pool</h4><p>${n?`Original top five: ${baseHits}/${n} HR hits. Contact trial top five: ${trialHits}/${n}, across ${cohorts} completed board/date groups.`:'Awaiting completed groups with at least five eligible, recorded players.'}</p><p>The trial combines season barrel and hard-hit rates, shrinks smaller samples, requires 100 tracked batted balls and caps changes at ±10%. Current board order stays as published. Rates describe observed results, not profit, calibrated probabilities or proven improvement. No odds or stakes are tracked.</p><details><summary>Recorded selections</summary>${rows.slice(-60).reverse().map(r=>`<p>${esc(r.date)} · ${esc(r.name)} · ${esc(r.board==='top10'?'Top 10':'Underrated')} #${r.rank} · <b>${esc(r.status)}</b> ${r.hr==null?'':r.hr+' HR'}<br><small>Saved ${esc(new Date(r.recordedAt).toLocaleString())}${r.resultSource?` · <a href="${esc(r.resultSource)}" target="_blank" rel="noopener">Final box score</a>`:''}</small></p>`).join('')||'<p>No eligible pregame records yet.</p>'}</details></div>`;
}
async function fetchData(name){
 const url='https://raw.githubusercontent.com/Rallo2312/RalloPicks/main/data/'+name;
 let response=await fetch(url,{cache:'no-store'}).catch(()=>null);
 if(!response?.ok)response=await fetch('data/'+name,{cache:'no-store'});
 if(!response.ok)throw Error('Data unavailable');return response.json();
}
async function refresh(){
 const result=await Promise.allSettled([fetchData('hr-quality.json'),fetchData('hr-history.json')]);
 quality=result[0].status==='fulfilled'?result[0].value:null;history=result[1].status==='fulfilled'?result[1].value:null;
 summary();if(state.memberActive){state.hrBoardReady=false;loadTop20HR();}
}
refresh();setInterval(()=>{if(!document.hidden)refresh();},300000);
})();
