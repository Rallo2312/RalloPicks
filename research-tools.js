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
const BOARD_KEY='ralloBoardV2',LINE_KEY='ralloLineHistoryV2',BATTLE_KEY='ralloPropBattleV1',FINAL_KEY='ralloFinalCardV1';
let battleKeys=readResearchStorage(BATTLE_KEY);let finalKeys=readResearchStorage(FINAL_KEY);
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
 const rec=sport==='NFL'?nflRecommendation():mlbRecommendation();if(rec?.best){p.ralloScore=rec.best.score;p.bestMarket=rec.best.label;p.trapRisk=trapDetector(sport,rec)?.level||'LOW'}
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
 if(!e)return'';
 const cls=e.score>=72?'good':e.score<55?'bad':'',tier=e.score>=80?'STRONG':e.score>=68?'FAVORABLE':e.score>=55?'WATCH':'TOUGH';
 const direction=e.dir==='less'?'UNDER':e.dir==='more'?'OVER':'';
 const arrow=e.dir==='less'?'🔻':e.dir==='more'?'🔺':'';
 const meaning=e.score>=80?'Excellent research setup':e.score>=68?'Good research setup':e.score>=55?'Mixed setup — use caution':'Weak setup — consider passing';
 return '<div class="edge-score-card"><div class="edge-score-number '+cls+'">'+e.score+'<small style="display:block;font-size:8px;margin-top:5px">'+tier+'</small></div><div><b>RALLO EDGE SCORE • '+meaning.toUpperCase()+'</b><span>'+esc(e.label||'Current market')+(direction?' • LEAN: '+direction+' '+arrow:'')+' • '+e.rate+'% L10 hit rate'+(sport==='NFL'&&e.def?' • Opp defense #'+e.def:'')+'</span><span><b>WHAT IT MEANS:</b> '+meaning+'. Higher scores mean the available research supports the play more strongly; this is not a win probability.</span></div></div>';
}

function mlbRecommendation(){
 const p=state.currentLab;if(!p)return null;
 const table=p.kind==='pitcher'?PITCHER_ANALYTIC_MARKETS:ANALYTIC_MARKETS,recent=(p.games||[]).slice(0,10);
 const rows=Object.entries(table).map(([key,m])=>{
  const line=key===p.market?Number(p.line):Number(m.defaultLine);
  const more=pctHit(recent,m,line,'more'),less=pctHit(recent,m,line,'less'),direction=more>=less?'more':'less',rate=Math.max(more,less);
  let score=42+rate*.46;
  if(p.kind==='batter'){
   const mix=arsenalPowerMatch(p.id,p.pitcher?.id);score+=(mix.factor-1)*50;
   const q=state.hrQuality?.players?.[String(p.id)];
   if(q&&['homeRuns','totalBases','hits','fantasy'].includes(key))score+=(Number(q.hardHitRate||40)-40)*.15+(Number(q.barrelRate||8)-8)*.32;
   if(key==='homeRuns'&&Number(q?.barrelRate)>=12)score+=5;
  }else{
   const opp=p.opponent?.id?state.dailyBatterRanks.filter(x=>x.teamId===p.opponent.id):[];
   if(opp.length&&['strikeOuts','earnedRuns','hitsAllowed'].includes(key)){const avg=opp.slice(0,5).reduce((a,x)=>a+x.score,0)/Math.min(5,opp.length);score+=(60-avg)*.12*(direction==='more'?1:-1)}
  }
  return {key,label:m.label,line,direction,rate,score:Math.max(1,Math.min(99,Math.round(score)))};
 }).sort((a,b)=>b.score-a.score);
 const best=rows[0],second=rows[1],reasons=[],concerns=[];
 if(best.rate>=70)reasons.push(best.rate+'% L10 hit rate at '+best.line);
 if(p.kind==='batter'){
  const mix=arsenalPowerMatch(p.id,p.pitcher?.id),q=state.hrQuality?.players?.[String(p.id)];
  if(mix.factor>=1.05)reasons.push('Favorable pitch-type matchup');
  if(Number(q?.barrelRate)>=10)reasons.push(Number(q.barrelRate).toFixed(1)+'% barrel rate');
  if(Number(q?.hardHitRate)>=45)reasons.push(Number(q.hardHitRate).toFixed(1)+'% hard-hit rate');
  const game=state.games.find(g=>[g.teams.away.team.abbreviation,g.teams.home.team.abbreviation].includes(p.team));
  const w=game?weatherForGame(game.gamePk):null;if(w?.factor>=1.03)reasons.push(w.label+' HR environment');
  if(best.rate>=80&&second&&second.rate<60)concerns.push('Recent results are concentrated in one market');
  if(mix.factor<=.95)concerns.push('Pitch mix is not a clear advantage');
  if(Number(q?.barrelRate)<7)concerns.push('Barrel rate is below power-target level');
 }else{
  if(best.rate>=70)reasons.push('Recent workload supports this market');
  if(p.opponent?.name)reasons.push('Opponent matchup included in score');
 }
 if(recent.length<7)concerns.push('Small recent sample');
 const confidence=best.score>=82?'STRONG':best.score>=70?'GOOD':best.score>=58?'LEAN':'PASS';
 return {best,confidence,reasons:reasons.slice(0,4),concerns:concerns.slice(0,2),alternatives:rows.slice(1,3)};
}
function nflRecommendation(){
 const p=state.nfl.players.find(x=>String(x.id)===String(state.nflCurrentPlayer));if(!p)return null;
 const markets=nflMarkets[p.position]||nflMarkets.WR,recent=p.recent||[],opp=nflOpponentFor(p.team),def=opp?.team?.defense_rank;
 const rows=markets.map(([label,key])=>{
  const posted=p.lines?.[state.platform]?.[label],manual=state.nflManualLines[nflLineKey(p.id,key,state.platform)],line=Number((key===state.nflMarket?state.nflLine:null)??posted??manual??nflDefaultLine(p.position,key));
  const more=parseInt(nflRate(recent,key,line,10))||0;
  const vals=recent.slice(0,10).map(g=>Number(g[key])).filter(Number.isFinite),less=vals.length?Math.round(vals.filter(v=>v<line).length/vals.length*100):0;
  const direction=more>=less?'more':'less',rate=Math.max(more,less);let score=43+rate*.45;
  if(def)score+=(def-16.5)*.38*(direction==='more'?1:-1);
  return {key,label,line,direction,rate,score:Math.max(1,Math.min(99,Math.round(score)))};
 }).sort((a,b)=>b.score-a.score);
 const best=rows[0],reasons=[],concerns=[];
 if(best.rate>=70)reasons.push(best.rate+'% L10 hit rate at '+best.line);
 if(def>=23&&best.direction==='more')reasons.push('Opponent defense ranks #'+def+' (favorable)');
 if(def<=10&&best.direction==='less')reasons.push('Top-10 opponent defense supports lower lean');
 if(recent.length<7)concerns.push('Limited recent-game sample');
 if(def&&def<=10&&best.direction==='more')concerns.push('Strong opponent defense');
 if(!p.lines?.[state.platform]?.[best.label])concerns.push('Verify the current '+state.platform+' line');
 const confidence=best.score>=82?'STRONG':best.score>=70?'GOOD':best.score>=58?'LEAN':'PASS';
 return {best,confidence,reasons:reasons.slice(0,4),concerns:concerns.slice(0,2),alternatives:rows.slice(1,3)};
}

