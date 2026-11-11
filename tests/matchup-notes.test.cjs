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
const stakesWithCup=structuredClone(input);stakesWithCup.competitions={'FA Cup':{kind:'FA CUP',entrants:['A','B','C','D'],entrantsComplete:true,fixtures:[{round:3,teams:['A','C']}]}};
assert(N.analyse(stakesWithCup).notes.every(n=>n.priority===0),'Guaranteed consequences take precedence over same-GW cup context');
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
const ctx={BilbbetMatchupNotes:N,DATA:{roddy_results:read('roddy_results'),admin_teams:read('admin_teams'),official_fa_cup_draw:read('official_fa_cup_draw')},REAL_RESULTS:read('real_results'),H2H_DIVISIONS:read('h2h_divisions'),H2H_SCHEDULE:read('h2h_schedule'),ROSTER_RULES:read('roster_rules'),ROUND_DATES:read('round_dates'),state:{currentRound:5,cupFixtures:{'FA CUP':[],ECL:[]},eclGroups:{}},collectingTrustedPrices:false,resolveTeamName:t=>t,Date,
 getCupRoundInfo:()=>null,sydneyKickoffUTC:d=>new Date(d.includes('T')?d:d+'T08:00:00Z'),getH2HRecord:()=>null,esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;')};
vm.createContext(ctx);vm.runInContext(block,ctx);let fixtureCount=0;
for(const pairs of Object.values(ctx.H2H_SCHEDULE))for(const [a,b]of pairs[4]){
 const report=ctx.matchupContext({teamA:a,teamB:b,round:5});assert(report.notes.length<=2);assert(!report.notes.some(n=>n.priority===0),'No title or relegation claim this early');
 assert(report.profiles.every(p=>p.recent.length===4));assert(ctx.renderMatchupNotes({teamA:a,teamB:b,round:5},true).includes('Division median beaten'));fixtureCount++;
}
assert.equal(fixtureCount,33);
assert.equal(ctx.matchupContext({teamA:'GIVE US WANG',teamB:'NANISTATE',round:5}).profiles[0].competitions.ECL.status,'Still in');
assert.equal(ctx.matchupContext({teamA:'GALUCTASARY',teamB:'PAW PATROL UNITED',round:5}).profiles[0].competitions['FA Cup'].status,'Eliminated');
const cupMatch={teamA:'NANISTATE',teamB:'GIVE US WANG',round:5};
assert(!ctx.matchupContext(cupMatch).notes.some(n=>n.family==='cup-commitments'));
ctx.state.cupFixtures['FA CUP'].push({round:5,teamA:'GIVE US WANG',teamB:'QUINTASENTIAL FC',stage:'Round Of 16'});
assert(ctx.matchupContext(cupMatch).notes.some(n=>n.family==='cup-commitments'),'New confirmed cup entries invalidate cache');
ctx.state.cupFixtures['FA CUP']=[];
ctx.state.cupFixtures.ECL.push({round:8,teamA:'OLD DISPLAY NAME',teamB:'OTHER OLD NAME',teamA_id:'085',teamB_id:'022',stage:'Matchday 1'});
assert.deepEqual(JSON.parse(JSON.stringify(ctx.matchupCompetitionInputs().ECL.fixtures[0].teams)),['FULLY SCICLUNA','BC UNITED ZEBRAS'],'Internal fixture IDs take precedence over old display names');
ctx.state.cupFixtures.ECL=[];
const m={teamA:'BC UNITED ZEBRAS',teamB:'GIVE US WANG',round:5};const before=ctx.matchupContext(m).profiles[0].average;ctx.DATA.roddy_results[m.teamA][3]+=10;assert(ctx.matchupContext(m).profiles[0].average>before,'New scores invalidate the report cache');
ctx.collectingTrustedPrices=true;assert.equal(ctx.matchupContext(m),null,'Price collection must not build narrative reports');
console.log(`PASS: ${checked} exhaustive guarantee checks, ties/missing schedules, ECL confirmation gate, form/median anomalies, partial rounds, deduplication, source updates and all 33 live GW5 fixtures.`);

function late(){
 const teams=['A','B','C','D'],scores={A:Array(15).fill(90),B:Array(15).fill(89),C:Array(15).fill(88),D:Array(15).fill(87)};
 return {a:'A',b:'B',round:16,throughRound:15,divisions:{D:teams},schedules:{D:Array.from({length:26},()=>[['A','B'],['C','D']])},scores,leagueScores:scores,
 completedRounds:{D:Array.from({length:15},(_,i)=>i+1)},confirmedRounds:{D:Array.from({length:26},(_,i)=>i+1)},
 rules:{D:{confirmed:true,firstRound:1,lastRound:26,automaticPlaces:1,finalsPlaces:3,relegationPlaces:1}}};
}
const lateReport=N.analyse(late());assert(lateReport.profiles[0].roddyHunt.leader);assert(lateReport.profiles[1].roddyHunt.text.includes('title hunt'));
const normalContext=ctx.matchupContext;ctx.matchupContext=()=>lateReport;
const lateHtml=ctx.renderMatchupNotes({teamA:'A',teamB:'B',round:16},true);assert(lateHtml.includes('How the GW16+ race indicators work'));assert(lateHtml.includes('Within the Roddy title hunt'));ctx.matchupContext=normalContext;
assert(lateReport.profiles[0].races.some(t=>t.key==='title'));
assert(lateReport.profiles[1].races.some(t=>t.key==='relegation'));
assert(lateReport.profiles[1].races.every(t=>!t.text.startsWith('Automatic promotion')),'Mathematically unreachable automatic promotion cannot be advertised');
for(const round of [5,15]){const x=late();x.round=round;x.throughRound=round-1;assert(N.analyse(x).profiles.every(p=>!p.roddyHunt&&!p.races.length));}
const futureView=late();futureView.round=20;futureView.throughRound=4;assert(N.analyse(futureView).profiles.every(p=>!p.roddyHunt&&!p.races.length));
const missingLate=late();missingLate.scores.C[14]=null;assert(N.analyse(missingLate).profiles.every(p=>!p.roddyHunt&&!p.races.length));
const poorForm=late();poorForm.scores.B=[...Array(10).fill(91),...Array(5).fill(80)];assert(!N.analyse(poorForm).profiles[1].roddyHunt,'A close total without comparable recent form is not automatically in the hunt');
const edge=late();edge.scores.B=[...Array(9).fill(84),89,...Array(5).fill(90)];assert(N.analyse(edge).profiles[1].roddyHunt);edge.scores.B[9]=88;assert(!N.analyse(edge).profiles[1].roddyHunt,'Gap outside five points per remaining round is excluded');
const configured=late();configured.reportingRules={roddy_gap_per_remaining_round:.5};assert(!N.analyse(configured).profiles[1].roddyHunt,'Disclosed rule can be adjusted');
const completeSeason=late();completeSeason.round=24;completeSeason.throughRound=23;completeSeason.rules.D.lastRound=23;
for(const t of ['A','B','C','D'])completeSeason.scores[t]=Array(23).fill({A:90,B:89,C:88,D:87}[t]);
completeSeason.completedRounds.D=Array.from({length:23},(_,i)=>i+1);
assert(N.analyse(completeSeason).profiles[0].races.some(r=>r.key==='title-secured'),'Settled regular-season title is not described as a race');
assert(!N.analyse(completeSeason).profiles.some(p=>p.races.some(r=>r.key==='title')));

const cupInput={round:8,throughRound:7,scores:{A:[null,80],B:[null,80],C:[],D:[]}};
const fa={kind:'FA CUP',entrants:['A','B','C','D'],entrantsComplete:true,fixtures:[{round:2,teams:['A','B']},{round:8,teams:['A','B'],stage:'Replay'}]};
assert.equal(N.competitionStatus(cupInput,fa,'A').status,'Advancement unconfirmed');assert.equal(N.competitionStatus(cupInput,fa,'A').fixtures.length,1);
const authoritative=structuredClone(fa);authoritative.fixtures[0].winner='B';assert.equal(N.competitionStatus(cupInput,authoritative,'A').status,'Eliminated');assert.equal(N.competitionStatus(cupInput,authoritative,'A').fixtures.length,0);
const replayed=structuredClone(cupInput);replayed.throughRound=8;replayed.round=9;replayed.scores.A[7]=100;replayed.scores.B[7]=90;
assert.equal(N.competitionStatus(replayed,fa,'B').status,'Eliminated');assert.equal(N.competitionStatus(replayed,fa,'A').status,'Still in');
const futureFact=structuredClone(cupInput);futureFact.resultRounds=[];assert.equal(N.competitionStatus(futureFact,authoritative,'A').status,'Still in','Future-dated imported results cannot eliminate a team');
const group={kind:'ECL',entrants:['A','B','C','D'],entrantsComplete:true,groups:{A:['A','B','C','D']},groupEndRound:13,fixtures:[
 {round:8,teams:['A','B'],group:true},{round:8,teams:['C','D'],group:true},
 {round:10,teams:['A','C'],group:true},{round:10,teams:['B','D'],group:true},
 {round:13,teams:['A','D'],group:true},{round:13,teams:['B','C'],group:true},
 {round:15,teams:['A','B'],knockout:true}]};
const groupInput={round:14,throughRound:13,scores:{A:[],B:[],C:[],D:[]}};
for(const r of [8,10,13])for(const [team,score]of [['A',100],['B',90],['C',80],['D',70]])groupInput.scores[team][r-1]=score;
assert.equal(N.competitionStatus(groupInput,group,'C').status,'Eliminated');assert.equal(N.competitionStatus(groupInput,group,'B').status,'Still in');
const incomplete=structuredClone(group);incomplete.fixtures.splice(0,1);assert.equal(N.competitionStatus(groupInput,incomplete,'B').status,'Advancement unconfirmed');
const tiedGroup=structuredClone(groupInput);for(const r of [8,10,13])tiedGroup.scores.C[r-1]=90;assert.equal(N.competitionStatus(tiedGroup,group,'B').status,'Advancement unconfirmed');
const earlyOut=structuredClone(groupInput);earlyOut.round=11;earlyOut.throughRound=10;
for(const r of [8,10])for(const [team,score]of [['A',50],['B',100],['C',100],['D',50]])earlyOut.scores[team][r-1]=score;
assert.equal(N.competitionStatus(earlyOut,group,'A').status,'Eliminated','Two opponents already above the maximum remaining group points prove an early exit');
groupInput.round=16;groupInput.throughRound=15;groupInput.scores.A[14]=80;groupInput.scores.B[14]=90;assert.equal(N.competitionStatus(groupInput,group,'A').status,'Eliminated');
assert.equal(N.competitionStatus(groupInput,group,'X').status,'Not entered');assert.equal(N.competitionStatus(groupInput,{entrants:[]},'X').status,'Status unconfirmed');
console.log('PASS: GW16 boundary and future-round guards, realistic Roddy title chase, form/score-gap limits, table cutoffs, authoritative cup winners, unresolved replays, ECL groups/ties/knockouts, new cup fixture cache updates.');
