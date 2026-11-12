(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BilbbetTeamAbbreviations=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Approved display labels, keyed by permanent internal club ID. Never bet IDs.
  const codes=Object.freeze({
    '001':'DCR','002':'JVZ','005':'TBC','006':'SPO','007':'STE','011':'FVS','012':'GWU',
    '018':'CAS','019':'KAL','020':'SAU','021':'ABW','022':'BCU','024':'DWA','026':'GUW',
    '028':'JFM','029':'MON','030':'NAN','038':'BVN','040':'FFB','041':'HFR','042':'RIO',
    '043':'INT','047':'MAC','049':'VIC','050':'VRL','052':'3DG','053':'AGR','055':'ALB',
    '056':'BMC','057':'BRX','058':'PPU','064':'LAL','065':'LAF','066':'SOL','067':'MCH',
    '068':'RDF','069':'SXI','072':'TWT','073':'TPK','074':'X2S','075':'ABR','076':'BCH',
    '077':'CDH','078':'GWD','079':'DPU','080':'GSH','081':'PAY','083':'ROT','085':'FSC',
    '087':'JEM','088':'TDP','089':'BAL','091':'GLC','092':'STM','094':'SSQ','095':'PID',
    '096':'GRN','097':'SHQ','099':'DRT','100':'QUI','101':'SAB','102':'ESM','103':'RUB',
    '104':'DVS','105':'KRA','106':'CON'
  });
  const normal=value=>String(value||'').trim().replace(/\s+/g,' ').toUpperCase();
  function create(registry){
    if(!Array.isArray(registry))throw Error('Team registry is required for abbreviations.');
    const current=new Map(),aliases=new Map(),ids=new Set(),used=new Set();
    for(const team of registry){
      const id=String(team.id).padStart(3,'0');if(ids.has(id))throw Error('Duplicate internal team ID.');ids.add(id);
      const code=codes[id];
      if(team.status&&team.status!=='INACTIVE'&&code){if(!/^[A-Z0-9]{3}$/.test(code)||used.has(code))throw Error('Duplicate or invalid club abbreviation.');used.add(code);}
      const key=normal(team.name);if(current.has(key))throw Error('Duplicate club name.');
      current.set(key,{team,code});
      for(const old of String(team.prev_names||'').split(',')){
        const alias=normal(old);if(!alias)continue;
        aliases.set(alias,aliases.has(alias)&&aliases.get(alias)!==id?null:id);
      }
    }
    const byId=new Map([...current.values()].map(row=>[String(row.team.id).padStart(3,'0'),row]));
    function row(name){const key=normal(name);return current.get(key)||byId.get(aliases.get(key));}
    return Object.freeze({
      label:name=>row(name)?.code||String(name),
      fullName:name=>row(name)?.team.name||String(name),
      key:()=>[...current.values()].filter(r=>r.team.status&&r.team.status!=='INACTIVE').map(r=>({team:r.team.name,abbreviation:r.code||r.team.name})).sort((a,b)=>a.abbreviation.localeCompare(b.abbreviation)),
      missing:()=>[...current.values()].filter(r=>r.team.status&&r.team.status!=='INACTIVE'&&!r.code).map(r=>r.team.name)
    });
  }
  return {codes,create};
});
