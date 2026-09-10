// Device-local research history is not a verified site-wide betting record.
const researchHealth=new Map();
function researchFresh(key,stamp){
 const at=typeof stamp==='number'?stamp:Date.parse(stamp);
 researchHealth.set(key,{at:Number.isFinite(at)&&at<=Date.now()+60000?at:null,failed:false});
 renderResearchFreshness();
}
function researchFailed(key){researchHealth.set(key,{...researchHealth.get(key),failed:true});renderResearchFreshness();}
function freshnessText(key,label,maxMinutes){
 const h=researchHealth.get(key),age=h?.at?Math.max(0,Date.now()-h.at):null;
 const old=age!==null&&age>maxMinutes*60000;
 const elapsed=age===null?'Update time unavailable':age<60000?'just now':age<3600000?Math.floor(age/60000)+' min ago':age<86400000?Math.floor(age/3600000)+' hr ago':Math.floor(age/86400000)+' days ago';
 return `<span class="fresh-item ${old||h?.failed?'fresh-warning':''}" ${h?.at?`title="${esc(new Date(h.at).toLocaleString())}"`:''}>${esc(label)}: ${esc(elapsed)}${h?.failed?' • refresh failed':old?' • STALE':''}</span>`;
}
const freshnessGroups={
 top20View:[['six','Top 6 checked',6],['hr','HR boards checked',6],['lineups','Lineups checked',6],['weather','Weather checked',30],['arsenals','Pitch research updated',1440]],
 batterRankingsView:[['ranks','Ranks checked',6],['lineups','Lineups checked',6],['weather','Weather checked',30]],
 batterlabView:[['schedule','Schedule checked',6],['arsenals','Pitch research updated',1440]],
 moneylineView:[['odds','MLB odds feed updated',60]],
 nflPlayersView:[['nfl','NFL feed updated',60]],nflMatchupsView:[['nfl','NFL feed updated',60]],nflMoneylineView:[['nfl','NFL feed updated',60]]
};
function renderResearchFreshness(){
 for(const [id,entries] of Object.entries(freshnessGroups)){
  const host=document.getElementById(id);if(!host)continue;
  let bar=host.querySelector('.research-freshness');
  if(!bar){bar=document.createElement('div');bar.className='research-freshness';host.prepend(bar);}
  bar.innerHTML=entries.map(args=>freshnessText(...args)).join('');
 }
}
function readResearchStorage(key){try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value:[];}catch{return [];}}
let storageProblem=false;
function writeResearchStorage(key,value){try{localStorage.setItem(key,JSON.stringify(value));storageProblem=false;return true;}catch{storageProblem=true;return false;}}
let favoritePlayers=readResearchStorage('ralloFavoritePlayersV1').filter(p=>p&&['MLB','NFL'].includes(p.sport)&&p.id&&typeof p.name==='string');
let researchHistory=readResearchStorage('ralloResearchHistoryV1').filter(p=>p&&p.key&&p.gamePk&&Number.isFinite(p.line));
function favoriteKey(p){return p.sport+':'+p.id;}
function selectedFavorite(sport){
 const p=sport==='NFL'?state.nfl.players.find(p=>String(p.id)===String(state.nflCurrentPlayer)):state.currentLab;
 return p?{sport,id:String(p.id),name:p.name,team:p.team||'',kind:p.kind||'batter'}:null;
}
function toggleFavoritePlayer(sport){
 if(!requireMembership())return;const p=selectedFavorite(sport);if(!p)return;
 const key=favoriteKey(p),found=favoritePlayers.some(x=>favoriteKey(x)===key);
 const next=found?favoritePlayers.filter(x=>favoriteKey(x)!==key):[...favoritePlayers,p];
 if(writeResearchStorage('ralloFavoritePlayersV1',next))favoritePlayers=next;
 renderFavoritePlayers();decoratePlayerTools(sport);
}
function removeFavoritePlayer(index){
 if(!requireMembership())return;
 const next=favoritePlayers.filter((_,i)=>i!==index);if(writeResearchStorage('ralloFavoritePlayersV1',next))favoritePlayers=next;
 renderFavoritePlayers();decoratePlayerTools('MLB');decoratePlayerTools('NFL');
}
function decoratePlayerTools(sport){
 const p=selectedFavorite(sport),host=document.getElementById(sport==='NFL'?'nflPlayerDetail':'batterLabPlayer');if(!p||!host)return;
 let row=host.querySelector('.favorite-player-tools');
 if(!row){row=document.createElement('div');row.className='favorite-player-tools';host.prepend(row);}
 const saved=favoritePlayers.some(x=>favoriteKey(x)===favoriteKey(p));
 row.innerHTML=`<button class="six-refresh" aria-pressed="${saved}" onclick="toggleFavoritePlayer('${sport}')">${saved?'★ Following player':'☆ Follow player'}</button><span>${storageProblem?'Could not save. Browser storage may be full or blocked.':'Player watchlist • saved on this device'}</span>`;
}
function favoriteContext(p){
 if(p.sport==='NFL'){
  const current=state.nfl.players.find(x=>String(x.id)===p.id),opp=current?nflOpponentFor(current.team):null;
  return current?`${current.team} • ${opp?'vs '+opp.side.abbr:'Next opponent pending'}`:p.team+' • Open to check availability';
 }
 const game=state.games.find(g=>[g.teams.away.team,g.teams.home.team].some(t=>normTeam(t.name)===normTeam(p.team)||normTeam(t.abbreviation)===normTeam(p.team))&&isUpcomingResearchGame(g));
 return `${p.team} • ${game?new Date(game.gameDate).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'No upcoming matchup found'}`;
}
function renderFavoritePlayers(){
 for(const sport of ['MLB','NFL']){
  const host=document.querySelector(`#${sport==='MLB'?'mlb':'nfl'}ResearchLayout .left-col`);if(!host)continue;
  let panel=host.querySelector('.player-watchlist');
  if(!panel){panel=document.createElement('section');panel.className='panel player-watchlist';host.prepend(panel);}
  const rows=favoritePlayers.map((p,i)=>({p,i})).filter(({p})=>p.sport===sport);
  panel.innerHTML=`<div class="panel-head"><h3>${sport} Favorites (${rows.length})</h3></div><p>Follow players from Player Lab. Open a favorite for current research and available lines.</p>${storageProblem?'<p class="fresh-warning">Could not save changes. Check browser storage.</p>':''}<div class="watchlist-rows">${rows.map(({p,i})=>`<article><button class="watch-open" onclick="openFavoritePlayer(${i})"><strong>${esc(p.name)}</strong><span>${esc(favoriteContext(p))}</span></button><button class="six-refresh" aria-label="Remove ${esc(p.name)} from favorites" onclick="removeFavoritePlayer(${i})">×</button></article>`).join('')||'<p>No players followed yet.</p>'}</div><p>Saved on this device. MLB and NFL stay separate.</p>`;
 }
}
async function openFavoritePlayer(index){
 if(!requireMembership())return;const p=favoritePlayers[index];if(!p)return;
 setSport(p.sport);
 if(p.sport==='NFL'){
  await loadNFL(true);switchNflView('players');
  if(!state.nfl.players.some(x=>String(x.id)===p.id)){document.getElementById('nflPlayerDetail').textContent='This player is not available in the current feed.';return;}
  state.nflMarket=null;state.nflLine=null;openNFLPlayer(p.id);
 }else{switchView('batterlab');await loadGames();await (p.kind==='pitcher'?openPitcherLab:openBatterLab)(Number(p.id),p.name,p.team);}
}
for(const name of ['renderBatterAnalytics','renderPitcherAnalytics','openNFLPlayer']){
 const original=window[name];window[name]=function(...args){const value=original.apply(this,args);decoratePlayerTools(name==='openNFLPlayer'?'NFL':'MLB');return value;};
}
function snapshotKey(p){return [p.game.gamePk,p.kind||'batter',p.id,p.key,p.line,'more'].join('|');}
function captureResearchPicks(rows){
 if(!state.memberActive)return;
 const capturedAt=new Date().toISOString(),next=[...researchHistory],known=new Set(next.map(p=>p.key));
 rows.forEach(p=>{
  const key=snapshotKey(p);if(known.has(key)||!isUpcomingResearchGame(p.game)||!Number.isFinite(p.line))return;
  const market=(p.kind==='pitcher'?PITCHER_ANALYTIC_MARKETS:ANALYTIC_MARKETS)[p.key];
  next.push({key,id:Number(p.id),name:p.name,team:p.team,kind:p.kind||'batter',market:p.key,label:market.label,line:p.line,direction:'more',gamePk:Number(p.game.gamePk),gameDate:p.game.gameDate,capturedAt,status:'pending',source:'Top 6 research threshold',opponent:p.opponent.name,score:p.score});known.add(key);
 });
 if(next.length!==researchHistory.length&&writeResearchStorage('ralloResearchHistoryV1',next))researchHistory=next;
 renderResearchHistory();
}
function researchOutcome(p,game,box){
 const detail=game.status?.detailedState||'';
 if(/postpon|cancel/i.test(detail))return {status:'void',reason:'Game postponed or canceled'};
 if(game.status?.abstractGameState!=='Final')return null;
 // Unknown or missing box scores never become automatic losses.
 let player;
 for(const side of ['away','home']){const club=box.teams?.[side];if(!club?.players)return null;player=player||club.players['ID'+p.id];}
 if(!player)return {status:'void',reason:'Player did not appear in the final box score'};
 const pitching=p.kind==='pitcher',stats=player.stats?.[pitching?'pitching':'batting'];if(!stats)return null;
 const activity=stats[pitching?'gamesStarted':'plateAppearances'];
 if(pitching){if(activity==null)return null;if(Number(activity)!==1)return {status:'void',reason:'Did not start as pitcher'};}
 else{
  if(activity==null)return null;
  if(Number(activity)===0)return {status:'void',reason:'No plate appearances'};
  if(player.battingOrder==null)return null;
  if(Number(player.battingOrder)%100!==0)return {status:'void',reason:'Not in the starting lineup'};
 }
 const market=(pitching?PITCHER_ANALYTIC_MARKETS:ANALYTIC_MARKETS)[p.market];if(!market)return null;
 const value=comparisonValue({market:p.market},market,{stat:stats});if(value===null||!Number.isFinite(value))return null;
 return {status:value===p.line?'push':(p.direction==='less'?value<p.line:value>p.line)?'win':'loss',value,reason:'Official final MLB box score'};
}
let resultsBusy=false,resultsChecked=0,resultsError='';
async function refreshResearchResults(force=false){
 if(!state.memberActive||resultsBusy||(!force&&Date.now()-resultsChecked<300000))return;
 resultsBusy=true;resultsError='';renderResearchHistory();
 try{
  const pending=researchHistory.filter(p=>p.status==='pending'&&Date.parse(p.gameDate)<=Date.now()),ids=[...new Set(pending.map(p=>p.gamePk))];
  const next=researchHistory.map(p=>({...p}));let failures=0;
  // Batch schedule reads; only fetch final box scores once per game.
  for(let i=0;i<ids.length;i+=30){
   const data=await j(`${MLB}/v1/schedule?sportId=1&gamePks=${ids.slice(i,i+30).join(',')}`);
   const games=(data.dates||[]).flatMap(d=>d.games||[]);
   for(const game of games){
    try{
     const final=game.status?.abstractGameState==='Final',box=final?await j(`${MLB}/v1/game/${game.gamePk}/boxscore`):{};
     for(const p of next.filter(p=>p.gamePk===game.gamePk&&p.status==='pending')){
      const result=researchOutcome(p,game,box);if(result)Object.assign(p,result,{settledAt:new Date().toISOString()});
     }
    }catch{failures++;}
   }
  }
  // Merge by key so a concurrent board refresh cannot lose new captures.
  const graded=new Map(next.map(p=>[p.key,p]));
  const merged=researchHistory.map(p=>graded.get(p.key)||p);
  if(writeResearchStorage('ralloResearchHistoryV1',merged))researchHistory=merged;
  resultsChecked=Date.now();if(failures)resultsError='Some final results were unavailable; those picks remain pending.';
 }catch{resultsError='Could not check final scores. Saved results are unchanged; try again.';}
 finally{resultsBusy=false;renderResearchHistory();}
}
function renderResearchHistory(){
 const host=document.getElementById('top20View');if(!host)return;
 let panel=document.getElementById('researchHistory');
 if(!panel){panel=document.createElement('details');panel.id='researchHistory';panel.className='research-history';host.append(panel);}
 const counts=Object.fromEntries(['win','loss','push','void','pending'].map(k=>[k,researchHistory.filter(p=>p.status===k).length]));
 const decided=counts.win+counts.loss,rate=decided?Math.round(counts.win/decided*100)+'%':'—';
 // All captures remain in storage. Render a bounded recent list and allow the full history on demand.
 const all=panel.dataset.showAll==='true',rows=[...researchHistory].sort((a,b)=>b.capturedAt.localeCompare(a.capturedAt));
 panel.innerHTML=`<summary>Results tracker <span>${counts.win} W · ${counts.loss} L · ${counts.pending} pending</span></summary><p>Top 6 picks seen on this device before first pitch are saved automatically with their original threshold. Every captured replacement stays in the record. This is a personal research log, not a site-wide record or app settlement.</p><div class="results-summary"><b>${rate} decided win rate</b><span>${counts.push} pushes · ${counts.void} void · ${counts.pending} pending</span></div><p>Win rate excludes pushes, voids, and pending results. Scratched hitters, non-starting pitchers, and postponed/canceled games are void. Missing final stats stay pending. No past picks are reconstructed.</p><button class="six-refresh" onclick="refreshResearchResults(true)" ${resultsBusy?'disabled':''}>${resultsBusy?'Checking final scores…':'Check results'}</button><p class="${resultsError||storageProblem?'fresh-warning':''}">${esc(storageProblem?'Could not save. Browser storage may be full or blocked.':resultsError||(resultsChecked?'Results checked '+new Date(resultsChecked).toLocaleString():'Results will be checked automatically while the site is open.'))}</p><div class="history-rows">${(all?rows:rows.slice(0,30)).map(p=>`<article><div><strong>${esc(p.name)}</strong><span>${esc(p.direction)} ${p.line} ${esc(p.label)} • ${esc(p.opponent)}</span><span>Saved ${esc(new Date(p.capturedAt).toLocaleString())} • first pitch ${esc(new Date(p.gameDate).toLocaleString())}</span></div><div class="result-${p.status}"><b>${esc(p.status.toUpperCase())}</b><span>${p.value==null?'':esc(p.value)+' final'}</span><span>${esc(p.reason||'Awaiting official final result')}</span></div></article>`).join('')||'<p>No pregame picks saved yet. Open Top 6 when qualifying picks are available to start your record.</p>'}</div>${rows.length>30?`<button class="six-refresh" onclick="document.getElementById('researchHistory').dataset.showAll='${!all}';renderResearchHistory()">${all?'Show recent 30':'Show all '+rows.length+' captures'}</button>`:''}<p>Saved only in this browser. Clearing browser data removes this history. Updates resume when you reopen the site.</p>`;
}
let backgroundBusy=false,lastFeedCheck=0;
async function refreshResearchTools(force=false){
 if(document.hidden||!state.memberActive||backgroundBusy)return;
 backgroundBusy=true;
 try{
  renderResearchFreshness();renderFavoritePlayers();
  if(force||Date.now()-lastFeedCheck>=300000){
   lastFeedCheck=Date.now();
   if(state.currentSport==='NFL')await loadNFL(true);
   else if(new Date().toLocaleDateString('en-CA')===ymd){
    await loadGames();await loadOdds();
    if(!researchHealth.get('weather')?.at||Date.now()-researchHealth.get('weather').at>=1800000){state.weatherReady=false;await loadWeatherEdges();}
    if(document.getElementById('batterRankingsView').style.display==='block'){state.dailyRanksReady=false;await loadDailyBatterRanks();}
    refreshVisibleSix();
   }
  }
  await refreshResearchResults(force);
 }finally{backgroundBusy=false;}
}
renderResearchFreshness();renderFavoritePlayers();renderResearchHistory();
setInterval(()=>refreshResearchTools(),60000);
document.addEventListener('visibilitychange',()=>refreshResearchTools());
window.addEventListener('online',()=>refreshResearchTools(true));
window.addEventListener('storage',event=>{
 if(event.key==='ralloFavoritePlayersV1'){favoritePlayers=readResearchStorage(event.key);renderFavoritePlayers();}
 if(event.key==='ralloResearchHistoryV1'){researchHistory=readResearchStorage(event.key);renderResearchHistory();}
});
