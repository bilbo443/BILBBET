const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const engine=require('../js/streak-specials.js');
const teams=['A','B'],schedule=Array.from({length:4},()=>['A','B']).map(p=>[p]);
const scores={A:[10,20,5,null],B:[10,10,15,null]};
let h=engine.history(teams,schedule,scores,2);
assert.equal(h.A.lost,0);assert.equal(h.A.won,1);assert.equal(h.B.won,0);assert.equal(h.A.drawn,1);
assert.equal(engine.history(teams,schedule,scores,4),null,'Incomplete scores cannot establish a streak');
h=engine.history(teams,schedule,scores,3);
assert.equal(h.A.firstLoss,3);assert.equal(h.B.firstWin,3);
const forecast=engine.forecast('LOSS','A',schedule,1,4,()=>.25);
assert(Math.abs(forecast.reduce((s,r)=>s+r.probability,0)-1)<1e-12);
assert.equal(forecast[0].probability,.25);assert.equal(forecast.at(-1).probability,.75**4);
assert.equal(engine.result('LOSS',3,h.A,3,4),'WON');assert.equal(engine.result('LOSS',2,h.A,3,4),'LOST');
assert.equal(engine.result('LOSS',null,h.A,3,4),'LOST');
h=engine.history(teams,schedule,scores,2);
assert.equal(engine.result('LOSS',3,h.A,2,4),null);assert.equal(engine.result('LOSS',2,h.A,2,4),'LOST');
assert.equal(engine.result('LOSS',null,h.A,4,4),'WON');
assert.equal(engine.forecast('LOSS','X',schedule,1,4,()=>.2).length,0);
assert.equal(engine.forecast('WIN','A',schedule,1,4,()=>NaN).length,0);
const app=fs.readFileSync('js/app.js','utf8'),part=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a)));
const read=n=>JSON.parse(fs.readFileSync('data/'+n+'.json','utf8'));
const roster=read('h2h_divisions'),real=read('real_results'),registry=read('admin_teams'),fixtures=read('h2h_schedule');
const ctx={window:{BilbbetStreaks:engine},DATA:{admin_teams:registry},REAL_RESULTS:real,H2H_DIVISIONS:roster,H2H_SCHEDULE:fixtures,
 state:{currentRound:5,slip:[]},Number,Date,ROUND_DATES:read('round_dates'),sydneyKickoffUTC:()=>0,availableDivision:()=>true,divisionFixtureConfirmed:()=>true,
 findTeamDivision:team=>Object.keys(roster).find(d=>roster[d].includes(team)),getFixtureMarkets:(div,r)=>fixtures[div][r-1].map(([teamA,teamB])=>({teamA,teamB,aWinPct:45,bWinPct:53})),
 toOdds:p=>({odds:Math.round(100/(p*1.05)*100)/100,suspended:false}),esc:String,formatOdds:n=>n.toFixed(2),collectingTrustedPrices:false,trustedPrices:new Map(),
 categoryPauseControl:()=>'',priceOnlyButton:()=>'<button>published</button>'};
vm.createContext(ctx);vm.runInContext(part('  function renderD1DroughtTracker(','  function specialsSubTabBar(')+part('  function getPickRound(','  // Suggests WON/LOST'),ctx);
const markets=ctx.streakMarkets();assert(markets.length>0);
for(const m of markets){
 assert(m.kind==='LOSS'?m.record.lost===0:m.record.won===0);
 const out=ctx.streakOutcomes(m);assert.equal(out.at(-1).round,null);
 assert(Math.abs(out.reduce((sum,row)=>sum+row.probability,0)-1)<1e-9);
 assert(out.every(row=>ctx.getPickRound(row.id)===5),'All outcomes lock in offering round, not chosen round');
 assert(out.filter(row=>!row.price.suspended).reduce((sum,row)=>sum+1/row.price.odds,0)>=1,'A complete round book cannot guarantee profit');
}
assert(ctx.renderStreakSpecials().includes('Awaiting price publication'));
console.log('CURRENT ELIGIBLE STREAKS',markets.map(m=>m.team+': first '+m.kind.toLowerCase()).join('; '));
console.log('PASS: draws, first-event timing, survival/no-event probabilities, score completeness, 5% books, ID/basis lockouts and unpublished-state UI.');
vm.runInContext(part('  function parsePick(','  function chainOf('),ctx);
const sample=ctx.streakOutcomes(markets[0])[0];
assert.equal(ctx.parsePick(sample.id).type,'streak');assert.equal(ctx.parsePick(sample.id).teamId,markets[0].teamId);
const wang=registry.find(t=>t.name==='GIVE US WANG');
const wangId='STREAK|LOSS|'+wang.id+'|R5|R5';
assert.equal(ctx.streakResult(wangId),null,'Next unplayed round remains unresolved');
for(const [a,b]of fixtures['ELIZA CUP (D1)'][4]){real[a][4]=100;real[b][4]=10;if(a==='GIVE US WANG')real[a][4]=1;if(b==='GIVE US WANG')real[b][4]=1;}
assert.equal(ctx.streakResult(wangId),'WON');
assert.equal(ctx.streakResult(wangId.replace(/R5$/,'R6')),'LOST','Earlier first loss defeats a later-round selection immediately');
assert.equal(ctx.streakResult(wangId.replace(/R5$/,'NEVER')),'LOST');
assert.equal(ctx.streakResult(wangId.replace('|R5|','|R6|')),null,'A retrospective event before offer requires manual review');
console.log('PASS: published ID parsing, current-round first event, later/never loss grading and retrospective correction guard.');
