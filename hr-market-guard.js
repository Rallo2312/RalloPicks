/* Only fresh, current Chicago-slate, pregame markets may enter research. */
function currentHrOddsRows(data, now = Date.now()) {
  const day = value => new Date(value).toLocaleDateString('en-CA', {timeZone:'America/Chicago'});
  const updated = Date.parse(data?.updatedAt), age = now - updated;
  if (data?.refreshStatus !== 'fresh' || !Number.isFinite(age) || age < 0 || age > 6*3600000 || day(updated) !== day(now)) return [];
  return (data.rows || []).filter(row => {
    const start = Date.parse(row.startsAt);
    return Number.isFinite(start) && start > now && day(start) === day(now);
  });
}
function hrMarketMatchesGame(row, game) {
  return !!game && Date.parse(row.startsAt) === Date.parse(game.gameDate)
    && row.awayTeam === game.teams?.away?.team?.name
    && row.homeTeam === game.teams?.home?.team?.name;
}
