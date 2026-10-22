const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
const functions=source.slice(source.indexOf('  function cupFixtureRoundView('),source.indexOf('  const PLAYOFF_DIVS'));
const prelim=[{round:1,stage:'Preliminary Round',teamA:'BORATVERYNICE',teamB:'GALUCTASARY'},{round:1,stage:'Preliminary Round',teamA:'SABITEURS',teamB:'QUINTASENTIAL FC'}];
const pairs=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/official_fa_cup_draw.json'))).r64_matches;
const current=pairs.map(([teamA,teamB])=>({round:2,stage:'Round Of 64',teamA,teamB}));
const state={currentRound:2,cupFixtures:{'FA CUP':[...prelim,...current],ECL:[]},cupFixtureMarket:null,slip:[]};
let computations=0;
const prices=new Map();for(const f of current){const suffix='|R2|'+f.teamA+'|'+f.teamB;prices.set('H2H|res-a'+suffix,{odds:1.75});prices.set('H2H|res-b'+suffix,{odds:2.25});}
const ctx={state,Number,Set,Map,openingHubCupMarkets:{},trustedPrices:prices,
 computeH2HMarket:(teamA,teamB,round)=>{computations++;return{teamA,teamB,round,aWinPct:60,bWinPct:38};},
 render:()=>{},isRoundBlocked:r=>r<2,isPickBlocked:id=>Number(id.split('|')[2].slice(1))<2,
 getCupRoundInfo:(c,r)=>({stage:r===1?'Preliminary Round':'Round Of 64'}),
 teamLogo:(t,s)=>'<img alt="" width="'+s+'">',toOdds:p=>({odds:100/(p*1.05),suspended:false}),
 trustedOdds:(id,fallback)=>prices.get(id)?.odds??fallback,formatOdds:o=>o.toFixed(2),
 esc:x=>String(x).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),
 renderH2HMarket:m=>'DETAIL-ROUND-'+m.round};
vm.createContext(ctx);vm.runInContext(functions+'this.api={cupFixtureRoundView,getCupFixtureMarket,openCupFixture,renderCupFixtures};',ctx);
const api=ctx.api;
let html=api.renderCupFixtures('FA CUP');
assert(html.includes('32 matches'));assert.equal((html.match(/data-cupfixture=/g)||[]).length,32);
assert.equal((html.match(/data-pick=/g)||[]).length,64);assert(!html.includes('GALUCTASARY'));
assert(html.includes('1.75'));assert(html.includes('2.25'));assert.equal(computations,0,'Use trusted board without simulating 32 matches');
assert(html.includes('data-cupfixture="FA CUP|2"'),'Keep original index after round filtering');
state.cupFixtureRounds={'FA CUP':1};html=api.renderCupFixtures('FA CUP');
assert.equal((html.match(/data-cupfixture=/g)||[]).length,2);assert(!html.includes('data-pick='));assert(html.includes('GALUCTASARY'));assert(!html.includes('KALLO FC'));
assert.equal(computations,0,'Past round cards must not recalculate win odds');
api.openCupFixture('FA CUP',0);assert.equal(state.cupFixtureMarket.round,1);assert.equal(state.cupFixtureRounds['FA CUP'],1);
assert(api.renderCupFixtures('FA CUP').includes('DETAIL-ROUND-1'));
api.openCupFixture('FA CUP',0);assert.equal(computations,1,'Same fixture/round must reuse cached prices');
state.cupFixtureMarket=null;state.cupFixtureRounds={};
assert(api.renderCupFixtures('ECL').includes('No fixtures scheduled'));
const next=api.cupFixtureRoundView([{round:4,teamA:'A',teamB:'B'},{round:1,teamA:'C',teamB:'D'}],2,null);
assert.equal(next.round,4);assert.equal(next.fixtures[0].index,0);
const invalid=api.cupFixtureRoundView([{round:null},{round:0},{round:27},{round:'no'}],2,null);
assert.equal(invalid.round,null);
console.log('PASS: default Round of 64, separate preliminaries, 64 visible trusted prices, past round lockout, original match indices, cached prices and actual saved fixture round.');
