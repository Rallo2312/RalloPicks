// Uses official MLB game logs, not operator projections or predicted win rates.
const SIX_MARKETS=['hits','totalBases','runs','rbi','hrr','walks'];
let sixBusy=false,sixUpdated=0,sixRows=[];
const sixLogCache=new Map();
const sixSection=document.createElement('section');
sixSection.className='six-board';
sixSection.innerHTML='<div class="section-title"><div><h2>Top 6 Picks of the Day</h2><span>Different MLB stats • confirmed hitters + probable starters</span></div><button class="six-refresh" onclick="loadTopSix(true)">Refresh research</button></div><p class="note-box">Research shortlist, not a six-leg parlay. Thresholds below are not posted PrizePicks, Dabble, or Underdog lines. Confirm the actual line and payout in your app. Historical hit rates are not win probabilities.</p><div id="sixStamp" class="tiny"></div><div id="sixRows" class="six-grid"><div class="empty">Waiting for today’s slate…</div></div>';
document.getElementById('top20View').prepend(sixSection);

function sixSample(logs,market,line,n,direction='more'){
 const sample=logs.slice(0,n).filter(g=>Number.isFinite(market.value(g.stat||{})));
 const hits=sample.filter(g=>didHit(market.value(g.stat||{}),line,direction)).length;
 return {n:sample.length,hits,rate:sample.length?hits/sample.length:null};
}
function selectSix(candidates){
 // One hitter and one stat per card; deterministic ties. Not an exhaustive optimizer.
 const usedPlayers=new Set(),usedMarkets=new Set();
 return [...candidates].sort((a,b)=>b.score-a.score||a.id-b.id||a.key.localeCompare(b.key)).filter(x=>{
  const marketId=(x.kind||'batter')+':'+x.key;
  if(usedPlayers.has(x.id)||usedMarkets.has(marketId))return false;
  usedPlayers.add(x.id);usedMarkets.add(marketId);return true;
 }).slice(0,6);
}
function sixRatesHtml(logs,market,line,direction='more'){
 return [5,10,20].map(n=>{const s=sixSample(logs,market,line,n,direction);return `<span>L${n}: ${s.n?s.hits+'/'+s.n:'—'}</span>`}).join('');
}
function supportingFactorsHtml(p,market,line,direction='more'){
 const logs=(p.games||[]).filter(g=>g.date&&g.date<ymd);
 const s=sixSample(logs,market,line,20,direction),recent=sixSample(logs,market,line,5,direction);
 const trend=s.rate!=null&&recent.rate!=null?(recent.rate>s.rate?'Recent hit frequency is higher than the last-20 sample.':recent.rate<s.rate?'Recent hit frequency is lower than the last-20 sample.':'Recent hit frequency matches the last-20 sample.'):'Not enough history to compare form.';
 const history=p.bvp?.total;
 return `<details class="why-pick"><summary>Why this pick? Supporting factors &amp; warning signs</summary><div class="six-rates">${sixRatesHtml(logs,market,line,direction)}</div><p><strong>Supporting evidence:</strong> ${s.n?`${s.hits} of ${s.n} recorded games cleared this ${direction==='less'?'under':'over'} threshold.`:'No completed-game evidence is available.'} ${esc(trend)}</p><p>Opposing pitcher: ${esc(p.pitcher?.fullName||'Not confirmed')}. ${history?`Career pitcher matchup: ${Number(history.atBats||0)} at-bats, ${Number(history.hits||0)} hits.`:'Career pitcher matchup is unavailable or still loading.'}</p><p class="warning">${s.n<20?'Fewer than 20 games available. ':''}Past games do not adjust for today’s pitcher, park, or lineup. Small head-to-head samples are not strong evidence. Confirm lineup and current app line before using this research.</p></details>`;
}
async function loadTopSix(force=false){
 if(!state.memberActive||sixBusy)return;
 if(!force&&Date.now()-sixUpdated<300000)return;
 sixBusy=true;
 const root=document.getElementById('sixRows');
 root.innerHTML='<div class="empty">Checking starting lineups and completed-game stats…</div>';
 try{
  // Fresh schedule prevents finished, delayed, or postponed games staying eligible.
  const schedule=await j(`${MLB}/v1/schedule?sportId=1&date=${ymd}&hydrate=probablePitcher,team,venue`);
  const games=(schedule.dates?.[0]?.games||[]).filter(g=>g.status?.abstractGameState==='Preview'&&!/postpon|cancel|delay|suspend/i.test(g.status?.detailedState||'')&&Date.parse(g.gameDate)>Date.now());
  const hitters=[];
  for(const game of games){
   try{
    const box=await j(`${MLB}/v1/game/${game.gamePk}/boxscore`);
    for(const [side,other] of [['away','home'],['home','away']]){
     const club=game.teams[side],opponent=game.teams[other];
     const starter=club.probablePitcher;
     if(starter?.id)hitters.push({kind:'pitcher',id:Number(starter.id),name:starter.fullName,team:club.team.name,game,opponent:opponent.team,pitcher:starter});
     const ids=box.teams?.[side]?.battingOrder||[];
     ids.forEach((id,i)=>{const person=box.teams[side].players?.['ID'+id]?.person;if(person)hitters.push({id:Number(id),name:person.fullName,team:club.team.name,spot:i+1,game,opponent:opponent.team,pitcher:opponent.probablePitcher});});
    }
   }catch(e){/* Unknown lineup excludes this game. */}
  }
  const candidates=[];let failed=0;
  // Bound concurrency to avoid a request burst on the MLB service.
  let cursor=0;
  await Promise.all(Array.from({length:4},async()=>{
   while(cursor<hitters.length){
    const p=hitters[cursor++];
    try{
     const cacheKey=ymd+':'+(p.kind||'batter')+':'+p.id;
     const d=sixLogCache.get(cacheKey)||await j(`${MLB}/v1/people/${p.id}/stats?stats=gameLog&group=${p.kind==='pitcher'?'pitching':'hitting'}&season=${today.getFullYear()}`);
     sixLogCache.set(cacheKey,d);
     const logs=(d.stats?.[0]?.splits||[]).filter(g=>g.date<ymd&&(p.kind==='pitcher'?Number(g.stat?.gamesStarted)===1:Number(g.stat?.plateAppearances)>0)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,20);
     if(logs.length<10)continue;
     for(const key of (p.kind==='pitcher'?['strikeOuts','outs']:SIX_MARKETS)){
      const market=(p.kind==='pitcher'?PITCHER_ANALYTIC_MARKETS:ANALYTIC_MARKETS)[key],line=market.defaultLine;
      const required=key==='hrr'?['hits','runs','rbi']:[key==='walks'?'baseOnBalls':key==='outs'?'inningsPitched':key];
      if(logs.some(g=>required.some(k=>g.stat[k]==null)))continue;
      const a=sixSample(logs,market,line,5),b=sixSample(logs,market,line,10),c=sixSample(logs,market,line,20);
      if(b.rate<0.6||c.rate<0.55)continue;
      const score=0.2*a.rate+0.3*b.rate+0.5*c.rate;
      candidates.push({...p,key,line,logs,score});
     }
    }catch(e){failed++;}
   }
  }));
  sixRows=selectSix(candidates).filter(p=>Date.parse(p.game.gameDate)>Date.now());
  root.innerHTML=sixRows.map((p,i)=>{
   const market=(p.kind==='pitcher'?PITCHER_ANALYTIC_MARKETS:ANALYTIC_MARKETS)[p.key],s=sixSample(p.logs,market,p.line,20),weather=state.weather.get(Number(p.game.gamePk));
   return `<article class="six-card"><div class="six-meta">#${i+1} • ${esc(p.team)} • ${p.kind==='pitcher'?'Probable starter':`Starting lineup #${p.spot}`}</div><h3>${esc(p.name)}</h3><div class="six-market">More than ${p.line} ${esc(market.label)}</div><p class="six-meta">RESEARCH THRESHOLD • not an app line</p><div class="six-rates">${sixRatesHtml(p.logs,market,p.line)}</div><p><strong>Supporting factors:</strong> Cleared this threshold in ${s.hits}/${s.n} ${p.kind==='pitcher'?'starts; listed as today’s probable starter.':'games; listed in today’s starting lineup.'}</p><p>vs ${esc(p.opponent.name)} • ${esc(p.kind==='pitcher'?'Starting pitcher research':p.pitcher?.fullName||'Starter TBD')}<br>${esc(p.game.venue?.name||'Stadium unavailable')} • ${esc(weather?.label||'Weather not available')}</p><p class="warning">Warning signs: ${p.kind==='pitcher'?'Probable starter may change; workload and pitch limits are not modeled. ':''}${p.logs.length<20?'Limited recent sample. ':''}${p.spot>=7?'Lower lineup spot may reduce plate appearances. ':''}${!p.pitcher?'Opposing starter unconfirmed. ':''}Ranking uses recent results, not opponent-adjusted probabilities. Late scratches remain possible.</p><button class="prop" onclick="openSixPick(${i})">View full research</button></article>`;
  }).join('')||'<div class="empty">No qualifying picks yet. We need confirmed starting lineups, upcoming games, and at least 10 completed games (or pitching starts) of history. Refresh closer to first pitch.</div>';
  sixUpdated=Date.now();
  document.getElementById('sixStamp').textContent=`${ymd} • Checked ${new Date().toLocaleTimeString()} • ${sixRows.length}/6 qualifying picks • ${failed} unavailable player logs. Ranked by L5/L10/L20 hit frequency (20%/30%/50%); one player and stat per card. Rechecks every 5 minutes while this board is visible.`;
 }catch(e){root.innerHTML='<div class="empty">Research unavailable. Please refresh to try again.</div>';document.getElementById('sixStamp').textContent='No current shortlist available.';sixRows=[];}
 finally{sixBusy=false;}
}
async function openSixPick(i){
 const p=sixRows[i];if(!p||!requireMembership())return;
 if(Date.parse(p.game.gameDate)<=Date.now()){loadTopSix(true);return;}
 switchView('batterlab');await (p.kind==='pitcher'?openPitcherLab:openBatterLab)(p.id,p.name,p.team);
 if(state.currentLab?.id===p.id){state.currentLab.market=p.key;renderCurrentLab();}
}

