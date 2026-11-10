const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const app=fs.readFileSync('js/app.js','utf8'),part=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a)));
const filters=()=>({punter:'',status:'ALL',type:'ALL',round:'ALL',sort:'newest'});
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const one={id:'one',username:'Punter <A>',timestamp:100,stake:10,combinedOdds:2,potentialReturn:20,status:'WON',pinHash:'SECRET',balance:999,adminNote:'PRIVATE',selections:[{id:'H2H|res-a|R4|A|B',label:'R4: A to win',odds:2}]};
const multi={id:'multi',username:'B',timestamp:200,stake:20,combinedOdds:6,potentialReturn:120,status:'WON',selections:[{id:'H2H|res-b|R4|A|B',label:'R4: B +1.5',odds:2,result:'VOID'},{id:'FUT|RODDY|roddy_win_pct|B',label:'B — Roddy winner',odds:3,result:'WON'}]};
let fail=false,reads=[],renders=0;
const ctx={Date,Number,Math,Set,Array,Object,state:{user:null,publicBets:null,publicBetsError:'',publicBetsFilters:filters(),publicBetsPage:1},
 esc,fmt:n=>Number(n).toFixed(2),fmtDate:String,formatOdds:n=>Number(n).toFixed(2),betSelectionLabel:s=>s.label||s.id,round2:n=>Math.round(n*100)/100,
 render:()=>renders++,secureRead:async keys=>{reads.push(keys);if(fail)throw Error('Network unavailable');return {bilbbet2_all_bets_index:['one','multi','admin','cash','void','bad'],bilbbet2_users_index:['Admin','Punter <A>','B']};},
 sgetMany:async keys=>{reads.push(keys);if(keys[0].startsWith('bilbbet2_user:'))return [{username:'Admin',isAdmin:true},{username:'Punter <A>',isAdmin:false},{username:'B',isAdmin:false}];return [one,multi,{...one,id:'admin',username:'Admin'},{...one,id:'cash',status:'CASHED_OUT',cashOut:{amount:7}},{...one,id:'void',status:'VOID'},{id:'bad',username:'B',selections:[]}];}};
vm.createContext(ctx);vm.runInContext(part('  function getPickRound(','  // Suggests WON/LOST')+part('  function statusPill(','  const TX_TYPE_LABELS')+part('  function publicBetRecord(','  function renderMyBetsTab(')+part('  function displayedBetReturn(','  async function applyBetStatus('),ctx);
(async()=>{
await ctx.loadPublicBetLedger();assert.equal(ctx.state.publicBets.length,4);assert.equal(ctx.state.publicBetsSkipped,1);assert.equal(ctx.state.publicBetsError,'');
assert(!JSON.stringify(ctx.state.publicBets).includes('SECRET'));assert(!JSON.stringify(ctx.state.publicBets).includes('PRIVATE'));assert(!JSON.stringify(ctx.state.publicBets).includes('balance'));assert(!ctx.state.publicBets.some(b=>b.username==='Admin'));
assert.equal(ctx.filteredPublicBets()[0].id,'multi');let html=ctx.renderPublicBetLedger();
for(const text of ['Betting Ledger','Punter &lt;A&gt;','R4: B +1.5','Potential return','120.00','Paid return','60.00','7.00','Refunded','10.00'])assert(html.includes(text),text);
for(const action of ['data-setstatus','data-resolveleg','data-adjust-user','data-regstatus','data-cashout','data-pick='])assert(!html.includes(action),action);
ctx.state.publicBetsFilters={...filters(),punter:'punter',status:'VOID'};assert.equal(ctx.filteredPublicBets().length,1);
ctx.state.publicBetsFilters={...filters(),type:'MULTI',round:'4'};assert.equal(ctx.filteredPublicBets().length,1);
ctx.state.publicBetsFilters.round='SEASON';assert.equal(ctx.filteredPublicBets()[0].id,'multi');
ctx.state.publicBetsFilters.round='5';assert.equal(ctx.filteredPublicBets().length,0);assert(ctx.renderPublicBetLedger().includes('No bets match'));
ctx.state.publicBetsFilters=filters();ctx.state.publicBets=Array.from({length:26},(_,i)=>({...ctx.publicBetRecord(one),id:'bet'+i}));
assert.equal((ctx.renderPublicBetLedger().match(/<article/g)||[]).length,25);ctx.state.publicBetsPage=2;assert.equal((ctx.renderPublicBetLedger().match(/<article/g)||[]).length,1);
const previous=ctx.state.publicBets;fail=true;await ctx.loadPublicBetLedger();assert.equal(ctx.state.publicBets,previous);assert(ctx.renderPublicBetLedger().includes('previous snapshot'));assert(ctx.state.publicBetsError.includes('Network unavailable'));
fail=false;await ctx.loadPublicBetLedger();assert.equal(ctx.state.publicBetsError,'');assert.equal(ctx.state.publicBets.length,4);
assert.equal(ctx.publicBetRecord({...one,actualReturn:0}).actualReturn,0);
assert.equal(ctx.publicBetRecord({...one,stake:NaN}),null);
assert(ctx.renderPublicBetLedger().includes('Public viewing only'));assert(app.includes("'STATS', 'BETTING LEDGER', 'MY BETS'"));
assert(app.includes("state.activeTab === 'BETTING LEDGER'"));assert(app.includes("if(state.activeTab === 'BETTING LEDGER'){render();loadPublicBetLedger();return;}"));
const loader=part('  async function loadPublicBetLedger(','  function filteredPublicBets(');for(const write of ['secureRpc(','sset(','applyBetStatus(','syncRewardContext(','syncTrustedPrices('])assert(!loader.includes(write));
console.log('PASS: anonymous read-only ledger, accepted single/multi odds, void/cash-out paid returns, admin exclusion, data projection/escaping, filters, pagination, failure/retry and public navigation.');
})().catch(e=>{console.error(e);process.exitCode=1});
