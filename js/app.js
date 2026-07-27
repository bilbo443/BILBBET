(async function(){
  const DATA = {};
  async function loadAllData(){
    const files = ['futures','h2h_history','h2h_divisions','h2h_shift','h2h_schedule','leading_at'];
    const results = await Promise.all(files.map(name => fetch('./data/' + name + '.json').then(r => r.json())));
    files.forEach((name, i) => { DATA[name] = results[i]; });
  }

  try {
    await loadAllData();
  } catch(e) {
    document.getElementById('app').innerHTML = `
      <div style="padding:2rem 1rem;max-width:420px;margin:0 auto;color:#f5f5f5;font-family:system-ui,sans-serif;">
        <h2 style="margin:0 0 8px;">Couldn't load bilbbet</h2>
        <p style="color:#9a9a9a;font-size:14px;">One of the files in <code>/data</code> failed to load (${esc(e.message)}). If you're setting this up from a fresh copy, check every file in the <code>data/</code> folder was uploaded, including any newly added ones -- a single missing or renamed data file stops the whole page from starting.</p>
      </div>`;
    return;
  }

  const FUTURES = DATA.futures;
  const LEADING_AT = DATA.leading_at.leading_at;
  const RODDY_LEADING_AT = DATA.leading_at.roddy_leading_at;
  const H2H_HISTORY = DATA.h2h_history;
  const H2H_DIVISIONS = DATA.h2h_divisions;
  const H2H_SHIFT = DATA.h2h_shift;
  const H2H_SCHEDULE = DATA.h2h_schedule;
  const K = 8;

  const FUTURE_DIVS = Object.keys(FUTURES.divisions);
  const BASE_TABS = [...FUTURE_DIVS, 'RODDY', 'FA CUP', 'ECL', 'H2H', 'SPECIALS', 'STATS', 'MY BETS'];
  function currentTabs(){ return state.user && state.user.isAdmin ? [...BASE_TABS, 'ADMIN'] : BASE_TABS; }

  let state = {
    screen:'main', user:null, error:'', info:'', loginModalOpen:false,
    username:'', pin:'',
    activeTab:'H2H',
    futureMarketTab: FUTURE_DIVS.length ? Object.keys(FUTURES.market_labels)[0] : null,
    teamA:'', teamB:'', h2hRound:1, h2hMarket:null,
    h2hSubTab: FUTURE_DIVS[0], h2hFixtureMarket: null,
    slip:[], stake:50, betMode:'multi',
    myBets:null,
    adminPunters:null, adminBets:null, novelty:null, statsData:null,
    currentRound: 1,       // the next round yet to be played; anything before this is "past"
    leadingAtRound: 1,
  };

  function esc(s){ return String(s).replace(/[&<>"'\x27]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function fmt(n){ return Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2}); }
  function fmtDate(ts){ const d=new Date(ts); return d.toLocaleDateString()+' '+d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); }
  function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
  function simpleHash(s){ let h=0; for(let i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))|0;} return String(h); }

  const memoryStore = {};
  const hasRealStorage = typeof window !== 'undefined' && window.storage && typeof window.storage.get === 'function';
  async function sget(key){
    if(!hasRealStorage) return Object.prototype.hasOwnProperty.call(memoryStore,key) ? JSON.parse(memoryStore[key]) : null;
    try{ const r = await window.storage.get(key, true); return r ? JSON.parse(r.value) : null; }catch(e){ return null; }
  }
  async function sset(key, val){
    if(!hasRealStorage){ memoryStore[key] = JSON.stringify(val); return true; }
    try{ await window.storage.set(key, JSON.stringify(val), true); return true; }catch(e){ return false; }
  }
  async function getIndex(name){ return (await sget(name)) || []; }
  async function addToIndex(name, id){ const list = await getIndex(name); if(!list.includes(id)){ list.push(id); await sset(name, list); } }
  async function getUser(u){ return await sget('bilbbet2_user:' + u.toLowerCase()); }
  async function saveUser(u){ return await sset('bilbbet2_user:' + u.username.toLowerCase(), u); }

  // ---------- H2H sampling model (bootstrap + shrinkage) ----------
  function makeShiftedSampler(values, shift){
    const shifted = values.map(v => Math.round(v + shift));
    const n = shifted.length;
    return function(count){ const out=new Array(count); for(let i=0;i<count;i++){ out[i]=shifted[Math.floor(Math.random()*n)]; } return out; };
  }
  const divSampler = {};
  for(const div in H2H_DIVISIONS){
    let pool = [];
    for(const t of H2H_DIVISIONS[div]){ if(H2H_HISTORY[t]) pool = pool.concat(H2H_HISTORY[t]); }
    divSampler[div] = makeShiftedSampler(pool.length ? pool : [60], 0);
  }
  let allPool = [];
  for(const t in H2H_HISTORY){ allPool = allPool.concat(H2H_HISTORY[t]); }
  const leagueSampler = makeShiftedSampler(allPool, 0);
  const teamInfo = {};
  for(const div in H2H_DIVISIONS){
    for(const t of H2H_DIVISIONS[div]){
      const shift = H2H_SHIFT[t] || 0;
      if(H2H_HISTORY[t]){
        const n = H2H_HISTORY[t].length;
        teamInfo[t] = { own: makeShiftedSampler(H2H_HISTORY[t], shift), w: n/(n+K), baseline: divSampler[div] };
      } else {
        teamInfo[t] = { own: null, w: 0, baseline: makeShiftedSampler(allPool, shift) };
      }
    }
  }
  function sampleTeam(team, n){
    const info = teamInfo[team];
    const out = new Array(n);
    for(let i=0;i<n;i++){ out[i] = (info.own && Math.random()<info.w) ? info.own(1)[0] : info.baseline(1)[0]; }
    return out;
  }
  function percentile(sortedArr, p){
    const idx = (sortedArr.length - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if(lo === hi) return sortedArr[lo];
    return sortedArr[lo] + (sortedArr[hi]-sortedArr[lo])*(idx-lo);
  }
  function computeH2HMarket(teamA, teamB, round, nSims){
    nSims = nSims || 20000;
    const a = sampleTeam(teamA,nSims), b = sampleTeam(teamB,nSims);
    let aWin=0,bWin=0,draw=0; const margins=new Array(nSims);
    for(let i=0;i<nSims;i++){ if(a[i]>b[i]) aWin++; else if(b[i]>a[i]) bWin++; else draw++; margins[i]=a[i]-b[i]; }
    const expMargin = margins.reduce((s,x)=>s+x,0)/nSims;
    const line = Math.floor(expMargin)+0.5;
    let aCovers=0,bCovers=0;
    for(const m of margins){ if(m>line) aCovers++; else bCovers++; }
    // "viable range" -- the middle 50% of simulated outcomes (25th-75th percentile).
    // A consistent team's range is narrow; a volatile team's is wide. Deliberately
    // shown instead of one precise number so a punter has to weigh the shape of the
    // range, not just compare two decimals.
    const aSorted = [...a].sort((x,y)=>x-y), bSorted = [...b].sort((x,y)=>x-y);
    const aRange = [Math.round(percentile(aSorted,0.25)), Math.round(percentile(aSorted,0.75))];
    const bRange = [Math.round(percentile(bSorted,0.25)), Math.round(percentile(bSorted,0.75))];
    return { teamA, teamB, round, aWinPct:aWin/nSims*100, bWinPct:bWin/nSims*100, drawPct:draw/nSims*100,
      aRange, bRange, line, aCoversPct:aCovers/nSims*100, bCoversPct:bCovers/nSims*100 };
  }
  const ODDS_FLOOR = 1.005, ODDS_CAP = 1001, SUSPEND_BELOW = 1.0025;
  function toOdds(pct){
    const p = pct/100;
    if(p<=0) return { odds: ODDS_CAP, suspended:false };
    let raw = 1/(p*1.05);
    if(raw < SUSPEND_BELOW) return { odds:null, suspended:true };
    if(raw < ODDS_FLOOR) raw = ODDS_FLOOR;
    if(raw > ODDS_CAP) raw = ODDS_CAP;
    let odds = Math.round(raw*100)/100;
    if(odds < ODDS_FLOOR) odds = ODDS_FLOOR;   // guards against float rounding (e.g. 1.005*100 !== 100.5 exactly)
    if(odds > ODDS_CAP) odds = ODDS_CAP;
    return { odds, suspended:false };
  }

  // ---------- rendering ----------
  function render(){
    document.getElementById('app').innerHTML = renderMain();
    attachHandlers();
  }

  function renderLoginModal(){
    return `
      <div id="login-modal-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:100;display:flex;align-items:center;justify-content:center;padding:1rem;">
        <div style="max-width:340px;width:100%;">
          <div style="text-align:center;margin-bottom:1rem;">
            <h2 style="margin:0;letter-spacing:0.5px;">bilbbet</h2>
            <p style="color:#9a9a9a;font-size:14px;margin:4px 0 0;">Log in to place a bet</p>
          </div>
          <form id="login-form" class="bb-card" style="display:flex;flex-direction:column;gap:10px;">
            <div><span style="font-size:12px;color:#9a9a9a;display:block;margin-bottom:4px;">Your Eliza team</span>
              <select class="bb-select" id="f-user">
                <option value="admin" ${state.username==='admin'?'selected':''}>Admin login</option>
                ${teamOptions(state.username)}
              </select></div>
            <div><span style="font-size:12px;color:#9a9a9a;display:block;margin-bottom:4px;">PIN</span>
              <input class="bb-input" id="f-pin" type="password" inputmode="numeric" value="${esc(state.pin)}"/></div>
            ${state.error ? `<div style="color:#c0604f;font-size:13px;">${esc(state.error)}</div>` : ''}
            ${state.info ? `<div style="color:#7fbf8f;font-size:13px;">${esc(state.info)}</div>` : ''}
            <button type="submit" class="bb-btn" id="login-submit" style="margin-top:4px;">Log in</button>
            <button type="button" class="bb-btn ghost" id="register-submit">First time? Create account</button>
            <button type="button" class="bb-btn ghost" id="close-login-modal">Cancel</button>
          </form>
          <p style="font-size:12px;color:#9a9a9a;text-align:center;margin-top:1rem;">Everyone starts with 1,000 clams once an admin approves your registration.</p>
          ${!hasRealStorage ? `<p style="font-size:12px;color:#c0604f;text-align:center;margin-top:0.5rem;">Running without persistent storage &mdash; open inside Claude's artifact panel for accounts to be saved between visits.</p>` : ''}
        </div>
      </div>`;
  }

  function header(){
    if(!state.user){
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 4px;border-bottom:1px solid #3d3d3d;margin-bottom:1rem;">
          <strong style="letter-spacing:0.5px;">bilbbet</strong>
          <button class="bb-btn" id="open-login-btn" style="padding:7px 14px;">Log in</button>
        </div>`;
    }
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 4px;border-bottom:1px solid #3d3d3d;margin-bottom:1rem;">
        <strong style="letter-spacing:0.5px;">bilbbet</strong>
        <div style="display:flex;align-items:center;gap:14px;font-size:14px;">
          <span>${fmt(state.user.balance)} clams</span>
          <span style="color:#9a9a9a;">${esc(state.user.username)}</span>
          <button class="bb-btn ghost" id="logout-btn" style="padding:6px 12px;">Log out</button>
        </div>
      </div>`;
  }

  function divColorClass(tabName){
    if(tabName === 'ELIZA CUP (D1)') return 'div-eliza';
    if(tabName === 'DIVISION 2A') return 'div-2a';
    if(tabName === 'DIVISION 2B') return 'div-2b';
    if(tabName === 'DIVISION 3A') return 'div-3a';
    if(tabName === 'DIVISION 3B') return 'div-3b';
    if(tabName === 'FA CUP') return 'div-facup';
    if(tabName === 'ECL') return 'div-ecl';
    return '';
  }

  function mainTabs(){
    return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">' +
      currentTabs().map(t => `<div class="bb-tab ${state.activeTab===t?'active '+divColorClass(t):''}" data-tab="${esc(t)}">${t==='RODDY'?'The Roddy':(t==='MY BETS'?'My Bets':(t==='ADMIN'?'Admin':(t==='H2H'?'H2H':t.replace(' (D1)',''))))}</div>`).join('') +
      '</div>';
  }

  function futuresMarketTabs(){
    return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">' +
      Object.entries(FUTURES.market_labels).map(([key,label]) =>
        `<div class="bb-tab ${state.futureMarketTab===key?'active':''}" data-marketkey="${key}" style="font-size:12px;padding:6px 10px;">${esc(label)}</div>`
      ).join('') +
      `<div class="bb-tab ${state.futureMarketTab==='leading_at'?'active':''}" data-marketkey="leading_at" style="font-size:12px;padding:6px 10px;">To Be Leading At&hellip;</div>` +
      '</div>';
  }
  function roddyMarketTabs(){
    return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">' +
      Object.entries(FUTURES.roddy_labels).map(([key,label]) =>
        `<div class="bb-tab ${state.futureMarketTab===key?'active':''}" data-marketkey="${key}" style="font-size:12px;padding:6px 10px;">${esc(label)}</div>`
      ).join('') +
      `<div class="bb-tab ${state.futureMarketTab==='leading_at'?'active':''}" data-marketkey="leading_at" style="font-size:12px;padding:6px 10px;">To Be Leading At&hellip;</div>` +
      '</div>';
  }

  function renderLeadingAtMarket(scopeKey){
    // scopeKey is a division name, or 'RODDY' for the open-field standings
    const source = scopeKey === 'RODDY' ? RODDY_LEADING_AT : LEADING_AT[scopeKey];
    const round = state.leadingAtRound;
    const outcomes = source[round] || source[String(round)] || [];
    const tagPrefix = 'LEADAT|' + scopeKey + '|' + round;
    const list = !outcomes.length ? '<p style="color:#9a9a9a;">No outcomes in this market.</p>' : outcomes.map(o => {
      if(o.suspended){
        return `<div class="bb-outcome" style="opacity:0.5;cursor:default;">
          <span>${esc(o.team)}</span><span class="bb-odds" style="color:#9a9a9a;">suspended</span></div>`;
      }
      const selId = tagPrefix + '|' + o.team;
      const selected = state.slip.some(s=>s.id===selId);
      return `<div class="bb-outcome ${selected?'selected':''}" data-pick="${esc(selId)}" data-team="${esc(o.team)}" data-odds="${o.odds}" data-label="${esc(o.team)} leading R${round} (${scopeKey==='RODDY'?'Roddy':scopeKey.replace(' (D1)','')})">
        <span>${esc(o.team)}</span><span class="bb-odds">${o.odds.toFixed(2)}</span></div>`;
    }).join('');
    return `<div class="bb-card" style="margin-bottom:1rem;display:flex;align-items:center;gap:10px;">
        <span style="font-size:12px;color:#9a9a9a;">Round</span>
        <select class="bb-select" id="leadingat-round" style="width:170px;">${roundOptions(state.leadingAtRound)}</select>
      </div>
      <p style="color:#9a9a9a;font-size:12px;margin-bottom:10px;">Who's on top of the table after this specific round, not who wins the season.</p>
      ${list}`;
  }

  function cupMarketTabs(labelsKey){
    const labels = FUTURES[labelsKey];
    return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">' +
      Object.entries(labels).map(([key,label]) =>
        `<div class="bb-tab ${state.futureMarketTab===key?'active':''}" data-marketkey="${key}" style="font-size:12px;padding:6px 10px;">${esc(label)}</div>`
      ).join('') + '</div>';
  }

  function cupOutcomesList(marketsKey, marketKey){
    const cupTag = marketsKey === 'fa_cup_markets' ? 'FACUP' : 'ECL';
    const outcomes = FUTURES[marketsKey][marketKey];
    if(!outcomes || !outcomes.length) return '<p style="color:#9a9a9a;">No outcomes in this market.</p>';
    return outcomes.map(o => {
      if(o.suspended){
        return `<div class="bb-outcome" style="opacity:0.5;cursor:default;">
          <span>${esc(o.team)}</span><span class="bb-odds" style="color:#9a9a9a;">suspended</span></div>`;
      }
      const selId = cupTag+'|'+marketKey+'|'+o.team;
      const selected = state.slip.some(s=>s.id===selId);
      return `<div class="bb-outcome ${selected?'selected':''}" data-pick="${esc(selId)}" data-team="${esc(o.team)}" data-odds="${o.odds}" data-label="${esc(o.team)}">
        <span>${esc(o.team)}</span><span class="bb-odds">${o.odds.toFixed(2)}</span></div>`;
    }).join('');
  }

  function futuresOutcomesList(div, marketKey){
    const outcomes = div==='RODDY' ? FUTURES.roddy[marketKey] : FUTURES.divisions[div][marketKey];
    if(!outcomes || !outcomes.length) return '<p style="color:#9a9a9a;">No outcomes in this market.</p>';
    return outcomes.map(o => {
      if(o.suspended){
        return `<div class="bb-outcome" style="opacity:0.5;cursor:default;">
          <span>${esc(o.team)}</span><span class="bb-odds" style="color:#9a9a9a;">suspended</span></div>`;
      }
      const selId = 'FUT|'+div+'|'+marketKey+'|'+o.team;
      const selected = state.slip.some(s=>s.id===selId);
      return `<div class="bb-outcome ${selected?'selected':''}" data-pick="${esc(selId)}" data-team="${esc(o.team)}" data-odds="${o.odds}" data-label="${esc(o.team)}">
        <span>${esc(o.team)}</span><span class="bb-odds">${o.odds.toFixed(2)}</span></div>`;
    }).join('');
  }

  function teamOptions(selected){
    let html = `<option value="">Select a team&hellip;</option>`;
    for(const div in H2H_DIVISIONS){
      html += `<optgroup label="${esc(div)}">`;
      for(const t of H2H_DIVISIONS[div]) html += `<option value="${esc(t)}" ${t===selected?'selected':''}>${esc(t)}</option>`;
      html += `</optgroup>`;
    }
    return html;
  }

  function renderH2HMarket(m){
    const winOdds = { a: toOdds(m.aWinPct), b: toOdds(m.bWinPct), draw: toOdds(m.drawPct) };
    const hcapOdds = { a: toOdds(m.aCoversPct), b: toOdds(m.bCoversPct) };
    const roundTag = 'R' + m.round;
    function row(id, label, pct, oddsInfo){
      if(oddsInfo.suspended){
        return `<div class="bb-outcome" style="opacity:0.5;cursor:default;">
          <span>${esc(label)} <span style="color:#9a9a9a;font-size:12px;">(${pct.toFixed(1)}%)</span></span>
          <span class="bb-odds" style="color:#9a9a9a;">suspended</span></div>`;
      }
      const odds = oddsInfo.odds;
      const selected = state.slip.some(s=>s.id===id);
      return `<div class="bb-outcome ${selected?'selected':''}" data-pick="${id}" data-label="${esc(label)}" data-odds="${odds}">
        <span>${esc(label)} <span style="color:#9a9a9a;font-size:12px;">(${pct.toFixed(1)}%)</span></span>
        <span class="bb-odds">${odds.toFixed(2)}</span></div>`;
    }
    return `<div class="bb-card" style="margin-bottom:1rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span class="bb-pill" style="background:#4a3a10;color:#ffdd00;">Round ${m.round}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
        <div><div style="font-size:12px;color:#9a9a9a;">${esc(m.teamA)} viable range</div><div style="font-size:20px;font-weight:600;">${m.aRange[0]}&ndash;${m.aRange[1]}</div></div>
        <div style="text-align:right;"><div style="font-size:12px;color:#9a9a9a;">${esc(m.teamB)} viable range</div><div style="font-size:20px;font-weight:600;">${m.bRange[0]}&ndash;${m.bRange[1]}</div></div>
      </div>
      <h4 style="margin:0 0 8px;font-size:13px;color:#9a9a9a;">Match result</h4>
      ${row('H2H|res-a|'+roundTag+'|'+m.teamA+'|'+m.teamB, 'R'+m.round+': '+m.teamA+' to win', m.aWinPct, winOdds.a)}
      ${row('H2H|res-draw|'+roundTag+'|'+m.teamA+'|'+m.teamB, 'R'+m.round+': Draw', m.drawPct, winOdds.draw)}
      ${row('H2H|res-b|'+roundTag+'|'+m.teamA+'|'+m.teamB, 'R'+m.round+': '+m.teamB+' to win', m.bWinPct, winOdds.b)}
      <h4 style="margin:14px 0 8px;font-size:13px;color:#9a9a9a;">Handicap</h4>
      ${row('H2H|hcap-a-'+(m.line>=0?'fav':'dog')+'|'+roundTag+'|'+m.teamA+'|'+m.teamB, 'R'+m.round+': '+m.teamA+' '+(m.line>=0?'-':'+')+Math.abs(m.line).toFixed(1), m.aCoversPct, hcapOdds.a)}
      ${row('H2H|hcap-b-'+(m.line>=0?'dog':'fav')+'|'+roundTag+'|'+m.teamA+'|'+m.teamB, 'R'+m.round+': '+m.teamB+' '+(m.line>=0?'+':'-')+Math.abs(m.line).toFixed(1), m.bCoversPct, hcapOdds.b)}
    </div>`;
  }

  function roundOptions(selected){
    let html = '';
    for(let r=1;r<=26;r++){
      const isPast = r < state.currentRound;
      html += `<option value="${r}" ${r===selected?'selected':''} ${isPast?'disabled':''}>Round ${r}${isPast?' (played)':''}</option>`;
    }
    return html;
  }

  const H2H_SUBTABS = [...FUTURE_DIVS, 'CUSTOM MATCHUP'];

  function h2hSubTabBar(){
    return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">' +
      H2H_SUBTABS.map(t => `<div class="bb-tab ${state.h2hSubTab===t?'active':''}" data-h2hsubtab="${esc(t)}" style="font-size:12px;padding:6px 10px;">${t==='CUSTOM MATCHUP'?'Custom matchup':t.replace(' (D1)','')}</div>`).join('') +
      '</div>';
  }

  const fixtureMarketCache = {};
  function getFixtureMarkets(div, round){
    const key = div + '|' + round;
    if(!fixtureMarketCache[key]){
      fixtureMarketCache[key] = H2H_SCHEDULE[div][round-1].map(([a,b]) => computeH2HMarket(a, b, round));
    }
    return fixtureMarketCache[key];
  }

  function quickOddsButton(pickId, label, teamLabel, oddsInfo){
    if(oddsInfo.suspended){
      return `<span class="bb-btn ghost" style="padding:6px 10px;font-size:12px;opacity:0.5;cursor:default;">${esc(teamLabel)} susp.</span>`;
    }
    const selected = state.slip.some(s=>s.id===pickId);
    return `<button class="bb-btn ${selected?'':'ghost'}" data-pick="${esc(pickId)}" data-label="${esc(label)}" data-odds="${oddsInfo.odds}" style="padding:6px 10px;font-size:12px;">${esc(teamLabel)} ${oddsInfo.odds.toFixed(2)}</button>`;
  }

  function renderFixtureList(div){
    if(state.h2hFixtureMarket){
      return `<button class="bb-btn ghost" id="back-to-fixtures" style="margin-bottom:10px;">&larr; Back to Round ${state.h2hRound} fixtures</button>` + renderH2HMarket(state.h2hFixtureMarket);
    }
    const markets = getFixtureMarkets(div, state.h2hRound);
    return '<div class="bb-card" style="padding:0;overflow:hidden;">' +
      markets.map((m, i) => {
        const roundTag = 'R' + m.round;
        const aId = 'H2H|res-a|'+roundTag+'|'+m.teamA+'|'+m.teamB;
        const bId = 'H2H|res-b|'+roundTag+'|'+m.teamA+'|'+m.teamB;
        return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;flex-wrap:wrap;${i<markets.length-1?'border-bottom:1px solid #3d3d3d;':''}">
          <div style="display:flex;align-items:center;gap:8px;">
            ${quickOddsButton(aId, roundTag+': '+m.teamA+' to win', m.teamA, toOdds(m.aWinPct))}
            <span style="color:#9a9a9a;font-size:12px;">vs</span>
            ${quickOddsButton(bId, roundTag+': '+m.teamB+' to win', m.teamB, toOdds(m.bWinPct))}
          </div>
          <span class="bb-btn ghost" data-fixture-expand="${esc(div)}|${i}" style="padding:5px 10px;font-size:11px;">Full market (draw &amp; handicap)</span>
        </div>`;
      }).join('') +
      '</div>' +
      '<p style="color:#9a9a9a;font-size:12px;margin-top:10px;">Fixture list is a projected double round-robin, not an official 26/27 schedule \u2014 swap in the real one once fixtures are confirmed. Tap either team\'s price to back the moneyline directly, or open the full market for the draw and handicap.</p>';
  }

  function renderH2HTab(){
    const roundBar = `<div class="bb-card" style="margin-bottom:1rem;display:flex;align-items:center;gap:10px;">
      <span style="font-size:12px;color:#9a9a9a;">Round</span>
      <select class="bb-select" id="h2h-round" style="width:140px;">${roundOptions(state.h2hRound)}</select>
    </div>`;
    if(state.h2hSubTab === 'CUSTOM MATCHUP'){
      return roundBar + h2hSubTabBar() + `<div class="bb-card" style="margin-bottom:1rem;">
        <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">
          <div style="flex:1;min-width:180px;"><span style="font-size:12px;color:#9a9a9a;display:block;margin-bottom:4px;">Team A</span>
            <select class="bb-select" id="team-a">${teamOptions(state.teamA)}</select></div>
          <div style="flex:1;min-width:180px;"><span style="font-size:12px;color:#9a9a9a;display:block;margin-bottom:4px;">Team B</span>
            <select class="bb-select" id="team-b">${teamOptions(state.teamB)}</select></div>
          <button class="bb-btn" id="get-market" ${(!state.teamA||!state.teamB||state.teamA===state.teamB)?'disabled':''}>Get market</button>
        </div>
        ${state.teamA && state.teamB && state.teamA===state.teamB ? '<p style="color:#c0604f;font-size:13px;margin:8px 0 0;">Pick two different teams.</p>' : ''}
      </div>${state.h2hMarket ? renderH2HMarket(state.h2hMarket) : ''}`;
    }
    return roundBar + h2hSubTabBar() + renderFixtureList(state.h2hSubTab);
  }

  function statusPill(status){
    const colors = { PENDING: ['#efece3','#9a9a9a'], WON: ['#e1efe9','#2d6a44'], LOST: ['#f3ded9','#a3402f'],
      VOID: ['#e8e4d8','#8a8a8a'], OPEN: ['#4a3a10','#ffdd00'] };
    const [bg,fg] = colors[status] || colors.PENDING;
    return `<span class="bb-pill" style="background:${bg};color:${fg};">${status.toLowerCase()}</span>`;
  }

  function renderMyBetsTab(){
    if(!state.user) return '<p style="color:#9a9a9a;">Log in to see your bets.</p>';
    if(state.myBets === null) return '<p style="color:#9a9a9a;">Loading&hellip;</p>';
    const bets = state.myBets;
    if(!bets.length) return '<p style="color:#9a9a9a;">No bets placed yet &mdash; head to any market tab and tap an outcome to get started.</p>';
    const pending = bets.filter(b=>(b.status||'PENDING')==='PENDING').length;
    const won = bets.filter(b=>b.status==='WON').length;
    const lost = bets.filter(b=>b.status==='LOST').length;
    const voided = bets.filter(b=>b.status==='VOID').length;
    const netFromSettled = bets.reduce((s,b)=>{
      if(b.status==='WON') return s + (b.potentialReturn - b.stake);
      if(b.status==='LOST') return s - b.stake;
      return s;   // PENDING and VOID both net to 0 -- VOID refunds the stake, nothing gained or lost
    }, 0);
    return `
      <div class="bb-card" style="margin-bottom:1rem;display:flex;gap:20px;flex-wrap:wrap;">
        <div><div style="font-size:12px;color:#9a9a9a;">Pending</div><div style="font-size:18px;font-weight:600;">${pending}</div></div>
        <div><div style="font-size:12px;color:#9a9a9a;">Won</div><div style="font-size:18px;font-weight:600;color:#4a9166;">${won}</div></div>
        <div><div style="font-size:12px;color:#9a9a9a;">Lost</div><div style="font-size:18px;font-weight:600;color:#a3402f;">${lost}</div></div>
        <div><div style="font-size:12px;color:#9a9a9a;">Voided</div><div style="font-size:18px;font-weight:600;">${voided}</div></div>
        <div><div style="font-size:12px;color:#9a9a9a;">Net (settled bets)</div><div style="font-size:18px;font-weight:600;">${netFromSettled>=0?'+':''}${fmt(netFromSettled)}</div></div>
      </div>
      <div class="bb-card" style="padding:0;overflow-x:auto;">
        <table class="bb-table">
          <thead><tr><th>Placed</th><th>Selections</th><th>Stake</th><th>Odds</th><th>Potential return</th><th>Status</th></tr></thead>
          <tbody>
            ${bets.slice().sort((a,b)=>b.timestamp-a.timestamp).map(b => `
              <tr>
                <td>${fmtDate(b.timestamp)}</td>
                <td>${b.selections.map(s=>esc(s.label)+' <span style="color:#8a8a8a;">('+s.odds.toFixed(2)+')</span>').join('<br/>')}</td>
                <td>${fmt(b.stake)}</td>
                <td>${b.combinedOdds.toFixed(2)}</td>
                <td>${fmt(b.potentialReturn)}</td>
                <td>${statusPill(b.status || 'PENDING')}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p style="font-size:12px;color:#9a9a9a;margin-top:10px;">
        Every bet here is recorded as <strong>pending</strong> until the 26/27 season actually plays out and results come in &mdash;
        this table is the template that will populate with won/lost once there's a way to resolve markets against real results.
      </p>`;
  }

  function renderSpecialsTab(){
    if(state.novelty === null) return '<p style="color:#9a9a9a;">Loading&hellip;</p>';
    const open = state.novelty.filter(n => n.status === 'OPEN');
    const settled = state.novelty.filter(n => n.status !== 'OPEN').sort((a,b)=>b.createdAt-a.createdAt);
    let html = '<h3 style="margin-top:0;">Specials &amp; Novelty</h3>';
    if(!open.length && !settled.length){
      return html + '<p style="color:#9a9a9a;">Nothing added yet &mdash; the admin can add one-off bets here.</p>';
    }
    if(open.length){
      html += '<div class="bb-card" style="padding:0;overflow:hidden;margin-bottom:1.5rem;">' +
        open.map((n,i) => {
          const id = 'NOVELTY|'+n.id;
          const selected = state.slip.some(s=>s.id===id);
          return `<div class="bb-outcome ${selected?'selected':''}" data-pick="${esc(id)}" data-label="${esc(n.name)}" data-odds="${n.odds}" style="${i<open.length-1?'border-bottom:1px solid #3d3d3d;':''}">
            <span>${esc(n.name)}</span><span class="bb-odds">${n.odds.toFixed(2)}</span></div>`;
        }).join('') + '</div>';
    }
    if(settled.length){
      html += '<h4 style="color:#9a9a9a;">Settled</h4><div class="bb-card" style="padding:0;overflow:hidden;">' +
        settled.map((n,i) => `<div style="display:flex;justify-content:space-between;padding:10px 14px;${i<settled.length-1?'border-bottom:1px solid #3d3d3d;':''}">
          <span style="color:#9a9a9a;">${esc(n.name)} <span style="color:#8a8a8a;">(${n.odds.toFixed(2)})</span></span>${statusPill(n.status)}
        </div>`).join('') + '</div>';
    }
    return html;
  }

  function renderStatsTab(){
    if(state.statsData === null) return '<p style="color:#9a9a9a;">Loading&hellip;</p>';
    const s = state.statsData;
    function leaderboard(title, rows, valueFmt){
      if(!rows.length) return `<h4 style="color:#9a9a9a;">${title}</h4><p style="color:#9a9a9a;font-size:13px;">Nothing to show yet.</p>`;
      return `<h4 style="color:#9a9a9a;margin-bottom:6px;">${title}</h4>
        <div class="bb-card" style="padding:0;overflow:hidden;margin-bottom:1.25rem;">
          ${rows.map((r,i) => `<div style="display:flex;justify-content:space-between;padding:8px 14px;${i<rows.length-1?'border-bottom:1px solid #3d3d3d;':''}">
            <span>${i+1}. ${esc(r.label)}</span><span style="font-weight:600;color:#ffdd00;">${valueFmt(r.value)}</span>
          </div>`).join('')}
        </div>`;
    }
    return '<h3 style="margin-top:0;">Site stats</h3>' +
      `<div class="bb-card" style="margin-bottom:1.25rem;display:flex;gap:20px;flex-wrap:wrap;">
        <div><div style="font-size:12px;color:#9a9a9a;">Total clams wagered</div><div style="font-size:18px;font-weight:600;">${fmt(s.totalWagered)}</div></div>
        <div><div style="font-size:12px;color:#9a9a9a;">Bets placed</div><div style="font-size:18px;font-weight:600;">${s.totalBets}</div></div>
        <div><div style="font-size:12px;color:#9a9a9a;">Punters</div><div style="font-size:18px;font-weight:600;">${s.totalPunters}</div></div>
      </div>` +
      leaderboard('Top 5 stakes', s.topStakes, v=>fmt(v)) +
      leaderboard('Top 5 multis (by legs)', s.topMultis, v=>v+' legs') +
      leaderboard('Top 5 wins (biggest payouts)', s.topWins, v=>fmt(v)) +
      leaderboard('Top 5 losses (biggest stakes lost)', s.topLosses, v=>fmt(v)) +
      leaderboard('Longest odds actually backed', s.topOdds, v=>v.toFixed(2)) +
      leaderboard('Most popular selection', s.mostPopular, v=>v+' bet'+(v>1?'s':'')) +
      leaderboard('Kitty leaderboard (richest punters)', s.topKitty, v=>fmt(v));
  }

  function renderAdminTab(){
    if(state.adminPunters === null || state.adminBets === null) return '<p style="color:#9a9a9a;">Loading&hellip;</p>';
    const punters = state.adminPunters, bets = state.adminBets;
    const pending = punters.filter(u => (u.status||'APPROVED') === 'PENDING');
    return `
      <h3 style="margin-top:0;">Season progress</h3>
      <div class="bb-card" style="margin-bottom:1.5rem;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-size:13px;color:#9a9a9a;">Next round to be played:</span>
        <select class="bb-select" id="admin-current-round" style="width:140px;">
          ${Array.from({length:26},(_, i) => i+1).map(r => `<option value="${r}" ${r===state.currentRound?'selected':''}>Round ${r}</option>`).join('')}
        </select>
        <button class="bb-btn" id="save-current-round">Update</button>
        <span style="font-size:12px;color:#9a9a9a;">Rounds before this are greyed out everywhere as already played.</span>
      </div>
      <h3>Pending registrations</h3>
      ${!pending.length ? '<p style="color:#9a9a9a;font-size:13px;">Nothing waiting on approval.</p>' : `
      <div class="bb-card" style="padding:0;overflow:hidden;margin-bottom:1.5rem;">
        ${pending.map((u,i) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;${i<pending.length-1?'border-bottom:1px solid #3d3d3d;':''}">
            <span>${esc(u.username)}</span>
            <span style="display:flex;gap:6px;">
              <button class="bb-btn" data-regstatus="${esc(u.username)}|APPROVED" style="padding:5px 10px;font-size:12px;">Approve (fund 1,000)</button>
              <button class="bb-btn ghost" data-regstatus="${esc(u.username)}|REJECTED" style="padding:5px 10px;font-size:12px;">Reject</button>
            </span>
          </div>`).join('')}
      </div>`}
      <h3>Punters</h3>
      <div class="bb-card" style="padding:0;overflow-x:auto;margin-bottom:1.5rem;">
        <table class="bb-table">
          <thead><tr><th>Username</th><th>Balance</th><th>Adjust</th></tr></thead>
          <tbody>
            ${punters.slice().sort((a,b)=>a.username.localeCompare(b.username)).map(u => `
              <tr>
                <td>${esc(u.username)}
                  ${u.isAdmin ? ' <span class="bb-pill" style="background:#ffdd00;color:#4a3a10;">admin</span>' : ''}
                  ${u.status==='PENDING' ? ' <span class="bb-pill" style="background:#efece3;color:#9a9a9a;">pending</span>' : ''}
                  ${u.status==='REJECTED' ? ` <span class="bb-pill" style="background:#f3ded9;color:#a3402f;">rejected</span> <span data-regstatus="${esc(u.username)}|APPROVED" style="cursor:pointer;color:#9a9a9a;font-size:11px;text-decoration:underline;">re-approve</span>` : ''}
                </td>
                <td>${fmt(u.balance)}</td>
                <td style="display:flex;gap:6px;align-items:center;">
                  <input class="bb-input" type="number" placeholder="+/- clams" id="adj-${esc(u.username)}" style="width:110px;padding:5px 8px;"/>
                  <button class="bb-btn ghost" data-adjust-user="${esc(u.username)}" style="padding:5px 10px;font-size:12px;">Apply</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <h3>Specials &amp; Novelty</h3>
      <div class="bb-card" style="margin-bottom:1.5rem;">
        <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px;">
          <div style="flex:2;min-width:200px;"><span style="font-size:12px;color:#9a9a9a;display:block;margin-bottom:4px;">Bet name</span>
            <input class="bb-input" id="novelty-name" placeholder="e.g. Someone forgets to make a trade all season"/></div>
          <div style="width:110px;"><span style="font-size:12px;color:#9a9a9a;display:block;margin-bottom:4px;">Odds</span>
            <input class="bb-input" id="novelty-odds" type="number" step="0.01" min="1.01" placeholder="4.50"/></div>
          <button class="bb-btn" id="add-novelty">Add</button>
        </div>
        ${!(state.novelty||[]).length ? '<p style="color:#9a9a9a;font-size:13px;">Nothing added yet.</p>' : (state.novelty||[]).slice().sort((a,b)=>b.createdAt-a.createdAt).map(n => `
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid #333333;">
            <span>${esc(n.name)} <span class="bb-odds">${n.odds.toFixed(2)}</span> ${statusPill(n.status)}</span>
            ${n.status==='OPEN' ? `
              <span style="display:flex;gap:4px;">
                <button class="bb-btn ghost" data-noveltystatus="${n.id}|WON" style="padding:4px 8px;font-size:11px;">Won</button>
                <button class="bb-btn ghost" data-noveltystatus="${n.id}|LOST" style="padding:4px 8px;font-size:11px;">Lost</button>
                <button class="bb-btn ghost" data-noveltystatus="${n.id}|VOID" style="padding:4px 8px;font-size:11px;">Close (void)</button>
              </span>` : `<button class="bb-btn ghost" data-noveltystatus="${n.id}|OPEN" style="padding:4px 8px;font-size:11px;">Reopen</button>`}
          </div>`).join('')}
        <p style="font-size:12px;color:#9a9a9a;margin-top:10px;">
          Won credits the full payout; Lost keeps the stake forfeited; Close (void) refunds the stake as if the bet never happened.
          Only single-selection bets on this exact item are auto-settled &mdash; if it's one leg of a bigger multi, resolve that bet manually below instead.
        </p>
      </div>
      <h3>All registered bets</h3>
      ${!bets.length ? '<p style="color:#9a9a9a;">No bets placed by anyone yet.</p>' : `
      <div class="bb-card" style="padding:0;overflow-x:auto;">
        <table class="bb-table">
          <thead><tr><th>Placed</th><th>User</th><th>Selections</th><th>Stake</th><th>Odds</th><th>Potential return</th><th>Status</th><th>Override</th></tr></thead>
          <tbody>
            ${bets.slice().sort((a,b)=>b.timestamp-a.timestamp).map(b => `
              <tr>
                <td>${fmtDate(b.timestamp)}</td>
                <td>${esc(b.username)}</td>
                <td>${b.selections.map(s=>esc(s.label)+' <span style="color:#8a8a8a;">('+s.odds.toFixed(2)+')</span>').join('<br/>')}</td>
                <td>${fmt(b.stake)}</td>
                <td>${b.combinedOdds.toFixed(2)}</td>
                <td>${fmt(b.potentialReturn)}</td>
                <td>${statusPill(b.status || 'PENDING')}</td>
                <td style="display:flex;gap:4px;flex-wrap:wrap;">
                  <button class="bb-btn ghost" data-setstatus="${b.id}|WON" style="padding:4px 8px;font-size:11px;">Won</button>
                  <button class="bb-btn ghost" data-setstatus="${b.id}|LOST" style="padding:4px 8px;font-size:11px;">Lost</button>
                  <button class="bb-btn ghost" data-setstatus="${b.id}|PENDING" style="padding:4px 8px;font-size:11px;">Reset</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`}
      <p style="font-size:12px;color:#9a9a9a;margin-top:10px;">
        Marking a bet Won credits its full potential return to that punter's balance; marking it Lost (or resetting to Pending
        after a mistaken override) reverses that credit automatically, so balances always stay consistent with the bet's current status.
      </p>`;
  }

  async function loadAdminData(){
    const usernames = await getIndex('bilbbet2_users_index');
    const users = (await Promise.all(usernames.map(getUser))).filter(Boolean);
    const betIds = await getIndex('bilbbet2_all_bets_index');
    const bets = (await Promise.all(betIds.map(id => sget('bilbbet2_bet:'+id)))).filter(Boolean);
    const noveltyIds = await getIndex('bilbbet2_novelty_index');
    const novelty = (await Promise.all(noveltyIds.map(id => sget('bilbbet2_novelty:'+id)))).filter(Boolean);
    state.adminPunters = users;
    state.adminBets = bets;
    state.novelty = novelty;
    render();
  }

  async function saveCurrentRound(round){
    await sset('bilbbet2_current_round', round);
    state.currentRound = round;
    render();
  }

  async function adjustPunterBalance(username, delta){
    if(!delta){ return; }
    const u = await getUser(username);
    if(!u) return;
    u.balance += delta;
    await saveUser(u);
    if(state.user.username.toLowerCase() === username.toLowerCase()) state.user = u;
    await loadAdminData();
  }

  async function updateRegistrationStatus(username, newStatus){
    const u = await getUser(username);
    if(!u) return;
    const wasApprovedBefore = (u.status||'APPROVED') === 'APPROVED';
    u.status = newStatus;
    // fund the account the moment it's approved, but only if it hasn't already
    // been funded before (so re-approving someone who was later rejected doesn't
    // hand them a second 1,000-clam top-up on top of whatever they still have).
    if(newStatus === 'APPROVED' && !u.everFunded){
      u.balance += 1000;
      u.everFunded = true;
    }
    await saveUser(u);
    if(state.user.username.toLowerCase() === username.toLowerCase()) state.user = u;
    await loadAdminData();
  }

  // How much of a bet's stake comes back to the punter for a given status.
  // PENDING/LOST: nothing (stake was already taken at placement and stays gone unless
  // voided). WON: the full potential return. VOID: just the original stake refunded,
  // as if the bet never happened.
  function settlementCredit(status, bet){
    if(status === 'WON') return bet.potentialReturn;
    if(status === 'VOID') return bet.stake;
    return 0;
  }

  // Applies the balance change for a status transition without reloading admin data
  // or re-rendering -- used directly by batch operations (like resolving a novelty
  // item that settles several bets at once) so they can do a single reload at the end
  // instead of one per bet.
  async function applyBetStatus(betId, newStatus){
    const bet = await sget('bilbbet2_bet:'+betId);
    if(!bet) return;
    const prevStatus = bet.status || 'PENDING';
    if(prevStatus === newStatus) return;
    const u = await getUser(bet.username);
    if(u){
      u.balance -= settlementCredit(prevStatus, bet);
      u.balance += settlementCredit(newStatus, bet);
      await saveUser(u);
      if(state.user.username.toLowerCase() === bet.username.toLowerCase()) state.user = u;
    }
    bet.status = newStatus;
    await sset('bilbbet2_bet:'+betId, bet);
  }

  async function setBetStatus(betId, newStatus){
    await applyBetStatus(betId, newStatus);
    await loadAdminData();
  }

  // ---------- Specials / Novelty ----------
  async function loadNovelty(){
    const ids = await getIndex('bilbbet2_novelty_index');
    const items = (await Promise.all(ids.map(id => sget('bilbbet2_novelty:'+id)))).filter(Boolean);
    state.novelty = items;
    render();
  }

  async function addNoveltyItem(){
    const nameInput = document.getElementById('novelty-name');
    const oddsInput = document.getElementById('novelty-odds');
    const name = nameInput.value.trim();
    const odds = parseFloat(oddsInput.value);
    if(!name || !odds || odds < 1.01){ alert('Enter a name and odds of at least 1.01.'); return; }
    const item = { id: uid(), name, odds: Math.round(odds*100)/100, status: 'OPEN', createdAt: Date.now() };
    await sset('bilbbet2_novelty:'+item.id, item);
    await addToIndex('bilbbet2_novelty_index', item.id);
    await loadAdminData();
  }

  async function resolveNoveltyItem(noveltyId, newStatus){
    const item = await sget('bilbbet2_novelty:'+noveltyId);
    if(!item) return;
    item.status = newStatus;
    await sset('bilbbet2_novelty:'+noveltyId, item);
    // auto-settle any PENDING bet whose ONLY selection is this exact novelty pick --
    // multi-leg bets that happen to include it are left for manual admin override.
    const pickId = 'NOVELTY|' + noveltyId;
    const betIds = await getIndex('bilbbet2_all_bets_index');
    const bets = (await Promise.all(betIds.map(id => sget('bilbbet2_bet:'+id)))).filter(Boolean);
    const settleAs = newStatus === 'OPEN' ? 'PENDING' : newStatus;
    for(const bet of bets){
      if((bet.status||'PENDING') !== 'PENDING') continue;
      if(bet.selections.length !== 1 || bet.selections[0].id !== pickId) continue;
      await applyBetStatus(bet.id, settleAs);
    }
    await loadAdminData();
  }

  // ---------- Stats ----------
  async function loadStats(){
    const usernames = await getIndex('bilbbet2_users_index');
    const users = (await Promise.all(usernames.map(getUser))).filter(Boolean);
    const betIds = await getIndex('bilbbet2_all_bets_index');
    const bets = (await Promise.all(betIds.map(id => sget('bilbbet2_bet:'+id)))).filter(Boolean);

    const top = (arr, key, n=5) => arr.slice().sort((a,b)=>b[key]-a[key]).slice(0,n);

    const topStakes = top(bets, 'stake').map(b => ({ label: b.username+' \u2014 '+b.selections.map(s=>s.label).join(' + '), value: b.stake }));
    const multis = bets.filter(b => b.selections.length > 1);
    const topMultis = multis.slice()
      .sort((a,b) => b.selections.length - a.selections.length || b.combinedOdds - a.combinedOdds)
      .slice(0,5)
      .map(b => ({ label: b.username+' \u2014 '+b.selections.length+'-leg multi @ '+b.combinedOdds.toFixed(2), value: b.selections.length }));
    const won = bets.filter(b => b.status === 'WON');
    const topWins = top(won, 'potentialReturn').map(b => ({ label: b.username+' \u2014 '+b.selections.map(s=>s.label).join(' + '), value: b.potentialReturn }));
    const lost = bets.filter(b => b.status === 'LOST');
    const topLosses = top(lost, 'stake').map(b => ({ label: b.username+' \u2014 '+b.selections.map(s=>s.label).join(' + '), value: b.stake }));
    const oddsBacked = [];
    for(const b of bets) for(const s of b.selections) oddsBacked.push({ label: b.username+' \u2014 '+s.label, value: s.odds });
    const topOdds = top(oddsBacked, 'value');
    const pickCounts = {};
    for(const b of bets) for(const s of b.selections) pickCounts[s.label] = (pickCounts[s.label]||0) + 1;
    const mostPopular = Object.entries(pickCounts).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([label,value]) => ({label, value}));
    const topKitty = top(users, 'balance').map(u => ({ label: u.username, value: u.balance }));

    state.statsData = {
      totalWagered: bets.reduce((s,b)=>s+b.stake,0),
      totalBets: bets.length,
      totalPunters: users.length,
      topStakes, topMultis, topWins, topLosses, topOdds, mostPopular, topKitty,
    };
    render();
  }

  function renderMain(){
    if(state.activeTab === 'ADMIN' && !(state.user && state.user.isAdmin)) state.activeTab = 'H2H';
    let body = '';
    if(state.activeTab === 'H2H'){
      body = renderH2HTab();
    } else if(state.activeTab === 'RODDY'){
      body = roddyMarketTabs() + (state.futureMarketTab === 'leading_at'
        ? renderLeadingAtMarket('RODDY')
        : `<div id="outcomes-list">${futuresOutcomesList('RODDY', state.futureMarketTab)}</div>`);
    } else if(state.activeTab === 'FA CUP'){
      body = `<div class="bb-div-stripe div-facup"></div>` + cupMarketTabs('fa_cup_labels') +
        `<p style="color:#9a9a9a;font-size:12px;margin-bottom:10px;">Real Round of 64 draw from the 26/27 file: 62 entrants plus confirmed byes for Big Mac FC and Harvey Frekes. No matches played yet, so the whole bracket is simulated.</p>` +
        `<div id="outcomes-list">${cupOutcomesList('fa_cup_markets', state.futureMarketTab)}</div>`;
    } else if(state.activeTab === 'ECL'){
      body = `<div class="bb-div-stripe div-ecl"></div>` + cupMarketTabs('ecl_labels') +
        `<p style="color:#9a9a9a;font-size:12px;margin-bottom:10px;">Groups from the 26/27 file used as a template (3 groups of 4); the results in that file are last season's leftover data, so the whole group stage plus knockout is simulated fresh here. Top 2 per group advance; the best 2 group winners get a bye straight to the semi-final, the rest play off for the last 2 spots.</p>` +
        `<div id="outcomes-list">${cupOutcomesList('ecl_markets', state.futureMarketTab)}</div>`;
    } else if(state.activeTab === 'MY BETS'){
      body = renderMyBetsTab();
    } else if(state.activeTab === 'SPECIALS'){
      body = renderSpecialsTab();
    } else if(state.activeTab === 'STATS'){
      body = renderStatsTab();
    } else if(state.activeTab === 'ADMIN'){
      body = renderAdminTab();
    } else {
      const stripeClass = divColorClass(state.activeTab);
      body = (stripeClass ? `<div class="bb-div-stripe ${stripeClass}"></div>` : '') + futuresMarketTabs() + (state.futureMarketTab === 'leading_at'
        ? renderLeadingAtMarket(state.activeTab)
        : `<div id="outcomes-list">${futuresOutcomesList(state.activeTab, state.futureMarketTab)}</div>`);
    }
    return `<div>${header()}${mainTabs()}${body}</div>${['ADMIN','STATS'].includes(state.activeTab) ? '' : slipBar()}${state.loginModalOpen ? renderLoginModal() : ''}`;
  }

  function combinedOdds(){ return state.slip.reduce((acc,s)=>acc*s.odds,1); }

  // ---------- conflict detection ----------
  // Two kinds of thing get blocked, for different reasons:
  //  1. CONTRARY -- outcomes that literally cannot both happen (only one team wins a
  //     division; a team can't finish both top half and bottom half).
  //  2. NESTED/IMPLIED -- outcomes that CAN both be true, but one guarantees the other
  //     (top 3 guarantees top 10; winning the division guarantees a top-3 finish;
  //     covering a favourite's handicap guarantees the moneyline win too). These aren't
  //     impossible together, but multiplying their odds pretends they're two independent
  //     risks when really you're only ever taking the tighter one -- that's the "double
  //     dip" to close off.
  const UPPER_CHAIN = ['win_div_pct','top3_pct','top_half_pct'];       // each implies the next
  const LOWER_CHAIN = ['wooden_spoon_pct','relegation_pct','bottom_half_pct'];
  const RODDY_CHAIN = ['roddy_win_pct','roddy_top3_pct','roddy_top5_pct','roddy_top10_pct'];
  const UPPER_SET = new Set(UPPER_CHAIN), LOWER_SET = new Set(LOWER_CHAIN);
  const SINGLE_WINNER_FUT_MARKETS = new Set(['win_div_pct','wooden_spoon_pct','roddy_win_pct']);

  function parsePick(id){
    const parts = id.split('|');
    if(parts[0]==='H2H'){
      const [, kindRaw, roundTag, teamA, teamB] = parts;
      const isRes = kindRaw.startsWith('res');
      // hcap kind carries a fav/dog tag: 'hcap-a-fav' means team A is the side that
      // needs to win outright to cover (so covering implies the moneyline); 'hcap-a-dog'
      // means team A can cover while still losing (genuinely independent of the moneyline).
      const side = kindRaw.startsWith('res-') ? kindRaw.slice(4) : (kindRaw.startsWith('hcap-') ? kindRaw.split('-')[1] : null);
      const favTag = kindRaw.endsWith('-fav') ? 'fav' : (kindRaw.endsWith('-dog') ? 'dog' : null);
      return { type:'h2h', kind: isRes ? 'res' : 'hcap', side, favTag, roundTag, teamA, teamB,
        group: (isRes?'H2H-RES|':'H2H-HCAP|')+roundTag+'|'+teamA+'|'+teamB };
    }
    if(parts[0]==='FUT'){
      const [, div, marketKey, team] = parts;
      return { type:'fut', div, marketKey, team,
        group: SINGLE_WINNER_FUT_MARKETS.has(marketKey) ? ('FUT-SINGLE|'+div+'|'+marketKey) : null };
    }
    if(parts[0]==='FACUP'){
      const [, marketKey, team] = parts;
      return { type:'facup', marketKey, team, group: marketKey==='win_pct' ? 'FACUP-SINGLE' : null };
    }
    if(parts[0]==='ECL'){
      const [, marketKey, team] = parts;
      return { type:'ecl', marketKey, team, group: marketKey==='win_pct' ? 'ECL-SINGLE' : null };
    }
    if(parts[0]==='LEADAT'){
      const [, scope, round, team] = parts;
      // only one team can be leading a given scope at a given round checkpoint
      return { type:'leadat', scope, round: parseInt(round,10), team, group: 'LEADAT-SINGLE|'+scope+'|'+round };
    }
    return { type:'unknown' };
  }

  function chainOf(marketKey){
    if(UPPER_SET.has(marketKey)) return 'upper';
    if(LOWER_SET.has(marketKey)) return 'lower';
    if(RODDY_CHAIN.includes(marketKey)) return 'roddy';
    return null;
  }

  function findConflict(newId){
    const np = parsePick(newId);
    for(const s of state.slip){
      const ep = parsePick(s.id);

      // same "only one outcome can be true" group, different specific outcome (CONTRARY)
      if(np.group && ep.group && np.group === ep.group){
        const npKey = np.team || np.side, epKey = ep.team || ep.side;
        if(npKey !== epKey){
          return { reason:'contrary', msg: `only one outcome in that market can actually happen (you already have ${ep.team || ep.side} in this slip)` };
        }
      }

      // Leading at round 26 (the final round) is the exact same outcome as winning
      // the division/Roddy outright, not just correlated with it -- our tiebreak
      // rule for "leading" is identical to the one used to decide the season winner.
      if(np.type==='leadat' && ep.type==='fut' && np.round===26 && np.scope===ep.div && np.team===ep.team && ep.marketKey==='win_div_pct'){
        return { reason:'nested', msg: `leading ${np.scope.replace(' (D1)','')} after round 26 IS winning the division \u2014 backing both is the same outcome twice` };
      }
      if(np.type==='fut' && ep.type==='leadat' && ep.round===26 && ep.scope===np.div && ep.team===np.team && np.marketKey==='win_div_pct'){
        return { reason:'nested', msg: `leading ${ep.scope.replace(' (D1)','')} after round 26 IS winning the division \u2014 backing both is the same outcome twice` };
      }
      if(np.type==='leadat' && np.round===26 && np.scope==='RODDY' && ep.marketKey==='roddy_win_pct' && np.team===ep.team){
        return { reason:'nested', msg: `leading the Roddy after round 26 IS winning the Roddy \u2014 backing both is the same outcome twice` };
      }
      if(ep.type==='leadat' && ep.round===26 && ep.scope==='RODDY' && np.marketKey==='roddy_win_pct' && ep.team===np.team){
        return { reason:'nested', msg: `leading the Roddy after round 26 IS winning the Roddy \u2014 backing both is the same outcome twice` };
      }

      // futures: same team, same division/scope, different market
      if(np.type==='fut' && ep.type==='fut' && np.div===ep.div && np.team===ep.team && np.marketKey!==ep.marketKey){
        const npChain = chainOf(np.marketKey), epChain = chainOf(ep.marketKey);
        if(npChain && epChain){
          if(npChain === epChain){
            return { reason:'nested', msg: `those two finishes for ${np.team} aren't independent \u2014 one guarantees the other, so combining them just double-dips the same outcome` };
          } else {
            return { reason:'contrary', msg: `${np.team} can't finish both of those positions in the same season` };
          }
        }
      }

      // FA Cup / ECL: reaching a later stage always guarantees every earlier stage
      // too (win it all guarantees reaching the final, which guarantees the semis,
      // etc.) -- same team, two different stages of the same cup, is always a
      // double-dip, never a genuine impossibility (there's no "opposite" side to
      // a cup run the way there is for a division finish).
      if(np.type===ep.type && (np.type==='facup' || np.type==='ecl') && np.team===ep.team && np.marketKey!==ep.marketKey){
        return { reason:'nested', msg: `those two stages for ${np.team} in the same cup aren't independent \u2014 reaching the later one guarantees the earlier one, so combining them just double-dips the same run` };
      }

      // H2H: a favourite's handicap cover strictly implies they won outright. That
      // makes it NESTED with their own moneyline pick (double-dip, already handled),
      // but CONTRARY with the other side's moneyline or a draw (literally impossible
      // together) -- both directions need checking, not just the matching side.
      if(np.type==='h2h' && ep.type==='h2h' && np.roundTag===ep.roundTag && np.teamA===ep.teamA && np.teamB===ep.teamB){
        const resPick = np.kind==='res' ? np : (ep.kind==='res' ? ep : null);
        const hcapPick = np.kind==='hcap' ? np : (ep.kind==='hcap' ? ep : null);
        if(resPick && hcapPick && hcapPick.favTag==='fav'){
          if(resPick.side === hcapPick.side){
            return { reason:'nested', msg: `covering a favourite's handicap already means they won outright, so pairing that with the moneyline just double-dips the same result` };
          } else {
            return { reason:'contrary', msg: `that handicap result requires ${hcapPick.side==='a'?np.teamA||ep.teamA:np.teamB||ep.teamB} to win outright, which rules out your other selection on this match` };
          }
        }
      }
    }
    return null;
  }

  function slipBar(){
    if(!state.slip.length) return `<div class="bb-slip"><div class="bb-slip-inner" style="color:#9a9a9a;font-size:13px;">Tap any outcome to build a bet slip.</div></div>`;
    const modeToggle = `
      <div style="display:flex;gap:6px;margin-bottom:8px;">
        <div class="bb-tab ${state.betMode==='multi'?'active':''}" data-betmode="multi" style="font-size:12px;padding:5px 10px;">Multi (one combined bet)</div>
        <div class="bb-tab ${state.betMode==='singles'?'active':''}" data-betmode="singles" style="font-size:12px;padding:5px 10px;">Singles (bet each separately)</div>
      </div>`;
    const header = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong style="font-size:13px;">${state.slip.length} selection${state.slip.length>1?'s':''}</strong>
        <button class="bb-btn ghost" id="clear-slip" style="padding:4px 10px;font-size:12px;">Clear</button>
      </div>`;

    if(state.betMode === 'singles'){
      const totalStake = state.slip.reduce((s,x)=>s+(x.singleStake||0),0);
      const totalPotential = state.slip.reduce((s,x)=>s+Math.round((x.singleStake||0)*x.odds),0);
      return `<div class="bb-slip"><div class="bb-slip-inner">
        ${modeToggle}${header}
        <div style="max-height:160px;overflow-y:auto;margin-bottom:8px;">
          ${state.slip.map(s => `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;padding:5px 0;border-bottom:1px solid #333333;">
            <span style="color:#cfcfcf;flex:1;">${esc(s.label)} <span class="bb-odds">${s.odds.toFixed(2)}</span></span>
            <input class="bb-input" data-single-stake="${esc(s.id)}" type="number" min="1" value="${s.singleStake||50}" style="width:80px;padding:4px 6px;font-size:12px;"/>
            <span style="color:#9a9a9a;width:56px;text-align:right;">&rarr;${fmt(Math.round((s.singleStake||0)*s.odds))}</span>
            <span data-remove="${esc(s.id)}" style="cursor:pointer;color:#9a9a9a;">&times;</span>
          </div>`).join('')}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:12px;color:#9a9a9a;">Total stake ${fmt(totalStake)} &rarr; potential ${fmt(totalPotential)}</span>
          <button class="bb-btn" id="place-singles">Place ${state.slip.length} single${state.slip.length>1?'s':''}</button>
        </div>
      </div></div>`;
    }

    const combined = combinedOdds(), potential = state.stake*combined;
    return `<div class="bb-slip"><div class="bb-slip-inner">
      ${modeToggle}${header}
      <div style="max-height:100px;overflow-y:auto;margin-bottom:8px;">
        ${state.slip.map(s => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid #333333;">
          <span style="color:#cfcfcf;">${esc(s.label)}</span>
          <span style="display:flex;gap:8px;align-items:center;"><span class="bb-odds">${s.odds.toFixed(2)}</span>
          <span data-remove="${esc(s.id)}" style="cursor:pointer;color:#9a9a9a;">&times;</span></span></div>`).join('')}
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <div style="flex:1;"><span style="font-size:11px;color:#9a9a9a;">Stake (clams)</span>
          <input class="bb-input" id="stake-input" type="number" min="1" value="${state.stake}" style="padding:6px 10px;"/></div>
        <div style="flex:1;"><span style="font-size:11px;color:#9a9a9a;">Combined odds</span>
          <div style="font-weight:600;color:#ffdd00;padding:6px 0;">${combined.toFixed(2)}</div></div>
        <div style="flex:1;"><span style="font-size:11px;color:#9a9a9a;">Potential return</span>
          <div style="font-weight:600;padding:6px 0;">${fmt(Math.round(potential))}</div></div>
        <button class="bb-btn" id="place-bet" style="align-self:flex-end;">Place bet</button>
      </div>
    </div></div>`;
  }

  async function loadMyBets(){
    const ids = await getIndex('bilbbet2_bets_index_' + state.user.username.toLowerCase());
    const bets = (await Promise.all(ids.map(id => sget('bilbbet2_bet:'+id)))).filter(Boolean);
    state.myBets = bets;
    render();
  }

  async function attachHandlers(){
    const $ = sel => document.querySelector(sel);
    const fUser = $('#f-user'); if(fUser) fUser.onchange = e => { state.username = e.target.value; };
    const fPin = $('#f-pin'); if(fPin) fPin.oninput = e => { state.pin = e.target.value; };
    const loginForm = $('#login-form'); if(loginForm) loginForm.onsubmit = e => { e.preventDefault(); doLogin(); };
    const registerBtn = $('#register-submit'); if(registerBtn) registerBtn.onclick = doRegister;
    const logoutBtn = $('#logout-btn');
    if(logoutBtn) logoutBtn.onclick = () => { state = {...state, screen:'main', user:null, username:'', pin:'', error:'', info:'', loginModalOpen:false, slip:[], betMode:'multi', activeTab:'H2H', h2hMarket:null, h2hFixtureMarket:null, myBets:null, adminPunters:null, adminBets:null, novelty:null, statsData:null}; render(); };
    const openLoginBtn = $('#open-login-btn'); if(openLoginBtn) openLoginBtn.onclick = () => { state.loginModalOpen = true; state.error=''; state.info=''; render(); };
    const closeLoginBtn = $('#close-login-modal'); if(closeLoginBtn) closeLoginBtn.onclick = () => { state.loginModalOpen = false; state.error=''; state.info=''; render(); };
    document.querySelectorAll('[data-tab]').forEach(el => el.onclick = () => {
      state.activeTab = el.dataset.tab;
      if(state.activeTab === 'RODDY') state.futureMarketTab = Object.keys(FUTURES.roddy_labels)[0];
      else if(state.activeTab === 'FA CUP') state.futureMarketTab = Object.keys(FUTURES.fa_cup_labels)[0];
      else if(state.activeTab === 'ECL') state.futureMarketTab = Object.keys(FUTURES.ecl_labels)[0];
      else if(!['H2H','MY BETS','ADMIN','SPECIALS','STATS'].includes(state.activeTab)) state.futureMarketTab = Object.keys(FUTURES.market_labels)[0];
      if(state.activeTab === 'MY BETS'){ if(!state.user){ render(); return; } state.myBets = null; render(); loadMyBets(); return; }
      if(state.activeTab === 'ADMIN'){ state.adminPunters = null; state.adminBets = null; render(); loadAdminData(); return; }
      if(state.activeTab === 'SPECIALS'){ state.novelty = null; render(); loadNovelty(); return; }
      if(state.activeTab === 'STATS'){ state.statsData = null; render(); loadStats(); return; }
      render();
    });
    document.querySelectorAll('[data-marketkey]').forEach(el => el.onclick = () => { state.futureMarketTab = el.dataset.marketkey; render(); });
    const teamAEl = $('#team-a'); if(teamAEl) teamAEl.onchange = e => { state.teamA=e.target.value; state.h2hMarket=null; render(); };
    const teamBEl = $('#team-b'); if(teamBEl) teamBEl.onchange = e => { state.teamB=e.target.value; state.h2hMarket=null; render(); };
    const roundEl = $('#h2h-round'); if(roundEl) roundEl.onchange = e => { state.h2hRound=parseInt(e.target.value,10); state.h2hMarket=null; state.h2hFixtureMarket=null; render(); };
    const leadingAtRoundEl = $('#leadingat-round'); if(leadingAtRoundEl) leadingAtRoundEl.onchange = e => { state.leadingAtRound=parseInt(e.target.value,10); render(); };
    const getBtn = $('#get-market'); if(getBtn) getBtn.onclick = () => { state.h2hMarket = computeH2HMarket(state.teamA, state.teamB, state.h2hRound); render(); };
    document.querySelectorAll('[data-h2hsubtab]').forEach(el => el.onclick = () => { state.h2hSubTab = el.dataset.h2hsubtab; state.h2hFixtureMarket=null; render(); });
    document.querySelectorAll('[data-fixture-expand]').forEach(el => el.onclick = () => {
      const [div, idx] = el.dataset.fixtureExpand.split('|');
      state.h2hFixtureMarket = getFixtureMarkets(div, state.h2hRound)[parseInt(idx,10)];
      render();
    });
    const backBtn = $('#back-to-fixtures'); if(backBtn) backBtn.onclick = () => { state.h2hFixtureMarket=null; render(); };
    document.querySelectorAll('[data-pick]').forEach(el => el.onclick = () => {
      if(!state.user){
        alert('You must log in first to place a bet.');
        state.loginModalOpen = true;
        render();
        return;
      }
      const id = el.dataset.pick;
      const existing = state.slip.findIndex(s=>s.id===id);
      if(existing>=0){ state.slip.splice(existing,1); render(); return; }
      const conflict = findConflict(id);
      if(conflict){ alert("Can't add that selection \u2014 " + conflict.msg + "."); return; }
      state.slip.push({id, label: el.dataset.label || el.dataset.team, odds: parseFloat(el.dataset.odds), singleStake: state.stake});
      render();
    });
    document.querySelectorAll('[data-betmode]').forEach(el => el.onclick = () => { state.betMode = el.dataset.betmode; render(); });
    document.querySelectorAll('[data-single-stake]').forEach(el => el.oninput = e => {
      const item = state.slip.find(s=>s.id===el.dataset.singleStake);
      if(item) item.singleStake = Math.max(1, parseInt(e.target.value,10)||1);
    });
    const clearBtn = $('#clear-slip'); if(clearBtn) clearBtn.onclick = () => { state.slip=[]; render(); };
    document.querySelectorAll('[data-remove]').forEach(el => el.onclick = e => { e.stopPropagation(); state.slip = state.slip.filter(s=>s.id!==el.dataset.remove); render(); });
    const stakeInput = $('#stake-input'); if(stakeInput) stakeInput.oninput = e => { state.stake = Math.max(1, parseInt(e.target.value,10)||1); };
    const placeBtn = $('#place-bet'); if(placeBtn) placeBtn.onclick = placeBet;
    const placeSinglesBtn = $('#place-singles'); if(placeSinglesBtn) placeSinglesBtn.onclick = placeBetsAsSingles;
    document.querySelectorAll('[data-adjust-user]').forEach(el => el.onclick = () => {
      const username = el.dataset.adjustUser;
      const input = document.getElementById('adj-'+username);
      const delta = parseInt(input.value, 10);
      if(!delta){ alert('Enter a non-zero amount to add or subtract.'); return; }
      adjustPunterBalance(username, delta);
    });
    document.querySelectorAll('[data-regstatus]').forEach(el => el.onclick = () => {
      const [username, status] = el.dataset.regstatus.split('|');
      updateRegistrationStatus(username, status);
    });
    document.querySelectorAll('[data-setstatus]').forEach(el => el.onclick = () => {
      const [betId, status] = el.dataset.setstatus.split('|');
      setBetStatus(betId, status);
    });
    const addNoveltyBtn = $('#add-novelty'); if(addNoveltyBtn) addNoveltyBtn.onclick = addNoveltyItem;
    const saveRoundBtn = $('#save-current-round');
    if(saveRoundBtn) saveRoundBtn.onclick = () => {
      const sel = document.getElementById('admin-current-round');
      saveCurrentRound(parseInt(sel.value, 10));
    };
    document.querySelectorAll('[data-noveltystatus]').forEach(el => el.onclick = () => {
      const [noveltyId, status] = el.dataset.noveltystatus.split('|');
      resolveNoveltyItem(noveltyId, status);
    });
  }

  async function placeBet(){
    if(!state.user){ alert('You must log in first to place a bet.'); state.loginModalOpen=true; render(); return; }
    const stakeInput = document.getElementById('stake-input');
    const stake = Math.max(1, parseInt(stakeInput.value,10)||1);
    if(!state.slip.length){ alert('Add at least one selection first.'); return; }
    if(stake > state.user.balance){ alert("You don't have that many clams."); return; }
    const combined = combinedOdds();
    const u = await getUser(state.user.username);
    u.balance -= stake;
    await saveUser(u);
    state.user = u;
    const bet = { id: uid(), username: u.username, selections: state.slip, stake, combinedOdds: combined,
                  potentialReturn: Math.round(stake*combined), timestamp: Date.now(), status: 'PENDING' };
    await sset('bilbbet2_bet:'+bet.id, bet);
    await addToIndex('bilbbet2_bets_index_' + u.username.toLowerCase(), bet.id);
    await addToIndex('bilbbet2_all_bets_index', bet.id);
    state.slip = []; state.stake = 50;
    render();
    alert('Bet placed: ' + stake + ' clams to win ' + fmt(bet.potentialReturn) + ' clams. Check "My Bets" to track it.');
  }

  async function placeBetsAsSingles(){
    if(!state.user){ alert('You must log in first to place a bet.'); state.loginModalOpen=true; render(); return; }
    if(!state.slip.length){ alert('Add at least one selection first.'); return; }
    if(state.slip.some(s => !s.singleStake || s.singleStake < 1)){ alert('Every selection needs a stake before placing as singles.'); return; }
    const stakes = state.slip.map(s => Math.max(1, s.singleStake));
    const totalStake = stakes.reduce((a,b)=>a+b,0);
    if(totalStake > state.user.balance){ alert("You don't have enough clams to cover all of those singles."); return; }
    const u = await getUser(state.user.username);
    u.balance -= totalStake;
    await saveUser(u);
    state.user = u;
    for(const item of state.slip){
      const stake = Math.max(1, item.singleStake||0);
      const bet = { id: uid(), username: u.username, selections: [item], stake, combinedOdds: item.odds,
                    potentialReturn: Math.round(stake*item.odds), timestamp: Date.now(), status: 'PENDING' };
      await sset('bilbbet2_bet:'+bet.id, bet);
      await addToIndex('bilbbet2_bets_index_' + u.username.toLowerCase(), bet.id);
      await addToIndex('bilbbet2_all_bets_index', bet.id);
    }
    const count = state.slip.length;
    state.slip = []; state.stake = 50;
    render();
    alert('Placed ' + count + ' single bets totalling ' + totalStake + ' clams staked. Check "My Bets" to track them.');
  }

  async function doLogin(){
    const username = state.username.trim(), pin = state.pin.trim();
    state.info = '';
    if(!username || !pin){ state.error='Enter a username and PIN.'; render(); return; }

    // precoded admin login -- bypasses the normal team-account/approval system entirely.
    if(username.toLowerCase() === 'admin'){
      if(pin !== '2845'){ state.error='Wrong PIN.'; render(); return; }
      let adminUser = await getUser('admin');
      if(!adminUser){
        adminUser = { username: 'admin', pinHash: simpleHash('2845'), balance: 0, isAdmin: true, status: 'APPROVED', everFunded: true };
        await saveUser(adminUser);
        await addToIndex('bilbbet2_users_index', 'admin');
      }
      state.user = adminUser; state.error=''; state.username=''; state.pin=''; state.screen='main'; state.loginModalOpen=false;
      state.activeTab='H2H'; state.adminPunters=null; state.adminBets=null; state.novelty=null; state.statsData=null; state.myBets=null;
      render();
      return;
    }

    const u = await getUser(username);
    if(!u){ state.error='No account with that username. Try "create account" below.'; render(); return; }
    if(u.pinHash !== simpleHash(pin)){ state.error='Wrong PIN.'; render(); return; }
    const status = u.status || 'APPROVED';
    if(status === 'PENDING'){ state.error='Your registration is still awaiting admin approval \u2014 check back soon.'; state.username=''; state.pin=''; render(); return; }
    if(status === 'REJECTED'){ state.error='Your registration was rejected. Contact the admin if you think that\u2019s a mistake.'; state.username=''; state.pin=''; render(); return; }
    state.user = u; state.error=''; state.username=''; state.pin=''; state.screen='main'; state.loginModalOpen=false;
    state.activeTab='H2H'; state.adminPunters=null; state.adminBets=null; state.novelty=null; state.statsData=null; state.myBets=null;
    render();
  }

  async function doRegister(){
    const username = state.username.trim(), pin = state.pin.trim();
    state.info = '';
    if(username.toLowerCase() === 'admin'){ state.error='That name is reserved for the admin login.'; render(); return; }
    if(!username || pin.length<4){ state.error='Pick a username and a PIN of at least 4 digits.'; render(); return; }
    const existing = await getUser(username);
    if(existing){ state.error='That username is taken. Log in instead.'; render(); return; }
    const isFirstEver = (await getIndex('bilbbet2_users_index')).length === 0;
    // the very first account ever registered becomes admin and is auto-approved
    // (there's no admin yet to approve them); everyone after that starts PENDING
    // with no funds until an admin approves them.
    const u = isFirstEver
      ? { username, pinHash: simpleHash(pin), balance: 1000, isAdmin: true, status: 'APPROVED', everFunded: true }
      : { username, pinHash: simpleHash(pin), balance: 0, isAdmin: false, status: 'PENDING', everFunded: false };
    const saved = await sset('bilbbet2_user:' + username.toLowerCase(), u);
    if(!saved){ state.error='Could not save your account (storage unavailable). Try reloading.'; render(); return; }
    await addToIndex('bilbbet2_users_index', username);
    if(isFirstEver){
      state.user = u; state.error=''; state.username=''; state.pin=''; state.screen='main'; state.loginModalOpen=false;
      state.activeTab='H2H'; state.adminPunters=null; state.adminBets=null; state.novelty=null; state.statsData=null; state.myBets=null;
    } else {
      state.username=''; state.pin=''; state.error='';
      state.info = `Registration submitted for ${username} \u2014 an admin needs to approve your account before you can log in and get your starting clams.`;
    }
    render();
  }

  const savedCurrentRound = await sget('bilbbet2_current_round');
  if(savedCurrentRound){ state.currentRound = savedCurrentRound; state.h2hRound = savedCurrentRound; state.leadingAtRound = savedCurrentRound; }

  render();
})();
