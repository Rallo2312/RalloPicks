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


/* RalloPicks full app suite */
(()=>{
const BOARD_KEY='ralloBoardV2',LINE_KEY='ralloLineHistoryV2';
let boardExtras=readResearchStorage(BOARD_KEY).filter(x=>x&&x.id&&x.sport);
let lineHistory=readResearchStorage(LINE_KEY).filter(x=>x&&x.key&&Number.isFinite(x.line));
function saveBoard(){writeResearchStorage(BOARD_KEY,boardExtras);renderAppBoard();}
function saveLines(){writeResearchStorage(LINE_KEY,lineHistory);}
function boardKey(p){return [p.sport,p.kind||'',p.id,p.market||'',Number(p.line),p.direction||'more',p.book||''].join('|')}
function allBoardPicks(){
 const mlb=(state.saved||[]).map(p=>({...p,sport:'MLB',status:'watching',source:'saved'}));
 const extras=boardExtras.map(p=>({...p,source:'board'}));
 const seen=new Set(),out=[];
 for(const p of [...mlb,...extras]){const k=boardKey(p);if(seen.has(k))continue;seen.add(k);out.push(p)}
 return out;
}
function currentBoardPick(sport){
 if(sport==='NFL'){
  const p=state.nfl.players.find(x=>String(x.id)===String(state.nflCurrentPlayer));if(!p)return null;
  const markets=nflMarkets[p.position]||nflMarkets.WR,label=markets.find(x=>x[1]===state.nflMarket)?.[0]||markets[0][0],posted=p.lines?.[state.platform]?.[label],manual=state.nflManualLines[nflLineKey(p.id,state.nflMarket,state.platform)],line=Number(state.nflLine??posted??manual??nflDefaultLine(p.position,state.nflMarket));
  return {sport:'NFL',kind:p.position,id:String(p.id),name:p.name,team:p.team,market:state.nflMarket,label,line,direction:'more',book:state.platform,createdAt:new Date().toISOString(),status:'watching'};
 }
 const p=currentPick();return p?{...p,sport:'MLB',label:savedMarketLabel(p),createdAt:new Date().toISOString(),status:'watching'}:null;
}
window.addCurrentToBoard=function(sport){
 const p=currentBoardPick(sport);if(!p)return;
 const k=boardKey(p),i=boardExtras.findIndex(x=>boardKey(x)===k);
 if(i<0)boardExtras.unshift(p);saveBoard();renderAppDashboards();
};
window.removeBoardExtra=function(k){boardExtras=boardExtras.filter(x=>boardKey(x)!==k);saveBoard();renderAppDashboards();}
window.gradeBoardPick=function(k,status){
 const p=boardExtras.find(x=>boardKey(x)===k);
 if(p){p.status=['win','loss','push','watching','played'].includes(status)?status:'watching';p.gradedAt=new Date().toISOString();saveBoard();renderAppDashboards();return}
 // Saved MLB cards are mirrored to board; grading creates a tracked snapshot without changing the favorite.
 const src=(state.saved||[]).map(x=>({...x,sport:'MLB',label:savedMarketLabel(x)})).find(x=>boardKey(x)===k);
 if(src){boardExtras.unshift({...src,createdAt:new Date().toISOString(),status});saveBoard();renderAppDashboards();}
};
function lineKey(sport,pid,market,book){return [sport,pid,market,book].join('|')}
function rememberLine(sport,pid,market,book,line){
 line=Number(line);if(!Number.isFinite(line))return;
 const key=lineKey(sport,pid,market,book),last=[...lineHistory].reverse().find(x=>x.key===key);
 if(last&&Number(last.line)===line)return;
 lineHistory.push({key,sport,pid:String(pid),market,book,line,at:new Date().toISOString()});
 if(lineHistory.length>600)lineHistory=lineHistory.slice(-600);saveLines();
}
function movementFor(sport,pid,market,book){
 const rows=lineHistory.filter(x=>x.key===lineKey(sport,pid,market,book));
 if(rows.length<2)return null;const first=rows[0],last=rows[rows.length-1],delta=last.line-first.line;
 return {...last,first:first.line,delta,count:rows.length};
}
function lineHistoryHtml(sport,pid,market,book){
 const m=movementFor(sport,pid,market,book);if(!m)return '<div class="line-history-strip">Line movement starts after RalloPicks sees this line change on your device.</div>';
 const arrow=m.delta>0?'⬆️':m.delta<0?'⬇️':'↔️';
 return '<div class="line-history-strip"><b>'+arrow+' LINE MOVEMENT</b> '+m.first+' → '+m.line+' ('+(m.delta>0?'+':'')+m.delta.toFixed(1)+') • '+m.count+' observations • latest '+esc(new Date(m.at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}))+'</div>';
}
function mlbEdge(){
 const p=state.currentLab;if(!p)return null;
 const market=(p.kind==='pitcher'?PITCHER_ANALYTIC_MARKETS:ANALYTIC_MARKETS)[p.market];if(!market)return null;
 const recent=(p.games||[]).slice(0,10),line=Number(p.line),dir=p.direction||'more',rate=pctHit(recent,market,line,dir);
 let score=45+rate*.42;
 if(p.kind==='batter'){
  const mix=arsenalPowerMatch(p.id,p.pitcher?.id);score+=(mix.factor-1)*60;
  const q=state.hrQuality?.players?.[String(p.id)];if(q){score+=(Number(q.hardHitRate||40)-40)*.18+(Number(q.barrelRate||8)-8)*.4}
 }else{
  const opp=p.opponent?.id?state.dailyBatterRanks.filter(x=>x.teamId===p.opponent.id):[];if(opp.length)score-=Math.max(-5,Math.min(5,(opp.slice(0,5).reduce((a,x)=>a+x.score,0)/Math.min(5,opp.length)-60)*.15));
 }
 score=Math.max(1,Math.min(99,Math.round(score)));
 return {score,rate,label:market.label,line,dir};
}
function nflEdge(){
 const p=state.nfl.players.find(x=>String(x.id)===String(state.nflCurrentPlayer));if(!p)return null;
 const markets=nflMarkets[p.position]||nflMarkets.WR,label=markets.find(x=>x[1]===state.nflMarket)?.[0]||markets[0][0],posted=p.lines?.[state.platform]?.[label],manual=state.nflManualLines[nflLineKey(p.id,state.nflMarket,state.platform)],line=Number(state.nflLine??posted??manual??nflDefaultLine(p.position,state.nflMarket)),recent=p.recent||[],rate=parseInt(nflRate(recent,state.nflMarket,line,10))||0,opp=nflOpponentFor(p.team),def=opp?.team?.defense_rank;
 let score=45+rate*.42;if(def)score+=(def-16.5)*.45;score=Math.max(1,Math.min(99,Math.round(score)));
 return {score,rate,label,line,def};
}
function edgeHtml(e,sport){
 if(!e)return'';const cls=e.score>=72?'good':e.score<55?'bad':'',tier=e.score>=80?'STRONG':e.score>=68?'FAVORABLE':e.score>=55?'WATCH':'TOUGH';
 return '<div class="edge-score-card"><div class="edge-score-number '+cls+'">'+e.score+'</div><div><b>RALLO EDGE SCORE • '+tier+'</b><span>'+esc(e.label||'Current market')+' • '+e.rate+'% L10 hit rate'+(sport==='NFL'&&e.def?' • Opp defense #'+e.def:'')+'</span><span>Research score only — not a guaranteed outcome or calibrated win probability.</span></div></div>';
}
function decorateMLBApp(){
 const host=document.getElementById('batterLabPlayer'),p=state.currentLab;if(!host||!p)return;
 let tools=host.querySelector('.app-suite-tools');if(!tools){tools=document.createElement('div');tools.className='app-suite-tools';host.prepend(tools)}
 const e=mlbEdge(),m=movementFor('MLB',p.id,p.market,p.book||state.platform);
 tools.innerHTML=edgeHtml(e,'MLB')+'<div class="app-home-actions"><button onclick="addCurrentToBoard(\'MLB\')">⭐ Add to My Board</button></div>'+lineHistoryHtml('MLB',p.id,p.market,p.book||state.platform);
}
function decorateNFLApp(){
 const host=document.getElementById('nflPlayerDetail'),p=state.nfl.players.find(x=>String(x.id)===String(state.nflCurrentPlayer));if(!host||!p)return;
 let tools=host.querySelector('.app-suite-tools');if(!tools){tools=document.createElement('div');tools.className='app-suite-tools';host.prepend(tools)}
 const e=nflEdge();tools.innerHTML=edgeHtml(e,'NFL')+'<div class="app-home-actions"><button onclick="addCurrentToBoard(\'NFL\')">⭐ Add to My Board</button></div>'+lineHistoryHtml('NFL',p.id,state.nflMarket,state.platform);
}
for(const name of ['renderBatterAnalytics','renderPitcherAnalytics']){
 const prior=window[name];window[name]=function(...args){const v=prior.apply(this,args);decorateMLBApp();return v}
}
{
 const prior=window.openNFLPlayer;window.openNFLPlayer=function(...args){const v=prior.apply(this,args);decorateNFLApp();return v}
}
{
 const prior=window.setLabLineValue;window.setLabLineValue=function(v){const p=state.currentLab;if(p)rememberLine('MLB',p.id,p.market,p.book||state.platform,v);const out=prior.call(this,v);decorateMLBApp();renderAppDashboards();return out}
}
{
 const prior=window.setCompareLine;window.setCompareLine=function(book,v){const p=state.currentLab;if(p)rememberLine('MLB',p.id,p.market,book,v);const out=prior.call(this,book,v);decorateMLBApp();renderAppDashboards();return out}
}
{
 const prior=window.changeNFLLine;window.changeNFLLine=function(v){const p=state.nfl.players.find(x=>String(x.id)===String(state.nflCurrentPlayer));if(p)rememberLine('NFL',p.id,state.nflMarket,state.platform,v);const out=prior.call(this,v);decorateNFLApp();renderAppDashboards();return out}
}
function boardCard(p){
 const k=boardKey(p),move=movementFor(p.sport,p.id,p.market,p.book||state.platform),status=p.status||'watching';
 const result=status==='win'?'✅ WIN':status==='loss'?'❌ LOSS':status==='push'?'➖ PUSH':status==='played'?'🎟️ PLAYED':'👀 WATCHING';
 return '<article class="my-board-card"><div><strong>'+esc(p.name)+' • '+esc(p.sport)+'</strong><small>'+esc(p.label||savedMarketLabel(p))+' • '+esc((p.direction||'more').toUpperCase())+' '+Number(p.line)+' • '+esc(p.book||state.platform)+'</small><small>'+result+(move?' • Line '+move.first+' → '+move.line:'')+'</small><div class="board-actions"><button onclick="gradeBoardPick(\''+esc(k)+'\',\'played\')">Mark played</button><button class="win" onclick="gradeBoardPick(\''+esc(k)+'\',\'win\')">W</button><button class="loss" onclick="gradeBoardPick(\''+esc(k)+'\',\'loss\')">L</button><button onclick="gradeBoardPick(\''+esc(k)+'\',\'push\')">Push</button>'+(p.source==='board'?'<button onclick="removeBoardExtra(\''+esc(k)+'\')">Remove</button>':'')+'</div></div><div><b>'+esc(status.toUpperCase())+'</b></div></article>';
}
function reportHtml(){
 const b=boardExtras.filter(x=>['win','loss','push'].includes(x.status)),w=b.filter(x=>x.status==='win').length,l=b.filter(x=>x.status==='loss').length,p=b.filter(x=>x.status==='push').length,dec=w+l,rate=dec?Math.round(w/dec*100):0;
 const rh=researchHistory||[],rd=rh.filter(x=>['win','loss'].includes(x.status)),rw=rd.filter(x=>x.status==='win').length,rr=rd.length?Math.round(rw/rd.length*100):0;
 const hr=state.hrHistory?.records||[],hs=hr.filter(x=>['hit','miss'].includes(x.status)),hh=hs.filter(x=>x.status==='hit').length,hrate=hs.length?Math.round(hh/hs.length*100):0;
 return '<div class="app-home-card" id="appResultsReport"><h3>📈 Model Report Card</h3><div class="report-grid"><div><b>'+w+'-'+l+'</b><span>MY TRACKED PICKS</span></div><div><b>'+rate+'%</b><span>MY DECIDED RATE</span></div><div><b>'+rr+'%</b><span>TOP 6 MODEL RATE</span></div><div><b>'+hrate+'%</b><span>HR BOARD HIT RATE</span></div></div><p>Only recorded pregame or manually marked results are counted. Pushes are excluded from decided win rate. This is performance tracking, not a profit guarantee.</p></div>';
}
window.renderAppBoard=function(){
 const picks=allBoardPicks(),html='<div class="my-board-list">'+(picks.length?picks.map(boardCard).join(''):'<div class="empty">Open Player Lab and add props you’re considering.</div>')+'</div>'+reportHtml();
 for(const id of ['myBoardRows','nflBoardRows']){const el=document.getElementById(id);if(el)el.innerHTML=html}
}
function appAlerts(){
 const alerts=[],moves=[...new Map(lineHistory.slice(-100).map(x=>[x.key,movementFor(x.sport,x.pid,x.market,x.book)])).values()].filter(x=>x&&Math.abs(x.delta)>=.5).slice(-3);
 moves.forEach(m=>alerts.push({icon:'📈',title:'Line moved',text:m.market+' • '+m.first+' → '+m.line+' on '+m.book}));
 const weather=researchHealth.get('weather');if(weather?.failed)alerts.push({icon:'🌦️',title:'Weather check needs refresh',text:'One or more weather requests failed. RalloPicks will retry while the app is open.'});
 const strong=(state.dailyBatterRanks||[]).filter(x=>x.score>=80).slice(0,2);strong.forEach(x=>alerts.push({icon:'🔥',title:'Strong MLB matchup',text:x.name+' • score '+Math.round(x.score)+' vs '+x.opponent}));
 return alerts.slice(0,5);
}
function top6Names(){
 const rows=(state.dailyBatterRanks||[]).slice(0,6);return rows.length?rows.map((x,i)=>'<p><b>#'+(i+1)+' '+esc(x.name)+'</b> • '+Math.round(x.score)+' • '+esc(x.opponent)+'</p>').join(''):'<p>Full-slate rankings are loading.</p>';
}
window.renderAppDashboards=function(){
 renderAppBoard();const alerts=appAlerts(),alertHtml=alerts.length?alerts.map(a=>'<div class="alert-row"><span>'+a.icon+'</span><div><b>'+esc(a.title)+'</b><span>'+esc(a.text)+'</span></div></div>').join(''):'<p>No new alerts right now.</p>';
 const feed=(()=>{try{return JSON.parse(document.getElementById('dailyHrResearch')?.textContent||'null')}catch{return null}})(),hr1=feed?.top10?.[0],weather=researchHealth.get('weather'),weatherText=weather?.at?new Date(weather.at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'Pending';
 const mlb=document.getElementById('mlbHomeDashboard');if(mlb)mlb.innerHTML='<div class="section-title"><div><h2>RalloPicks Today</h2><span>One screen for today’s research</span></div><span>Weather '+esc(weatherText)+'</span></div><div class="app-home-grid"><div class="app-home-card hero"><h3>🔥 Top 6 Today</h3>'+top6Names()+'<div class="app-home-actions"><button onclick="switchView(\'rankings\')">Open Rankings</button><button onclick="switchView(\'batterlab\')">Player Lab</button></div></div><div class="app-home-card"><h3>⚾ Best HR Research</h3><strong>'+esc(hr1?.person?.fullName||'Loading…')+'</strong><p>'+(hr1?esc(hr1.reason):'Daily HR board loading.')+'</p><button onclick="switchView(\'top20\')">Open HR Board</button></div><div class="app-home-card"><h3>🚨 Alerts</h3>'+alertHtml+'</div><div class="app-home-card"><h3>⭐ My Board</h3><strong>'+allBoardPicks().length+'</strong><p>Saved props across MLB and NFL.</p><button onclick="switchView(\'board\')">Open Board</button></div><div class="app-home-card"><h3>🧪 Results</h3>'+reportHtml()+'</div></div>';
 const nfl=document.getElementById('nflHomeDashboard');if(nfl){const games=state.nfl.games||[],teams=[...(state.nfl.teams||[])].filter(x=>x.games_played>0).sort((a,b)=>(a.offense_rank||99)-(b.offense_rank||99)),best=teams[0];nfl.innerHTML='<div class="section-title"><div><h2>NFL Today</h2><span>Matchups, rankings and saved props</span></div><span>'+games.length+' games loaded</span></div><div class="app-home-grid"><div class="app-home-card hero"><h3>🏈 NFL Research Center</h3><strong>'+(best?esc(best.name):'Season loading')+'</strong><p>'+(best?'#'+best.offense_rank+' scoring offense • '+nflRecord(best):'Rankings activate from completed games.')+'</p><div class="app-home-actions"><button onclick="switchNflView(\'players\')">Player Lab</button><button onclick="switchNflView(\'ranks\')">Rankings</button></div></div><div class="app-home-card"><h3>⭐ My Board</h3><strong>'+allBoardPicks().filter(x=>x.sport==='NFL').length+'</strong><p>NFL props saved for comparison and tracking.</p><button onclick="switchNflView(\'board\')">Open Board</button></div><div class="app-home-card"><h3>📈 App Alerts</h3>'+alertHtml+'</div>'+reportHtml()+'</div>'}
};
const oldMlb=window.switchView;
window.switchView=function(v){
 if(v==='home'||v==='board'){
  if(!requireMembership())return;document.body.classList.remove('player-profile-open');document.querySelectorAll('#mlbNav button').forEach(x=>x.classList.toggle('active',x.dataset.view===v));
  ['mlbHomeView','myBoardView','matchupsView','moneylineView','batterlabView','batterRankingsView','top20View'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display='none'});
  const el=document.getElementById(v==='home'?'mlbHomeView':'myBoardView');if(el)el.style.display='block';renderAppDashboards();if(v==='home'){ensureHrModelData();loadDailyBatterRanks().then?.(()=>renderAppDashboards())}return;
 }
 return oldMlb(v);
};
const oldNfl=window.switchNflView;
window.switchNflView=function(v){
 if(v==='home'||v==='board'){
  if(!requireMembership())return;document.querySelectorAll('#nflNav button').forEach(b=>b.classList.toggle('active',b.dataset.nflView===v));
  ['nflHomeView','nflBoardView','nflPlayersView','nflRanksView','nflMoneylineView','nflStandingsView'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none'});
  const el=document.getElementById(v==='home'?'nflHomeView':'nflBoardView');if(el)el.style.display='block';renderAppDashboards();return;
 }
 return oldNfl(v);
};
function routeApp(route){
 document.querySelectorAll('#appBottomNav button').forEach(b=>b.classList.toggle('active',b.dataset.appRoute===route));
 if(route==='home')state.currentSport==='NFL'?switchNflView('home'):switchView('home');
 if(route==='research')state.currentSport==='NFL'?switchNflView('ranks'):switchView('top20');
 if(route==='lab')state.currentSport==='NFL'?switchNflView('players'):switchView('batterlab');
 if(route==='board')state.currentSport==='NFL'?switchNflView('board'):switchView('board');
 if(route==='results'){state.currentSport==='NFL'?switchNflView('board'):switchView('board');setTimeout(()=>document.getElementById('appResultsReport')?.scrollIntoView({behavior:'smooth',block:'start'}),50)}
}
document.querySelectorAll('#appBottomNav button').forEach(b=>b.onclick=()=>routeApp(b.dataset.appRoute));
const priorSetSport=window.setSport;window.setSport=function(name){const out=priorSetSport(name);setTimeout(()=>{name==='NFL'?switchNflView('home'):switchView('home');renderAppDashboards()},0);return out};
renderAppBoard();renderAppDashboards();setTimeout(()=>{if(state.currentSport==='NFL')switchNflView('home');else switchView('home')},0);
setInterval(()=>renderAppDashboards(),120000);
})();
