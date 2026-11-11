(function(root){
  'use strict';
  const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
  const median=xs=>{const a=[...xs].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;};
  const ordinal=n=>n+(n%100>=11&&n%100<=13?'th':({1:'st',2:'nd',3:'rd'}[n%10]||'th'));
  function validPairs(pairs,teams){
    if(!Array.isArray(pairs)||pairs.length*2!==teams.length)return false;
    const names=pairs.flat();return pairs.every(p=>Array.isArray(p)&&p.length===2)&&names.every(t=>teams.includes(t))&&new Set(names).size===teams.length;
  }
  function divisionData(input,division){
    const teams=input.divisions[division]||[],schedule=input.schedules[division]||[],scores=input.scores||{},league=input.leagueScores||scores;
    const confirmed=new Set((input.confirmedRounds?.[division]||[]).map(Number));
    const scoreRounds=(input.completedRounds?.[division]||[]).filter(r=>r<=input.throughRound&&teams.every(t=>Number.isFinite(scores[t]?.[r-1]))).sort((a,b)=>a-b);
    const rows=Object.fromEntries(teams.map(team=>[team,{team,points:0,scoreFor:0,results:[]}])) ;
    for(let r=1;r<=input.throughRound;r++){
      const pairs=schedule[r-1];
      if(!confirmed.has(r)||!validPairs(pairs,teams)||!pairs.every(([a,b])=>Number.isFinite(league[a]?.[r-1])&&Number.isFinite(league[b]?.[r-1])))continue;
      for(const [a,b]of pairs){const sa=league[a][r-1],sb=league[b][r-1];for(const [t,o,s,against]of [[a,b,sa,sb],[b,a,sb,sa]]){
        const result=s>against?'W':s<against?'L':'D';rows[t].points+=result==='W'?3:result==='D'?1:0;rows[t].scoreFor+=s;
        rows[t].results.push({round:r,result,score:s,against,opponent:o,margin:s-against});
      }}
    }
    const ordered=Object.values(rows).sort((a,b)=>b.points-a.points||b.scoreFor-a.scoreFor||a.team.localeCompare(b.team));
    for(const row of ordered)row.rank=1+ordered.filter(x=>x.points>row.points||(x.points===row.points&&x.scoreFor>row.scoreFor)).length;
    const profiles={};
    for(const team of teams){
      const allScores=scoreRounds.map(r=>({round:r,score:scores[team][r-1],median:median(teams.map(t=>scores[t][r-1]))}));
      const recent=allScores.slice(-5),results=rows[team].results.slice(-5);
      profiles[team]={...rows[team],results,played:rows[team].results.length,allScores,recent,
        average:recent.length?mean(recent.map(r=>r.score)):null,seasonAverage:allScores.length?mean(allScores.map(r=>r.score)):null,
        medianMargin:recent.length?mean(recent.map(r=>r.score-r.median)):null,
        aboveMedian:recent.filter(r=>r.score>r.median).length,equalMedian:recent.filter(r=>r.score===r.median).length};
    }
    return {teams,schedule,confirmed,rows,profiles,scoreRounds};
  }
  function guarantees(input,division,a,b,round,data){
    const cfg=input.rules?.[division],end=cfg?.lastRound,start=cfg?.firstRound;
    if(!cfg?.confirmed||!Number.isInteger(end)||!Number.isInteger(start)||round>end||round<=input.throughRound)return [];
    // No inference from incomplete schedules, partial historic rounds or unresolved tie-breaks.
    for(let r=start;r<=end;r++){
      if(!data.confirmed.has(r)||!validPairs(data.schedule[r-1],data.teams))return [];
      if(r<=input.throughRound&&!data.schedule[r-1].every(([x,y])=>Number.isFinite(input.leagueScores?.[x]?.[r-1])&&Number.isFinite(input.leagueScores?.[y]?.[r-1])))return [];
    }
    if(!data.schedule[round-1].some(p=>p.includes(a)&&p.includes(b)))return [];
    const bounds=(team,winner)=>{
      const remaining=Object.fromEntries(data.teams.map(t=>[t,0]));
      for(let r=input.throughRound+1;r<=end;r++)for(const pair of data.schedule[r-1])for(const t of pair)remaining[t]++;
      const points=Object.fromEntries(data.teams.map(t=>[t,data.rows[t].points]));
      if(winner){points[winner]+=3;remaining[a]--;remaining[b]--;}
      const minimum=points[team],maximum=minimum+3*remaining[team];
      return {best:1+data.teams.filter(t=>t!==team&&points[t]>maximum).length,
        worst:1+data.teams.filter(t=>t!==team&&points[t]+3*remaining[t]>=minimum).length};
    };
    const notes=[];
    for(const team of [a,b])for(const outcome of ['win','loss']){
      const winner=outcome==='win'?team:(team===a?b:a),before=bounds(team),after=bounds(team,winner),n=data.teams.length;
      const achieved=[];
      if(after.worst===1&&before.worst>1)achieved.push('the division title');
      if(Number.isInteger(cfg.automaticPlaces)&&cfg.automaticPlaces>0&&after.worst<=cfg.automaticPlaces&&before.worst>cfg.automaticPlaces)achieved.push('automatic promotion');
      if(Number.isInteger(cfg.eclPlaces)&&cfg.eclPlaces>0&&cfg.eclConfirmed===true&&after.worst<=cfg.eclPlaces&&before.worst>cfg.eclPlaces)achieved.push('ECL qualification');
      if(!achieved.length&&Number.isInteger(cfg.finalsPlaces)&&cfg.finalsPlaces>0&&after.worst<=cfg.finalsPlaces&&before.worst>cfg.finalsPlaces)achieved.push('a finals place');
      const safe=n-(cfg.relegationPlaces||0);
      if(cfg.relegationPlaces>0&&after.best>safe&&before.best<=safe)achieved.push('relegation');
      else if(!achieved.length&&cfg.relegationPlaces>0&&after.worst<=safe&&before.worst>safe)achieved.push('safety from relegation');
      if(!achieved.length&&after.best===after.worst&&before.best!==before.worst)achieved.push(ordinal(after.best)+' place');
      if(achieved.length)notes.push({priority:0,family:'guarantee:'+team,text:`${team}: a ${outcome==='win'?'win':'defeat'} guarantees ${achieved.join(' and ')}.`});
    }
    return notes;
  }
  function analyse(input){
    const {a,b}=input;if(a===b)return {profiles:[],notes:[]};
    const divisionFor=t=>Object.keys(input.divisions).find(d=>input.divisions[d].includes(t));
    const da=divisionFor(a),db=divisionFor(b);if(!da||!db)return {profiles:[],notes:[]};
    const cache={};const get=d=>cache[d]||(cache[d]=divisionData(input,d));
    const pa=get(da).profiles[a],pb=get(db).profiles[b],notes=[];
    const add=(priority,family,text)=>notes.push({priority,family,text});
    if(da===db)notes.push(...guarantees(input,da,a,b,input.round,get(da)));
    // Raw positions compare only within the same conference and after at least three league games.
    if(da===db&&pa.played>=3&&pb.played>=3&&Math.abs(pa.rank-pb.rank)<=2&&Math.abs(pa.points-pb.points)<=3){
      const gap=Math.abs(pa.points-pb.points);add(5,'ladder',gap?`${gap} point${gap===1?'':'s'} separate these sides in the league table (${ordinal(pa.rank)} and ${ordinal(pb.rank)}).`:`Level on ${pa.points} league points (${ordinal(pa.rank)} and ${ordinal(pb.rank)}).`);
    }
    else if(da===db&&pa.played>=4&&pb.played>=4&&Math.abs(pa.rank-pb.rank)>=Math.ceil(get(da).teams.length/2)&&Math.abs(pa.points-pb.points)>=9){
      const higher=pa.rank<pb.rank?pa:pb,lower=higher===pa?pb:pa;
      add(5,'ladder',`${higher.team} sits ${Math.abs(pa.rank-pb.rank)} places and ${Math.abs(pa.points-pb.points)} league points above ${lower.team}.`);
    }
    const wins=p=>p.results.filter(r=>r.result==='W').length,losses=p=>p.results.filter(r=>r.result==='L').length;
    for(const p of [pa,pb]){
      const n=p.results.length,m=p.recent.length;
      // Use exactly the same league rounds for result/median anomaly comparisons.
      const comparable=p.results.map(r=>{const scoring=p.allScores.find(s=>s.round===r.round);return {result:r.result,score:scoring?.score,median:scoring?.median};}).filter(r=>Number.isFinite(r.median)&&Number.isFinite(r.score));
      if(comparable.length>=3){const k=comparable.length,above=comparable.filter(r=>r.score>r.median).length,w=comparable.filter(r=>r.result==='W').length,l=comparable.filter(r=>r.result==='L').length;
        if(w>=Math.ceil(.75*k)&&above<=Math.floor(k/2))add(2,'results',`${p.team} won ${w} of the last ${k} league games, but beat the division median in only ${above} of those rounds.`);
        else if(l>=Math.ceil(.75*k)&&above>=Math.ceil(.75*k))add(2,'results',`${p.team} lost ${l} of the last ${k} league games despite beating the division median in ${above} of those rounds.`);
      }
      const last=p.results.slice(-3);
      if(last.length===3&&last.every(r=>r.result===last[0].result)&&last[0].result!=='D'&&last.every(r=>Math.abs(r.margin)<=5)){
        add(3,'results',`${p.team}'s last three ${last[0].result==='W'?'wins':'defeats'} were decided by a combined ${last.reduce((sum,r)=>sum+Math.abs(r.margin),0)} points.`);
      }
      if(m>=3&&p.aboveMedian>=m-1)add(6,'form',`${p.team} beat the division median in ${p.aboveMedian} of the last ${m} completed scoring rounds (average margin ${p.medianMargin>=0?'+':''}${p.medianMargin.toFixed(1)}).`);
      else if(m>=3&&p.aboveMedian===0)add(6,'form',`${p.team} has not beaten the division median in the last ${m} completed scoring rounds${p.equalMedian?` (${p.equalMedian} level)` : ''}.`);
      if(p.allScores.length>=4){const latest=p.allScores.at(-1),earlier=p.allScores.slice(0,-1).map(r=>r.score);
        if(latest.score>=Math.max(...earlier)+15&&latest.score>=mean(earlier)+20)add(3,'scoring',`${p.team}'s latest ${latest.score} was a season high; earlier rounds averaged ${mean(earlier).toFixed(1)}.`);
      }
      if(m>=4&&p.average-median(p.recent.map(r=>r.score))>=8)add(4,'scoring',`${p.team}'s recent average is ${p.average.toFixed(1)}, versus a median score of ${median(p.recent.map(r=>r.score)).toFixed(1)}; the highest score was ${Math.max(...p.recent.map(r=>r.score))}.`);
      if(n>=3){const opponentMargins=p.results.map(r=>{const opponent=get(divisionFor(r.opponent)).profiles[r.opponent];return opponent?.recent.length>=3?opponent.medianMargin:null;}).filter(Number.isFinite);
        if(opponentMargins.length===n&&Math.abs(mean(opponentMargins))>=8)add(7,'opponents',`${p.team}'s last ${n} league opponents currently average ${Math.abs(mean(opponentMargins)).toFixed(1)} points ${mean(opponentMargins)>0?'above':'below'} their division median over their recent scoring rounds.`);
      }
    }
    const last=input.record?.lastMatch||'',season=last.match(/^(\d{2})\/\d{2}/);
    if(/\bFINAL\b/i.test(last)&&!/(SEMI|QUARTER)[ -]?FINAL/i.test(last))add(8,'history',`Rematch of a recorded final: ${last}.`);
    else if(season&&input.record.played>=2&&Number.isInteger(input.seasonStart)&&input.seasonStart-(2000+Number(season[1]))>=2)add(9,'history',`The most recent recorded meeting was in ${season[0]} (${input.seasonStart-(2000+Number(season[1]))} seasons ago).`);
    if(pa.results.length>=3&&pa.results.length===pb.results.length){const n=pa.results.length,wa=wins(pa),wb=wins(pb),la=losses(pa),lb=losses(pb);
      if(wa===wb&&wa>=n-1)add(4,'form',`Both sides have won ${wa} of their last ${n} league games.`);
      else if(la===lb&&la>=n-1)add(4,'form',`Both sides have lost ${la} of their last ${n} league games.`);
      else if((wa>=n-1&&wb<=1)||(wb>=n-1&&wa<=1))add(4,'form',`${a}: ${wa} wins in the last ${n} league games; ${b}: ${wb}.`);
    }
    if(pa.recent.length>=4&&pb.recent.length>=4){
      const sd=p=>Math.sqrt(mean(p.recent.map(r=>(r.score-p.average)**2)));
      if(Math.min(sd(pa),sd(pb))<=10&&Math.max(sd(pa),sd(pb))>=18){const stable=sd(pa)<sd(pb)?pa:pb,variable=stable===pa?pb:pa;
        const range=p=>`${Math.min(...p.recent.map(r=>r.score))}–${Math.max(...p.recent.map(r=>r.score))}`;
        add(7,'scoring',`Recent score ranges: ${stable.team} ${range(stable)}; ${variable.team} ${range(variable)}.`);
      }
    }
    if(pa.recent.length>=3&&pb.recent.length>=3&&Math.abs(pa.medianMargin-pb.medianMargin)>=10)add(4,'form',`Recent average margins against their respective division medians: ${a} ${pa.medianMargin>=0?'+':''}${pa.medianMargin.toFixed(1)}; ${b} ${pb.medianMargin>=0?'+':''}${pb.medianMargin.toFixed(1)}.`);
    // Roddy positions use only whole-league complete scoring rounds, never partial exports.
    const all=Object.values(input.divisions).flat(),common=Array.from({length:input.throughRound},(_,i)=>i+1).filter(r=>Object.keys(input.divisions).every(d=>get(d).scoreRounds.includes(r)));
    if(common.length){const totals=Object.fromEntries(all.map(t=>[t,common.reduce((sum,r)=>sum+input.scores[t][r-1],0)]));
      for(const p of [pa,pb]){p.roddyRank=1+all.filter(t=>totals[t]>totals[p.team]).length;p.roddySize=all.length;
        const divSize=input.divisions[divisionFor(p.team)].length;
        if(p.played>=3&&Math.abs((p.rank-1)/(divSize-1)-(p.roddyRank-1)/(all.length-1))>=.4)add(8,'ladder',`${p.team} is ${ordinal(p.rank)} in its division and ${ordinal(p.roddyRank)} of ${all.length} in the Roddy.`);
      }
    }
    const selected=[],families=new Set();
    for(const note of notes.sort((x,y)=>x.priority-y.priority||x.text.localeCompare(y.text))){if(families.has(note.family)||(note.family==='form'&&selected.some(n=>n.family==='results'&&n.priority===2)))continue;families.add(note.family);selected.push(note);if(selected.length===2)break;}
    return {profiles:[pa,pb],notes:selected};
  }
  const api={analyse,guarantees,divisionData};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.BilbbetMatchupNotes=api;
})(typeof globalThis!=='undefined'?globalThis:this);
