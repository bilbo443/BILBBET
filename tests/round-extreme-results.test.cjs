const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=fs.readFileSync('js/app.js','utf8');
const part=(a,b)=>{const start=app.indexOf(a);assert(start>=0,a);const end=app.indexOf(b,start);assert(end>start,b);return app.slice(start,end);};
const scores={A:[90,50],B:[30,40],C:[0,30],D:[999,20]};
const ctx={Number,Math,Date:class extends Date{static now(){return Date.parse('2026-11-11T12:00:00+11:00');}},
 ROUND_DATES:{1:'2026-10-16',2:'2026-10-23',3:'2026-10-30'},
 sydneyKickoffUTC:d=>new Date(d+'T19:00:00+11:00'),resolveTeamName:n=>n==='OLD A'?'A':n,
 ALL_TEAMS:['A','B','C','D'],AVERAGE_TEAM:'AVERAGE TEAM',REAL_RESULTS:scores,
 H2H_SCHEDULE:{D1:[[['A','B'],['C','AVERAGE TEAM']],[['A','B'],['C','D']]]},
 state:{currentRound:2},esc:String,fmt:String,formatOdds:n=>Number(n).toFixed(2),betSelectionLabel:s=>s.label||s.id};
vm.createContext(ctx);
vm.runInContext(part('  function getPickRound(','  // Suggests WON/LOST')+part('  function computeSuggestedResult(','  // Derives the pausable')+part('  function roundExtremeTeams(','  function computeRoundExtremes(')+part('  function renderAdminBetReviewQueue(','  async function loadAdminData('),ctx);
const pick=(kind,team,round=1)=>`SPECIALFIX|${kind}|R${round}|${team}`;
const result=(kind,team,round=1)=>ctx.computeSuggestedResult(pick(kind,team,round));
assert.equal(result('win_round','A'),'WON');assert.equal(result('win_round','OLD A'),'WON');
assert.equal(result('win_round','B'),'LOST');assert.equal(result('lose_round','C'),'WON','Zero is a valid weekly low');
assert.equal(result('lose_round','A'),'LOST');assert.equal(result('win_round','D'),null,'Unscheduled score must not enter the priced field');
assert.equal(result('win_round','A',2),null,'Current/split round is not final even with all scores');
ctx.state.currentRound=3;assert.equal(result('win_round','A',2),'WON');ctx.state.currentRound=2;
for(const value of [null,undefined,NaN,Infinity,'30']){scores.B[0]=value;assert.equal(result('win_round','A'),null);assert.equal(result('lose_round','C'),null);}
scores.B[0]=90;assert.equal(result('win_round','A'),null,'Tied highest needs a policy decision');assert.equal(result('win_round','C'),'LOST');
scores.B[0]=0;assert.equal(result('lose_round','C'),null,'Tied lowest needs a policy decision');assert.equal(result('lose_round','A'),'LOST');scores.B[0]=30;
for(const id of ['SPECIALFIX|win_round|R0|A','SPECIALFIX|lose_round|R27|A','SPECIALFIX|win_round|R1oops|A','SPECIALFIX|win_round|R1|A|extra','SPECIALFIX|win_round|R1|Unknown'])assert.equal(ctx.computeSuggestedResult(id),null,id);
ctx.ROUND_DATES[1]='2026-12-01';assert.equal(result('win_round','A'),null);ctx.ROUND_DATES[1]='2026-10-16';
const single={id:'highest',username:'test',stake:20,status:'PENDING',selections:[{id:pick('win_round','A'),odds:8}]};
assert(ctx.betHasReviewableResult(single));
let html=ctx.renderAdminBetReviewQueue([single]);assert(html.includes('Suggested: WON'));assert(html.includes('data-setstatus="highest|WON"'));
const multi={...single,id:'multi',selections:[{id:pick('lose_round','C'),odds:9},{id:pick('win_round','A',2),odds:7}]};
html=ctx.renderAdminBetReviewQueue([multi]);assert(html.includes('data-resolveleg="multi|0|WON"'));
for(const status of ['WON','LOST','VOID','CASHED_OUT'])assert(!ctx.betHasReviewableResult({...single,status}));
assert(!ctx.betHasReviewableResult({...single,selections:[{...single.selections[0],result:'WON'}]}));

// Use the current published field and scores to cross-check both markets.
const read=n=>JSON.parse(fs.readFileSync('data/'+n+'.json','utf8'));
ctx.H2H_SCHEDULE=read('h2h_schedule');ctx.ALL_TEAMS=Object.keys(read('h2h_shift'));ctx.REAL_RESULTS=read('real_results');ctx.ROUND_DATES=read('round_dates');ctx.state.currentRound=5;
let checked=0;
for(let round=1;round<=4;round++){
 const teams=ctx.roundExtremeTeams(round),values=teams.map(t=>ctx.REAL_RESULTS[t]?.[round-1]);assert(teams.length);assert(values.every(Number.isFinite));
 for(const [kind,extreme] of [['win_round',Math.max(...values)],['lose_round',Math.min(...values)]]){
  const winners=teams.filter(t=>ctx.REAL_RESULTS[t][round-1]===extreme);
  for(const team of teams)assert.equal(result(kind,team,round),winners.includes(team)?(winners.length===1?'WON':null):'LOST');
  checked+=teams.length;
 }
}

// Price-board collection must expand the real renderer keys, not win/lose.
const loop=app.match(/for\(const key of \['win_round','lose_round','charity','philanthropy'\]\)\{\s*state\.specialsExtremeExpanded=key;\s*htmlPrices\(renderSpecialsTab\(\)\);\s*\}/)?.[0];assert(loop);
assert(app.includes("priceModelVersion:'live-ecl-groups-v3'"),'Old cached boards must refresh once for repaired special/ECL publication');
const expanded=[];vm.runInNewContext(loop,{state:{},renderSpecialsTab(){return '';},htmlPrices(){expanded.push('rendered');}});assert.equal(expanded.length,4);
assert.equal(JSON.stringify(scores),JSON.stringify({A:[90,50],B:[30,40],C:[0,30],D:[999,20]}),'No scores changed by grading');
console.log(`PASS: ${checked} published score outcomes; singles/multis, zero/missing scores, aliases, ties, scheduled field, current/future gating, manual override and price-board expansion.`);
