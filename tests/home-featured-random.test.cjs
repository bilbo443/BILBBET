const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const app=fs.readFileSync('js/app.js','utf8'),part=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a)));
let word=0,calls=0;
const markets=Array.from({length:6},(_,i)=>({teamA:'A'+i,teamB:'B'+i,aWinPct:10+i*7,bWinPct:90-i*7}));
const saved={id:'H2H|res-a|R6|A2|B2',team:'A2',opp:'B2',division:'D',baseOdds:3.97,odds:4.96,isCup:false};
const ctx={Number,Math,Uint32Array,crypto:{getRandomValues:a=>{calls++;a[0]=word;return a;}},
 state:{currentRound:6,user:{isAdmin:true},refreshingFeatured:false},FEATURED_BOOST_MULTIPLIER:1.25,
 FUTURE_DIVS:['D'],PLAYOFF_DIVS:[],EARLY_DIV12_RELEASE:true,EARLY_DIVISIONS:['D'],FIXTURES_ARE_PLACEHOLDER:false,
 H2H_SCHEDULE:{D:Array.from({length:26},()=>markets.map(m=>[m.teamA,m.teamB]))},
 homeFixturesReady:()=>true,availableDivision:()=>true,hasNoFixtures:()=>false,divisionFixtureConfirmed:()=>true,
 getFixtureMarkets:()=>markets,toOdds:p=>({odds:100/(p*1.05),suspended:false}),
 fixtureMarketCache:{},medianPriceCache:{},winAnyOpponentCache:{},openingHubCupMarkets:{},
 render:()=>{},loadFeaturedMedianSpecials:async()=>{},sget:async()=>[saved],sset:async(k,v)=>{if(k.includes('featured_fixtures'))ctx.saved=v;return true;},
 computeBestValueWinner:()=>null,priceSyncRunning:null,syncTrustedPrices:async()=>{ctx.synced=true;}};
vm.createContext(ctx);
vm.runInContext(part('  function randomHomeIndex(','  // 2-4 season-long futures')+part('  function pickValueSide(','  // A-League fantasy')+part('  async function refreshFeaturedFixtures(){','  // Public highlights'),ctx);
const candidates=['A','B','C','D'];
for(let i=0;i<candidates.length;i++)assert.equal(ctx.randomHomeSample(candidates,1,()=>i)[0],candidates[i]);
assert.equal(new Set(ctx.randomHomeSample(candidates,4,()=>0)).size,4);
assert.equal(candidates.join(''),'ABCD','Input array is never sorted or mutated');
const selections=[];
for(word=0;word<4;word++)selections.push(ctx.computeFeaturedFixtures()[0].team);
assert.equal(new Set(selections).size,4,'Eligible candidates can all be drawn; no closest-price preference');
assert(!selections.includes('A0')&&!selections.includes('A1'),'Existing 20% minimum remains');
assert(ctx.computeFeaturedFixtures()[0].selectionMethod==='uniform-eligible-v1');
const even={teamA:'Even A',teamB:'Even B',aWinPct:49,bWinPct:49};
word=0;assert.equal(ctx.pickValueSide(even,'R6','D',{}).team,'Even A');
word=1;assert.equal(ctx.pickValueSide(even,'R6','D',{}).team,'Even B');
let values=[0xffffffff,0];ctx.crypto.getRandomValues=a=>{a[0]=values.shift();return a;};
assert.equal(ctx.randomHomeIndex(3),0);assert.equal(values.length,0,'Reject upper modulo-bias range');
ctx.crypto.getRandomValues=()=>{throw Error('A price refresh must never redraw the fixture teams');};
(async()=>{
 await ctx.refreshFeaturedFixtures();assert(ctx.synced);assert.equal(ctx.saved[0].id,saved.id);assert.equal(ctx.saved[0].team,saved.team);
 assert(ctx.state.refreshedFeaturedInfo.includes('refreshed'));
 const load=part('  async function loadHomeStats(){','  // Election hub:');
 assert(load.includes('homeFixturesReady(round) && state.user?.isAdmin'));
 assert(load.includes('featured=wrote?(await sget(featuredKey)||[]):[]'));
 console.log('PASS: equal selection access, sampling without replacement, unchanged eligibility, unbiased crypto draws, no redraw on price refresh, and admin-only publication.');
})().catch(error=>{console.error(error);process.exitCode=1;});
