const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const E=require('../js/ecl-draw.js'),read=n=>JSON.parse(fs.readFileSync('data/'+n+'.json','utf8'));
const settings=read('official_ecl_draw'),registry=read('admin_teams'),field=settings.field_team_ids,pot=settings.pot1_team_ids;
let groups={A:[],B:[],C:[]};const order=[...pot,...field.filter(t=>!pot.includes(t))];
for(let i=0;i<12;i++){const before=JSON.stringify(groups),r=E.commit(field,pot,groups,order[i]);assert.equal(r.slot,E.ORDER[i]);assert.equal(JSON.stringify(groups),before);groups=r.groups;}
assert.equal(E.nextSlot(groups,pot),null);assert.equal(new Set(Object.values(groups).flat()).size,12);
for(const group of Object.values(groups)){assert.equal(group.length,4);assert(pot.includes(group[0]));assert.equal(group.filter(t=>pot.includes(t)).length,1);}
assert.throws(()=>E.commit(field,pot,{A:[],B:[],C:[]},order[3]),/Pot 1/);
assert.throws(()=>E.commit(field,pot,{A:[pot[0]],B:[],C:[]},pot[0]),/duplicate/);
const corrected=structuredClone(groups);corrected.A[1]=null;assert.equal(E.nextSlot(corrected,pot),'A1');assert.equal(E.commit(field,pot,corrected,groups.A[1]).groups.A[2],groups.A[2],'Correction preserves later draw slots');
const teams=['A','B','C','D'],sample=(t,n,rng)=>Array.from({length:n},()=>40+Math.floor(rng()*60)+(t==='A'?15:0));
const first=E.winnerProbabilities(teams,sample,{n:1200,key:'same'}),second=E.winnerProbabilities(teams,sample,{n:1200,key:'same'});
assert.deepEqual(first,second);assert(Math.abs(first.reduce((s,r)=>s+r.pct,0)-100)<1e-9);assert(first[0].pct>first[3].pct);
const fixtures={8:[['A','D'],['B','C']],10:[['A','C'],['D','B']],13:[['A','B'],['C','D']]};
const scores={8:{A:100,B:80,C:60,D:40},10:{A:100,B:80,C:60,D:40},13:{A:100,B:80,C:60,D:40}};
assert.equal(E.winnerProbabilities(teams,sample,{n:20,fixtures,scores})[0].pct,100,'Actual group table across three matchdays');
assert.throws(()=>E.winnerProbabilities(teams,sample,{n:20,scores}),/official/);
assert.throws(()=>E.winnerProbabilities(teams,sample,{n:20,fixtures:{8:fixtures[8],10:fixtures[8]}}),/repeat/);
assert.throws(()=>E.winnerProbabilities(teams,sample,{n:20,fixtures,scores:{8:{A:80}}}),/complete/);
const app=fs.readFileSync('js/app.js','utf8');assert(app.includes('reach_knockout_pct: 6'));assert(app.includes('setInterval(refreshPublicEclDraw,8000)'));
const calendar=read('cup_calendar').ecl;assert.deepEqual(Object.keys(calendar).map(Number),[8,10,13,15,18,20]);
const part=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a)));
let calls=[],quotes=[];const fieldRows=field.map(id=>({id,name:registry.find(t=>String(t.id).padStart(3,'0')===id).name}));
const ctx={BilbbetEcl:E,JSON,Map,Set,Math,Number,Array,Object,ROSTER_RULES:read('roster_rules'),DATA:{admin_teams:registry,team_strength_tiers:{},roddy_results:{}},
 FUTURES:read('futures'),H2H_HISTORY:Object.fromEntries(fieldRows.map(t=>[t.name,[40,60,80]])),allPool:[40,60,80],H2H_CUP_SHIFT:{},H2H_VARIANCE_WIDEN:{},REAL_RESULTS:{},tierH2HSamplers:{},teamInfoCup:{},
 h2hFormAdjustment:()=>({played:0}),sampleTeam:(t,n,rng)=>Array.from({length:n},()=>30+Math.floor(rng()*70)),toOdds:p=>({odds:p?Math.min(1001,Math.max(1.01,Math.round(100/(p*1.05)*100)/100)):1001,suspended:false}),
 state:{user:{isAdmin:true},eclGroups:{A:[],B:[],C:[]},currentRound:5,cupFixtures:{ECL:[]},pausedCategories:{},slip:[]},
 sameTeam:(a,b)=>a===b,resolveTeamName:t=>t==='OLD NAME'?'NEW NAME':t,render:()=>{},refreshSubmissionControls:async()=>true,loadTrustedPrices:async()=>{},
 secureRpc:async(name,args)=>{calls.push(name);assert.equal(name,'bilbbet_commit_ecl_draw');quotes=args.p_quotes;return {groups:args.p_groups,published_groups:['A']};},
 trustedPrices:new Map(),collectingTrustedPrices:false,esc:String,formatOdds:n=>n.toFixed(2),teamLogo:()=>'',isPickBlocked:()=>false,confirm:()=>true};
