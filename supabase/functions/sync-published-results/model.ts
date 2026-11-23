export function validateSnapshot(league: Record<string, unknown>, roddy: Record<string, unknown>, futures: any, dates: Record<string, unknown>) {
  const teams=Object.keys(league).sort();
  if(teams.length!==66||JSON.stringify(teams)!==JSON.stringify(Object.keys(roddy).sort()))throw Error('Published score fields differ');
  for(const table of [league,roddy])for(const name of teams){
    const values=table[name];
    if(!Array.isArray(values)||values.length!==26||values.some(v=>v!==null&&(!Number.isInteger(v)||v<0||v>200)))throw Error('Invalid published scores');
  }
  const expected=teams.map(name=>[name,league[name],roddy[name]]);
  if(JSON.stringify(expected)!==JSON.stringify(futures?.futures_refresh?.source_scores))throw Error('Published scores and futures are not one snapshot');
  const coverage=futures?.futures_refresh?.coverage;
  if(!Array.isArray(coverage)||!['ELIZA CUP (D1)','DIVISION 2A','DIVISION 2B','DIVISION 3A','DIVISION 3B','RODDY','FA CUP','ECL'].every(key=>coverage.includes(key)))throw Error('Incomplete futures refresh');
  if(Object.keys(dates).length!==26||!Array.from({length:26},(_,i)=>String(i+1)).every(key=>typeof dates[key]==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(dates[key] as string)))throw Error('Invalid published calendar');
  return expected;
}

export function publishedFixtures(roster: Record<string,string[]>, schedule: Record<string,string[][][]>, league: Record<string,unknown>) {
  const names=Object.values(roster).flat();
  if(names.length!==66||new Set(names).size!==66||JSON.stringify([...names].sort())!==JSON.stringify(Object.keys(league).sort()))throw Error('Published fixture roster differs');
  const fixtures=[];
  for(const [division,teams] of Object.entries(roster)){
    const rounds=schedule[division];if(!Array.isArray(rounds)||rounds.length!==26)throw Error('Incomplete official schedule');
    for(let i=0;i<26;i++){
      const pairs=rounds[i];if(!Array.isArray(pairs))throw Error('Invalid official schedule');
      const expected=division.startsWith('ELIZA')||(i>=1&&i<=22)?teams:[];
      if(JSON.stringify(pairs.flat().slice().sort())!==JSON.stringify([...expected].sort()))throw Error('Incomplete official fixture round');
      for(const pair of pairs){if(pair.length!==2||pair[0]===pair[1])throw Error('Invalid official pairing');fixtures.push({round:i+1,section:division.startsWith('ELIZA')?'ELIZA':division.startsWith('DIVISION 2')?'DIV2':'DIV3',a:pair[0],b:pair[1]});}
    }
  }
  return fixtures;
}
