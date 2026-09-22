/* One verified schedule gate for both pitcher surfaces. Never carry a line across games. */
(function () {
  const day = value => new Date(value).toLocaleDateString('en-CA', {timeZone:'America/Chicago'});
  let pending, checkedAt = 0;
  async function schedule() {
    if (!pending || Date.now() - checkedAt > 60000) {
      checkedAt = Date.now();
      pending = fetch('https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=' + day(Date.now()) + '&hydrate=probablePitcher,team', {cache:'no-store'})
        .then(r => {if (!r.ok) throw new Error('Schedule unavailable'); return r.json();})
        .then(d => (d.dates || []).flatMap(d => d.games || []));
      pending.catch(() => {pending = null;});
    }
    return pending;
  }
  window.currentPitcherRows = async function (data) {
    const now = Date.now(), today = day(now), games = await schedule();
    const updated = Date.parse(data.updated_at);
    const fresh = Number.isFinite(updated) && now >= updated && now - updated < 6 * 3600000 && day(updated) === today;
    const rows = [];
    for (const game of games) {
      if (game.status?.abstractGameState !== 'Preview' || Date.parse(game.gameDate) <= now || day(game.gameDate) !== today) continue;
      for (const [side, other] of [['away','home'],['home','away']]) {
        const slot = game.teams[side], opponent = game.teams[other], pitcher = slot.probablePitcher;
        if (!pitcher?.id) continue;
        const saved = fresh && (data.rows || []).find(p => String(p.id) === String(pitcher.id) && String(p.gamePk) === String(game.gamePk) && Date.parse(p.gameDate) === Date.parse(game.gameDate));
        const row = saved ? {...saved} : {id:pitcher.id,name:pitcher.fullName,recent:[],line:null,bookLines:{}};
        Object.assign(row, {gamePk:game.gamePk,gameDate:game.gameDate,team:slot.team.abbreviation || slot.team.name,opponent:opponent.team.abbreviation || opponent.team.name});
        if (!saved || String(row.lineSource).toLowerCase() !== 'prizepicks' || !row.lineProvider) Object.assign(row,{line:null,lineSource:null,bookLines:{},l5Rate:null,l10Rate:null});
        rows.push(row);
      }
    }
    return rows;
  };
})();
