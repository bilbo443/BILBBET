const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const read=name=>JSON.parse(fs.readFileSync('data/'+name+'.json','utf8'));
const app=fs.readFileSync('js/app.js','utf8');
const source=app.slice(app.indexOf('  async function buildEclModelDownload('),app.indexOf('  async function refreshPublicEclDraw('));
assert(source.startsWith('  async function buildEclModelDownload('));
const fixtures=[{round:8,teamA:'SAUCE FC',teamB:'BC UNITED ZEBRAS'}];
let requests=[],mode='ok',rpcCalls=0;
const context={TextEncoder,crypto:webcrypto,Date,Uint8Array,JSON,Blob,
  BilbbetEcl:require('../js/ecl-draw.js'),state:{currentRound:5,user:{secret:'must not leak'},bets:['must not leak']},
  fetch:async(path,options)=>{
    assert.equal(options.cache,'no-store');requests.push(path);
    const name=path.match(/^data\/(.+)\.json$/)[1];
    if(mode==='http'&&name==='h2h_history')return {ok:false,status:503};
    const value=read(name);
    if(mode==='mixed'&&requests.length>9&&name==='roddy_results')value.changed=true;
    if(mode==='duplicate'&&name==='roster_rules')value.ecl_rules.field_team_ids[1]=value.ecl_rules.field_team_ids[0];
    if(mode==='missing'&&name==='admin_teams')value.splice(value.findIndex(t=>String(t.id).padStart(3,'0')==='002'),1);
    return {ok:true,json:async()=>value};
  },secureRpc:async name=>{assert.equal(name,'bilbbet_ecl_draw_view');rpcCalls++;return {fixtures};}};
vm.createContext(context);vm.runInContext(source,context);
(async()=>{
  const snapshot=await context.buildEclModelDownload();
  assert.equal(requests.length,18);assert.equal(rpcCalls,1);
  assert.equal(snapshot.model.teams.length,12);assert.equal(new Set(snapshot.model.teams.map(t=>t.id)).size,12);
  assert.equal(snapshot.model.teams.filter(t=>t.pot===1).length,3);
  assert.equal(snapshot.model.price_margin,.05);assert.equal(snapshot.model.market,'ecl_group_winner');
  assert.deepEqual(snapshot.model.fixtures,fixtures);assert.match(snapshot.fingerprint,/^[a-f0-9]{64}$/);
  assert(Number.isFinite(Date.parse(snapshot.exported_at_utc)));
  assert(!JSON.stringify(snapshot).includes('must not leak'));
  requests=[];const again=await context.buildEclModelDownload();assert.equal(again.fingerprint,snapshot.fingerprint);
  for(const [test,error] of [['http',/HTTP 503/],['mixed',/changed during/],['duplicate',/duplicate IDs/],['missing',/missing ECL team/]]){
    mode=test;requests=[];await assert.rejects(()=>context.buildEclModelDownload(),error);
  }
  assert(app.includes('id="download-ecl-model"'));assert(app.includes('downloadEclModel(downloadEcl)'));
  console.log('PASS: fresh public export, stable IDs/pots, timestamp/fingerprint, model inputs, no account data, failed/mixed/missing inputs rejected.');
})().catch(error=>{console.error(error);process.exitCode=1});
