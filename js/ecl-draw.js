(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BilbbetEcl=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION='ecl-three-matchdays-v1';
  const ORDER=['A4','B4','C4','A1','B1','C1','A2','B2','C2','A3','B3','C3'];
  function validate(field,pot1,groups){
    if(field.length!==12||new Set(field).size!==12||pot1.length!==3||new Set(pot1).size!==3||pot1.some(t=>!field.includes(t)))throw Error('ECL needs 12 unique entrants and three Pot 1 teams.');
    if(Object.keys(groups).some(g=>!['A','B','C'].includes(g)))throw Error('Only Groups A, B and C are valid.');
    const seen=new Set();
    for(const g of ['A','B','C']){
      const teams=groups[g]||[];
      if(!Array.isArray(teams)||teams.length>4)throw Error('Each group holds four teams.');
      for(const [i,t]of teams.entries()){if(t==null)continue;if(!field.includes(t)||seen.has(t))throw Error('Unknown or duplicate ECL entrant.');if((i===0)!==pot1.includes(t))throw Error('Pot 1 fills slot 4; Pot 2 fills slots 1–3.');seen.add(t);}
    }
    return true;
  }
  function nextSlot(groups,pot1){
    return ORDER.find(slot=>!(groups[slot[0]]||[])[slot[1]==='4'?0:Number(slot[1])])||null;
  }
  function commit(field,pot1,groups,team){
    validate(field,pot1,groups);const slot=nextSlot(groups,pot1);
    if(!slot)throw Error('All 12 draw positions are filled.');
    if((slot[1]==='4')!==pot1.includes(team))throw Error('Draw '+slot+' from Pot '+(slot[1]==='4'?'1':'2')+'.');
    const result={A:[...(groups.A||[])],B:[...(groups.B||[])],C:[...(groups.C||[])]};const index=slot[1]==='4'?0:Number(slot[1]);while(result[slot[0]].length<=index)result[slot[0]].push(null);result[slot[0]][index]=team;validate(field,pot1,result);return {groups:result,slot};
  }
  function slots(teams,pot1){return [teams[1]||null,teams[2]||null,teams[3]||null,teams[0]||null];}
  function rng(key){let seed=2166136261;for(const c of String(key)){seed^=c.charCodeAt(0);seed=Math.imul(seed,16777619);}return ()=>{seed+=0x6D2B79F5;let x=seed;x=Math.imul(x^x>>>15,x|1);x^=x+Math.imul(x^x>>>7,x|61);return ((x^x>>>14)>>>0)/4294967296;};}
  function winnerProbabilities(teams,sample,options={}){
    if(teams.length!==4||new Set(teams).size!==4)throw Error('A complete four-team group is required.');
    const n=options.n||6000,rounds=options.rounds||[8,10,13],key=options.key||VERSION;
    const random=rng(key+'|'+teams.join('|')),counts=Object.fromEntries(teams.map(t=>[t,0])),qualified=Object.fromEntries(teams.map(t=>[t,0]));
    const base=[[[0,3],[1,2]],[[0,2],[3,1]],[[0,1],[2,3]]];
    const pairKey=pairs=>pairs.map(([a,b])=>[a,b].sort().join('|')).sort().join(';');
    const fixed=rounds.map(round=>{const pairs=options.fixtures?.[round];if(!pairs?.length)return null;const index=base.findIndex(layout=>pairKey(layout.map(([a,b])=>[teams[a],teams[b]]))===pairKey(pairs));if(index<0)throw Error('Official ECL matchday needs two distinct group fixtures.');return index;});
    if(new Set(fixed.filter(i=>i!==null)).size!==fixed.filter(i=>i!==null).length)throw Error('ECL group fixtures repeat an opponent.');
    const samples=rounds.map((round,d)=>{
      const scores=options.scores?.[round]||{},known=teams.filter(t=>Number.isFinite(scores[t]));
      if(known.length&&(known.length!==4||fixed[d]===null))throw Error('ECL results need complete scores and official matchday pairings.');
      return Object.fromEntries(teams.map(t=>[t,known.length?Array(n).fill(scores[t]):sample(t,n,rng(key+'|'+t+'|'+round),round)]));
    });
    if(samples.some(day=>teams.some(t=>day[t].length!==n||!day[t].every(Number.isFinite))))throw Error('ECL sampling produced invalid scores.');
    // Each team plays every other team once; match-order uncertainty is
    // averaged until official matchday pairings are entered. Never fixtures.
    for(let i=0;i<n;i++){
      const pts=[0,0,0,0],scoreFor=[0,0,0,0];
      const remaining=base.map((_,i)=>i).filter(i=>!fixed.includes(i));for(let j=remaining.length-1;j>0;j--){const k=Math.floor(random()*(j+1));[remaining[j],remaining[k]]=[remaining[k],remaining[j]];}
      const matchdays=fixed.map(index=>base[index===null?remaining.pop():index]);
      for(let d=0;d<3;d++)for(const [a,b]of matchdays[d]){const sa=samples[d][teams[a]][i],sb=samples[d][teams[b]][i];scoreFor[a]+=sa;scoreFor[b]+=sb;if(sa>sb)pts[a]+=3;else if(sb>sa)pts[b]+=3;else{pts[a]++;pts[b]++;}}
      const rank=teams.map((t,j)=>({t,points:pts[j],score:scoreFor[j],tie:random()})).sort((a,b)=>b.points-a.points||b.score-a.score||a.tie-b.tie);counts[rank[0].t]++;qualified[rank[0].t]++;qualified[rank[1].t]++;
    }
    return teams.map(team=>({team,pct:100*counts[team]/n,qualifyPct:100*qualified[team]/n}));
  }
  return {VERSION,ORDER,rng,validate,nextSlot,commit,slots,winnerProbabilities};
});