function comparisonCounts(values,line){
 const valid=values.filter(v=>v!==null&&v!==undefined&&Number.isFinite(v));
 return {n:valid.length,more:valid.filter(v=>v>line).length,less:valid.filter(v=>v<line).length,ties:valid.filter(v=>v===line).length};
}
function comparisonValue(p,market,g){
 const s=g.stat||{},key=p.market;
 const fields={hrr:['hits','runs','rbi'],walks:['baseOnBalls'],strikeouts:['strikeOuts'],outs:['inningsPitched'],singles:['hits','doubles','triples','homeRuns'],fantasy:['hits','doubles','triples','homeRuns','runs','rbi','baseOnBalls','hitByPitch','stolenBases']};
 const needed=fields[key]||[key];
 if(key==='pitches')return s.numberOfPitches!=null?Number(s.numberOfPitches):s.pitchesThrown!=null?Number(s.pitchesThrown):null;
 if(needed.some(k=>s[k]==null||s[k]===''||!Number.isFinite(Number(s[k]))))return null;
 return market.value(s);
}
function moreLessHtml(p,market,line){
 const games=(p.games||[]).filter(g=>g.date&&g.date<ymd).sort((a,b)=>b.date.localeCompare(a.date));
 const rows=[5,10,20].map(n=>{
  const window=games.slice(0,n),counts=comparisonCounts(window.map(g=>comparisonValue(p,market,g)),line);
  const cell=k=>counts.n?`${counts[k]}/${counts.n} (${Math.round(counts[k]/counts.n*100)}%)`:'—';
  return `<tr><th scope="row">L${n}</th><td>${cell('more')}</td><td>${cell('less')}</td><td>${counts.n?counts.ties:'—'}</td><td>${counts.n}/${window.length}</td></tr>`;
 }).join('');
 return `<section class="side-comparison" aria-label="More and Less history"><h3>More / Less • ${esc(market.label)} ${line}</h3><div class="comparison-scroll"><table><caption>Completed games only • same line on both sides</caption><thead><tr><th scope="col">Window</th><th scope="col">More</th><th scope="col">Less</th><th scope="col">Ties</th><th scope="col">Valid games</th></tr></thead><tbody>${rows}</tbody></table></div><div class="comparison-actions"><button class="six-refresh" aria-pressed="${p.direction!=='less'}" onclick="setLabDirection('more')">Research More</button><button class="six-refresh" aria-pressed="${p.direction==='less'}" onclick="setLabDirection('less')">Research Less</button></div><p>Ties count toward neither side; settlement depends on the app. Missing stats are excluded, not treated as zero. Rates describe past results, not predicted chances or better payouts.${p.kind==='pitcher'?' Player Lab includes all recorded pitching appearances; Top 6 uses starts only.':''}</p></section>`;
}
function refreshVisibleSix(){
 if(document.hidden||!state.memberActive||state.currentSport!=='MLB'||document.getElementById('top20View').style.display==='none')return;
 const localDate=new Date();
 const currentDate=localDate.getFullYear()+'-'+String(localDate.getMonth()+1).padStart(2,'0')+'-'+String(localDate.getDate()).padStart(2,'0');
 if(currentDate!==ymd){sixRows=[];for(const id of ['sixRows','top20Rows','underratedHrRows'])document.getElementById(id).innerHTML='<div class="empty">A new day has started. Refresh the page to load the new slate.</div>';return;}
 document.querySelectorAll('.hr-card[data-game-date]').forEach(card=>{if(Date.parse(card.dataset.gameDate)<=Date.now())card.remove();});
 if(Date.now()-(state.hrBoardChecked||0)>=300000)loadTop20HR();
 const expired=sixRows.some(p=>Date.parse(p.game.gameDate)<=Date.now());
 loadTopSix(expired);
}
setInterval(refreshVisibleSix,60000);
document.addEventListener('visibilitychange',refreshVisibleSix);
function isUpcomingResearchGame(g){
 return g.status?.abstractGameState==='Preview'&&!/postpon|cancel|delay|suspend/i.test(g.status?.detailedState||'')&&Date.parse(g.gameDate)>Date.now();
}
