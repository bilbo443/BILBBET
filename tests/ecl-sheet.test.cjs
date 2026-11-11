const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const Ecl=require('../js/ecl-draw.js'),Sheet=require('../js/ecl-sheet-model.js');
const app=fs.readFileSync('js/app.js','utf8');
const read=name=>JSON.parse(fs.readFileSync('data/'+name+'.json','utf8'));
const names=['admin_teams','h2h_history','h2h_cup_shift','h2h_variance_widen','team_strength_tiers','roddy_results','real_results','roster_rules','futures','h2h_divisions','round_dates'];
const DATA=Object.fromEntries(names.map(n=>[n,read(n)]));
const rules=DATA.roster_rules.ecl_rules,teams=rules.field_team_ids.map(id=>{const t=DATA.admin_teams.find(t=>String(t.id).padStart(3,'0')===id);return {id,name:t.name,aliases:String(t.prev_names||'').split(',').filter(Boolean),pot:rules.pot1_team_ids.includes(id)?1:2};});
const active=Object.values(DATA.h2h_divisions).flat(),source=DATA.roddy_results;
const form_rounds=[1,2,3,4].filter(r=>active.every(t=>Number.isFinite(source[t]?.[r-1])));
const model={model_version:Ecl.VERSION,season:'2026-27',price_margin:.05,current_round:5,rules,teams,data:{...DATA},form_rounds,fixtures:[]};
const snapshot={schema_version:2,exported_at_utc:'2026-11-11T01:00:00Z',model,fingerprint:crypto.createHash('sha256').update(JSON.stringify(model)).digest('hex')};
Sheet.validate(snapshot);
const pot1=teams.filter(t=>t.pot===1),pot2=teams.filter(t=>t.pot===2);
const groups=Object.fromEntries(['A','B','C'].map((g,i)=>[g,[pot1[i].id,...pot2.slice(i*3,i*3+3).map(t=>t.id)]]));
const blocks=Object.fromEntries(Object.entries(groups).map(([g,ids])=>[g,Ecl.slots(ids).map(id=>['',teams.find(t=>t.id===id).name,'','',''])]));
assert.deepEqual(Sheet.readDraw(model,blocks),groups);
const bad=structuredClone(blocks);bad.B[0]=bad.A[0];assert.throws(()=>Sheet.readDraw(model,bad),/duplicate/);
bad.B[0]=['unknown'];assert.throws(()=>Sheet.readDraw(model,bad),/Unknown/);
bad.B[0]=blocks.B[3];bad.B[3]=blocks.B[0];assert.throws(()=>Sheet.readDraw(model,bad),/Pot/);
const partial=structuredClone(groups);partial.A[2]=null;assert.deepEqual(Sheet.project(model,partial,'A'),[]);
assert.throws(()=>Sheet.validate({...snapshot,schema_version:1}),/schema 2/);
// Evaluate the actual browser samplers and projection against the portable module.
const context={DATA,H2H_HISTORY:DATA.h2h_history,H2H_DIVISIONS:DATA.h2h_divisions,H2H_SHIFT:read('h2h_shift'),H2H_CUP_SHIFT:DATA.h2h_cup_shift,H2H_VARIANCE_WIDEN:DATA.h2h_variance_widen,REAL_RESULTS:DATA.real_results,ROUND_DATES:DATA.round_dates,ROSTER_RULES:DATA.roster_rules,FUTURES:DATA.futures,K:8,BilbbetEcl:Ecl,state:{currentRound:5,cupFixtures:{ECL:[]}},seededH2HRng:Ecl.rng,sydneyKickoffUTC:()=>0,h2hTeamIdentity:t=>t,resolveTeamName:t=>t,sameTeam:(a,b)=>a===b,toOdds:p=>({odds:Sheet.odds(p),suspended:Sheet.odds(p)===null})};
vm.createContext(context);
const samplerSource=app.slice(app.indexOf('  function makeShiftedSampler('),app.indexOf('  function sampleTeamForCup('));
vm.runInContext(samplerSource,context);
const projectionSource=app.slice(app.indexOf('  const eclProjectionCache='),app.indexOf('  function eclGroupQuotes('));
vm.runInContext(projectionSource,context);
const named=Object.fromEntries(Object.entries(groups).map(([g,ids])=>[g,ids.map(id=>teams.find(t=>t.id===id).name)]));
for(const g of ['A','B','C']){
  const portable=Sheet.project(model,groups,g),browser=context.eclGroupProjection(g,named);
  assert.deepEqual(portable,Sheet.project(model,groups,g));
  for(const row of portable){const native=browser.find(t=>t.teamId===row.team);assert.equal(row.pct,native.pct);assert.equal(row.winOdds,native.odds);assert.equal(row.fingerprint,native.fingerprint);assert(row.qualifyPct>=row.pct);}
  assert(Math.abs(portable.reduce((s,r)=>s+r.pct,0)-100)<1e-8);
  assert(Math.abs(portable.reduce((s,r)=>s+r.qualifyPct,0)-200)<1e-8);
}
// Qualified counts must not consume RNG or change the published winner model.

