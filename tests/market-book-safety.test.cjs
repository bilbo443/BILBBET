const fs=require('fs'),vm=require('vm'),assert=require('assert');
const s=fs.readFileSync('js/app.js','utf8');const code=s.slice(s.indexOf('  function enforceQuoteBookSafety('),s.indexOf('  async function collectTrustedPrices(){'));
const ctx={FEATURED_BOOST_MULTIPLIER:1.25,TOTAL_TEAMS:66,H2H_DIVISIONS:{TEST:Array(4)}};vm.createContext(ctx);vm.runInContext(code,ctx);
const row=(side,a,b,base,featured=false,old=base)=>({id:`H2H|res-${side}|R3|${a}|${b}`,team:side==='a'?a:side==='b'?b:null,odds:old,prices:[base,old],baseOdds:base,featured});
const cases=[['3DOGS','ROTORUA UNITED',2.56,1.56,49.99,2.45],['GALUCTASARY','PAIN IN DIAS',2.45,1.61,45.03,2.44],['JUSTICEFORMOON FC','CASUAL APPROACH',2.05,1.84,54.89,2.49],['KALLO FC','NANISTATE',1.82,2.08,50.39,2.42]];
for(const [a,b,pa,pb,pd,old] of cases){
 const rows=[row('a',a,b,pa),row('b',a,b,pb,true,old),row('draw',a,b,pd),row('a',b,a,pb),row('b',b,a,pa),row('draw',b,a,pd)];const map=new Map(rows.map(q=>[q.id,q]));
 ctx.enforceQuoteBookSafety(map);
 const best=new Map();for(const q of map.values())best.set(q.team||'DRAW',Math.max(best.get(q.team||'DRAW')||0,...q.prices));
 assert([...best.values()].reduce((sum,p)=>sum+1/p,0)>=1.01);
 assert(map.get(`H2H|res-b|R3|${a}|${b}`).odds<=pb*1.25);
 assert(![...map.values()].some(q=>q.prices.includes(old)&&old>pb*1.25));
}
const bad=[row('a','A','B',2.5),row('b','A','B',2.5),row('draw','A','B',20)];assert.throws(()=>ctx.enforceQuoteBookSafety(new Map(bad.map(q=>[q.id,q]))),/Ordinary prices/);
const finish=[{id:'FUT|TEST|top3_pct|A',team:'A',baseOdds:1.5,odds:1.88,prices:[1.5,1.88],featured:true},{id:'FUT|TEST|miss_top3_pct|A',team:'A',baseOdds:2.61,odds:2.61,prices:[2.61],featured:false}];ctx.enforceQuoteBookSafety(new Map(finish.map(q=>[q.id,q])));assert(finish.reduce((sum,q)=>sum+1/Math.max(...q.prices),0)>=1.01);
console.log('PASS: four real failures repaired; reversed IDs combined; stale prices discarded; unsafe ordinary books rejected; finish complements safe');
const blocked={id:'H2H|res-a|R3|A|B',odds:2.5,bettable:false};
ctx.collectingTrustedPrices=false;ctx.trustedPrices=new Map([[blocked.id,blocked]]);ctx.EMBED_MODE=true;ctx.formatOdds=n=>Number(n).toFixed(2);
vm.runInContext(s.slice(s.indexOf('  function priceOnlyButton('),s.indexOf('  // Unifies league-division')),ctx);
assert(ctx.priceOnlyButton(blocked.id,'A',{odds:2,suspended:false}).includes('Pricing review'));
ctx.collectingTrustedPrices=true;assert(ctx.priceOnlyButton(blocked.id,'A',{odds:2,suspended:false}).includes('2.00'));
const attrs={'data-pick':blocked.id,'data-odds':'2.5'},el={dataset:{pick:blocked.id,odds:'2.5'},style:{},removeAttribute:k=>delete attrs[k],setAttribute:(k,v)=>attrs[k]=v};
ctx.document={querySelectorAll:()=>[el]};vm.runInContext(s.slice(s.indexOf('  function applyTrustedPrices(){'),s.indexOf('  async function priceSyncFingerprint(')),ctx);ctx.applyTrustedPrices();assert(!attrs['data-pick']);assert.equal(attrs['aria-disabled'],'true');
console.log('PASS: blocked preview stays unavailable; collector rebuilds from raw prices; blocked selections cannot be clicked');
