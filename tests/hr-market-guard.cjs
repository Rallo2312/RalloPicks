const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync('hr-market-guard.js','utf8'),ctx);
// UTC is already the next day, while Chicago is still September 27.
const now=Date.parse('2026-09-28T01:00:00Z');
const row={startsAt:'2026-09-28T02:00:00Z',awayTeam:'A',homeTeam:'B'};
const feed={updatedAt:'2026-09-28T00:30:00Z',refreshStatus:'fresh',rows:[row]};
assert.equal(ctx.currentHrOddsRows(feed,now).length,1);
for(const patch of [{refreshStatus:'cached_rate_limited'},{updatedAt:'2026-09-16T21:26:45Z'},{updatedAt:'bad'},{updatedAt:'2026-09-28T01:01:00Z'}])assert.equal(ctx.currentHrOddsRows({...feed,...patch},now).length,0);
for(const startsAt of ['bad','2026-09-28T01:00:00Z','2026-09-27T22:00:00Z','2026-09-28T18:00:00Z'])assert.equal(ctx.currentHrOddsRows({...feed,rows:[{...row,startsAt}]},now).length,0);
const game={gameDate:row.startsAt,teams:{away:{team:{name:'A'}},home:{team:{name:'B'}}}};
assert.equal(ctx.hrMarketMatchesGame(row,game),true);
assert.equal(ctx.hrMarketMatchesGame(row,{...game,gameDate:'2026-09-28T03:00:00Z'}),false);
assert.equal(ctx.hrMarketMatchesGame({...row,awayTeam:'C'},game),false);
assert.equal(ctx.hrMarketMatchesGame(row,null),false);
console.log('Market freshness, Chicago date, start-time and matchup checks passed');
