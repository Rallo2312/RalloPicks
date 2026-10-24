(function () {
  'use strict';
  const ROOT_ID = 'ralloNbaProps';
  const PRIZEPICKS_URL = 'https://api.prizepicks.com/projections?league_id=7&per_page=250&single_stat=true&include=new_player,league';
  const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
  const ESPN_INJURIES = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries';
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const localDate = () => {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('');
  };
  const fmtTime = value => {
    if (!value) return 'Time TBD';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? 'Time TBD' : d.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
  };
  const style = document.createElement('style');
  style.textContent = `
    #nbaLivePanel{margin:12px 0 14px;padding:14px;border:1px solid rgba(255,182,18,.25);border-radius:16px;background:linear-gradient(145deg,rgba(15,48,37,.96),rgba(7,27,21,.96))}
    #nbaLivePanel .nl-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
    #nbaLivePanel h3{margin:0;font-size:15px;color:#ffb612}
    #nbaLivePanel .nl-sub,#nbaLivePanel .nl-status{font-size:10px;color:#a8c2b8;margin-top:5px;line-height:1.45}
    #nbaLivePanel .nl-actions{display:flex;gap:6px;flex-wrap:wrap}
    #nbaLivePanel button{border:1px solid rgba(255,182,18,.3);background:#123a2d;color:#f7fbf9;border-radius:9px;padding:8px 10px;font-size:10px;font-weight:900;cursor:pointer}
    #nbaLivePanel button.primary{background:#ffb612;color:#092018}
    #nbaLivePanel .nl-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0 9px}
    #nbaLivePanel .nl-tabs button.active{background:#ffb612;color:#092018}
    #nbaLivePanel .nl-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
    #nbaLivePanel .nl-card{min-width:0;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.07);border-radius:11px;padding:10px}
    #nbaLivePanel .nl-player{font-size:11px;font-weight:1000;overflow-wrap:anywhere}
    #nbaLivePanel .nl-market{font-size:9px;color:#a8c2b8;margin-top:4px}
    #nbaLivePanel .nl-line{font-size:16px;font-weight:1000;color:#ffb612;margin-top:6px}
    #nbaLivePanel .nl-tag{font-size:8px;color:#69e6a7;margin-top:5px}
    #nbaLivePanel .nl-empty{padding:14px;border-radius:10px;background:rgba(0,0,0,.15);font-size:11px;color:#a8c2b8;line-height:1.5}
    #nbaLivePanel .nl-list{display:grid;gap:6px}
    #nbaLivePanel .nl-row{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:9px 10px;border-radius:10px;background:rgba(0,0,0,.15);font-size:10px}
    #nbaLivePanel .nl-row strong{font-size:11px}
    #nbaLivePanel .nl-muted{color:#a8c2b8}
    @media(max-width:760px){#nbaLivePanel{padding:11px}#nbaLivePanel .nl-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#nbaLivePanel .nl-row{align-items:flex-start}}
    @media(max-width:390px){#nbaLivePanel .nl-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  let activeTab = 'props';
  let latest = { props: [], games: [], injuries: [], errors: [] };
  let loadedAt = null;
  const playerMap = included => {
    const map = {};
    (included || []).forEach(item => {
      if (item.type === 'new_player' || item.type === 'player') {
        const a = item.attributes || {};
        map[item.id] = {name:a.name || a.display_name || a.full_name || 'Unknown player', team:a.team || a.team_name || '', image:a.image_url || a.image || ''};
      }
    });
    return map;
  };
  function parseProps(json) {
    const included = playerMap(json.included);
    const rows = (json.data || []).map(item => {
      const a = item.attributes || {};
      const rel = item.relationships || {};
      const pid = rel.new_player && rel.new_player.data ? rel.new_player.data.id : (rel.player && rel.player.data ? rel.player.data.id : null);
      const p = included[pid] || {};
      return {
        id:item.id,
        player:p.name || a.description || a.player_name || 'Player prop',
        team:p.team || '',
        image:p.image || '',
        market:a.stat_type || a.market || a.description || 'Player prop',
        line:a.line_score ?? a.line ?? a.projection ?? null,
        start:a.start_time || a.game_start_time || null,
        status:a.status || '',
        oddsType:a.odds_type || '',
        rawType:item.type || ''
      };
    }).filter(x => x.line !== null && x.line !== '' && x.player !== 'Player prop');
    const unique = new Map();
    rows.forEach(row => {
      const key = [row.player.toLowerCase(),row.market.toLowerCase(),row.line].join('|');
      if (!unique.has(key)) unique.set(key,row);
    });
    return [...unique.values()];
  }
  function parseGames(json) {
    return (json.events || []).map(event => {
      const comps = event.competitions && event.competitions[0] ? event.competitions[0].competitors || [] : [];
      const home = comps.find(c=>c.homeAway==='home') || comps[0] || {};
      const away = comps.find(c=>c.homeAway==='away') || comps[1] || {};
      const status = event.status && event.status.type ? event.status.type.shortDetail || event.status.type.description : 'Scheduled';
      return {name:(away.team?.abbreviation || away.team?.displayName || 'Away')+' @ '+(home.team?.abbreviation || home.team?.displayName || 'Home'), detail:status, time:fmtTime(event.date), completed:!!event.status?.type?.completed};
    });
  }
  function parseInjuries(json) {
    const list = Array.isArray(json.injuries) ? json.injuries : Array.isArray(json.items) ? json.items : [];
    const out = [];
    list.forEach(entry => {
      const athlete = entry.athlete || entry.player || entry;
      const status = entry.status || entry.type?.description || entry.details || entry.injuryStatus || '';
      const name = athlete.displayName || athlete.fullName || athlete.name || '';
      const team = entry.team?.abbreviation || athlete.team?.abbreviation || '';
      if (name) out.push({name,team,status:String(status || 'Status not listed')});
      (entry.athletes || []).forEach(a=>{const n=a.displayName||a.fullName||a.name;if(n)out.push({name:n,team:entry.team?.abbreviation||'',status:String(a.status||a.injuryStatus||status||'Status not listed')})});
    });
    const seen = new Set();
    return out.filter(x=>{const k=x.name+'|'+x.team+'|'+x.status;if(seen.has(k))return false;seen.add(k);return true;}).slice(0,30);
  }
  async function getJSON(url, options={}) {
    const response = await fetch(url, {cache:'no-store', ...options});
    if (!response.ok) throw new Error('HTTP '+response.status);
    return response.json();
  }
  function mountPanel(root) {
    if (document.getElementById('nbaLivePanel')) return;
    const panel = document.createElement('section');
    panel.id = 'nbaLivePanel';
    panel.innerHTML = '<div class="nl-head"><div><h3>⚡ Live NBA Data Desk</h3><div class="nl-sub">PrizePicks projections · ESPN schedule · injury feed, when available</div></div><div class="nl-actions"><button class="primary" id="nbaLiveRefresh">↻ Refresh data</button></div></div><div id="nbaLiveStatus" class="nl-status">Connecting to public data feeds…</div><div class="nl-tabs"><button data-nltab="props" class="active">PrizePicks Lines</button><button data-nltab="games">Today’s Games</button><button data-nltab="injuries">Injuries</button></div><div id="nbaLiveContent"></div><div class="nl-status">Live lines are displayed as source data, not as picks. The Rallo Score still needs verified player logs, minutes/role context, and matchup analysis before it can make a research-based ranking.</div>';
    const hero = root.querySelector('.nba-hero');
    if (hero) hero.after(panel); else root.prepend(panel);
    panel.querySelectorAll('[data-nltab]').forEach(button=>button.addEventListener('click',()=>{activeTab=button.dataset.nltab;panel.querySelectorAll('[data-nltab]').forEach(b=>b.classList.toggle('active',b===button));renderPanel();}));
    document.getElementById('nbaLiveRefresh').addEventListener('click',load);
    renderPanel();
  }
  function renderPanel() {
    const host = document.getElementById('nbaLiveContent');
    const status = document.getElementById('nbaLiveStatus');
    if (!host || !status) return;
    const available = [];
    if (latest.props.length) available.push('PrizePicks '+latest.props.length+' props');
    if (latest.games.length) available.push(latest.games.length+' games');
    if (latest.injuries.length) available.push(latest.injuries.length+' injury entries');
    status.textContent = (loadedAt ? 'Updated '+loadedAt.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})+' · ' : '') + (available.join(' · ') || 'No feeds returned data yet.') + (latest.errors.length ? ' · '+latest.errors.join(' / ') : '');
    if (activeTab === 'props') {
      const rows = latest.props.slice(0,60);
      host.innerHTML = rows.length ? '<div class="nl-grid">'+rows.map(p=>'<article class="nl-card"><div class="nl-player">'+esc(p.player)+'</div><div class="nl-market">'+esc(p.team ? p.team+' · ' : '')+esc(p.market)+'</div><div class="nl-line">'+esc(p.line)+'</div><div class="nl-tag">PrizePicks source line</div></article>').join('')+'</div>' : '<div class="nl-empty">Live PrizePicks lines could not be loaded in this browser session. Use the manual prop form below and enter only lines you can verify in the PrizePicks app. A blocked public endpoint is not treated as a zero line.</div>';
    } else if (activeTab === 'games') {
      host.innerHTML = latest.games.length ? '<div class="nl-list">'+latest.games.map(g=>'<div class="nl-row"><strong>'+esc(g.name)+'</strong><span class="nl-muted">'+esc(g.time)+' · '+esc(g.detail)+'</span></div>').join('')+'</div>' : '<div class="nl-empty">ESPN’s schedule feed is unavailable right now. Refresh to try again.</div>';
    } else {
      host.innerHTML = latest.injuries.length ? '<div class="nl-list">'+latest.injuries.map(i=>'<div class="nl-row"><strong>'+esc(i.name)+(i.team?' · '+esc(i.team):'')+'</strong><span class="nl-muted">'+esc(i.status)+'</span></div>').join('')+'</div>' : '<div class="nl-empty">The public injury feed did not return a usable list. Confirm player availability with an official team report before using a prop.</div>';
    }
  }
  async function load() {
    const status = document.getElementById('nbaLiveStatus');
    if (status) status.textContent = 'Refreshing public feeds…';
    const date = localDate();
    const tasks = await Promise.allSettled([
      getJSON(PRIZEPICKS_URL,{headers:{'Accept':'application/json'}}),
      getJSON(ESPN_SCOREBOARD+'?dates='+date),
      getJSON(ESPN_INJURIES)
    ]);
    latest = {props:[],games:[],injuries:[],errors:[]};
    if (tasks[0].status==='fulfilled') latest.props=parseProps(tasks[0].value);
    else latest.errors.push('PrizePicks feed blocked/unavailable');
    if (tasks[1].status==='fulfilled') latest.games=parseGames(tasks[1].value);
    else latest.errors.push('ESPN schedule unavailable');
    if (tasks[2].status==='fulfilled') latest.injuries=parseInjuries(tasks[2].value);
    else latest.errors.push('Injury feed unavailable');
    loadedAt = new Date();
    renderPanel();
  }
  function wrapSportSwitch() {
    const old = window.setSport;
    if (typeof old !== 'function' || old.__nbaLiveWrapped) return;
    const wrapped = function(name) {
      const root = document.getElementById(ROOT_ID);
      if (name !== 'NBA' && root) root.hidden = true;
      const result = old.apply(this, arguments);
      if (name === 'NBA') {
        const r = document.getElementById(ROOT_ID);
        if (r) r.hidden = false;
        load();
      }
      return result;
    };
    wrapped.__nbaLiveWrapped = true;
    window.setSport = wrapped;
  }
  function init() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    mountPanel(root);
    wrapSportSwitch();
    const switcher = document.querySelector('.sport-switch');
    if (switcher) switcher.addEventListener('click',event=>{
      const button=event.target.closest('button');
      if(button && button.id==='sportNBA') {root.hidden=false;load();}
      else if(button && button.id!=='sportNBA') root.hidden=true;
    });
    root.hidden = localStorage.getItem('ralloSport') !== 'NBA';
    if (!root.hidden) load();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init); else init();
})();