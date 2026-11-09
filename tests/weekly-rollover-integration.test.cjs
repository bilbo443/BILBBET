// No network: real client sync orchestration with a synthetic complete GW5 snapshot.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const app=fs.readFileSync('js/app.js','utf8'),part=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a))),read=n=>JSON.parse(fs.readFileSync('data/'+n+'.json','utf8'));
const roster=read('h2h_divisions'),schedule=read('h2h_schedule'),league=read('real_results'),roddy=read('roddy_results');
Object.keys(league).sort().forEach((team,i)=>league[team][4]=roddy[team][4]=45+(i*17)%70);
const events=[];let rewardPayload=null;
const ctx={Number,Set,JSON,Object,DATA:{admin_teams:read('admin_teams'),real_results:league,roddy_results:roddy},H2H_DIVISIONS:roster,
 FUTURES:{futures_refresh:{coverage:[...Object.keys(roster),'RODDY','FA CUP','ECL'],source_scores:Object.keys(league).sort().map(t=>[t,league[t],roddy[t]])}},
 state:{user:{isAdmin:true},currentRound:5,cupFixtures:{}},TIPPING_SECTIONS:[{key:'ELIZA',divs:['ELIZA CUP (D1)']},{key:'DIV2',divs:['DIVISION 2A','DIVISION 2B']},{key:'DIV3',divs:['DIVISION 3A','DIVISION 3B']}],
 PRESEASON_SLOTS:[],getTippableFixtures:(d,r)=>schedule[d]?.[r-1]||[],resolveTeamName:t=>t,fixtureScore:(t,o,r)=>league[t]?.[r-1]??null,
 isMrMedianWeek:()=>false,mrMedianRewardTarget:()=>null,perfectRoundEligible:()=>true,seasonKeyPart:()=> '26-27',
 refreshSubmissionControls:async()=>true,loadFeaturedMedianSpecials:async()=>{},priceSyncFingerprint:async()=>'new-GW6-snapshot',loadTrustedPrices:async()=>{},streakQuoteCoverageIssues:()=>[],
 collectTrustedPrices:async()=>{assert.equal(ctx.state.currentRound,6);ctx.assertFuturesScoreFreshness();events.push('prices');return 100;},
 secureRpc:async(name,args)=>{
  if(name==='bilbbet_sync_rewards'){rewardPayload=args.p_context;events.push('results');return true;}
  if(name==='bilbbet_current_round')return 6;
  if(name==='bilbbet_price_sync_status')return {round:5,fingerprint:'old'};
  if(name==='bilbbet_mark_price_sync'){events.push('marked');return true;}
  throw Error('Unexpected external operation: '+name);
 }};
vm.createContext(ctx);vm.runInContext(part('  function assertFuturesScoreFreshness(){','  function streakQuoteCoverageIssues(){')+part('  async function syncPricesIfNeeded(','  let priceSyncRunning=')+part('  async function syncRewardContext(){','  function scheduleRewardSync(){'),ctx);
ctx.syncTrustedPrices=force=>{assert(force);return ctx.syncPricesIfNeeded(force);};
(async()=>{
await ctx.syncRewardContext();assert.equal(ctx.state.currentRound,6);assert.equal(ctx.state.h2hRound,6);
assert.equal(events.join(','),'results,prices,marked');
const completed=rewardPayload.fixtures.filter(f=>f.round===5);assert.equal(completed.length,33);assert(completed.every(f=>Number.isFinite(f.sa)&&Number.isFinite(f.sb)));assert.equal(new Set(completed.flatMap(f=>[f.a,f.b])).size,66);
assert(rewardPayload.fixtures.filter(f=>f.round===6).every(f=>f.sa===null&&f.sb===null),'Future scores remain unpopulated');
const previous=league[Object.keys(league)[0]][4];ctx.FUTURES.futures_refresh.source_scores=JSON.parse(JSON.stringify(ctx.FUTURES.futures_refresh.source_scores));league[Object.keys(league)[0]][4]=previous+1;
assert.throws(()=>ctx.assertFuturesScoreFreshness(),/out of date/,'Changed score cannot reuse earlier futures');
console.log('PASS: complete synthetic GW5 reward context → GW6 rollover → fresh price publication → current-cache stamp; no financial operations.');
})().catch(e=>{console.error(e);process.exitCode=1});
