/* Public, read-only fixture cards and social image export. No account or betting APIs. */
(function(root){
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const price = value => Number.isFinite(Number(value)) && Number(value)>1 ? (Math.abs(Number(value)-Math.round(Number(value)*100)/100)>1e-9?String(Number(value)):Number(value).toFixed(2)) : '—';
  function ordinary(q){
    if(!q || q.bettable===false || q.pricingReview)return null;
    const n=Number(q.baseOdds || Math.min(...(q.prices || [q.odds]).map(Number)));
    return Number.isFinite(n)&&n>1?n:null;
  }
  function safeBook(rows){
    const values=rows.map(ordinary);
    return values.every(v=>v!==null) && values.reduce((sum,n)=>sum+1/n,0)>=1 ? values : null;
  }
  function handicap(q,team,round){
    const prefix='R'+round+': '+team+' ';
    if(typeof q?.label!=='string'||!q.label.startsWith(prefix))return null;
    const suffix=q.label.slice(prefix.length).trim();
    if(!/^[+-]\d+\.5$/.test(suffix))return null;
    return Number(suffix);
  }
  function fixturePrices(teamA,teamB,round,quotes){
    const result={a:null,b:null,draw:null,ha:null,hb:null,lineA:null,lineB:null};
    const suffix='|R'+round+'|'+teamA+'|'+teamB, reverse='|R'+round+'|'+teamB+'|'+teamA;
    const sides=[['res-a','res-b'],['res-b','res-a'],['res-draw','res-draw']];
    // Keep a paused quote paused, even if the reverse orientation still has an old price.
    const options=sides.map(([a,b])=>[quotes.get('H2H|'+a+suffix),quotes.get('H2H|'+b+reverse)]);
    if(!options.flat().some(q=>q&&(q.bettable===false||q.pricingReview))){
      const book=safeBook(options.map(list=>list.find(Boolean)));
      if(book)[result.a,result.b,result.draw]=book;
    }
    // Handicap labels carry the actual line. Never infer it from a newly recomputed model.
    for(const [suf,a,b,flipped] of [[suffix,teamA,teamB,false],[reverse,teamB,teamA,true]]){
      const aRows=['fav','dog'].map(type=>quotes.get('H2H|hcap-a-'+type+suf)).filter(Boolean);
      const bRows=['fav','dog'].map(type=>quotes.get('H2H|hcap-b-'+type+suf)).filter(Boolean);
      if([...aRows,...bRows].some(q=>q.bettable===false||q.pricingReview))return result;
      // Multiple lines in one orientation are ambiguous: wait for a fresh board.
      if(aRows.length!==1||bRows.length!==1)continue;
      const la=handicap(aRows[0],a,round),lb=handicap(bRows[0],b,round),book=safeBook([aRows[0],bRows[0]]);
      if(la===null||lb===null||Math.abs(la+lb)>1e-9||!book)continue;
      [result.ha,result.hb]=flipped?[book[1],book[0]]:book;
      [result.lineA,result.lineB]=flipped?[lb,la]:[la,lb];
      return result;
    }
    return result;
  }
  function fixtureGroups({divisions,schedule,round,confirmed,noFixtures,cupFixtures}){
    const groups=[];
    for(const division of divisions){
      if(!confirmed(division,round)||noFixtures(division,round))continue;
      const fixtures=(schedule[division]?.[round-1]||[]).filter(p=>Array.isArray(p)&&p.length===2&&p.every(t=>typeof t==='string'&&!t.startsWith('MR MEDIAN'))).map(([teamA,teamB])=>({teamA,teamB}));
      if(fixtures.length)groups.push({name:division,fixtures});
    }
    for(const name of ['FA CUP','ECL']){
      const seen=new Set(),fixtures=[];
      for(const f of cupFixtures[name]||[]){
        if(Number(f.round)!==round||!f.teamA||!f.teamB||f.teamA===f.teamB)continue;
        const key=[f.teamA,f.teamB].sort().join('|');
        if(seen.has(key))continue;seen.add(key);fixtures.push({teamA:f.teamA,teamB:f.teamB,stage:f.stage||''});
      }
      if(fixtures.length)groups.push({name,fixtures});
    }
    return groups;
  }
  const line = n => n===null?'—':(n>0?'+':'')+n.toFixed(1);
  function modelCard(f){
    return `<article class="fs-card"><div class="fs-columns"><span>TEAM</span><span>WIN</span><span>HANDICAP</span></div>${['A','B'].map((side,i)=>{
      const p=f.prices,key=i?'b':'a',hk=i?'hb':'ha',lk=i?'lineB':'lineA';
      return `<div class="fs-team"><div class="fs-name">${f['logo'+side]||''}<span>${escape(f['team'+side])}</span></div><strong class="fs-win">${price(p[key])}</strong><div class="fs-hcap"><span>${line(p[lk])}</span><strong>${price(p[hk])}</strong></div></div>`;
    }).join('')}<div class="fs-draw"><span>DRAW <strong>${price(f.prices.draw)}</strong></span>${f.stage?`<span>${escape(f.stage)}</span>`:''}</div></article>`;
  }
  function imagePages(group){
    const pages=[];for(let i=0;i<group.fixtures.length;i+=7)pages.push({...group,fixtures:group.fixtures.slice(i,i+7)});return pages;
  }
  function socialUrl(base,round,competition){
    const url=new URL(base);url.search='';url.hash='';url.searchParams.set('round',round);
    if(competition&&competition!=='ALL')url.searchParams.set('competition',competition);
    return url.href;
  }
  function mount(container,model){
    const params=new URLSearchParams(location.search);
    let competition=params.get('competition')||'ALL';
    const options=['ALL',...model.groups.map(g=>g.name)];if(!options.includes(competition))competition='ALL';
    const groups=competition==='ALL'?model.groups:model.groups.filter(g=>g.name===competition);
    document.body.classList.add('fixture-share-mode');
    document.title='Round '+model.round+' fixtures & odds · Bilbbet';
    container.innerHTML=`<main class="fs-shell"><nav class="fs-toolbar"><a href="./">← Bilbbet</a><div><button id="fs-copy">Copy page link</button><button id="fs-share">Share page</button></div></nav><header class="fs-hero"><div class="fs-kicker">BILBBET / THE WEEKLY MATCH CARD</div><h1>Round <span>${model.round}.</span><br>Pick your side.</h1><p>Every matchup. Both sides of the line.</p><div class="fs-meta"><span>${model.closed?'ROUND CLOSED · REFERENCE PRICES':'PUBLISHED ORDINARY PRICES'}</span><span>${escape(model.timestamp.label)}</span></div></header><section class="fs-controls" aria-label="Fixture filters"><label>ROUND <select id="fs-round">${Array.from({length:26},(_,i)=>`<option value="${i+1}" ${i+1===model.round?'selected':''}>Round ${i+1}</option>`).join('')}</select></label><label>COMPETITION <select id="fs-competition">${options.map(name=>`<option value="${escape(name)}" ${name===competition?'selected':''}>${escape(name==='ALL'?'All competitions':name.replace(' (D1)',''))}</option>`).join('')}</select></label></section><p id="fs-message" role="status">${escape(model.error||'Download an image for your post, or share this page link.')}</p><div class="fs-groups ${competition==='ALL'?'fs-groups-all':''}">${groups.length?groups.map((g,i)=>`<section class="fs-group" data-competition="${escape(g.name)}"><div class="fs-group-heading"><div><span class="fs-kicker">ROUND ${model.round} · ${g.fixtures.length} MATCHES</span><h2>${escape(g.name.replace(' (D1)',''))}</h2></div><button data-fs-image="${i}">Download ${g.fixtures.length>7?'images':'image'} ↓</button></div>${g.fixtures.map(modelCard).join('')}</section>`).join(''):'<section class="fs-empty"><h2>No confirmed fixtures for this round yet.</h2><p>Choose another round or check back after the official draw.</p></section>'}</div><footer class="fs-footer"><strong>BILBBET</strong><p>Win prices are three-way H2H prices: a tie pays the draw. Handicap prices include the signed score adjustment shown beside each team. These are not advancement prices.</p><p>Decimal odds · Ordinary prices include the usual margin; boosts excluded. — means no available published price. Images are timestamped snapshots; the page loads current published prices when opened. Check Bilbbet for current availability before placing a bet.</p><a href="./">Free fantasy fun. Join the action on Bilbbet →</a></footer></main>`;
    const message=text=>{document.getElementById('fs-message').textContent=text;};
    const url=()=>socialUrl(location.href,model.round,competition);
    document.getElementById('fs-round').onchange=e=>location.assign(socialUrl(location.href,Number(e.target.value),competition));
    document.getElementById('fs-competition').onchange=e=>location.assign(socialUrl(location.href,model.round,e.target.value));
    document.getElementById('fs-copy').onclick=async()=>{
      try{await navigator.clipboard.writeText(url());message('Link copied. Ready to paste into your post.');}
      catch(e){message('Copy this link: '+url());}
    };
    document.getElementById('fs-share').onclick=async()=>{
      try{if(navigator.share)await navigator.share({title:document.title,text:'Round '+model.round+' fixtures, H2H odds and handicaps on Bilbbet',url:url()});else await navigator.clipboard.writeText(url());message('Page ready to share.');}
      catch(e){if(e.name!=='AbortError')message('Use Copy page link to share this page.');}
    };
    container.querySelectorAll('[data-fs-image]').forEach(button=>button.onclick=async()=>{
      button.disabled=true;message('Preparing image…');
      try{
        const group=groups[Number(button.dataset.fsImage)],pages=imagePages(group),files=[];
        for(let i=0;i<pages.length;i++){
          const blob=await drawImage(pages[i],model,i+1,pages.length);
          const name='bilbbet-R'+model.round+'-'+group.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-'+model.timestamp.filename+(pages.length>1?'-'+(i+1):'')+'.png';
          files.push({blob,name});
        }
        const filePanel=document.createElement('div');filePanel.className='fs-downloads';
        filePanel.innerHTML='<strong>Your image'+(files.length>1?'s are':' is')+' ready</strong><span>Save the image, then attach it to your social post.</span>';
        for(const file of files){
          const objectUrl=URL.createObjectURL(file.blob),a=document.createElement('a');a.href=objectUrl;a.download=file.name;a.textContent='Save '+file.name;a.target='_blank';a.rel='noopener';filePanel.appendChild(a);
          // Keep links usable until page unload, including iOS open-image fallback.
        }
        button.closest('.fs-group').querySelector('.fs-downloads')?.remove();button.closest('.fs-group').appendChild(filePanel);
        if(files.length===1)filePanel.querySelector('a').click();
        message('Image ready. If it opens in a new tab, save it to Photos.');
      }catch(e){message('Image export failed. You can still copy the page link. '+e.message);}
      finally{button.disabled=false;}
    });
  }
  async function drawImage(group,model,page,pages){
    const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=410+group.fixtures.length*210;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas is unavailable');
    const text=(value,x,y,size,color='#f5f5f5',weight=600)=>{ctx.font=weight+' '+size+'px system-ui, sans-serif';ctx.fillStyle=color;ctx.fillText(value,x,y);};
    const fit=(value,x,y,width,size,color,weight=600)=>{while(size>18){ctx.font=weight+' '+size+'px system-ui, sans-serif';if(ctx.measureText(value).width<=width)break;size--;}text(value,x,y,size,color,weight);};
    ctx.fillStyle='#0e1420';ctx.fillRect(0,0,1080,canvas.height);ctx.fillStyle='#ffdd00';ctx.fillRect(0,0,1080,12);
    text('BILBBET',48,75,38,'#ffdd00',900);text('ROUND '+model.round+' / MATCH CARD',48,124,23,'#98a8bc',700);
    fit(group.name.replace(' (D1)',''),48,189,970,48,'#ffffff',900);
    text(model.closed?'ROUND CLOSED · REFERENCE PRICES':'ORDINARY H2H ODDS + HANDICAPS',48,236,21,'#51dfc6',700);
    text('TEAM',58,283,17,'#98a8bc');text('WIN',712,283,17,'#98a8bc');text('HANDICAP / PRICE',835,283,17,'#98a8bc');
    for(let i=0;i<group.fixtures.length;i++){
      const f=group.fixtures[i],y=300+i*210,p=f.prices;
      ctx.fillStyle=i%2?'#192437':'#162031';ctx.fillRect(40,y,1000,196);
      for(let side=0;side<2;side++){
        const team=side?f.teamB:f.teamA,baseline=y+49+side*69;
        const logo=await logoImage(f[side?'logoB':'logoA']);
        if(logo)ctx.drawImage(logo,59,baseline-31,36,36);
        fit(team,109,baseline,560,29,'#f5f5f5',700);
        text(price(p[side?'b':'a']),700,baseline,32,'#ffdd00',800);
        text(line(p[side?'lineB':'lineA']),827,baseline,25,'#aabbd0');
        text(price(p[side?'hb':'ha']),925,baseline,27,'#51dfc6',800);
      }
      text('DRAW  '+price(p.draw),109,y+167,21,'#aabbd0',600);
    }
    const foot=canvas.height-96;
    text(model.timestamp.label.replace(' (Australia/Sydney)',''),48,foot,20,'#aabbd0');
    text('Three-way win odds · Not advancement · Boosts excluded · — unavailable',48,foot+30,18,'#aabbd0',400);
    text('bilbo443.github.io/BILBBET',48,foot+63,22,'#ffdd00',700);
    if(pages>1)text(page+' / '+pages,960,foot+63,22,'#aabbd0');
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not create image')),'image/png'));
  }
  function logoImage(html){
    const imageSrc=/\bsrc="([^"]+)"/.exec(html||'')?.[1];if(!imageSrc)return Promise.resolve(null);
    return new Promise(resolve=>{const image=new Image();let finished=false;
      const done=result=>{if(!finished){finished=true;clearTimeout(timer);resolve(result);}};
      const timer=setTimeout(()=>done(null),1500);
      image.onload=()=>done(image);image.onerror=()=>done(null);image.src=imageSrc.replace(/&amp;/g,'&');
    });
  }
  root.BilbbetFixtureShare={ordinary,safeBook,handicap,fixturePrices,fixtureGroups,modelCard,imagePages,socialUrl,mount,drawImage};
})(typeof window==='undefined'?globalThis:window);