vm.createContext(ctx);vm.runInContext(part('  const eclProjectionCache=','  async function saveCupOverrides('),ctx);
(async()=>{
const names=Object.fromEntries(['A','B','C'].map(g=>[g,groups[g].map(id=>fieldRows.find(t=>t.id===id).name)]));
const partial={A:names.A,B:names.B.slice(0,1),C:names.C.slice(0,1)};
assert.equal(ctx.canonicalEclGroups({A:['OLD NAME',null],B:[],C:[]}).A[0],'NEW NAME');
await ctx.saveEclDraw(partial);assert.deepEqual(calls,['bilbbet_commit_ecl_draw']);assert.equal(quotes.length,4);assert(quotes.every(q=>q.id.startsWith('ECLGROUP|A|')&&q.round===13));
const fingerprint=ctx.eclGroupFingerprint('A');ctx.state.currentRound=6;assert.equal(ctx.eclGroupFingerprint('A'),fingerprint,'Round control alone cannot jitter prices without new scores');ctx.state.currentRound=5;
ctx.state.cupFixtures.ECL.push({round:8,teamA:names.B[0],teamB:names.B[1]});assert.equal(ctx.eclGroupFingerprint('A'),fingerprint,'Other groups fixtures must not re-seed this group');ctx.state.cupFixtures.ECL=[];
const previous=JSON.stringify(ctx.state.eclGroups);ctx.secureRpc=async()=>{throw Error('Conflict');};await ctx.saveEclDraw({A:[],B:[],C:[]});assert.equal(JSON.stringify(ctx.state.eclGroups),previous,'Failed commit cannot alter the saved draw');
assert(ctx.state.error.includes('Conflict'));assert(ctx.renderEclGroupBox('A').includes('awaiting price publication'));
quotes.forEach(q=>ctx.trustedPrices.set(q.id,q));assert(ctx.renderEclGroupBox('A').includes('data-pick="ECLGROUP|A|'));
assert(!ctx.renderEclGroupBox('B').includes('data-pick='));assert(ctx.renderEclDrawAdmin().includes('Next draw position'));
ctx.state.currentRound=14;assert(ctx.renderEclGroupBox('A').includes('Group stage complete'));assert(!ctx.renderEclGroupBox('A').includes('data-pick='));
let publicReads=0,renders=0;ctx.document={hidden:false};Object.assign(ctx.state,{activeTab:'FUTURES',futuresSubTab:'ECL',futureMarketTab:'groups'});ctx.render=()=>renders++;
ctx.trustedPrices.set('FUT|unchanged',{id:'FUT|unchanged',odds:2});
ctx.secureRpc=async name=>{assert.equal(name,'bilbbet_ecl_draw_view');publicReads++;return {groups:partial,quotes,paused_categories:{},fixtures:[]};};
await ctx.refreshPublicEclDraw();await ctx.refreshPublicEclDraw();assert.equal(publicReads,2);assert(ctx.trustedPrices.has('FUT|unchanged'));assert.equal(renders,0,'An unchanged poll must not rebuild the page or drop input focus');
ctx.state.activeTab='HOME';await ctx.refreshPublicEclDraw();assert.equal(publicReads,2);ctx.state.activeTab='FUTURES';
ctx.document.hidden=true;await ctx.refreshPublicEclDraw();assert.equal(publicReads,2);ctx.document.hidden=false;
ctx.secureRpc=async()=>{throw Error('Offline');};await ctx.refreshPublicEclDraw();assert(ctx.state.eclDrawReadError);assert(ctx.renderEclGroups().includes('last published view'));
console.log('PASS: 12 official draw slots/pots, correction identity, deterministic three-matchday tables, actual results, metadata/calendar, atomic client commit/failure and published-only public prices.');
})().catch(e=>{console.error(e);process.exitCode=1});
