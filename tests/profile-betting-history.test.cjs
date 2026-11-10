const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('js/app.js','utf8'),part=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const registry=[{id:'088',name:'THE DRONE POLICE',prev_names:'ZOUMA KICKS TIM PAYNE'},{id:'102',name:'E/MELB SUCCULENT CHINESE MEAL',prev_names:'SUCCULENT CHINESE MEAL'},{id:'078',name:'GOT WOUD?',prev_names:'DOG GOES WOOF, PAYNE GOES MEOW'},{id:'001',name:'DINKIN CRFC'}];
const account={username:'zouma kicks tim payne',balance:9998.87},user2={username:'DINKIN CRFC',balance:30};
const bet=(id,username,timestamp)=>({id,username,timestamp,stake:10,combinedOdds:2,potentialReturn:20,status:'PENDING',selections:[{id:'H2H|res-a|R4|A|B',label:'R4: A +1.5',odds:2}]});
let profiles=[account,user2],bets=[bet('old','ZOUMA KICKS TIM PAYNE',100),bet('new','THE DRONE POLICE',200),bet('other','DINKIN CRFC',300)],fail=false,tipFail=false,reads=[],renderCount=0;
const ctx={Number,String,Array,Object,Set,Date,Math,DATA:{admin_teams:registry},state:{user:null,currentRound:5,viewingTeamProfile:'THE DRONE POLICE',teamProfileBilbbetData:null},
 secureRead:async keys=>{reads.push(keys);assert(keys.every(k=>!k.startsWith('bilbbet2_bets_index_')));if(fail)throw Error('Network failed');return {bilbbet2_users_index:profiles.map(p=>p.username),bilbbet2_all_bets_index:bets.map(b=>b.id)};},
 sgetMany:async keys=>{reads.push(keys);return keys.map(key=>key.startsWith('bilbbet2_user:')?profiles.find(p=>key==='bilbbet2_user:'+p.username.toLowerCase())||null:bets.find(b=>key==='bilbbet2_bet:'+b.id)||null);},
 computeTippingTotals:async()=>{if(tipFail)throw Error('Tips denied');return {'ZOUMA KICKS TIM PAYNE':{correct:3,total:5,oddsPoints:7.5}};},
 render:()=>renderCount++,esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),fmt:String,fmtCorrect:String,formatOdds:n=>Number(n).toFixed(2),betSelectionLabel:s=>s.label||s.id};
vm.createContext(ctx);vm.runInContext(part('  function publicBetRecord(','  let publicBetsLoading=')+part('  function renderTeamProfileBilbbetHistory(','  function renderRoundExtremeMarket('),ctx);
(async()=>{
const before=JSON.stringify({profiles,bets});await ctx.loadTeamProfileBilbbetHistory('THE DRONE POLICE');
assert.equal(ctx.state.teamProfileBilbbetData.user.username,account.username);assert.deepEqual(Array.from(ctx.state.teamProfileBilbbetData.bets,b=>b.id),['new','old']);
let html=ctx.renderTeamProfileBilbbetHistory('THE DRONE POLICE');assert(html.includes('R4: A +1.5'));assert(!html.includes('No bets placed'));assert(html.includes('Tipping totals are unavailable'));
assert.equal(JSON.stringify({profiles,bets}),before,'Balances, bets and account records must not change');
ctx.state.user={username:'Someone Else'};await ctx.loadTeamProfileBilbbetHistory('THE DRONE POLICE');assert.equal(ctx.state.teamProfileBilbbetData.tipping.correct,3,'Case-insensitive tipping owner');
tipFail=true;await ctx.loadTeamProfileBilbbetHistory('THE DRONE POLICE');assert.equal(ctx.state.teamProfileBilbbetData.bets.length,2,'A failed tipping read cannot hide bets');tipFail=false;
assert.equal(ctx.profileAccountTeamId({username:'succulent chinese meal fc'}),'102');
assert.equal(ctx.profileAccountTeamId({username:'DOG GOES WOOF, PAYNE GOES MEOW'}),'078');
assert.equal(ctx.profileAccountTeamId({username:'arbitrary renamed login',teamId:'088'}),'088');
assert.equal(ctx.profileAccountTeamId({username:'THE DRONE POLICE',teamId:'001'}),'001','Explicit ID wins over an old name');
const savedRegistry=ctx.DATA.admin_teams;ctx.DATA.admin_teams=JSON.parse(fs.readFileSync('data/admin_teams.json','utf8'));
for(const team of ctx.DATA.admin_teams)assert.equal(ctx.profileAccountTeamId({username:team.name.toLowerCase()}),String(team.id).padStart(3,'0'),'Published team identity: '+team.name);
ctx.DATA.admin_teams=savedRegistry;
ctx.DATA.admin_teams.push({id:'999',name:'THE DRONE-POLICE'});assert.equal(ctx.profileAccountTeamId({username:'The Drone Police FC'}),null,'Do not guess loose aliases');ctx.DATA.admin_teams.pop();
fail=true;await ctx.loadTeamProfileBilbbetHistory('THE DRONE POLICE');html=ctx.renderTeamProfileBilbbetHistory('THE DRONE POLICE');assert(html.includes('Retry betting history'));assert(html.includes('Network failed'));assert(!html.includes('No bets placed'));fail=false;
await ctx.loadTeamProfileBilbbetHistory('THE DRONE POLICE');assert.equal(ctx.state.teamProfileBilbbetData.bets.length,2,'Retry recovers');
// A dangling global index entry must not hide the successfully loaded bets.
const secure=ctx.secureRead;
ctx.secureRead=async keys=>({bilbbet2_users_index:profiles.map(p=>p.username),bilbbet2_all_bets_index:['old','new','other','missing']});
await ctx.loadTeamProfileBilbbetHistory('THE DRONE POLICE');assert.equal(ctx.state.teamProfileBilbbetData.bets.length,2);assert(ctx.state.teamProfileBilbbetData.warning.includes('incomplete'));ctx.secureRead=secure;
profiles.push({username:'THE DRONE POLICE',balance:0});await ctx.loadTeamProfileBilbbetHistory('THE DRONE POLICE');assert(ctx.state.teamProfileBilbbetData.error.includes('Multiple accounts'));profiles.pop();
ctx.state.viewingTeamProfile='DINKIN CRFC';const previous=ctx.state.teamProfileBilbbetData;await ctx.loadTeamProfileBilbbetHistory('THE DRONE POLICE');assert.equal(ctx.state.teamProfileBilbbetData,previous,'Late response cannot replace another profile');
await ctx.loadTeamProfileBilbbetHistory('DINKIN CRFC');assert.equal(ctx.state.teamProfileBilbbetData.bets.length,1);
profiles=[];bets=[];await ctx.loadTeamProfileBilbbetHistory('DINKIN CRFC');assert(ctx.renderTeamProfileBilbbetHistory('DINKIN CRFC').includes('No bilbbet account'));
assert(!reads.flat().some(k=>k.startsWith('bilbbet2_bets_index_')));
const code=part('  async function loadTeamProfileBilbbetHistory(','  function renderRoundExtremeMarket(');for(const write of ['sset(','secureRpc(','applyBetStatus(','saveUser('])assert(!code.includes(write));
console.log('PASS: public history without private indexes, renamed/case/FC accounts, ID priority, ambiguous matches, accepted labels, independent tipping, retry, navigation races and preserved balances/bets.');
})().catch(e=>{console.error(e);process.exitCode=1});
