const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
const helper=source.slice(source.indexOf('  let cashoutBusy = false;'),source.indexOf('  function renderMyBetsTab(){'));
const renderer=source.slice(source.indexOf('  function renderMyBetsTab(){'),source.indexOf('  // Pulls together every market'));
const returns=source.slice(source.indexOf('  function displayedBetReturn('),source.indexOf('  // Applies the balance change'));
const elements=new Map();
class Element{
 constructor(){this.nodes=new Map();this.events={};this.textContent='';}
 querySelector(key){if(!this.nodes.has(key))this.nodes.set(key,new Element());return this.nodes.get(key);}
 addEventListener(name,fn){this.events[name]=fn;}
 showModal(){this.open=true;}
 close(){this.open=false;this.events.close?.();}
 remove(){elements.delete(this.id);}
}
let calls=0,loads=0;const alerts=[];
const bet={id:'one',username:'tester',status:'PENDING',stake:100,combinedOdds:4,potentialReturn:400,timestamp:1,selections:[{label:'Home team',odds:4}]};
const ctx={console,Date,Number,Math,Map,setInterval,clearInterval,state:{user:{username:'tester',balance:900},myBets:[bet]},
 fmt:v=>Number(v).toFixed(2),fmtDate:()=>'',formatOdds:v=>v.toFixed(2),round2:v=>Math.round(v*100)/100,
 esc:v=>String(v).replaceAll('<','&lt;'),statusPill:s=>s,render:()=>{},loadMyBets:async()=>{loads++;},alert:x=>alerts.push(x),
 document:{getElementById:id=>elements.get(id),createElement:()=>{const e=new Element();e.style={};return e;},body:{appendChild:e=>elements.set(e.id,e)}},
 secureRpc:async name=>{if(name==='bilbbet_cashout_offer')return{available:true,amount:180.95,offerId:'test',expiresAt:new Date(Date.now()+30000).toISOString()};calls++;return{bet:{...bet,status:'CASHED_OUT',cashOut:{amount:180.95}},user:{username:'tester',balance:1080.95}};}};
vm.createContext(ctx);vm.runInContext(helper+renderer+returns+';this.api={openCashout,renderCashoutControl,renderMyBetsTab,displayedBetReturn};',ctx);
(async()=>{
 const {api}=ctx;
 assert(api.renderCashoutControl(bet).includes('Check cash out'));
 assert.equal(api.renderCashoutControl({...bet,boosted:true}),'');
 assert.equal(api.renderCashoutControl({...bet,selections:[{},{}]}),'');
 await api.openCashout('one');let dialog=elements.get('cashout-dialog');assert(dialog.open);assert(dialog.innerHTML.includes('180.95'));
 dialog.querySelector('#cashout-cancel').onclick();assert.equal(calls,0);assert.equal(elements.size,0);
 await api.openCashout('one');dialog=elements.get('cashout-dialog');
 await Promise.all([dialog.querySelector('#cashout-accept').onclick(),dialog.querySelector('#cashout-accept').onclick()]);
 assert.equal(calls,1);assert.equal(loads,1);assert.equal(ctx.state.user.balance,1080.95);assert.equal(elements.size,0);assert(alerts[0].includes('confirmed'));
 const closed={...bet,status:'CASHED_OUT',actualReturn:180.95,cashOut:{amount:180.95}};
 assert.equal(api.displayedBetReturn(closed),180.95);
 ctx.state.myBets=[closed];const html=api.renderMyBetsTab();assert(html.includes('Cashed out'));assert(html.includes('+80.95'));assert(!html.includes('data-cashout='));
 assert.equal(api.displayedBetReturn({...bet,status:'LOST'}),0);
 assert.equal(api.displayedBetReturn({...bet,status:'VOID'}),100);
 console.log('PASS: actual UI functions handle cancellation, confirmation, duplicate clicks, exclusions, paid return, settled net and existing lost/void returns.');
})().catch(e=>{console.error(e);process.exitCode=1;});
