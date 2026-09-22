const {readFileSync}=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const now=new Date('2026-09-22T22:00:00Z').getTime();
class Clock extends Date {constructor(...a){super(...(a.length?a:[now]));} static now(){return now;}}
const game=(id,date,status='Preview',pitcher=1)=>({gamePk:id,gameDate:date,status:{abstractGameState:status},teams:{away:{team:{abbreviation:'A'},probablePitcher:{id:pitcher,fullName:'Current starter'}},home:{team:{abbreviation:'B'}}}});
const games=[game(1,'2026-09-22T23:00:00Z'),game(2,'2026-09-22T21:00:00Z'),game(3,'2026-09-22T23:00:00Z','Final'),game(4,'2026-09-23T23:00:00Z'),game(5,'2026-09-23T01:00:00Z','Preview',2)];
const ctx={window:{},Date:Clock,fetch:async()=>({ok:true,json:async()=>({dates:[{games}]})})};vm.createContext(ctx);vm.runInContext(readFileSync('current-pitchers.js','utf8'),ctx);
(async()=>{
 const row={id:1,gamePk:1,gameDate:games[0].gameDate,line:5.5,lineSource:'prizepicks',lineProvider:'The Odds API',bookLines:{prizepicks:5.5}};
 let result=await ctx.window.currentPitcherRows({updated_at:'2026-09-22T21:00:00Z',rows:[row]});
 assert.equal(result.length,2);assert.equal(result[0].line,5.5);assert.equal(result[1].id,2);assert.equal(result[1].line,null);
 for(const patch of [{updated_at:'2026-09-18T21:00:00Z'},{rows:[{...row,id:99}]},{rows:[{...row,gamePk:9}]},{rows:[{...row,gameDate:'2026-09-21T23:00:00Z'}]},{rows:[{...row,lineSource:'fanduel'}]}]){
 result=await ctx.window.currentPitcherRows({updated_at:'2026-09-22T21:00:00Z',rows:[row],...patch});assert.equal(result[0].line,null);
 }
 console.log('PASS: stale, started, finished, wrong date, replaced starter, game matching, provider and Chicago midnight boundaries');
})().catch(e=>{console.error(e);process.exitCode=1;});
