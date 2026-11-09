const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const app=fs.readFileSync('js/app.js','utf8'),source=app.slice(app.indexOf('  function noveltyCounterEligible('),app.indexOf('  async function loadNovelty('));
const item={id:'mu0cx3prmxo3h',name:'Casual Approach over 4.5 trade deadlines missed due to surf',odds:1.25,status:'OPEN'};
let writes=[],alerts=[],renders=0;
const inputs={['novelty-count-'+item.id]:{value:'3'},['novelty-unit-'+item.id]:{value:'days'}};
const nodes=[{dataset:{noveltyCounter:item.id},textContent:''}];
const ctx={Number,Date,Array,Set,state:{user:{isAdmin:true},novelty:[item]},esc:String,alert:m=>alerts.push(m),render:()=>renders++,
 document:{hidden:false,getElementById:id=>inputs[id],querySelectorAll:()=>nodes},sget:async()=>structuredClone(item),
 secureRpc:async(name,args)=>writes.push({name,args}),secureRead:async()=>({['bilbbet2_novelty:'+item.id]:{...item,counter:{value:4,unit:'deadlines'}}})};
vm.createContext(ctx);vm.runInContext(source,ctx);
(async()=>{
assert.equal(ctx.noveltyCounterText(item),'Moderator tracker: not set yet');
await ctx.saveNoveltyCounter(item.id);assert.equal(writes.length,1);const saved=writes[0].args.p_value;
assert.equal(saved.counter.value,3);assert.equal(saved.counter.unit,'days');
for(const key of ['id','name','odds','status'])assert.equal(saved[key],item[key]);
assert.equal(ctx.noveltyCounterText(saved),'Moderator tracker: 3 days');
inputs['novelty-count-'+item.id].value='-1';await ctx.saveNoveltyCounter(item.id);assert.equal(writes.length,1);
inputs['novelty-count-'+item.id].value='1.5';await ctx.saveNoveltyCounter(item.id);assert.equal(writes.length,1);
inputs['novelty-count-'+item.id].value='0';await ctx.saveNoveltyCounter(item.id);assert.equal(writes[1].args.p_value.counter.value,0);
ctx.state.user.isAdmin=false;await ctx.saveNoveltyCounter(item.id);assert.equal(writes.length,2);assert.equal(ctx.renderNoveltyCounterControls(item),'');
const before=renders;await ctx.refreshNoveltyCounters();assert.equal(nodes[0].textContent,'Moderator tracker: 4 missed trade deadlines');assert.equal(renders,before,'Live refresh must not rerender inputs or slip');
console.log('PASS: manual units, unset/zero/invalid values, admin write guard, preserved market fields and targeted public refresh.');
})().catch(e=>{console.error(e);process.exit(1)});
