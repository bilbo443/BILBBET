const assert=require('node:assert/strict'),fs=require('node:fs');
const F=require('../js/futures-settlement.js');
const row=(team,points,remaining,scoreFor=0)=>({team,points,remaining,scoreFor});
assert.equal(F.bounds([row('A',30,1),row('B',20,1),row('C',10,1)],'A',1).result,'WON');
assert.equal(F.bounds([row('A',10,1),row('B',20,1),row('C',30,1)],'A',1).result,'LOST');
assert.equal(F.bounds([row('A',20,1),row('B',23,0),row('C',1,0)],'A',1),null,'Equality cannot prove a title');
assert.equal(F.bounds([row('A',10,0,50),row('B',10,0,50)],'A',1),null,'Final cutoff tie remains pending');
assert.equal(F.bounds([row('A',10,0,51),row('B',10,0,50)],'A',1).result,'WON');
// Exhaustively check conservative point bounds against all possible remaining
// points for a small table. Ties can fall either way and must never be assumed.
for(let a=0;a<6;a++)for(let b=0;b<6;b++)for(let d=0;d<6;d++)for(let k=1;k<3;k++){
 const rows=[row('A',a,1),row('B',b,1),row('C',d,1)],p=F.bounds(rows,'A',k);if(!p)continue;
 for(const x of [0,1,3])for(const y of [0,1,3])for(const z of [0,1,3]){
  const mine=a+x,above=[b+y,d+z].filter(n=>n>mine).length,equal=[b+y,d+z].filter(n=>n===mine).length;
  assert(p.result==='WON'?above+equal<k:above>=k,'Unsafe early proof');
 }
}
const div='ELIZA CUP (D1)',teams=['A','B','C','D'];
const c={publicationVerified:true,divisions:{[div]:teams},schedule:{[div]:Array.from({length:26},()=>[['A','B'],['C','D']])},scores:Object.fromEntries(teams.map((t,i)=>[t,Array(26).fill([100,0,30,29][i])])),roddy:{},confirmed:()=>true,isFinal:r=>r<=25,rules:{promotion_rules:{[div]:{automatic_places:1,finals_qualifiers:2}}},groups:{},eclFixtures:[]};
const pick=(market,team)=>'FUT|'+div+'|'+market+'|'+team;
assert.equal(F.suggest(pick('top3_pct','A'),c).result,'WON');
assert.equal(F.suggest(pick('miss_top3_pct','A'),c).result,'LOST');
assert.equal(F.suggest(pick('top_half_pct','B'),c).result,'LOST');
assert.equal(F.suggest(pick('bottom_half_pct','B'),c).result,'WON');
assert.equal(F.suggest(pick('win_div_pct','A'),c),null);
assert.equal(F.suggest(pick('win_div_pct','A'),{...c,isFinal:()=>true}).result,'WON');
assert.equal(F.suggest(pick('top3_pct','A'),{...c,publicationVerified:false}),null);
assert.equal(F.suggest(pick('top3_pct','A'),{...c,confirmed:()=>false}),null);
assert.equal(F.suggest(pick('top3_pct','A'),{...c,schedule:{[div]:[]}}),null);
assert.equal(F.suggest(pick('promotion_pct','C'),c),null,'Finals remain a route to promotion');
assert.equal(F.suggest(pick('promotion_pct','B'),c).result,'LOST');
assert.equal(F.suggest('FUT|RODDY|roddy_win_pct|A',c),null,'No fabricated weekly score ceiling');
const cup={...c,faCup:{preliminary_round:1,preliminary:[['A','B']],preliminary_winners:['A'],preliminary_results_final:true,round_of_64_round:2,r64_matches:[['A','C']],r64_winners:['A'],round_of_32_round:4,r32_matches:[['A','D']],r32_winners:[null]}};
assert.equal(F.suggest('FACUP|win_pct|B',cup).result,'LOST');
assert.equal(F.suggest('FACUP|reach_r32_pct|A',cup).result,'WON');
assert.equal(F.suggest('FACUP|reach_r16_pct|A',cup),null,'Unresolved replay remains pending');
assert.equal(F.suggest('FACUP|win_pct|C',cup).result,'LOST');
const tied={...cup,scores:structuredClone(cup.scores)};tied.scores.C[1]=100;assert.equal(F.suggest('FACUP|win_pct|C',tied),null);
const replay={...tied,faCup:{...tied.faCup,r64_replays:[{original_round:2,round:8,teamA:'A',teamB:'C'}]}};
assert.equal(F.suggest('FACUP|win_pct|C',replay).result,'LOST','A published decisive replay plus confirmed winner resolves elimination');
assert.equal(F.suggest('FACUP|win_pct|C',{...replay,isFinal:r=>r<8}),null,'Future replay cannot resolve elimination');
const conflict={...cup,faCup:structuredClone(cup.faCup)};conflict.faCup.r64_winners=['C'];assert.equal(F.suggest('FACUP|win_pct|A',conflict),null,'Conflicting winner and scores');
assert.equal(F.suggest('FACUP|reach_r32_pct|A',{...cup,faCup:{...cup.faCup,r32_winners:['D']}}).result,'WON','Later loss cannot erase stage reached');
const rules={group_matchdays:[8,10,13],quarter_final_round:15,semi_final_round:18,final_round:20};
const fixtures=[{round:8,teamA:'A',teamB:'B'},{round:8,teamA:'C',teamB:'D'},{round:10,teamA:'A',teamB:'C'},{round:10,teamA:'B',teamB:'D'},{round:13,teamA:'A',teamB:'D'},{round:13,teamA:'B',teamB:'C'}];
const ecl={...c,rules:{ecl_rules:rules},groups:{A:teams},eclFixtures:fixtures,isFinal:()=>true};
assert.equal(F.suggest('ECLGROUP|A|A',ecl).result,'WON');
assert.equal(F.suggest('ECL|reach_knockout_pct|D',ecl).result,'LOST');
assert.equal(F.suggest('ECL|win_pct|D',ecl).result,'LOST');
assert.equal(F.suggest('ECL|win_pct|A',ecl),null);
assert.equal(F.suggest('ECL|win_pct|D',{...ecl,eclFixtures:[]}),null);
assert.equal(F.aggregate([{id:'x'},{id:'y'}],id=>id==='x'?{result:'LOST'}:null),'LOST');
assert.equal(F.aggregate([{id:'x'},{id:'y'}],id=>id==='x'?{result:'WON'}:null),null);
assert.equal(F.aggregate([{id:'x',result:'WON'},{id:'y',result:'VOID'}],()=>null),'WON');
const app=fs.readFileSync('js/app.js','utf8'),html=fs.readFileSync('index.html','utf8');
assert(html.indexOf('js/futures-settlement.js')<html.indexOf('js/app.js'));
assert(app.includes('futuresSettlementProof(pickId)?.result'));
assert(app.includes('evidence.reason'));
assert(app.includes('futuresSettlementCache=null; // Recheck each results refresh'));
assert(!fs.readFileSync('js/futures-settlement.js','utf8').includes('secureRpc'));
console.log('PASS: exhaustive point bounds, table cutoffs/ties, negative markets, finals paths, missing/stale data, cup replay/conflict/stage precedence, ECL groups, multi aggregation and read-only admin integration.');
