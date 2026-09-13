/* RalloPicks Research Engine V2 — matchup edge board + deeper HR scoring */
(function(){
  const clampV=(n,a,b)=>Math.max(a,Math.min(b,n));
  const num=v=>Number.isFinite(Number(v))?Number(v):null;

  function enhancedScore(x){
    const q=state.hrQuality?.players?.[String(x.person?.id)]||x.contactQuality||{};
    const r=x.research||{};
    const split=r.split||{};
    const pitcher=r.pitcher||{};
    const windows=r.profile?.windows||[];
    const l5=windows.find(w=>Number(w.window)===5)||{};
    const l10=windows.find(w=>Number(w.window)===10)||{};
    const l20=windows.find(w=>Number(w.window)===20)||{};
    const pitch=typeof arsenalPowerMatch==='function'?arsenalPowerMatch(x.person?.id,x.starterId):{factor:1};
    const weather=x.weather||{};
    let s=50;

    // Contact quality: use stable season Statcast as the backbone.
    if(num(q.barrelRate)!=null) s += (num(q.barrelRate)-8)*1.15;
    if(num(q.hardHitRate)!=null) s += (num(q.hardHitRate)-38)*0.34;
    if(num(q.exitVelocity)!=null) s += (num(q.exitVelocity)-88)*1.35;

    // Recent power, with L5 intentionally capped so one hot week cannot dominate.
    if(num(l5.hr)!=null) s += clampV(num(l5.hr)*2.2,0,7);
    if(num(l10.hr)!=null) s += clampV(num(l10.hr)*1.55,0,8);
    if(num(l20.hr)!=null) s += clampV(num(l20.hr)*0.7,0,6);

    // Opposing pitcher HR exposure. Regress small inning samples toward league-ish baseline.
    if(num(pitcher.hr9)!=null){
      const ip=Math.max(0,num(pitcher.ip)||0), reliability=clampV(ip/90,.2,1);
      const reg=1.15+(num(pitcher.hr9)-1.15)*reliability;
      s += (reg-1.15)*8.5;
    }
    if(num(pitcher.lastStarts?.hr9)!=null) s += clampV((num(pitcher.lastStarts.hr9)-1.15)*3.2,-4,4);

    // Handedness split only earns full weight with a meaningful PA sample.
    if(num(split.slg)!=null){
      const rel=clampV((num(split.pa)||0)/180,.2,1);
      s += (num(split.slg)-.420)*28*rel;
    }

    // Pitch-type fit now changes the rank instead of being display-only.
    if(num(pitch.factor)!=null) s += (num(pitch.factor)-1)*44;

    // Park/weather context.
    if(num(weather.factor)!=null) s += (num(weather.factor)-1)*28;

    // Lineup certainty / batting position.
    if(x.lineup?.status==='out') s -= 30;
    else if(x.lineup?.status==='confirmed'){
      const spot=num(x.lineup.spot);
      s += spot&&spot<=4?4:spot&&spot>=8?-3:1;
    } else s -= 2;

    // Penalize fragile samples and missing core inputs.
    if((num(x.pa)||0)<120) s -= 7;
    if(pitcher.missing) s -= 4;
    if(!r.pitchData) s -= 3;

    // H2H is deliberately tiny unless there is a real sample.
    if(num(r.h2h?.ab)>=25 && num(r.h2h?.slg)!=null) s += clampV((num(r.h2h.slg)-.450)*5,-2,2);

    return Math.round(clampV(s,0,100));
  }

  modelScoreForCandidate = enhancedScore;
  window.ralloResearchV2Score = enhancedScore;

  // Add machine-readable metadata to existing HR cards without rewriting the board renderer.
  if(typeof renderHrListRow==='function'){
    const oldRender=renderHrListRow;
    renderHrListRow=function(x,i,underrated=false){
      const html=oldRender(x,i,underrated);
      const score=enhancedScore(x);
      const pop=Math.round(clampV(((num(x.hr)||0)*1.1)+((num(x.pa)||0)/120)+((num(x.recentHR)||0)*5),0,100));
      return html.replace('<article data-game-date=', '<article data-rallo-v2="1" data-game-pk="'+Number(x.gamePk||0)+'" data-player-id="'+Number(x.person?.id||0)+'" data-model-score="'+score+'" data-popularity-proxy="'+pop+'" data-game-date=');
    };
  }

  function rangeSignal(card,n){
    const details=card.querySelector('.hr-list-detail-body')?.innerText||'';
    const re=new RegExp('L'+n+'\\s*[·•]?\\s*\\d+\\s*games?\\s*(\\d+)\\s*HR','i');
    const m=details.match(re); return m?Number(m[1]):null;
  }
  function nameOf(card){return card.querySelector('.hr-list-player strong')?.textContent?.trim()||'Player'}
  function avatarOf(card){return card.querySelector('.player-avatar')?.outerHTML||''}
  function metaOf(card){return card.querySelector('.hr-list-player small')?.textContent?.trim()||''}

  function buildMatchupBoard(){
    const host=document.getElementById('hrMatchupSpotlights');
    if(!host)return;
    const cards=[...document.querySelectorAll('#top20Rows .hr-list-row[data-rallo-v2="1"],#underratedHrRows .hr-list-row[data-rallo-v2="1"]')]
      .filter(c=>Number(c.dataset.gamePk)>0 && Date.parse(c.dataset.gameDate)>Date.now()-60000);
    if(!cards.length){host.innerHTML='';return}

    const groups=new Map();
    cards.forEach(c=>{const k=c.dataset.gamePk;(groups.get(k)||groups.set(k,[]).get(k)).push(c)});
    const sections=[...groups.entries()].map(([gamePk,rows])=>{
      const sorted=[...rows].sort((a,b)=>Number(b.dataset.modelScore)-Number(a.dataset.modelScore));
      const top=sorted[0];
      const advertised=[...rows].sort((a,b)=>Number(b.dataset.popularityProxy)-Number(a.dataset.popularityProxy))[0];
      const hidden=[...rows].sort((a,b)=>{
        const ae=Number(a.dataset.modelScore)-Number(a.dataset.popularityProxy)*.32;
        const be=Number(b.dataset.modelScore)-Number(b.dataset.popularityProxy)*.32;
        return be-ae;
      })[0];
      const t=new Date(top.dataset.gameDate).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
      const pill=(label,c,kind)=>'<div class="r2-edge '+kind+'"><span>'+label+'</span><div>'+avatarOf(c)+'<strong>'+esc(nameOf(c))+'</strong></div><b>'+Number(c.dataset.modelScore)+'</b></div>';
      return '<article class="r2-matchup" data-game="'+gamePk+'"><div class="r2-match-head"><div><b>⚡ Matchup Edge</b><span>'+esc(metaOf(top))+' • '+esc(t)+'</span></div><span class="r2-live">Pregame only</span></div><div class="r2-edge-grid">'+pill('TOP SCORE',top,'top')+pill('MOST ADVERTISED*',advertised,'advertised')+pill('MOST HIDDEN',hidden,'hidden')+'</div><div class="r2-ranges"><span>VIEW</span>'+[1,3,5,10].map(n=>'<button data-range="'+n+'" onclick="this.closest(\'.r2-matchup\').querySelectorAll(\'.r2-ranges button\').forEach(b=>b.classList.remove(\'active\'));this.classList.add(\'active\');ralloRangeHint(this.closest(\'.r2-matchup\'),'+n+')">L'+n+'</button>').join('')+'</div><div class="r2-hint">Scores use contact quality, recent power, pitcher HR tendency, handedness, pitch mix, park/weather and lineup certainty. *Advertised is a market-profile proxy until a true popularity feed is connected.</div></article>';
    }).join('');
    host.innerHTML='<div class="r2-title"><div><h3>⚡ Game-by-Game Edge Board</h3><span>Only games that have not started • deeper Research V2 scoring</span></div></div>'+sections;
  }

  window.ralloRangeHint=function(section,n){
    const game=section.dataset.game;
    const cards=[...document.querySelectorAll('.hr-list-row[data-game-pk="'+game+'"]')];
    const ranked=cards.map(c=>({c,v:rangeSignal(c,n)})).filter(x=>x.v!=null).sort((a,b)=>b.v-a.v);
    const hint=section.querySelector('.r2-hint');
    if(!ranked.length){hint.textContent='L'+n+' signal unavailable for this matchup.';return}
    hint.textContent='L'+n+' power leader: '+nameOf(ranked[0].c)+' — '+ranked[0].v+' HR in that window. This is one signal, not the entire model.';
  };

  const css=`
  .r2-title{display:flex;justify-content:space-between;align-items:end;margin:14px 2px 8px}.r2-title h3{margin:0;font-size:17px}.r2-title span{font-size:10px;color:var(--muted)}
  .r2-matchup{margin:9px 0;padding:11px;border-radius:16px;border:1px solid rgba(196,255,102,.24);background:linear-gradient(145deg,#0d261e,#101d23);box-shadow:0 12px 30px rgba(0,0,0,.18)}
  .r2-match-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:9px}.r2-match-head b{font-size:13px}.r2-match-head span{display:block;color:var(--muted);font-size:9px;margin-top:2px}.r2-live{padding:5px 8px;border-radius:99px;background:rgba(105,230,167,.09);color:var(--green)!important;border:1px solid rgba(105,230,167,.2)}
  .r2-edge-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.r2-edge{min-width:0;border-radius:12px;padding:9px;border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.16)}.r2-edge>span{font-size:8px;font-weight:1000;letter-spacing:.6px;color:var(--muted)}.r2-edge>div{display:flex;align-items:center;gap:6px;margin-top:6px;min-width:0}.r2-edge .player-avatar{width:29px;height:29px;font-size:8px}.r2-edge strong{font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.r2-edge>b{display:block;font-size:16px;margin-top:5px}.r2-edge.top{border-color:rgba(255,182,18,.35)}.r2-edge.top>b{color:var(--yellow)}.r2-edge.advertised{border-color:rgba(255,107,120,.32)}.r2-edge.advertised>b{color:#ff9da6}.r2-edge.hidden{border-color:rgba(105,230,167,.34)}.r2-edge.hidden>b{color:var(--green)}
  .r2-ranges{display:grid;grid-template-columns:1fr repeat(4,54px);gap:5px;align-items:center;margin-top:9px;padding-top:8px;border-top:1px solid rgba(255,255,255,.06)}.r2-ranges>span{font-size:8px;font-weight:1000;color:var(--muted)}.r2-ranges button{border:1px solid rgba(255,255,255,.08);background:#0b211a;color:#bcd0c8;border-radius:8px;padding:6px;font-size:9px;font-weight:1000}.r2-ranges button.active{border-color:var(--green);color:var(--green)}
  .r2-hint{margin-top:7px;color:#91aaa0;font-size:8px;line-height:1.4}
  @media(max-width:760px){.r2-edge-grid{grid-template-columns:1fr}.r2-ranges{grid-template-columns:1fr repeat(4,44px)}.r2-edge{display:grid;grid-template-columns:1fr auto;align-items:center}.r2-edge>span{grid-column:1/-1}.r2-edge>div{margin-top:4px}.r2-edge>b{margin:0;font-size:18px}}
  `;
  const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);

  const obs=new MutationObserver(()=>{clearTimeout(window.__r2Timer);window.__r2Timer=setTimeout(buildMatchupBoard,120)});
  ['top20Rows','underratedHrRows','sleeperFinderRows'].forEach(id=>{const el=document.getElementById(id);if(el)obs.observe(el,{childList:true,subtree:true})});
  setTimeout(buildMatchupBoard,900);
})();