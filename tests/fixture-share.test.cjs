const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const sandbox={URL,URLSearchParams};vm.createContext(sandbox);vm.runInContext(fs.readFileSync('js/fixture-share.js','utf8'),sandbox);
const api=sandbox.BilbbetFixtureShare;
const suffix='|R3|A|B';
const quotes=new Map();
const add=(side,value,label)=>quotes.set('H2H|'+side+suffix,{odds:value,baseOdds:value,prices:[value],label});
add('res-a',1.8);add('res-b',2.4);add('res-draw',20);
add('hcap-a-fav',1.9,'R3: A -4.5');add('hcap-b-dog',1.92,'R3: B +4.5');
let p=api.fixturePrices('A','B',3,quotes);
assert.equal(p.a,1.8);assert.equal(p.b,2.4);assert.equal(p.lineA,-4.5);assert.equal(p.lineB,4.5);assert.equal(p.ha,1.9);
p=api.fixturePrices('B','A',3,quotes);assert.equal(p.a,2.4);assert.equal(p.lineA,4.5);assert.equal(p.ha,1.92);
quotes.get('H2H|res-a'+suffix).odds=2.25;quotes.get('H2H|res-a'+suffix).prices.push(2.25);
assert.equal(api.fixturePrices('A','B',3,quotes).a,1.8,'boost excluded');
quotes.get('H2H|res-a'+suffix).bettable=false;assert.equal(api.fixturePrices('A','B',3,quotes).a,null);
delete quotes.get('H2H|res-a'+suffix).bettable;
quotes.get('H2H|hcap-b-dog'+suffix).label='R3: B +5.5';assert.equal(api.fixturePrices('A','B',3,quotes).ha,null);
quotes.get('H2H|hcap-b-dog'+suffix).label='R3: B +4.5';
add('hcap-a-dog',1.9,'R3: A +3.5');assert.equal(api.fixturePrices('A','B',3,quotes).ha,null,'ambiguous lines not guessed');quotes.delete('H2H|hcap-a-dog'+suffix);
assert.equal(api.fixturePrices('A','B',4,quotes).a,null,'no price leakage between rounds');
assert.equal(api.safeBook([{odds:3},{odds:3},{odds:20}]),null);
const groups=api.fixtureGroups({divisions:['D1','D2','D3'],round:3,schedule:{D1:[[],[],[['A','B']]],D2:[[],[],[['C','D']]],D3:[[],[],[['E','F']]]},confirmed:d=>d!=='D2',noFixtures:d=>d==='D3',cupFixtures:{'FA CUP':[{teamA:'A',teamB:'B',round:1},{teamA:'C',teamB:'D',round:3,stage:'R16'},{teamA:'D',teamB:'C',round:3}]}});
assert.equal(groups.length,2);assert.equal(groups[0].name,'D1');assert.equal(groups[1].fixtures.length,1);
assert.equal(api.imagePages({fixtures:Array.from({length:32},()=>({}))}).length,5);
assert.equal(api.socialUrl('https://example.com/fixtures.html?random=x#old',3,'DIVISION 2A'),'https://example.com/fixtures.html?round=3&competition=DIVISION+2A');
const html=api.modelCard({teamA:'A<script>',teamB:'B',prices:api.fixturePrices('A','B',3,quotes)});
assert(html.includes('A&lt;script&gt;'));assert(html.includes('-4.5'));assert(html.includes('+4.5'));assert(!html.includes('data-pick'));
// Exercise the image layout with a recording Canvas API, including full long team names.
const labels=[];let dimensions;
sandbox.document={createElement:()=>{
 const canvas={getContext:()=>({fillRect(){},fillText:t=>labels.push(t),measureText:t=>({width:t.length*13}),drawImage(){}}),toBlob:cb=>{dimensions=[canvas.width,canvas.height];cb({type:'image/png'});}};return canvas;
}};
(async()=>{
 await api.drawImage({name:'DIVISION 3B',fixtures:[{teamA:'SHAQNADO 2: RETURN OF THE SHAQ',teamB:'B',prices:api.fixturePrices('A','B',3,quotes)}]},{round:3,closed:false,timestamp:{label:'2026-10-30 09:00:00 AEDT (Australia/Sydney)'}},1,1);
 assert.deepEqual(dimensions,[1080,620]);assert(labels.includes('SHAQNADO 2: RETURN OF THE SHAQ'));assert(labels.includes('-4.5'));assert(labels.includes('2026-10-30 09:00:00 AEDT'));
 const app=fs.readFileSync('js/app.js','utf8');
 const branch=app.slice(app.indexOf('  if(FIXTURE_SHARE_MODE){'),app.indexOf("  const savedOverride = await sget("));
 assert(branch.includes('bilbbet_price_list'));assert(!/sset\(|getUser\(|loadHomeStats\(|publish_board|place_bet/.test(branch));assert(branch.includes('return;'));
 console.log('PASS: win/draw/handicap orientation, ordinary published prices, paused/unsafe/ambiguous books, round filtering, page links, PNG layout and read-only startup.');
})().catch(e=>{console.error(e);process.exitCode=1});
