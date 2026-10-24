(function(){
'use strict';
const KEY='rallopicks_nba_props_v1';
const el=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function getRows(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch(e){return[]}}
function setRows(rows){localStorage.setItem(KEY,JSON.stringify(rows));render()}
function score(p){
 const fields=[['l5',30],['l10',25],['season',15],['matchup',10],['pace',8],['minutes',7],['role',5]];
 let sum=0,weight=0;
 fields.forEach(([key,w])=>{const v=Number(p[key]);if(p[key]!==''&&p[key]!=null&&Number.isFinite(v)){sum+=Math.max(0,Math.min(100,v))*w;weight+=w}});
 if(!weight)return null;
 let result=sum/weight;
 if(p.l5!==''&&p.line!==''&&Number.isFinite(Number(p.l5))&&Number.isFinite(Number(p.line)))result+=Math.max(-8,Math.min(8,(Number(p.l5)-Number(p.line))*1.5));
 return Math.round(Math.max(1,Math.min(99,result)));
}
function render(){
 const host=el('nbaPropList');if(!host)return;
 const rows=getRows().sort((a,b)=>(score(b)||0)-(score(a)||0));
 el('nbaCount').textContent=rows.length+' saved';
 if(!rows.length){host.innerHTML='<div class="nba-empty">No props saved yet. Add a verified line from your PrizePicks board.</div>';return}
 host.innerHTML=rows.map((p,i)=>'<article class="nba-prop-card"><span class="nba-score">'+(score(p)==null?'—':score(p))+'</span><b>#'+(i+1)+' '+esc(p.player)+'</b><div class="nba-meta">'+esc(p.team||'Team')+' vs '+esc(p.opponent||'Opponent')+' · '+esc(p.market)+' '+esc(p.line)+' · '+esc(p.direction)+'</div><div class="nba-meta">L5 '+esc(p.l5||'—')+' · L10 '+esc(p.l10||'—')+' · Season '+esc(p.season||'—')+' · Minutes '+esc(p.minutes||'—')+'</div>'+(p.notes?'<div class="nba-note">'+esc(p.notes)+'</div>':'')+'<button class="nba-btn" data-remove="'+esc(p.id)+'" style="margin-top:9px">Remove</button></article>').join('');
 host.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>setRows(getRows().filter(p=>p.id!==b.dataset.remove))));
}
function mount(){
 const sw=document.querySelector('.sport-switch');
 if(sw&&!el('sportNBA')){const b=document.createElement('button');b.id='sportNBA';b.textContent='🏀 NBA';b.onclick=()=>window.setSport('NBA');sw.appendChild(b)}
 const root=document.createElement('section');root.id='ralloNbaProps';
 root.innerHTML='<div class="nba-hero"><h2>🏀 NBA Props Lab</h2><p>Daily player-prop research • PrizePicks-first • Green, gold and red Rallo style</p></div><div class="nba-grid"><section class="nba-panel"><h3>Add a verified prop</h3><form id="nbaPropForm" class="nba-form"><div><label>Player</label><input name="player" required placeholder="Player name"></div><div><label>Team</label><input name="team" placeholder="Team"></div><div><label>Opponent</label><input name="opponent" placeholder="Opponent"></div><div><label>Market</label><select name="market"><option>Points</option><option>Rebounds</option><option>Assists</option><option>Pts + Reb + Ast</option><option>3-Pointers Made</option><option>Steals</option><option>Blocks</option><option>Turnovers</option></select></div><div><label>PrizePicks line</label><input name="line" type="number" step="0.5" required placeholder="e.g. 24.5"></div><div><label>Lean</label><select name="direction"><option>OVER</option><option>UNDER</option></select></div><div><label>Last 5 average</label><input name="l5" type="number" step="0.1" placeholder="Average"></div><div><label>Last 10 average</label><input name="l10" type="number" step="0.1" placeholder="Average"></div><div><label>Season average</label><input name="season" type="number" step="0.1" placeholder="Average"></div><div><label>Expected minutes</label><input name="minutes" type="number" step="0.1" placeholder="Minutes"></div><div><label>Matchup grade (0–100)</label><input name="matchup" type="number" min="0" max="100" placeholder="Optional"></div><div><label>Pace grade (0–100)</label><input name="pace" type="number" min="0" max="100" placeholder="Optional"></div><div><label>Role / availability grade</label><input name="role" type="number" min="0" max="100" placeholder="Optional"></div><div class="nba-wide"><label>Research notes</label><textarea name="notes" placeholder="Injury news, defense, pace, role, recent trend…"></textarea></div><div class="nba-wide"><button class="nba-btn" type="submit">Save & rank prop</button> <button class="nba-btn" id="nbaClear" type="button">Clear board</button></div></form><p class="nba-meta">Rallo Score is a sorting aid, not a win probability. Blank data is not treated as a positive signal.</p></section><section class="nba-panel"><h3>Today’s ranked board <span id="nbaCount" class="nba-meta"></span></h3><div id="nbaPropList"></div><p class="nba-meta">Props are stored in this browser. Live lines and stats are not yet automatically connected.</p></section></div>';
 const anchor=el('mlbResearchLayout')||el('nflResearchLayout')||document.body;anchor.parentNode.insertBefore(root,anchor);
 el('nbaPropForm').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget).entries());data.id=Date.now().toString(36);setRows([...getRows(),data]);e.currentTarget.reset()});
 el('nbaClear').addEventListener('click',()=>{if(confirm('Clear all saved NBA props?'))setRows([])});
 const original=window.setSport;
 if(typeof original==='function'&&!original.__nbaReady){
  const wrapped=function(name){
   if(name==='NBA'){
    localStorage.setItem('ralloSport','NBA');
    document.body.dataset.sport='nba';
    ['sportMLB','sportNFL','sportUFC','sportNBA'].forEach(id=>{const b=el(id);if(b)b.classList.toggle('active',id==='sportNBA')});
    ['mlbNav','nflNav'].forEach(id=>{if(el(id))el(id).hidden=true});
    if(el('dateLabel'))el('dateLabel').textContent='NBA player prop research lab';
    ['mlbResearchLayout','nflResearchLayout','ufcResearchLayout','lockedDashboard'].forEach(id=>{if(el(id))el(id).hidden=true});
    return;
   }
   if(el('sportNBA'))el('sportNBA').classList.remove('active');
   return original(name);
  };
  wrapped.__nbaReady=true;window.setSport=wrapped;
 }
 render();
 if(localStorage.getItem('ralloSport')==='NBA')window.setSport('NBA');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();