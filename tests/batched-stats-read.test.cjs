const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('js/app.js','utf8'),part=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
let calls=[],fail=false,renders=0;
const ctx={Set,Number,state:{statsData:null},esc:String,render:()=>renders++,secureRead:async keys=>{calls.push(keys);if(fail)throw Error('Network unavailable');return Object.fromEntries(keys.filter(k=>k!=='missing').map(k=>[k,{key:k}]));}};
vm.createContext(ctx);vm.runInContext(part('  async function sgetMany(','  async function sset(')+part('  let statsLoading=false;','  function renderMain(')+part('  function renderStatsTab(){','\n  function '),ctx);
(async()=>{
const keys=Array.from({length:250},(_,i)=>'key:'+i);keys.push('key:1','missing');
const result=await ctx.sgetMany(keys);assert.equal(calls.length,3);assert(calls.every(c=>c.length<=100));assert.equal(result.length,keys.length);assert.equal(result[250].key,'key:1');assert.equal(result[251],null);
ctx.getIndex=async name=>name.includes('users')?['MixedCase']:['1'];ctx.sgetMany=async keys=>keys[0].includes('user:')?[{username:'MixedCase',balance:10,isAdmin:false}]:[{username:'MixedCase',status:'PENDING',stake:5,selections:[{label:'A',odds:2}],combinedOdds:2}];
ctx.computeLineBeatStats=()=>({});ctx.displayedBetReturn=()=>0;
await ctx.loadStats();assert.equal(ctx.state.statsData.totalBets,1);assert.equal(ctx.state.statsData.totalWagered,5);
ctx.sgetMany=async()=>{throw Error('Network unavailable');};await ctx.loadStats();assert.equal(ctx.state.statsData,null);assert(ctx.renderStatsTab().includes('Retry statistics'));assert(ctx.state.statsError.includes('Network unavailable'));
ctx.sgetMany=async keys=>keys[0].includes('user:')?[{username:'MixedCase',balance:10,isAdmin:false}]:[];
await ctx.loadStats();assert.equal(ctx.state.statsError,'');assert.equal(ctx.state.statsData.totalBets,0);
console.log('PASS: bounded permission-preserving reads, ordering/missing records, stats totals, visible failures and successful retry.');
})().catch(e=>{console.error(e);process.exitCode=1});
