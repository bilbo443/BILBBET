const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('js/app.js','utf8');
const part=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
const ctx={DATA:{roddy_results:{A:[10,80,null],B:[90,60,100]}},resolveTeamName:t=>t,
 FUTURES:{fa_cup_markets:{win_pct:[{team:'A',suspended:false}],reach_r32_pct:[{team:'A',suspended:true}]},fa_cup_labels:{reach_r32_pct:'R32',win_pct:'Winner'}},
 state:{currentRound:5,cupFixtures:{'FA CUP':[{round:4,stage:'Round of 32'},{round:8,stage:'Round of 32 Replay'}]}}};
vm.createContext(ctx);
vm.runInContext(part('  function getPickRound(','  // Suggests WON/LOST'),ctx);
vm.runInContext(part('  function publishedRoddyTotals(','  function renderOpeningRoundHub(')+part('  function defaultCupFuturesMarket(','  function cupMarketTabs('),ctx);
for(let round=1;round<=26;round++)for(const kind of ['H2H','H2H_MEDIAN','H2H_WIN'])assert.equal(ctx.getPickRound(`${kind}|A|R${round}`),round);
assert.equal(ctx.getPickRound('H2H_MEDIAN|A|R5oops'),null);
assert.equal(ctx.getPickRound('FACUP|win_pct|A'),null);
const result=ctx.publishedRoddyTotals(['A','B'],3);
assert.equal(result.totals.get('A'),90);assert.equal(result.totals.get('B'),150);
assert.equal(JSON.stringify(result.complete),'[1,2]','Roddy includes its own GW1 scores');
assert.equal(JSON.stringify(ctx.publishedRoddyTotals(['A','B'],4).complete),'[1,2]','Partial rounds excluded');
assert.equal(ctx.defaultCupFuturesMarket(),'win_pct');
assert(ctx.faCupProgressNote().includes('Round of 32 Replay in Round 8'));
ctx.FUTURES.fa_cup_markets.win_pct[0].suspended=true;
assert.equal(ctx.defaultCupFuturesMarket(),'fixtures','All completed markets default to fixtures');
let callback,events=[],alerts=[];
const sync={state:{user:{isAdmin:true}},priceSyncRunning:Promise.resolve(),clearTimeout:()=>{},setTimeout:fn=>{callback=fn;return 1;},
 syncRewardContext:async()=>events.push('results'),syncTrustedPrices:async()=>{events.push('prices');throw Error('stale futures');},
 alert:x=>alerts.push(x),console:{error:()=>{}},render:()=>events.push('render')};
vm.createContext(sync);vm.runInContext('let rewardSyncTimer=null;'+part('  function scheduleRewardSync(){','  async function checkAndCelebrateReward('),sync);
(async()=>{
 sync.scheduleRewardSync();assert(callback,'An in-flight price sync must not discard a results sync');await callback();
 assert.equal(events.join(','),'results,prices,render');assert(alerts[0].startsWith('Results synced.'));
 events=[];alerts=[];sync.syncRewardContext=async()=>{throw Error('results unavailable');};sync.scheduleRewardSync();await callback();
 assert.equal(events.length,0);assert(alerts[0].includes('tipping rewards are waiting'));
 const rollover={state:{user:{isAdmin:true},currentRound:4,cupFixtures:{}},TIPPING_SECTIONS:[],DATA:{admin_teams:[]},PRESEASON_SLOTS:[],seasonKeyPart:()=>'',secureRpc:async name=>name==='bilbbet_current_round'?5:null,syncTrustedPrices:async()=>{throw Error('stale futures');}};
 vm.createContext(rollover);vm.runInContext(part('  async function syncRewardContext(){','  function scheduleRewardSync(){'),rollover);
 await rollover.syncRewardContext();assert.equal(rollover.state.currentRound,5);assert(rollover.state.error.startsWith('Results synced and Round 5 selected'));
 console.log('PASS: 26-round median/win lockout metadata, actual Roddy totals, current cup landing, independent results sync and rollover despite retained prices.');
})().catch(error=>{console.error(error);process.exitCode=1;});
