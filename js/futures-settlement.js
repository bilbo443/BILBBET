(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BilbbetFuturesSettlement=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const proof=(result,reason)=>({result,reason});
  function bounds(rows,team,k){
    if(!Number.isInteger(k)||k<1||k>=rows.length||!rows.some(r=>r.team===team))return null;
    const row=rows.find(r=>r.team===team),other=rows.filter(r=>r.team!==team);
    if(rows.every(r=>r.remaining===0)){
      const above=other.filter(r=>r.points>row.points||(r.points===row.points&&r.scoreFor>row.scoreFor)).length;
      const equal=other.filter(r=>r.points===row.points&&r.scoreFor===row.scoreFor).length;
      if(above>=k)return proof('LOST',team+' finished outside the top '+k+'; '+above+' teams rank strictly above it.');
      if(above+equal<k)return proof('WON',team+' is guaranteed a top '+k+' finish on the completed table.');
      return null; // An unresolved cutoff tie is never broken alphabetically.
    }
    const max=row.points+3*row.remaining,above=other.filter(r=>r.points>max).length;
    if(above>=k)return proof('LOST',team+' can reach at most '+max+' league points; '+above+' teams already have more. Top '+k+' is impossible.');
    const threats=other.filter(r=>r.points+3*r.remaining>=row.points).length;
    if(threats<k)return proof('WON',team+' has '+row.points+' league points; only '+threats+' other teams can still match or exceed that total. Top '+k+' is assured.');
    return null;
  }
  function invert(p){return p&&{...p,result:p.result==='WON'?'LOST':'WON'};}
  function table(teams,fixtures,c,expected){
    if(!teams?.length||new Set(teams).size!==teams.length)return null;
    const rows=new Map(teams.map(team=>[team,{team,points:0,scoreFor:0,remaining:0,games:0}])),seen=new Set();
    for(const f of fixtures){
      const {a,b,round}=f,key=round+'|'+[a,b].sort().join('|');
      if(!rows.has(a)||!rows.has(b)||a===b||!Number.isInteger(round)||seen.has(key))return null;
      if(seen.has(round+'|'+a)||seen.has(round+'|'+b))return null;
      seen.add(key);seen.add(round+'|'+a);seen.add(round+'|'+b);
      const x=rows.get(a),y=rows.get(b),sa=c.scores[a]?.[round-1],sb=c.scores[b]?.[round-1];x.games++;y.games++;
      if(c.isFinal(round)&&Number.isFinite(sa)&&Number.isFinite(sb)){
        x.scoreFor+=sa;y.scoreFor+=sb;x.points+=sa>sb?3:sa===sb?1:0;y.points+=sb>sa?3:sa===sb?1:0;
      }else{x.remaining++;y.remaining++;}
    }
    return [...rows.values()].every(r=>r.games===expected)?[...rows.values()]:null;
  }
  function division(parts,c){
    const [,div,market,team]=parts,teams=c.divisions[div];if(!teams?.includes(team)||parts.length!==4)return null;
    const end=div==='ELIZA CUP (D1)'?26:23,start=div==='ELIZA CUP (D1)'?1:2,fixtures=[];
    for(let r=start;r<=end;r++){
      const pairs=c.schedule[div]?.[r-1];if(!c.confirmed(div,r)||!Array.isArray(pairs)||pairs.length*2!==teams.length)return null;
      for(const [a,b] of pairs)fixtures.push({a,b,round:r});
    }
    const rows=table(teams,fixtures,c,end-start+1);if(!rows)return null;
    let k,negative=false;
    if(market==='promotion_pct'){
      const rules=c.rules.promotion_rules?.[div];if(!rules)return null;
      const auto=bounds(rows,team,rules.automatic_places);
      if(auto?.result==='WON')return {...auto,reason:'Automatic promotion assured. '+auto.reason};
      const finals=bounds(rows,team,rules.finals_qualifiers);
      return finals?.result==='LOST'?{...finals,reason:'Cannot reach the promotion finals. '+finals.reason}:null;
    }
    if(market==='win_div_pct')k=1;
    else if(market==='wooden_spoon_pct'){k=teams.length-1;negative=true;}
    else if(market==='bottom3_pct'){k=teams.length-3;negative=true;}
    else if(market==='relegation_pct'){
      if(!['ELIZA CUP (D1)','DIVISION 2A','DIVISION 2B'].includes(div))return null;
      k=teams.length-(div==='ELIZA CUP (D1)'?4:3);negative=true;
    }else if(market==='bottom_half_pct'){k=Math.floor(teams.length/2);negative=true;}
    else if(market==='top_half_pct'||market==='miss_top_half_pct'){k=Math.floor(teams.length/2);negative=market.startsWith('miss_');}
    else{const match=/^(miss_)?top(\d+)_pct$/.exec(market);if(!match)return null;k=Number(match[2]);negative=!!match[1];}
    const result=bounds(rows,team,k);return negative?invert(result):result;
  }
  function roddy(parts,c){
    const [,scope,market,team]=parts,teams=Object.values(c.divisions).flat();if(scope!=='RODDY'||!teams.includes(team)||parts.length!==4)return null;
    // No official maximum weekly fantasy score: never turn an estimated score
    // ceiling or a 1001 price into an early Roddy mathematical elimination.
    if(!Array.from({length:26},(_,i)=>i+1).every(r=>c.isFinal(r)&&teams.every(t=>Number.isFinite(c.roddy[t]?.[r-1]))))return null;
    const rows=teams.map(t=>({team:t,points:c.roddy[t].slice(0,26).reduce((s,n)=>s+n,0),scoreFor:0,remaining:0}));
    let k,negative=false;if(market==='roddy_win_pct')k=1;
    else{const m=/^roddy_(miss_)?top(3|5|10)_pct$/.exec(market);if(!m)return null;k=Number(m[2]);negative=!!m[1];}
    const result=bounds(rows,team,k);if(result)result.reason='Final Roddy score table. '+result.reason;return negative?invert(result):result;
  }
  function cup(parts,c){
    const [,market,team]=parts;if(parts.length!==3||!Object.values(c.divisions).flat().includes(team))return null;
    const target={reach_r32_pct:1,reach_r16_pct:2,reach_qf_pct:3,reach_sf_pct:4,reach_final_pct:5,win_pct:6}[market];if(!target)return null;
    const draw=c.faCup||{},stages=[
      [0,draw.preliminary_round,draw.preliminary,draw.preliminary_winners,draw.preliminary_results_final],
      [1,draw.round_of_64_round,draw.r64_matches,draw.r64_winners,false],
      [2,draw.round_of_32_round,draw.r32_matches,draw.r32_winners,false],
      [3,draw.round_of_16_round,draw.r16_matches,draw.r16_winners,false],
      [4,draw.quarter_final_round,draw.qf_matches,draw.qf_winners,false],
      [5,draw.semi_final_round,draw.sf_matches,draw.sf_winners,false],
      [6,draw.final_round,draw.final_matches,draw.final_winners,false]
    ];
    let reached=-1,eliminated=null;
    for(const [stage,round,pairs,winners,organiserFinal] of stages){
      if(!Array.isArray(pairs)||!Array.isArray(winners)||pairs.length!==winners.length)continue;
      if(pairs.flat().some(t=>typeof t!=='string')||new Set(pairs.flat()).size!==pairs.length*2)return null;
      for(let i=0;i<pairs.length;i++){
        const [a,b]=pairs[i],winner=winners[i];if(![a,b].includes(team)||![a,b].includes(winner))continue;
        if(!organiserFinal){
          if(!c.isFinal(Number(round)))continue;
          let sa=c.scores[a]?.[round-1],sb=c.scores[b]?.[round-1];
          if(Number.isFinite(sa)&&sa===sb){
            const key=['preliminary_replays','r64_replays','r32_replays','r16_replays','qf_replays','sf_replays','final_replays'][stage];
            const replays=(draw[key]||[]).filter(f=>Number(f.original_round)===Number(round)&&[a,b].includes(f.teamA)&&[a,b].includes(f.teamB)&&f.teamA!==f.teamB);
            if(replays.length!==1||!c.isFinal(Number(replays[0].round)))continue;
            sa=c.scores[a]?.[Number(replays[0].round)-1];sb=c.scores[b]?.[Number(replays[0].round)-1];
          }
          if(!Number.isFinite(sa)||!Number.isFinite(sb)||sa===sb||(sa>sb?a:b)!==winner)continue;
        }
        if(winner===team)reached=Math.max(reached,stage);else eliminated=stage;
      }
    }
    // Already reaching a stage remains a win even if eliminated later.
    if(reached>=target)return proof('WON',team+' has confirmed advancement through the FA Cup stage required by this bet.');
    if(eliminated!==null&&eliminated<=target)return proof('LOST',team+' was eliminated from the FA Cup before achieving this bet. Confirmed winner and result verified; unresolved ties/replays remain pending.');
    return null;
  }
  function ecl(parts,c){
    const groupPick=parts[0]==='ECLGROUP',team=parts[2],market=groupPick?'group_win':parts[1];if(parts.length!==3)return null;
    const rules=c.rules.ecl_rules,group=groupPick?parts[1]:Object.keys(c.groups||{}).find(g=>(c.groups[g]||[]).includes(team));
    const teams=c.groups?.[group];if(!rules||teams?.length!==4||!teams.includes(team))return null;
    const fixtures=(c.eclFixtures||[]).filter(f=>rules.group_matchdays.includes(Number(f.round))&&teams.includes(f.teamA)&&teams.includes(f.teamB)).map(f=>({a:f.teamA,b:f.teamB,round:Number(f.round)}));
    if(fixtures.length!==6||new Set(fixtures.map(f=>[f.a,f.b].sort().join('|'))).size!==6)return null;
    const rows=table(teams,fixtures,c,3);if(!rows)return null;
    const qualified=bounds(rows,team,2);
    if(groupPick)return bounds(rows,team,1);
    if(market==='reach_knockout_pct')return qualified;
    if(!['win_pct','reach_sf_pct','reach_final_pct'].includes(market))return null;
    if(qualified?.result==='LOST')return {...qualified,reason:'Eliminated from ECL group qualification. '+qualified.reason};
    // Six qualifiers include semi-final byes. Only actual confirmed knockout
    // pairings/results can establish later advancement; table rank is not a bye.
    for(const [round,reached] of [[rules.quarter_final_round,'sf'],[rules.semi_final_round,'final'],[rules.final_round,'winner']]){
      for(const f of c.eclFixtures||[]){
        if(Number(f.round)!==round||![f.teamA,f.teamB].includes(team)||!c.isFinal(round))continue;
        const a=c.scores[f.teamA]?.[round-1],b=c.scores[f.teamB]?.[round-1];if(!Number.isFinite(a)||!Number.isFinite(b)||a===b)continue;
        const won=(a>b?f.teamA:f.teamB)===team;
        const needed=market==='reach_sf_pct'?0:market==='reach_final_pct'?1:2,index={sf:0,final:1,winner:2}[reached];
        if(won&&index>=needed)return proof('WON',team+' has achieved the required ECL knockout advancement on a confirmed result.');
      }
    }
    for(const f of c.eclFixtures||[]){
      const round=Number(f.round),index=[rules.quarter_final_round,rules.semi_final_round,rules.final_round].indexOf(round);
      if(index<0||![f.teamA,f.teamB].includes(team)||!c.isFinal(round))continue;
      const a=c.scores[f.teamA]?.[round-1],b=c.scores[f.teamB]?.[round-1];if(!Number.isFinite(a)||!Number.isFinite(b)||a===b)continue;
      const needed=market==='reach_sf_pct'?0:market==='reach_final_pct'?1:2;
      if(index<=needed&&(a>b?f.teamA:f.teamB)!==team)return proof('LOST',team+' was eliminated in a confirmed ECL knockout match before achieving this bet.');
    }
    return null;
  }
  function suggest(id,c){
    if(!c?.publicationVerified||typeof id!=='string')return null;
    const p=id.split('|');
    if(p[0]==='FUT')return p[1]==='RODDY'?roddy(p,c):division(p,c);
    if(p[0]==='FACUP')return cup(p,c);
    if(p[0]==='ECL'||p[0]==='ECLGROUP')return ecl(p,c);
    return null;
  }
  function aggregate(selections,getProof){
    const results=selections.map(s=>s.result&&s.result!=='PENDING'?{result:s.result}:getProof(s.id));
    if(results.some(r=>r?.result==='LOST'))return 'LOST';
    if(results.length&&results.every(r=>['WON','VOID'].includes(r?.result)))return results.every(r=>r.result==='VOID')?'VOID':'WON';
    return null;
  }
  return {suggest,bounds,aggregate};
});