function betGate(sport,rec){
 if(!rec?.best)return {status:'PASS',cls:'pass',label:'🛑 PASS',reason:'Not enough usable data yet',checks:[]};
 const b=rec.best,checks=[],fail=[];
 checks.push({ok:b.score>=72,label:'Model score 72+'});
 checks.push({ok:b.rate>=60,label:'Recent hit rate 60%+'});
 checks.push({ok:(rec.concerns?.length||0)<=1,label:'No more than 1 major concern'});
 if(sport==='MLB'){
  const p=state.currentLab,mix=p&&p.kind==='batter'?arsenalPowerMatch(p.id,p.pitcher?.id):null,q=p?state.hrQuality?.players?.[String(p.id)]:null;
  if(p?.kind==='batter'&&['homeRuns','totalBases','hits','fantasy'].includes(b.key)){
   const contactOk=!q||(Number(q.barrelRate||0)>=8||Number(q.hardHitRate||0)>=40);
   checks.push({ok:contactOk,label:'Contact quality not weak'});
  }
  if(mix)checks.push({ok:mix.factor>=.95,label:'Pitch matchup not a clear negative'});
 }else{
  const p=state.nfl.players.find(x=>String(x.id)===String(state.nflCurrentPlayer));
  const verified=!!p?.lines?.[state.platform]?.[b.label];
  checks.push({ok:verified,label:'Current app line verified'});
 }
 let move=null;
 if(sport==='MLB'&&state.currentLab)move=movementFor('MLB',state.currentLab.id,state.currentLab.market,state.currentLab.book||state.platform);
 if(sport==='NFL'){
  const p=state.nfl.players.find(x=>String(x.id)===String(state.nflCurrentPlayer));if(p)move=movementFor('NFL',p.id,state.nflMarket,state.platform);
 }
 if(move){
  const against=(b.direction==='more'&&move.delta>0)||(b.direction==='less'&&move.delta<0);
  checks.push({ok:!against||Math.abs(move.delta)<.5,label:'Line movement not strongly against us'});
 }
 checks.forEach(x=>{if(!x.ok)fail.push(x.label)});
 const trap=trapDetectorCore(sport,rec);
 if(trap?.level==='HIGH')fail.push('High trap risk');
 const passes=checks.filter(x=>x.ok).length,total=checks.length||1;
 if(!fail.length&&b.score>=82&&b.rate>=70)return {status:'GREEN',cls:'green',label:'🟢 GREEN LIGHT',reason:'Strong score + recent form + no major filter failure',checks,passes,total};
 if(fail.length<=1&&b.score>=72&&b.rate>=60&&trap?.level!=='HIGH')return {status:'WATCH',cls:'watch',label:'🟡 WATCH',reason:'Close, but one filter still needs attention',checks,passes,total};
 return {status:'PASS',cls:'pass',label:'🛑 PASS',reason:fail.slice(0,2).join(' • ')||'Edge is not strong enough',checks,passes,total};
}
function gateHtml(g){
 if(!g)return'';
 return '<section class="bet-gate '+g.cls+'"><div><small>BET FILTER</small><strong>'+esc(g.label)+'</strong><span>'+esc(g.reason)+'</span></div><div class="bet-gate-checks">'+(g.checks||[]).map(x=>'<span class="'+(x.ok?'ok':'no')+'">'+(x.ok?'✓':'×')+' '+esc(x.label)+'</span>').join('')+'</div></section>';
}
function trapDetectorCore(sport,rec){
 if(!rec?.best)return null;
 const reasons=[],b=rec.best;
 if(b.rate>=80&&b.score<72)reasons.push('Hot L10 results are stronger than the full matchup score');
 if(rec.concerns?.length)reasons.push(...rec.concerns);
 let move=null;
 if(sport==='MLB'&&state.currentLab)move=movementFor('MLB',state.currentLab.id,state.currentLab.market,state.currentLab.book||state.platform);
 if(sport==='NFL'){
  const p=state.nfl.players.find(x=>String(x.id)===String(state.nflCurrentPlayer));
  if(p)move=movementFor('NFL',p.id,state.nflMarket,state.platform);
 }
 if(move){
  const unfavorable=(b.direction==='more'&&move.delta>0)||(b.direction==='less'&&move.delta<0);
  if(unfavorable&&Math.abs(move.delta)>=.5)reasons.push('Line moved against the recommended side: '+move.first+' → '+move.line);
 }
 let risk=0;if(b.rate>=80&&b.score<72)risk+=2;risk+=Math.min(2,rec.concerns?.length||0);if(move&&Math.abs(move.delta)>=.5)risk++;
 const level=risk>=4?'HIGH':risk>=2?'MEDIUM':'LOW',cls=level==='HIGH'?'high':level==='MEDIUM'?'medium':'low';
 return {level,cls,reasons:reasons.slice(0,3)};
}
function trapDetector(sport,rec){return trapDetectorCore(sport,rec);}
function trapHtml(t){
 if(!t)return'';
 return '<section class="trap-card '+t.cls+'"><div><b>🚫 TRAP DETECTOR</b><strong>'+t.level+' RISK</strong></div><div>'+(t.reasons.length?t.reasons.map(x=>'<span>• '+esc(x)+'</span>').join(''):'<span>✓ No major trap pattern detected from the available data.</span>')+'</div></section>';
}

