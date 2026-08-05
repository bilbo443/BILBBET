(async function(){
  const DATA = {};
  // Catches a real, repeated failure mode: a data file getting the WRONG
  // file's content deployed under its name (this has happened twice --
  // h2h_shift.json once held h2h_history's score arrays instead of plain
  // shift numbers, and team_market_coeffs.json once held a plain team-name
  // list instead of coefficients). Each check is deliberately loose --
  // just enough to catch "this is obviously the wrong shape of data", not
  // a full schema validator that becomes a maintenance burden.
  function validateDataShape(name, data){
    if(data === null || data === undefined) return 'came back empty';
    const isPlainNumber = v => typeof v === 'number' && !Array.isArray(v);
    const isArray = v => Array.isArray(v);
    if(name === 'h2h_shift' || name === 'h2h_variance_widen' || name === 'h2h_cup_shift'){
      const vals = Object.values(data);
      if(!vals.length) return 'has no teams at all';
      if(!vals.every(isPlainNumber)) return 'should be plain {team: number} values, but found something else (an array or object) -- likely the wrong file\u2019s content got deployed under this name';
    }
    if(name === 'h2h_history'){
      const vals = Object.values(data);
      if(!vals.length) return 'has no teams at all';
      if(!vals.every(isArray)) return 'should be {team: [scores]} arrays, but found something else -- likely the wrong file\u2019s content got deployed under this name';
    }
    if(name === 'h2h_divisions'){
      const vals = Object.values(data);
      if(!vals.length) return 'has no divisions at all';
      if(!vals.every(v => isArray(v) && v.every(t => typeof t === 'string'))) return 'should be {division: [team names]}, but found something else';
    }
    if(name === 'futures'){
      if(!data.divisions || !data.roddy) return 'is missing expected top-level sections (divisions/roddy) -- likely an incomplete or wrong file';
    }
    if(name === 'special_markets'){
      if(!Array.isArray(data.charity) || !Array.isArray(data.philanthropy)) return 'is missing the expected charity/philanthropy market lists';
    }
    if(name === 'h2h_record'){
      if(!Array.isArray(data) || (data.length && typeof data[0].played !== 'number')) return 'should be a list of pairwise records with a played count, but found something else';
    }
    if(name === 'h2h_schedule'){
      const vals = Object.values(data);
      if(!vals.length) return 'has no divisions at all';
      const first = vals[0];
      if(!isArray(first) || !isArray(first[0]) || !isArray(first[0][0])) return 'should be {division: [rounds of team-pairs]}, but found something else';
    }
    if(name === 'cup_calendar'){
      if(!data.fa_cup || !data.ecl || typeof data.fa_cup !== 'object' || Array.isArray(data.fa_cup)) return 'should have fa_cup/ecl round-to-stage mappings, but found something else';
    }
    if(name === 'carry_balances'){
      const vals = Object.values(data);
      if(!vals.length) return 'has no teams at all';
      if(!vals.every(v => v && typeof v === 'object' && !Array.isArray(v) && typeof v.carry === 'number')) return 'should be {team: {carry: number, ...}}, but found something else';
    }
    if(name === 'round_dates'){
      const vals = Object.values(data);
      if(!vals.length) return 'has no rounds at all';
      if(!vals.every(v => typeof v === 'string')) return 'should be {round: date string}, but found something else';
    }
    if(name === 'div23_schedule_exceptions'){
      const vals = Object.values(data);
      if(!vals.length) return 'has no divisions at all';
      if(!vals.every(v => v && isArray(v.no_fixture_rounds))) return 'should be {division: {no_fixture_rounds: [...], ...}}, but found something else';
    }
    if(name === 'real_results'){
      const vals = Object.values(data);
      // an empty object is the legitimate pre-season state -- nothing to validate yet
      if(vals.length && !vals.every(isArray)) return 'should be {team: [scores]}, but found something else';
    }
    if(name === 'aleague_round_projection'){
      const vals = Object.values(data);
      if(vals.length !== 26) return 'should have exactly 26 rounds, found ' + vals.length;
      if(!vals.every(v => v && typeof v.baseline === 'number' && isArray(v.byes) && isArray(v.doubles)))
        return 'should be {round: {baseline, byes:[...], doubles:[...]}}, but found something else';
    }
    return null;
  }
  async function loadAllData(){
    const files = ['futures','h2h_history','h2h_divisions','h2h_shift','h2h_cup_shift','h2h_variance_widen','h2h_schedule','leading_at','special_markets','h2h_record','cup_calendar','carry_balances','round_dates','div23_schedule_exceptions','real_results','aleague_round_projection'];
    const failures = [];
    const results = await Promise.all(files.map(async name => {
      const path = './data/' + name + '.json';
      let res;
      try {
        res = await fetch(path);
      } catch(e) {
        failures.push(name + ' (network error: ' + e.message + ')');
        return null;
      }
      if(!res.ok){
        if(name === 'real_results'){
          // Won't exist until the first real round of live season data has
          // actually gone through the pipeline -- that's the normal
          // pre-season state, not a missing-file error like every other
          // file here.
          return {};
        }
        failures.push(name + ' (HTTP ' + res.status + ' -- check the file exists at data/' + name + '.json)');
        return null;
      }
      let parsed;
      try {
        parsed = await res.json();
      } catch(e) {
        failures.push(name + ' (response wasn\u2019t valid JSON -- likely a 404 page was returned instead of the real file)');
        return null;
      }
      const shapeIssue = validateDataShape(name, parsed);
      if(shapeIssue){
        failures.push(name + ' (' + shapeIssue + ')');
        return null;
      }
      return parsed;
    }));
    if(failures.length){
      throw new Error('Failed to load: ' + failures.join('; '));
    }
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
  const H2H_CUP_SHIFT = DATA.h2h_cup_shift || {};
  const REAL_RESULTS = DATA.real_results || {};
  const H2H_VARIANCE_WIDEN = DATA.h2h_variance_widen || {};
  const H2H_SCHEDULE = DATA.h2h_schedule;
  const SPECIAL_MARKETS = DATA.special_markets;
  const H2H_RECORD = {};
  DATA.h2h_record.forEach(r => { H2H_RECORD[r.teamA+'|'+r.teamB] = r; });
  // Records are stored once per pair (alphabetical order) -- this looks up
  // either direction and flags whether the stored record needs its
  // win/loss flipped to describe teamA/teamB in the order asked for.
  function getH2HRecord(teamA, teamB){
    if(H2H_RECORD[teamA+'|'+teamB]) return { rec: H2H_RECORD[teamA+'|'+teamB], flipped: false };
    if(H2H_RECORD[teamB+'|'+teamA]) return { rec: H2H_RECORD[teamB+'|'+teamA], flipped: true };
    return null;
  }
  const CUP_CALENDAR = DATA.cup_calendar; // {fa_cup: {round: stageName}, ecl: {round: stageName}}
  const CUP_CALENDAR_KEY = { 'FA CUP': 'fa_cup', 'ECL': 'ecl' };
  // Whether a given round is a scheduled cup weekend for a competition --
  // an admin override (if set) always wins over the calendar, since the
  // calendar note itself says rounds can move to dodge unplanned byes/doubles.
  function getCupRoundInfo(comp, round){
    const overrides = state.cupCalendarOverrides[comp] || {};
    if(Object.prototype.hasOwnProperty.call(overrides, round)){
      const ov = overrides[round];
      return ov ? { stage: ov, overridden: true } : null;
    }
    const stage = (CUP_CALENDAR[CUP_CALENDAR_KEY[comp]] || {})[round];
    return stage ? { stage, overridden: false } : null;
  }
  function getCalendarDefault(comp, round){
    return (CUP_CALENDAR[CUP_CALENDAR_KEY[comp]] || {})[round] || null;
  }
  const CARRY_BALANCES = DATA.carry_balances; // {teamName: {carry, historicalRecord}}
  const ROUND_DATES = DATA.round_dates; // {round: 'YYYY-MM-DD' kickoff date}
  const ALEAGUE_PROJECTION = DATA.aleague_round_projection; // {round: {baseline, byes:[...], doubles:[...]}}
  const DIV23_EXCEPTIONS = DATA.div23_schedule_exceptions; // {div: {no_fixture_rounds, playoff_rounds}}
  function hasNoFixtures(div, round){
    const ex = DIV23_EXCEPTIONS[div];
    return !!(ex && ex.no_fixture_rounds.includes(round));
  }
  function isPlayoffRound(div, round){
    const ex = DIV23_EXCEPTIONS[div];
    return !!(ex && ex.playoff_rounds.includes(round));
  }
  // Whether the current round's scheduled date has arrived -- checked on
  // render, not on a timer, so it only ever moves state the moment someone
  // has the page open on or after that date, never silently in the background.
  function scheduledCloseDue(){
    const dateStr = ROUND_DATES[state.currentRound];
    if(!dateStr) return false;
    return new Date() >= sydneyKickoffUTC(dateStr);
  }
  // Which round (if any) a pick is locked to. Season-long markets (division
  // futures, Roddy, cup stages, charity/philanthropy, novelty) return null --
  // closing betting for a round never touches those, only picks tied to that
  // exact round (H2H matches, leading-at-this-round, win/lose-this-round).
  function getPickRound(id){
    const parts = id.split('|');
    if(parts[0]==='H2H') return parseInt(parts[2].replace('R',''),10);
    if(parts[0]==='LEADAT') return parseInt(parts[2],10);
    if(parts[0]==='SPECIALFIX' && (parts[1]==='win_round'||parts[1]==='lose_round')) return parseInt(parts[2].replace('R',''),10);
    return null;
  }
  // Suggests WON/LOST once real results exist for the round a pick refers
  // to -- never auto-applies anything, just surfaces a computed suggestion
  // for an admin to confirm or override. Deliberately scoped to H2H-style
  // picks only for now (regular division matches, FA Cup, ECL, and
  // Playoffs all share this exact pick format, so one function covers all
  // four). Leading-at, round win/lose specials, season-long futures, and
  // anything else return null -- no suggestion, stays fully manual -- not
  // because they're impossible to resolve automatically, just not yet
  // built out.
  function computeSuggestedResult(pickId){
    const parts = pickId.split('|');
    if(parts[0] !== 'H2H') return null;
    const side = parts[1]; // 'res-a' or 'res-b'
    const round = parseInt(parts[2].replace('R',''), 10);
    const teamA = parts[3], teamB = parts[4];
    if(!teamA || !teamB || isNaN(round)) return null;
    const scoresA = REAL_RESULTS[teamA], scoresB = REAL_RESULTS[teamB];
    if(!scoresA || !scoresB) return null;
    const scoreA = scoresA[round-1], scoreB = scoresB[round-1];
    if(scoreA == null || scoreB == null) return null; // that round hasn't actually been played yet
    if(scoreA === scoreB) return null; // a genuine draw -- no clear "to win" suggestion, needs a human call
    const aWon = scoreA > scoreB;
    if(side === 'res-a') return aWon ? 'WON' : 'LOST';
    if(side === 'res-b') return aWon ? 'LOST' : 'WON';
    return null;
  }
  // Derives the pausable "category" (a whole market, not one team's row in
  // it) from a pick ID. FUT|division|marketKey|team -> division|marketKey.
  // cupTag|marketKey|team -> cupTag|marketKey. ECLGROUP|group|team ->
  // ECLGROUP|group. Anything else (H2H, LEADAT, SPECIALFIX, etc.) has no
  // category-pause concept -- those are governed by round open/close instead.
  function pickCategory(id){
    const parts = id.split('|');
    if(parts[0] === 'FUT') return parts[1] + '|' + parts[2];
    if(parts[0] === 'FACUP' || parts[0] === 'ECL') return parts[0] + '|' + parts[1];
    if(parts[0] === 'ECLGROUP') return parts[0] + '|' + parts[1];
    return null;
  }
  // Whether a pick is currently unbettable, given the admin's close scope.
  // 'h2h' scope (the default) only ever blocks picks tied to the exact
  // current round; 'all' scope blocks everything, including season-long
  // futures, while betting's closed.
  // Same blocking rule as isPickBlocked's round logic, but for checking a
  // round directly (e.g. to decide whether to show a market's full list at
  // all) rather than one specific pick.
  function isRoundBlocked(round){
    if(round < state.currentRound) return true;
    if(state.roundBettingOpen) return false;
    if(round === state.currentRound) return true;
    return state.closeScope === 'all';
  }

  function isPickBlocked(id){
    const category = pickCategory(id);
    if(category && state.pausedCategories[category]) return true;
    const r = getPickRound(id);
    // A round that's already been played has a fully public, known outcome --
    // always blocked regardless of open/close state. Leaving this to the
    // round-close toggle alone was a real gap: only the CURRENT round was
    // ever protected, so anyone could select an already-finished round
    // (the dropdown disabling past rounds is cosmetic only, not a real
    // barrier) and bet on an outcome that's already certain.
    if(r !== null && r < state.currentRound) return true;
    if(state.roundBettingOpen) return false;
    if(r !== null && r === state.currentRound) return true;
    return state.closeScope === 'all';
  }
  async function toggleCategoryPause(category){
    if(state.pausedCategories[category]) delete state.pausedCategories[category];
    else state.pausedCategories[category] = true;
    await sset('bilbbet2_paused_categories', state.pausedCategories);
    render();
  }
  const K = 8;

  const FUTURE_DIVS = Object.keys(FUTURES.divisions);
  const BASE_TABS = ['HOME', 'FUTURES', 'H2H', 'SPECIALS', 'STATS', 'MY BETS'];
  function currentTabs(){ return state.user && state.user.isAdmin ? [...BASE_TABS, 'ADMIN'] : BASE_TABS; }

  // Embed mode: a stripped-down, read-only view of just the Home tab, for
  // embedding on other sites (e.g. the Eliza Cup site's own page) via
  // iframe. Detected once from the URL and never changes for the life of
  // this page load. Deliberately checked via a real query param rather
  // than assumed from context, so the normal in-app experience is 100%
  // unaffected unless this exact param is present.
  const EMBED_MODE = new URLSearchParams(window.location.search).get('embed') === 'home';

  let state = {
    screen:'main', user:null, error:'', info:'', loginModalOpen:false,
    username:'', pin:'', adminLoginMode:false, storageDegraded:false,
    activeTab:'HOME',
    futureMarketTab: FUTURE_DIVS.length ? Object.keys(FUTURES.market_labels)[0] : null,
    teamA:'', teamB:'', h2hRound:1, h2hMarket:null,
    h2hSubTab: FUTURE_DIVS[0], h2hFixtureMarket: null,
    futuresSubTab: FUTURE_DIVS[0],
    slip:[], stake:50, betMode:'multi', useBoost:false,
    myBets:null,
    adminPunters:null, adminBets:null, novelty:null, statsData:null, suggestions:null, suggestionText:'',
    currentRound: 1,       // the next round yet to be played; anything before this is "past"
    leadingAtRound: 1,
    specialsRound: 1,
    specialsExtremeExpanded: null, // 'win_round' | 'lose_round' | null -- which list is open
    editingNoveltyId: null,
    cupFixtureMarketStage: null,
    playoffFixtureMarketStage: null,
    specialsSelection: { win_round: '', lose_round: '', charity: '', philanthropy: '' },
    specialsSubTab: 'round',
    teamSearchOpen: false, teamSearchQuery: '',
    registeringMode: false,
    tosModalOpen: false, tosMode: 'view', tosAgreed: false, readMeModalOpen: false,
    cupFixtures: { 'FA CUP': [], 'ECL': [] },
    cupFixtureMarket: null,
    cupAdminEntry: { 'FA CUP': {teamA:'', teamB:''}, 'ECL': {teamA:'', teamB:''} },
    cupCalendarOverrides: { 'FA CUP': {}, 'ECL': {} },  // round -> stage name string, or false to force "not a cup round"
    playoffFixtures: { 'DIVISION 2': [], 'DIVISION 3': [] },
    playoffFixtureMarket: null,
    playoffSubTab: 'DIVISION 2',
    playoffAdminEntry: { 'DIVISION 2': {teamA:'',teamB:'',stage:'Qualifying Final'}, 'DIVISION 3': {teamA:'',teamB:'',stage:'Qualifying Final'} },
    adminSubTab: 'season',
    betSubmissionInProgress: false,
    homeBestValueWinner: null, homeBestBet: null, featuredFixturesData: null,
    eclGroups: { A: [], B: [], C: [] },
    eclGroupAdminPick: '',
    roundBettingOpen: true,
    closeScope: 'h2h', // 'h2h' or 'all' -- which markets the current closure covers
    pausedCategories: {},
    oddsRefreshRequested: false,
  };

  // For building an HTML element id out of a value that might contain
  // spaces or other characters -- e.g. division names like "DIVISION 2".
  // A raw space in an id, while sometimes rendered by browsers, is invalid
  // per the HTML spec and breaks the moment it is queried via
  // document.querySelector('#'+id), since a CSS id selector treats a space
  // as a descendant combinator, not part of the id -- this was the actual
  // cause of a real, long-standing bug (attachHandlers throwing partway
  // through on every single render, silently breaking every button wired
  // up after it in the same function, found via a browser console error).
  function idSafe(s){ return String(s).replace(/[^a-zA-Z0-9_-]/g, '-'); }
  function esc(s){ return String(s).replace(/[&<>"'\x27]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function fmt(n){ return Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2}); }

  // ---------- Logo provision: teams, divisions, competitions ----------
  // Drop image files into these paths (relative to index.html) and they'll be
  // picked up automatically, no code changes needed:
  //   assets/logos/teams/<slug>.png         e.g. assets/logos/teams/big-mac-fc.png
  //   assets/logos/divisions/<slug>.png     e.g. assets/logos/divisions/division-2a.png
  //   assets/logos/competitions/<slug>.png  e.g. assets/logos/competitions/fa-cup.png
  // Until a given file exists, that badge silently falls back to a coloured
  // circle with the name's initials -- nothing breaks, nothing shows a broken
  // image icon. Uses the browser's own image-load failure (onerror) to detect
  // a missing file, since a static site has no way to check in advance.
  function logoSlug(name){
    return String(name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  }
  function logoInitials(name){
    const words = String(name).replace(/[^A-Za-z0-9 ]/g,' ').trim().split(/\s+/).filter(Boolean);
    if(!words.length) return '?';
    if(words.length === 1) return words[0].slice(0,2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  // Divisions/competitions reuse the same colours as their tab ribbons, for
  // visual consistency; anything not in this list (i.e. every team) gets a
  // deterministic colour derived from its own name instead, so the same team
  // always gets the same colour without needing a lookup table for all 62.
  const KNOWN_ENTITY_COLORS = {
    'ELIZA CUP (D1)': '#28427c', 'DIVISION 2A': '#bc3532', 'DIVISION 2B': '#990000',
    'DIVISION 3A': '#6aa84f', 'DIVISION 3B': '#274e13', 'FA CUP': '#0a2f85', 'ECL': '#111111', 'RODDY': '#ffdd00',
  };
  function logoColor(name){
    if(KNOWN_ENTITY_COLORS[name]) return KNOWN_ENTITY_COLORS[name];
    let hash = 0;
    for(let i=0;i<name.length;i++) hash = (hash*31 + name.charCodeAt(i)) >>> 0;
    return `hsl(${hash % 360}, 45%, 32%)`;
  }
  function logoBadge(kind, name, size){
    size = size || 26;
    const slug = logoSlug(name);
    const path = 'assets/logos/' + kind + 's/' + slug + '.png';
    const color = logoColor(name);
    const fg = (kind === 'competition' && name === 'RODDY') ? '#1b1b1b' : '#fff'; // gold badge needs dark text to stay legible
    const initial = esc(logoInitials(name));
    return `<span style="position:relative;display:inline-block;width:${size}px;height:${size}px;min-width:${size}px;vertical-align:middle;">
      <span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;border-radius:50%;background:${color};color:${fg};font-size:${Math.round(size*0.38)}px;font-weight:700;">${initial}</span>
      <img src="${esc(path)}" alt="" style="position:absolute;top:0;left:0;width:100%;height:100%;border-radius:50%;object-fit:contain;" onerror="this.style.display='none';" onload="this.previousElementSibling.style.background='#1b1b1b';this.previousElementSibling.textContent='';"/>
    </span>`;
  }
  function teamLogo(name, size){ return logoBadge('team', name, size); }
  function divisionLogo(name, size){ return logoBadge('division', name, size); }
  function competitionLogo(name, size){ return logoBadge('competition', name, size); }
  function siteLogoBadge(size){
    size = size || 32;
    return `<span style="position:relative;display:inline-block;width:${size}px;height:${size}px;min-width:${size}px;vertical-align:middle;">
      <span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;border-radius:50%;background:#ffdd00;color:#1b1b1b;font-size:${Math.round(size*0.42)}px;font-weight:700;">B</span>
      <img src="assets/logos/site.png" alt="" style="position:absolute;top:0;left:0;width:100%;height:100%;border-radius:50%;object-fit:contain;" onerror="this.style.display='none';" onload="this.previousElementSibling.style.background='#1b1b1b';this.previousElementSibling.textContent='';"/>
    </span>`;
  }
  // Platform-wide rule: every date/time shown anywhere is Sydney time, correct
  // for whichever of AEST/AEDT actually applies on that date -- never the
  // viewer's own browser timezone. Intl's IANA timezone database handles the
  // daylight-saving transition dates automatically; nothing here is hardcoded.
  const SYDNEY_TZ = 'Australia/Sydney';
  function fmtDate(ts){
    const d = new Date(ts);
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: SYDNEY_TZ, day:'2-digit', month:'2-digit', year:'numeric',
      hour:'2-digit', minute:'2-digit', hour12:true, timeZoneName:'short',
    }).format(d);
  }
  // Sydney's UTC offset is +10 (AEST) or +11 (AEDT) depending on the date --
  // this reads the real offset for a specific date from the timezone
  // database rather than assuming either one.
  function sydneyOffsetHours(dateStr){
    const probe = new Date(dateStr + 'T12:00:00Z'); // midday UTC, safe from any day-boundary edge case
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: SYDNEY_TZ, timeZoneName: 'longOffset' }).formatToParts(probe);
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    const match = tzPart && tzPart.value.match(/GMT([+-]\d+)/);
    return match ? parseInt(match[1], 10) : 11; // AEDT as the safer fallback if parsing ever fails
  }
  // No kickoff times are given for A-League-style rounds, only dates -- per
  // house rule, the round's first match is assumed to kick off at 7:00pm
  // Sydney time, DST-adjusted for that specific date.
  function sydneyKickoffUTC(dateStr){
    const offset = sydneyOffsetHours(dateStr);
    const utcHour = 19 - offset; // 7pm Sydney is always still the same UTC calendar date, since the offset (10-11h) never pushes it past midnight backward
    return new Date(dateStr + 'T' + String(utcHour).padStart(2,'0') + ':00:00Z');
  }
  function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
  function simpleHash(s){ let h=0; for(let i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))|0;} return String(h); }

  // ---------- storage: Supabase (if configured) -> window.storage (Claude's
  // artifact panel) -> in-memory (last resort, this browser tab only) ----------
  // Fill these in from your own Supabase project (Project Settings -> API)
  // after running supabase/schema.sql once in the SQL editor. Leave them as
  // the placeholder strings to skip Supabase and fall back automatically.
  const SUPABASE_URL = 'https://dhgkrlimitbordddcaqo.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_fWZvXvtCp1YhfuU47H3fjQ_zDIFGHCB';
  let supabaseClient = null;
  if(SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY && typeof window !== 'undefined' && window.supabase){
    try { supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); }
    catch(e) { console.error('Supabase client failed to initialise:', e); }
  }

  const memoryStore = {};
  const hasRealStorage = typeof window !== 'undefined' && window.storage && typeof window.storage.get === 'function';
  // Tracked live, not just inferred from config at startup -- Supabase can be
  // configured correctly and still fail at runtime (paused project, network
  // issue, quota), and that's exactly the case punters most need a warning
  // about, since everything LOOKS like it's working right up until a refresh
  // wipes it. usingMemoryFallback flips true the moment a write actually
  // lands in the memory-only store; state.storageDegraded mirrors it so the
  // UI can show a persistent banner.
  let usingMemoryFallback = false;

  async function sget(key){
    if(supabaseClient){
      try {
        const { data, error } = await supabaseClient.from('kv_store').select('value').eq('key', key).maybeSingle();
        if(error) throw error;
        return data ? data.value : null;
      } catch(e) { console.error('Supabase read failed for', key, '-- falling back:', e.message); }
    }
    if(!hasRealStorage) return Object.prototype.hasOwnProperty.call(memoryStore,key) ? JSON.parse(memoryStore[key]) : null;
    try{ const r = await window.storage.get(key, true); return r ? JSON.parse(r.value) : null; }catch(e){ return null; }
  }
  async function sset(key, val){
    if(supabaseClient){
      try {
        const { error } = await supabaseClient.from('kv_store').upsert({ key, value: val });
        if(error) throw error;
        return true;
      } catch(e) { console.error('Supabase write failed for', key, '-- falling back:', e.message); }
    }
    if(!hasRealStorage){
      memoryStore[key] = JSON.stringify(val);
      if(!usingMemoryFallback){ usingMemoryFallback = true; state.storageDegraded = true; }
      return true;
    }
    try{ await window.storage.set(key, JSON.stringify(val), true); return true; }catch(e){ return false; }
  }
  async function getIndex(name){ return (await sget(name)) || []; }
  async function addToIndex(name, id){ const list = await getIndex(name); if(!list.includes(id)){ list.push(id); await sset(name, list); } }
  async function getUser(u){ return await sget('bilbbet2_user:' + u.toLowerCase()); }
  // Serializes any read-modify-write sequence on the SAME user's record,
  // regardless of which function initiates it. Found via testing: a punter
  // placing a bet (reads balance, deducts stake, writes) racing against an
  // admin adjusting that same punter's balance (reads, adds, writes) can
  // silently lose one of the two changes entirely if both writes land
  // close together -- confirmed this drops the stake deduction outright,
  // effectively giving a free bet. This is a general pattern across every
  // function that mutates a user record (placing bets, resolving bets,
  // balance adjustments, registration changes), not specific to any one of
  // them, so the fix is general too: any such function should wrap its
  // getUser-modify-saveUser sequence in withUserLock rather than getting a
  // one-off fix each. Different users' operations still run independently
  // -- this only serializes operations on the SAME username.
  const userLocks = {};
  function withUserLock(username, fn){
    const key = username.toLowerCase();
    const prev = userLocks[key] || Promise.resolve();
    const settled = prev.then(fn, fn);
    userLocks[key] = settled.catch(() => {});
    return settled;
  }
  async function saveUser(u){ return await sset('bilbbet2_user:' + u.username.toLowerCase(), u); }

  // ---------- H2H sampling model (bootstrap + shrinkage) ----------
  // widen (0-1): blends in a wider reference pool for teams with very
  // little tracked history -- a team with almost no track record isn't
  // necessarily "probably average" (a plain shift already handles that
  // uncertainty); new/promoted managers plausibly split into genuinely
  // competitive-from-day-one vs. largely disengaged, a real wider spread
  // of outcomes than an established team's uncertainty produces. This is
  // the same mechanism the Python simulation pipeline already uses for
  // division futures/Roddy/FA Cup -- brought here so H2H and ECL group
  // markets get the same treatment rather than only a corrected mean.
  function makeShiftedSampler(values, shift, widen, widePool){
    const shifted = values.map(v => Math.round(v + shift));
    let pool = shifted;
    if(widen && widen > 0 && widePool && widePool.length){
      const nFromWide = Math.max(1, Math.min(Math.round(shifted.length * widen / Math.max(1-widen, 0.05)), widePool.length));
      const extra = [];
      for(let i=0;i<nFromWide;i++){ extra.push(widePool[Math.floor(Math.random()*widePool.length)]); }
      pool = shifted.concat(extra);
    }
    const n = pool.length;
    return function(count){ const out=new Array(count); for(let i=0;i<count;i++){ out[i]=pool[Math.floor(Math.random()*n)]; } return out; };
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
    const widePool = divSampler[div] ? (H2H_DIVISIONS[div].reduce((acc,t)=>H2H_HISTORY[t]?acc.concat(H2H_HISTORY[t]):acc, [])) : allPool;
    for(const t of H2H_DIVISIONS[div]){
      const shift = H2H_SHIFT[t] || 0;
      const widen = H2H_VARIANCE_WIDEN[t] || 0;
      if(H2H_HISTORY[t]){
        const n = H2H_HISTORY[t].length;
        teamInfo[t] = { own: makeShiftedSampler(H2H_HISTORY[t], shift, widen, widePool.length ? widePool : allPool), w: n/(n+K), baseline: divSampler[div] };
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
  // Parallel to teamInfo/sampleTeam above, but using the cup-specific shift
  // (built from the fa_cup/ecl coefficient -- roddy's base strength plus a
  // ceiling/volatility boost for teams that run hotter than their average,
  // since a single-elimination format rewards a high-ceiling day more than
  // a season-long average does) rather than the division-context eliza
  // shift. Used for cross-divisional knockout contexts like ECL groups,
  // where a team's standing relative to its own division isn't really the
  // right comparison.
  const teamInfoCup = {};
  for(const div in H2H_DIVISIONS){
    const widePool = divSampler[div] ? (H2H_DIVISIONS[div].reduce((acc,t)=>H2H_HISTORY[t]?acc.concat(H2H_HISTORY[t]):acc, [])) : allPool;
    for(const t of H2H_DIVISIONS[div]){
      const shift = H2H_CUP_SHIFT[t] || 0;
      const widen = H2H_VARIANCE_WIDEN[t] || 0;
      if(H2H_HISTORY[t]){
        const n = H2H_HISTORY[t].length;
        teamInfoCup[t] = { own: makeShiftedSampler(H2H_HISTORY[t], shift, widen, widePool.length ? widePool : allPool), w: n/(n+K), baseline: makeShiftedSampler(allPool, shift) };
      } else {
        teamInfoCup[t] = { own: null, w: 0, baseline: makeShiftedSampler(allPool, shift) };
      }
    }
  }
  function sampleTeamForCup(team, n){
    const info = teamInfoCup[team];
    if(!info) return sampleTeam(team, n); // fall back gracefully for a team with no cup shift entry
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
  // A modest score bonus for a team with a considerably lopsided all-time
  // record against this specific opponent -- on top of the general
  // simulation, not instead of it. Deliberately conservative: ignores
  // anything under 2 meetings (a single match tells you nothing about a
  // real edge), and requires the win margin itself to be considerable
  // (at least 3 more wins than losses), not just a narrow lead.
  const H2H_EDGE_MIN_PLAYED = 2;
  const H2H_EDGE_MIN_WIN_MARGIN = 3;
  const H2H_EDGE_POINTS_PER_WIN = 0.5;
  const H2H_EDGE_MAX_BONUS = 6;
  const CURRENT_SEASON_START_YEAR = 26; // "26/27" -- update each season rollover
  // The H2H data only ever gives an aggregate record plus the single most
  // recent meeting's summary (no per-meeting log), so true per-match
  // recency weighting isn't possible -- this is the honest approximation:
  // decay the whole edge by how long ago that LAST meeting was. A rivalry
  // that's been dormant for years shouldn't carry the same weight as one
  // that's still active, even if the all-time record looks identical.
  function h2hRecencyDecay(lastMatchStr){
    if(!lastMatchStr) return 1.0;
    const m = lastMatchStr.match(/^(\d{2})\/\d{2}/);
    if(!m) return 1.0;
    const seasonsAgo = CURRENT_SEASON_START_YEAR - parseInt(m[1], 10);
    if(seasonsAgo <= 1) return 1.0;
    if(seasonsAgo === 2) return 0.7;
    if(seasonsAgo === 3) return 0.45;
    return 0.25;
  }
  function h2hEdgeBonus(teamA, teamB){
    const found = getH2HRecord(teamA, teamB);
    if(!found) return { aBonus: 0, bBonus: 0, applied: false };
    const r = found.rec;
    if(r.played < H2H_EDGE_MIN_PLAYED) return { aBonus: 0, bBonus: 0, applied: false };
    const aWins = found.flipped ? r.aLosses : r.aWins;
    const aLosses = found.flipped ? r.aWins : r.aLosses;
    const winMargin = aWins - aLosses;
    if(Math.abs(winMargin) < H2H_EDGE_MIN_WIN_MARGIN) return { aBonus: 0, bBonus: 0, applied: false };
    const decay = h2hRecencyDecay(r.lastMatch);
    const magnitude = Math.min(Math.abs(winMargin) * H2H_EDGE_POINTS_PER_WIN, H2H_EDGE_MAX_BONUS) * decay;
    return winMargin > 0
      ? { aBonus: magnitude, bBonus: 0, applied: true, favored: teamA, winMargin, played: r.played, decay }
      : { aBonus: 0, bBonus: magnitude, applied: true, favored: teamB, winMargin, played: r.played, decay };
  }

  function computeH2HMarket(teamA, teamB, round, nSims){
    nSims = nSims || 20000;
    let a = sampleTeam(teamA,nSims), b = sampleTeam(teamB,nSims);
    const edge = h2hEdgeBonus(teamA, teamB);
    if(edge.applied){
      if(edge.aBonus) a = a.map(x => Math.round(x + edge.aBonus));
      if(edge.bBonus) b = b.map(x => Math.round(x + edge.bBonus));
    }
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
      aRange, bRange, line, aCoversPct:aCovers/nSims*100, bCoversPct:bCovers/nSims*100, edge };
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

  // Selects this round's featured H2H-style picks for the Home tab: cup/
  // playoff/ECL fixtures (if scheduled this round) get priority, then each
  // division contributes roughly 15-25% of its own match count for the
  // round (rounded, capped at 2), always backing whichever side is the
  // more competitive underdog -- a genuine, non-trivial chance, not a
  // near-hopeless punt -- so every pick is framed as a positive "to win"
  // outcome, never "to lose". Capped at 10 total across everything.
  const FEATURED_BOOST_MULTIPLIER = 1.25; // the promotional boost on every Home-tab featured pick
  function pickValueSide(m, roundTag, division, extra){
    const aIsDog = m.aWinPct < m.bWinPct;
    const dogPct = aIsDog ? m.aWinPct : m.bWinPct;
    if(dogPct < 20) return null; // too much of a long-shot to read as genuine value
    const team = aIsDog ? m.teamA : m.teamB;
    const opp = aIsDog ? m.teamB : m.teamA;
    const side = aIsDog ? 'res-a' : 'res-b';
    const oddsInfo = toOdds(dogPct);
    if(oddsInfo.suspended) return null;
    const id = 'H2H|' + side + '|' + roundTag + '|' + m.teamA + '|' + m.teamB;
    const boosted = Math.round(oddsInfo.odds * FEATURED_BOOST_MULTIPLIER * 100) / 100;
    return { id, team, opp, pct: dogPct, baseOdds: oddsInfo.odds, odds: boosted, division, ...extra };
  }

  // A-League fantasy point projection: pro-rates the new platform's median
  // team score (11 scoring players x 3.7 median, plus one extra copy for
  // the captain's double = 44.4) against how many real A-League matches
  // each club actually has that round -- a bye pulls the baseline down, a
  // double gameweek pushes it up. Purely a projection display; doesn't
  // feed into odds or any other part of the platform.
  function renderPointProjection(round){
    const proj = ALEAGUE_PROJECTION[round];
    if(!proj) return '';
    const STANDARD = 44.4;
    let note;
    if(proj.byes.length){
      note = `Down from the usual ${STANDARD} \u2014 ${proj.byes.join(' and ')} ${proj.byes.length>1?'are':'is'} on a bye.`;
    } else if(proj.doubles.length){
      note = `Up from the usual ${STANDARD} \u2014 ${proj.doubles.join(' and ')} ${proj.doubles.length>1?'have':'has'} a double this round.`;
    } else {
      note = 'A standard round \u2014 every club plays exactly once.';
    }
    return `<div class="bb-card" style="margin-bottom:1rem;">
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;">
        <span style="font-size:12px;color:#9a9a9a;text-transform:uppercase;letter-spacing:0.05em;">Round ${round} projected score</span>
        <span style="font-size:20px;font-weight:800;color:#ffdd00;">${proj.baseline.toFixed(1)} pts</span>
      </div>
      <div style="font-size:12px;color:#9a9a9a;margin-top:2px;">${note}</div>
    </div>`;
  }

  function computeFeaturedFixtures(){
    const round = state.currentRound;
    const roundTag = 'R' + round;
    const MAX_TOTAL = 10, MAX_PER_DIV = 2;
    const selected = [];

    // Cup/playoff/ECL fixtures scheduled this round, prioritized
    for(const comp of ['FA CUP', 'ECL']){
      if(!getCupRoundInfo(comp, round)) continue;
      for(const f of (state.cupFixtures[comp] || [])){
        if(selected.length >= MAX_TOTAL) break;
        const m = computeH2HMarket(f.teamA, f.teamB, round, 4000);
        const pick = pickValueSide(m, roundTag, comp, { stage: f.stage, isCup: true });
        if(pick) selected.push(pick);
      }
    }
    for(const div of ['DIVISION 2', 'DIVISION 3']){
      if(!isPlayoffRound(div, round)) continue;
      for(const f of (state.playoffFixtures[div] || [])){
        if(selected.length >= MAX_TOTAL) break;
        const m = computeH2HMarket(f.teamA, f.teamB, round, 4000);
        const pick = pickValueSide(m, roundTag, div, { stage: f.stage, isCup: true });
        if(pick) selected.push(pick);
      }
    }

    // Regular divisional fixtures, ~15-25% of that division's matches this
    // round. Deliberately reuses getFixtureMarkets (the same function the
    // H2H tab itself calls) rather than computing independently -- found
    // via testing that computeH2HMarket draws a fresh random sample every
    // single call, so two separate computations for the identical fixture
    // could show two different numbers even moments apart. Going through
    // the same cached function guarantees the featured card's crossed-out
    // price and the H2H page's price are reading the exact same value,
    // not just the same underlying data.
    for(const div of FUTURE_DIVS){
      if(selected.length >= MAX_TOTAL) break;
      const alreadyInDiv = selected.filter(s => s.division === div).length;
      let remaining = MAX_PER_DIV - alreadyInDiv;
      if(remaining <= 0) continue;
      const pairs = (H2H_SCHEDULE[div] && H2H_SCHEDULE[div][round - 1]) || [];
      if(!pairs.length) continue;
      const markets = getFixtureMarkets(div, round);
      const picks = [];
      for(const m of markets){
        const pick = pickValueSide(m, roundTag, div, { isCup: false });
        if(pick) picks.push(pick);
      }
      picks.sort((a, b) => b.pct - a.pct); // most competitive underdog first
      const targetCount = Math.max(1, Math.round(pairs.length * 0.20)); // midpoint of the 15-25% range
      for(const p of picks.slice(0, Math.min(targetCount, remaining))){
        if(selected.length >= MAX_TOTAL) break;
        selected.push(p);
      }
    }
    return selected;
  }

  // 2-4 season-long futures picks for the Home tab -- deliberately not
  // shown in the final 3 rounds of the season, since backing a future
  // outcome stops making sense when there's barely any season left for it
  // to play out. Same "genuine, non-trivial chance" value definition used
  // for the external cross-promotion widget: a real shot, not a
  // near-certainty and not a hopeless longshot.
  const POSITIVE_FUTURE_MARKETS = { win_div_pct: 'Win Division', top3_pct: 'Top 3 Finish',
                                     promotion_pct: 'Promotion', roddy_win_pct: 'Roddy Winner' };
  function computeFeaturedFutures(){
    if(state.currentRound >= 24) return []; // final 3 rounds of the 26-round season
    const candidates = [];
    for(const div of FUTURE_DIVS){
      for(const key in POSITIVE_FUTURE_MARKETS){
        for(const r of (FUTURES.divisions[div][key] || [])){
          if(r.suspended) continue;
          const pct = 100 / (r.odds * 1.05);
          if(pct >= 8 && pct <= 25){
            candidates.push({ team: r.team, market: POSITIVE_FUTURE_MARKETS[key], division: div, odds: r.odds,
                               id: 'FUT|' + div + '|' + key + '|' + r.team });
          }
        }
      }
    }
    for(const r of (FUTURES.roddy.roddy_win_pct || [])){
      if(r.suspended) continue;
      const pct = 100 / (r.odds * 1.05);
      if(pct >= 8 && pct <= 25){
        candidates.push({ team: r.team, market: 'Roddy Winner', division: 'RODDY', odds: r.odds,
                           id: 'FUT|RODDY|roddy_win_pct|' + r.team });
      }
    }
    candidates.sort((a, b) => b.odds - a.odds);
    return candidates.slice(0, 4).map(c => ({ ...c, baseOdds: c.odds, odds: Math.round(c.odds * FEATURED_BOOST_MULTIPLIER * 100) / 100 }));
  }

  // The highest-odds market that actually won last round, regardless of
  // whether anyone backed it -- a genuine "you'd have loved this" stat,
  // not tied to what the community actually staked.
  function computeBestValueWinner(){
    const round = state.currentRound - 1;
    if(round < 1) return null;
    let best = null;
    for(const div of FUTURE_DIVS){
      const pairs = (H2H_SCHEDULE[div] && H2H_SCHEDULE[div][round - 1]) || [];
      for(const [teamA, teamB] of pairs){
        const scoreA = REAL_RESULTS[teamA] && REAL_RESULTS[teamA][round - 1];
        const scoreB = REAL_RESULTS[teamB] && REAL_RESULTS[teamB][round - 1];
        if(scoreA == null || scoreB == null || scoreA === scoreB) continue;
        const teamAWon = scoreA > scoreB;
        const winner = teamAWon ? teamA : teamB, loser = teamAWon ? teamB : teamA;
        const m = computeH2HMarket(teamA, teamB, round, 4000);
        const winnerPct = teamAWon ? m.aWinPct : m.bWinPct;
        const oddsInfo = toOdds(winnerPct);
        if(oddsInfo.suspended) continue;
        if(!best || oddsInfo.odds > best.odds){
          best = { team: winner, opp: loser, division: div, odds: oddsInfo.odds, round };
        }
      }
    }
    return best;
  }

  // The highest-odds bet that actually WON last round, among bets punters
  // genuinely placed -- if nobody's winning bet cleared, that's worth
  // saying plainly rather than just showing an empty section.
  //
  // Both featured fixtures and best-value-winner rely on the same random
  // simulation used throughout the app -- fine for a displayed odds number
  // (an invisible, sub-decimal wobble), but a problem for a *discrete
  // selection*: which fixture ranks as "most competitive" among several
  // close ones can flip on a fresh page load, especially in Eliza Cup (14
  // teams, 7 fixtures/round, the most of any division, so the most chances
  // for a close call to go either way) -- confirmed this was happening on
  // every reload, not just occasionally. The underlying sampler bakes
  // Math.random() into its pools at construction time, so making the
  // simulation itself reproducible would mean touching the sampling
  // infrastructure every market in the app depends on -- too much risk for
  // this. Persisting the computed result instead, keyed by round, means
  // it's genuinely computed once -- by whoever loads the page first for
  // that round -- and every visitor after that, on any device, on any
  // future reload, sees that exact same result until the round changes.
  async function loadHomeStats(){
    const round = state.currentRound;
    const prevRound = round - 1;

    const featuredKey = 'bilbbet2_featured_fixtures_R' + round;
    let featured = await sget(featuredKey);
    // Diagnostic logging -- temporary, kept until the "featured match
    // changes on every app.js update" report is pinned down. Check the
    // browser console (F12) next time this reproduces: if "FOUND stored
    // value" shows every time, the storage layer is fine and the change
    // must be happening somewhere else (e.g. in rendering); if it shows
    // "NO stored value, computing fresh" right after an app.js upload,
    // that's the actual smoking gun and narrows this down precisely.
    console.log('[featured-fixtures debug] round=' + round, featured ? 'FOUND stored value' : 'NO stored value, computing fresh');
    if(!featured){
      featured = computeFeaturedFixtures();
      const wrote = await sset(featuredKey, featured);
      console.log('[featured-fixtures debug] wrote fresh value, sset returned:', wrote);
    }
    state.featuredFixturesData = featured;
    render();

    if(prevRound < 1){
      state.homeBestValueWinner = null;
      state.homeBestBet = { none: true, noPriorRound: true };
      render();
      return;
    }
    const bvwKey = 'bilbbet2_best_value_winner_R' + prevRound;
    let bvw = await sget(bvwKey);
    if(bvw === null){
      // sget returning null is ambiguous between "not cached yet" and
      // "cached, and the answer is genuinely nothing" -- store an explicit
      // marker so a real "no winner" result doesn't get recomputed (and
      // risk changing) on every subsequent load.
      bvw = computeBestValueWinner() || { none: true };
      await sset(bvwKey, bvw);
    }
    state.homeBestValueWinner = bvw.none ? null : bvw;
    render();

    const betIds = await getIndex('bilbbet2_all_bets_index');
    const bets = (await Promise.all(betIds.map(id => sget('bilbbet2_bet:' + id)))).filter(Boolean);
    const wonThisRound = bets.filter(b => b.status === 'WON' &&
      b.selections.some(s => getPickRound(s.id) === prevRound));
    wonThisRound.sort((a, b) => b.combinedOdds - a.combinedOdds);
    state.homeBestBet = wonThisRound[0] || { none: true };
    render();
  }

  function renderHomeTab(){
    const fixtures = state.featuredFixturesData || [];
    const fixturesLoading = state.featuredFixturesData === null;
    const futures = computeFeaturedFutures();

    const fixtureCards = fixtures.length ? fixtures.map(p => `
      <div class="bb-card" style="display:flex;align-items:stretch;gap:12px;margin-bottom:8px;">
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:3px;">
          <div style="font-size:11px;color:#9a9a9a;">${p.isCup ? esc(p.stage) + ' \u2014 ' + esc(p.division) : esc(p.division.replace(' (D1)',''))}</div>
          <div style="font-weight:600;display:flex;align-items:center;gap:6px;">${teamLogo(p.team,18)}${esc(p.team)}</div>
          <div style="font-weight:600;display:flex;align-items:center;gap:6px;color:#9a9a9a;font-size:13px;">vs ${esc(p.opp)}</div>
        </div>
        <div style="width:88px;flex-shrink:0;display:flex;flex-direction:column;justify-content:center;gap:2px;">
          <div style="font-size:10px;color:#6a6a6a;text-decoration:line-through;text-align:center;">${p.baseOdds.toFixed(2)}</div>
          ${priceOnlyButton(p.id, p.team + ' to win (boosted)', {odds:p.odds, suspended:false})}
        </div>
      </div>`).join('') : `<div class="bb-card" style="text-align:center;padding:1.5rem;color:#9a9a9a;">${fixturesLoading ? 'Loading&hellip;' : "No featured fixtures this round yet \u2014 check back once the round's matches are set."}</div>`;

    const futureCards = futures.length ? futures.map(p => `
      <div class="bb-card" style="display:flex;align-items:stretch;gap:12px;margin-bottom:8px;">
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:3px;">
          <div style="font-size:11px;color:#9a9a9a;">${esc(p.market)} \u2014 ${esc(String(p.division).replace(' (D1)',''))}</div>
          <div style="font-weight:600;display:flex;align-items:center;gap:6px;">${teamLogo(p.team,18)}${esc(p.team)}</div>
        </div>
        <div style="width:88px;flex-shrink:0;display:flex;flex-direction:column;justify-content:center;gap:2px;">
          <div style="font-size:10px;color:#6a6a6a;text-decoration:line-through;text-align:center;">${p.baseOdds.toFixed(2)}</div>
          ${priceOnlyButton(p.id, esc(p.team) + ' ' + esc(p.market) + ' (boosted)', {odds:p.odds, suspended:false})}
        </div>
      </div>`).join('') : `<div class="bb-card" style="text-align:center;padding:1.5rem;color:#9a9a9a;">${state.currentRound >= 24 ? "No futures featured this late in the season \u2014 not much left for a season-long bet to play out." : "No standout futures right now \u2014 check back soon."}</div>`;

    const bvw = state.homeBestValueWinner;
    const bestValueCard = bvw ? `
      <div class="bb-card" style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:22px;">\u{1F48E}</span>
        <div>
          <div style="font-weight:600;display:flex;align-items:center;gap:6px;">${teamLogo(bvw.team,18)}${esc(bvw.team)} beat ${esc(bvw.opp)}</div>
          <div style="font-size:12px;color:#9a9a9a;">Round ${bvw.round} &middot; ${esc(bvw.division.replace(' (D1)',''))} &middot; would have paid <span style="color:#ffdd00;font-weight:600;">${bvw.odds.toFixed(2)}</span> \u2014 whether anyone backed it or not</div>
        </div>
      </div>` : `<div class="bb-card" style="text-align:center;padding:1.5rem;color:#9a9a9a;">No results in yet for last round.</div>`;

    const bb = state.homeBestBet;
    let bestBetCard;
    if(bb === null){
      bestBetCard = `<div class="bb-card" style="text-align:center;padding:1.5rem;color:#9a9a9a;">Loading&hellip;</div>`;
    } else if(bb.noPriorRound){
      bestBetCard = `<div class="bb-card" style="text-align:center;padding:1.5rem;color:#9a9a9a;">No round completed yet this season \u2014 check back after Round 1.</div>`;
    } else if(bb.none){
      bestBetCard = `<div class="bb-card" style="text-align:center;padding:1.5rem;color:#9a9a9a;">Nobody landed a winning bet last round \u2014 the community isn't betting enough! Get involved for next round.</div>`;
    } else {
      bestBetCard = `
      <div class="bb-card" style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:22px;">\u{1F3C6}</span>
        <div>
          <div style="font-weight:600;">${esc(bb.username)}'s bet won at ${bb.combinedOdds.toFixed(2)}</div>
          <div style="font-size:12px;color:#9a9a9a;">${bb.selections.length} selection${bb.selections.length>1?'s':''} &middot; ${fmt(bb.stake)} staked &middot; returned <span style="color:#ffdd00;font-weight:600;">${fmt(bb.potentialReturn)}</span> clams</div>
        </div>
      </div>`;
    }

    return `
      <div class="bb-card" style="background:linear-gradient(135deg,#2a2410,#1a1a1a);border-color:#4a3a10;margin-bottom:16px;text-align:center;padding:1.25rem;">
        <div style="font-size:12px;letter-spacing:0.08em;color:#ffdd00;text-transform:uppercase;font-weight:700;">This week's boosted odds</div>
        <div style="font-size:12px;color:#9a9a9a;margin-top:4px;">Every pick below is +${Math.round((FEATURED_BOOST_MULTIPLIER-1)*100)}% on the normal price \u2014 just for being featured.</div>
      </div>
      ${renderPointProjection(state.currentRound)}
      <h3 style="margin-top:0;">Featured fixtures</h3>
      ${fixtureCards}
      <h3>Featured futures</h3>
      ${futureCards}
      <h3>Best value that actually won last round</h3>
      ${bestValueCard}
      <h3>Best winning bet last round</h3>
      ${bestBetCard}
    `;
  }

  // Open-field "who tops/bottoms the current round" market -- genuinely
  // round-dependent (moves as the admin advances the season), so this is
  // computed live in the browser from the same samplers as everything else,
  // rather than precomputed, and cached per round so repeat renders don't
  // re-run the simulation.
  const ALL_TEAMS = Object.keys(H2H_SHIFT);
  const roundExtremeCache = {};
  function computeRoundExtremes(round, nSims){
    if(roundExtremeCache[round]) return roundExtremeCache[round];
    nSims = nSims || 8000;
    const winCounts = {}, loseCounts = {};
    ALL_TEAMS.forEach(t => { winCounts[t] = 0; loseCounts[t] = 0; });
    const samples = {};
    ALL_TEAMS.forEach(t => { samples[t] = sampleTeam(t, nSims); });
    for(let i=0;i<nSims;i++){
      let best=-Infinity, bestTeam=null, worst=Infinity, worstTeam=null;
      for(const t of ALL_TEAMS){
        const s = samples[t][i];
        if(s>best){ best=s; bestTeam=t; }
        if(s<worst){ worst=s; worstTeam=t; }
      }
      winCounts[bestTeam]++; loseCounts[worstTeam]++;
    }
    const toRows = counts => ALL_TEAMS.map(t => {
      const info = toOdds(100*counts[t]/nSims);
      return { team: t, odds: info.odds, suspended: info.suspended };
    }).sort((a,b) => (a.odds===null)-(b.odds===null) || (a.odds||0)-(b.odds||0));
    const result = { win: toRows(winCounts), lose: toRows(loseCounts) };
    roundExtremeCache[round] = result;
    return result;
  }

  // ---------- rendering ----------
  function render(){
    if(EMBED_MODE){
      document.getElementById('app').innerHTML = renderEmbedHome();
      return; // deliberately no attachHandlers() -- embed mode is read-only, see renderEmbedHome
    }
    document.getElementById('app').innerHTML = renderMain();
    attachHandlers();
  }

  // The embed view: the real, live Home tab content (never a separate copy
  // of its logic, so it can't silently drift out of sync with the actual
  // site), wrapped in a compact, read-only container suitable for an
  // iframe on another site. Read-only via pointer-events:none rather than
  // by skipping click handlers -- picking one of these picks would either
  // silently do nothing or pop a login modal inside a small foreign iframe,
  // both worse than just not being clickable. The CTA link sits outside
  // that wrapper so it's the one thing that stays clickable.
  function renderEmbedHome(){
    return `<div style="max-width:480px;margin:0 auto;padding:14px;">
      <div style="pointer-events:none;">
        ${renderHomeTab()}
      </div>
      <div style="text-align:center;margin-top:4px;">
        <a href="https://bilbo443.github.io/BILBBET/" target="_blank" rel="noopener noreferrer"
           style="display:inline-block;background:#ffdd00;color:#1a1a1a;font-weight:700;font-size:12px;padding:9px 18px;border-radius:4px;text-decoration:none;letter-spacing:0.02em;">
          See full odds &amp; place a bet &rarr;
        </a>
      </div>
    </div>`;
  }

  function teamsDatalist(){
    return `<datalist id="bb-teams-list">${ALL_TEAMS.map(t => `<option value="${esc(t)}">`).join('')}</datalist>`;
  }
  function teamSearchInput(id, currentValue, placeholder){
    return `<input class="bb-input" type="text" list="bb-teams-list" id="${id}" value="${esc(currentValue||'')}" placeholder="${esc(placeholder||'Search for a team\u2026')}" autocomplete="off"/>`;
  }
  // Normalises free-typed text against the real team list (case-insensitive),
  // since a datalist lets someone type past what they picked from suggestions.
  function matchTeamName(typed){
    if(!typed) return '';
    const hit = ALL_TEAMS.find(t => t.toLowerCase() === typed.trim().toLowerCase());
    return hit || typed;
  }

  const TOS_CONDITIONS = [
    'You will only register a team that you control.',
    'You will only bet on your team if it is a positive outcome, and never on a negative outcome in the context of what your team controls.',
    'Any attempt to "hack", "cheat", or "game" the system will come under review of Bilbbet management.',
    'All Bilbbet decisions are final.',
  ];

  function renderStorageWarning(){
    if(!state.storageDegraded) return '';
    return `<div style="background:#3a2a26;color:#f0b8a8;padding:10px 14px;text-align:center;font-size:13px;border-bottom:2px solid #a3402f;">
      \u26A0\uFE0F Running without a persistent connection right now &mdash; anything you do (bets, balance changes, registrations) will be lost if you close or refresh this page. Try reloading in a bit; if it keeps happening, tell the admin.
    </div>`;
  }

  // A thick divider ribbon for separating two adjacent sections (e.g. a
  // control row from the content below it) -- distinct from bb-div-stripe,
  // which specifically marks a competition/division by its own colour.
  function sectionRibbon(){
    return `<div style="height:5px;border-radius:2px;background:var(--bb-border-light);margin:12px 0 14px;"></div>`;
  }

  function renderFooter(){
    const flashClass = state.user ? '' : ' bb-readme-flash';
    return `<div style="text-align:center;padding:24px 0 12px;">
      <span id="open-tos-footer" style="font-size:12px;color:#9a9a9a;text-decoration:underline;cursor:pointer;">Terms &amp; Conditions</span>
      <span style="color:#5a5a5a;margin:0 8px;">&middot;</span>
      <span id="open-readme-footer" class="${flashClass}" style="font-size:12px;color:#9a9a9a;text-decoration:underline;cursor:pointer;">Read me</span>
    </div>`;
  }

  function renderTosModal(){
    const registerMode = state.tosMode === 'register';
    return `
      <div id="tos-modal-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:110;display:flex;align-items:center;justify-content:center;padding:1rem;">
        <div class="bb-card" style="max-width:420px;width:100%;max-height:80vh;display:flex;flex-direction:column;">
          <h3 style="margin:0 0 10px;">Terms &amp; Conditions</h3>
          <div id="tos-scroll-content" style="overflow-y:auto;flex:1;border:1px solid #3d3d3d;border-radius:8px;padding:14px;margin-bottom:12px;font-size:14px;line-height:1.6;">
            <p style="color:#9a9a9a;margin-top:0;">By registering an account on bilbbet, you agree to the following:</p>
            <ol style="padding-left:20px;margin-bottom:0;">
              ${TOS_CONDITIONS.map(c => `<li style="margin-bottom:14px;">${esc(c)}</li>`).join('')}
            </ol>
            <p style="color:#8a8a8a;font-size:12px;margin-bottom:0;">(End of terms.)</p>
          </div>
          ${registerMode ? `
            <label style="display:flex;align-items:flex-start;gap:8px;font-size:13px;margin-bottom:12px;">
              <input type="checkbox" id="tos-agree-checkbox" ${state.tosAgreed?'checked':''} style="margin-top:2px;"/>
              <span>I have read and agree to the Terms &amp; Conditions.</span>
            </label>` : ''}
          <button class="bb-btn ghost" id="close-tos-modal" style="width:100%;">${registerMode ? 'Done' : 'Close'}</button>
        </div>
      </div>`;
  }

  function renderReadMeModal(){
    return `
      <div id="readme-modal-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:110;display:flex;align-items:center;justify-content:center;padding:1rem;">
        <div class="bb-card" style="max-width:420px;width:100%;max-height:80vh;display:flex;flex-direction:column;">
          <h3 style="margin:0 0 10px;">Read me</h3>
          <div style="overflow-y:auto;flex:1;border:1px solid #3d3d3d;border-radius:8px;padding:14px;margin-bottom:12px;font-size:14px;line-height:1.6;">
            <p style="margin-top:0;">Bilbbet is a passion project run by Bilbo since the 23/24 season of the Eliza Cup. This platform was the vague vision at that time to provide a fun way for teams to bet on themselves or against their rivals within our Eliza Cup platform.</p>
            <p>If you see any issues on the site can you let Bilbo know in one of the chats, it isn't meant to be a serious thing (as professional as it looks) so any crowd sourced fixes or updates required are appreciated for the better of the experience of everyone involved.</p>
            <p>Once logging in, don't use a PIN tied to any personal identity or financial connections. Whilst Bilbbet will guarantee that it doesn't look at anyone's PINs or share them willingly to other parties, because the information is stored on a free-to-use server, there is no guarantee that this information is immune from 3rd party breaches.</p>
            <p style="margin-bottom:0;">If you do forget your PIN, Bilbo can reset your team upon request, so you can create a new registration that will keep the stored betting information at all times.</p>
          </div>
          <button class="bb-btn ghost" id="close-readme-modal" style="width:100%;">Close</button>
        </div>
      </div>`;
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
              ${teamSearchInput('f-user', state.adminLoginMode?'':state.username, 'Search for your team\u2026')}
              <button type="button" class="bb-btn ghost" id="use-admin-login" style="margin-top:6px;width:100%;font-size:12px;padding:6px;">${state.adminLoginMode ? '\u2713 Logging in as admin' : 'Log in as admin instead'}</button>
            </div>
            <div><span style="font-size:12px;color:#9a9a9a;display:block;margin-bottom:4px;">PIN</span>
              <input class="bb-input" id="f-pin" type="password" inputmode="numeric" value="${esc(state.pin)}"/></div>
            ${state.registeringMode ? `
              <label style="display:flex;align-items:flex-start;gap:8px;font-size:13px;">
                <input type="checkbox" id="tos-agree-checkbox-inline" ${state.tosAgreed?'checked':''} style="margin-top:2px;"/>
                <span>I agree to the <span id="open-tos-register" style="text-decoration:underline;cursor:pointer;color:#ffdd00;">Terms &amp; Conditions</span>.</span>
              </label>` : ''}
            ${state.error ? `<div style="color:#c0604f;font-size:13px;">${esc(state.error)}</div>` : ''}
            ${state.info ? `<div style="color:#7fbf8f;font-size:13px;">${esc(state.info)}</div>` : ''}
            ${state.registeringMode ? `
              <button type="button" class="bb-btn" id="confirm-register-submit" ${state.tosAgreed?'':'disabled'}>Confirm &amp; register</button>
              <button type="button" class="bb-btn ghost" id="back-from-register">Back</button>
            ` : `
              <button type="submit" class="bb-btn" id="login-submit" style="margin-top:4px;">Log in</button>
              <button type="button" class="bb-btn ghost" id="register-submit">First time? Create account</button>
            `}
            <button type="button" class="bb-btn ghost" id="close-login-modal">Cancel</button>
          </form>
          <p style="font-size:12px;color:#9a9a9a;text-align:center;margin-top:1rem;">Everyone starts with 1,000 clams once an admin approves your registration.</p>
          ${(!supabaseClient && !hasRealStorage) ? `<p style="font-size:12px;color:#c0604f;text-align:center;margin-top:0.5rem;">Running without persistent storage &mdash; set up Supabase (see supabase/schema.sql) or open inside Claude's artifact panel for accounts to be saved between visits.</p>` : ''}
        </div>
      </div>`;
  }

  function header(){
    const brand = `<span style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">${siteLogoBadge(32)}<strong style="letter-spacing:1px;font-size:22px;text-transform:uppercase;">BILBBET</strong><a href="https://elizacup.com/" target="_blank" rel="noopener noreferrer" style="color:#9a9a9a;font-size:12px;text-decoration:none;border-left:1px solid #3d3d3d;padding-left:10px;margin-left:2px;">Official Fantasy Partner of the Eliza Cup</a></span>`;
    if(!state.user){
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 4px;border-bottom:5px solid var(--bb-accent);margin-bottom:1rem;">
          ${brand}
          <div style="display:flex;align-items:center;gap:10px;">
            <button class="bb-btn ghost" id="open-team-search-btn" style="padding:6px 12px;font-size:13px;">Find a team</button>
            <button class="bb-btn" id="open-login-btn" style="padding:7px 14px;">Log in</button>
          </div>
        </div>`;
    }
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 4px;border-bottom:5px solid var(--bb-accent);margin-bottom:1rem;flex-wrap:wrap;gap:8px;">
        ${brand}
        <div style="display:flex;align-items:center;gap:14px;font-size:14px;">
          <button class="bb-btn ghost" id="open-team-search-btn" style="padding:6px 12px;font-size:13px;">Find a team</button>
          <span>${fmt(state.user.balance)} clams</span>
          <span style="color:#9a9a9a;">${esc(state.user.username)}${(state.user.isAdmin && adminNeedsAttention()) ? ' <span title="Needs attention" style="font-size:12px;">\u{1F6A9}</span>' : ''}</span>
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
    if(tabName === 'RODDY') return 'div-roddy';
    if(tabName === 'DIVISION 2') return 'div-2a';
    if(tabName === 'DIVISION 3') return 'div-3a';
    return '';
  }
  // A prominent, on-brand header banner for whichever division/competition
  // is currently selected -- built to replace the old top-level tabs' logos
  // with something more visible than a thin color stripe, while the stripe
  // itself stays available too for anywhere a lighter touch fits better.
  function divisionHeaderBanner(name){
    const cls = divColorClass(name);
    if(!cls) return '';
    const kind = FUTURE_DIVS.includes(name) ? 'division' : 'competition';
    const displayName = name === 'RODDY' ? 'The Roddy' : name.replace(' (D1)', '');
    return `<div class="bb-div-banner ${cls}">
      ${logoBadge(kind, name, 40)}
      <span class="bb-div-banner-name">${esc(displayName)}</span>
    </div>`;
  }

  function mainTabs(){
    return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">' +
      currentTabs().map(t => {
        const label = t==='MY BETS'?'My Bets':(t==='ADMIN'?'Admin':(t==='H2H'?'H2H':(t==='HOME'?'Home':(t==='FUTURES'?'Futures':t))));
        const flag = (t==='ADMIN' && state.user && state.user.isAdmin && adminNeedsAttention())
          ? ' <span title="Needs attention" style="font-size:11px;">\u{1F6A9}</span>' : '';
        return `<div class="bb-tab ${state.activeTab===t?'active':''}" data-tab="${esc(t)}" style="display:flex;align-items:center;gap:5px;">${label}${flag}</div>`;
      }).join('') +
      '</div>';
  }

  const DIV3_TABS = ['DIVISION 3A', 'DIVISION 3B'];
  function futuresMarketTabs(){
    return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">' +
      Object.entries(FUTURES.market_labels).filter(([key]) =>
        (key !== 'promotion_pct' || state.futuresSubTab !== 'ELIZA CUP (D1)') &&
        (key !== 'relegation_pct' || !DIV3_TABS.includes(state.futuresSubTab)) &&
        (key !== 'bottom3_pct' || DIV3_TABS.includes(state.futuresSubTab))
      ).map(([key,label]) =>
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
    const round = state.leadingAtRound;
    const picker = `<div class="bb-card" style="margin-bottom:1rem;display:flex;align-items:center;gap:10px;">
        <span style="font-size:12px;color:#9a9a9a;">Round</span>
        <select class="bb-select" id="leadingat-round" style="width:170px;">${roundOptions(state.leadingAtRound)}</select>
      </div>
      <p style="color:#9a9a9a;font-size:12px;margin-bottom:10px;">Who's on top of the table after this specific round, not who wins the season.</p>`;
    if(isRoundBlocked(round)){
      const msg = round < state.currentRound
        ? '\u{1F512} This round has already been played &mdash; betting closed.'
        : '\u{1F512} Betting is closed for this round right now &mdash; hidden until it reopens.';
      return picker + `<div class="bb-card" style="text-align:center;padding:2rem 1rem;color:#9a9a9a;">${msg}</div>`;
    }
    const source = scopeKey === 'RODDY' ? RODDY_LEADING_AT : LEADING_AT[scopeKey];
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
    return picker + list;
  }

  function cupMarketTabs(labelsKey){
    const labels = FUTURES[labelsKey];
    const isEcl = labelsKey === 'ecl_labels';
    return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">' +
      `<div class="bb-tab ${state.futureMarketTab==='fixtures'?'active':''}" data-marketkey="fixtures" style="font-size:12px;padding:6px 10px;">Current fixtures</div>` +
      (isEcl ? `<div class="bb-tab ${state.futureMarketTab==='groups'?'active':''}" data-marketkey="groups" style="font-size:12px;padding:6px 10px;">Groups</div>` : '') +
      Object.entries(labels).map(([key,label]) =>
        `<div class="bb-tab ${state.futureMarketTab===key?'active':''}" data-marketkey="${key}" style="font-size:12px;padding:6px 10px;">${esc(label)}</div>`
      ).join('') + '</div>';
  }

  function renderCupFixtures(compKey){
    const fixtures = state.cupFixtures[compKey] || [];
    if(state.cupFixtureMarket){
      return `<button class="bb-btn ghost" id="back-to-cup-fixtures" style="margin-bottom:10px;">&larr; Back to fixtures</button>` +
        (state.cupFixtureMarketStage ? `<p style="color:#ffdd00;font-weight:600;margin-bottom:6px;">${esc(state.cupFixtureMarketStage)}</p>` : '') +
        renderH2HMarket(state.cupFixtureMarket);
    }
    const roundInfo = getCupRoundInfo(compKey, state.currentRound);
    const calendarNote = roundInfo
      ? `<p style="color:#9a9a9a;font-size:12px;margin-bottom:10px;">Round ${state.currentRound}, per the 26/27 calendar${roundInfo.overridden?' (admin override)':''}: <strong style="color:#ffdd00;">${esc(roundInfo.stage)}</strong>.</p>`
      : `<p style="color:#9a9a9a;font-size:12px;margin-bottom:10px;">Round ${state.currentRound} isn't a scheduled ${esc(compKey)} round on the 26/27 calendar.</p>`;
    if(!fixtures.length){
      return calendarNote + `<div class="bb-card" style="text-align:center;padding:2rem 1rem;color:#9a9a9a;">No fixtures scheduled yet.</div>`;
    }
    return calendarNote + '<div class="bb-card" style="padding:0;overflow:hidden;">' +
      fixtures.map((f,i) => `<div data-cupfixture="${esc(compKey)}|${i}" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;cursor:pointer;${i<fixtures.length-1?'border-bottom:1px solid #3d3d3d;':''}">
        <span>${f.stage ? `<span style="color:#ffdd00;font-weight:600;">${esc(f.stage)}:</span> ` : ''}${esc(f.teamA)} <span style="color:#9a9a9a;">vs</span> ${esc(f.teamB)}</span>
        <span class="bb-btn ghost" style="padding:5px 12px;font-size:12px;">View market</span>
      </div>`).join('') + '</div>' +
      `<p style="color:#9a9a9a;font-size:12px;margin-top:10px;">Odds here use the same head-to-head model as the division matches -- cup-specific pricing (rewarding spike ability for the FA Cup, tough-opposition form for the ECL) isn't wired in yet.</p>`;
  }

  const PLAYOFF_DIVS = ['DIVISION 2', 'DIVISION 3'];
  // Matches the confirmed finals format: week 1 has a Qualifying Final (major
  // semi -- winner gets a bye to the Promotion Final) run alongside an
  // Elimination Final (minor semi -- loser is out); week 2 is the
  // Preliminary Final (major-semi loser vs minor-semi winner); week 3 is
  // the Promotion Final itself. Two different stages share the same round
  // (both week-1 games), so this can't be auto-derived from the round
  // number the way cup stages are -- the admin picks it explicitly.
  const PLAYOFF_STAGES = ['Qualifying Final', 'Elimination Final', 'Preliminary Final', 'Promotion Final'];

  function playoffSubTabBar(){
    return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">' +
      PLAYOFF_DIVS.map(d => `<div class="bb-tab ${state.playoffSubTab===d?'active '+divColorClass(d):''}" data-playoffsubtab="${esc(d)}" style="font-size:12px;padding:6px 10px;">${d.replace('DIVISION ','Div ')}</div>`).join('') +
      '</div>';
  }

  function renderPlayoffsTab(){
    const div = state.playoffSubTab;
    if(state.playoffFixtureMarket){
      return playoffSubTabBar() + `<button class="bb-btn ghost" id="back-to-playoff-fixtures" style="margin-bottom:10px;">&larr; Back to fixtures</button>` +
        (state.playoffFixtureMarketStage ? `<p style="color:#ffdd00;font-weight:600;margin-bottom:6px;">${esc(state.playoffFixtureMarketStage)}</p>` : '') +
        renderH2HMarket(state.playoffFixtureMarket);
    }
    const fixtures = state.playoffFixtures[div] || [];
    const inPlayoffWindow = isPlayoffRound(div, state.currentRound);
    const windowNote = inPlayoffWindow
      ? `<p style="color:#9a9a9a;font-size:12px;margin-bottom:10px;">Round ${state.currentRound} is a scheduled playoff week for ${esc(div)}.</p>`
      : `<p style="color:#9a9a9a;font-size:12px;margin-bottom:10px;">Round ${state.currentRound} isn't one of ${esc(div)}'s playoff weeks (those are Rounds 24-26).</p>`;
    if(!fixtures.length){
      return playoffSubTabBar() + windowNote + `<div class="bb-card" style="text-align:center;padding:2rem 1rem;color:#9a9a9a;">No fixtures scheduled yet.</div>`;
    }
    return playoffSubTabBar() + windowNote + '<div class="bb-card" style="padding:0;overflow:hidden;">' +
      fixtures.map((f,i) => `<div data-playofffixture="${esc(div)}|${i}" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;cursor:pointer;${i<fixtures.length-1?'border-bottom:1px solid #3d3d3d;':''}">
        <span>${f.stage ? `<span style="color:#ffdd00;font-weight:600;">${esc(f.stage)}:</span> ` : ''}${esc(f.teamA)} <span style="color:#9a9a9a;">vs</span> ${esc(f.teamB)}</span>
        <span class="bb-btn ghost" style="padding:5px 12px;font-size:12px;">View market</span>
      </div>`).join('') + '</div>';
  }

  // competition that still has no fixtures entered.
  function adminNeedsAttention(){
    const pendingCount = (state.adminPunters||[]).filter(u => (u.status||'APPROVED')==='PENDING').length;
    if(pendingCount > 0) return true;
    for(const comp of ['FA CUP','ECL']){
      const info = getCupRoundInfo(comp, state.currentRound);
      if(info && !(state.cupFixtures[comp]||[]).length) return true;
    }
    if(!state.roundBettingOpen) return true;
    const hasResolvable = (state.adminBets||[]).some(b => (b.status||'PENDING')==='PENDING' && b.selections.length===1 &&
      (() => { const r = getPickRound(b.selections[0].id); return r !== null && r <= state.currentRound; })());
    if(hasResolvable) return true;
    const hasPendingSuggestions = (state.suggestions||[]).some(s => s.status === 'PENDING_REVIEW');
    if(hasPendingSuggestions) return true;
    return false;
  }

  function categoryPauseControl(category, label){
    if(!state.user || !state.user.isAdmin) return '';
    const paused = !!state.pausedCategories[category];
    return `<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#9a9a9a;margin-bottom:8px;" title="Pause this whole market for everyone (admin only)">
      <input type="checkbox" data-pause-category="${esc(category)}" ${paused?'checked':''}/> Pause ${esc(label||'this market')}
    </label>`;
  }

  function cupOutcomesList(marketsKey, marketKey){
    if(!state.roundBettingOpen && state.closeScope === 'all'){
      return `<div class="bb-card" style="text-align:center;padding:2rem 1rem;color:#9a9a9a;">
        \u{1F512} Betting is closed across all markets right now &mdash; hidden until it reopens.
      </div>`;
    }
    const cupTag = marketsKey === 'fa_cup_markets' ? 'FACUP' : 'ECL';
    const category = cupTag+'|'+marketKey;
    const categoryPaused = !!state.pausedCategories[category];
    const outcomes = FUTURES[marketsKey][marketKey];
    if(!outcomes || !outcomes.length) return '<p style="color:#9a9a9a;">No outcomes in this market.</p>';
    const control = categoryPauseControl(category, marketKey);
    const list = outcomes.map(o => {
      const selId = cupTag+'|'+marketKey+'|'+o.team;
      if(o.suspended || categoryPaused){
        return `<div class="bb-outcome" style="opacity:0.5;cursor:default;">
          <span>${esc(o.team)}</span><span class="bb-odds" style="color:#9a9a9a;">${categoryPaused && !o.suspended ? 'paused' : 'suspended'}</span></div>`;
      }
      const selected = state.slip.some(s=>s.id===selId);
      return `<div class="bb-outcome ${selected?'selected':''}" data-pick="${esc(selId)}" data-team="${esc(o.team)}" data-odds="${o.odds}" data-label="${esc(o.team)}">
        <span>${esc(o.team)}</span><span class="bb-odds">${o.odds.toFixed(2)}</span></div>`;
    }).join('');
    return control + list;
  }

  function futuresOutcomesList(div, marketKey){
    if(!state.roundBettingOpen && state.closeScope === 'all'){
      return `<div class="bb-card" style="text-align:center;padding:2rem 1rem;color:#9a9a9a;">
        \u{1F512} Betting is closed across all markets right now &mdash; hidden until it reopens.
      </div>`;
    }
    const category = div+'|'+marketKey;
    const categoryPaused = !!state.pausedCategories[category];
    const outcomes = div==='RODDY' ? FUTURES.roddy[marketKey] : FUTURES.divisions[div][marketKey];
    if(!outcomes || !outcomes.length) return '<p style="color:#9a9a9a;">No outcomes in this market.</p>';
    const control = categoryPauseControl(category, marketKey);
    const list = outcomes.map(o => {
      const selId = 'FUT|'+div+'|'+marketKey+'|'+o.team;
      if(o.suspended || categoryPaused){
        return `<div class="bb-outcome" style="opacity:0.5;cursor:default;">
          <span style="display:flex;align-items:center;gap:8px;">${teamLogo(o.team,20)}${esc(o.team)}</span>
          <span class="bb-odds" style="color:#9a9a9a;">${categoryPaused && !o.suspended ? 'paused' : 'suspended'}</span></div>`;
      }
      const selected = state.slip.some(s=>s.id===selId);
      return `<div class="bb-outcome ${selected?'selected':''}" data-pick="${esc(selId)}" data-team="${esc(o.team)}" data-odds="${o.odds}" data-label="${esc(o.team)}">
        <span style="display:flex;align-items:center;gap:8px;">${teamLogo(o.team,20)}${esc(o.team)}</span>
        <span class="bb-odds">${o.odds.toFixed(2)}</span></div>`;
    }).join('');
    return control + list;
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
      ${(() => {
        const found = getH2HRecord(m.teamA, m.teamB);
        if(!found) return `<p style="color:#9a9a9a;font-size:12px;margin-bottom:12px;">\u{1F195} First time these two have played each other \u2014 no history to show.</p>`;
        const r = found.rec;
        const aWins = found.flipped ? r.aLosses : r.aWins;
        const aLosses = found.flipped ? r.aWins : r.aLosses;
        return `<div style="background:#1b1b1b;border:1px solid #3d3d3d;border-radius:8px;padding:10px 12px;margin-bottom:12px;">
          <div style="font-size:12px;color:#9a9a9a;margin-bottom:2px;">All-time head-to-head &mdash; played ${r.played}</div>
          <div style="font-size:14px;">${esc(m.teamA)} <strong>${aWins}</strong> &ndash; <strong>${r.draws}D</strong> &ndash; <strong>${aLosses}</strong> ${esc(m.teamB)}</div>
          <div style="font-size:11px;color:#8a8a8a;margin-top:4px;">Most recent meeting: ${esc(r.lastMatch)}</div>
          ${m.edge && m.edge.applied ? `<div style="font-size:11px;color:#ffdd00;margin-top:6px;">\u26A1 ${esc(m.edge.favored)} carries a${m.edge.decay<1?' reduced':' slight'} edge here from a considerably lopsided head-to-head record (${m.edge.winMargin>0?aWins:aLosses}W-${m.edge.winMargin>0?aLosses:aWins}L across ${r.played} meetings)${m.edge.decay<1?`, weighted down since the last meeting was a while ago`:''}.</div>` : ''}
        </div>`;
      })()}
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

  const H2H_SUBTABS = [...FUTURE_DIVS, 'FA CUP', 'ECL', 'PLAYOFFS', 'CUSTOM MATCHUP'];

  function subTabLogo(t){
    const cls = divColorClass(t);
    if(!cls) return '';
    const kind = FUTURE_DIVS.includes(t) ? 'division' : 'competition';
    return logoBadge(kind, t, 16) + ' ';
  }
  function h2hSubTabBar(){
    return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">' +
      H2H_SUBTABS.map(t => `<div class="bb-tab ${state.h2hSubTab===t?'active':''}" data-h2hsubtab="${esc(t)}" style="font-size:12px;padding:6px 10px;display:flex;align-items:center;gap:4px;">${subTabLogo(t)}${t==='CUSTOM MATCHUP'?'Custom matchup':(t==='PLAYOFFS'?'Playoffs':t.replace(' (D1)',''))}</div>`).join('') +
      '</div>';
  }
  const FUTURES_SUBTABS = [...FUTURE_DIVS, 'RODDY', 'FA CUP', 'ECL'];
  function futuresSubTabBar(){
    return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">' +
      FUTURES_SUBTABS.map(t => `<div class="bb-tab ${state.futuresSubTab===t?'active '+divColorClass(t):''}" data-futuressubtab="${esc(t)}" style="font-size:12px;padding:6px 10px;display:flex;align-items:center;gap:4px;">${subTabLogo(t)}${t==='RODDY'?'The Roddy':t.replace(' (D1)','')}</div>`).join('') +
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
      return `<span class="bb-btn ghost" style="padding:6px 10px;font-size:12px;opacity:0.5;cursor:default;display:inline-flex;align-items:center;gap:6px;">${teamLogo(teamLabel,16)}${esc(teamLabel)} susp.</span>`;
    }
    const selected = state.slip.some(s=>s.id===pickId);
    return `<button class="bb-btn ${selected?'':'ghost'}" data-pick="${esc(pickId)}" data-label="${esc(label)}" data-odds="${oddsInfo.odds}" style="padding:6px 10px;font-size:12px;display:inline-flex;align-items:center;gap:6px;">${teamLogo(teamLabel,16)}${esc(teamLabel)} ${oddsInfo.odds.toFixed(2)}</button>`;
  }
  // Same pick/click mechanics as quickOddsButton, just without the repeated
  // team logo+name -- for layouts where the team is already shown once,
  // separately, and only the price itself needs to sit in its own box.
  function priceOnlyButton(pickId, label, oddsInfo){
    if(oddsInfo.suspended){
      return `<span class="bb-btn ghost" style="padding:8px 14px;font-size:13px;opacity:0.5;cursor:default;width:100%;text-align:center;">susp.</span>`;
    }
    const selected = state.slip.some(s=>s.id===pickId);
    return `<button class="bb-btn ${selected?'':'ghost'}" data-pick="${esc(pickId)}" data-label="${esc(label)}" data-odds="${oddsInfo.odds}" style="padding:8px 14px;font-size:13px;font-weight:700;width:100%;text-align:center;">${oddsInfo.odds.toFixed(2)}</button>`;
  }

  function renderFixtureList(div){
    if(state.h2hFixtureMarket){
      return `<button class="bb-btn ghost" id="back-to-fixtures" style="margin-bottom:10px;">&larr; Back to Round ${state.h2hRound} fixtures</button>` + renderH2HMarket(state.h2hFixtureMarket);
    }
    if(hasNoFixtures(div, state.h2hRound)){
      const reason = isPlayoffRound(div, state.h2hRound) ? ' \u2014 this is a playoff week, see the Playoffs tab.' : '.';
      return `<div class="bb-card" style="text-align:center;padding:2rem 1rem;color:#9a9a9a;">No scheduled H2H fixtures${reason}</div>`;
    }
    if(!state.roundBettingOpen && state.h2hRound === state.currentRound){
      return `<div class="bb-card" style="text-align:center;padding:2rem 1rem;color:#9a9a9a;">
        \u{1F512} Betting for Round ${state.currentRound} is closed &mdash; scores and odds are hidden until it reopens.
      </div>`;
    }
    const markets = getFixtureMarkets(div, state.h2hRound);
    return '<div class="bb-card" style="padding:0;overflow:hidden;">' +
      markets.map((m, i) => {
        const roundTag = 'R' + m.round;
        const aId = 'H2H|res-a|'+roundTag+'|'+m.teamA+'|'+m.teamB;
        const bId = 'H2H|res-b|'+roundTag+'|'+m.teamA+'|'+m.teamB;
        return `<div style="display:flex;align-items:stretch;gap:12px;padding:12px 16px;${i<markets.length-1?'border-bottom:1px solid #3d3d3d;':''}">
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:3px;">
            <div style="display:flex;align-items:center;gap:6px;font-weight:600;">${teamLogo(m.teamA,18)}${esc(m.teamA)}</div>
            <div style="display:flex;align-items:center;gap:6px;font-weight:600;"><span style="color:#9a9a9a;font-weight:400;">vs</span> ${teamLogo(m.teamB,18)}${esc(m.teamB)}</div>
            <span class="bb-btn ghost" data-fixture-expand="${esc(div)}|${i}" style="align-self:flex-start;padding:3px 9px;font-size:10px;margin-top:2px;">Full market (draw &amp; handicap)</span>
          </div>
          <div style="width:88px;flex-shrink:0;display:flex;flex-direction:column;gap:6px;justify-content:center;">
            ${priceOnlyButton(aId, roundTag+': '+m.teamA+' to win', toOdds(m.aWinPct))}
            ${priceOnlyButton(bId, roundTag+': '+m.teamB+' to win', toOdds(m.bWinPct))}
          </div>
        </div>`;
      }).join('') +
      '</div>' +
      '<p style="color:#9a9a9a;font-size:12px;margin-top:10px;">Fixture list is a projected double round-robin, not an official 26/27 schedule \u2014 swap in the real one once fixtures are confirmed. Tap either team\'s price to back the moneyline directly, or open the full market for the draw and handicap.</p>';
  }

  function renderH2HTab(){
    const stripe = divisionHeaderBanner(state.h2hSubTab);
    const roundBar = `<div class="bb-card" style="margin-bottom:1rem;display:flex;align-items:center;gap:10px;">
      <span style="font-size:12px;color:#9a9a9a;">Round</span>
      <select class="bb-select" id="h2h-round" style="width:140px;">${roundOptions(state.h2hRound)}</select>
    </div>` + renderPointProjection(state.h2hRound);
    if(state.h2hSubTab === 'CUSTOM MATCHUP'){
      return stripe + roundBar + h2hSubTabBar() + `<div class="bb-card" style="margin-bottom:1rem;">
        <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">
          <div style="flex:1;min-width:180px;"><span style="font-size:12px;color:#9a9a9a;display:block;margin-bottom:4px;">Team A</span>
            ${teamSearchInput('team-a', state.teamA)}</div>
          <div style="flex:1;min-width:180px;"><span style="font-size:12px;color:#9a9a9a;display:block;margin-bottom:4px;">Team B</span>
            ${teamSearchInput('team-b', state.teamB)}</div>
          <button class="bb-btn" id="get-market" ${(!ALL_TEAMS.includes(state.teamA)||!ALL_TEAMS.includes(state.teamB)||state.teamA===state.teamB)?'disabled':''}>Get market</button>
        </div>
        ${state.teamA && state.teamB && state.teamA===state.teamB ? '<p style="color:#c0604f;font-size:13px;margin:8px 0 0;">Pick two different teams.</p>' : ''}
        ${(state.teamA && !ALL_TEAMS.includes(state.teamA)) || (state.teamB && !ALL_TEAMS.includes(state.teamB)) ? '<p style="color:#c0604f;font-size:13px;margin:8px 0 0;">No match for that team name \u2014 pick one from the suggestions as you type.</p>' : ''}
      </div>${state.h2hMarket ? renderH2HMarket(state.h2hMarket) : ''}`;
    }
    if(state.h2hSubTab === 'FA CUP' || state.h2hSubTab === 'ECL'){
      return stripe + h2hSubTabBar() + renderCupFixtures(state.h2hSubTab);
    }
    if(state.h2hSubTab === 'PLAYOFFS'){
      return h2hSubTabBar() + renderPlayoffsTab();
    }
    return stripe + roundBar + h2hSubTabBar() + sectionRibbon() + renderFixtureList(state.h2hSubTab);
  }

  function statusPill(status){
    const colors = { PENDING: ['#efece3','#9a9a9a'], WON: ['#e1efe9','#2d6a44'], LOST: ['#f3ded9','#a3402f'],
      VOID: ['#e8e4d8','#8a8a8a'], OPEN: ['#4a3a10','#ffdd00'] };
    const [bg,fg] = colors[status] || colors.PENDING;
    return `<span class="bb-pill" style="background:${bg};color:${fg};">${status.toLowerCase()}</span>`;
  }

  function renderMyBetsTab(){
    if(!state.user) return '<p style="color:#9a9a9a;">Log in to see your bets.</p>';
    const h = state.user.historicalRecord;
    const careerBox = (h && h.totalBets > 0) ? `
      <div class="bb-card" style="margin-bottom:1rem;">
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;">Career record (carried over from previous seasons)</div>
        <div style="display:flex;gap:20px;flex-wrap:wrap;">
          <div><div style="font-size:12px;color:#9a9a9a;">Bets</div><div style="font-size:16px;font-weight:600;">${h.totalBets}</div></div>
          <div><div style="font-size:12px;color:#9a9a9a;">Won</div><div style="font-size:16px;font-weight:600;color:#4a9166;">${h.winningBets}</div></div>
          <div><div style="font-size:12px;color:#9a9a9a;">Lost</div><div style="font-size:16px;font-weight:600;color:#a3402f;">${h.losingBets}</div></div>
          <div><div style="font-size:12px;color:#9a9a9a;">Void</div><div style="font-size:16px;font-weight:600;">${h.voidBets}</div></div>
          <div><div style="font-size:12px;color:#9a9a9a;">Net</div><div style="font-size:16px;font-weight:600;">${(h.winnings-h.losses)>=0?'+':''}${fmt(h.winnings-h.losses)}</div></div>
        </div>
      </div>` : '';
    const legacyBox = (state.user.legacyBestBets && state.user.legacyBestBets.length) ? `
      <div class="bb-card" style="margin-bottom:1rem;">
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;">All-time best bets</div>
        ${state.user.legacyBestBets.map((b,i) => `
          <div style="padding:6px 0;${i<state.user.legacyBestBets.length-1?'border-bottom:1px solid #2a2a2a;':''}">
            <div style="font-size:13px;">${b.selections.map(s=>esc(s.label)).join(', ')}</div>
            <div style="font-size:11px;color:#8a8a8a;">Stake ${fmt(b.stake)} @ ${b.combinedOdds.toFixed(2)} &rarr; won ${fmt(b.potentialReturn)}${b.season?' &mdash; '+esc(b.season):''}</div>
          </div>`).join('')}
      </div>` : '';
    if(state.myBets === null) return careerBox + legacyBox + '<p style="color:#9a9a9a;">Loading&hellip;</p>';
    const bets = state.myBets;
    if(!bets.length) return careerBox + legacyBox + '<p style="color:#9a9a9a;">No bets placed yet &mdash; head to any market tab and tap an outcome to get started.</p>';
    const pending = bets.filter(b=>(b.status||'PENDING')==='PENDING').length;
    const won = bets.filter(b=>b.status==='WON').length;
    const lost = bets.filter(b=>b.status==='LOST').length;
    const voided = bets.filter(b=>b.status==='VOID').length;
    const netFromSettled = bets.reduce((s,b)=>{
      if(b.status==='WON') return s + (b.potentialReturn - b.stake);
      if(b.status==='LOST') return s - b.stake;
      return s;   // PENDING and VOID both net to 0 -- VOID refunds the stake, nothing gained or lost
    }, 0);
    return careerBox + legacyBox + `
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

  // Pulls together every market a given team currently appears in, across
  // every tab, into one place. Reuses the exact same pick-id formats each
  // market already uses elsewhere, so a tap here behaves identically to
  // tapping the same outcome in its home tab -- same conflict checks, same
  // slip, no separate code path to keep in sync.
  function renderTeamSearchResults(team){
    if(!team || !ALL_TEAMS.includes(team)){
      return '<p style="color:#9a9a9a;font-size:13px;">Type a team name and pick a suggestion.</p>';
    }
    function row(id, label, o){
      if(!o) return '';
      if(o.suspended){
        return `<div class="bb-outcome" style="opacity:0.5;cursor:default;"><span>${esc(label)}</span><span class="bb-odds" style="color:#9a9a9a;">suspended</span></div>`;
      }
      const selected = state.slip.some(s=>s.id===id);
      return `<div class="bb-outcome ${selected?'selected':''}" data-pick="${esc(id)}" data-team="${esc(team)}" data-odds="${o.odds}" data-label="${esc(team)} \u2014 ${esc(label)}">
        <span>${esc(label)}</span><span class="bb-odds">${o.odds.toFixed(2)}</span></div>`;
    }
    let teamDiv = null;
    for(const div in H2H_DIVISIONS){ if(H2H_DIVISIONS[div].includes(team)) teamDiv = div; }
    let html = '';
    if(teamDiv){
      html += `<h4 style="color:#9a9a9a;margin:14px 0 6px;">${esc(teamDiv.replace(' (D1)',''))}</h4>`;
      for(const [key,label] of Object.entries(FUTURES.market_labels)){
        const o = (FUTURES.divisions[teamDiv][key]||[]).find(x=>x.team===team);
        html += row('FUT|'+teamDiv+'|'+key+'|'+team, label, o);
      }
    }
    html += `<h4 style="color:#9a9a9a;margin:14px 0 6px;">The Roddy</h4>`;
    for(const [key,label] of Object.entries(FUTURES.roddy_labels)){
      const o = (FUTURES.roddy[key]||[]).find(x=>x.team===team);
      html += row('FUT|RODDY|'+key+'|'+team, label, o);
    }
    html += `<h4 style="color:#9a9a9a;margin:14px 0 6px;">FA Cup</h4>`;
    for(const [key,label] of Object.entries(FUTURES.fa_cup_labels)){
      const o = (FUTURES.fa_cup_markets[key]||[]).find(x=>x.team===team);
      html += row('FACUP|'+key+'|'+team, label, o);
    }
    const inEcl = Object.values(FUTURES.ecl_markets||{}).some(list => list.some(x=>x.team===team));
    if(inEcl){
      html += `<h4 style="color:#9a9a9a;margin:14px 0 6px;">ECL</h4>`;
      for(const [key,label] of Object.entries(FUTURES.ecl_labels)){
        const o = (FUTURES.ecl_markets[key]||[]).find(x=>x.team===team);
        html += row('ECL|'+key+'|'+team, label, o);
      }
    }
    html += `<h4 style="color:#9a9a9a;margin:14px 0 6px;">Season specials</h4>`;
    html += row('SPECIALFIX|charity|'+team, 'Most Charity', SPECIAL_MARKETS.charity.find(x=>x.team===team));
    html += row('SPECIALFIX|philanthropy|'+team, 'Most Philanthropy', SPECIAL_MARKETS.philanthropy.find(x=>x.team===team));
    html += `<h4 style="color:#9a9a9a;margin:14px 0 6px;">Round ${state.currentRound}</h4>`;
    const extremes = computeRoundExtremes(state.currentRound);
    html += row('SPECIALFIX|win_round|R'+state.currentRound+'|'+team, 'To win Round '+state.currentRound, extremes.win.find(x=>x.team===team));
    html += row('SPECIALFIX|lose_round|R'+state.currentRound+'|'+team, 'To lose Round '+state.currentRound, extremes.lose.find(x=>x.team===team));
    return html;
  }

  function renderTeamSearchPanel(){
    if(!state.teamSearchOpen) return '';
    const matched = matchTeamName(state.teamSearchQuery);
    return `<div class="bb-card" style="margin-bottom:1rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong style="font-size:13px;">Find a team's markets</strong>
        <span id="close-team-search" style="cursor:pointer;color:#9a9a9a;font-size:18px;line-height:1;">&times;</span>
      </div>
      ${teamSearchInput('header-team-search', state.teamSearchQuery, 'Search for a team\u2026')}
      <div style="margin-top:4px;max-height:360px;overflow-y:auto;">${renderTeamSearchResults(matched)}</div>
    </div>`;
  }

  function renderRoundExtremeMarket(kind){
    // kind: 'win_round' (highest scorer) or 'lose_round' (lowest scorer)
    const label = kind === 'win_round' ? 'To win Round' : 'To lose Round';
    const sublabel = kind === 'win_round' ? 'highest scorer' : 'lowest scorer';
    const round = state.specialsRound;
    const searchId = kind === 'win_round' ? 'special-win-round' : 'special-lose-round';
    const selectedTeam = state.specialsSelection[kind];

    let html = `<div class="bb-card" style="margin-bottom:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
        <div style="font-size:13px;font-weight:600;">${label} ${round} (${sublabel})</div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:12px;color:#9a9a9a;">Round</span>
          <select class="bb-select" data-specials-round-picker style="width:150px;">${roundOptions(round)}</select>
        </div>
      </div>`;

    if(isRoundBlocked(round)){
      const msg = round < state.currentRound
        ? '\u{1F512} This round has already been played &mdash; betting closed.'
        : '\u{1F512} Betting is closed for this round right now &mdash; hidden until it reopens.';
      html += `<p style="color:#9a9a9a;font-size:12px;">${msg}</p></div>`;
      return html;
    }

    const outcomes = computeRoundExtremes(round)[kind === 'win_round' ? 'win' : 'lose'];
    const pickPrefix = 'SPECIALFIX|'+kind+'|R'+round;

    html += teamSearchInput(searchId, selectedTeam, 'Search for a team\u2026');
    if(selectedTeam){
      const o = outcomes.find(x => x.team === selectedTeam);
      if(!o){
        html += `<p style="color:#9a9a9a;font-size:12px;margin-top:8px;">No match for that team name.</p>`;
      } else if(o.suspended){
        html += `<div class="bb-outcome" style="opacity:0.5;cursor:default;margin-top:8px;"><span>${esc(selectedTeam)}</span><span class="bb-odds" style="color:#9a9a9a;">suspended</span></div>`;
      } else {
        const id = pickPrefix+'|'+selectedTeam;
        const isSelected = state.slip.some(s=>s.id===id);
        html += `<div class="bb-outcome ${isSelected?'selected':''}" data-pick="${esc(id)}" data-team="${esc(selectedTeam)}" data-odds="${o.odds}" data-label="${esc(selectedTeam)} \u2014 ${label} ${round}" style="margin-top:8px;">
          <span>${esc(selectedTeam)}</span><span class="bb-odds">${o.odds.toFixed(2)}</span></div>`;
      }
    }

    const expanded = state.specialsExtremeExpanded === kind;
    html += `<button class="bb-btn ghost" data-toggle-extreme-list="${kind}" style="margin-top:10px;font-size:12px;padding:6px 12px;">${expanded ? 'Hide full list \u25b4' : 'Show every team in odds order \u25be'}</button>`;

    if(expanded){
      html += `<div style="margin-top:10px;max-height:400px;overflow-y:auto;">` + outcomes.map(o => {
        if(o.suspended){
          return `<div class="bb-outcome" style="opacity:0.5;cursor:default;"><span>${esc(o.team)}</span><span class="bb-odds" style="color:#9a9a9a;">suspended</span></div>`;
        }
        const id = pickPrefix+'|'+o.team;
        const isSelected = state.slip.some(s=>s.id===id);
        return `<div class="bb-outcome ${isSelected?'selected':''}" data-pick="${esc(id)}" data-team="${esc(o.team)}" data-odds="${o.odds}" data-label="${esc(o.team)} \u2014 ${label} ${round}">
          <span>${esc(o.team)}</span><span class="bb-odds">${o.odds.toFixed(2)}</span></div>`;
      }).join('') + `</div>`;
    }

    html += `</div>`;
    return html;
  }

  function fixedSpecialDropdown(pickPrefix, marketLabel, outcomes, selectedTeam, selectId){
    let odds_row = '';
    if(selectedTeam){
      const o = outcomes.find(x => x.team === selectedTeam);
      if(!o){
        odds_row = `<p style="color:#9a9a9a;font-size:12px;margin-top:8px;">No match for that team name.</p>`;
      } else if(o.suspended){
        odds_row = `<div class="bb-outcome" style="opacity:0.5;cursor:default;margin-top:8px;">
          <span>${esc(selectedTeam)}</span><span class="bb-odds" style="color:#9a9a9a;">suspended</span></div>`;
      } else {
        const id = pickPrefix + '|' + selectedTeam;
        const selected = state.slip.some(s=>s.id===id);
        odds_row = `<div class="bb-outcome ${selected?'selected':''}" data-pick="${esc(id)}" data-team="${esc(selectedTeam)}" data-odds="${o.odds}" data-label="${esc(selectedTeam)} \u2014 ${esc(marketLabel)}" style="margin-top:8px;">
          <span>${esc(selectedTeam)}</span><span class="bb-odds">${o.odds.toFixed(2)}</span></div>`;
      }
    }
    return `<div class="bb-card" style="margin-bottom:10px;">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px;">${esc(marketLabel)}</div>
      ${teamSearchInput(selectId, selectedTeam)}
      ${odds_row}
    </div>`;
  }

  function specialsSubTabBar(){
    const TABS = [
      {key:'round', label:'Round Specials'},
      {key:'season', label:'Season Specials'},
      {key:'novelty', label:'Novelty &amp; Suggestions'},
    ];
    return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">' +
      TABS.map(t => `<div class="bb-tab ${state.specialsSubTab===t.key?'active':''}" data-specialssubtab="${t.key}" style="font-size:12px;padding:6px 10px;">${t.label}</div>`).join('') +
      '</div>';
  }

  function renderSpecialsTab(){
    if(state.novelty === null) return '<p style="color:#9a9a9a;">Loading&hellip;</p>';
    let html = '<h3 style="margin-top:0;">Specials</h3>' + specialsSubTabBar();

    if(state.specialsSubTab === 'round'){
      html += `<p style="color:#9a9a9a;font-size:12px;margin-bottom:10px;">Pick any upcoming round to back who'll be leading or trailing after it.</p>`;
      html += renderRoundExtremeMarket('win_round');
      html += renderRoundExtremeMarket('lose_round');
      return html;
    }

    if(state.specialsSubTab === 'season'){
      html += `<p style="color:#9a9a9a;font-size:12px;margin-bottom:10px;">These cover the whole season -- set once, resolved at the end of Round 26.</p>`;
      html += fixedSpecialDropdown('SPECIALFIX|charity', 'Most Charity (least points conceded all season)', SPECIAL_MARKETS.charity, state.specialsSelection.charity, 'special-charity');
      html += fixedSpecialDropdown('SPECIALFIX|philanthropy', 'Most Philanthropy (most points conceded all season)', SPECIAL_MARKETS.philanthropy, state.specialsSelection.philanthropy, 'special-philanthropy');
      return html;
    }

    // state.specialsSubTab === 'novelty'
    const open = state.novelty.filter(n => n.status === 'OPEN');
    const settled = state.novelty.filter(n => n.status !== 'OPEN').sort((a,b)=>b.createdAt-a.createdAt);
    if(!open.length && !settled.length){
      html += '<p style="color:#9a9a9a;">Nothing added yet &mdash; the admin can add one-off bets here, or suggest your own below.</p>';
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
      html += '<h4 style="color:#9a9a9a;">Settled</h4><div class="bb-card" style="padding:0;overflow:hidden;margin-bottom:1.5rem;">' +
        settled.map((n,i) => `<div style="display:flex;justify-content:space-between;padding:10px 14px;${i<settled.length-1?'border-bottom:1px solid #3d3d3d;':''}">
          <span style="color:#9a9a9a;">${esc(n.name)} <span style="color:#8a8a8a;">(${n.odds.toFixed(2)})</span></span>${statusPill(n.status)}
        </div>`).join('') + '</div>';
    }

    html += '<h3>Suggest your own</h3><div class="bb-card">' +
      `<textarea class="bb-input" id="suggestion-text" placeholder="Describe your special bet idea\u2026" rows="3" style="resize:vertical;">${esc(state.suggestionText||'')}</textarea>` +
      `<button class="bb-btn" id="submit-suggestion-btn" style="margin-top:8px;">Submit idea</button>` +
      `<p style="font-size:12px;color:#9a9a9a;margin:8px 0 0;">The admin reviews every idea and either sets a price and adds it above, or turns it down.</p>` +
      '</div>';
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
      leaderboard('Kitty leaderboard (richest punters)', s.topKitty, v=>fmt(v)) +
      (s.myKittyRank ? `<p style="color:#9a9a9a;font-size:12px;margin-top:-10px;margin-bottom:1.25rem;">You're ranked #${s.myKittyRank.rank} of ${s.myKittyRank.of} punters by balance.</p>` : '') +
      leaderboard('Most career wins (carried over from previous seasons)', s.topCareerWins, v=>v+' win'+(v!==1?'s':''));
  }

  function renderAdminTab(){
    if(state.adminPunters === null || state.adminBets === null) return '<p style="color:#9a9a9a;">Loading&hellip;</p>';
    const punters = state.adminPunters, bets = state.adminBets;
    const pending = punters.filter(u => (u.status||'APPROVED') === 'PENDING');

    // Attention flags -- each reuses logic already computed elsewhere in
    // this file rather than inventing a parallel definition of "needs
    // attention" that could drift out of sync with what the section itself
    // actually shows.
    const flagSeason = !!state.oddsRefreshRequested;
    const flagFixtures = ['FA CUP','ECL'].some(comp => getCupRoundInfo(comp, state.currentRound) && !(state.cupFixtures[comp]||[]).length) ||
      ([24,25,26].includes(state.currentRound) && PLAYOFF_DIVS.some(div => !(state.playoffFixtures[div]||[]).length));
    const resolvableSingles = bets.filter(b => (b.status||'PENDING')==='PENDING' && b.selections.length===1 &&
      (() => { const r = getPickRound(b.selections[0].id); return r !== null && r <= state.currentRound; })());
    const readyCount = bets.filter(b => (b.status||'PENDING')==='PENDING' &&
      b.selections.some((s,i) => (b.selections.length===1 || !s.result) && computeSuggestedResult(s.id))).length;
    const flagBets = resolvableSingles.length > 0 || readyCount > 0;
    const flagSpecials = (state.suggestions||[]).filter(s => s.status === 'PENDING_REVIEW').length > 0;
    const flagPunters = pending.length > 0;

    const TABS = [
      {key:'season', label:'Season &amp; Rounds', flag:flagSeason},
      {key:'fixtures', label:'Fixtures &amp; Draws', flag:flagFixtures},
      {key:'bets', label:'Bets', flag:flagBets},
      {key:'specials', label:'Specials', flag:flagSpecials},
      {key:'punters', label:'Punters', flag:flagPunters},
    ];
    const tabBar = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">' +
      TABS.map(t => `<div class="bb-tab ${state.adminSubTab===t.key?'active':''}" data-adminsubtab="${t.key}" style="font-size:13px;padding:7px 12px;position:relative;">${t.label}${t.flag?' <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#ffdd00;margin-left:4px;"></span>':''}</div>`).join('') +
      '</div>';

    const SEASON_HTML = `\n      <h3 style="margin-top:0;">Season progress</h3>
      <div class="bb-card" style="margin-bottom:1.5rem;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-size:13px;color:#9a9a9a;">Next round to be played:</span>
        <select class="bb-select" id="admin-current-round" style="width:140px;">
          ${Array.from({length:26},(_, i) => i+1).map(r => `<option value="${r}" ${r===state.currentRound?'selected':''}>Round ${r}</option>`).join('')}
        </select>
        <button class="bb-btn" id="save-current-round">Update</button>
        <span style="font-size:12px;color:#9a9a9a;">Rounds before this are greyed out everywhere as already played. Advancing this reopens betting fresh.</span>
      </div>
      <h3>End of season</h3>
      <div class="bb-card" style="margin-bottom:1.5rem;border-color:#a3402f;">
        <p style="font-size:12px;color:#9a9a9a;margin-top:0;">
          Folds everyone's settled bets this season into their running career record (kept, not deleted -- just
          compacted from individual bet lines into a summary), keeps each punter's all-time best 3 wins in full detail
          for bragging rights, and resets Round back to 1 with betting reopened. Pending bets are left untouched.
          <strong style="color:#c0604f;">This can't be undone.</strong>
        </p>
        <button class="bb-btn ghost" id="end-season-btn" style="border-color:#a3402f;color:#c0604f;">End season &amp; archive</button>
      </div>
      <h3>Round betting</h3>
      <div class="bb-card" style="margin-bottom:1.5rem;">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
          <span class="bb-pill" style="background:${state.roundBettingOpen?'#1e3a2a':'#3a2a26'};color:${state.roundBettingOpen?'#7fbf8f':'#c0604f'};">${state.roundBettingOpen?'OPEN':'CLOSED'}</span>
          <span style="font-size:13px;">Round ${state.currentRound} betting is currently ${state.roundBettingOpen?'open':`closed (${state.closeScope==='all'?'entire betting markets':'H2H only'})`}.</span>
        </div>
        <p style="font-size:12px;color:#9a9a9a;margin:0 0 10px;">
          ${ROUND_DATES[state.currentRound] ? `Scheduled kickoff per the 26/27 calendar: ${esc(ROUND_DATES[state.currentRound])}, assumed 7:00pm Sydney time (no exact kickoff times are given, so the round's first match is assumed to start then). Betting auto-closes the first time the site's loaded on or after that moment, if nobody's closed it already.` : `No scheduled date on file for this round -- auto-close won't trigger, close it manually when needed.`}
          Auto-close only ever fires this way for this round once; reopening it manually will stick.
        </p>
        <div style="margin-bottom:8px;">
          <span style="font-size:12px;color:#9a9a9a;display:block;margin-bottom:4px;">When closing, what should it cover?</span>
          <label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;margin-right:16px;">
            <input type="radio" name="close-scope" id="close-scope-h2h" value="h2h" ${state.closeScope==='h2h'?'checked':''}/> H2H only (this round's matches)
          </label>
          <label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;">
            <input type="radio" name="close-scope" id="close-scope-all" value="all" ${state.closeScope==='all'?'checked':''}/> Entire betting markets
          </label>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="bb-btn ghost" id="close-betting-btn" ${!state.roundBettingOpen?'disabled':''} style="padding:8px 14px;font-size:12px;">Close betting now</button>
          <button class="bb-btn" id="reopen-betting-btn" ${state.roundBettingOpen?'disabled':''} style="padding:8px 14px;font-size:12px;">Reopen betting</button>
        </div>
        <p style="font-size:12px;color:#9a9a9a;margin:10px 0 6px;">"H2H only" affects this round's H2H, leading-at, and win/lose-the-round markets, leaving season-long futures bettable. "Entire betting markets" also locks division/Roddy/cup futures until reopened. Either way, the affected round's H2H fixture list is hidden (not just unclickable) while closed.</p>
      </div>
      <h3>Odds refresh</h3>
      <div class="bb-card" style="margin-bottom:1.5rem;">
        <p style="font-size:12px;color:#9a9a9a;margin-top:0;">
          The futures odds (division standings, Roddy, cup stages, leading-at, charity/philanthropy) are precomputed and can't recalculate themselves from live results -- that needs the underlying simulation rerun and the data files redeployed. This button doesn't do that on its own; it just raises the attention flag as a reminder to come back and ask for a refresh once a round's fully resolved. H2H match odds already recompute live on every visit and don't need this.
        </p>
        ${state.oddsRefreshRequested
          ? `<div style="display:flex;align-items:center;gap:10px;"><span class="bb-pill" style="background:#4a3a10;color:#ffdd00;">Requested</span><button class="bb-btn ghost" id="clear-odds-refresh-btn" style="padding:6px 12px;font-size:12px;">Clear</button></div>`
          : `<button class="bb-btn ghost" id="request-odds-refresh-btn" style="padding:8px 14px;font-size:12px;">Flag odds as needing a refresh</button>`}
      </div>
`;
    const FIXTURES_HTML = `\n      <h3>Cup fixtures (FA Cup &amp; ECL)</h3>
      <div class="bb-card" style="margin-bottom:1.5rem;">
        <p style="font-size:12px;color:#9a9a9a;margin-top:0;">Based on the 26/27 calendar. Rounds may shift to dodge unplanned byes/doubles -- override the current round below if the calendar's out of date.</p>
        ${['FA CUP','ECL'].map(comp => {
          const calDefault = getCalendarDefault(comp, state.currentRound);
          const override = (state.cupCalendarOverrides[comp]||{})[state.currentRound];
          const hasOverride = Object.prototype.hasOwnProperty.call(state.cupCalendarOverrides[comp]||{}, state.currentRound);
          return `
          <div style="margin-bottom:14px;">
            <div style="font-size:13px;font-weight:600;margin-bottom:6px;">${esc(comp)}</div>
            <div style="font-size:12px;color:#9a9a9a;margin-bottom:6px;">
              Round ${state.currentRound} calendar default: <strong>${calDefault ? esc(calDefault) : 'not a cup round'}</strong>
              ${hasOverride ? ` &mdash; currently overridden to: <strong style="color:#ffdd00;">${override ? esc(override) : 'not a cup round'}</strong>` : ''}
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">
              <input class="bb-input" type="text" id="cup-override-stage-${esc(comp)}" placeholder="Stage name to force (e.g. Round Of 32)\u2026" style="max-width:220px;"/>
              <button class="bb-btn ghost" data-set-cupoverride="${esc(comp)}" style="padding:6px 12px;font-size:12px;">Force this round as cup round</button>
              <button class="bb-btn ghost" data-set-cupoverride-off="${esc(comp)}" style="padding:6px 12px;font-size:12px;">Force NOT a cup round</button>
              ${hasOverride ? `<button class="bb-btn ghost" data-clear-cupoverride="${esc(comp)}" style="padding:6px 12px;font-size:12px;">Clear override (use calendar)</button>` : ''}
            </div>
            ${(state.cupFixtures[comp]||[]).length ? (state.cupFixtures[comp]||[]).map((f,i) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #2a2a2a;font-size:13px;">
                <span>${esc(f.teamA)} vs ${esc(f.teamB)}</span>
                <span data-remove-cupfixture="${esc(comp)}|${i}" style="cursor:pointer;color:#9a9a9a;font-size:12px;">remove</span>
              </div>`).join('') : `<p style="color:#9a9a9a;font-size:12px;">No fixtures set for this competition.</p>`}
            <div style="display:flex;gap:6px;align-items:flex-end;margin-top:8px;flex-wrap:wrap;">
              <div style="flex:1;min-width:140px;">${teamSearchInput('cup-team-a-'+idSafe(comp), '', 'Team A\u2026')}</div>
              <div style="flex:1;min-width:140px;">${teamSearchInput('cup-team-b-'+idSafe(comp), '', 'Team B\u2026')}</div>
              <button class="bb-btn" data-add-cupfixture="${esc(comp)}" style="padding:8px 14px;font-size:12px;">Add</button>
              ${(state.cupFixtures[comp]||[]).length ? `<button class="bb-btn ghost" data-clear-cupfixtures="${esc(comp)}" style="padding:8px 14px;font-size:12px;">Clear all</button>` : ''}
            </div>
          </div>`;
        }).join('')}
        <p style="font-size:12px;color:#9a9a9a;margin-top:4px;">Set fixtures when there's an actual cup weekend; clear them once it's passed so the tab correctly shows "No fixtures scheduled yet" the rest of the time.</p>
      </div>
      <h3>Playoff fixtures (Division 2 &amp; 3, Rounds 24-26)</h3>
      <div class="bb-card" style="margin-bottom:1.5rem;">
        ${PLAYOFF_DIVS.map(div => `
          <div style="margin-bottom:14px;">
            <div style="font-size:13px;font-weight:600;margin-bottom:6px;">${esc(div)}</div>
            ${(state.playoffFixtures[div]||[]).length ? (state.playoffFixtures[div]||[]).map((f,i) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #2a2a2a;font-size:13px;">
                <span>${f.stage ? `<span style="color:#ffdd00;font-weight:600;">${esc(f.stage)}:</span> ` : ''}${esc(f.teamA)} vs ${esc(f.teamB)}</span>
                <span data-remove-playofffixture="${esc(div)}|${i}" style="cursor:pointer;color:#9a9a9a;font-size:12px;">remove</span>
              </div>`).join('') : `<p style="color:#9a9a9a;font-size:12px;">No fixtures set for this division.</p>`}
            <div style="display:flex;gap:6px;align-items:flex-end;margin-top:8px;flex-wrap:wrap;">
              <div style="min-width:160px;"><span style="font-size:11px;color:#9a9a9a;display:block;">Stage</span>
                <select class="bb-select" data-playoff-stage="${esc(div)}" style="width:100%;">
                  ${PLAYOFF_STAGES.map(s => `<option value="${esc(s)}" ${state.playoffAdminEntry[div].stage===s?'selected':''}>${esc(s)}</option>`).join('')}
                </select>
              </div>
              <div style="flex:1;min-width:140px;">${teamSearchInput('playoff-team-a-'+idSafe(div), '', 'Team A\u2026')}</div>
              <div style="flex:1;min-width:140px;">${teamSearchInput('playoff-team-b-'+idSafe(div), '', 'Team B\u2026')}</div>
              <button class="bb-btn" data-add-playofffixture="${esc(div)}" style="padding:8px 14px;font-size:12px;">Add</button>
              ${(state.playoffFixtures[div]||[]).length ? `<button class="bb-btn ghost" data-clear-playofffixtures="${esc(div)}" style="padding:8px 14px;font-size:12px;">Clear all</button>` : ''}
            </div>
          </div>`).join('')}
        <p style="font-size:12px;color:#9a9a9a;margin-top:4px;">Rounds 24-26 are the playoff weeks for Division 2/3 (no regular H2H fixtures those weeks) -- set matchups here once the bracket's known.</p>
      </div>
      <h3>ECL group draw</h3>
      <div class="bb-card" style="margin-bottom:1.5rem;">
        <p style="font-size:12px;color:#9a9a9a;margin-top:0;">12 confirmed qualifiers this season. Assign each to a group of 4 once the real draw's known -- betting for a group opens automatically once it has all 4.</p>
        ${['A','B','C'].map(g => `
          <div style="margin-bottom:10px;">
            <div style="font-size:13px;font-weight:600;margin-bottom:4px;">Group ${g} (${(state.eclGroups[g]||[]).length}/4)</div>
            ${(state.eclGroups[g]||[]).map(t => `
              <span style="display:inline-flex;align-items:center;gap:6px;background:#262626;border:1px solid #3d3d3d;border-radius:14px;padding:3px 10px;margin:2px 4px 2px 0;font-size:12px;">
                ${esc(t)} <span data-remove-eclteam="${g}|${esc(t)}" style="cursor:pointer;color:#9a9a9a;">&times;</span>
              </span>`).join('')}
          </div>`).join('')}
        <div style="display:flex;gap:6px;align-items:flex-end;margin-top:8px;flex-wrap:wrap;">
          <div style="flex:1;min-width:160px;">${teamSearchInput('ecl-group-pick', '', 'Team from the ECL field\u2026')}</div>
          <button class="bb-btn" data-assign-eclgroup="A" style="padding:8px 14px;font-size:12px;">Add to A</button>
          <button class="bb-btn" data-assign-eclgroup="B" style="padding:8px 14px;font-size:12px;">Add to B</button>
          <button class="bb-btn" data-assign-eclgroup="C" style="padding:8px 14px;font-size:12px;">Add to C</button>
          <button class="bb-btn ghost" id="clear-ecl-groups-btn" style="padding:8px 14px;font-size:12px;">Clear all</button>
        </div>
      </div>
`;
    const BETS_HTML = `\n      <h3>Resolve outstanding bets</h3>
      <div class="bb-card" style="margin-bottom:1.5rem;">
        ${(() => {
          const resolvable = bets.filter(b => (b.status||'PENDING')==='PENDING' && b.selections.length===1 &&
            (() => { const r = getPickRound(b.selections[0].id); return r !== null && r <= state.currentRound; })());
          if(!resolvable.length) return `<p style="color:#9a9a9a;font-size:13px;margin:0;">Nothing waiting on a result for this round or earlier.</p>`;
          return `<p style="color:#9a9a9a;font-size:12px;margin-top:0;">Single-selection bets on Round ${state.currentRound} or earlier, still pending. Multi-leg bets aren't shown here -- resolve those individually in the table below once every leg's known.</p>` +
            resolvable.map(b => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #2a2a2a;font-size:13px;">
                <span>${esc(b.username)} \u2014 ${esc(b.selections[0].label)} <span style="color:#8a8a8a;">(stake ${fmt(b.stake)}, odds ${b.selections[0].odds.toFixed(2)})</span></span>
                <span style="display:flex;gap:4px;">
                  <button class="bb-btn ghost" data-setstatus="${b.id}|WON" style="padding:4px 8px;font-size:11px;">Won</button>
                  <button class="bb-btn ghost" data-setstatus="${b.id}|LOST" style="padding:4px 8px;font-size:11px;">Lost</button>
                </span>
              </div>`).join('');
        })()}
      </div>
      <h3>All registered bets</h3>
      ${!bets.length ? '<p style="color:#9a9a9a;">No bets placed by anyone yet.</p>' : `
      <button class="bb-btn ghost" id="export-bets-csv" style="margin-bottom:10px;padding:6px 12px;font-size:12px;">Export to CSV</button>
      ${(() => {
        const readyCount = bets.filter(b => (b.status||'PENDING')==='PENDING' &&
          b.selections.some((s,i) => (b.selections.length===1 || !s.result) && computeSuggestedResult(s.id))).length;
        return readyCount ? `<p style="color:#ffdd00;font-size:12px;margin-bottom:8px;">\u26a1 ${readyCount} bet(s) below have a real result available and are ready to review -- highlighted first.</p>` : '';
      })()}
      <div class="bb-card" style="padding:0;overflow-x:auto;">
        <table class="bb-table">
          <thead><tr><th>Placed</th><th>User</th><th>Selections</th><th>Stake</th><th>Odds</th><th>Potential return</th><th>Status</th><th>Override</th></tr></thead>
          <tbody>
            ${bets.slice().sort((a,b) => {
              const aReady = (a.status||'PENDING')==='PENDING' && a.selections.some((s,i) => (a.selections.length===1 || !s.result) && computeSuggestedResult(s.id));
              const bReady = (b.status||'PENDING')==='PENDING' && b.selections.some((s,i) => (b.selections.length===1 || !s.result) && computeSuggestedResult(s.id));
              if(aReady !== bReady) return aReady ? -1 : 1;
              return b.timestamp - a.timestamp;
            }).map(b => {
              const betReady = (b.status||'PENDING')==='PENDING' && b.selections.some((s,i) => (b.selections.length===1 || !s.result) && computeSuggestedResult(s.id));
              return `
              <tr${betReady ? ' style="background:#3a3210;"' : ''}>
                <td>${fmtDate(b.timestamp)}</td>
                <td>${esc(b.username)}</td>
                <td>${b.selections.map((s,i)=>{
                  const label = esc(s.label)+' <span style="color:#8a8a8a;">('+s.odds.toFixed(2)+')</span>';
                  const suggestion = !s.result ? computeSuggestedResult(s.id) : null;
                  const suggestionTag = suggestion ? ` <span style="color:#ffdd00;font-size:10px;font-weight:600;">&#9889; suggested: ${suggestion}</span>` : '';
                  if(b.selections.length===1) return label + suggestionTag;
                  const legStatus = s.result || 'PENDING';
                  return `<div style="margin-bottom:4px;">${label} ${statusPill(legStatus)}${suggestionTag}<br/>
                    <span style="display:inline-flex;gap:3px;margin-top:2px;">
                      <span data-resolveleg="${b.id}|${i}|WON" style="cursor:pointer;color:#4a9166;font-size:10px;text-decoration:underline;${suggestion==='WON'?'font-weight:700;':''}">won</span>
                      <span data-resolveleg="${b.id}|${i}|LOST" style="cursor:pointer;color:#a3402f;font-size:10px;text-decoration:underline;${suggestion==='LOST'?'font-weight:700;':''}">lost</span>
                      <span data-resolveleg="${b.id}|${i}|VOID" style="cursor:pointer;color:#9a9a9a;font-size:10px;text-decoration:underline;">void</span>
                    </span></div>`;
                }).join(b.selections.length===1?'<br/>':'')}</td>
                <td>${fmt(b.stake)}</td>
                <td>${b.combinedOdds.toFixed(2)}${b.boosted?' \u26A1':''}</td>
                <td>${fmt(b.potentialReturn)}</td>
                <td>${statusPill(b.status || 'PENDING')}${b.nearMissBonusAwarded?' <span class="bb-pill" style="background:#4a3a10;color:#ffdd00;">bonus paid</span>':''}</td>
                <td style="display:flex;gap:4px;flex-wrap:wrap;">
                  <button class="bb-btn ghost" data-setstatus="${b.id}|WON" style="padding:4px 8px;font-size:11px;${b.selections.length===1&&computeSuggestedResult(b.selections[0].id)==='WON'?'border-color:#ffdd00;':''}">Won</button>
                  <button class="bb-btn ghost" data-setstatus="${b.id}|LOST" style="padding:4px 8px;font-size:11px;${b.selections.length===1&&computeSuggestedResult(b.selections[0].id)==='LOST'?'border-color:#ffdd00;':''}">Lost</button>
                  <button class="bb-btn ghost" data-setstatus="${b.id}|VOID" style="padding:4px 8px;font-size:11px;">Kick (void)</button>
                  <button class="bb-btn ghost" data-setstatus="${b.id}|PENDING" style="padding:4px 8px;font-size:11px;">Reset</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`}
      <p style="font-size:12px;color:#9a9a9a;margin-top:10px;">
        Marking a bet Won credits its full potential return to that punter's balance; marking it Lost (or resetting to Pending
        after a mistaken override) reverses that credit automatically, so balances always stay consistent with the bet's current status.
        Kick (void) cancels the bet and refunds the stake, as if it had never been placed.
      </p>`;
    const SPECIALS_HTML = `\n      <h3>Specials &amp; Novelty</h3>
      <div class="bb-card" style="margin-bottom:1.5rem;">
        <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px;">
          <div style="flex:2;min-width:200px;"><span style="font-size:12px;color:#9a9a9a;display:block;margin-bottom:4px;">Bet name</span>
            <input class="bb-input" id="novelty-name" placeholder="e.g. Someone forgets to make a trade all season"/></div>
          <div style="width:110px;"><span style="font-size:12px;color:#9a9a9a;display:block;margin-bottom:4px;">Odds</span>
            <input class="bb-input" id="novelty-odds" type="number" step="0.01" min="1.01" placeholder="4.50"/></div>
          <button class="bb-btn" id="add-novelty">Add</button>
        </div>
        ${!(state.novelty||[]).length ? '<p style="color:#9a9a9a;font-size:13px;">Nothing added yet.</p>' : (state.novelty||[]).slice().sort((a,b)=>b.createdAt-a.createdAt).map(n => `
          <div style="padding:8px 0;border-bottom:1px solid #333333;">
            ${state.editingNoveltyId === n.id ? `
              <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
                <div style="flex:2;min-width:180px;"><span style="font-size:11px;color:#9a9a9a;display:block;">Bet name</span>
                  <input class="bb-input" id="edit-novelty-name-${n.id}" value="${esc(n.name)}"/></div>
                <div style="width:100px;"><span style="font-size:11px;color:#9a9a9a;display:block;">Odds</span>
                  <input class="bb-input" id="edit-novelty-odds-${n.id}" type="number" step="0.01" min="1.01" value="${n.odds}"/></div>
                <button class="bb-btn" data-save-novelty="${n.id}" style="padding:6px 10px;font-size:12px;">Save</button>
                <button class="bb-btn ghost" data-cancel-novelty-edit style="padding:6px 10px;font-size:12px;">Cancel</button>
              </div>
            ` : `
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                <span>${esc(n.name)} <span class="bb-odds">${n.odds.toFixed(2)}</span> ${statusPill(n.status)}</span>
                <span style="display:flex;gap:4px;flex-wrap:wrap;">
                  ${n.status==='OPEN' ? `
                    <button class="bb-btn ghost" data-noveltystatus="${n.id}|WON" style="padding:4px 8px;font-size:11px;">Won</button>
                    <button class="bb-btn ghost" data-noveltystatus="${n.id}|LOST" style="padding:4px 8px;font-size:11px;">Lost</button>
                    <button class="bb-btn ghost" data-noveltystatus="${n.id}|VOID" style="padding:4px 8px;font-size:11px;">Close (void)</button>
                  ` : `<button class="bb-btn ghost" data-noveltystatus="${n.id}|OPEN" style="padding:4px 8px;font-size:11px;">Reopen</button>`}
                  <button class="bb-btn ghost" data-edit-novelty="${n.id}" style="padding:4px 8px;font-size:11px;">Edit</button>
                  <button class="bb-btn ghost" data-delete-novelty="${n.id}" style="padding:4px 8px;font-size:11px;border-color:#a3402f;color:#c0604f;">Remove</button>
                </span>
              </div>
            `}
          </div>`).join('')}
        <p style="font-size:12px;color:#9a9a9a;margin-top:10px;">
          Won credits the full payout; Lost keeps the stake forfeited; Close (void) refunds the stake as if the bet never happened.
          Only single-selection bets on this exact item are auto-settled &mdash; if it's one leg of a bigger multi, resolve that bet manually below instead.
        </p>
      </div>
      <h3>Punter suggestions</h3>
      <div class="bb-card" style="margin-bottom:1.5rem;">
        ${(() => {
          const pendingSuggestions = (state.suggestions||[]).filter(s => s.status === 'PENDING_REVIEW');
          if(!pendingSuggestions.length) return `<p style="color:#9a9a9a;font-size:13px;margin:0;">No ideas waiting on review.</p>`;
          return pendingSuggestions.map(s => `
            <div style="padding:8px 0;border-bottom:1px solid #333333;">
              <div style="font-size:13px;margin-bottom:6px;">${esc(s.text)} <span style="color:#8a8a8a;font-size:12px;">(from ${esc(s.submittedBy)})</span></div>
              <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                <input class="bb-input" id="suggestion-price-${s.id}" type="number" step="0.01" min="1.01" placeholder="Odds to set" style="width:110px;padding:5px 8px;"/>
                <button class="bb-btn" data-approve-suggestion="${s.id}" style="padding:5px 10px;font-size:12px;">Approve &amp; add</button>
                <button class="bb-btn ghost" data-reject-suggestion="${s.id}" style="padding:5px 10px;font-size:12px;">Reject</button>
              </div>
            </div>`).join('');
        })()}
      </div>
`;
    const PUNTERS_HTML = `\n      <h3>Pending registrations</h3>
      ${!pending.length ? '<p style="color:#9a9a9a;font-size:13px;">Nothing waiting on approval.</p>' : `
      <div class="bb-card" style="padding:0;overflow:hidden;margin-bottom:1.5rem;">
        ${pending.length > 1 ? `<div style="padding:10px 14px;border-bottom:1px solid #3d3d3d;">
          <button class="bb-btn ghost" id="approve-all-btn" style="padding:5px 10px;font-size:12px;">Approve all ${pending.length}</button>
        </div>` : ''}
        ${pending.map((u,i) => {
          const carry = u.dormantCarry || 0;
          const totalOnApproval = 1000 + carry;
          return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;${i<pending.length-1?'border-bottom:1px solid #3d3d3d;':''}">
            <span>${esc(u.username)} ${carry ? `<span style="color:#9a9a9a;font-size:12px;">(carry: ${fmt(carry)})</span>` : ''}</span>
            <span style="display:flex;gap:6px;">
              <button class="bb-btn" data-regstatus="${esc(u.username)}|APPROVED" style="padding:5px 10px;font-size:12px;">Approve (fund ${fmt(totalOnApproval)})</button>
              <button class="bb-btn ghost" data-regstatus="${esc(u.username)}|REJECTED" style="padding:5px 10px;font-size:12px;">Reject</button>
            </span>
          </div>`;
        }).join('')}
      </div>`}
      <h3>Punters</h3>
      <div class="bb-card" style="padding:0;overflow-x:auto;margin-bottom:1.5rem;">
        <table class="bb-table">
          <thead><tr><th>Username</th><th>Balance</th><th>Adjust</th><th></th></tr></thead>
          <tbody>
            ${punters.slice().sort((a,b)=>a.username.localeCompare(b.username)).map(u => `
              <tr>
                <td>${esc(u.username)}
                  ${u.isAdmin ? ' <span class="bb-pill" style="background:#ffdd00;color:#4a3a10;">admin</span>' : ''}
                  ${u.status==='PENDING' ? ' <span class="bb-pill" style="background:#efece3;color:#9a9a9a;">pending</span>' : ''}
                  ${u.status==='REJECTED' ? ` <span class="bb-pill" style="background:#f3ded9;color:#a3402f;">rejected</span> <span data-regstatus="${esc(u.username)}|APPROVED" style="cursor:pointer;color:#9a9a9a;font-size:11px;text-decoration:underline;">re-approve</span>` : ''}
                  ${u.status==='KICKED' ? ` <span class="bb-pill" style="background:#3a2a26;color:#c0604f;">kicked</span>` : ''}
                  ${u.status==='RESET' ? ` <span class="bb-pill" style="background:#efece3;color:#9a9a9a;">reset \u2014 awaiting re-registration</span>` : ''}
                </td>
                <td>${fmt(u.balance)}</td>
                <td style="display:flex;gap:6px;align-items:center;">
                  <input class="bb-input" type="number" placeholder="+/- clams" id="adj-${esc(u.username)}" style="width:110px;padding:5px 8px;"/>
                  <button class="bb-btn ghost" data-adjust-user="${esc(u.username)}" style="padding:5px 10px;font-size:12px;">Apply</button>
                </td>
                <td style="display:flex;gap:4px;flex-wrap:wrap;">
                  ${u.isAdmin || u.status==='RESET' ? '' : (u.status==='KICKED'
                    ? `<button class="bb-btn ghost" data-regstatus="${esc(u.username)}|APPROVED" style="padding:5px 10px;font-size:12px;">Unkick</button>`
                    : `<button class="bb-btn ghost" data-kick-user="${esc(u.username)}" style="padding:5px 10px;font-size:12px;">Kick</button>`)}
                  ${u.isAdmin || u.status==='RESET' ? '' : `<button class="bb-btn ghost" data-reset-registration="${esc(u.username)}" style="padding:5px 10px;font-size:12px;">Reset registration</button>`}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
`;

    const bodyByTab = { season: SEASON_HTML, fixtures: FIXTURES_HTML, bets: BETS_HTML, specials: SPECIALS_HTML, punters: PUNTERS_HTML };
    return tabBar + (bodyByTab[state.adminSubTab] || SEASON_HTML);
  }

  async function loadAdminData(){
    const usernames = await getIndex('bilbbet2_users_index');
    const users = (await Promise.all(usernames.map(getUser))).filter(Boolean);
    const betIds = await getIndex('bilbbet2_all_bets_index');
    const bets = (await Promise.all(betIds.map(id => sget('bilbbet2_bet:'+id)))).filter(Boolean);
    const noveltyIds = await getIndex('bilbbet2_novelty_index');
    const novelty = (await Promise.all(noveltyIds.map(id => sget('bilbbet2_novelty:'+id)))).filter(Boolean);
    const suggestionIds = await getIndex('bilbbet2_suggestions_index');
    const suggestions = (await Promise.all(suggestionIds.map(id => sget('bilbbet2_suggestion:'+id)))).filter(Boolean);
    state.adminPunters = users;
    state.adminBets = bets;
    state.novelty = novelty;
    state.suggestions = suggestions;
    render();
  }

  // Archives one punter's SETTLED bets (won/lost/void) into their running
  // historical record and legacy "best bets" list, then shrinks their live
  // bet index down to just whatever's still pending. Pending bets are never
  // touched -- they're real, unresolved stakes, not history yet.
  async function archiveBetsForUser(username, seasonLabel){
    const u = await getUser(username);
    if(!u) return null;
    const idxKey = 'bilbbet2_bets_index_' + username.toLowerCase();
    const ids = await getIndex(idxKey);
    const bets = (await Promise.all(ids.map(id => sget('bilbbet2_bet:'+id)))).filter(Boolean);
    const settled = bets.filter(b => (b.status||'PENDING') !== 'PENDING');
    const stillPending = bets.filter(b => (b.status||'PENDING') === 'PENDING');

    if(!settled.length) return { username, archived: 0, pendingLeft: stillPending.length };

    const won = settled.filter(b => b.status === 'WON');
    const lost = settled.filter(b => b.status === 'LOST');
    const voided = settled.filter(b => b.status === 'VOID');
    const seasonSummary = {
      totalBets: settled.length,
      winningBets: won.length,
      winnings: won.reduce((s,b)=>s+b.potentialReturn, 0),
      losingBets: lost.length,
      losses: lost.reduce((s,b)=>s+b.stake, 0),
      voidBets: voided.length,
      voidReturn: voided.reduce((s,b)=>s+b.stake, 0),
    };

    // Add this season's numbers on top of whatever's already there, rather
    // than replacing it -- historicalRecord accumulates across every season
    // this way, same shape it's always had.
    const prior = u.historicalRecord || { totalBets:0, winningBets:0, winnings:0, losingBets:0, losses:0, voidBets:0, voidReturn:0 };
    u.historicalRecord = {
      totalBets: prior.totalBets + seasonSummary.totalBets,
      winningBets: prior.winningBets + seasonSummary.winningBets,
      winnings: prior.winnings + seasonSummary.winnings,
      losingBets: prior.losingBets + seasonSummary.losingBets,
      losses: prior.losses + seasonSummary.losses,
      voidBets: prior.voidBets + seasonSummary.voidBets,
      voidReturn: prior.voidReturn + seasonSummary.voidReturn,
    };

    // Legacy "best 3" -- kept as full bet detail (not just a number) for
    // bragging rights, re-ranked across all-time every rollover so it's
    // always the genuine best 3 ever, not 3-per-season piling up forever.
    const candidates = (u.legacyBestBets || []).concat(
      won.map(b => ({
        selections: b.selections, stake: b.stake, combinedOdds: b.combinedOdds,
        potentialReturn: b.potentialReturn, timestamp: b.timestamp, season: seasonLabel || null,
      }))
    );
    candidates.sort((a,b) => b.potentialReturn - a.potentialReturn);
    u.legacyBestBets = candidates.slice(0, 3);

    // Once-per-season mechanics reset with the season itself.
    u.nearMissBonusUsed = false;
    u.boostUsedRound = null;

    await saveUser(u);
    await sset(idxKey, stillPending.map(b => b.id));
    return { username, archived: settled.length, pendingLeft: stillPending.length };
  }

  async function endSeasonRollover(seasonLabel){
    const usernames = await getIndex('bilbbet2_users_index');
    const users = (await Promise.all(usernames.map(getUser))).filter(Boolean);
    const nonAdmin = users.filter(u => !u.isAdmin);

    let totalPending = 0;
    for(const u of nonAdmin){
      const ids = await getIndex('bilbbet2_bets_index_' + u.username.toLowerCase());
      const bets = (await Promise.all(ids.map(id => sget('bilbbet2_bet:'+id)))).filter(Boolean);
      totalPending += bets.filter(b => (b.status||'PENDING') === 'PENDING').length;
    }
    const pendingWarning = totalPending > 0
      ? `\n\nHeads up: ${totalPending} bet(s) across all punters are still PENDING -- those will be left untouched and stay live (not archived), so resolve them first if you'd rather they be included in this season's record.`
      : '';
    if(!confirm(`End the season and archive everyone's settled bets into their career record? `
      + `This compacts each punter's bet history down to a summary (plus their best 3 all-time bets kept in full), `
      + `resets Round to 1 with betting open, and clears out this season's cup/playoff fixtures, ECL group draw, `
      + `paused markets, and novelty bets so the new season starts clean. `
      + `Punter balances are NOT touched -- everyone keeps exactly what they ended the season with. This can't be undone.${pendingWarning}`)) return;

    const results = [];
    for(const u of nonAdmin){
      const r = await archiveBetsForUser(u.username, seasonLabel);
      if(r) results.push(r);
    }
    // the global bets index only needs to keep whatever's still pending --
    // everything settled has already been folded into each punter's record
    const stillLiveIds = [];
    for(const u of nonAdmin){
      const ids = await getIndex('bilbbet2_bets_index_' + u.username.toLowerCase());
      stillLiveIds.push(...ids);
    }
    await sset('bilbbet2_all_bets_index', stillLiveIds);

    // Clear every piece of season-specific state that was previously left
    // to silently carry over -- found by checking, for each one, whether it
    // gets persisted and reloaded on boot (all five do). Left stale, the
    // new season would start with last season's cup/playoff matchups still
    // showing, an ECL draw full of teams that may have been relegated, and
    // any markets an admin paused for a since-resolved reason staying
    // suspended for no reason anyone would remember. Deliberately writing
    // these directly rather than calling saveCupFixtures()/etc, since those
    // trigger an auto-pause side effect meant for a single fixture changing
    // mid-season -- not relevant here, since every market gets rebuilt from
    // scratch for the new season anyway.
    state.cupFixtures = { 'FA CUP': [], 'ECL': [] };
    state.playoffFixtures = { 'DIVISION 2': [], 'DIVISION 3': [] };
    state.eclGroups = { A: [], B: [], C: [] };
    state.pausedCategories = {};
    await sset('bilbbet2_cup_fixtures', state.cupFixtures);
    await sset('bilbbet2_playoff_fixtures', state.playoffFixtures);
    await sset('bilbbet2_ecl_groups', state.eclGroups);
    await sset('bilbbet2_paused_categories', state.pausedCategories);

    const noveltyIds = await getIndex('bilbbet2_novelty_index');
    await sset('bilbbet2_novelty_index', []);
    state.novelty = [];

    await saveCurrentRound(1);
    await reopenBetting();

    const archivedCount = results.reduce((s,r)=>s+r.archived, 0);
    alert(`Season archived: ${archivedCount} settled bet(s) folded into career records across ${results.length} punter(s). `
      + `Round reset to 1, betting reopened. Cup/playoff fixtures, ECL draw, paused markets, and ${noveltyIds.length} novelty bet(s) cleared. `
      + `Balances left untouched.`);
    await loadAdminData();
  }

  async function saveCurrentRound(round){
    const advanced = round !== state.currentRound;
    await sset('bilbbet2_current_round', round);
    state.currentRound = round;
    if(advanced){
      // moving to a new round starts that round's betting fresh, regardless
      // of how the previous round was left
      state.roundBettingOpen = true;
      await sset('bilbbet2_round_betting_open', true);
    }
    render();
  }

  async function closeBettingNow(scope){
    state.roundBettingOpen = false;
    state.closeScope = scope || 'h2h';
    await sset('bilbbet2_round_betting_open', false);
    await sset('bilbbet2_close_scope', state.closeScope);
    render();
  }

  async function reopenBetting(){
    state.roundBettingOpen = true;
    await sset('bilbbet2_round_betting_open', true);
    render();
  }

  async function requestOddsRefresh(){
    state.oddsRefreshRequested = true;
    await sset('bilbbet2_odds_refresh_requested', true);
    render();
  }

  async function clearOddsRefreshRequest(){
    state.oddsRefreshRequested = false;
    await sset('bilbbet2_odds_refresh_requested', false);
    render();
  }

  async function saveCupFixtures(){
    await sset('bilbbet2_cup_fixtures', state.cupFixtures);
    // Same safeguard as the ECL group draw -- a cup fixture change (a real
    // draw becoming known) makes the stage-progression markets stale.
    // Pausing both competitions here rather than trying to detect which one
    // changed -- better to over-pause and let the admin review than leave a
    // gap where a fresh draw sits behind still-live, now-wrong odds.
    await autoPauseCupStageMarkets('FACUP', 'fa_cup_markets');
    await autoPauseCupStageMarkets('ECL', 'ecl_markets');
    render();
  }

  async function savePlayoffFixtures(){
    await sset('bilbbet2_playoff_fixtures', state.playoffFixtures);
    render();
  }

  // Safeguard against exactly the risk flagged: once a real group draw (or
  // cup fixture) becomes known, the stage-progression markets (reach
  // knockout/SF/final, win) computed BEFORE that draw are instantly stale --
  // and if the market stays open in the gap between the draw becoming known
  // and someone recomputing real odds for it, that gap is gameable by anyone
  // who knows the draw before the system reflects it. So any admin change to
  // a group draw or cup fixtures immediately pauses every stage-outcome
  // MARKET for that whole competition (one flag per market, covering every
  // team in it at once) -- forcing a fresh, explicit unpause (ideally after
  // recomputing real odds) before anyone can bet on it again.
  async function autoPauseCupStageMarkets(cupTag, marketsKey){
    const stageMarketKeys = Object.keys(FUTURES[marketsKey] || {});
    if(!stageMarketKeys.length) return;
    for(const marketKey of stageMarketKeys){
      state.pausedCategories[cupTag+'|'+marketKey] = true;
    }
    await sset('bilbbet2_paused_categories', state.pausedCategories);
  }

  async function assignEclGroup(group, team){
    if(!team || !ALL_TEAMS.includes(team)){ alert('Pick a real team from the suggestions first.'); return; }
    if(!FUTURES.ecl_field.includes(team)){ alert(team+' isn\'t part of this season\'s ECL field.'); return; }
    const alreadyIn = Object.entries(state.eclGroups).find(([g,teams]) => teams.includes(team));
    if(alreadyIn){ alert(team+' is already assigned to Group '+alreadyIn[0]+'.'); return; }
    if(state.eclGroups[group].length >= 4){ alert('Group '+group+' already has 4 teams.'); return; }
    state.eclGroups[group] = [...state.eclGroups[group], team];
    await sset('bilbbet2_ecl_groups', state.eclGroups);
    await autoPauseCupStageMarkets('ECL', 'ecl_markets');
    render();
  }

  async function removeEclGroupTeam(group, team){
    state.eclGroups[group] = state.eclGroups[group].filter(t => t !== team);
    await sset('bilbbet2_ecl_groups', state.eclGroups);
    await autoPauseCupStageMarkets('ECL', 'ecl_markets');
    render();
  }

  async function clearEclGroups(){
    if(!confirm('Clear all ECL group assignments?')) return;
    state.eclGroups = { A: [], B: [], C: [] };
    await sset('bilbbet2_ecl_groups', state.eclGroups);
    await autoPauseCupStageMarkets('ECL', 'ecl_markets');
    render();
  }

  function computeGroupWinnerMarket(teams, nSim){
    nSim = nSim || 10000;
    const samples = {};
    teams.forEach(t => { samples[t] = sampleTeamForCup(t, nSim); });
    const wins = {}; teams.forEach(t => wins[t] = 0);
    for(let i=0;i<nSim;i++){
      let best = teams[0], bestScore = samples[teams[0]][i];
      for(let j=1;j<teams.length;j++){
        if(samples[teams[j]][i] > bestScore){ best = teams[j]; bestScore = samples[teams[j]][i]; }
      }
      wins[best]++;
    }
    return teams.map(t => ({ team: t, pct: 100*wins[t]/nSim }));
  }

  function renderEclGroupBox(group){
    const teams = state.eclGroups[group] || [];
    const complete = teams.length === 4;
    let html = `<div class="bb-card" style="margin-bottom:14px;">
      <div style="font-size:14px;font-weight:600;margin-bottom:8px;">Group ${group}</div>`;
    if(!complete){
      html += `<p style="color:#9a9a9a;font-size:12px;">Not yet drawn &mdash; ${teams.length} of 4 teams assigned. Odds for this group will appear once the draw's confirmed.</p>`;
      if(teams.length){
        html += teams.map(t => `<div style="font-size:13px;padding:3px 0;">${esc(t)}</div>`).join('');
      }
    } else if(!state.roundBettingOpen && state.closeScope === 'all'){
      html += `<p style="color:#9a9a9a;font-size:12px;">\u{1F512} Betting is closed across all markets right now &mdash; hidden until it reopens.</p>`;
    } else {
      const category = 'ECLGROUP|'+group;
      const categoryPaused = !!state.pausedCategories[category];
      const market = computeGroupWinnerMarket(teams);
      html += categoryPauseControl(category, 'Group '+group+' winner market');
      html += market.sort((a,b)=>b.pct-a.pct).map(m => {
        const oddsInfo = toOdds(m.pct);
        const id = 'ECLGROUP|'+group+'|'+m.team;
        const selected = state.slip.some(s=>s.id===id);
        if(oddsInfo.suspended || categoryPaused){
          return `<div style="display:flex;justify-content:space-between;padding:6px 0;opacity:0.5;"><span>${esc(m.team)}</span><span style="color:#9a9a9a;">${categoryPaused && !oddsInfo.suspended ? 'paused' : 'suspended'}</span></div>`;
        }
        return `<div class="bb-outcome ${selected?'selected':''}" data-pick="${esc(id)}" data-label="${esc(m.team)} to win Group ${group}" data-odds="${oddsInfo.odds}">
          <span>${esc(m.team)}</span><span class="bb-odds">${oddsInfo.odds.toFixed(2)}</span></div>`;
      }).join('');
    }
    html += `</div>`;
    return html;
  }

  function renderEclGroups(){
    const assignedCount = Object.values(state.eclGroups).reduce((s,t)=>s+t.length, 0);
    const disclaimer = assignedCount < 12
      ? `<div class="bb-card" style="text-align:center;padding:1.5rem 1rem;color:#9a9a9a;margin-bottom:14px;">
          The group draw hasn't been confirmed yet &mdash; this is a placeholder template. Once the real draw's known, the admin
          assigns each of the 12 qualifying teams to a group below, and betting opens automatically once a group has all 4.
        </div>`
      : '';
    return disclaimer + ['A','B','C'].map(g => renderEclGroupBox(g)).join('');
  }

  async function saveCupOverrides(){
    await sset('bilbbet2_cup_overrides', state.cupCalendarOverrides);
    render();
  }

  async function adjustPunterBalance(username, delta){
    if(!delta){ return; }
    await withUserLock(username, async () => {
      const u = await getUser(username);
      if(!u) return;
      u.balance += delta;
      await saveUser(u);
      if(state.user.username.toLowerCase() === username.toLowerCase()) state.user = u;
    });
    await loadAdminData();
  }

  async function updateRegistrationStatus(username, newStatus){
    await applyRegistrationStatus(username, newStatus);
    await loadAdminData();
  }

  // For a punter who's forgotten their PIN: wipes the account's login and
  // funding state so they can register again from scratch with a new PIN,
  // via the normal registration flow. Their carry balance and historical
  // record get reapplied automatically on re-registration (looked up fresh
  // from the same source data), so nothing there is lost -- only the old
  // PIN, live balance, and current-season status are cleared.
  async function resetRegistration(username){
    if(!confirm(`Reset ${username}'s registration? They'll need to register again with a new PIN, and their current balance will be cleared (their carried-over history isn't lost -- it's reapplied automatically once they re-register and are approved). This can't be undone.`)) return;
    await withUserLock(username, async () => {
      const u = await getUser(username);
      if(!u) return;
      u.status = 'RESET';
      u.pinHash = null;
      u.balance = 0;
      u.everFunded = false;
      await saveUser(u);
    });
    await loadAdminData();
  }

  async function applyRegistrationStatus(username, newStatus){
    const u = await withUserLock(username, async () => {
      const fresh = await getUser(username);
      if(!fresh) return null;
      fresh.status = newStatus;
      if(newStatus === 'APPROVED' && !fresh.everFunded){
        fresh.balance += 1000 + (fresh.dormantCarry || 0);
        fresh.everFunded = true;
      }
      await saveUser(fresh);
      return fresh;
    });
    if(!u) return;
    if(state.user.username.toLowerCase() === username.toLowerCase()) state.user = u;
  }

  async function approveAllPending(){
    const pending = (state.adminPunters||[]).filter(u => (u.status||'APPROVED') === 'PENDING');
    if(!pending.length) return;
    if(!confirm(`Approve all ${pending.length} pending registrations?`)) return;
    for(const u of pending){
      await applyRegistrationStatus(u.username, 'APPROVED');
    }
    await loadAdminData();
  }

  function surpriseMe(){
    let list, tagPrefix;
    if(state.activeTab === 'FUTURES' && state.futuresSubTab === 'RODDY'){
      list = FUTURES.roddy[state.futureMarketTab];
      tagPrefix = 'FUT|RODDY|'+state.futureMarketTab+'|';
    } else if(state.activeTab === 'FUTURES' && FUTURE_DIVS.includes(state.futuresSubTab)){
      list = FUTURES.divisions[state.futuresSubTab][state.futureMarketTab];
      tagPrefix = 'FUT|'+state.futuresSubTab+'|'+state.futureMarketTab+'|';
    } else {
      return;
    }
    const eligible = (list||[]).filter(o => !o.suspended);
    if(!eligible.length){ alert('Nothing to surprise you with here.'); return; }
    const pick = eligible[Math.floor(Math.random()*eligible.length)];
    const id = tagPrefix + pick.team;
    if(state.slip.some(s=>s.id===id)){ alert(pick.team+' is already in your slip!'); return; }
    if(isFeaturedPick(id) && state.user && state.user.featuredPickUsedRound === state.currentRound){
      alert("You've already used this round's featured pick in another bet \u2014 only one featured (boosted) pick per round.");
      return;
    }
    const conflict = findConflict(id);
    if(conflict){ alert("Can't add that selection \u2014 " + conflict.msg + "."); return; }
    state.slip.push({id, label: pick.team, odds: pick.odds, singleStake: state.stake});
    render();
    alert('Surprise pick added: '+pick.team+' @ '+pick.odds.toFixed(2));
  }

  function exportBetsToCSV(){
    const bets = state.adminBets || [];
    const rows = [['Placed','User','Selections','Stake','Combined Odds','Potential Return','Status']];
    bets.forEach(b => {
      const selText = b.selections.map(s => s.label+' ('+s.odds.toFixed(2)+')').join(' | ');
      rows.push([fmtDate(b.timestamp), b.username, selText, b.stake, b.combinedOdds.toFixed(2), b.potentialReturn, b.status||'PENDING']);
    });
    const csv = rows.map(r => r.map(cell => '"'+String(cell).replace(/"/g,'""')+'"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'bilbbet-bets-'+new Date().toISOString().slice(0,10)+'.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
    const initial = await sget('bilbbet2_bet:'+betId);
    if(!initial) return;
    await withUserLock(initial.username, async () => {
      // Re-read the bet INSIDE the lock -- if another call for this same
      // user was already in flight, prevStatus needs to reflect whatever
      // that call actually left behind, not whatever was true before this
      // call started waiting.
      const bet = await sget('bilbbet2_bet:'+betId);
      if(!bet) return;
      const prevStatus = bet.status || 'PENDING';
      if(prevStatus === newStatus) return;
      const u = await getUser(bet.username);
      if(u){
        u.balance -= settlementCredit(prevStatus, bet);
        u.balance += settlementCredit(newStatus, bet);
        // A void means "as if this bet never happened" -- so if it had
        // used this round's featured pick or free multi-boost, that
        // allowance needs to come back too, not stay silently spent on a
        // bet that never actually resolved. Only restores if THIS bet is
        // the one that set it (checked by round, stored on the bet itself
        // at placement time) -- guards against a stale bet from an older
        // round accidentally clearing a genuinely-in-use current one.
        if(newStatus === 'VOID'){
          if(bet.featuredPickRound && u.featuredPickUsedRound === bet.featuredPickRound){
            u.featuredPickUsedRound = null;
          }
          if(bet.boostRound && u.boostUsedRound === bet.boostRound){
            u.boostUsedRound = null;
          }
        }
        await saveUser(u);
        if(state.user.username.toLowerCase() === bet.username.toLowerCase()) state.user = u;
      }
      bet.status = newStatus;
      // keep the per-leg result in sync for single-selection bets, so the data model
      // is consistent regardless of which path resolved the bet
      if(bet.selections.length === 1){
        bet.selections[0].result = newStatus === 'PENDING' ? null : newStatus;
      }
      await sset('bilbbet2_bet:'+betId, bet);
    });
  }

  async function setBetStatus(betId, newStatus){
    await applyBetStatus(betId, newStatus);
    await loadAdminData();
  }

  // Multi-leg resolution: every leg gets resolved individually (some legs might be
  // known before others), and the bet's overall status is derived once every leg has
  // a result -- LOST if any leg lost, otherwise WON (void legs don't count either way).
  function computeOverallStatus(selections){
    if(selections.some(s => s.result === null || s.result === undefined)) return 'PENDING';
    if(selections.some(s => s.result === 'LOST')) return 'LOST';
    return 'WON';
  }

  // A 5+ leg multi that loses by exactly one leg (every other leg won, none voided)
  // earns the punter a bonus credit matching their stake, per house rule.
  function isNearMissBonus(selections){
    if(selections.length < 5) return false;
    const lostCount = selections.filter(s => s.result === 'LOST').length;
    const wonCount = selections.filter(s => s.result === 'WON').length;
    const voidCount = selections.filter(s => s.result === 'VOID').length;
    return lostCount === 1 && voidCount === 0 && wonCount === selections.length - 1;
  }

  async function resolveSelectionResult(betId, index, result){
    const initial = await sget('bilbbet2_bet:'+betId);
    if(!initial) return;
    await withUserLock(initial.username, async () => {
      // Re-read fresh, inside the lock -- if a DIFFERENT leg on this same
      // bet was resolved by a call that was already in flight, that
      // change needs to still be there, not overwritten by this call
      // working from a stale copy.
      const bet = await sget('bilbbet2_bet:'+betId);
      if(!bet) return;
      bet.selections[index].result = result;
      const prevOverall = bet.status || 'PENDING';
      const newOverall = computeOverallStatus(bet.selections);
      const statusChanged = newOverall !== prevOverall;
      const stillQualifies = newOverall === 'LOST' && isNearMissBonus(bet.selections);
      const bonusNeedsClawback = bet.nearMissBonusAwarded && !stillQualifies;
      const bonusNewlyEarned = !bet.nearMissBonusAwarded && stillQualifies;
      if(statusChanged || bonusNeedsClawback || bonusNewlyEarned){
        const u = await getUser(bet.username);
        if(u){
          if(statusChanged){
            u.balance -= settlementCredit(prevOverall, bet);
            u.balance += settlementCredit(newOverall, bet);
            if(newOverall === 'VOID'){
              if(bet.featuredPickRound && u.featuredPickUsedRound === bet.featuredPickRound){
                u.featuredPickUsedRound = null;
              }
              if(bet.boostRound && u.boostUsedRound === bet.boostRound){
                u.boostUsedRound = null;
              }
            }
          }
          if(bonusNeedsClawback){
            u.balance -= bet.stake;
            u.nearMissBonusUsed = false;
            bet.nearMissBonusAwarded = false;
          } else if(bonusNewlyEarned && !u.nearMissBonusUsed){
            u.balance += bet.stake;
            u.nearMissBonusUsed = true;
            bet.nearMissBonusAwarded = true;
          }
          await saveUser(u);
          if(state.user && state.user.username.toLowerCase() === bet.username.toLowerCase()) state.user = u;
        }
        bet.status = newOverall;
      }
      await sset('bilbbet2_bet:'+betId, bet);
    });
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

  async function findBetsReferencingNovelty(noveltyId){
    const pickId = 'NOVELTY|' + noveltyId;
    const betIds = await getIndex('bilbbet2_all_bets_index');
    const bets = (await Promise.all(betIds.map(id => sget('bilbbet2_bet:'+id)))).filter(Boolean);
    return bets.filter(b => b.selections.some(s => s.id === pickId));
  }

  function startEditNovelty(id){
    state.editingNoveltyId = id;
    render();
  }
  function cancelEditNovelty(){
    state.editingNoveltyId = null;
    render();
  }

  async function saveNoveltyEdit(id){
    const nameInput = document.getElementById('edit-novelty-name-'+id);
    const oddsInput = document.getElementById('edit-novelty-odds-'+id);
    const name = nameInput.value.trim();
    const odds = parseFloat(oddsInput.value);
    if(!name || !odds || odds < 1.01){ alert('Enter a name and odds of at least 1.01.'); return; }

    const item = await sget('bilbbet2_novelty:'+id);
    if(!item) return;
    const nameChanged = name !== item.name;
    const oddsChanged = odds !== item.odds;
    if(nameChanged || oddsChanged){
      const referencing = await findBetsReferencingNovelty(id);
      const pendingCount = referencing.filter(b => (b.status||'PENDING')==='PENDING').length;
      if(pendingCount > 0){
        const changeDesc = [nameChanged?'the wording':null, oddsChanged?'the odds':null].filter(Boolean).join(' and ');
        if(!confirm(`${pendingCount} pending bet(s) already reference this item at its current ${changeDesc==='the wording'?'wording':'odds/wording'}. `
          + `Changing ${changeDesc} now means those punters' slips will show the NEW ${changeDesc.includes('odds')?'odds':'wording'} retroactively, `
          + `which they didn't actually agree to. Proceed anyway?`)) return;
      }
    }
    item.name = name;
    item.odds = Math.round(odds*100)/100;
    await sset('bilbbet2_novelty:'+id, item);
    state.editingNoveltyId = null;
    await loadAdminData();
  }

  async function deleteNoveltyItem(id){
    const item = await sget('bilbbet2_novelty:'+id);
    if(!item) return;
    const referencing = await findBetsReferencingNovelty(id);
    const pending = referencing.filter(b => (b.status||'PENDING')==='PENDING');
    let msg = `Remove "${item.name}" completely? This can't be undone.`;
    if(pending.length){
      msg = `Remove "${item.name}" completely? ${pending.length} pending bet(s) reference it -- removing it will VOID `
        + `those bets (single-selection ones refunded automatically; any that are one leg of a bigger multi will need manual review). This can't be undone.`;
    }
    if(!confirm(msg)) return;

    for(const bet of pending){
      if(bet.selections.length === 1 && bet.selections[0].id === 'NOVELTY|'+id){
        await applyBetStatus(bet.id, 'VOID');
      }
    }
    const idx = await getIndex('bilbbet2_novelty_index');
    await sset('bilbbet2_novelty_index', idx.filter(x => x !== id));
    state.novelty = (state.novelty||[]).filter(n => n.id !== id);
    await loadAdminData();
  }

  async function loadSuggestions(){
    const ids = await getIndex('bilbbet2_suggestions_index');
    const items = (await Promise.all(ids.map(id => sget('bilbbet2_suggestion:'+id)))).filter(Boolean);
    state.suggestions = items;
    render();
  }

  async function submitSuggestion(){
    if(!state.user){ alert('You must log in first to submit an idea.'); state.loginModalOpen = true; render(); return; }
    const text = (state.suggestionText||'').trim();
    if(!text){ alert('Write your idea first.'); return; }
    const item = { id: uid(), text, submittedBy: state.user.username, status: 'PENDING_REVIEW', createdAt: Date.now() };
    await sset('bilbbet2_suggestion:'+item.id, item);
    await addToIndex('bilbbet2_suggestions_index', item.id);
    state.suggestionText = '';
    await loadSuggestions();
    alert('Idea submitted \u2014 the admin will review it.');
  }

  async function approveSuggestion(suggestionId){
    const input = document.getElementById('suggestion-price-'+suggestionId);
    const odds = parseFloat(input.value);
    if(!odds || odds < 1.01){ alert('Enter odds of at least 1.01 to approve this idea.'); return; }
    const suggestion = await sget('bilbbet2_suggestion:'+suggestionId);
    if(!suggestion) return;
    const item = { id: uid(), name: suggestion.text, odds: Math.round(odds*100)/100, status: 'OPEN', createdAt: Date.now() };
    await sset('bilbbet2_novelty:'+item.id, item);
    await addToIndex('bilbbet2_novelty_index', item.id);
    suggestion.status = 'APPROVED';
    await sset('bilbbet2_suggestion:'+suggestionId, suggestion);
    await loadSuggestions();
    await loadAdminData();
  }

  async function rejectSuggestion(suggestionId){
    const suggestion = await sget('bilbbet2_suggestion:'+suggestionId);
    if(!suggestion) return;
    suggestion.status = 'REJECTED';
    await sset('bilbbet2_suggestion:'+suggestionId, suggestion);
    await loadSuggestions();
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
    const allUsers = (await Promise.all(usernames.map(getUser))).filter(Boolean);
    const users = allUsers.filter(u => !u.isAdmin);
    const adminUsernames = new Set(allUsers.filter(u => u.isAdmin).map(u => u.username.toLowerCase()));
    const betIds = await getIndex('bilbbet2_all_bets_index');
    const allBets = (await Promise.all(betIds.map(id => sget('bilbbet2_bet:'+id)))).filter(Boolean);
    const bets = allBets.filter(b => !adminUsernames.has(b.username.toLowerCase()));

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
    let myKittyRank = null;
    if(state.user){
      const sortedByBalance = users.slice().sort((a,b)=>b.balance-a.balance);
      const idx = sortedByBalance.findIndex(u => u.username.toLowerCase() === state.user.username.toLowerCase());
      if(idx >= 0) myKittyRank = { rank: idx+1, of: sortedByBalance.length };
    }
    const withHistory = users.filter(u => u.historicalRecord && u.historicalRecord.totalBets > 0);
    const topCareerWins = withHistory.slice()
      .sort((a,b) => b.historicalRecord.winningBets - a.historicalRecord.winningBets)
      .slice(0,5)
      .map(u => ({ label: u.username+' \u2014 '+u.historicalRecord.totalBets+' bets carried over', value: u.historicalRecord.winningBets }));

    state.statsData = {
      totalWagered: bets.reduce((s,b)=>s+b.stake,0),
      totalBets: bets.length,
      totalPunters: users.length,
      topStakes, topMultis, topWins, topLosses, topOdds, mostPopular, topKitty, topCareerWins, myKittyRank,
    };
    render();
  }

  function renderMain(){
    if(state.activeTab === 'ADMIN' && !(state.user && state.user.isAdmin)) state.activeTab = 'H2H';
    let body = '';
    if(state.activeTab === 'HOME'){
      body = renderHomeTab();
    } else if(state.activeTab === 'H2H'){
      body = renderH2HTab();
    } else if(state.activeTab === 'MY BETS'){
      body = renderMyBetsTab();
    } else if(state.activeTab === 'SPECIALS'){
      body = renderSpecialsTab();
    } else if(state.activeTab === 'STATS'){
      body = renderStatsTab();
    } else if(state.activeTab === 'ADMIN'){
      body = renderAdminTab();
    } else if(state.activeTab === 'FUTURES'){
      const stripe = divisionHeaderBanner(state.futuresSubTab);
      if(state.futuresSubTab === 'RODDY'){
        body = stripe + futuresSubTabBar() + roddyMarketTabs() + (state.futureMarketTab === 'leading_at'
          ? renderLeadingAtMarket('RODDY')
          : `<button class="bb-btn ghost" id="surprise-me-btn" style="margin-bottom:10px;padding:6px 12px;font-size:12px;">\u{1F3B2} Surprise me</button>` + sectionRibbon() + `<div id="outcomes-list">${futuresOutcomesList('RODDY', state.futureMarketTab)}</div>`);
      } else if(state.futuresSubTab === 'FA CUP'){
        body = stripe + futuresSubTabBar() + cupMarketTabs('fa_cup_labels') + sectionRibbon() +
          (state.futureMarketTab === 'fixtures' ? renderCupFixtures('FA CUP') :
            `<p style="color:#9a9a9a;font-size:12px;margin-bottom:10px;">Real Round of 64 draw from the 26/27 file: 62 entrants plus confirmed byes for Big Mac FC and Harvey Frekes. No matches played yet, so the whole bracket is simulated.</p>` +
            `<div id="outcomes-list">${cupOutcomesList('fa_cup_markets', state.futureMarketTab)}</div>`);
      } else if(state.futuresSubTab === 'ECL'){
        body = stripe + futuresSubTabBar() + cupMarketTabs('ecl_labels') + sectionRibbon() +
          (state.futureMarketTab === 'fixtures' ? renderCupFixtures('ECL') :
           state.futureMarketTab === 'groups' ? renderEclGroups() :
            `<p style="color:#9a9a9a;font-size:12px;margin-bottom:10px;">12 confirmed qualifiers for the 26/27 ECL, group draw not yet assigned (see the Groups tab). Stage odds below assume the field regardless of group -- they'll sharpen once groups are confirmed.</p>` +
            `<div id="outcomes-list">${cupOutcomesList('ecl_markets', state.futureMarketTab)}</div>`);
      } else {
        body = stripe + futuresSubTabBar() + futuresMarketTabs() + (state.futureMarketTab === 'leading_at'
          ? renderLeadingAtMarket(state.futuresSubTab)
          : `<button class="bb-btn ghost" id="surprise-me-btn" style="margin-bottom:10px;padding:6px 12px;font-size:12px;">\u{1F3B2} Surprise me</button>` + sectionRibbon() + `<div id="outcomes-list">${futuresOutcomesList(state.futuresSubTab, state.futureMarketTab)}</div>`);
      }
    } else {
      body = `<p style="color:#9a9a9a;">Unknown tab.</p>`;
    }
    return `<div>${renderStorageWarning()}${header()}${renderTeamSearchPanel()}${mainTabs()}${body}${renderFooter()}</div>${['ADMIN','STATS'].includes(state.activeTab) ? '' : slipBar()}${state.loginModalOpen ? renderLoginModal() : ''}${state.tosModalOpen ? renderTosModal() : ''}${state.readMeModalOpen ? renderReadMeModal() : ''}${teamsDatalist()}`;
  }

  function combinedOdds(){ return combinedOddsFor(state.slip); }
  function combinedOddsFor(slip){ return slip.reduce((acc,s)=>acc*s.odds,1); }
  const BOOST_MULTIPLIER = 1.10; // one free +10% odds boost per punter per round, on a 3+ leg multi

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
    if(parts[0]==='SPECIALFIX'){
      // either SPECIALFIX|marketKey|team (season-long) or SPECIALFIX|marketKey|Rn|team (round-based)
      const marketKey = parts[1];
      const team = parts[parts.length-1];
      const roundTag = parts.length===4 ? parts[2] : null;
      return { type:'specialfix', marketKey, team, group: 'SPECIALFIX-SINGLE|'+marketKey+(roundTag?('|'+roundTag):'') };
    }
    return { type:'unknown' };
  }

  function chainOf(marketKey){
    if(UPPER_SET.has(marketKey)) return 'upper';
    if(LOWER_SET.has(marketKey)) return 'lower';
    if(RODDY_CHAIN.includes(marketKey)) return 'roddy';
    return null;
  }

  // A pick counts as "featured" if it matches one of the current round's
  // Home-tab featured selections (fixtures or futures) -- the boosted
  // price only applies to picks actually offered there, so this is the
  // single source of truth both the slip-limit check and the boost-
  // eligibility check below key off of.
  function isFeaturedPick(pickId){
    const fixtures = state.featuredFixturesData || [];
    if(fixtures.some(p => p.id === pickId)) return true;
    const futures = computeFeaturedFutures();
    return futures.some(p => p.id === pickId);
  }
  function findConflict(newId){
    const np = parsePick(newId);

    // Only one featured (boosted) pick allowed per slip -- and, checked at
    // placement time in placeBet/placeBetsAsSingles, only one per round
    // even across separate bets. The promotional boost is meant as one
    // genuine highlight per punter per round, not something to stack.
    if(isFeaturedPick(newId)){
      const existingFeatured = state.slip.find(s => isFeaturedPick(s.id));
      if(existingFeatured){
        return { reason:'featured-limit', msg: `only one featured (boosted) pick allowed per round \u2014 you already have ${existingFeatured.label} in this slip` };
      }
    }
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

  function buildSlipText(){
    const lines = ['My bilbbet slip:'];
    state.slip.forEach(s => lines.push('- ' + s.label + ' (' + s.odds.toFixed(2) + ')'));
    if(state.betMode === 'multi' && state.slip.length){
      lines.push('Combined odds: ' + combinedOdds().toFixed(2));
      lines.push('Stake: ' + state.stake + ' clams \u2192 potential ' + Math.round(state.stake*combinedOdds()) + ' clams');
    }
    return lines.join('\n');
  }

  async function copySlipToClipboard(){
    const text = buildSlipText();
    try {
      if(navigator.clipboard && navigator.clipboard.writeText){
        await navigator.clipboard.writeText(text);
        alert('Slip copied \u2014 paste it wherever you like.');
        return;
      }
    } catch(e) { /* fall through to the manual fallback below */ }
    prompt('Copy this slip manually:', text);
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
        <span style="display:flex;gap:6px;">
          <button class="bb-btn ghost" id="copy-slip" style="padding:4px 10px;font-size:12px;">Copy slip</button>
          <button class="bb-btn ghost" id="clear-slip" style="padding:4px 10px;font-size:12px;">Clear</button>
        </span>
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
    const hasFeaturedInSlip = state.slip.some(s => isFeaturedPick(s.id));
    const boostEligible = state.user && !hasFeaturedInSlip && state.slip.length >= 3 && (!state.user.boostUsedRound || state.user.boostUsedRound !== state.currentRound);
    const boostApplied = boostEligible && state.useBoost;
    const displayedCombined = boostApplied ? combined * BOOST_MULTIPLIER : combined;
    const displayedPotential = state.stake * displayedCombined;
    const boostToggle = boostEligible ? `
      <label style="display:flex;align-items:center;gap:8px;font-size:12px;margin-bottom:8px;background:#4a3a10;border-radius:8px;padding:8px 10px;">
        <input type="checkbox" id="use-boost-checkbox" ${state.useBoost?'checked':''}/>
        <span style="color:#ffdd00;">Use your Round ${state.currentRound} boosted odd \u2014 free +${Math.round((BOOST_MULTIPLIER-1)*100)}% on this multi (one per round).</span>
      </label>` : (hasFeaturedInSlip ? `
      <div style="font-size:11px;color:#9a9a9a;margin-bottom:8px;">This slip already includes a featured (boosted) pick, so the separate multi-boost can't also be applied.</div>` : '');
    return `<div class="bb-slip"><div class="bb-slip-inner">
      ${modeToggle}${header}
      <div style="max-height:100px;overflow-y:auto;margin-bottom:8px;">
        ${state.slip.map(s => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid #333333;">
          <span style="color:#cfcfcf;">${esc(s.label)}</span>
          <span style="display:flex;gap:8px;align-items:center;"><span class="bb-odds">${s.odds.toFixed(2)}</span>
          <span data-remove="${esc(s.id)}" style="cursor:pointer;color:#9a9a9a;">&times;</span></span></div>`).join('')}
      </div>
      ${boostToggle}
      <div style="display:flex;gap:8px;align-items:center;">
        <div style="flex:1;"><span style="font-size:11px;color:#9a9a9a;">Stake (clams)</span>
          <input class="bb-input" id="stake-input" type="number" min="1" value="${state.stake}" style="padding:6px 10px;"/></div>
        <div style="flex:1;"><span style="font-size:11px;color:#9a9a9a;">Combined odds</span>
          <div style="font-weight:600;color:#ffdd00;padding:6px 0;">${displayedCombined.toFixed(2)}${boostApplied?' \u26A1':''}</div></div>
        <div style="flex:1;"><span style="font-size:11px;color:#9a9a9a;">Potential return</span>
          <div style="font-weight:600;padding:6px 0;">${fmt(Math.round(displayedPotential))}</div></div>
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
    const fUser = $('#f-user');
    if(fUser){
      fUser.oninput = e => { state.username = e.target.value; state.adminLoginMode = false; };
      fUser.onchange = e => { state.username = matchTeamName(e.target.value); state.adminLoginMode = false; render(); };
    }
    const fPin = $('#f-pin'); if(fPin) fPin.oninput = e => { state.pin = e.target.value; };
    const loginForm = $('#login-form'); if(loginForm) loginForm.onsubmit = e => { e.preventDefault(); doLogin(); };
    const registerBtn = $('#register-submit');
    if(registerBtn) registerBtn.onclick = () => { state.registeringMode = true; state.error=''; render(); };
    const backFromRegisterBtn = $('#back-from-register');
    if(backFromRegisterBtn) backFromRegisterBtn.onclick = () => { state.registeringMode = false; state.tosAgreed = false; state.error=''; render(); };
    const confirmRegisterBtn = $('#confirm-register-submit');
    if(confirmRegisterBtn) confirmRegisterBtn.onclick = doRegister;
    const openTosRegisterLink = $('#open-tos-register');
    if(openTosRegisterLink) openTosRegisterLink.onclick = () => { state.tosModalOpen = true; state.tosMode = 'register'; render(); };
    const openTosFooterLink = $('#open-tos-footer');
    if(openTosFooterLink) openTosFooterLink.onclick = () => { state.tosModalOpen = true; state.tosMode = 'view'; render(); };
    const closeTosBtn = $('#close-tos-modal');
    if(closeTosBtn) closeTosBtn.onclick = () => { state.tosModalOpen = false; render(); };
    const openReadMeLink = $('#open-readme-footer');
    if(openReadMeLink) openReadMeLink.onclick = () => { state.readMeModalOpen = true; render(); };
    const closeReadMeBtn = $('#close-readme-modal');
    if(closeReadMeBtn) closeReadMeBtn.onclick = () => { state.readMeModalOpen = false; render(); };
    const tosCheckbox = $('#tos-agree-checkbox');
    if(tosCheckbox) tosCheckbox.onchange = e => { state.tosAgreed = e.target.checked; render(); };
    const tosCheckboxInline = $('#tos-agree-checkbox-inline');
    if(tosCheckboxInline) tosCheckboxInline.onchange = e => { state.tosAgreed = e.target.checked; render(); };
    const logoutBtn = $('#logout-btn');
    if(logoutBtn) logoutBtn.onclick = () => { state = {...state, screen:'main', user:null, username:'', pin:'', adminLoginMode:false, registeringMode:false, tosAgreed:false, error:'', info:'', loginModalOpen:false, slip:[], betMode:'multi', activeTab:'HOME', h2hMarket:null, h2hFixtureMarket:null, myBets:null, adminPunters:null, adminBets:null, novelty:null, statsData:null}; render(); };
    const openLoginBtn = $('#open-login-btn'); if(openLoginBtn) openLoginBtn.onclick = () => { state.loginModalOpen = true; state.adminLoginMode=false; state.error=''; state.info=''; render(); };
    const openTeamSearchBtn = $('#open-team-search-btn'); if(openTeamSearchBtn) openTeamSearchBtn.onclick = () => { state.teamSearchOpen = true; render(); };
    const closeTeamSearchBtn = $('#close-team-search'); if(closeTeamSearchBtn) closeTeamSearchBtn.onclick = () => { state.teamSearchOpen = false; state.teamSearchQuery=''; render(); };
    const headerTeamSearch = $('#header-team-search');
    if(headerTeamSearch){
      headerTeamSearch.oninput = e => { state.teamSearchQuery = e.target.value; };
      headerTeamSearch.onchange = e => { state.teamSearchQuery = e.target.value; render(); };
    }
    const closeLoginBtn = $('#close-login-modal'); if(closeLoginBtn) closeLoginBtn.onclick = () => { state.loginModalOpen = false; state.adminLoginMode=false; state.registeringMode=false; state.tosAgreed=false; state.error=''; state.info=''; render(); };
    const useAdminBtn = $('#use-admin-login'); if(useAdminBtn) useAdminBtn.onclick = () => { state.adminLoginMode = true; render(); };
    document.querySelectorAll('[data-tab]').forEach(el => el.onclick = () => {
      state.activeTab = el.dataset.tab;
      state.cupFixtureMarket = null;
      state.playoffFixtureMarket = null;
      if(state.activeTab === 'FUTURES'){
        if(state.futuresSubTab === 'RODDY') state.futureMarketTab = Object.keys(FUTURES.roddy_labels)[0];
        else if(state.futuresSubTab === 'FA CUP') state.futureMarketTab = Object.keys(FUTURES.fa_cup_labels)[0];
        else if(state.futuresSubTab === 'ECL') state.futureMarketTab = Object.keys(FUTURES.ecl_labels)[0];
        else state.futureMarketTab = Object.keys(FUTURES.market_labels)[0];
      }
      if(state.activeTab === 'MY BETS'){ if(!state.user){ render(); return; } state.myBets = null; render(); loadMyBets(); return; }
      if(state.activeTab === 'ADMIN'){ state.adminPunters = null; state.adminBets = null; render(); loadAdminData(); return; }
      if(state.activeTab === 'SPECIALS'){ state.novelty = null; state.suggestions = null; render(); loadNovelty(); loadSuggestions(); return; }
      if(state.activeTab === 'STATS'){ state.statsData = null; render(); loadStats(); return; }
      render();
    });
    document.querySelectorAll('[data-marketkey]').forEach(el => el.onclick = () => { state.futureMarketTab = el.dataset.marketkey; state.cupFixtureMarket = null; render(); });
    const teamAEl = $('#team-a');
    if(teamAEl){
      teamAEl.oninput = e => { state.teamA = e.target.value; };
      teamAEl.onchange = e => { state.teamA = matchTeamName(e.target.value); state.h2hMarket=null; render(); };
    }
    const teamBEl = $('#team-b');
    if(teamBEl){
      teamBEl.oninput = e => { state.teamB = e.target.value; };
      teamBEl.onchange = e => { state.teamB = matchTeamName(e.target.value); state.h2hMarket=null; render(); };
    }
    const roundEl = $('#h2h-round'); if(roundEl) roundEl.onchange = e => { state.h2hRound=parseInt(e.target.value,10); state.h2hMarket=null; state.h2hFixtureMarket=null; render(); };
    const leadingAtRoundEl = $('#leadingat-round'); if(leadingAtRoundEl) leadingAtRoundEl.onchange = e => { state.leadingAtRound=parseInt(e.target.value,10); render(); };
    document.querySelectorAll('[data-specials-round-picker]').forEach(el => el.onchange = e => { state.specialsRound = parseInt(e.target.value,10); render(); });
    document.querySelectorAll('[data-toggle-extreme-list]').forEach(el => el.onclick = () => {
      const kind = el.dataset.toggleExtremeList;
      state.specialsExtremeExpanded = state.specialsExtremeExpanded === kind ? null : kind;
      render();
    });
    const winRoundEl = $('#special-win-round');
    if(winRoundEl){
      winRoundEl.oninput = e => { state.specialsSelection.win_round = e.target.value; };
      winRoundEl.onchange = e => { state.specialsSelection.win_round = matchTeamName(e.target.value); render(); };
    }
    const loseRoundEl = $('#special-lose-round');
    if(loseRoundEl){
      loseRoundEl.oninput = e => { state.specialsSelection.lose_round = e.target.value; };
      loseRoundEl.onchange = e => { state.specialsSelection.lose_round = matchTeamName(e.target.value); render(); };
    }
    const charityEl = $('#special-charity');
    if(charityEl){
      charityEl.oninput = e => { state.specialsSelection.charity = e.target.value; };
      charityEl.onchange = e => { state.specialsSelection.charity = matchTeamName(e.target.value); render(); };
    }
    const philanthropyEl = $('#special-philanthropy');
    if(philanthropyEl){
      philanthropyEl.oninput = e => { state.specialsSelection.philanthropy = e.target.value; };
      philanthropyEl.onchange = e => { state.specialsSelection.philanthropy = matchTeamName(e.target.value); render(); };
    }
    const getBtn = $('#get-market'); if(getBtn) getBtn.onclick = () => { state.h2hMarket = computeH2HMarket(state.teamA, state.teamB, state.h2hRound); render(); };
    document.querySelectorAll('[data-h2hsubtab]').forEach(el => el.onclick = () => { state.h2hSubTab = el.dataset.h2hsubtab; state.h2hFixtureMarket=null; state.cupFixtureMarket=null; render(); });
    document.querySelectorAll('[data-futuressubtab]').forEach(el => el.onclick = () => {
      state.futuresSubTab = el.dataset.futuressubtab;
      // Each sub-tab has its own market set (Roddy/FA Cup/ECL each have
      // their own labels, divisions share market_labels but even among
      // those promotion_pct/relegation_pct/bottom3_pct are division-
      // specific) -- reset to that set's first market rather than risk
      // landing on one that gets filtered out and silently shows nothing.
      if(state.futuresSubTab === 'RODDY') state.futureMarketTab = Object.keys(FUTURES.roddy_labels)[0];
      else if(state.futuresSubTab === 'FA CUP') state.futureMarketTab = Object.keys(FUTURES.fa_cup_labels)[0];
      else if(state.futuresSubTab === 'ECL') state.futureMarketTab = Object.keys(FUTURES.ecl_labels)[0];
      else state.futureMarketTab = Object.keys(FUTURES.market_labels)[0];
      render();
    });
    document.querySelectorAll('[data-specialssubtab]').forEach(el => el.onclick = () => { state.specialsSubTab = el.dataset.specialssubtab; render(); });
    document.querySelectorAll('[data-fixture-expand]').forEach(el => el.onclick = () => {
      const [div, idx] = el.dataset.fixtureExpand.split('|');
      state.h2hFixtureMarket = getFixtureMarkets(div, state.h2hRound)[parseInt(idx,10)];
      render();
    });
    const backBtn = $('#back-to-fixtures'); if(backBtn) backBtn.onclick = () => { state.h2hFixtureMarket=null; render(); };
    document.querySelectorAll('[data-cupfixture]').forEach(el => el.onclick = () => {
      const [compKey, idx] = el.dataset.cupfixture.split('|');
      const f = state.cupFixtures[compKey][parseInt(idx,10)];
      state.cupFixtureMarket = computeH2HMarket(f.teamA, f.teamB, state.currentRound);
      state.cupFixtureMarketStage = f.stage || null;
      render();
    });
    const backCupBtn = $('#back-to-cup-fixtures'); if(backCupBtn) backCupBtn.onclick = () => { state.cupFixtureMarket = null; state.cupFixtureMarketStage = null; render(); };
    document.querySelectorAll('[data-playoffsubtab]').forEach(el => el.onclick = () => { state.playoffSubTab = el.dataset.playoffsubtab; state.playoffFixtureMarket = null; render(); });
    document.querySelectorAll('[data-adminsubtab]').forEach(el => el.onclick = () => { state.adminSubTab = el.dataset.adminsubtab; render(); });
    document.querySelectorAll('[data-playofffixture]').forEach(el => el.onclick = () => {
      const [div, idx] = el.dataset.playofffixture.split('|');
      const f = state.playoffFixtures[div][parseInt(idx,10)];
      state.playoffFixtureMarket = computeH2HMarket(f.teamA, f.teamB, state.currentRound);
      state.playoffFixtureMarketStage = f.stage || null;
      render();
    });
    const backPlayoffBtn = $('#back-to-playoff-fixtures'); if(backPlayoffBtn) backPlayoffBtn.onclick = () => { state.playoffFixtureMarket = null; state.playoffFixtureMarketStage = null; render(); };
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
      if(isPickBlocked(id)){
        alert(state.closeScope === 'all'
          ? 'Betting is currently closed while Round '+state.currentRound+' is being resolved.'
          : 'Betting for Round '+state.currentRound+' is currently closed.');
        return;
      }
      if(isFeaturedPick(id) && state.user.featuredPickUsedRound === state.currentRound){
        alert("You've already used this round's featured pick in another bet \u2014 only one featured (boosted) pick per round.");
        return;
      }
      const conflict = findConflict(id);
      if(conflict){ alert("Can't add that selection \u2014 " + conflict.msg + "."); return; }
      state.slip.push({id, label: el.dataset.label || el.dataset.team, odds: parseFloat(el.dataset.odds), singleStake: state.stake});
      render();
    });
    document.querySelectorAll('[data-betmode]').forEach(el => el.onclick = () => { state.betMode = el.dataset.betmode; render(); });
    const useBoostCheckbox = $('#use-boost-checkbox'); if(useBoostCheckbox) useBoostCheckbox.onchange = e => { state.useBoost = e.target.checked; render(); };
    document.querySelectorAll('[data-pause-category]').forEach(el => {
      el.onclick = e => { e.stopPropagation(); };
      el.onchange = e => { e.stopPropagation(); toggleCategoryPause(el.dataset.pauseCategory); };
    });
    document.querySelectorAll('[data-single-stake]').forEach(el => el.oninput = e => {
      const item = state.slip.find(s=>s.id===el.dataset.singleStake);
      if(item) item.singleStake = Math.max(1, parseInt(e.target.value,10)||1);
    });
    const clearBtn = $('#clear-slip'); if(clearBtn) clearBtn.onclick = () => { state.slip=[]; render(); };
    const copySlipBtn = $('#copy-slip'); if(copySlipBtn) copySlipBtn.onclick = copySlipToClipboard;
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
    const approveAllBtn = $('#approve-all-btn'); if(approveAllBtn) approveAllBtn.onclick = approveAllPending;
    const exportCsvBtn = $('#export-bets-csv'); if(exportCsvBtn) exportCsvBtn.onclick = exportBetsToCSV;
    const surpriseMeBtn = $('#surprise-me-btn'); if(surpriseMeBtn) surpriseMeBtn.onclick = surpriseMe;
    document.querySelectorAll('[data-kick-user]').forEach(el => el.onclick = () => {
      const username = el.dataset.kickUser;
      if(!confirm('Kick '+username+'? They\'ll be blocked from logging in until reinstated.')) return;
      updateRegistrationStatus(username, 'KICKED');
    });
    document.querySelectorAll('[data-reset-registration]').forEach(el => el.onclick = () => resetRegistration(el.dataset.resetRegistration));
    document.querySelectorAll('[data-setstatus]').forEach(el => el.onclick = () => {
      const [betId, status] = el.dataset.setstatus.split('|');
      setBetStatus(betId, status);
    });
    document.querySelectorAll('[data-resolveleg]').forEach(el => el.onclick = () => {
      const [betId, idx, result] = el.dataset.resolveleg.split('|');
      resolveSelectionResult(betId, parseInt(idx,10), result);
    });
    const addNoveltyBtn = $('#add-novelty'); if(addNoveltyBtn) addNoveltyBtn.onclick = addNoveltyItem;
    const suggestionText = $('#suggestion-text'); if(suggestionText) suggestionText.oninput = e => { state.suggestionText = e.target.value; };
    const submitSuggestionBtn = $('#submit-suggestion-btn'); if(submitSuggestionBtn) submitSuggestionBtn.onclick = submitSuggestion;
    document.querySelectorAll('[data-approve-suggestion]').forEach(el => el.onclick = () => approveSuggestion(el.dataset.approveSuggestion));
    document.querySelectorAll('[data-reject-suggestion]').forEach(el => el.onclick = () => rejectSuggestion(el.dataset.rejectSuggestion));
    const saveRoundBtn = $('#save-current-round');
    if(saveRoundBtn) saveRoundBtn.onclick = () => {
      const sel = document.getElementById('admin-current-round');
      saveCurrentRound(parseInt(sel.value, 10));
    };
    const endSeasonBtn = $('#end-season-btn');
    if(endSeasonBtn) endSeasonBtn.onclick = () => endSeasonRollover();
    const closeBettingBtn = $('#close-betting-btn'); if(closeBettingBtn) closeBettingBtn.onclick = () => closeBettingNow(state.closeScope);
    const closeScopeH2h = $('#close-scope-h2h'); if(closeScopeH2h) closeScopeH2h.onchange = () => { state.closeScope = 'h2h'; render(); };
    const closeScopeAll = $('#close-scope-all'); if(closeScopeAll) closeScopeAll.onchange = () => { state.closeScope = 'all'; render(); };
    const reopenBettingBtn = $('#reopen-betting-btn'); if(reopenBettingBtn) reopenBettingBtn.onclick = reopenBetting;
    const requestRefreshBtn = $('#request-odds-refresh-btn'); if(requestRefreshBtn) requestRefreshBtn.onclick = requestOddsRefresh;
    const clearRefreshBtn = $('#clear-odds-refresh-btn'); if(clearRefreshBtn) clearRefreshBtn.onclick = clearOddsRefreshRequest;
    for(const comp of ['FA CUP','ECL']){
      const aEl = $('#cup-team-a-'+idSafe(comp));
      if(aEl){
        aEl.oninput = e => { state.cupAdminEntry[comp].teamA = e.target.value; };
        aEl.onchange = e => { state.cupAdminEntry[comp].teamA = matchTeamName(e.target.value); };
      }
      const bEl = $('#cup-team-b-'+idSafe(comp));
      if(bEl){
        bEl.oninput = e => { state.cupAdminEntry[comp].teamB = e.target.value; };
        bEl.onchange = e => { state.cupAdminEntry[comp].teamB = matchTeamName(e.target.value); };
      }
    }
    document.querySelectorAll('[data-add-cupfixture]').forEach(el => el.onclick = () => {
      const comp = el.dataset.addCupfixture;
      const entry = state.cupAdminEntry[comp];
      if(!ALL_TEAMS.includes(entry.teamA) || !ALL_TEAMS.includes(entry.teamB)){ alert('Pick two real teams from the suggestions first.'); return; }
      if(entry.teamA === entry.teamB){ alert('Pick two different teams.'); return; }
      const roundInfo = getCupRoundInfo(comp, state.currentRound);
      const stage = roundInfo ? roundInfo.stage : ('Round ' + state.currentRound);
      state.cupFixtures[comp].push({ teamA: entry.teamA, teamB: entry.teamB, stage, round: state.currentRound });
      state.cupAdminEntry[comp] = { teamA:'', teamB:'' };
      saveCupFixtures();
    });
    document.querySelectorAll('[data-remove-cupfixture]').forEach(el => el.onclick = () => {
      const [comp, idx] = el.dataset.removeCupfixture.split('|');
      state.cupFixtures[comp].splice(parseInt(idx,10), 1);
      saveCupFixtures();
    });
    document.querySelectorAll('[data-clear-cupfixtures]').forEach(el => el.onclick = () => {
      const comp = el.dataset.clearCupfixtures;
      if(!confirm('Clear all current '+comp+' fixtures?')) return;
      state.cupFixtures[comp] = [];
      saveCupFixtures();
    });
    for(const div of PLAYOFF_DIVS){
      const aEl = $('#playoff-team-a-'+idSafe(div));
      if(aEl){
        aEl.oninput = e => { state.playoffAdminEntry[div].teamA = e.target.value; };
        aEl.onchange = e => { state.playoffAdminEntry[div].teamA = matchTeamName(e.target.value); };
      }
      const bEl = $('#playoff-team-b-'+idSafe(div));
      if(bEl){
        bEl.oninput = e => { state.playoffAdminEntry[div].teamB = e.target.value; };
        bEl.onchange = e => { state.playoffAdminEntry[div].teamB = matchTeamName(e.target.value); };
      }
    }
    document.querySelectorAll('[data-playoff-stage]').forEach(el => el.onchange = e => {
      const div = el.dataset.playoffStage;
      state.playoffAdminEntry[div].stage = e.target.value;
    });
    document.querySelectorAll('[data-add-playofffixture]').forEach(el => el.onclick = () => {
      const div = el.dataset.addPlayofffixture;
      const entry = state.playoffAdminEntry[div];
      if(!ALL_TEAMS.includes(entry.teamA) || !ALL_TEAMS.includes(entry.teamB)){ alert('Pick two real teams from the suggestions first.'); return; }
      if(entry.teamA === entry.teamB){ alert('Pick two different teams.'); return; }
      state.playoffFixtures[div].push({ teamA: entry.teamA, teamB: entry.teamB, stage: entry.stage });
      state.playoffAdminEntry[div] = { teamA:'', teamB:'', stage:'Qualifying Final' };
      savePlayoffFixtures();
    });
    document.querySelectorAll('[data-remove-playofffixture]').forEach(el => el.onclick = () => {
      const [div, idx] = el.dataset.removePlayofffixture.split('|');
      state.playoffFixtures[div].splice(parseInt(idx,10), 1);
      savePlayoffFixtures();
    });
    document.querySelectorAll('[data-clear-playofffixtures]').forEach(el => el.onclick = () => {
      const div = el.dataset.clearPlayofffixtures;
      if(!confirm('Clear all current '+div+' playoff fixtures?')) return;
      state.playoffFixtures[div] = [];
      savePlayoffFixtures();
    });
    const eclGroupPickEl = $('#ecl-group-pick');
    if(eclGroupPickEl){
      eclGroupPickEl.oninput = e => { state.eclGroupAdminPick = e.target.value; };
      eclGroupPickEl.onchange = e => { state.eclGroupAdminPick = matchTeamName(e.target.value); };
    }
    document.querySelectorAll('[data-assign-eclgroup]').forEach(el => el.onclick = () => {
      assignEclGroup(el.dataset.assignEclgroup, state.eclGroupAdminPick);
    });
    document.querySelectorAll('[data-remove-eclteam]').forEach(el => el.onclick = () => {
      const [group, team] = el.dataset.removeEclteam.split('|');
      removeEclGroupTeam(group, team);
    });
    const clearEclGroupsBtn = $('#clear-ecl-groups-btn'); if(clearEclGroupsBtn) clearEclGroupsBtn.onclick = clearEclGroups;
    document.querySelectorAll('[data-set-cupoverride]').forEach(el => el.onclick = () => {
      const comp = el.dataset.setCupoverride;
      const input = document.getElementById('cup-override-stage-'+comp);
      const stage = (input.value||'').trim();
      if(!stage){ alert('Enter a stage name to force, e.g. "Round Of 32".'); return; }
      state.cupCalendarOverrides[comp][state.currentRound] = stage;
      saveCupOverrides();
    });
    document.querySelectorAll('[data-set-cupoverride-off]').forEach(el => el.onclick = () => {
      const comp = el.dataset.setCupoverrideOff;
      state.cupCalendarOverrides[comp][state.currentRound] = false;
      saveCupOverrides();
    });
    document.querySelectorAll('[data-clear-cupoverride]').forEach(el => el.onclick = () => {
      const comp = el.dataset.clearCupoverride;
      delete state.cupCalendarOverrides[comp][state.currentRound];
      saveCupOverrides();
    });
    document.querySelectorAll('[data-noveltystatus]').forEach(el => el.onclick = () => {
      const [noveltyId, status] = el.dataset.noveltystatus.split('|');
      resolveNoveltyItem(noveltyId, status);
    });
    document.querySelectorAll('[data-edit-novelty]').forEach(el => el.onclick = () => startEditNovelty(el.dataset.editNovelty));
    document.querySelectorAll('[data-save-novelty]').forEach(el => el.onclick = () => saveNoveltyEdit(el.dataset.saveNovelty));
    document.querySelectorAll('[data-cancel-novelty-edit]').forEach(el => el.onclick = cancelEditNovelty);
    document.querySelectorAll('[data-delete-novelty]').forEach(el => el.onclick = () => deleteNoveltyItem(el.dataset.deleteNovelty));
  }

  async function placeBet(){
    if(!state.user){ alert('You must log in first to place a bet.'); state.loginModalOpen=true; render(); return; }
    if(state.betSubmissionInProgress){ return; } // a rapid double-click/double-submit shouldn't place two bets or lose one's data
    if(state.slip.some(s => isPickBlocked(s.id))){
      alert('Betting closed while building this slip \u2014 remove the affected selection(s) to continue.');
      return;
    }
    const stakeInput = document.getElementById('stake-input');
    const stake = Math.max(1, parseInt(stakeInput.value,10)||1);
    if(!state.slip.length){ alert('Add at least one selection first.'); return; }
    if(stake > state.user.balance){ alert("You don't have that many clams."); return; }
    if(stake >= state.user.balance * 0.5){
      if(!confirm(`That's ${fmt(stake)} of your ${fmt(state.user.balance)} clams \u2014 over half your balance. Place it anyway?`)) return;
    }
    state.betSubmissionInProgress = true;
    try {
      // Snapshot the slip ONCE, synchronously, right here -- and use this
      // exact snapshot for everything below, never state.slip directly
      // again in this function. Without this, combinedOdds() (computed
      // here, before any await) and bet.selections (previously read from
      // state.slip AFTER the awaits) could end up reflecting two different
      // moments in time if the user adds or removes picks while the bet is
      // still submitting -- a real, exploitable mismatch: add several
      // high-odds picks to lock in high combined odds, then rapidly remove
      // all but one near-certain pick before the write lands, and the
      // saved bet would pay out at multi-leg odds for what's effectively a
      // single easy bet.
      const slipSnapshot = state.slip.slice();
      const hasFeatured = slipSnapshot.some(s => isFeaturedPick(s.id));
      // A featured pick already carries its own boosted price -- stacking
      // the separate +10% multi-boost on top would be a second discount on
      // the same bet, not the single promotional highlight this is meant
      // to be.
      const boostEligible = !hasFeatured && slipSnapshot.length >= 3 && (!state.user.boostUsedRound || state.user.boostUsedRound !== state.currentRound);
      const boostApplied = boostEligible && state.useBoost;
      const combined = combinedOddsFor(slipSnapshot) * (boostApplied ? BOOST_MULTIPLIER : 1);
      const u = await withUserLock(state.user.username, async () => {
        const fresh = await getUser(state.user.username);
        // Re-checked here, inside the lock, against freshly-read data --
        // not the stale local copy from before this bet started submitting.
        // Two separate tabs for the same account could each pass a check
        // made from their own local state before either has actually
        // recorded using this round's featured pick; only a check against
        // what's genuinely in storage, serialized by the lock, closes that.
        if(hasFeatured && fresh.featuredPickUsedRound === state.currentRound){
          return null; // signals: blocked, handled by the caller below
        }
        fresh.balance -= stake;
        if(boostApplied) fresh.boostUsedRound = state.currentRound;
        if(hasFeatured) fresh.featuredPickUsedRound = state.currentRound;
        await saveUser(fresh);
        return fresh;
      });
      if(u === null){
        alert("You've already used this round's featured pick in another bet \u2014 only one featured (boosted) pick per round.");
        return;
      }
      state.user = u;
      const bet = { id: uid(), username: u.username, selections: slipSnapshot, stake, combinedOdds: combined, boosted: boostApplied,
                    featuredPickRound: hasFeatured ? state.currentRound : null,
                    boostRound: boostApplied ? state.currentRound : null,
                    potentialReturn: Math.round(stake*combined), timestamp: Date.now(), status: 'PENDING' };
      await sset('bilbbet2_bet:'+bet.id, bet);
      await addToIndex('bilbbet2_bets_index_' + u.username.toLowerCase(), bet.id);
      await addToIndex('bilbbet2_all_bets_index', bet.id);
      // Only clear the slip of exactly what was actually placed -- if the
      // user added something else while this was submitting, that stays.
      state.slip = state.slip.filter(s => !slipSnapshot.includes(s));
      state.stake = 50; state.useBoost = false;
      render();
      alert('Bet placed: ' + stake + ' clams to win ' + fmt(bet.potentialReturn) + ' clams' + (boostApplied ? ' (boosted!)' : '') + '. Check "My Bets" to track it.');
    } finally {
      state.betSubmissionInProgress = false;
    }
  }

  async function placeBetsAsSingles(){
    if(!state.user){ alert('You must log in first to place a bet.'); state.loginModalOpen=true; render(); return; }
    if(state.betSubmissionInProgress){ return; }
    if(state.slip.some(s => isPickBlocked(s.id))){
      alert('Betting closed while building this slip \u2014 remove the affected selection(s) to continue.');
      return;
    }
    if(!state.slip.length){ alert('Add at least one selection first.'); return; }
    if(state.slip.some(s => !s.singleStake || s.singleStake < 1)){ alert('Every selection needs a stake before placing as singles.'); return; }
    const stakes = state.slip.map(s => Math.max(1, s.singleStake));
    const totalStake = stakes.reduce((a,b)=>a+b,0);
    if(totalStake > state.user.balance){ alert("You don't have enough clams to cover all of those singles."); return; }
    if(totalStake >= state.user.balance * 0.5){
      if(!confirm(`That's ${fmt(totalStake)} of your ${fmt(state.user.balance)} clams total \u2014 over half your balance. Place them anyway?`)) return;
    }
    state.betSubmissionInProgress = true;
    try {
      const slipSnapshot = state.slip.slice();
      const hasFeatured = slipSnapshot.some(s => isFeaturedPick(s.id));
      const u = await withUserLock(state.user.username, async () => {
        const fresh = await getUser(state.user.username);
        if(hasFeatured && fresh.featuredPickUsedRound === state.currentRound){
          return null;
        }
        fresh.balance -= totalStake;
        if(hasFeatured) fresh.featuredPickUsedRound = state.currentRound;
        await saveUser(fresh);
        return fresh;
      });
      if(u === null){
        alert("You've already used this round's featured pick in another bet \u2014 only one featured (boosted) pick per round.");
        return;
      }
      state.user = u;
      for(const item of slipSnapshot){
        const stake = Math.max(1, item.singleStake||0);
        const bet = { id: uid(), username: u.username, selections: [item], stake, combinedOdds: item.odds,
                      featuredPickRound: isFeaturedPick(item.id) ? state.currentRound : null,
                      potentialReturn: Math.round(stake*item.odds), timestamp: Date.now(), status: 'PENDING' };
        await sset('bilbbet2_bet:'+bet.id, bet);
        await addToIndex('bilbbet2_bets_index_' + u.username.toLowerCase(), bet.id);
        await addToIndex('bilbbet2_all_bets_index', bet.id);
      }
      const count = slipSnapshot.length;
      state.slip = state.slip.filter(s => !slipSnapshot.includes(s));
      state.stake = 50;
      render();
      alert('Placed ' + count + ' single bets totalling ' + totalStake + ' clams staked. Check "My Bets" to track them.');
    } finally {
      state.betSubmissionInProgress = false;
    }
  }

  async function doLogin(){
    const pin = state.pin.trim();
    state.info = '';

    // precoded admin login -- driven by the dedicated adminLoginMode flag, not the
    // shared username field, so it can never be silently overwritten by whatever
    // the team-search box last did (that was the cause of "only works after
    // touching the search box first").
    if(state.adminLoginMode){
      if(!pin){ state.error='Enter your PIN.'; render(); return; }
      if(pin !== '2845'){ state.error='Wrong PIN.'; render(); return; }
      let adminUser = await getUser('admin');
      if(!adminUser){
        adminUser = { username: 'admin', pinHash: simpleHash('2845'), balance: 0, isAdmin: true, status: 'APPROVED', everFunded: true };
        await saveUser(adminUser);
        await addToIndex('bilbbet2_users_index', 'admin');
      }
      state.user = adminUser; state.error=''; state.username=''; state.pin=''; state.adminLoginMode=false; state.screen='main'; state.loginModalOpen=false;
      state.activeTab='HOME'; state.adminPunters=null; state.adminBets=null; state.novelty=null; state.statsData=null; state.myBets=null;
      render();
      loadAdminData();  // background load so the attention flag is accurate from the start, not just after visiting Admin
      return;
    }

    const username = state.username.trim();
    if(!username || !pin){ state.error='Enter a username and PIN.'; render(); return; }

    const u = await getUser(username);
    if(!u){ state.error='No account with that username. Try "create account" below.'; render(); return; }
    if(u.status === 'RESET'){ state.error='This registration was reset by the admin \u2014 use "First time? Create account" to register again with a new PIN.'; state.username=''; state.pin=''; render(); return; }
    if(u.pinHash !== simpleHash(pin)){ state.error='Wrong PIN.'; render(); return; }
    const status = u.status || 'APPROVED';
    if(status === 'PENDING'){ state.error='Your registration is still awaiting admin approval \u2014 check back soon.'; state.username=''; state.pin=''; render(); return; }
    if(status === 'REJECTED'){ state.error='Your registration was rejected. Contact the admin if you think that\u2019s a mistake.'; state.username=''; state.pin=''; render(); return; }
    if(status === 'KICKED'){ state.error='Your account has been removed by Bilbbet management. Contact the admin if you think that\u2019s a mistake.'; state.username=''; state.pin=''; render(); return; }
    state.user = u; state.error=''; state.username=''; state.pin=''; state.screen='main'; state.loginModalOpen=false;
    state.activeTab='HOME'; state.adminPunters=null; state.adminBets=null; state.novelty=null; state.statsData=null; state.myBets=null;
    render();
    // a punter who's genuinely punted before (not brand new) and ended last
    // season under 500 clams gets a little needling on the way in.
    if(u.historicalRecord && u.historicalRecord.totalBets > 0 && (u.dormantCarry||0) < 500){
      alert('Expect to lose more sucker');
    }
  }

  async function doRegister(){
    const username = state.username.trim(), pin = state.pin.trim();
    state.info = '';
    if(!state.tosAgreed){ state.error='You must read and agree to the Terms & Conditions before registering.'; render(); return; }
    if(username.toLowerCase() === 'admin'){ state.error='That name is reserved for the admin login.'; render(); return; }
    if(!username || pin.length<4){ state.error='Pick a username and a PIN of at least 4 digits.'; render(); return; }
    const existing = await getUser(username);
    if(existing && existing.status !== 'RESET'){ state.error='That username is taken. Log in instead.'; render(); return; }
    const isFirstEver = (await getIndex('bilbbet2_users_index')).length === 0;
    const carryData = CARRY_BALANCES[username] || null;
    // the very first account ever registered becomes admin and is auto-approved
    // (there's no admin yet to approve them); everyone after that starts PENDING
    // with no funds until an admin approves them. If this team has a carry
    // balance from a previous season, it stays dormant (invisible, reads as 0)
    // until approval, at which point it's added on top of the usual 1,000
    // registration bonus.
    const u = isFirstEver
      ? { username, pinHash: simpleHash(pin), balance: 1000, isAdmin: true, status: 'APPROVED', everFunded: true }
      : { username, pinHash: simpleHash(pin), balance: 0, isAdmin: false, status: 'PENDING', everFunded: false,
          dormantCarry: carryData ? carryData.carry : 0, historicalRecord: carryData ? carryData.historicalRecord : null };
    const saved = await sset('bilbbet2_user:' + username.toLowerCase(), u);
    if(!saved){ state.error='Could not save your account (storage unavailable). Try reloading.'; render(); return; }
    await addToIndex('bilbbet2_users_index', username);
    state.registeringMode = false; state.tosAgreed = false;
    if(isFirstEver){
      state.user = u; state.error=''; state.username=''; state.pin=''; state.screen='main'; state.loginModalOpen=false;
      state.activeTab='HOME'; state.adminPunters=null; state.adminBets=null; state.novelty=null; state.statsData=null; state.myBets=null;
    } else {
      state.username=''; state.pin=''; state.error='';
      state.info = `Registration submitted for ${username} \u2014 an admin needs to approve your account before you can log in and get your starting clams.`;
    }
    render();
  }

  const savedCurrentRound = await sget('bilbbet2_current_round');
  if(savedCurrentRound){ state.currentRound = savedCurrentRound; state.h2hRound = savedCurrentRound; state.leadingAtRound = savedCurrentRound; state.specialsRound = savedCurrentRound; }
  const savedCupFixtures = await sget('bilbbet2_cup_fixtures');
  if(savedCupFixtures){ state.cupFixtures = savedCupFixtures; }
  const savedPlayoffFixtures = await sget('bilbbet2_playoff_fixtures');
  if(savedPlayoffFixtures){ state.playoffFixtures = savedPlayoffFixtures; }
  const savedEclGroups = await sget('bilbbet2_ecl_groups');
  if(savedEclGroups){ state.eclGroups = savedEclGroups; }
  const savedCupOverrides = await sget('bilbbet2_cup_overrides');
  if(savedCupOverrides){ state.cupCalendarOverrides = savedCupOverrides; }

  const savedBettingOpen = await sget('bilbbet2_round_betting_open');
  if(savedBettingOpen !== null){ state.roundBettingOpen = savedBettingOpen; }
  const savedCloseScope = await sget('bilbbet2_close_scope');
  if(savedCloseScope !== null){ state.closeScope = savedCloseScope; }
  const savedPausedPicks = await sget('bilbbet2_paused_categories');
  if(savedPausedPicks !== null){ state.pausedCategories = savedPausedPicks; }
  const savedAutoClosedRound = await sget('bilbbet2_last_autoclosed_round');
  // Auto-close is a one-time check on load, not a background timer: if the
  // scheduled date for the current round has arrived and nobody's closed or
  // auto-closed it yet for this specific round, close it now. Tracking which
  // round we last auto-closed (rather than just the open/closed flag) means
  // a manual reopen after auto-close sticks -- it won't immediately
  // re-trigger on the next page load for the same round.
  if(scheduledCloseDue() && state.roundBettingOpen && savedAutoClosedRound !== state.currentRound){
    state.roundBettingOpen = false;
    await sset('bilbbet2_round_betting_open', false);
    await sset('bilbbet2_last_autoclosed_round', state.currentRound);
  }
  const savedOddsRefreshRequested = await sget('bilbbet2_odds_refresh_requested');
  if(savedOddsRefreshRequested !== null){ state.oddsRefreshRequested = savedOddsRefreshRequested; }

  render();
  loadHomeStats(); // not awaited -- the initial render shows a loading state, this fills it in once ready
  if(EMBED_MODE){
    // loadAllData only runs once at boot -- a periodic full reload is the
    // simplest reliable way for an embedded, long-lived iframe to keep
    // showing genuinely current odds rather than a stale first snapshot.
    setInterval(() => window.location.reload(), 3 * 60 * 1000);
  }
})();
