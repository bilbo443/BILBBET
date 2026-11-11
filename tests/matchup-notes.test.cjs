const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const N=require('../js/matchup-notes.js');
function fixture(scores,through=2){
 return {a:'A',b:'D',round:3,throughRound:through,divisions:{D:['A','B','C','D']},
  schedules:{D:[[['A','B'],['C','D']],[['A','C'],['B','D']],[['A','D'],['B','C']]]},
  scores,leagueScores:scores,confirmedRounds:{D:[1,2,3]},completedRounds:{D:[1,2]},
  rules:{D:{confirmed:true,firstRound:1,lastRound:3,automaticPlaces:1,relegationPlaces:1}}};
}
const input=fixture({A:[100,100],B:[50,100],C:[100,50],D:[50,50]});
const original=JSON.stringify(input),r=N.analyse(input);
assert.equal(JSON.stringify(input),original,'Reports cannot mutate inputs');
assert.equal(r.notes.length,2);assert(r.notes.every(n=>n.priority===0));
assert(r.notes.some(n=>/A: a win guarantees the division title and automatic promotion/.test(n.text)));
assert(r.notes.some(n=>/D: a defeat guarantees relegation/.test(n.text)));
const tied=fixture({A:[100,50],B:[50,100],C:[100,100],D:[50,50]});
assert(!N.analyse(tied).notes.some(n=>/A: a win guarantees the division title/.test(n.text)),'Equal maximum points cannot prove a title');
for(const edit of [x=>x.confirmedRounds.D.pop(),x=>x.schedules.D[2].pop(),x=>x.leagueScores.B[0]=null,x=>x.rules.D.confirmed=false]){
 const x=structuredClone(input);edit(x);assert(!N.analyse(x).notes.some(n=>n.priority===0),'Unknown/incomplete context cannot make a guarantee');
}
const noEcl=structuredClone(input);noEcl.rules.D.eclPlaces=2;assert(!N.analyse(noEcl).notes.some(n=>n.text.includes('ECL')));
const withEcl=structuredClone(input);Object.assign(withEcl.rules.D,{eclPlaces:1,eclConfirmed:true});assert(N.analyse(withEcl).notes.some(n=>n.text.includes('ECL qualification')));
// Exhaustively check that every title/relegation claim survives all results of
// the other final-round fixture. Ties count against a guarantee.
const outcomes=[[100,50],[75,75],[50,100]];let checked=0;
for(let code=0;code<81;code++){
 let k=code;const scores={A:[],B:[],C:[],D:[]};
 for(const pairs of input.schedules.D.slice(0,2))for(const [a,b]of pairs){const pair=outcomes[k%3];k=Math.floor(k/3);scores[a].push(pair[0]);scores[b].push(pair[1]);}
 const x=fixture(scores),notes=N.analyse(x).notes;
 for(const note of notes.filter(n=>n.priority===0)){
  const team=note.text.startsWith('A:')?'A':'D',winner=note.text.includes('a win')?team:(team==='A'?'D':'A');
  for(const other of outcomes){
   const points=Object.fromEntries(['A','B','C','D'].map(t=>[t,N.divisionData(x,'D').rows[t].points]));points[winner]+=3;
   if(other[0]>other[1])points.B+=3;else if(other[0]<other[1])points.C+=3;else{points.B++;points.C++;}
   if(note.text.includes('division title'))assert(Object.keys(points).every(t=>t===team||points[team]>points[t]));
   if(note.text.includes('guarantees relegation'))assert(Object.keys(points).every(t=>t===team||points[team]<points[t]));
   checked++;
  }
 }
}
assert(checked>0);
const form={a:'A',b:'B',round:6,throughRound:5,divisions:{D:['A','B','C','D']},schedules:{D:Array.from({length:5},()=>[['A','B'],['C','D']])},confirmedRounds:{D:[1,2,3,4,5]},completedRounds:{D:[1,2,3,4,5]},rules:{}};
form.scores={A:[90,90,90,90,90],B:[80,80,80,80,80],C:[100,100,100,100,100],D:[110,110,110,110,110]};form.leagueScores=form.scores;
const anomaly=N.analyse(form);assert(anomaly.notes.some(n=>/won 5.*only 0/.test(n.text)));assert.equal(anomaly.notes.filter(n=>n.family==='form').length,0,'Do not repeat an anomaly as a generic form story');
assert(anomaly.notes.length<=2);assert.equal(new Set(anomaly.notes.map(n=>n.family)).size,anomaly.notes.length);
const partial=structuredClone(form);partial.scores.C[4]=null;assert.equal(N.analyse(partial).profiles[0].recent.length,4,'Exclude incomplete division scoring rounds');
const equality=structuredClone(form);equality.scores={A:[80,80,80,80,80],B:[80,80,80,80,80],C:[80,80,80,80,80],D:[80,80,80,80,80]};equality.leagueScores=equality.scores;
assert.equal(N.analyse(equality).profiles[0].equalMedian,5);assert.equal(N.analyse(equality).profiles[0].aboveMedian,0);
const historical=structuredClone(form);historical.throughRound=2;assert(N.analyse(historical).profiles.every(p=>p.recent.every(r=>r.round<=2)));
const cross=structuredClone(input);cross.divisions={D:['A','B'],E:['C','D']};cross.schedules={D:[[['A','B']]],E:[[['C','D']]]};assert(!N.analyse(cross).notes.some(n=>n.priority===0),'A cross-conference cup match cannot guarantee league points');
assert.deepEqual(N.analyse({...input,b:'Unknown'}),{profiles:[],notes:[]});
// App wiring: both fixture summaries and expanded markets use the same report.
const app=fs.readFileSync('js/app.js','utf8'),index=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
assert(app.includes('${renderMatchupNotes(m,true)}'));assert(app.includes('${renderMatchupNotes(m)}'));
assert(index.indexOf('js/matchup-notes.js')<index.indexOf('js/app.js'));
assert(sw.includes('./js/matchup-notes.js'));
const block=app.slice(app.indexOf('  const matchupContextCache'),app.indexOf('  function renderH2HMarket('));
assert(!/secureRpc\(|sset\(|computeH2HMarket\(/.test(block),'Reporting must not price or write data');
const read=n=>JSON.parse(fs.readFileSync('data/'+n+'.json','utf8'));
const ctx={BilbbetMatchupNotes:N,DATA:{roddy_results:read('roddy_results')},REAL_RESULTS:read('real_results'),H2H_DIVISIONS:read('h2h_divisions'),H2H_SCHEDULE:read('h2h_schedule'),ROSTER_RULES:read('roster_rules'),ROUND_DATES:read('round_dates'),state:{currentRound:5},collectingTrustedPrices:false,resolveTeamName:t=>t,Date,
 sydneyKickoffUTC:d=>new Date(d.includes('T')?d:d+'T08:00:00Z'),getH2HRecord:()=>null,esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;')};
vm.createContext(ctx);vm.runInContext(block,ctx);let fixtureCount=0;
for(const pairs of Object.values(ctx.H2H_SCHEDULE))for(const [a,b]of pairs[4]){
 const report=ctx.matchupContext({teamA:a,teamB:b,round:5});assert(report.notes.length<=2);assert(!report.notes.some(n=>n.priority===0),'No title or relegation claim this early');
 assert(report.profiles.every(p=>p.recent.length===4));assert(ctx.renderMatchupNotes({teamA:a,teamB:b,round:5},true).includes('Division median beaten'));fixtureCount++;
}
assert.equal(fixtureCount,33);
const m={teamA:'BC UNITED ZEBRAS',teamB:'GIVE US WANG',round:5};const before=ctx.matchupContext(m).profiles[0].average;ctx.DATA.roddy_results[m.teamA][3]+=10;assert(ctx.matchupContext(m).profiles[0].average>before,'New scores invalidate the report cache');
ctx.collectingTrustedPrices=true;assert.equal(ctx.matchupContext(m),null,'Price collection must not build narrative reports');
console.log(`PASS: ${checked} exhaustive guarantee checks, ties/missing schedules, ECL confirmation gate, form/median anomalies, partial rounds, deduplication, source updates and all 33 live GW5 fixtures.`);