function regressionRadar(sport){
 if(sport==='MLB'){
  const p=state.currentLab;if(!p)return null;
  const recent=(p.games||[]).slice(0,10),season=(p.games||[]);
  if(!recent.length||!season.length)return null;
  const market=(p.kind==='pitcher'?PITCHER_ANALYTIC_MARKETS:ANALYTIC_MARKETS)[p.market];if(!market)return null;
  const rv=recent.map(g=>market.value(g.stat||{})).filter(Number.isFinite),sv=season.map(g=>market.value(g.stat||{})).filter(Number.isFinite);
  if(!rv.length||!sv.length)return null;
  const ravg=rv.reduce((a,b)=>a+b,0)/rv.length,savg=sv.reduce((a,b)=>a+b,0)/sv.length,diff=savg?((ravg-savg)/savg):0;
  const q=state.hrQuality?.players?.[String(p.id)],qualityBoost=p.kind==='batter'&&q?(Number(q.barrelRate||8)-8)*.02+(Number(q.hardHitRate||40)-40)*.008:0;
  let label='NORMAL',tone='normal',reason='Recent production is close to the longer-term baseline.';
  if(diff<=-.18&&qualityBoost>0){label='BUY LOW';tone='buy';reason='Recent results are below baseline while underlying contact remains supportive.'}
  else if(diff>=.22&&qualityBoost<=0){label='SELL HIGH';tone='sell';reason='Recent results are running well above baseline without matching underlying support.'}
  else if(diff<=-.22){label='BUY LOW';tone='buy';reason='Recent production is meaningfully below the season baseline.'}
  else if(diff>=.28){label='SELL HIGH';tone='sell';reason='Recent production is well above the season baseline and may cool.'}
  return {label,tone,reason,recent:ravg,baseline:savg,diff};
 }
 const p=state.nfl.players.find(x=>String(x.id)===String(state.nflCurrentPlayer));if(!p)return null;
 const recent=(p.recent||[]).slice(0,10),key=state.nflMarket;if(!recent.length||!key)return null;
 const vals=recent.map(g=>Number(g[key])).filter(Number.isFinite);if(vals.length<4)return null;
 const first=vals.slice(0,Math.ceil(vals.length/2)),last=vals.slice(Math.ceil(vals.length/2));
 const a=first.reduce((x,y)=>x+y,0)/first.length,b=last.length?last.reduce((x,y)=>x+y,0)/last.length:a,diff=a?((b-a)/a):0;
 let label='NORMAL',tone='normal',reason='Recent usage and production are relatively stable.';
 if(diff<=-.2){label='BUY LOW';tone='buy';reason='Recent production has cooled meaningfully versus the earlier sample.'}
 else if(diff>=.25){label='SELL HIGH';tone='sell';reason='Recent production is running well above the earlier sample.'}
 return {label,tone,reason,recent:b,baseline:a,diff};
}
function regressionHtml(r){
 if(!r)return'';
 return '<section class="regression-card '+r.tone+'"><div><small>📉 REGRESSION RADAR</small><strong>'+esc(r.label)+'</strong></div><div><b>'+esc(r.reason)+'</b><span>Recent avg '+Number(r.recent).toFixed(1)+' • Baseline '+Number(r.baseline).toFixed(1)+' • '+(r.diff>=0?'+':'')+Math.round(r.diff*100)+'%</span></div></section>';
}
function scoreBreakdownHtml(rec,sport){
 if(!rec?.best)return'';
 const b=rec.best,items=[];
 const form=Math.round((b.rate-50)*.36);items.push(['Recent form',form]);
 if(sport==='MLB'&&state.currentLab){
  const p=state.currentLab,mix=p.kind==='batter'?arsenalPowerMatch(p.id,p.pitcher?.id):null;
  if(mix)items.push(['Pitch matchup',Math.round((mix.factor-1)*50)]);
  const q=state.hrQuality?.players?.[String(p.id)];
  if(q)items.push(['Contact quality',Math.round((Number(q.barrelRate||8)-8)*.35+(Number(q.hardHitRate||40)-40)*.15)]);
  const game=state.games.find(g=>[g.teams.away.team.abbreviation,g.teams.home.team.abbreviation].includes(p.team)),w=game?weatherForGame(game.gamePk):null;
  if(w)items.push(['Weather / park',Math.round((Number(w.factor)-1)*40)]);
 }else if(sport==='NFL'){
  const p=state.nfl.players.find(x=>String(x.id)===String(state.nflCurrentPlayer)),opp=p?nflOpponentFor(p.team):null,def=opp?.team?.defense_rank;
  if(def)items.push(['Opponent defense',Math.round((def-16.5)*.38*(b.direction==='more'?1:-1))]);
 }
 const t=trapDetector(sport,rec);if(t?.level==='HIGH')items.push(['Trap risk',-8]);else if(t?.level==='MEDIUM')items.push(['Trap risk',-3]);
 return '<details class="score-breakdown"><summary>🔬 Why '+b.score+'? Score breakdown</summary><div>'+items.map(([name,v])=>'<p><span>'+esc(name)+'</span><b class="'+(v>0?'plus':v<0?'minus':'')+'">'+(v>0?'+':'')+v+'</b></p>').join('')+'<small>Breakdown is an explanatory approximation of the current heuristic, not an independently calibrated model.</small></div></details>';
}
function recommendationHtml(rec,sport){
 if(!rec)return'';
 const b=rec.best,gate=betGate(sport,rec),cls=gate.status==='PASS'?'bad':b.score>=72?'good':b.score<55?'bad':'neutral',lean=b.direction==='more'?'MORE':'LESS',directionLabel=b.direction==='more'?'OVER':'UNDER',directionArrow=b.direction==='more'?'🔺':'🔻';
 return gateHtml(gate)+'<section class="rallo-read '+cls+'"><div class="rallo-read-head"><div><small>🧠 RALLO READ</small><strong>'+b.score+'<em>/100</em></strong><small style="margin-top:6px;color:'+(b.direction==='more'?'#ffcc55':'#2eea8b')+';font-size:9px">'+esc(rec.confidence)+' '+directionLabel+' '+directionArrow+'</small></div><span>'+esc(rec.confidence)+'</span></div><div class="rallo-read-pick"><div><small>BEST MARKET</small><b>'+esc(b.label)+'</b></div><div><small>LEAN</small><b>'+lean+' '+b.line+'</b></div><div><small>L10</small><b>'+b.rate+'%</b></div></div><div class="rallo-read-copy"><div><b>WHY</b>'+(rec.reasons.length?rec.reasons.map(x=>'<span>✓ '+esc(x)+'</span>').join(''):'<span>• No strong positive signal yet</span>')+'</div><div><b>CONCERN</b>'+(rec.concerns.length?rec.concerns.map(x=>'<span>⚠ '+esc(x)+'</span>').join(''):'<span>• No major model concern flagged</span>')+'</div></div>'+(rec.alternatives?.length?'<div class="rallo-read-alt"><b>Next best:</b> '+rec.alternatives.map(x=>esc(x.label)+' '+(x.direction==='more'?'More ':'Less ')+x.line+' ('+x.score+')').join(' • ')+'</div>':'')+'<div class="rallo-read-note">Rallo Read is a research heuristic from current stats, matchup and available lines — not a guarantee or calibrated win probability.</div></section>';
}
function decorateMLBApp(){
 const host=document.getElementById('batterLabPlayer'),p=state.currentLab;if(!host||!p)return;
 let tools=host.querySelector('.app-suite-tools');if(!tools){tools=document.createElement('div');tools.className='app-suite-tools';host.prepend(tools)}
 const e=mlbEdge(),m=movementFor('MLB',p.id,p.market,p.book||state.platform);
 const rec=mlbRecommendation(),trap=trapDetector('MLB',rec),reg=regressionRadar('MLB'),gate=betGate('MLB',rec);tools.innerHTML=recommendationHtml(rec,'MLB')+scoreBreakdownHtml(rec,'MLB')+regressionHtml(reg)+trapHtml(trap)+edgeHtml(e,'MLB')+'<div class="app-home-actions"><button onclick="addCurrentToBoard(\'MLB\')">⭐ Add to My Board</button>'+(gate.status==='PASS'?'<span class="pass-note">🛑 RalloPicks recommends passing this setup right now.</span>':'')+'</div>'+lineHistoryHtml('MLB',p.id,p.market,p.book||state.platform);
}
function decorateNFLApp(){
 const host=document.getElementById('nflPlayerDetail'),p=state.nfl.players.find(x=>String(x.id)===String(state.nflCurrentPlayer));if(!host||!p)return;
 let tools=host.querySelector('.app-suite-tools');if(!tools){tools=document.createElement('div');tools.className='app-suite-tools';host.prepend(tools)}
 const e=nflEdge(),rec=nflRecommendation(),trap=trapDetector('NFL',rec),reg=regressionRadar('NFL'),gate=betGate('NFL',rec);tools.innerHTML=recommendationHtml(rec,'NFL')+scoreBreakdownHtml(rec,'NFL')+regressionHtml(reg)+trapHtml(trap)+edgeHtml(e,'NFL')+'<div class="app-home-actions"><button onclick="addCurrentToBoard(\'NFL\')">⭐ Add to My Board</button>'+(gate.status==='PASS'?'<span class="pass-note">🛑 RalloPicks recommends passing this setup right now.</span>':'')+'</div>'+lineHistoryHtml('NFL',p.id,state.nflMarket,state.platform);
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

function persistBattle(){writeResearchStorage(BATTLE_KEY,battleKeys);}
window.toggleBattlePick=function(k){
 const i=battleKeys.indexOf(k);
 if(i>=0)battleKeys.splice(i,1);else{if(battleKeys.length>=4)battleKeys.shift();battleKeys.push(k)}
 persistBattle();renderAppBoard();
}
function battleScore(p){
 let score=Number(p.ralloScore);
 if(!Number.isFinite(score))score=50;
 const move=movementFor(p.sport,p.id,p.market,p.book||state.platform);
 if(move){const unfavorable=(p.direction==='more'&&move.delta>0)||(p.direction==='less'&&move.delta<0);if(unfavorable)score-=Math.min(8,Math.abs(move.delta)*4)}
 if(p.trapRisk==='HIGH')score-=8;else if(p.trapRisk==='MEDIUM')score-=3;
 return Math.max(1,Math.min(99,Math.round(score)));
}
function propBattleHtml(picks){
 const selected=picks.filter(p=>battleKeys.includes(boardKey(p))).slice(0,4);
 if(selected.length<2)return '<section class="prop-battle"><div class="model-head"><b>⚔️ Prop Battle</b><span>Select 2–4 picks below</span></div><p>Tap “Add to Battle” on picks you want compared. RalloPicks will rank them using the saved Rallo score, trap risk and line movement.</p></section>';
 const ranked=[...selected].sort((a,b)=>battleScore(b)-battleScore(a));
 return '<section class="prop-battle"><div class="model-head"><b>⚔️ Prop Battle</b><span>'+selected.length+' selected</span></div><div class="battle-winner">👑 #1 '+esc(ranked[0].name)+' • '+esc(ranked[0].label||ranked[0].market)+' • '+battleScore(ranked[0])+'</div>'+ranked.map((p,i)=>'<article class="battle-row"><b>#'+(i+1)+'</b><div><strong>'+esc(p.name)+'</strong><span>'+esc(p.sport)+' • '+esc(p.label||p.market)+' • '+esc((p.direction||'more').toUpperCase())+' '+Number(p.line)+'</span><span>Trap: '+esc(p.trapRisk||'UNKNOWN')+'</span></div><em>'+battleScore(p)+'</em></article>').join('')+'<button class="six-refresh" onclick="battleKeys=[];persistBattle();renderAppBoard()">Clear Battle</button></section>';
}

function persistFinal(){writeResearchStorage(FINAL_KEY,finalKeys);}
window.toggleFinalPick=function(k){
 const i=finalKeys.indexOf(k);
 if(i>=0)finalKeys.splice(i,1);else{if(finalKeys.length>=6)return;finalKeys.push(k)}
 persistFinal();renderAppBoard();renderAppDashboards();
}
function finalCardHtml(picks){
 const selected=picks.filter(p=>finalKeys.includes(boardKey(p))).slice(0,6),ranked=[...selected].sort((a,b)=>battleScore(b)-battleScore(a));
 return '<section class="final-card-builder"><div class="model-head"><b>👑 Final Card Builder</b><span>'+selected.length+'/6 selected</span></div>'+(ranked.length?'<div class="final-card-grid">'+ranked.map((p,i)=>'<article><b>#'+(i+1)+'</b><div><strong>'+esc(p.name)+'</strong><span>'+esc(p.sport)+' • '+esc(p.label||p.market)+' • '+esc((p.direction||'more').toUpperCase())+' '+Number(p.line)+'</span></div><em>'+battleScore(p)+'</em></article>').join('')+'</div>':'<p>Select picks below to build your final card. RalloPicks ranks them by saved score, trap risk and line movement.</p>')+(selected.length?'<button class="six-refresh" onclick="finalKeys=[];persistFinal();renderAppBoard()">Clear Final Card</button>':'')+'</section>';
}

function sleeperFinderRows(){
 const rows=(state.dailyBatterRanks||[])
  .filter(x=>Number(x.rank)>10&&Number(x.rank)<=45&&Number(x.score)>=58&&x.lineup?.status!=='out')
  .map(x=>{
    let sleeperScore=Number(x.score)||0;
    if(Number(x.barrelRate)>=10)sleeperScore+=5;
    if(Number(x.hardHitRate)>=43)sleeperScore+=4;
    if(Number(x.hr9)>=1.25)sleeperScore+=4;
    if(Number(x.weather?.factor)>1.03)sleeperScore+=3;
    if(x.pitchMatch&&!/neutral|unknown|tbd/i.test(String(x.pitchMatch)))sleeperScore+=3;
    if(Number(x.hr)<=30)sleeperScore+=3;
    return {...x,sleeperScore:Math.round(sleeperScore)};
  })
  .sort((a,b)=>b.sleeperScore-a.sleeperScore||a.rank-b.rank)
  .slice(0,5);
 return rows;
}
function sleeperReason(x){
 const bits=[];
 if(Number(x.barrelRate)>=10)bits.push('strong barrel rate');
 if(Number(x.hardHitRate)>=43)bits.push('hard-contact profile');
 if(Number(x.hr9)>=1.25)bits.push('HR-prone opposing starter');
 if(Number(x.weather?.factor)>1.03)bits.push('helpful run environment');
 if(x.pitchMatch&&!/neutral|unknown|tbd/i.test(String(x.pitchMatch)))bits.push(String(x.pitchMatch));
 if(Number(x.lineupSpot)&&Number(x.lineupSpot)<=5)bits.push('top-5 lineup spot');
 return bits.slice(0,3).join(' • ')||'solid full-slate matchup score';
}
window.renderSleeperFinder=function(){
 const host=document.getElementById('sleeperFinderRows');if(!host)return;
 const rows=sleeperFinderRows();
 host.innerHTML=rows.map((x,i)=>`
  <article class="hr-card">
   ${playerAvatar(x.name,x.id)}
   <div>
    <div class="bat-order">SLEEPER #${i+1} • ${esc(x.teamAbbr||'')} • vs ${esc(x.opponent||'TBD')}</div>
    <div class="batter-name">${esc(x.name)}</div>
    <div class="bat-side">${esc(sleeperReason(x))}</div>
    ${hrOddsHtml(x)}
    <div class="props"><button class="prop" onclick="openBatterLab(${Number(x.id)},'${esc(x.name).replace(/'/g,"\\'")}','${esc(x.teamAbbr||'')}');switchView('batterlab')">🔎 PLAYER LAB</button></div>
   </div>
   <div style="text-align:center"><b style="font-size:18px;color:var(--yellow)">${x.sleeperScore}</b><span style="display:block;font-size:7px;color:var(--muted)">SLEEPER SCORE</span></div>
  </article>`).join('')||'<div class="empty">No strong sleeper HR spots qualify yet. Check again after lineups and matchup data update.</div>';
};

function normHrOddsName(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'')}
function hrOddsForPlayer(name){
 const rows=state.hrOdds?.rows||[],key=normHrOddsName(name);
 return rows.find(r=>normHrOddsName(r.playerName)===key)||null;
}
async function ensureHrOdds(){
 if(state.hrOddsLoaded||state.hrOddsLoading)return;
 state.hrOddsLoading=true;
 try{
  const r=await fetch('data/hr-odds.json?d='+Date.now(),{cache:'no-store'});
  if(r.ok)state.hrOdds=await r.json();
 }catch(e){}
 state.hrOddsLoaded=true;state.hrOddsLoading=false;
 window.renderSleeperFinder?.();window.renderHrMatchupSpotlights?.();
}
function hrOddsHtml(x){
 const o=hrOddsForPlayer(x?.name);if(!o)return '<div class="hr-verified-odds pending">Verified HR odds pending</div>';
 const books=(o.books||[]).slice(0,3).map(b=>esc(b.bookName)+' '+esc(b.odds)).join(' • ');
 return '<div class="hr-verified-odds"><b>VERIFIED HR ODDS</b><strong>'+esc(o.bestOdds)+' <em>'+esc(o.bestBookName)+'</em></strong>'+(books?'<span>'+books+'</span>':'')+'</div>';
}
function hrSpotCard(label,x,tone,detail){
 if(!x)return '';
 return '<article class="hr-spot-card '+tone+'" onclick="openBatterLab('+Number(x.id)+',\''+esc(x.name).replace(/'/g,"\\'")+'\',\''+esc(x.teamAbbr||'')+'\');switchView(\'batterlab\')"><span class="hr-spot-label">'+esc(label)+'</span><div class="hr-spot-player">'+playerAvatar(x.name,x.id)+'<div><strong>'+esc(x.name)+'</strong><small>'+esc(x.teamAbbr||'')+' • vs '+esc(x.pitcher||x.opponent||'TBD')+'</small></div></div><div class="hr-spot-score"><b>'+Math.round(Number(x.score)||0)+'</b>'+esc(detail)+'</div>'+hrOddsHtml(x)+'</article>';
}
window.renderHrMatchupSpotlights=function(){
 const host=document.getElementById('hrMatchupSpotlights');if(!host)return;
 ensureHrOdds();
 const gameByPk=new Map((state.games||[]).map(g=>[String(g.gamePk),g]));
 const notStarted=x=>{
  const g=gameByPk.get(String(x.gamePk));
  if(!g)return true; // don't blank the board just because a rank row lacks schedule metadata
  const abstract=String(g.status?.abstractGameState||'').toLowerCase();
  const detailed=String(g.status?.detailedState||'').toLowerCase();
  const coded=String(g.status?.codedGameState||'');
  const firstPitch=new Date(g.gameDate).getTime();
  const started=abstract==='live'||abstract==='final'||/in progress|game over|final|completed/.test(detailed)||['I','F','O'].includes(coded)||(Number.isFinite(firstPitch)&&Date.now()>=firstPitch);
  return !started;
 };
 const rows=(state.dailyBatterRanks||[]).filter(x=>x.lineup?.status!=='out'&&notStarted(x));
 if(!rows.length){host.innerHTML='<div class="empty">No MLB games that have not started are available right now.</div>';return;}
 const groups=new Map();
 rows.forEach(x=>{const k=[x.teamId,x.gamePk].join(':');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x)});
 const sections=[...groups.values()].sort((a,b)=>{
  const ga=gameByPk.get(String(a[0]?.gamePk)),gb=gameByPk.get(String(b[0]?.gamePk));
  return new Date(ga?.gameDate||0)-new Date(gb?.gameDate||0);
 }).map(teamRows=>{
  const sorted=[...teamRows].sort((a,b)=>b.score-a.score);
  const obvious=sorted[0];
  const hidden=[...teamRows].filter(x=>Number(x.rank)>10).map(x=>{let s=Number(x.score)||0;if(Number(x.barrelRate)>=10)s+=5;if(Number(x.hardHitRate)>=43)s+=4;if(Number(x.hr9)>=1.25)s+=4;if(Number(x.weather?.factor)>1.03)s+=3;return {...x,_hidden:s}}).sort((a,b)=>b._hidden-a._hidden)[0]||sorted[Math.min(1,sorted.length-1)];
  const power=[...teamRows].map(x=>({...x,_power:(Number(x.barrelRate)||0)*2+(Number(x.hardHitRate)||0)*.35+(Number(x.hr9)||1.15)*8})).sort((a,b)=>b._power-a._power)[0]||obvious;
  const head=obvious?esc(obvious.teamAbbr||'TEAM')+' vs '+esc(obvious.pitcher||'Starter TBD'):'Matchup';
  return '<section class="hr-matchup-spotlight"><div class="hr-matchup-head"><strong>'+head+'</strong><span>Rallo matchup scan • tap a player for Player Lab</span></div><div class="hr-matchup-scroll">'+
   hrSpotCard('🔥 MOST OBVIOUS',obvious,'obvious','Top team HR research score')+
   hrSpotCard('💎 MOST HIDDEN',hidden,'hidden','Best under-the-radar profile')+
   hrSpotCard('⚡ BEST POWER MATCH',power,'power','Best barrel / hard-hit / pitcher blend')+
   '</div></section>';
 }).slice(0,8);
 host.innerHTML='<div class="hr-matchup-spotlights">'+sections.join('')+'</div>';
};

