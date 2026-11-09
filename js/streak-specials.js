(function(root){
  'use strict';
  function history(teams,schedule,results,throughRound,firstRound=1,lastRound=26){
    const records=Object.fromEntries(teams.map(team=>[team,{team,played:0,won:0,lost:0,drawn:0,firstWin:null,firstLoss:null}]));
    for(let round=firstRound;round<=Math.min(throughRound,lastRound);round++){
      const pairs=schedule[round-1];
      if(!Array.isArray(pairs)||pairs.length*2!==teams.length)return null;
      const seen=new Set();
      for(const pair of pairs){
        if(!Array.isArray(pair)||pair.length!==2)return null;
        const [a,b]=pair,sa=results[a]?.[round-1],sb=results[b]?.[round-1];
        if(!records[a]||!records[b]||a===b||seen.has(a)||seen.has(b)||!Number.isFinite(sa)||!Number.isFinite(sb))return null;
        seen.add(a);seen.add(b);
        for(const [team,own,opp] of [[a,sa,sb],[b,sb,sa]]){
          const rec=records[team];rec.played++;
          if(own>opp){rec.won++;rec.firstWin??=round;}
          else if(own<opp){rec.lost++;rec.firstLoss??=round;}
          else rec.drawn++;
        }
      }
    }
    return records;
  }
  function forecast(kind,team,schedule,start,end,probability){
    if(!['WIN','LOSS'].includes(kind)||start>end)return [];
    let survival=1;const outcomes=[];
    for(let round=start;round<=end;round++){
      const pair=(schedule[round-1]||[]).find(p=>p.includes(team));
      if(!pair)return []; // No invented fixture/bye interpretation.
      const p=probability(pair,round,kind,team);
      if(!Number.isFinite(p)||p<0||p>1)return [];
      outcomes.push({round,probability:survival*p});survival*=1-p;
    }
    outcomes.push({round:null,probability:survival});
    return outcomes;
  }
  function result(kind,target,record,checkedThrough,lastRound){
    if(!record)return null;
    const first=kind==='WIN'?record.firstWin:kind==='LOSS'?record.firstLoss:undefined;
    if(first===undefined)return null;
    if(first!==null)return target===first?'WON':'LOST';
    if(target!==null&&checkedThrough>=target)return 'LOST';
    if(target===null&&checkedThrough>=lastRound)return 'WON';
    return null;
  }
  const api={history,forecast,result};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.BilbbetStreaks=api;
})(typeof window!=='undefined'?window:globalThis);
