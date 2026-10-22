const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
const code=src.slice(src.indexOf('  function computeSuggestedResult('),src.indexOf('  // Derives the pausable'));
const scores={A:[62,null],B:[50,null]};
const ctx={Date:class extends Date{static now(){return Date.parse('2026-10-22T12:00:00+11:00');}},Number,
 ROUND_DATES:{1:'2026-10-16',2:'2026-10-23'},sydneyKickoffUTC:d=>new Date(d+'T19:00:00+11:00'),
 DATA:{official_fa_cup_draw:{preliminary_results_final:true,preliminary_round:1,preliminary:[['A','B']],preliminary_winners:['A']}},
 resolveTeamName:n=>n,sameTeam:(a,b)=>a===b,FUTURE_DIVS:['D1'],H2H_DIVISIONS:{D1:['A','B']},hasNoFixtures:()=>false,
 state:{currentRound:2,cupFixtures:{'FA CUP':[]},playoffFixtures:{}},fixtureScore:(t,o,r)=>scores[t]?.[r-1]??null};
vm.createContext(ctx);vm.runInContext(code+';this.api={computeSuggestedResult,betHasReviewableResult};',ctx);
const {computeSuggestedResult:result,betHasReviewableResult:ready}=ctx.api;
const bet=(id,status='PENDING',legResult=null)=>({status,selections:[{id,result:legResult}]});
assert.equal(ready(bet('H2H|res-a|R2|A|B')),false);
scores.A[1]=90;scores.B[1]=50;
assert.equal(ready(bet('H2H|res-a|R2|A|B')),false,'Future scores must not create flags');
assert.equal(result('H2H|res-a|R1|A|B'),'WON','Confirmed preliminary outcome stays usable');
assert.equal(ready(bet('H2H|res-a|R1|A|B')),true);
assert.equal(ready(bet('H2H|res-a|R1|A|B','CASHED_OUT')),false);
assert.equal(ready(bet('H2H|res-a|R1|A|B','WON')),false);
assert.equal(ready(bet('H2H|res-a|R1|A|B','PENDING','WON')),false);
assert.equal(ready(bet('LEADAT|RODDY|2|A')),false,'Manual markets need actual result support');
ctx.DATA.official_fa_cup_draw={};scores.A[0]=null;
assert.equal(result('H2H|res-a|R1|A|B'),null);
scores.A[0]=NaN;assert.equal(result('H2H|res-a|R1|A|B'),null);
scores.A[0]=62;assert.equal(result('H2H|res-a|R1|A|B'),'WON');
const multi={status:'PENDING',selections:[{id:'H2H|res-a|R1|A|B',result:'WON'},{id:'H2H|res-a|R2|A|B'}]};
assert.equal(ready(multi),false,'Already resolved leg cannot flag a future unresolved leg');
assert(!src.includes('r !== null && r <= state.currentRound'));
console.log('PASS: upcoming Round 2, future populated scores, missing/invalid scores, actual past result, confirmed preliminary, settled/cashed-out bets and graded multi legs.');
