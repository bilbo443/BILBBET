(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./ecl-draw.js'):root.BilbbetEcl);if(typeof module==='object'&&module.exports)module.exports=api;else root.BilbbetEclSheet=api;})(typeof globalThis!=='undefined'?globalThis:this,function(Ecl){
  'use strict';
  const norm=value=>String(value||'').trim().replace(/\s+/g,' ').toUpperCase();
  function validate(snapshot){
    const m=snapshot.model;
    if(snapshot.schema_version!==2||!m||m.model_version!==Ecl.VERSION||m.season!=='2026-27'||m.price_margin!==.05)throw Error('Download fresh ECL calculator data from Bilbbet (schema 2 required).');
    if(!Number.isFinite(Date.parse(snapshot.exported_at_utc))||!Array.isArray(m.form_rounds)||!Number.isInteger(m.current_round))throw Error('Missing snapshot date or form rounds.');
    if(!Array.isArray(m.teams)||m.teams.length!==12||new Set(m.teams.map(t=>t.id)).size!==12||m.teams.some(t=>!/^\d{3}$/.test(t.id)||!t.name||![1,2].includes(t.pot)))throw Error('Invalid ECL team registry.');
    Ecl.validate(m.teams.map(t=>t.id),m.teams.filter(t=>t.pot===1).map(t=>t.id),{});
    if(!Array.isArray(m.rules?.group_matchdays)||m.rules.group_matchdays.join(',')!=='8,10,13'||!Array.isArray(m.fixtures))throw Error('Unsupported ECL schedule.');
    const d=m.data;
    for(const key of ['h2h_history','h2h_cup_shift','h2h_variance_widen','team_strength_tiers','roddy_results','real_results','h2h_divisions'])if(!d?.[key]||typeof d[key]!=='object')throw Error('Missing model input: '+key);
    const active=Object.values(d.h2h_divisions).flat();
    for(const t of m.teams)if(!active.includes(t.name))throw Error('ECL entrant missing from division roster: '+t.name);
    for(const values of Object.values(d.h2h_history))if(!Array.isArray(values)||!values.length||!values.every(Number.isFinite))throw Error('Invalid scoring history.');
    return m;
  }
  function resolver(m){
    const map=new Map();
    for(const t of m.teams)for(const name of [t.name,...t.aliases||[]]){
      const key=norm(name);if(!key)continue;
      if(map.has(key)&&map.get(key)!==t.id)throw Error('Ambiguous team alias: '+name);
      map.set(key,t.id);
    }
    return value=>{const key=norm(value);if(!key)return null;if(!map.has(key))throw Error('Unknown ECL team: '+value);return map.get(key);};
  }
  function readDraw(m,blocks){
    const resolve=resolver(m),groups={};
    for(const g of ['A','B','C']){
      if(!Array.isArray(blocks[g])||blocks[g].length!==4)throw Error('Group '+g+' needs four input rows.');
      const rows=blocks[g].map((cells,i)=>{
        const texts=cells.filter(v=>typeof v==='string'&&v.trim());
        const ids=texts.map(resolve);
        if(ids.length>1)throw Error('Group '+g+', slot '+(i+1)+': enter one team only.');
        return ids[0]||null;
      });
      groups[g]=[rows[3],rows[0],rows[1],rows[2]];
    }
    Ecl.validate(m.teams.map(t=>t.id),m.teams.filter(t=>t.pot===1).map(t=>t.id),groups);
    return groups;
  }
  function shifted(values,shift,widen,wide){
    let pool=values.map(v=>Math.round(v+shift));
    const random=Ecl.rng(['h2h-wide-v2',values.length,shift,widen,wide?.length||0].join('|'));
    if(widen>0&&wide?.length){const n=Math.max(1,Math.min(Math.round(pool.length*widen/Math.max(1-widen,.05)),wide.length));pool=pool.concat(Array.from({length:n},()=>wide[Math.floor(random()*wide.length)]));}
    const sample=(n,rng)=>Array.from({length:n},()=>pool[Math.floor(rng()*pool.length)]);
    sample.mean=pool.reduce((a,b)=>a+b,0)/pool.length;return sample;
  }
  function odds(pct){if(pct<=0)return 1001;let raw=1/(pct/100*1.05);if(raw<1.0025)return null;return Math.max(1.005,Math.min(1001,Math.round(Math.max(1.005,Math.min(1001,raw))*100)/100));}
  function project(m,groups,g){
    const ids=Ecl.slots(groups[g]||[]),byId=new Map(m.teams.map(t=>[t.id,t]));
    if(ids.some(t=>!t))return [];
    const d=m.data,h=d.h2h_history,all=Object.values(h).flat(),tiers=d.team_strength_tiers;
    const resolve=resolver(m),fixtures={},scores={};
    const fixtureRows=m.fixtures.filter(f=>m.rules.group_matchdays.includes(Number(f.round))).map(f=>{
      try{return [Number(f.round),resolve(f.teamA),resolve(f.teamB)];}catch(e){throw Error('Unknown team in official ECL fixture.');}
    }).filter(f=>ids.includes(f[1])&&ids.includes(f[2])).map(([r,a,b])=>[r,...[a,b].sort()]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const stored=groups[g].filter(Boolean);
    const inputs=stored.map(id=>{const name=byId.get(id).name,entry=tiers.teams?.[id];return [id,h[name],d.h2h_cup_shift[name],d.h2h_variance_widen[name],d.roddy_results?.[name],entry,tiers.weekly_score_anchors?.[entry?.tier]];});
    const known=m.rules.group_matchdays.filter(r=>r<m.current_round).map(r=>[r,stored.map(id=>d.real_results[byId.get(id).name]?.[r-1])]);
    const text=JSON.stringify([Ecl.VERSION,stored,inputs,all,tiers.enabled,m.rules.group_matchdays,known,fixtureRows]);
    let hash=2166136261;for(const c of text){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619);}const key=(hash>>>0).toString(16);
    for(const round of m.rules.group_matchdays){fixtures[round]=fixtureRows.filter(f=>f[0]===round).map(f=>f.slice(1));if(round<m.current_round)scores[round]=Object.fromEntries(ids.map(id=>[id,d.real_results[byId.get(id).name]?.[round-1]]));}
    const samplers=new Map();
    for(const id of ids){
      const name=byId.get(id).name,values=h[name],entry=tiers.enabled&&tiers.teams?.[id];let sample,prior;
      if(entry){
        if(tiers.season!==m.season)throw Error('Strength tier season differs.');
        const target=Number(tiers.weekly_score_anchors[entry.tier]);if(!Number.isFinite(target)||!values?.length)throw Error('Invalid tier for '+name);
        sample=shifted(values,target-values.reduce((a,b)=>a+b,0)/values.length);prior=sample.mean;
      }else{
        const division=Object.values(d.h2h_divisions).find(teams=>teams.includes(name));
        const wide=division.flatMap(t=>h[t]||[]),shift=d.h2h_cup_shift[name]||0,widen=d.h2h_variance_widen[name]||0;
        const baseline=shifted(all,shift),own=values?shifted(values,shift,widen,wide.length?wide:all):null,w=values?values.length/(values.length+8):0;
        sample=(n,random)=>Array.from({length:n},()=>own&&random()<w?own(1,random)[0]:baseline(1,random)[0]);prior=own?w*own.mean+(1-w)*baseline.mean:baseline.mean;
      }
      samplers.set(id,{sample,prior});
    }
    const source=Object.keys(d.roddy_results).length?d.roddy_results:d.real_results;
    const sample=(id,n,random,round)=>{
      const {sample,prior}=samplers.get(id),name=byId.get(id).name;
      const played=m.form_rounds.filter(r=>r<Math.min(round,m.current_round)).map(r=>source[name]?.[r-1]);
      if(!played.every(Number.isFinite))throw Error('Incomplete form scores for '+name);
      const mean=played.length?played.reduce((a,b)=>a+b,0)/played.length:prior;
      const shift=played.length?Math.max(-12,Math.min(12,played.length/(played.length+8)*(mean-prior))):0;
      return sample(n,random).map(v=>Math.max(0,Math.round(v+shift)));
    };
    return Ecl.winnerProbabilities(ids,sample,{key,rounds:m.rules.group_matchdays,fixtures,scores}).map(r=>({...r,name:byId.get(r.team).name,winOdds:odds(r.pct),qualifyOdds:odds(r.qualifyPct),fingerprint:key})).sort((a,b)=>(a.winOdds??Infinity)-(b.winOdds??Infinity));
  }
  return {validate,resolver,readDraw,project,odds};
});