// Keep the matchup scan in sync after rankings/schedule data arrive and when Research is opened.
function refreshHrMatchupScan(){
 try{window.renderHrMatchupSpotlights?.()}catch(e){console.warn('HR matchup scan render',e)}
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshHrMatchupScan()});
window.addEventListener('focus',refreshHrMatchupScan);
setTimeout(refreshHrMatchupScan,800);
setTimeout(refreshHrMatchupScan,2500);
setInterval(refreshHrMatchupScan,60000);

function hiddenEdgesHtml(){
 const mlb=(state.dailyBatterRanks||[]).filter(x=>x.score>=68).slice(6,18).sort((a,b)=>b.score-a.score).slice(0,5);
 const nfl=(state.nfl.players||[]).map(p=>{const opp=nflOpponentFor(p.team),def=opp?.team?.defense_rank,s=p.season||{},usage=p.position==='RB'?Number(s.rush_attempts||0)+Number(s.targets||0):p.position==='QB'?Number(s.pass_attempts||0)+Number(s.rush_attempts||0):Number(s.targets||0);let score=45+Math.min(28,usage/10)+(def?Math.max(-5,Math.min(10,(def-16.5)*.6)):0);return {p,score:Math.round(score),def}}).filter(x=>x.score>=65).sort((a,b)=>b.score-a.score).slice(0,5);
 if(!mlb.length&&!nfl.length)return '<section class="hidden-edge-card"><div class="model-head"><b>💎 Hidden Edge Scanner</b><span>Scanning slate…</span></div><p>Edges will appear after full-slate data finishes loading.</p></section>';
 return '<section class="hidden-edge-card"><div class="model-head"><b>💎 Hidden Edge Scanner</b><span>Under-the-radar spots</span></div><div class="hidden-edge-grid">'+mlb.map(x=>'<article><b>⚾ '+esc(x.name)+'</b><span>'+esc(x.teamAbbr)+' vs '+esc(x.opponent)+' • '+Math.round(x.score)+'</span><small>'+esc(x.pitchMatch||'Full-slate matchup score')+'</small></article>').join('')+nfl.map(x=>'<article><b>🏈 '+esc(x.p.name)+'</b><span>'+esc(x.p.team)+' • '+Math.round(x.score)+'</span><small>'+(x.def?'Opponent defense #'+x.def:'Usage-driven sleeper')+'</small></article>').join('')+'</div><small>Scanner surfaces model-relative research spots; it does not imply market mispricing unless a verified line is available.</small></section>';
}
function boardCard(p){
 const k=boardKey(p),move=movementFor(p.sport,p.id,p.market,p.book||state.platform),status=p.status||'watching';
 const result=status==='win'?'✅ WIN':status==='loss'?'❌ LOSS':status==='push'?'➖ PUSH':status==='played'?'🎟️ PLAYED':'👀 WATCHING';
 const battleOn=battleKeys.includes(k),finalOn=finalKeys.includes(k); return '<article class="my-board-card"><div><strong>'+esc(p.name)+' • '+esc(p.sport)+'</strong><small>'+esc(p.label||savedMarketLabel(p))+' • '+esc((p.direction||'more').toUpperCase())+' '+Number(p.line)+' • '+esc(p.book||state.platform)+'</small><small>'+result+(move?' • Line '+move.first+' → '+move.line:'')+'</small><div class="board-actions"><button onclick="toggleBattlePick(\''+esc(k)+'\')">'+(battleOn?'✓ In Battle':'⚔ Add to Battle')+'</button><button onclick="toggleFinalPick(\''+esc(k)+'\')">'+(finalOn?'👑 Final Card':'＋ Final Card')+'</button><button onclick="gradeBoardPick(\''+esc(k)+'\',\'played\')">Mark played</button><button class="win" onclick="gradeBoardPick(\''+esc(k)+'\',\'win\')">W</button><button class="loss" onclick="gradeBoardPick(\''+esc(k)+'\',\'loss\')">L</button><button onclick="gradeBoardPick(\''+esc(k)+'\',\'push\')">Push</button>'+(p.source==='board'?'<button onclick="removeBoardExtra(\''+esc(k)+'\')">Remove</button>':'')+'</div></div><div><b>'+esc(status.toUpperCase())+'</b></div></article>';
}
function reportHtml(){
 const b=boardExtras.filter(x=>['win','loss','push'].includes(x.status)),w=b.filter(x=>x.status==='win').length,l=b.filter(x=>x.status==='loss').length,p=b.filter(x=>x.status==='push').length,dec=w+l,rate=dec?Math.round(w/dec*100):0;
 const rh=researchHistory||[],rd=rh.filter(x=>['win','loss'].includes(x.status)),rw=rd.filter(x=>x.status==='win').length,rr=rd.length?Math.round(rw/rd.length*100):0;
 const hr=state.hrHistory?.records||[],hs=hr.filter(x=>['hit','miss'].includes(x.status)),hh=hs.filter(x=>x.status==='hit').length,hrate=hs.length?Math.round(hh/hs.length*100):0;
 return '<div class="app-home-card" id="appResultsReport"><h3>📈 Model Report Card</h3><div class="report-grid"><div><b>'+w+'-'+l+'</b><span>MY TRACKED PICKS</span></div><div><b>'+rate+'%</b><span>MY DECIDED RATE</span></div><div><b>'+rr+'%</b><span>TOP 6 MODEL RATE</span></div><div><b>'+hrate+'%</b><span>HR BOARD HIT RATE</span></div></div><p>Only recorded pregame or manually marked results are counted. Pushes are excluded from decided win rate. This is performance tracking, not a profit guarantee.</p></div>';
}
window.renderAppBoard=function(){
 const picks=allBoardPicks(),html=finalCardHtml(picks)+propBattleHtml(picks)+'<div class="my-board-list">'+(picks.length?picks.map(boardCard).join(''):'<div class="empty">Open Player Lab and add props you’re considering.</div>')+'</div>'+reportHtml();
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
 const rows=(state.dailyBatterRanks||[]).filter(x=>Number(x.score)>=72&&x.lineup?.status!=='out').slice(0,6);
 if(!state.dailyBatterRanks?.length)return '<p>Full-slate rankings are loading.</p>';
 if(!rows.length)return '<p><b>🛑 NO GREEN LIGHTS YET</b></p><p>RalloPicks is not forcing six plays. Check again after lineup, weather and matchup updates.</p>';
 return '<p><b>🟢 '+rows.length+' GREEN LIGHT'+(rows.length===1?'':'S')+' TODAY</b></p>'+rows.map((x,i)=>'<p><b>#'+(i+1)+' '+esc(x.name)+'</b> • '+Math.round(x.score)+' • '+esc(x.opponent)+'</p>').join('');
}
window.renderAppDashboards=function(){
 renderAppBoard();const alerts=appAlerts(),alertHtml=alerts.length?alerts.map(a=>'<div class="alert-row"><span>'+a.icon+'</span><div><b>'+esc(a.title)+'</b><span>'+esc(a.text)+'</span></div></div>').join(''):'<p>No new alerts right now.</p>';
 const feed=(()=>{try{return JSON.parse(document.getElementById('dailyHrResearch')?.textContent||'null')}catch{return null}})(),hr1=feed?.top10?.[0],weather=researchHealth.get('weather'),weatherText=weather?.at?new Date(weather.at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'Pending';
 const mlb=document.getElementById('mlbHomeDashboard');if(mlb)mlb.innerHTML='<div class="section-title"><div><h2>RalloPicks Today</h2><span>One screen for today’s research</span></div><span>Weather '+esc(weatherText)+'</span></div><div class="app-home-grid"><div class="app-home-card hero"><h3>🔥 Top 6 Today</h3>'+top6Names()+'<div class="app-home-actions"><button onclick="switchView(\'rankings\')">Open Rankings</button><button onclick="switchView(\'batterlab\')">Player Lab</button></div></div><div class="app-home-card"><h3>⚾ Best HR Research</h3><strong>'+esc(hr1?.person?.fullName||'Loading…')+'</strong><p>'+(hr1?esc(hr1.reason):'Daily HR board loading.')+'</p><button onclick="switchView(\'top20\')">Open HR Board</button></div><div class="app-home-card"><h3>🚨 Alerts</h3>'+alertHtml+'</div>'+hiddenEdgesHtml()+'<div class="app-home-card"><h3>⭐ My Board</h3><strong>'+allBoardPicks().length+'</strong><p>Saved props across MLB and NFL.</p><button onclick="switchView(\'board\')">Open Board</button></div><div class="app-home-card"><h3>🧪 Results</h3>'+reportHtml()+'</div></div>';
 const nfl=document.getElementById('nflHomeDashboard');if(nfl){const games=state.nfl.games||[],teams=[...(state.nfl.teams||[])].filter(x=>x.games_played>0).sort((a,b)=>(a.offense_rank||99)-(b.offense_rank||99)),best=teams[0];nfl.innerHTML='<div class="section-title"><div><h2>NFL Today</h2><span>Matchups, rankings and saved props</span></div><span>'+games.length+' games loaded</span></div><div class="app-home-grid"><div class="app-home-card hero"><h3>🏈 NFL Research Center</h3><strong>'+(best?esc(best.name):'Season loading')+'</strong><p>'+(best?'#'+best.offense_rank+' scoring offense • '+nflRecord(best):'Rankings activate from completed games.')+'</p><div class="app-home-actions"><button onclick="switchNflView(\'players\')">Player Lab</button><button onclick="switchNflView(\'ranks\')">Rankings</button></div></div><div class="app-home-card"><h3>⭐ My Board</h3><strong>'+allBoardPicks().filter(x=>x.sport==='NFL').length+'</strong><p>NFL props saved for comparison and tracking.</p><button onclick="switchNflView(\'board\')">Open Board</button></div><div class="app-home-card"><h3>📈 App Alerts</h3>'+alertHtml+'</div>'+hiddenEdgesHtml()+reportHtml()+'</div>'}
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
renderAppBoard();renderAppDashboards();window.renderHrMatchupSpotlights?.();setTimeout(()=>{if(state.currentSport==='NFL')switchNflView('home');else switchView('home')},0);
setInterval(()=>renderAppDashboards(),120000);
})();


