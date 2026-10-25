const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('js/app.js','utf8');
const model=source.slice(source.indexOf('  function seededH2HRng('),source.indexOf('  const ODDS_FLOOR ='));
const median=source.slice(source.indexOf('  const medianPriceCache={};'),source.indexOf('  const winAnyOpponentCache ='));
const read=n=>JSON.parse(fs.readFileSync('data/'+n+'.json','utf8'));
function setup(form=true,rename=false){
 const DATA={};for(const n of ['h2h_history','h2h_shift','h2h_cup_shift','h2h_variance_widen','h2h_divisions','h2h_record','team_strength_tiers','admin_teams','roddy_results','real_results','round_dates'])DATA[n]=read(n);
 if(!form){DATA.roddy_results={};DATA.real_results={};}
 if(rename){for(const t of DATA.admin_teams)if(t.name==='GIVE US WANG')t.name='RENAMED WANG';for(const n of ['h2h_history','h2h_shift','h2h_cup_shift','h2h_variance_widen','roddy_results','real_results']){DATA[n]['RENAMED WANG']=DATA[n]['GIVE US WANG'];delete DATA[n]['GIVE US WANG'];}for(const d in DATA.h2h_divisions)DATA.h2h_divisions[d]=DATA.h2h_divisions[d].map(t=>t==='GIVE US WANG'?'RENAMED WANG':t);}
 const record={};for(const r of DATA.h2h_record)record[r.teamA+'|'+r.teamB]=r;
 class FixedDate extends Date{static now(){return Date.parse('2026-10-26T00:00:00Z')}}
 const ctx={DATA,H2H_HISTORY:DATA.h2h_history,H2H_SHIFT:DATA.h2h_shift,H2H_CUP_SHIFT:DATA.h2h_cup_shift,H2H_VARIANCE_WIDEN:DATA.h2h_variance_widen,H2H_DIVISIONS:DATA.h2h_divisions,REAL_RESULTS:DATA.real_results,ROUND_DATES:DATA.round_dates,K:8,AVERAGE_TEAM:'AVERAGE TEAM',state:{currentRound:3},Date:FixedDate,
 sydneyKickoffUTC:d=>new Date(d.includes('T')?d:d+'T08:00:00Z'),
 getH2HRecord:(a,b)=>record[a+'|'+b]?{rec:record[a+'|'+b],flipped:false}:record[b+'|'+a]?{rec:record[b+'|'+a],flipped:true}:null};
 ctx.findTeamDivision=t=>Object.keys(ctx.H2H_DIVISIONS).find(d=>ctx.H2H_DIVISIONS[d].includes(t));
 vm.createContext(ctx);vm.runInContext(model+median,ctx);return ctx;
}
const SIMS=Number(process.env.H2H_TEST_SIMS || 4000);
const a='GIVE US WANG',b='STAIRWAY TO EVANS';const live=setup(),prior=setup(false);
const first=live.computeH2HMarket(a,b,3,SIMS);const repeat=live.computeH2HMarket(a,b,3,SIMS);assert.deepStrictEqual(first,repeat);
const reverse=live.computeH2HMarket(b,a,3,SIMS);assert.equal(first.aWinPct,reverse.bWinPct);assert.equal(first.bWinPct,reverse.aWinPct);assert.equal(first.drawPct,reverse.drawPct);
const next=live.computeH2HMarket(a,b,4,SIMS);assert.equal(next.aWinPct,first.aWinPct);assert.equal(next.bWinPct,first.bWinPct);
const base=prior.computeH2HMarket(a,b,3,SIMS);
const medianOne=live.computeVsLeagueMedianMarket(a,3,SIMS);vm.runInContext('Object.keys(medianPriceCache).forEach(k=>delete medianPriceCache[k])',live);assert.deepStrictEqual(medianOne,live.computeVsLeagueMedianMarket(a,3,SIMS));
assert(first.aWinPct>base.aWinPct);
assert.equal(live.h2hFormAdjustment(a,3).played,2);assert.equal(live.h2hFormAdjustment(b,3).played,2);
assert.equal(live.h2hFormAdjustment(a,3).weight,.2);
assert.equal(live.h2hFormAdjustment(a,1).shift,0);
assert.equal(live.h2hFormAdjustment(b,4).played,2); // Future stray REAL_RESULTS score is ignored.
const renamed=setup(true,true);assert.equal(renamed.h2hFormAdjustment('RENAMED WANG',3).shift,live.h2hFormAdjustment(a,3).shift);
// Disable rivalry only for this identity-invariance comparison (its record names are historical).
live.getH2HRecord=()=>null;renamed.getH2HRecord=()=>null;
assert.equal(renamed.computeH2HMarket('RENAMED WANG',b,3,SIMS).aWinPct,live.computeH2HMarket(a,b,3,SIMS).aWinPct);
const shifts=Object.values(live.H2H_DIVISIONS).flat().map(t=>({team:t,...live.h2hFormAdjustment(t,3)}));
assert(shifts.every(r=>r.played===2&&Math.abs(r.shift)<=12));
assert(shifts.some(r=>r.shift>0)&&shifts.some(r=>r.shift<0));
const partial=setup();partial.DATA.roddy_results['BC UNITED ZEBRAS'][1]=null;assert.equal(partial.h2hFormAdjustment(a,3).played,1);
const future=setup();for(const scores of Object.values(future.DATA.roddy_results))scores[2]=150;assert.equal(future.h2hFormAdjustment(a,4).played,2);
console.log('PASS: repeatability, orientation, prior/known scores, identity stability, future/partial exclusion and bounded form for all '+shifts.length+' teams');
console.log(JSON.stringify({matchup:{a,b},baselineWinPct:base.aWinPct,adjustedWinPct:first.aWinPct,baselineOdds:1/(base.aWinPct/100*1.05),adjustedOdds:1/(first.aWinPct/100*1.05),opponentOdds:1/(first.bWinPct/100*1.05),form:[{team:a,...live.h2hFormAdjustment(a,3)},{team:b,...live.h2hFormAdjustment(b,3)}],largestAdjustments:shifts.sort((x,y)=>Math.abs(y.shift)-Math.abs(x.shift)).slice(0,5)},null,2));
