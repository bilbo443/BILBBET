const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const A=require('../js/team-abbreviations.js'),registry=JSON.parse(fs.readFileSync('data/admin_teams.json','utf8'));
const api=A.create(registry),active=registry.filter(t=>t.status&&t.status!=='INACTIVE');
assert.equal(active.length,66);assert.equal(api.key().length,66);assert.equal(new Set(api.key().map(r=>r.abbreviation)).size,66);assert.deepEqual(api.missing(),[]);
for(const t of active)assert.match(api.label(t.name),/^[A-Z0-9]{3}$/);
for(const [id,code] of Object.entries({'022':'BCU','002':'JVZ','041':'HFR','040':'FFB','073':'TPK','075':'ABR','077':'CDH','067':'MCH','001':'DCR','080':'GSH','038':'BVN','091':'GLC','081':'PAY','099':'DRT','094':'SSQ','066':'SOL','076':'BCH'}))assert.equal(A.codes[id],code);
assert.equal(api.label('  bc united zebras  '),'BCU');assert.equal(api.label('ROYAL KC UNITED FC'),'RDF');assert.equal(api.label('THE D GENREAU'),'FSC');
assert.equal(api.label('An unknown club'),'An unknown club');
const renamed=structuredClone(registry),bc=renamed.find(t=>t.id==='022');bc.prev_names=bc.name;bc.name='BC NEW NAME';
assert.equal(A.create(renamed).label('BC NEW NAME'),'BCU');assert.equal(A.create(renamed).label('BC UNITED ZEBRAS'),'BCU');
const extra=[...registry,{id:'999',name:'NEW CLUB',status:'DIVISION 3A'}];assert.equal(A.create(extra).label('NEW CLUB'),'NEW CLUB');assert.deepEqual(A.create(extra).missing(),['NEW CLUB']);
const ambiguous=structuredClone(registry);ambiguous[0].prev_names='SHARED OLD NAME';ambiguous[1].prev_names='SHARED OLD NAME';assert.equal(A.create(ambiguous).label('SHARED OLD NAME'),'SHARED OLD NAME');
const app=fs.readFileSync('js/app.js','utf8'),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ctx={BilbbetTeamAbbreviations:A,DATA:{admin_teams:registry},esc,H2H_SCHEDULE:{D:[[['BC UNITED ZEBRAS','GIVE US WANG']],[['SECRET PROVISIONAL','OTHER']]]},divisionFixtureConfirmed:(_d,r)=>r===1};
vm.createContext(ctx);vm.runInContext(app.slice(app.indexOf('  let abbreviationRegistry'),app.indexOf('  function renderFormModal(')),ctx);
const calendar=ctx.renderCompactFixtureCalendar('D');assert(calendar.includes('BCU'));assert(calendar.includes('GUW'));assert(calendar.includes('data-show-form="BC UNITED ZEBRAS"'));assert(calendar.includes('Awaiting confirmed fixtures'));assert(!calendar.includes('SECRET PROVISIONAL'));assert(ctx.compactTeamLabel('BC UNITED ZEBRAS').includes('aria-label="BC UNITED ZEBRAS'));
ctx.setTimeout=fn=>fn();ctx.computeH2HMarket=()=>({aWinPct:55,bWinPct:40});ctx.toOdds=p=>({odds:Math.round(100/(p*1.05)*100)/100,suspended:false});
vm.runInContext(app.slice(app.indexOf('  function h2hCsvCell('),app.indexOf('  function h2hSubTabBar(')),ctx);
(async()=>{
 const teams=['BC UNITED ZEBRAS','GIVE US WANG'],codes=teams.map(api.label);
 const before=await ctx.buildH2HMatrixCsv(teams,5,new Map()),after=await ctx.buildH2HMatrixCsv(teams,5,new Map(),()=>{},()=>false,before.snapshot,codes);
 assert(after.csv.includes('"BCU","GUW"'));assert(after.csv.includes('"BCU","","1.73"'));assert(after.csv.includes('"GUW","2.38",""'));
 assert.deepEqual(after.counts,before.counts);assert.equal(after.snapshot,before.snapshot);
 await assert.rejects(ctx.buildH2HMatrixCsv(teams,5,new Map(),()=>{},()=>false,before.snapshot,['SAME','SAME']),/unique/);
 for(const page of ['index.html','fixtures.html']){const html=fs.readFileSync(page,'utf8');assert(html.indexOf('js/team-abbreviations.js')<html.indexOf('js/app.js'));}
 assert(fs.readFileSync('sw.js','utf8').includes('./js/team-abbreviations.js'));
 console.log('PASS: 66 unique approved ID-based labels, renames/aliases/unknowns, accessible full names, confirmed-only calendar, matrix orientation/prices and unchanged full-name pricing inputs.');
})().catch(error=>{console.error(error);process.exitCode=1});