/* Global header player search */
let topHeaderSearchTimer=null;
window.topHeaderSearch=function(value,immediate=false){
  const q=String(value||'').trim();
  clearTimeout(topHeaderSearchTimer);
  if(!q)return;
  const run=()=>{
    if(state.currentSport==='NFL'){
      // Use the normal NFL player view when available.
      try{ switchNflView('players'); }catch{}
      const nflInput=document.querySelector('#nflPlayersView input[type="search"],#nflPlayersView input');
      if(nflInput){nflInput.value=q;nflInput.dispatchEvent(new Event('input',{bubbles:true}));}
      return;
    }

    // Open MLB Player Lab directly so the header search is not blocked by stale membership routing.
    document.body.classList.remove('player-profile-open');
    document.querySelectorAll('#mlbNav button').forEach(x=>x.classList.toggle('active',x.dataset.view==='batterlab'));
    ['mlbHomeView','myBoardView','matchupsView','moneylineView','batterRankingsView','top20View'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.style.display='none';
    });
    const view=document.getElementById('batterlabView');
    if(view){view.style.display='block';view.classList.remove('hidden-view');}

    // Use the top-right header as the single player search control.
    searchPlayers(q);
    view?.scrollIntoView({behavior:immediate?'smooth':'auto',block:'start'});
  };
  if(immediate)run(); else topHeaderSearchTimer=setTimeout(run,120);
};


