const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('js/app.js','utf8'),part=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const markets=[{team:'A',teamId:'001',kind:'WIN',basis:5,last:7},{team:'B',teamId:'002',kind:'LOSS',basis:5,last:7}];
let collects=0,marked=0;
const ctx={Number,Map,state:{user:{isAdmin:true},currentRound:5},trustedPrices:new Map(),streakMarkets:()=>markets,isPickBlocked:()=>false,
 refreshSubmissionControls:async()=>true,loadFeaturedMedianSpecials:async()=>{},assertFuturesScoreFreshness:()=>{},priceSyncFingerprint:async()=>'same',loadTrustedPrices:async()=>{},
 secureRpc:async name=>name==='bilbbet_price_sync_status'?{fingerprint:'same',round:5}:(marked++,true)};
function fill(){ctx.trustedPrices.clear();for(const m of markets)for(const target of ['R5','R6','R7','NEVER']){const id=`STREAK|${m.kind}|${m.teamId}|R5|${target}`;ctx.trustedPrices.set(id,{id,team_id:m.teamId,round:5,odds:4,safetyGroup:`STREAK|${m.kind}|${m.teamId}|R5`,streakOutcomeCount:4});}}
ctx.collectTrustedPrices=async()=>{collects++;fill();return 8;};
vm.createContext(ctx);vm.runInContext(part('  function streakQuoteCoverageIssues(){','  let priceSyncRunning='),ctx);
(async()=>{
assert.equal(ctx.streakQuoteCoverageIssues().length,2);
await ctx.syncPricesIfNeeded();assert.equal(collects,1,'Matching cache cannot hide missing special books');assert.equal(marked,1);
assert.equal(ctx.streakQuoteCoverageIssues().length,0);
await ctx.syncPricesIfNeeded();assert.equal(collects,1,'Complete matching board is reused');
ctx.trustedPrices.delete('STREAK|WIN|001|R5|R6');assert.equal(ctx.streakQuoteCoverageIssues().length,1);
await ctx.syncPricesIfNeeded();assert.equal(collects,2,'Partial book is rebuilt');
ctx.isPickBlocked=()=>true;ctx.trustedPrices.clear();assert.equal(ctx.streakQuoteCoverageIssues().length,0,'Intentionally closed specials do not cause refresh loops');
ctx.isPickBlocked=()=>false;ctx.collectTrustedPrices=async()=>0;const before=marked;
await assert.rejects(ctx.syncPricesIfNeeded(true),/incomplete/);assert.equal(marked,before,'Failed publication is not marked current');
fill();ctx.trustedPrices.delete('STREAK|WIN|001|R5|R7');for(const q of ctx.trustedPrices.values())if(q.team_id==='001')q.streakOutcomeCount=3;
assert.equal(ctx.streakQuoteCoverageIssues().length,0,'Explicit active outcome count supports genuinely suspended outcomes');
console.log('PASS: missing/partial quote repair, complete-cache reuse, paused-market exclusions and failed-publication cache guard.');
})().catch(e=>{console.error(e);process.exitCode=1});
