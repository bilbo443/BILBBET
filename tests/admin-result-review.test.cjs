const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const app=fs.readFileSync('js/app.js','utf8'),read=n=>JSON.parse(fs.readFileSync('data/'+n+'.json','utf8'));
const part=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a)));
const scores=read('real_results'),roster=read('h2h_divisions'),schedule=read('h2h_schedule'),dates=read('round_dates');
const ctx={Date:class extends Date{static now(){return Date.parse('2026-11-10T08:00:00+11:00');}},Number,
 DATA:{roddy_results:read('roddy_results'),official_fa_cup_draw:{}},ROUND_DATES:dates,H2H_DIVISIONS:roster,H2H_SCHEDULE:schedule,REAL_RESULTS:scores,
 FUTURE_DIVS:Object.keys(roster),AVERAGE_TEAM:'AVERAGE TEAM',state:{currentRound:5,cupFixtures:{'FA CUP':[]},playoffFixtures:{}},
 resolveTeamName:t=>t,sameTeam:(a,b)=>a===b,divisionFixtureConfirmed:()=>true,
 hasNoFixtures:(d,r)=>d!=='ELIZA CUP (D1)'&&(r===1||r>=24),fixtureScore:(t,o,r)=>scores[t]?.[r-1]??null,
 sydneyKickoffUTC:d=>new Date(d+'T19:00:00+11:00'),betSelectionLabel:s=>s.label||s.id,
 esc:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),fmt:v=>String(v),formatOdds:v=>Number(v).toFixed(2)};
vm.createContext(ctx);vm.runInContext(part('  function getPickRound(','  // Suggests WON/LOST')+part('  function computeSuggestedResult(','  // Derives the pausable')+part('  function computeDivisionStandings(','  function findTeamDivision(')+part('  function renderAdminBetReviewQueue(','  async function loadAdminData('),ctx);
const pick=(scope,r,team)=>`LEADAT|${scope}|${r}|${team}`;
const stair={id:'old-leader',status:'PENDING',username:'test admin review',stake:50,selections:[{id:pick('ELIZA CUP (D1)',2,'STAIRWAY TO EVANS'),label:'Stairway leading R2',odds:7.93}]};
assert.equal(ctx.computeSuggestedResult(stair.selections[0].id),'LOST');
assert.equal(ctx.computeSuggestedResult(pick('ELIZA CUP (D1)',2,'BC UNITED ZEBRAS')),'WON','Historical round not current standings');
assert(ctx.betHasReviewableResult(stair));
let html=ctx.renderAdminBetReviewQueue([stair]);
for(const value of ['Suggested: LOST','old-leader|WON','old-leader|LOST','old-leader|VOID','data-review-confirm','flex-wrap:wrap'])assert(html.includes(value));
const backup=scores['GIVE US WANG'][1];scores['GIVE US WANG'][1]=null;
assert.equal(ctx.computeSuggestedResult(stair.selections[0].id),null);
assert(ctx.betHasReviewableResult(stair),'Missing past scores still require manual review');
assert(ctx.renderAdminBetReviewQueue([stair]).includes('Manual review required'));
scores['GIVE US WANG'][1]=backup;
const future={...stair,id:'future',selections:[{id:pick('ELIZA CUP (D1)',6,'STAIRWAY TO EVANS'),odds:7.93}]};
assert.equal(ctx.betHasReviewableResult(future),false);assert(!ctx.renderAdminBetReviewQueue([future]).includes('future|LOST'));
ctx.state.adminBetReviewScope='all';assert(ctx.renderAdminBetReviewQueue([future]).includes('future|LOST'));
for(const status of ['WON','LOST','VOID','CASHED_OUT'])assert(!ctx.renderAdminBetReviewQueue([{...stair,status}]).includes('old-leader|LOST'));
const multi={...stair,id:'multi',selections:[{...stair.selections[0],result:'PENDING'},{...future.selections[0],result:'WON'}]};
assert(ctx.renderAdminBetReviewQueue([multi]).includes('data-resolveleg="multi|0|LOST"'));
const teams=Object.values(roster).flat(),top=teams.slice().sort((a,b)=>ctx.DATA.roddy_results[b][0]-ctx.DATA.roddy_results[a][0])[0];
ctx.DATA.roddy_results[top][0]+=1;
assert.equal(ctx.computeSuggestedResult(pick('RODDY',1,top)),'WON');
const max=ctx.DATA.roddy_results[top][0],other=teams.find(t=>t!==top);ctx.DATA.roddy_results[other][0]=max;
assert.equal(ctx.computeSuggestedResult(pick('RODDY',1,top)),null,'Equal leader requires manual policy');
assert(app.includes('renderAdminBetReviewQueue(bets)'));
console.log('PASS: real historical R2 leader result, visible mobile actions, overdue/manual queue, future exclusion, all-pending overrides, multi legs, tied leaders and settled/cashed-out exclusions.');