/* Parlay screenshot scanner */
function parlayLegCount(text){
 const t=String(text||'');
 const explicit=t.match(/\b([2-9]|1[0-2])\s*[- ]?pick\b/i);
 if(explicit)return Number(explicit[1]);
 const directional=(t.match(/\b(MORE|LESS|OVER|UNDER)\b/gi)||[]).length;
 if(directional)return Math.min(12,directional);
 const lines=t.split(/\n+/).map(x=>x.trim()).filter(Boolean);
 const playerish=lines.filter(x=>/[A-Z][a-z]+\s+[A-Z][a-z]+/.test(x)&&/(hits|runs|bases|strikeouts|yards|receptions|touchdown|hr|home run)/i.test(x));
 if(playerish.length)return Math.min(12,playerish.length);
 return Math.min(12,Math.max(1,Math.round(lines.length/5)));
}
function scoreParlayRaw(text){
 const t=String(text||'');
 const legs=parlayLegCount(t);
 let score=90;
 const risks=[],strengths=[];
 if(legs>=6){score-=24;risks.push('High leg count creates heavy compounding risk');}
 else if(legs===5){score-=17;risks.push('Five legs create meaningful compounding risk');}
 else if(legs===4){score-=10;risks.push('Four legs still compound miss risk');}
 else if(legs<=3)strengths.push('Lower leg count keeps the slip easier to evaluate');
 const more=(t.match(/\b(MORE|OVER)\b/gi)||[]).length,less=(t.match(/\b(LESS|UNDER)\b/gi)||[]).length;
 if(more&&less)strengths.push('The slip mixes directions instead of stacking one side only');
 if(!more&&!less)risks.push('Pick directions were not read clearly from the screenshot');
 const sameGame=/same game|\bsgp\b|same team/i.test(t);
 if(sameGame){score-=8;risks.push('Possible same-game correlation detected');}
 const highVariance=/power play|6-pick|5-pick|10x|20x|25x|40x/i.test(t);
 if(highVariance){score-=5;risks.push('High-payout format usually carries more variance');}
 const explicit=t.match(/\b([2-9]|1[0-2])\s*[- ]?pick\b/i);
 const legSource=explicit?'detected from slip':'estimated from OCR';
 score=Math.max(20,Math.min(95,Math.round(score)));
 const grade=score>=85?'A':score>=75?'B+':score>=65?'B':score>=55?'C':'D';
 const meaning=score>=85?'Strong structure':score>=75?'Good structure — review each leg':score>=65?'Playable structure — check weak legs':score>=55?'Risky structure':'High-risk structure';
 return {score,legs,risks,strengths,grade,meaning,legSource};
}
window.scoreParlayText=function(text){
 const host=document.getElementById('parlayScoreCard');if(!host)return;
 if(!String(text||'').trim()){host.innerHTML='';return;}
 const r=scoreParlayRaw(text);
 host.innerHTML='<div class="parlay-score-card"><div class="parlay-score-head"><div><small>RALLO PARLAY SCORE</small><strong>'+r.score+'<em>/100</em></strong></div><div class="parlay-grade"><b>'+esc(r.grade)+'</b><span>'+esc(r.meaning)+'</span></div></div><div class="parlay-score-meta"><span>🎟️ '+r.legs+' legs</span><span>🔎 '+esc(r.legSource)+'</span></div><div class="parlay-meaning"><b>WHAT IT MEANS</b><span>'+esc(r.meaning)+'. This rates the slip structure and OCR-detected risk — not the chance the parlay wins.</span></div>'+(r.strengths.length?'<div class="parlay-signals good"><b>✅ GOOD</b>'+r.strengths.map(x=>'<span>'+esc(x)+'</span>').join('')+'</div>':'')+(r.risks.length?'<div class="parlay-signals risk"><b>⚠️ CHECK</b>'+r.risks.map(x=>'<span>'+esc(x)+'</span>').join('')+'</div>':'')+'<small class="parlay-disclaimer">Use Player Lab to grade each leg individually before playing the slip.</small></div>';
};
window.scanParlayScreenshot=async function(file){
 if(!file)return;
 const preview=document.getElementById('parlayPreview'),wrap=document.getElementById('parlayPreviewWrap'),status=document.getElementById('parlayScanStatus'),text=document.getElementById('parlayOcrText');
 preview.src=URL.createObjectURL(file);wrap.hidden=false;status.textContent='Reading screenshot…';
 try{
  if(!window.Tesseract)throw new Error('OCR library unavailable');
  const result=await Tesseract.recognize(file,'eng',{logger:m=>{if(m.status==='recognizing text')status.textContent='Reading screenshot… '+Math.round((m.progress||0)*100)+'%';}});
  const value=result?.data?.text?.trim()||'';
  text.value=value;status.textContent=value?'Screenshot read successfully. Review the extracted text below.':'Could not detect enough text. Try a clearer screenshot.';
  scoreParlayText(value);
 }catch(e){
  status.textContent='Could not read this screenshot automatically. You can paste or type the slip text below.';
 }
};