const sample=(id,n,rng)=>Array.from({length:n},()=>Math.floor(rng()*100));
assert.deepEqual([{team:'a',pct:25.033333333333335},{team:'b',pct:26.016666666666666},{team:'c',pct:24.116666666666667},{team:'d',pct:24.833333333333332}],Ecl.winnerProbabilities(['a','b','c','d'],sample).map(({team,pct})=>({team,pct})));
// Apps Script edit routing and failed input must clear all old prices.
const wrapper=fs.readFileSync('sheets/owner-wrapper.gs','utf8'),gs={BilbbetEclSheet:Sheet};vm.createContext(gs);vm.runInContext(wrapper,gs);
let calls=0;gs.BILBBET_ECL_REFRESH=()=>calls++;
const event=(row,col,lastRow=row,lastCol=col)=>({range:{getSheet:()=>({getName:()=> 'ECL'}),getRow:()=>row,getColumn:()=>col,getLastRow:()=>lastRow,getLastColumn:()=>lastCol}});
gs.BILBBET_ECL_EDIT(event(9,21));gs.BILBBET_ECL_EDIT(event(12,35));gs.BILBBET_ECL_EDIT(event(1,1,9,21));assert.equal(calls,3);
gs.BILBBET_ECL_EDIT(event(65,39));gs.BILBBET_ECL_EDIT(event(8,21));assert.equal(calls,3);
let rendered;gs.bilbbetEclAssertOwned_=()=>{};gs.SpreadsheetApp={getActive:()=>({getSheetByName:()=>null})};gs.bilbbetEclRender_=(sheet,data,error)=>rendered={data,error};
gs.bilbbetEclRefreshUnlocked_({});assert.equal(rendered.data,null);assert.match(rendered.error,/Install and import/);
// Refuse an occupied panel, including formulas whose current display is blank.
for(const mode of ['content','formula','merge','note']){
  let writes=0,released=false;
  const range={getMergedRanges:()=>mode==='merge'?[{}]:[],getValues:()=>[[mode==='content'?'Owner content':'']],getFormulas:()=>[[mode==='formula'?'=""':'']],getNotes:()=>[[mode==='note'?'Owner note':'']]};
  const sheet={getMaxRows:()=>100,getMaxColumns:()=>50,getRange:()=>range};
  const ctx={SpreadsheetApp:{getActive:()=>({getSheetByName:()=>sheet,getRangeByName:()=>null,setNamedRange:()=>writes++})},LockService:{getDocumentLock:()=>({waitLock:()=>{},releaseLock:()=>released=true})}};
  vm.createContext(ctx);vm.runInContext(wrapper,ctx);
  assert.throws(()=>ctx.BILBBET_ECL_INSTALL(),/contains content or merged cells/);assert.equal(writes,0);assert(released);
}
// Invalid checksum is rejected before any spreadsheet write.
const checksum={BilbbetEclSheet:Sheet,Utilities:{DigestAlgorithm:{SHA_256:1},Charset:{UTF_8:1},computeDigest:(_,text)=>[...crypto.createHash('sha256').update(text).digest()]}};
vm.createContext(checksum);vm.runInContext(wrapper,checksum);
assert.throws(()=>checksum.BILBBET_ECL_IMPORT_JSON(JSON.stringify({...snapshot,fingerprint:'wrong'})),/checksum differs/);
console.log('PASS: all three groups exactly match browser prices/fingerprints, top-two probabilities, deterministic repeats, legacy winner compatibility, invalid/partial draws and edit routing.');
