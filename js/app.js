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
    // Defensive: a no-fixture round (e.g. Division 2/3's Round 1) should
    // never have a real result to suggest -- the bet-placement path
    // already prevents such a bet from existing in the first place, but
    // this guards against a stray sheet value or an old bet from before
    // that protection existed.
    const div = FUTURE_DIVS.find(d => (H2H_SCHEDULE[d] || []).some(pairs => pairs.some(([a,b]) => (a===teamA&&b===teamB)||(a===teamB&&b===teamA))));
    if(div && hasNoFixtures(div, round)) return null;
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
  const BASE_TABS = ['HOME', 'FUTURES', 'H2H', 'TIPPING', 'SPECIALS', 'STATS', 'MY BETS'];
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
    slip:[], stake:50, betMode:'multi', useBoost:false, showImpliedChance:false,
    myBets:null,
    adminPunters:null, adminBets:null, novelty:null, statsData:null, suggestions:null, suggestionText:'', feedback:null,
    currentRound: 1,       // the next round yet to be played; anything before this is "past"
    leadingAtRound: 1,
    specialsRound: 1,
    specialsExtremeExpanded: null, // 'win_round' | 'lose_round' | 'charity' | 'philanthropy' | null -- which list is open
    refreshingFeatured: false, refreshedFeaturedInfo: '',
    editingNoveltyId: null,
    cupFixtureMarketStage: null,
    playoffFixtureMarketStage: null,
    specialsSelection: { win_round: '', lose_round: '', charity: '', philanthropy: '' },
    specialsSubTab: 'round',
    teamSearchOpen: false, teamSearchQuery: '',
    teamDirectoryOpen: false, teamDirectoryQuery: '', viewingTeamProfile: null, teamProfileSubTab: 'OVERVIEW', teamProfileBilbbetData: null,
    registeringMode: false, customNameMode: false, tipReminderOptIn: true,
    tosModalOpen: false, tosMode: 'view', tosAgreed: false, readMeModalOpen: false,
    tutorialModalOpen: false, tutorialStep: 0, welcomeModalOpen: false,
    contactUsModalOpen: false, feedbackCategory: '', feedbackOtherText: '', feedbackSubmitted: false,
    formModalOpen: false, formModalTeam: null,
    tippingSubTab: 'PICKS', tippingSection: 'ELIZA', tippingRound: null, tippingViewRound: null, tippingData: null, tippingPending: {}, tippingAllPicks: null,
    tippingRewardChecked: null, tippingRewardBanner: null, tipReminderStatus: null,
    perfectRoundStatus: {}, // cache keyed by `${username}|${round}|${sectionKey}` -- true only, never explicitly false/missed (see loadPerfectRoundStatus)
    preseasonData: null, preseasonPending: {}, preseasonLeaderboard: null, preseasonResults: null, preseasonAllPicks: null, openHelpTip: null, homeTippingNudge: null, txHistory: null, txHistoryExpanded: false, recentWinners: null,
    tippingLeaderboardDiv: 'ALL', tippingLeaderboardMode: 'OVERALL', tippingLeaderboardRound: null, tippingLeaderboard: null, leaderboardKind: 'WEEKLY',
    tippingLeaderboardSection: 'OVERALL', tippingLeaderboardSortBy: 'oddsPoints', tippingLeaderboardSortDir: 'desc',
    preseasonLeaderboardSortBy: 'oddsPoints', preseasonLeaderboardSortDir: 'desc',
    cupFixtures: { 'FA CUP': [], 'ECL': [] },
    seasonClosed: { ELIZA: false, DIV2: false, DIV3: false, ALL: false },
    currentSeasonLabel: null, // set on boot from persistence (see loadAllData), or auto-derived on first-ever run
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
  // correct-tips counts can now include .5 values from drawn fixtures --
  // show whole numbers cleanly (3, not 3.0) and only add a decimal place
  // when there's genuine half-credit to show (3.5).
  function fmtCorrect(n){ return Number.isInteger(n) ? String(n) : n.toFixed(1); }
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
  // A genuine delete, not sset(key, null) -- the kv_store table's value
  // column is NOT NULL, so upserting a JS null there fails the Supabase
  // write outright and silently falls back to in-memory storage (which
  // is exactly what triggered the "running without a persistent
  // connection" banner after this was first written the wrong way).
  async function sdelete(key){
    if(supabaseClient){
      try {
        const { error } = await supabaseClient.from('kv_store').delete().eq('key', key);
        if(error) throw error;
        return true;
      } catch(e) { console.error('Supabase delete failed for', key, '-- falling back:', e.message); }
    }
    if(!hasRealStorage){
      delete memoryStore[key];
      return true;
    }
    try{ await window.storage.delete(key, true); return true; }catch(e){ return false; }
  }
  async function getIndex(name){ return (await sget(name)) || []; }
  async function addToIndex(name, id){ const list = await getIndex(name); if(!list.includes(id)){ list.push(id); await sset(name, list); } }
  // Every balance change, across every source (bets, admin adjustments,
  // registration bonus, tip rewards) -- so a punter has one place to see
  // the full, honest history of why their balance is what it is, not just
  // the bet-shaped subset "My Bets" shows. Mirrors the exact index+record
  // pattern already used for bets, for the same reason: an append-only
  // list of individually-keyed records avoids ever re-writing a growing
  // shared blob, so two balance changes landing close together can't
  // race and silently overwrite each other's log entry.
  async function logTransaction(username, type, amount, balanceAfter, reason){
    const tx = { id: uid(), username, type, amount, balanceAfter, reason, timestamp: Date.now() };
    await sset('bilbbet2_tx:' + tx.id, tx);
    await addToIndex('bilbbet2_tx_index_' + username.toLowerCase(), tx.id);
  }
  // A global, cross-user feed of tipping reward wins specifically -- not a
  // duplicate of the per-user transaction log (which already records
  // every balance change for that one user), but the only way to answer
  // "who's won what recently" across everyone without fetching every
  // single user's own transaction history one by one.
  async function logGlobalWinner(username, category, amount, reason, round){
    const entry = { id: uid(), username, category, amount, reason, round: round || null, timestamp: Date.now() };
    await sset('bilbbet2_winner:' + entry.id, entry);
    await addToIndex('bilbbet2_winners_index', entry.id);
  }
  async function submitFeedback(username, category, comment){
    const entry = { id: uid(), username: username || 'Guest', category, comment: comment || null, timestamp: Date.now() };
    await sset('bilbbet2_feedback:' + entry.id, entry);
    await addToIndex('bilbbet2_feedback_index', entry.id);
  }
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
  // 1.005 (the odds floor) can't be represented exactly in binary floating
  // point -- 1.005*100 comes out to 100.4999... rather than 100.5, so a
  // plain .toFixed(2) silently rounds it down to "1.00", a genuinely
  // misleading price (implies zero return on a winning bet). Every other
  // odds value in this app lands cleanly at 2-decimal precision, so this
  // is narrowly targeted at the one value that doesn't, rather than
  // changing display precision everywhere.
  function formatOdds(odds){
    if(Math.abs(odds - ODDS_FLOOR) < 0.0001) return odds.toFixed(3);
    return odds.toFixed(2);
  }
  // A small, deliberately silly easter egg on futures odds for four named
  // teams: the displayed price is a plausible-looking but genuinely
  // different number from the real one -- hovering reveals the truth.
  // Only ever changes the displayed TEXT and a hover title; data-odds
  // (what a bet actually settles at) is set separately, upstream of this,
  // and always uses the real, unmodified value -- this must never be the
  // thing that determines a payout.
  const ODDS_DISPLAY_PRANKS = {
    'JARVIS ZEBRAS': 1.55,       // shown bigger than reality
    'SPOONERS FC': 1.55,         // shown bigger than reality
    'DW ABOUT IT FC': 0.65,      // shown smaller than reality
    'JUSTICEFORMOON FC': 0.65,   // shown smaller than reality
  };
  function displayOddsFor(team, realOdds){
    const factor = ODDS_DISPLAY_PRANKS[team];
    if(!factor) return { text: formatOdds(realOdds), title: '' };
    let fake = realOdds * factor;
    if(fake < ODDS_FLOOR) fake = ODDS_FLOOR;
    if(fake > ODDS_CAP) fake = ODDS_CAP;
    fake = Math.round(fake * 100) / 100;
    return { text: formatOdds(fake), title: `Psst \u2014 true odds: ${formatOdds(realOdds)}` };
  }
  // Decimal odds -> implied probability, the standard conversion (1/odds).
  // Purely informational -- this is what the odds themselves imply before
  // the platform's margin, not a claim about the true chance of the
  // outcome. Under 1% is shown to one decimal so a very short-priced
  // near-certainty (e.g. 1.02) doesn't just round to a flat "100%".
  function impliedChance(odds){
    const pct = 100 / odds;
    return (pct < 1 ? pct.toFixed(2) : pct.toFixed(1)) + '%';
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

  // A-League fantasy point projection: pro-rates a baseline team score
  // against how many real A-League matches each club actually has that
  // round -- a bye pulls the baseline down, a double gameweek pushes it
  // up. Purely a projection display; doesn't feed into odds or any other
  // part of the platform.
  //
  // Baseline is now LIVE, not a fixed historical number -- per direct
  // instruction, this now waits for real, this-season data rather than
  // continuing to lean on assumptions carried over from before the new
  // platform/scoring system was in play. Hidden entirely until at least 3
  // rounds have genuinely been played (not just scheduled), then computed
  // as the actual average of every completed round's real team scores so
  // far -- naturally updating and becoming more accurate as the season
  // progresses, rather than staying fixed at a single point-in-time
  // estimate for the whole season.
  //
  // The bye/double RATIOS (not the absolute numbers) are preserved from
  // the earlier, carefully-derived methodology: bye-affected slots regress
  // toward bench-quality performance rather than dropping to zero (squad
  // rules allow max 3 players per A-League club out of 15, with a minimum
  // of 2 transfers/round, so even a worst-case double-bye is largely
  // recoverable for an active manager); doubles get a proportional boost
  // since an extra fixture is a bonus, not a bench-reliance situation.
  // Applying those same ratios to the live baseline means the shape of the
  // adjustment stays grounded in that reasoning while the scale itself
  // updates with real data.
  const ALEAGUE_MIN_ROUNDS = 3;
  const ALEAGUE_BYE_RATIO = 0.9455;
  const ALEAGUE_DOUBLE_RATIO = 1.1664;
  function computeLiveALeagueBaseline(){
    const roundsPlayed = state.currentRound - 1;
    if(roundsPlayed < ALEAGUE_MIN_ROUNDS) return null;
    const allScores = [];
    for(const team in REAL_RESULTS){
      for(let r = 0; r < roundsPlayed; r++){
        const s = REAL_RESULTS[team][r];
        if(s != null) allScores.push(s);
      }
    }
    if(!allScores.length) return null; // round count says results should exist, but they haven't actually landed yet
    return allScores.reduce((a,b)=>a+b, 0) / allScores.length;
  }
  function renderPointProjection(round){
    const proj = ALEAGUE_PROJECTION[round];
    if(!proj) return '';
    const liveStandard = computeLiveALeagueBaseline();
    if(liveStandard === null) return ''; // not enough real data yet -- nothing shown at all, rather than a guess
    const STANDARD = Math.round(liveStandard * 10) / 10;
    let baseline = STANDARD;
    let note;
    if(proj.byes.length){
      baseline = Math.round(liveStandard * ALEAGUE_BYE_RATIO * 10) / 10;
      note = `Down from the usual ${STANDARD} \u2014 ${proj.byes.join(' and ')} ${proj.byes.length>1?'are':'is'} on a bye.`;
    } else if(proj.doubles.length){
      baseline = Math.round(liveStandard * ALEAGUE_DOUBLE_RATIO * 10) / 10;
      note = `Up from the usual ${STANDARD} \u2014 ${proj.doubles.join(' and ')} ${proj.doubles.length>1?'have':'has'} a double this round.`;
    } else {
      note = 'A standard round \u2014 every club plays exactly once.';
    }
    return `<div class="bb-card" style="margin-bottom:1rem;">
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;">
        <span style="font-size:12px;color:#9a9a9a;text-transform:uppercase;letter-spacing:0.05em;">Round ${round} projected score</span>
        <span style="font-size:20px;font-weight:800;color:#ffdd00;">${baseline.toFixed(1)} pts</span>
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
      if(hasNoFixtures(div, round)) continue; // e.g. Division 2/3's Round 1 -- no real fixtures yet, matches what the H2H tab itself already shows
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
  // Admin escape hatch for the exact situation that motivated this: the
  // featured-fixtures selection is computed once per round and locked in
  // by design (so it never randomly changes for punters) -- but that
  // means if a bug in the selection logic gets fixed in code, any round
  // that already has a stored value keeps showing the OLD, buggy result
  // forever, since the code has no way to know a stored value is stale.
  // This clears that one round's stored value and forces a fresh
  // recompute against the current code, without needing direct database
  // access to do it.
  async function refreshFeaturedFixtures(){
    state.refreshingFeatured = true;
    state.refreshedFeaturedInfo = '';
    render();
    const featuredKey = 'bilbbet2_featured_fixtures_R' + state.currentRound;
    // Directly overwrite with a freshly computed value (a plain sset/upsert)
    // rather than delete-then-let-loadHomeStats-recompute. Found via testing:
    // a delete under Supabase RLS can silently affect zero rows if the
    // project's delete policy is missing (no error, no fallback, the stale
    // row just stays exactly as it was) -- overwriting directly sidesteps
    // that dependency entirely, since sset/upsert is already proven solid
    // everywhere else in this app.
    const fresh = computeFeaturedFixtures();
    const wrote = await sset(featuredKey, fresh);
    state.featuredFixturesData = fresh;

    // Best-value-winner uses the identical "compute once per round, lock
    // it in" pattern as featured fixtures -- same risk of a future logic
    // fix not reaching an already-cached round, so it gets refreshed here
    // too rather than needing its own separate button and its own
    // separate bug report down the line.
    let bvwWrote = true;
    const prevRound = state.currentRound - 1;
    if(prevRound >= 1){
      const bvwKey = 'bilbbet2_best_value_winner_R' + prevRound;
      const freshBvw = computeBestValueWinner() || { none: true };
      bvwWrote = await sset(bvwKey, freshBvw);
      state.homeBestValueWinner = freshBvw.none ? null : freshBvw;
    }

    state.refreshingFeatured = false;
    state.refreshedFeaturedInfo = (wrote && bvwWrote)
      ? `\u2713 Refreshed just now \u2014 ${fresh.length} featured pick(s) now showing for Round ${state.currentRound}.`
      : `\u26a0 Recomputed locally, but saving it failed \u2014 other visitors may still see the old picks until this succeeds.`;
    render();
  }

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
          <div style="font-size:12px;color:#9a9a9a;">Round ${bvw.round} &middot; ${esc(bvw.division.replace(' (D1)',''))} &middot; would have paid <span style="color:#ffdd00;font-weight:600;">${formatOdds(bvw.odds)}</span> \u2014 whether anyone backed it or not</div>
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
      ${renderHomeDigest()}
      <div class="bb-card" style="background:linear-gradient(135deg,#2a2410,#1a1a1a);border-color:#4a3a10;margin-bottom:16px;text-align:center;padding:1.25rem;">
        <div style="font-size:12px;letter-spacing:0.08em;color:#ffdd00;text-transform:uppercase;font-weight:700;">This week's boosted odds</div>
        <div style="font-size:12px;color:#9a9a9a;margin-top:4px;">Every pick below is +${Math.round((FEATURED_BOOST_MULTIPLIER-1)*100)}% on the normal price \u2014 just for being featured.</div>
      </div>
      ${renderTippingNudgeCard()}
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

  // Tap-to-reveal explanation for a term that might trip up a newer
  // punter -- deliberately not a native title-attribute tooltip, since
  // those don't show reliably on tap for a primarily mobile audience.
  function helpTip(id, text){
    const open = state.openHelpTip === id;
    return `<span style="position:relative;display:inline-block;">
        <span data-helptip="${esc(id)}" style="cursor:pointer;color:#9a9a9a;font-size:10px;border:1px solid #5a5a5a;border-radius:50%;width:14px;height:14px;display:inline-flex;align-items:center;justify-content:center;margin-left:4px;vertical-align:middle;">?</span>
        ${open ? `<span data-helptip-panel style="position:absolute;top:18px;left:0;z-index:70;background:#2a2a2a;border:1px solid #3d3d3d;border-radius:6px;padding:8px 10px;font-size:11px;font-weight:400;color:#cfcfcf;width:200px;box-shadow:0 4px 10px rgba(0,0,0,0.4);">${esc(text)}</span>` : ''}
      </span>`;
  }

  function teamsDatalist(){
    return ''; // kept as a no-op call site rather than removing every caller -- the native datalist dropdown is replaced by teamSearchInput's own custom one below
  }
  // A custom, scrollable suggestion list rather than the native HTML
  // datalist -- datalist's browser-rendered dropdown is unstyleable and,
  // with 60+ teams, often clunky and slow to scroll on mobile. This
  // filters via direct DOM manipulation as you type (not a re-render),
  // so typing never loses cursor position or gets interrupted. Clicking a
  // suggestion dispatches a real 'change' event on the input, so every
  // existing onchange handler across the app's 11 call sites keeps
  // working completely unmodified.
  function teamSearchInput(id, currentValue, placeholder){
    const listId = id + '-dropdown';
    return `<div style="position:relative;">
      <input class="bb-input" type="text" id="${id}" value="${esc(currentValue||'')}" placeholder="${esc(placeholder||'Search for a team\u2026')}" autocomplete="off" data-team-dropdown="${listId}" style="width:100%;box-sizing:border-box;"/>
      <div id="${listId}" class="bb-team-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;max-height:200px;overflow-y:auto;background:#2a2a2a;border:1px solid #3d3d3d;border-radius:6px;z-index:60;margin-top:2px;box-shadow:0 4px 10px rgba(0,0,0,0.4);">
        ${ALL_TEAMS.map(t => `<div class="bb-team-option" data-team-option="${esc(t)}" data-option-for="${id}" style="padding:8px 12px;cursor:pointer;font-size:13px;">${esc(t)}</div>`).join('')}
      </div>
    </div>`;
  }
  // Normalises free-typed text against the real team list (case-insensitive),
  // since a datalist lets someone type past what they picked from suggestions.
  function matchTeamName(typed){
    if(!typed) return '';
    const hit = ALL_TEAMS.find(t => t.toLowerCase() === typed.trim().toLowerCase());
    return hit || typed;
  }

  const TOS_CONDITIONS = [
    'If you\'re registering as an Eliza Cup team, it must be a team you actually control.',
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

  // Shown for as long as the season genuinely hasn't started -- the exact
  // same signal that already gates pre-season predictions and Round 1
  // itself, so this disappears automatically the moment the season
  // actually launches rather than needing a separate manual toggle.
  function renderTestingPhaseDisclaimer(){
    if(isRoundBlocked(1)) return '';
    return `<div style="background:#2a2410;color:#e0d090;padding:10px 14px;text-align:center;font-size:13px;border-bottom:2px solid #4a3a10;">
      \u26A0\uFE0F Testing phase &mdash; odds shown right now aren't final and may change before the season launches. Only bets placed once team rosters are confirmed will count, unless stated otherwise.
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
      <span style="color:#5a5a5a;margin:0 8px;">&middot;</span>
      <span id="open-tutorial-btn" style="font-size:12px;color:#9a9a9a;text-decoration:underline;cursor:pointer;" title="New here? Take the tour">Tutorial</span>
      <span style="color:#5a5a5a;margin:0 8px;">&middot;</span>
      <span id="open-contact-us-btn" style="font-size:12px;color:#9a9a9a;text-decoration:underline;cursor:pointer;">Contact us</span>
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

  // One entry per top-level tab, in the same left-to-right order they
  // appear in the nav -- kept as plain data so adding/editing a tab's
  // description doesn't touch the modal's rendering logic at all.
  const FEEDBACK_OPTIONS = [
    'I keep losing bets',
    "I don't like that my Eliza team is gonna get relegated",
    'The odds are never in my favour',
    'Mr Median personally has it out for me',
    'My multi bet was one leg away from paying out, again',
    'The favourite lost and ruined everything',
    'I demand a recount on the leaderboard',
    "My team's form modal is too depressing to look at",
    'The implied probability toggle exposed how bad my bet really was',
    'I want VAR for the tipping leaderboard',
    "Someone tipped a draw and I refuse to accept that's allowed",
    'The admin clearly has favourites',
    'My clams disappeared faster than my dignity',
    'I was one correct pick away from the perfect round bonus',
    'Why does the underdog always win when I bet against them',
    'I demand an apology from the odds algorithm',
    "My team hasn't won since the coefficient system was invented",
    'The self-interest guard stopped me from betting against my own team, how rude',
    'I refuse to believe Mr Median beat my pick fair and square',
    'The FA Cup draw is clearly rigged',
    'My featured pick jinxed the result',
    'I want a written explanation for every loss',
    'My name is too far down the leaderboard for my liking',
    "The near-miss bonus wasn't generous enough",
    'Someone in my tipping section is suspiciously good at this',
    'I demand the season be replayed from round one',
    'The suspended market ruined my dream parlay',
    'My balance is lower than my expectations, which were also low',
    'I want compensation for emotional distress caused by relegation odds',
    'The tutorial did not warn me tipping could be this addictive',
    'My multi bet got blocked for "correlation" and I still have not forgiven the system',
    'Why do the play-off rounds even exist',
    'I refuse to accept that a coin flip beat my analysis',
    'The odds floor is a personal attack on my favourite team',
    "My team's form graph looks like a flatlining heart monitor",
    'I want the ability to bet against Mr Median directly',
    "Somebody's perfect round streak is deeply suspicious",
    'The implied probability made me feel things I did not consent to feel',
    'My team conceded in stoppage time and ruined a beautiful bet slip',
    'I demand to know who keeps tipping against the exact fixtures I need',
    'The clams-to-real-feelings exchange rate is not favourable',
    'My balance history is a horror story I did not ask to read',
    'The wooden spoon market exists and I find that deeply personal',
    'I want a formal inquiry into how many times I have been "so close"',
    "My team's away form makes me question my life choices",
    "The leading-at markets are too honest about how badly my team started",
    'I keep confirming tips and then immediately regretting every single one',
    'The registration bonus was not enough to cover my losses, nothing would be',
    'My rival tipster keeps beating me by exactly one point, every single week',
    'I have complaints about the complaints dropdown, it is too honest',
  ];

  const TUTORIAL_STEPS = [
    { tab: 'HOME', title: 'Home', body: 'Your starting point each visit. A handful of featured picks are boosted for the round (extra odds, one per punter per round), alongside the A-League fantasy point projection and the best-value bet that actually won last round.' },
    { tab: 'FUTURES', title: 'Futures', body: 'Season-long bets that only settle at the end of the season -- who wins each division, gets promoted or relegated, tops the Roddy, or lifts the FA Cup or ECL. Use the sub-tabs to switch between divisions and competitions.' },
    { tab: 'H2H', title: 'H2H', body: 'Head-to-head bets for a specific round\'s fixtures -- who wins, the draw, and handicap lines. Switch between divisions, FA Cup, ECL, Playoffs, or set up a custom matchup between any two teams yourself.' },
    { tab: 'TIPPING', title: 'Tipping', body: 'A separate prediction game alongside the main betting \u2014 free to play, but topping it pays real clams (see the Prizes tab for the full breakdown). Tip a winner for this week\'s fixtures across whichever competitions you like, hit Confirm to lock them in, and see how you stack up on the leaderboard by correct picks, by the odds those picks were worth, or by accuracy. Get every fixture in a section right and you can turn those same tips into a real multi bet, or just enjoy the bragging rights.' },
    { tab: 'SPECIALS', title: 'Specials', body: 'Round-by-round and season-long novelty bets -- who\'ll be leading or trailing after a given round, most charity, most philanthropy, plus a spot to suggest your own bet for others to weigh in on.' },
    { tab: 'STATS', title: 'Stats', body: 'Leaderboards across the platform -- biggest stakes, best multis, most wins, and (once a handful of rounds are played) which teams are consistently beating or missing their own odds.' },
    { tab: 'MY BETS', title: 'My Bets', body: 'Every bet you\'ve placed, with its current status -- pending, won, lost, or void -- and your running record across the season.' },
  ];
  const TUTORIAL_STEPS_ADMIN = [
    { tab: 'ADMIN', title: 'Admin', body: 'Runs the season -- advance rounds, enter results, resolve bets, review punter registrations, and manage specials and novelty suggestions. Sub-tabs flag with a yellow dot when something there needs attention.' },
  ];
  function tutorialStepsFor(){
    return state.user && state.user.isAdmin ? TUTORIAL_STEPS.concat(TUTORIAL_STEPS_ADMIN) : TUTORIAL_STEPS;
  }
  // Recent results/"form" for one team, on demand -- distinct from the
  // existing team-search panel, which shows current ODDS across every
  // market that team is in, not what they've actually scored. This shows
  // this season's real, round-by-round results where they exist; before
  // the season has real data, shows last season's history instead of an
  // empty modal, clearly labelled as historical so it's never confused
  // with genuine current-season form.
  function renderFormModal(){
    const team = state.formModalTeam;
    if(!team) return '';
    const real = REAL_RESULTS[team];
    const roundsPlayed = state.currentRound - 1;
    const thisSeasonRows = [];
    if(real){
      for(let r = 0; r < roundsPlayed; r++){
        if(real[r] != null) thisSeasonRows.push({ round: r+1, score: real[r] });
      }
    }
    let body;
    if(thisSeasonRows.length){
      const scores = thisSeasonRows.map(r=>r.score);
      const avg = scores.reduce((a,b)=>a+b,0) / scores.length;
      body = `<div style="font-size:12px;color:#9a9a9a;margin-bottom:8px;">This season, ${thisSeasonRows.length} round${thisSeasonRows.length!==1?'s':''} played \u2014 average ${avg.toFixed(1)}.</div>
        <div style="max-height:320px;overflow-y:auto;">
          ${thisSeasonRows.slice().reverse().map(r => `<div style="display:flex;justify-content:space-between;padding:7px 4px;border-bottom:1px solid #3d3d3d;font-size:13px;">
            <span style="color:#9a9a9a;">Round ${r.round}</span><span style="font-weight:600;">${r.score}</span>
          </div>`).join('')}
        </div>`;
    } else {
      const hist = H2H_HISTORY[team];
      if(hist && hist.length){
        const avg = hist.reduce((a,b)=>a+b,0) / hist.length;
        body = `<div style="font-size:12px;color:#9a9a9a;margin-bottom:8px;">No results yet this season. Showing a sample of historical scores instead (${hist.length} total on record, average ${avg.toFixed(1)}) \u2014 not necessarily in chronological order, just the most recent real data available until this season's results come in.</div>
          <div style="max-height:320px;overflow-y:auto;display:flex;flex-wrap:wrap;gap:6px;">
            ${hist.slice(0, 20).map(s => `<span style="background:#2a2a2a;border-radius:4px;padding:4px 8px;font-size:12px;">${Math.round(s)}</span>`).join('')}
          </div>`;
      } else {
        body = `<p style="color:#9a9a9a;font-size:13px;">No results on record for this team yet.</p>`;
      }
    }
    return `
      <div id="form-modal-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:110;display:flex;align-items:center;justify-content:center;padding:1rem;">
        <div class="bb-card" style="max-width:380px;width:100%;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <h3 style="margin:0;display:flex;align-items:center;gap:8px;">${teamLogo(team,22)}${esc(team)}</h3>
            <span style="font-size:12px;color:#9a9a9a;cursor:pointer;" id="close-form-modal-x">&times;</span>
          </div>
          ${body}
        </div>
      </div>`;
  }
  function renderWelcomeModal(){
    const carry = (state.user && state.user.dormantCarry) || 0;
    return `
      <div id="welcome-modal-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:110;display:flex;align-items:center;justify-content:center;padding:1rem;">
        <div class="bb-card" style="max-width:380px;width:100%;text-align:center;">
          <h3 style="margin:4px 0 10px;">Welcome, ${esc(state.user.username)}!</h3>
          <p style="font-size:14px;line-height:1.6;">You're approved and ready to go \u2014 ${fmt(state.user.balance)} clams${carry > 0 ? ` are already in your account, including ${fmt(carry)} carried over from last season` : ' are already in your account'}.</p>
          <p style="font-size:13px;color:#9a9a9a;line-height:1.6;">New to Bilbbet? The <span id="welcome-open-tutorial" style="text-decoration:underline;cursor:pointer;color:#ffdd00;">tutorial</span> walks through what each tab does.</p>
          <button class="bb-btn" id="close-welcome-modal" style="width:100%;margin-top:8px;">Let's go</button>
        </div>
      </div>`;
  }
  function renderTutorialModal(){
    const steps = tutorialStepsFor();
    const i = Math.max(0, Math.min(state.tutorialStep, steps.length - 1));
    const step = steps[i];
    return `
      <div id="tutorial-modal-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:110;display:flex;align-items:center;justify-content:center;padding:1rem;">
        <div class="bb-card" style="max-width:420px;width:100%;">
          ${state.info ? `<div style="color:#7fbf8f;font-size:13px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #3d3d3d;">${esc(state.info)}</div>` : ''}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:12px;color:#9a9a9a;">Step ${i+1} of ${steps.length}</span>
            <span style="font-size:12px;color:#9a9a9a;cursor:pointer;" id="close-tutorial-modal-x">&times;</span>
          </div>
          <h3 style="margin:4px 0 10px;">${esc(step.title)}</h3>
          <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">${esc(step.body)}</p>
          <div style="display:flex;gap:8px;margin-bottom:10px;">
            ${steps.map((s,idx) => `<span style="flex:1;height:4px;border-radius:2px;background:${idx<=i?'var(--bb-accent)':'#3d3d3d'};"></span>`).join('')}
          </div>
          <div style="display:flex;gap:8px;">
            ${i>0 ? `<button class="bb-btn ghost" id="tutorial-back" style="flex:1;">Back</button>` : ''}
            ${i<steps.length-1
              ? `<button class="bb-btn" id="tutorial-next" style="flex:1;">Next</button>`
              : `<button class="bb-btn" id="tutorial-done" style="flex:1;">Done</button>`}
          </div>
        </div>
      </div>`;
  }
  function renderContactUsModal(){
    if(state.feedbackSubmitted){
      return `
        <div id="contact-us-modal-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:110;display:flex;align-items:center;justify-content:center;padding:1rem;">
          <div class="bb-card" style="max-width:420px;width:100%;text-align:center;padding:2.5rem 1.5rem;">
            <div style="font-size:72px;line-height:1;margin-bottom:16px;">\u{1F6AE}</div>
            <p style="font-size:18px;font-weight:600;margin:0 0 20px;">Your feedback is important to us.</p>
            <button class="bb-btn" id="close-contact-us-modal">Close</button>
          </div>
        </div>`;
    }
    const isOther = state.feedbackCategory === 'OTHER';
    return `
      <div id="contact-us-modal-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:110;display:flex;align-items:center;justify-content:center;padding:1rem;">
        <div class="bb-card" style="max-width:420px;width:100%;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <h3 style="margin:0;">Contact us</h3>
            <span style="font-size:12px;color:#9a9a9a;cursor:pointer;" id="close-contact-us-modal-x">&times;</span>
          </div>
          <p style="font-size:13px;line-height:1.6;color:#cfcfcf;margin:0 0 14px;">We understand not everything will go to expectations. To help us improve the site, we welcome your feedback \u2014 pick whatever's closest to how you're feeling below.</p>
          <select class="bb-select" id="feedback-category-select" style="width:100%;margin-bottom:10px;">
            <option value="" disabled ${state.feedbackCategory===''?'selected':''}>Choose a complaint&hellip;</option>
            ${FEEDBACK_OPTIONS.map(opt => `<option value="${esc(opt)}" ${state.feedbackCategory===opt?'selected':''}>${esc(opt)}</option>`).join('')}
            <option value="OTHER" ${isOther?'selected':''}>Other (tell us yourself)</option>
          </select>
          ${isOther ? `<textarea id="feedback-other-text" placeholder="Go on, let it out." style="width:100%;min-height:90px;background:#2a2a2a;border:1px solid #3d3d3d;border-radius:6px;color:#eee;padding:8px;font-size:13px;box-sizing:border-box;margin-bottom:10px;">${esc(state.feedbackOtherText)}</textarea>` : ''}
          <button class="bb-btn" id="submit-feedback-btn" style="width:100%;">File complaint</button>
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
            <div><span style="font-size:12px;color:#9a9a9a;display:block;margin-bottom:4px;">${state.customNameMode ? 'Your display name' : 'Your Eliza team'}</span>
              ${state.customNameMode
                ? `<input class="bb-input" id="f-user-custom" value="${esc(state.username)}" placeholder="Pick a name&hellip;"/>`
                : teamSearchInput('f-user', state.adminLoginMode?'':state.username, 'Search for your team\u2026')}
              ${state.registeringMode ? `<span id="toggle-custom-name" style="display:block;font-size:11px;color:#9a9a9a;text-decoration:underline;cursor:pointer;margin-top:4px;">${state.customNameMode ? 'Actually, I have a team in the Eliza Cup' : "Not part of the Eliza Cup? Make up your own name"}</span>` : ''}
              <button type="button" class="bb-btn ghost" id="use-admin-login" style="margin-top:6px;width:100%;font-size:12px;padding:6px;">${state.adminLoginMode ? '\u2713 Logging in as admin' : 'Log in as admin instead'}</button>
            </div>
            <div><span style="font-size:12px;color:#9a9a9a;display:block;margin-bottom:4px;">PIN</span>
              <input class="bb-input" id="f-pin" type="password" inputmode="numeric" value="${esc(state.pin)}"/></div>
            ${state.registeringMode ? `
              <label style="display:flex;align-items:flex-start;gap:8px;font-size:13px;">
                <input type="checkbox" id="tos-agree-checkbox-inline" ${state.tosAgreed?'checked':''} style="margin-top:2px;"/>
                <span>I agree to the <span id="open-tos-register" style="text-decoration:underline;cursor:pointer;color:#ffdd00;">Terms &amp; Conditions</span>.</span>
              </label>
              <label style="display:flex;align-items:flex-start;gap:8px;font-size:13px;">
                <input type="checkbox" id="tip-reminder-optin-checkbox" ${state.tipReminderOptIn?'checked':''} style="margin-top:2px;"/>
                <span>Flag it for me on the Tipping tab if I haven't submitted my tips for the week. <span style="color:#9a9a9a;">(On by default \u2014 turn off anytime from My Bets.)</span></span>
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
        const label = t==='MY BETS'?'My Bets':(t==='ADMIN'?'Admin':(t==='H2H'?'H2H':(t==='HOME'?'Home':(t==='FUTURES'?'Futures':(t==='TIPPING'?'Tipping':t)))));
        const adminFlag = (t==='ADMIN' && state.user && state.user.isAdmin && adminNeedsAttention())
          ? ' <span title="Needs attention" style="font-size:11px;">\u{1F6A9}</span>' : '';
        const tipFlag = (t==='TIPPING' && state.tipReminderStatus === true)
          ? ' <span title="You haven\'t submitted your tips for this week yet" style="font-size:11px;">\u{1F6A9}</span>' : '';
        return `<div class="bb-tab ${state.activeTab===t?'active':''}" data-tab="${esc(t)}" style="display:flex;align-items:center;gap:5px;">${label}${adminFlag}${tipFlag}</div>`;
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
    const sorted = outcomes.slice().sort((a,b) => {
      if(!!a.suspended !== !!b.suspended) return a.suspended ? 1 : -1;
      return a.odds - b.odds;
    });
    const list = !outcomes.length ? '<p style="color:#9a9a9a;">No outcomes in this market.</p>' : sorted.map(o => {
      if(o.suspended){
        return `<div class="bb-outcome" style="opacity:0.5;cursor:default;">
          <span>${esc(o.team)}</span><span class="bb-odds" style="color:#9a9a9a;">suspended</span></div>`;
      }
      const selId = tagPrefix + '|' + o.team;
      const selected = state.slip.some(s=>s.id===selId);
      return `<div class="bb-outcome ${selected?'selected':''}" data-pick="${esc(selId)}" data-team="${esc(o.team)}" data-odds="${o.odds}" data-label="${esc(o.team)} leading R${round} (${scopeKey==='RODDY'?'Roddy':scopeKey.replace(' (D1)','')})">
        <span>${esc(o.team)}</span><span class="bb-odds">${formatOdds(o.odds)}</span></div>`;
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
    // Active odds ascending (favourites first); suspended entries grouped
    // at the end regardless of their underlying odds value, rather than
    // interleaved based on a number that isn't actually shown or usable.
    const sorted = outcomes.slice().sort((a,b) => {
      if(!!a.suspended !== !!b.suspended) return a.suspended ? 1 : -1;
      return a.odds - b.odds;
    });
    const list = sorted.map(o => {
      const selId = cupTag+'|'+marketKey+'|'+o.team;
      if(o.suspended || categoryPaused){
        return `<div class="bb-outcome" style="opacity:0.5;cursor:default;">
          <span>${esc(o.team)}</span><span class="bb-odds" style="color:#9a9a9a;">${categoryPaused && !o.suspended ? 'paused' : 'suspended'}</span></div>`;
      }
      const selected = state.slip.some(s=>s.id===selId);
      return `<div class="bb-outcome ${selected?'selected':''}" data-pick="${esc(selId)}" data-team="${esc(o.team)}" data-odds="${o.odds}" data-label="${esc(o.team)}">
        <span>${esc(o.team)}</span><span class="bb-odds">${formatOdds(o.odds)}</span></div>`;
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
    const sorted = outcomes.slice().sort((a,b) => {
      if(!!a.suspended !== !!b.suspended) return a.suspended ? 1 : -1;
      return a.odds - b.odds;
    });
    const list = sorted.map(o => {
      const selId = 'FUT|'+div+'|'+marketKey+'|'+o.team;
      if(o.suspended || categoryPaused){
        return `<div class="bb-outcome" style="opacity:0.5;cursor:default;">
          <span style="display:flex;align-items:center;gap:8px;">${teamLogo(o.team,20)}${esc(o.team)}</span>
          <span class="bb-odds" style="color:#9a9a9a;">${categoryPaused && !o.suspended ? 'paused' : 'suspended'}</span></div>`;
      }
      const selected = state.slip.some(s=>s.id===selId);
      const disp = displayOddsFor(o.team, o.odds);
      return `<div class="bb-outcome ${selected?'selected':''}" data-pick="${esc(selId)}" data-team="${esc(o.team)}" data-odds="${o.odds}" data-label="${esc(o.team)}">
        <span style="display:flex;align-items:center;gap:8px;">${teamLogo(o.team,20)}${esc(o.team)}</span>
        <span class="bb-odds"${disp.title?` title="${esc(disp.title)}"`:''}>${disp.text}</span></div>`;
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
        <span class="bb-odds">${formatOdds(odds)}</span></div>`;
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
      <h4 style="margin:14px 0 8px;font-size:13px;color:#9a9a9a;">Handicap${helpTip('handicap', 'A virtual head start or deficit applied to level the odds \u2014 pick a team to "cover the line," meaning win by more than (or lose by less than) the handicap.')}</h4>
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
  // Deliberately two separate rows -- not just flex-wrap letting items
  // spill onto a second line however screen width happens to allow, but a
  // fixed, consistent split: division competitions always together on
  // their own row, side competitions (Roddy, FA Cup, ECL, Playoffs,
  // Custom matchup) always together on theirs, regardless of viewport.
  function twoRowTabBar(row1Items, row2Items, renderItem){
    const row = (items, isLast) => items.length
      ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:${isLast?'14px':'8px'};">${items.map(renderItem).join('')}</div>`
      : '';
    return row(row1Items, !row2Items.length) + row(row2Items, true);
  }

  function h2hSubTabBar(){
    const renderItem = t => `<div class="bb-tab ${state.h2hSubTab===t?'active':''}" data-h2hsubtab="${esc(t)}" style="font-size:12px;padding:6px 10px;display:flex;align-items:center;gap:4px;">${subTabLogo(t)}${t==='CUSTOM MATCHUP'?'Custom matchup':(t==='PLAYOFFS'?'Playoffs':t.replace(' (D1)',''))}</div>`;
    return twoRowTabBar(FUTURE_DIVS, ['FA CUP', 'ECL', 'PLAYOFFS', 'CUSTOM MATCHUP'], renderItem);
  }
  const FUTURES_SUBTABS = [...FUTURE_DIVS, 'RODDY', 'FA CUP', 'ECL'];
  function futuresSubTabBar(){
    const renderItem = t => `<div class="bb-tab ${state.futuresSubTab===t?'active '+divColorClass(t):''}" data-futuressubtab="${esc(t)}" style="font-size:12px;padding:6px 10px;display:flex;align-items:center;gap:4px;">${subTabLogo(t)}${t==='RODDY'?'The Roddy':t.replace(' (D1)','')}</div>`;
    return twoRowTabBar(FUTURE_DIVS, ['RODDY', 'FA CUP', 'ECL'], renderItem);
  }

  const fixtureMarketCache = {};
  function getFixtureMarkets(div, round){
    const key = div + '|' + round;
    if(!fixtureMarketCache[key]){
      fixtureMarketCache[key] = getTippableFixtures(div, round).map(([a,b]) => {
        // 'MR MEDIAN' isn't a real team -- has no coefficient/strength data
        // for the real simulation to run against, so this is a plain,
        // symmetric 50/50 market instead (still passes through the same
        // toOdds conversion and margin as every other market, so the
        // displayed price looks and behaves consistently with everything
        // else, just reflecting a genuinely even proposition).
        if(b === 'MR MEDIAN') return { teamA: a, teamB: b, aWinPct: 50, bWinPct: 50 };
        return computeH2HMarket(a, b, round);
      });
    }
    return fixtureMarketCache[key];
  }

  function quickOddsButton(pickId, label, teamLabel, oddsInfo){
    if(oddsInfo.suspended){
      return `<span class="bb-btn ghost" style="padding:6px 10px;font-size:12px;opacity:0.5;cursor:default;display:inline-flex;align-items:center;gap:6px;">${teamLogo(teamLabel,16)}${esc(teamLabel)} susp.</span>`;
    }
    const selected = state.slip.some(s=>s.id===pickId);
    return `<button class="bb-btn ${selected?'':'ghost'}" data-pick="${esc(pickId)}" data-label="${esc(label)}" data-odds="${oddsInfo.odds}" style="padding:6px 10px;font-size:12px;display:inline-flex;align-items:center;gap:6px;">${teamLogo(teamLabel,16)}${esc(teamLabel)} ${formatOdds(oddsInfo.odds)}</button>`;
  }
  // Same pick/click mechanics as quickOddsButton, just without the repeated
  // team logo+name -- for layouts where the team is already shown once,
  // separately, and only the price itself needs to sit in its own box.
  function priceOnlyButton(pickId, label, oddsInfo){
    if(oddsInfo.suspended){
      return `<span class="bb-btn ghost" style="padding:8px 14px;font-size:13px;opacity:0.5;cursor:default;width:100%;text-align:center;">susp.</span>`;
    }
    const selected = state.slip.some(s=>s.id===pickId);
    return `<button class="bb-btn ${selected?'':'ghost'}" data-pick="${esc(pickId)}" data-label="${esc(label)}" data-odds="${oddsInfo.odds}" style="padding:8px 14px;font-size:13px;font-weight:700;width:100%;text-align:center;">${formatOdds(oddsInfo.odds)}</button>`;
  }

  // Unifies league-division fixtures (a fixed, pre-computed schedule) and
  // cup fixtures (admin-set per round, stored with their own round number
  // rather than schedule-indexed) into the same [teamA, teamB] shape, so
  // every other tipping function can treat both sources identically.
  // Mr Median: a for-fun, week-1-only alternative for Div 2/3, whose real
  // round 1 has no division fixtures at all (see hasNoFixtures). Instead
  // of picking a head-to-head winner, a punter picks whether each team's
  // own score beats the combined tier's (both conferences together)
  // median score that week. Implemented as an ordinary [team, 'MR MEDIAN']
  // fixture pair -- once the median is computed and written into
  // REAL_RESULTS as a synthetic team, every existing scoring function
  // (checkPerfectSection, computeTippingTotals, resolution, etc.) treats
  // it exactly like a real opponent, with zero changes needed anywhere
  // else in the scoring pipeline.
  const MR_MEDIAN_TIERS = { DIV2: ['DIVISION 2A','DIVISION 2B'], DIV3: ['DIVISION 3A','DIVISION 3B'] };
  function isMrMedianWeek(div, round){
    return round === 1 && (div === 'DIVISION 2A' || div === 'DIVISION 2B' || div === 'DIVISION 3A' || div === 'DIVISION 3B');
  }
  // Only computes (and only overwrites REAL_RESULTS) once every team in
  // the combined tier actually has a score in for that round -- an
  // incomplete median would be actively misleading, not just premature.
  function ensureMrMedianScore(div, round){
    const tierKey = (div === 'DIVISION 2A' || div === 'DIVISION 2B') ? 'DIV2' : 'DIV3';
    const divs = MR_MEDIAN_TIERS[tierKey];
    const teams = divs.flatMap(d => H2H_DIVISIONS[d] || []);
    const scores = teams.map(t => REAL_RESULTS[t] && REAL_RESULTS[t][round-1]).filter(s => s != null);
    if(scores.length < teams.length) return; // not everyone's score is in yet
    scores.sort((a,b) => a-b);
    const mid = Math.floor(scores.length / 2);
    const median = scores.length % 2 === 0 ? (scores[mid-1] + scores[mid]) / 2 : scores[mid];
    if(!REAL_RESULTS['MR MEDIAN']) REAL_RESULTS['MR MEDIAN'] = new Array(26).fill(null);
    REAL_RESULTS['MR MEDIAN'][round-1] = median;
  }

  function getTippableFixtures(key, round){
    if(key === 'FA CUP' || key === 'ECL'){
      return (state.cupFixtures[key] || []).filter(f => f.round === round).map(f => [f.teamA, f.teamB]);
    }
    if(isMrMedianWeek(key, round)){
      ensureMrMedianScore(key, round); // computes and injects the tier's median score into REAL_RESULTS, if not already done and all scores are in
      return (H2H_DIVISIONS[key] || []).map(team => [team, 'MR MEDIAN']);
    }
    if(hasNoFixtures(key, round)) return [];
    return (H2H_SCHEDULE[key] && H2H_SCHEDULE[key][round-1]) || [];
  }

  // Sub-tab groupings for the Tipping page -- lets a punter focus on one
  // competition at a time instead of scrolling one long page of everything.
  // Pre-season predictions: a one-time, season-long prediction set that
  // locks before Round 1 kicks off (tied to isRoundBlocked(1) -- the same
  // moment Round 1's own betting locks), scored separately from the
  // weekly tipping leaderboard entirely. Winner slots are single-team
  // picks; relegation/promotion slots are multi-team, since several teams
  // go down or up together. Promotion pools span both conferences of a
  // division (2A+2B share one pool of 4, 3A+3B share one pool of 6) since
  // that's how promotion actually works; relegation is per-conference,
  // since each conference relegates its own bottom teams independently.
  const PRESEASON_SLOTS = [
    { key: 'winner|ELIZA CUP (D1)', label: 'Eliza Cup winner', divs: ['ELIZA CUP (D1)'], marketKey: 'win_div_pct', count: 1 },
    { key: 'winner|DIVISION 2A', label: 'Division 2A winner', divs: ['DIVISION 2A'], marketKey: 'win_div_pct', count: 1 },
    { key: 'winner|DIVISION 2B', label: 'Division 2B winner', divs: ['DIVISION 2B'], marketKey: 'win_div_pct', count: 1 },
    { key: 'winner|DIVISION 3A', label: 'Division 3A winner', divs: ['DIVISION 3A'], marketKey: 'win_div_pct', count: 1 },
    { key: 'winner|DIVISION 3B', label: 'Division 3B winner', divs: ['DIVISION 3B'], marketKey: 'win_div_pct', count: 1 },
    { key: 'relegated|ELIZA CUP (D1)', label: 'Eliza Cup relegation', divs: ['ELIZA CUP (D1)'], marketKey: 'relegation_pct', count: 4 },
    { key: 'relegated|DIVISION 2A', label: 'Division 2A relegation', divs: ['DIVISION 2A'], marketKey: 'relegation_pct', count: 3 },
    { key: 'relegated|DIVISION 2B', label: 'Division 2B relegation', divs: ['DIVISION 2B'], marketKey: 'relegation_pct', count: 3 },
    { key: 'promoted|DIVISION 2', label: 'Division 2 promotion (2A + 2B)', divs: ['DIVISION 2A','DIVISION 2B'], marketKey: 'promotion_pct', count: 4 },
    { key: 'promoted|DIVISION 3', label: 'Division 3 promotion (3A + 3B)', divs: ['DIVISION 3A','DIVISION 3B'], marketKey: 'promotion_pct', count: 6 },
    { key: 'winner|RODDY', label: 'Roddy winner', source: 'roddy', marketKey: 'roddy_win_pct', count: 1 },
    { key: 'winner|FA CUP', label: 'FA Cup winner', source: 'fa_cup_markets', marketKey: 'win_pct', count: 1 },
    { key: 'winner|ECL', label: 'ECL winner', source: 'ecl_markets', marketKey: 'win_pct', count: 1 },
  ];
  function preseasonSlotOptions(slot){
    if(slot.source) return FUTURES[slot.source][slot.marketKey] || [];
    return slot.divs.flatMap(d => (FUTURES.divisions[d][slot.marketKey] || []).map(e => ({...e, div: d})));
  }

  // Single toggle for the "fixtures aren't final yet" disclaimer -- the
  // weekly schedule is currently a programmatically-generated placeholder,
  // not the real, official season draw. Flip to false (or delete the
  // disclaimer block below) once the real draw is confirmed.
  const FIXTURES_ARE_PLACEHOLDER = true;

  const TIPPING_SECTIONS = [
    { key: 'ELIZA', label: 'Eliza', divs: ['ELIZA CUP (D1)'] },
    { key: 'DIV2', label: 'Div 2 (A+B)', divs: ['DIVISION 2A', 'DIVISION 2B'] },
    { key: 'DIV3', label: 'Div 3 (A+B)', divs: ['DIVISION 3A', 'DIVISION 3B'] },
    { key: 'ECL', label: 'ECL', divs: ['ECL'] },
    { key: 'FACUP', label: 'FA Cup', divs: ['FA CUP'] },
  ];
  const TIPPING_DIVS = TIPPING_SECTIONS.flatMap(s => s.divs);
  // Perfect-round reward: 50 clams, real balance, EACH -- not a leaderboard
  // placement, so multiple people can independently earn this in the same
  // week. League sections (Eliza, Div2 A+B combined, Div3 A+B combined)
  // qualify every week. FA Cup and ECL qualify only for their early-stage
  // rounds specifically (FA Cup: Round of 64/32/16; ECL: match days 1-3),
  // not once the knockout stages (quarter-final onward) begin.
  const TIP_REWARD_AMOUNT = 50;
  const FA_CUP_PERFECT_ROUND_STAGES = ['Round Of 64', 'Round Of 32', 'Round Of 16'];
  const ECL_PERFECT_ROUND_STAGES = ['Matchday 1', 'Matchday 2', 'Matchday 3'];

  // Weekly, per-section leaderboard prize -- league sections only, 10
  // clams for topping EACH of the odds and points tables separately
  // (stacked if you top both), needing at least 50% correct to qualify as
  // a genuine winner rather than just the least-wrong tipper in a slow
  // week. Dead heat: everyone tied for top splits the amount, rounded UP
  // (a 3-way tie for 10 clams pays 4 each, not 3.33).
  const WEEKLY_SECTION_REWARD_SECTIONS = ['ELIZA', 'DIV2', 'DIV3'];
  const WEEKLY_SECTION_REWARD_AMOUNT = 10;
  const WEEKLY_MIN_CORRECT_PCT = 0.5;

  // Weekly, ALL-competitions-combined leaderboard prize -- 50 clams per
  // table (stacked if both), same 50% qualifying bar and dead-heat rule.
  const WEEKLY_OVERALL_REWARD_AMOUNT = 50;

  // Seasonal, per-section prize -- 250 clams each for odds, points, and
  // best correct-tip RATIO (minimum 25% of the season's fixtures actually
  // tipped, so one lucky early tip can't "win" the ratio category over
  // someone who tipped consistently all season). League sections only.
  const SEASONAL_SECTION_REWARD_SECTIONS = ['ELIZA', 'DIV2', 'DIV3'];
  const SEASONAL_SECTION_REWARD_AMOUNT = 250;
  const SEASONAL_MIN_TIPPED_PCT = 0.25;

  // Seasonal, ALL-competitions-combined prize -- 1,000 clams each for
  // odds, points, and ratio, same conditions.
  const SEASONAL_OVERALL_REWARD_AMOUNT = 1000;

  function deadHeatSplit(totalAmount, winnerCount){
    return Math.ceil(totalAmount / winnerCount);
  }

  function renderTippingTab(){
    const round = state.tippingViewRound || state.currentRound;
    const locked = isRoundBlocked(round);
    const viewingPast = round !== state.currentRound;
    const subTabs = `<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
        <div class="bb-tab ${state.tippingSubTab==='PICKS'?'active':''}" data-tippingtab="PICKS" style="font-size:12px;padding:6px 10px;display:flex;align-items:center;gap:5px;">This week's tips${state.tipReminderStatus===true ? ' <span title="You haven\'t submitted your tips for this week yet" style="font-size:11px;">\u{1F6A9}</span>' : ''}</div>
        <div class="bb-tab ${state.tippingSubTab==='PRESEASON'?'active':''}" data-tippingtab="PRESEASON" style="font-size:12px;padding:6px 10px;">Pre-season</div>
        <div class="bb-tab ${state.tippingSubTab==='LEADERBOARD'?'active':''}" data-tippingtab="LEADERBOARD" style="font-size:12px;padding:6px 10px;">Leaderboard</div>
        <div class="bb-tab ${state.tippingSubTab==='PRIZES'?'active':''}" data-tippingtab="PRIZES" style="font-size:12px;padding:6px 10px;">Prizes</div>
      </div>`;
    const intro = `<p style="color:#9a9a9a;font-size:12px;margin-bottom:10px;">Free to play, but topping it pays real clams \u2014 see the Prizes tab for the full breakdown. Correct tips score two ways: a straight tally, and what a 1-clam bet on that tip would have paid (upsets are worth more). A drawn fixture pays half credit either way \u2014 half the tally, half the odds \u2014 and never counts against a perfect round. Nothing saves until you hit Confirm, and you can come back and change your tips right up until this round locks.</p>` +
      (FIXTURES_ARE_PLACEHOLDER ? `<div class="bb-card" style="background:#3a3320;margin-bottom:10px;padding:10px 12px;font-size:12px;color:#e0d090;">\u26A0\uFE0F The weekly schedule shown here is a placeholder, not yet the real season draw \u2014 specific matchups may still change once the real draw is confirmed. Everything you tip still counts as normal; this notice will come down once the schedule is final.</div>` : '');

    if(state.tippingSubTab === 'PRESEASON'){
      return subTabs + renderPreseasonTab();
    }
    if(state.tippingSubTab === 'PRIZES'){
      return subTabs + renderPrizesTab();
    }

    if(state.tippingSubTab === 'LEADERBOARD'){
      return subTabs + intro + renderTippingLeaderboard();
    }

    // Round browser -- lets a punter look back at any already-played
    // round's confirmed tips and the all-tipsters table, without opening
    // up tipping itself for anything but the current week (a past round
    // here is always the read-only, locked view -- isRoundBlocked already
    // guarantees that).
    const lastPlayedForBrowse = state.currentRound - 1;
    const roundBrowser = lastPlayedForBrowse >= 1 ? `<div class="bb-card" style="margin-bottom:1rem;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-size:12px;color:#9a9a9a;">Viewing</span>
        <select class="bb-select" id="tipping-view-round" style="width:170px;">
          <option value="" ${!viewingPast?'selected':''}>This week (Round ${state.currentRound})</option>
          ${Array.from({length:lastPlayedForBrowse}, (_,i) => lastPlayedForBrowse-i).map(r => `<option value="${r}" ${round===r?'selected':''}>Round ${r}</option>`).join('')}
        </select>
      </div>` : '';

    if(!state.tippingData || state.tippingData.round !== round){
      if(!state.user){
        // Nothing personal to fetch for a guest -- set this up synchronously
        // rather than calling loadTipsForRound, which requires state.user
        // and would otherwise leave this check permanently true (an
        // infinite "Loading tips..." state) since it would return before
        // ever populating tippingData.
        state.tippingData = { round, picks: {} };
        state.tippingPending = {};
      } else {
        loadTipsForRound(round); // async -- fires off the fetch, current render shows a brief loading state
        return subTabs + intro + roundBrowser + '<p style="color:#9a9a9a;">Loading tips&hellip;</p>';
      }
    }

    checkAndCelebrateReward(); // async, fire-and-forget -- sweeps all past rounds' qualifying sections; the current round's own open/locked state doesn't matter here

    // Section sub-tabs -- shown in both the open and locked states, so
    // navigation stays consistent either way.
    const renderSectionItem = s => `<div class="bb-tab ${state.tippingSection===s.key?'active':''}" data-tipping-section="${s.key}" style="font-size:12px;padding:6px 10px;">${esc(s.label)}</div>`;
    const sectionBar = twoRowTabBar(
      TIPPING_SECTIONS.filter(s => ['ELIZA','DIV2','DIV3'].includes(s.key)),
      TIPPING_SECTIONS.filter(s => ['ECL','FACUP'].includes(s.key)),
      renderSectionItem
    );
    const activeSection = TIPPING_SECTIONS.find(s => s.key === state.tippingSection) || TIPPING_SECTIONS[0];
    const mrMedianNote = activeSection.divs.some(d => isMrMedianWeek(d, round))
      ? `<div class="bb-card" style="margin-bottom:1rem;padding:12px;font-size:12px;line-height:1.6;color:#cfcfcf;">
          <strong style="color:#eee;">What's "Mr Median"?</strong> This tier's Round 1 has no real head-to-head fixtures yet, so instead you're predicting against the tier's own median \u2014 the middle score across all 24 teams in the combined tier (both conferences together) once the round's played. Tick the box next to any team you believe will score <em>above</em> that median \u2014 up to 12 ticks total. There's no way to predict a team loses; just leave it unticked if you don't fancy them. Get at least 12 right and it's treated exactly like a perfect round anywhere else.
        </div>`
      : '';

    if(locked){
      const rewardBanner = state.tippingRewardBanner ? `<div class="bb-card" style="margin-bottom:1rem;background:#3a3320;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:13px;">${esc(state.tippingRewardBanner)}</span>
          <span id="dismiss-reward-banner" style="cursor:pointer;color:#9a9a9a;">&times;</span>
        </div>` : '';
      const confirmedKeys = Object.keys(state.tippingData.picks).filter(k => activeSection.divs.includes(k.split('|')[0]));
      if(!confirmedKeys.length){
        return subTabs + intro + roundBrowser + sectionBar + mrMedianNote + rewardBanner + `<div class="bb-card" style="text-align:center;padding:2rem 1rem;color:#9a9a9a;">\u{1F512} ${viewingPast?`Round ${round} is over`:`Tipping is closed for Round ${round}`} \u2014 no confirmed tips in ${esc(activeSection.label)} that round.</div>` + renderAllTipstersTable(round, activeSection);
      }
      const byDiv = {};
      for(const key of confirmedKeys){
        const [div, idxStr] = key.split('|');
        (byDiv[div] = byDiv[div] || []).push({ idx: parseInt(idxStr,10), ...state.tippingData.picks[key] });
      }
      const readOnly = Object.entries(byDiv).map(([div, picks]) => `<div class="bb-card" style="margin-bottom:1rem;">
          <strong style="font-size:13px;">${esc(div.replace(' (D1)',''))}</strong>
          <div style="margin-top:6px;">${picks.map(p => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #333333;font-size:13px;">
              <span>${teamLogo(p.team,18)}${esc(p.team)}</span><span style="color:#ffdd00;font-weight:600;">${formatOdds(p.odds)}</span>
            </div>`).join('')}</div>
        </div>`).join('');
      loadPerfectRoundStatus(round, activeSection); // async -- fires off the check, re-renders itself if it turns out to be a hit
      const perfectBadge = (state.user && !state.user.isAdmin && state.perfectRoundStatus[state.user.username.toLowerCase() + '|' + round + '|' + activeSection.key])
        ? `<div class="bb-card" style="margin-bottom:1rem;background:#2a3a20;text-align:center;padding:10px;font-size:13px;color:#8fc98f;">\u2705 Perfect round in ${esc(activeSection.label)} for Round ${round}!</div>`
        : '';
      return subTabs + intro + roundBrowser + sectionBar + mrMedianNote + rewardBanner + perfectBadge + `<div class="bb-card" style="text-align:center;padding:1rem;color:#9a9a9a;margin-bottom:1rem;">\u{1F512} ${viewingPast?`Round ${round} is over`:`Tipping is closed for Round ${round}`} \u2014 here's what you confirmed:</div>` + readOnly + renderAllTipstersTable(round, activeSection);
    }

    const divsWithFixtures = activeSection.divs.filter(d => divisionFixtureCount(d, round) > 0);
    const dirty = JSON.stringify(state.tippingPending) !== JSON.stringify(state.tippingData.picks);
    const pendingCount = Object.keys(state.tippingPending).length;

    if(!divsWithFixtures.length){
      const confirmBar = `<div class="bb-card" style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:1rem;">
          <span style="font-size:12px;color:#9a9a9a;">${pendingCount} tip${pendingCount!==1?'s':''} selected across all sections${dirty?' \u2014 not yet saved':''}</span>
          <button class="bb-btn" id="confirm-tips-btn" ${dirty?'':'disabled'}>Confirm tips</button>
        </div>`;
      return subTabs + intro + roundBrowser + sectionBar + mrMedianNote + confirmBar + `<div class="bb-card" style="text-align:center;padding:2rem 1rem;color:#9a9a9a;">No ${esc(activeSection.label)} fixtures scheduled this round.</div>` + renderEntireFieldOption(round);
    }

    const sections = divsWithFixtures.map(div => {
      const fixtures = getTippableFixtures(div, round);
      const markets = getFixtureMarkets(div, round);
      const rows = fixtures.map(([teamA, teamB], i) => {
        const m = markets[i];
        const aOdds = toOdds(m.aWinPct), bOdds = toOdds(m.bWinPct);
        const key = div+'|'+i;
        const current = state.tippingPending[key];
        if(teamB === 'MR MEDIAN'){
          // Mr Median: a single "will this team beat the median" checkbox,
          // not a two-sided pick -- there's deliberately no way to predict
          // a team LOSES to the median, only whether you believe it wins.
          const checked = !!current;
          return `<div style="padding:4px 0;">
              <label style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;background:${checked?'#3a3320':'#2a2a2a'};cursor:pointer;font-size:12px;">
                <input type="checkbox" data-mrmedian-check="${esc(div)}|${i}|${esc(teamA)}|${aOdds.odds}" ${checked?'checked':''}/>
                ${teamLogo(teamA,16)}${esc(teamA)} <span style="color:#9a9a9a;">beats the median</span>
                <span style="margin-left:auto;color:#ffdd00;font-weight:600;">${formatOdds(aOdds.odds)}</span>
              </label>
            </div>`;
        }
        const radio = (team, oddsInfo, side) => {
          if(oddsInfo.suspended) return `<span style="flex:1;text-align:center;font-size:12px;color:#9a9a9a;opacity:0.6;">susp.</span>`;
          const checked = current && current.team === team;
          return `<label style="flex:1;display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:6px;background:${checked?'#3a3320':'#2a2a2a'};cursor:pointer;font-size:12px;">
              <input type="radio" name="tip-${esc(div)}-${i}" data-tip-radio="${esc(div)}|${i}|${side}|${esc(team)}|${oddsInfo.odds}" ${checked?'checked':''}/>
              ${teamLogo(team,16)}${esc(team)} <span style="margin-left:auto;color:#ffdd00;font-weight:600;">${formatOdds(oddsInfo.odds)}</span>
            </label>`;
        };
        return `<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #333333;">
          ${radio(teamA, aOdds, 'home')}<span style="color:#9a9a9a;font-size:11px;">v</span>${radio(teamB, bOdds, 'away')}
        </div>`;
      }).join('');
      const doneStored = divisionTipsCompleted(div, round);
      return `<div class="bb-card" style="margin-bottom:1rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <strong style="font-size:13px;">${esc(div.replace(' (D1)',''))}</strong>
          <span style="font-size:12px;color:#9a9a9a;">${doneStored}/${fixtures.length} confirmed</span>
        </div>
        ${rows}
      </div>`;
    }).join('');

    // The "perfect round" multi for this whole section (all its divisions
    // combined -- e.g. both 2A and 2B together for the Div 2 sub-tab), only
    // offered once every fixture in the section has a confirmed tip.
    const sectionStatus = sectionTipsStatus(activeSection.divs, round);
    const sectionMultiCard = sectionStatus.allConfirmed ? `<div class="bb-card" style="margin-bottom:1rem;background:#3a3320;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:13px;">\u{1F3AF} Perfect round for ${esc(activeSection.label)} \u2014 ${sectionStatus.confirmedCount} legs</span>
          <span style="font-size:18px;font-weight:800;color:#ffdd00;">${sectionStatus.combinedOdds.toFixed(2)}</span>
        </div>
        <button class="bb-btn" data-make-multi="${esc(activeSection.key)}" data-multi-stake="10" style="width:100%;margin-top:10px;">Bet this multi \u2014 10 clams</button>
      </div>` : '';

    const confirmBar = `<div class="bb-card" style="position:sticky;bottom:0;display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:1rem;">
        <span style="font-size:12px;color:#9a9a9a;">${pendingCount} tip${pendingCount!==1?'s':''} selected across all sections${dirty?' \u2014 not yet saved':''}</span>
        <button class="bb-btn" id="confirm-tips-btn" ${dirty?'':'disabled'}>Confirm tips</button>
      </div>`;

    return subTabs + intro + roundBrowser + sectionBar + mrMedianNote + confirmBar + sections + sectionMultiCard + renderEntireFieldOption(round);
  }

  // The "bet the entire field" option -- every confirmed tip across every
  // section combined into one multi, separate from (and typically much
  // longer than) any single section's own perfect-round multi.
  function renderEntireFieldOption(round){
    const allDivs = TIPPING_SECTIONS.flatMap(s => s.divs);
    const fieldStatus = sectionTipsStatus(allDivs, round);
    if(fieldStatus.confirmedCount < 2) return ''; // not meaningfully a "multi" with fewer than 2 legs
    return `<div class="bb-card" style="margin-top:1rem;background:#22301f;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:13px;">\u{1F30D} Entire field \u2014 ${fieldStatus.confirmedCount} confirmed tip${fieldStatus.confirmedCount!==1?'s':''} across everything</span>
          <span style="font-size:18px;font-weight:800;color:#ffdd00;">${fieldStatus.combinedOdds.toFixed(2)}</span>
        </div>
        <button class="bb-btn ghost" data-make-multi="ALL" data-multi-stake="10" style="width:100%;margin-top:10px;">Bet the entire field \u2014 10 clams</button>
      </div>`;
  }

  // Pre-season locks the moment Round 1 itself locks -- reusing that exact
  // check rather than a separate date/flag means there's only ever one
  // source of truth for "has the season actually started yet".
  const PRESEASON_RESULTS_KEY = 'bilbbet2_preseason_results';
  async function loadPreseasonResults(){
    state.preseasonResults = (await sget(PRESEASON_RESULTS_KEY)) || {};
    render();
  }
  // Admin-only: records the actual, final outcome for a slot -- separate
  // from a punter's own prediction. Persists immediately on each toggle
  // (this is data entry, not a pending selection someone might want to
  // reconsider before committing) since there's no real risk in an admin
  // correcting a result if it's later found to be wrong.
  async function toggleFinalResult(slotKey, team, count){
    if(!state.preseasonResults) return; // defensive -- the UI shouldn't offer this before results have loaded, but don't crash if it somehow is
    const current = state.preseasonResults[slotKey] || [];
    const wasFullyResolved = current.length >= count; // if true, punters may already have been paid real clams based on the result as it stands right now
    const already = current.includes(team);
    let next;
    if(already) next = current.filter(t => t !== team);
    else if(count === 1) next = [team];
    else if(current.length < count) next = [...current, team];
    else return; // slot already has its full number of actual results recorded
    if(wasFullyResolved && !confirm('This slot was already fully resolved, so punters may have already been paid real clams based on the current result. Changing it now will NOT automatically claw back anything already paid -- you may need to manually adjust affected balances yourself. Continue?')) return;
    state.preseasonResults = { ...state.preseasonResults, [slotKey]: next };
    render();
    await sset(PRESEASON_RESULTS_KEY, state.preseasonResults);
  }

  function renderPreseasonTab(){
    const locked = isRoundBlocked(1);
    if(!state.preseasonData){
      if(!state.user){
        // Nothing personal to fetch for a guest -- same reasoning as the
        // weekly tipping tab: calling loadPreseasonData would require
        // state.user and leave this permanently stuck loading otherwise.
        state.preseasonData = { picks: {} };
        state.preseasonPending = {};
      } else {
        loadPreseasonData(); // async -- fires off the fetch, current render shows a brief loading state
        return '<p style="color:#9a9a9a;">Loading your pre-season picks&hellip;</p>';
      }
    }
    const intro = `<p style="color:#9a9a9a;font-size:12px;margin-bottom:10px;">One-time, season-long predictions \u2014 free to enter, but genuinely pays real clams (see the Prizes tab for the full breakdown). ${locked ? 'Locked now that the season has started.' : 'Locks the moment Round 1 kicks off, so get your picks in before then.'}</p>`;

    const adminResultsSection = (state.user && state.user.isAdmin && state.preseasonResults !== null) ? renderPreseasonAdminResults() : '';
    if(state.user && state.user.isAdmin && state.preseasonResults === null){
      loadPreseasonResults(); // async -- fires off the fetch, current render just skips this section until it's ready
    }

    if(locked){
      const rows = PRESEASON_SLOTS.map(slot => {
        const picks = state.preseasonData.picks[slot.key] || [];
        if(!picks.length) return null;
        return `<div style="padding:8px 0;border-bottom:1px solid #333333;">
            <div style="font-size:12px;color:#9a9a9a;margin-bottom:4px;">${esc(slot.label)}</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
              ${picks.map(p => `<span style="display:flex;align-items:center;gap:5px;background:#2a2a2a;border-radius:6px;padding:4px 10px;font-size:13px;">${teamLogo(p.team,16)}${esc(p.team)} <span style="color:#ffdd00;font-weight:600;">${formatOdds(p.odds)}</span></span>`).join('')}
            </div>
          </div>`;
      }).filter(Boolean);
      const ownPicks = rows.length
        ? `<div class="bb-card" style="margin-bottom:1rem;"><strong style="font-size:13px;">Your picks</strong>${rows.join('')}</div>`
        : `<div class="bb-card" style="text-align:center;padding:2rem 1rem;color:#9a9a9a;margin-bottom:1rem;">You didn't confirm any pre-season picks.</div>`;
      return intro + adminResultsSection + ownPicks + renderAllPreseasonPicks();
    }

    const dirty = JSON.stringify(state.preseasonPending) !== JSON.stringify(state.preseasonData.picks);
    const group = (title, slots) => `<div class="bb-card" style="margin-bottom:1rem;">
        <strong style="font-size:13px;display:block;margin-bottom:8px;">${esc(title)}</strong>
        ${slots.map(slot => {
          const options = preseasonSlotOptions(slot);
          const current = state.preseasonPending[slot.key] || [];
          return `<div style="margin-bottom:12px;">
              <div style="font-size:12px;color:#9a9a9a;margin-bottom:6px;">${esc(slot.label)} ${slot.count>1?`<span style="color:#7fbf8f;">(${current.length}/${slot.count})</span>`:''}</div>
              <div style="display:flex;flex-wrap:wrap;gap:6px;">
                ${options.map(o => {
                  const picked = current.some(p => p.team === o.team);
                  // A suspended market (near-certain outcome, no real price) still
                  // needs to be pickable here -- this is a prediction game, not a
                  // real-money book, so "no edge" shouldn't mean "can't predict it".
                  // Substituted odds is a clean 1.00 (stake back, no profit) rather
                  // than the real null -- passing null through to formatOdds() or
                  // parseFloat() would throw/produce NaN downstream.
                  const displayOdds = o.suspended ? 1.00 : o.odds;
                  return `<button class="bb-btn ${picked?'':'ghost'}" data-preseason-pick="${esc(slot.key)}|${esc(o.team)}|${displayOdds}|${slot.count}" style="padding:5px 10px;font-size:12px;display:flex;align-items:center;gap:5px;${o.suspended?'opacity:0.85;':''}">${teamLogo(o.team,14)}${esc(o.team)} ${formatOdds(displayOdds)}${o.suspended?' <span style="color:#9a9a9a;font-size:10px;" title="Heavy favorite -- no real betting price, so this pick pays a flat 1.00 (stake back) rather than real odds.">(favorite)</span>':''}</button>`;
                }).join('')}
              </div>
            </div>`;
        }).join('')}
      </div>`;

    const winners = PRESEASON_SLOTS.filter(s => s.key.startsWith('winner|'));
    const relegations = PRESEASON_SLOTS.filter(s => s.key.startsWith('relegated|'));
    const promotions = PRESEASON_SLOTS.filter(s => s.key.startsWith('promoted|'));

    const confirmBar = `<div class="bb-card" style="position:sticky;bottom:0;display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:1rem;">
        <span style="font-size:12px;color:#9a9a9a;">${Object.values(state.preseasonPending).flat().length} pick${Object.values(state.preseasonPending).flat().length!==1?'s':''} selected${dirty?' \u2014 not yet saved':''}</span>
        <button class="bb-btn" id="confirm-preseason-btn" ${dirty?'':'disabled'}>Confirm picks</button>
      </div>`;

    return intro + adminResultsSection + confirmBar + group('Division winners', winners) + group('Relegation', relegations) + group('Promotion', promotions);
  }

  // Everyone's confirmed pre-season picks, once the season's started --
  // same reasoning as the weekly all-tipsters table: no visibility into
  // others' picks until predictions can no longer be changed, so nobody
  // can just copy.
  // Admin-only recording of the actual, final outcome for each slot --
  // separate UI from a punter's own predictions, but built on the exact
  // same options list (preseasonSlotOptions) so the two stay in sync
  // automatically as teams/odds data changes.
  function renderPreseasonAdminResults(){
    return `<div class="bb-card" style="margin-bottom:1rem;border:1px solid #ffdd00;">
        <strong style="font-size:13px;display:block;margin-bottom:8px;color:#ffdd00;">Admin: record final results</strong>
        <p style="font-size:11px;color:#9a9a9a;margin-bottom:10px;">What actually happened, not a prediction -- this is what every punter's pre-season picks get scored against.</p>
        ${PRESEASON_SLOTS.map(slot => {
          const options = preseasonSlotOptions(slot);
          const current = state.preseasonResults[slot.key] || [];
          return `<div style="margin-bottom:10px;">
              <div style="font-size:12px;color:#9a9a9a;margin-bottom:4px;">${esc(slot.label)} ${slot.count>1?`<span style="color:#7fbf8f;">(${current.length}/${slot.count})</span>`:''}</div>
              <div style="display:flex;flex-wrap:wrap;gap:5px;">
                ${options.map(o => {
                  const picked = current.includes(o.team);
                  return `<button class="bb-btn ${picked?'':'ghost'}" data-final-result="${esc(slot.key)}|${esc(o.team)}|${slot.count}" style="padding:4px 8px;font-size:11px;">${esc(o.team)}</button>`;
                }).join('')}
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }

  async function loadAllPreseasonPicks(){
    const usernames = await getIndex('bilbbet2_users_index');
    const allUsers = (await Promise.all(usernames.map(getUser))).filter(Boolean);
    const users = allUsers.filter(u => !u.isAdmin);
    const rows = [];
    for(const u of users){
      const data = await sget(preseasonStorageKey(u.username));
      if(!data || !data.picks) continue;
      const allPicks = Object.values(data.picks).flat();
      if(allPicks.length) rows.push({ username: u.username, picks: allPicks });
    }
    state.preseasonAllPicks = rows;
    render();
  }
  function renderAllPreseasonPicks(){
    if(state.preseasonAllPicks === undefined || state.preseasonAllPicks === null){
      loadAllPreseasonPicks();
      return `<div class="bb-card" style="margin-top:1rem;"><p style="color:#9a9a9a;">Loading everyone's picks&hellip;</p></div>`;
    }
    if(!state.preseasonAllPicks.length){
      return `<div class="bb-card" style="margin-top:1rem;"><p style="color:#9a9a9a;">Nobody confirmed pre-season picks.</p></div>`;
    }
    return `<div class="bb-card" style="margin-top:1rem;">
        <strong style="font-size:13px;">Everyone's picks</strong>
        <div style="margin-top:8px;">
          ${state.preseasonAllPicks.map(r => `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #333333;flex-wrap:wrap;">
              <span style="font-size:12px;width:110px;flex-shrink:0;">${esc(r.username)}</span>
              <span style="display:flex;gap:6px;flex-wrap:wrap;">${r.picks.map(p => `<span title="${esc(p.team)}">${teamLogo(p.team,22)}</span>`).join('')}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }

  function prizeCard(title, amount, body, example){
    return `<div class="bb-card" style="margin-bottom:1rem;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
          <strong style="font-size:14px;">${esc(title)}</strong>
          <span style="color:#ffdd00;font-weight:700;font-size:14px;">${esc(amount)}</span>
        </div>
        <p style="font-size:12px;color:#cfcfcf;margin:0 0 8px;line-height:1.5;">${body}</p>
        <p style="font-size:11px;color:#9a9a9a;margin:0;font-style:italic;">${esc(example)}</p>
      </div>`;
  }
  function renderPrizesTab(){
    const description = `<p style="color:#9a9a9a;font-size:12px;margin-bottom:14px;">Every reward below pays real clams, straight into your balance the moment it's earned \u2014 check My Bets \u2192 Balance history for the full record. A dead heat splits the amount between everyone tied, rounded UP, so a 3-way tie for 10 clams pays 4 each, not 3.33.</p>` +
      prizeCard('Perfect round', `${TIP_REWARD_AMOUNT} clams each`,
        `Confirm every fixture in a section and get all of them right that week. Not a leaderboard placement \u2014 anyone who does it earns it independently, even several people in the same week. Applies to Eliza Cup, Div 2 (2A+2B combined), and Div 3 (3A+3B combined) every week except their playoff rounds. For FA Cup, only Round of 64/32/16 qualify; for ECL, only Matchdays 1-3 \u2014 the knockout stages onward don't count.`,
        `Example: you tip all 7 Eliza Cup fixtures one week and every one comes in \u2014 ${TIP_REWARD_AMOUNT} clams, regardless of anyone else's results.`) +
      prizeCard('Weekly leaderboard \u2014 per section', `${WEEKLY_SECTION_REWARD_AMOUNT} clams each side`,
        `Top the odds table OR the correct-picks table for one section (Eliza, Div 2, or Div 3) that week. Both are separately, stackably rewarded \u2014 topping both pays both. Needs at least ${WEEKLY_MIN_CORRECT_PCT*100}% of your tips correct that week to qualify, so one lucky high-odds tip on an otherwise poor week can't win it.`,
        `Example: three punters tie for the top odds score in Eliza this week \u2014 each gets ${deadHeatSplit(WEEKLY_SECTION_REWARD_AMOUNT,3)} clams (${WEEKLY_SECTION_REWARD_AMOUNT}\u00f73, rounded up). If one of them also tops the correct-picks table alone, they get a further ${WEEKLY_SECTION_REWARD_AMOUNT} clams on top of that.`) +
      prizeCard('Weekly leaderboard \u2014 overall', `${WEEKLY_OVERALL_REWARD_AMOUNT} clams each side`,
        `Same idea, across everything you tipped that week combined \u2014 every division plus FA Cup and ECL together. Same ${WEEKLY_MIN_CORRECT_PCT*100}% qualifying bar, same stacking.`,
        `Example: you top both the odds and correct-picks tables across the whole week \u2014 ${WEEKLY_OVERALL_REWARD_AMOUNT*2} clams (${WEEKLY_OVERALL_REWARD_AMOUNT}+${WEEKLY_OVERALL_REWARD_AMOUNT}).`) +
      prizeCard('Seasonal leaderboard \u2014 per section', `${SEASONAL_SECTION_REWARD_AMOUNT} clams each category`,
        `Three separate season-long prizes per section (Eliza, Div 2, Div 3): best total odds points, most correct picks, and best accuracy ratio. The ratio category needs at least ${SEASONAL_MIN_TIPPED_PCT*100}% of the season's fixtures actually tipped to qualify, so one early lucky tip can't outrank someone who tipped all season. Only pays out once the admin has manually flagged that section's season as closed.`,
        `Example: Eliza's season is flagged closed \u2014 the season odds leader gets ${SEASONAL_SECTION_REWARD_AMOUNT}, separately the most-correct leader gets ${SEASONAL_SECTION_REWARD_AMOUNT}, separately again the best-accuracy leader (who tipped enough of the season to qualify) gets ${SEASONAL_SECTION_REWARD_AMOUNT}. One punter topping all three earns ${SEASONAL_SECTION_REWARD_AMOUNT*3}.`) +
      prizeCard('Seasonal leaderboard \u2014 overall', `${SEASONAL_OVERALL_REWARD_AMOUNT} clams each category`,
        `Same three categories, across the whole combined competition (every division plus FA Cup and ECL). Gated by its own separate admin flag, so it can stay open even after individual sections have closed.`,
        `Example: the combined season is flagged closed and you lead all three categories \u2014 ${SEASONAL_OVERALL_REWARD_AMOUNT*3} clams.`) +
      prizeCard('Mr Median', 'Same as a normal week',
        `Div 2 and Div 3's Round 1 has no real fixtures yet, so instead of picking a winner, you're predicting against the tier's own median \u2014 the middle score across all 24 combined-tier teams once the round's played. Tick up to ${MR_MEDIAN_PICK_CAP} teams you believe will score above that median. There's no picking a team to lose; you simply leave it unticked. Scored exactly like any other week: get at least 12 of your ticked teams right and it counts as a perfect round (${TIP_REWARD_AMOUNT} clams); it also counts toward that week's leaderboard prizes the same as any other round.`,
        `Example: you tick 12 teams, all 12 beat the median \u2014 ${TIP_REWARD_AMOUNT} clams, same as a perfect round anywhere else.`) +
      prizeCard('Pre-season pick', `${PRESEASON_PICK_REWARD_AMOUNT} clams each`,
        `${PRESEASON_PICK_REWARD_AMOUNT} clams for every single pre-season prediction that comes in correct \u2014 not a leaderboard placement, so a correct division-winner pick, a correct relegation pick, and a correct promotion pick all pay independently and separately. Multi-team slots (relegation, promotion) only pay once that slot is fully, officially resolved.`,
        `Example: you correctly predict the Eliza Cup winner AND one of the four relegated teams \u2014 ${PRESEASON_PICK_REWARD_AMOUNT*2} clams (${PRESEASON_PICK_REWARD_AMOUNT} each), even though the other three relegation spots are still unknown.`) +
      prizeCard('Pre-season leaderboard', `${PRESEASON_LEADERBOARD_REWARD_AMOUNT} clams each side`,
        `Best total odds points across your whole pre-season prediction set gets ${PRESEASON_LEADERBOARD_REWARD_AMOUNT}; separately, most correct picks overall gets another ${PRESEASON_LEADERBOARD_REWARD_AMOUNT}. Only pays out once every single pre-season slot \u2014 right down to the FA Cup and ECL winners \u2014 is finally known.`,
        `Example: you finish with both the best odds total and the most correct picks once everything's resolved \u2014 ${PRESEASON_LEADERBOARD_REWARD_AMOUNT*2} clams.`);
    const winnersSection = `<h4 style="color:#9a9a9a;margin:1.5rem 0 8px;">Recent winners</h4>` + renderRecentWinners();
    return description + winnersSection;
  }
  function renderRecentWinners(){
    if(state.recentWinners === null){
      loadRecentWinners(); // async -- fires off the fetch, current render shows a brief loading state
      return `<p style="color:#9a9a9a;font-size:13px;">Loading&hellip;</p>`;
    }
    if(!state.recentWinners.length){
      return `<p style="color:#9a9a9a;font-size:13px;">No prizes claimed yet \u2014 check back once a round wraps up.</p>`;
    }
    const recent = state.recentWinners.slice(0, 30);
    return `<div class="bb-card">
        ${recent.map(w => `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #333333;font-size:12px;">
            <span><strong>${esc(w.username)}</strong> <span style="color:#9a9a9a;">\u2014 ${esc(w.category)}${w.round?` (Round ${w.round})`:''}: ${esc(w.reason)}</span></span>
            <span style="color:#ffdd00;font-weight:600;white-space:nowrap;margin-left:8px;">+${w.amount}</span>
          </div>`).join('')}
      </div>`;
  }

  const LEADERBOARD_SECTIONS = [...TIPPING_SECTIONS, { key: 'OVERALL', label: 'Overall', divs: null }];

  // Before Round 1 exists, the weekly leaderboard has no graded results to
  // show -- but people can still see WHO's already submitted Round 1
  // picks, the same participation-first philosophy as the pre-season tab.
  // Reuses computeUpcomingSubmissionStatus directly, since Round 1 IS the
  // "upcoming round" the whole time state.currentRound is still 1.
  async function computeWeeklyParticipationOnly(div){
    const upcoming = await computeUpcomingSubmissionStatus(div);
    state.tippingLeaderboard = Object.entries(upcoming)
      .filter(([, submitted]) => submitted)
      .map(([username]) => ({ username, correct: 0, total: 0, oddsPoints: 0, submittedUpcoming: true }));
    render();
  }

  function renderTippingLeaderboard(){
    const kindBar = `<div style="display:flex;gap:4px;margin-bottom:1rem;">
        <div class="bb-tab ${state.leaderboardKind==='WEEKLY'?'active':''}" data-leaderboard-kind="WEEKLY" style="font-size:12px;padding:6px 10px;">Weekly tipping</div>
        <div class="bb-tab ${state.leaderboardKind==='PRESEASON'?'active':''}" data-leaderboard-kind="PRESEASON" style="font-size:12px;padding:6px 10px;">Pre-season</div>
      </div>`;
    if(state.leaderboardKind === 'PRESEASON'){
      return kindBar + renderPreseasonLeaderboard();
    }
    const rewardNote = `<p style="color:var(--bb-text-muted);font-size:12px;margin-bottom:10px;">Topping a leaderboard here pays real clams \u2014 see the Prizes tab for exactly how much and what qualifies.</p>`;
    const lastPlayed = state.currentRound - 1;
    const sectionTabs = `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px;">
        ${LEADERBOARD_SECTIONS.map(s => `<div class="bb-tab ${state.tippingLeaderboardSection===s.key?'active':''}" data-leaderboard-section="${s.key}" style="font-size:12px;padding:6px 10px;">${esc(s.label)}</div>`).join('')}
      </div>`;
    if(lastPlayed < 1){
      if(state.tippingLeaderboard === null){
        const section = LEADERBOARD_SECTIONS.find(s => s.key === state.tippingLeaderboardSection) || LEADERBOARD_SECTIONS[LEADERBOARD_SECTIONS.length-1];
        computeWeeklyParticipationOnly(section.divs || 'ALL'); // async -- fires off the check, this render shows a loading state
        return kindBar + rewardNote + sectionTabs + '<p style="color:var(--bb-text-muted);">Crunching&hellip;</p>';
      }
      if(!state.tippingLeaderboard.length){
        return kindBar + rewardNote + sectionTabs + '<p style="color:var(--bb-text-muted);">Nobody\u2019s submitted Round 1 picks for this section yet \u2014 be the first to join.</p>';
      }
      const table = renderSortableLeaderboardTable(
        state.tippingLeaderboard, 'oddsPoints', 'desc',
        state.user && !state.user.isAdmin ? state.user.username : null,
        'Round 1', 'Already in for Round 1 \u2014 scores appear once results start coming in.'
      );
      return kindBar + rewardNote + sectionTabs + table;
    }
    const viewRound = state.tippingLeaderboardRound || lastPlayed;
    const controls = `<div class="bb-card" style="margin-bottom:1rem;display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
        <div style="display:flex;gap:4px;">
          <div class="bb-tab ${state.tippingLeaderboardMode==='WEEKLY'?'active':''}" data-tipping-lb-mode="WEEKLY" style="font-size:12px;padding:5px 10px;">Weekly</div>
          <div class="bb-tab ${state.tippingLeaderboardMode==='OVERALL'?'active':''}" data-tipping-lb-mode="OVERALL" style="font-size:12px;padding:5px 10px;">Overall</div>
        </div>
        <span style="font-size:12px;color:var(--bb-text-muted);">${state.tippingLeaderboardMode==='WEEKLY'?'Round':'Through round'}</span>
        <select class="bb-select" id="tipping-lb-round" style="width:130px;">
          ${Array.from({length:lastPlayed}, (_,i) => lastPlayed-i).map(r => `<option value="${r}" ${r===viewRound?'selected':''}>Round ${r}</option>`).join('')}
        </select>
      </div>`;

    if(state.tippingLeaderboard === null){
      const section = LEADERBOARD_SECTIONS.find(s => s.key === state.tippingLeaderboardSection) || LEADERBOARD_SECTIONS[LEADERBOARD_SECTIONS.length-1];
      computeTippingLeaderboard(section.divs || 'ALL', state.tippingLeaderboardMode, viewRound); // async -- fires off the computation, current render shows a loading state
      return kindBar + rewardNote + sectionTabs + controls + '<p style="color:var(--bb-text-muted);">Crunching the leaderboard&hellip;</p>';
    }
    if(!state.tippingLeaderboard.length){
      return kindBar + rewardNote + sectionTabs + controls + '<p style="color:var(--bb-text-muted);">No tips resolved yet for this view.</p>';
    }

    // "Your standing" -- the table below can be sorted by any one column at
    // a time, so this stays useful for seeing where you rank on the OTHER
    // two metrics without having to click through each sort.
    let yourStanding = '';
    if(state.user && !state.user.isAdmin){
      const findYou = (metricKey) => {
        const col = LEADERBOARD_SORT_COLS.find(c => c.key === metricKey);
        const sorted = state.tippingLeaderboard.slice().sort((a,b) => col.valueFn(b) - col.valueFn(a));
        const idx = sorted.findIndex(t => t.username === state.user.username);
        if(idx === -1) return null;
        return { rank: idx + 1, of: sorted.length, yourValue: col.valueFn(sorted[idx]), leaderValue: col.valueFn(sorted[0]),
                 yourRow: sorted[idx], leaderRow: sorted[0], isLeader: idx === 0, fmt: col.fmt, diffFmt: col.diffFmt };
      };
      const rows = LEADERBOARD_SORT_COLS.map(c => [c.label, findYou(c.key)]).filter(r => r[1] !== null);
      if(rows.length){
        yourStanding = `<div class="bb-card" style="margin-bottom:1rem;border-color:#4a4a2a;">
            <strong style="font-size:13px;color:#eee;">Your standing in this view</strong>
            <div style="margin-top:6px;">
              ${rows.map(([label, r]) => `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;color:#cfcfcf;">
                  <span>${esc(label)}: #${r.rank} of ${r.of}</span>
                  <span>${r.isLeader ? '<span style="color:var(--bb-ok);">Leading</span>' : (r.fmt(r.yourValue, r.yourRow) + ' -- ' + r.diffFmt(r.leaderValue - r.yourValue) + ' behind 1st')}</span>
                </div>`).join('')}
            </div>
          </div>`;
      }
    }

    const tableTitle = LEADERBOARD_SECTIONS.find(s => s.key === state.tippingLeaderboardSection)?.label || 'Overall';
    const table = renderSortableLeaderboardTable(
      state.tippingLeaderboard, state.tippingLeaderboardSortBy, state.tippingLeaderboardSortDir,
      state.user && !state.user.isAdmin ? state.user.username : null,
      tableTitle, `${helpTip('oddspoints', 'Each correct tip scores what a 1-clam bet on that pick would have paid, based on its odds at the time \u2014 so an upset tip is worth more than a favourite. Click a column to sort by it.')}`,
      true // showUpcomingCheck -- weekly only, see renderPreseasonLeaderboard for the pre-season equivalent (never shown there)
    );
    return kindBar + rewardNote + sectionTabs + controls + yourStanding + table;
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
            <div style="display:flex;align-items:center;gap:6px;font-weight:600;cursor:pointer;" data-show-form="${esc(m.teamA)}" title="See ${esc(m.teamA)}'s results">${teamLogo(m.teamA,18)}${esc(m.teamA)}</div>
            <div style="display:flex;align-items:center;gap:6px;font-weight:600;cursor:pointer;" data-show-form="${esc(m.teamB)}" title="See ${esc(m.teamB)}'s results"><span style="color:#9a9a9a;font-weight:400;">vs</span> ${teamLogo(m.teamB,18)}${esc(m.teamB)}</div>
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

  const TX_TYPE_LABELS = {
    BET_PLACED: '\u{1F3B2}', BET_STATUS_CHANGE: '\u2696\uFE0F', TIP_REWARD: '\u{1F3AF}',
    REGISTRATION_BONUS: '\u{1F381}', ADMIN_ADJUSTMENT: '\u{1F6E0}\uFE0F',
    TIER_REWARD: '\u{1F3C6}', PRESEASON_PICK_REWARD: '\u{1F52E}',
  };
  function renderTxHistoryList(){
    if(state.txHistory === null){
      loadTxHistory(); // async -- fires off the fetch, current render shows a brief loading state
      return `<p style="color:#9a9a9a;font-size:13px;margin-top:8px;">Loading&hellip;</p>`;
    }
    if(!state.txHistory.length){
      return `<p style="color:#9a9a9a;font-size:13px;margin-top:8px;">Nothing here yet.</p>`;
    }
    const recent = state.txHistory.slice(0, 30);
    return `<div style="margin-top:8px;">
        ${recent.map(tx => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #333333;font-size:12px;">
            <span style="display:flex;align-items:center;gap:6px;color:#cfcfcf;">${TX_TYPE_LABELS[tx.type]||'\u2022'} ${esc(tx.reason)}</span>
            <span style="font-weight:600;color:${tx.amount>=0?'#7fbf8f':'#e08a8a'};white-space:nowrap;margin-left:8px;">${tx.amount>=0?'+':''}${fmt(tx.amount)}</span>
          </div>`).join('')}
      </div>`;
  }

  function renderMyBetsTab(){
    if(!state.user) return '<p style="color:#9a9a9a;">Log in to see your bets.</p>';
    const prefsCard = `<div class="bb-card" style="margin-bottom:1rem;">
        <h4 style="margin:0 0 8px;color:#9a9a9a;">Your preferences</h4>
        <label style="display:flex;align-items:flex-start;gap:8px;font-size:13px;cursor:pointer;">
          <input type="checkbox" id="tip-reminder-toggle" ${state.user.tipReminderEnabled?'checked':''} style="margin-top:2px;"/>
          <span>Flag it for me on the Tipping tab if I haven't submitted my tips for the week.</span>
        </label>
      </div>`;
    const txCard = `<div class="bb-card" style="margin-bottom:1rem;">
        <div data-toggle-tx-history style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;">
          <h4 style="margin:0;color:#9a9a9a;">Balance history</h4>
          <span style="font-size:12px;color:#9a9a9a;">${state.txHistoryExpanded?'Hide \u25B4':'Show \u25BE'}</span>
        </div>
        ${state.txHistoryExpanded ? renderTxHistoryList() : ''}
      </div>`;
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
    if(state.myBets === null) return prefsCard + txCard + careerBox + legacyBox + '<p style="color:#9a9a9a;">Loading&hellip;</p>';
    const bets = state.myBets;
    if(!bets.length) return prefsCard + txCard + careerBox + legacyBox + '<p style="color:#9a9a9a;">No bets placed yet &mdash; head to any market tab and tap an outcome to get started.</p>';
    const pending = bets.filter(b=>(b.status||'PENDING')==='PENDING').length;
    const won = bets.filter(b=>b.status==='WON').length;
    const lost = bets.filter(b=>b.status==='LOST').length;
    const voided = bets.filter(b=>b.status==='VOID').length;
    const netFromSettled = bets.reduce((s,b)=>{
      if(b.status==='WON') return s + (b.potentialReturn - b.stake);
      if(b.status==='LOST') return s - b.stake;
      return s;   // PENDING and VOID both net to 0 -- VOID refunds the stake, nothing gained or lost
    }, 0);
    return prefsCard + txCard + careerBox + legacyBox + `
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
                <td>${b.selections.map(s=>esc(s.label)+' <span style="color:#8a8a8a;">('+formatOdds(s.odds)+')</span>').join('<br/>')}</td>
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
        <span>${esc(label)}</span><span class="bb-odds">${formatOdds(o.odds)}</span></div>`;
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

  // Real standings computed from the actual schedule and REAL_RESULTS --
  // no precomputed table exists anywhere, so this derives it directly.
  // Points/tiebreak convention matches the simulation exactly (3/1/0,
  // ties broken by score-for not differential) for consistency with
  // every other ranking shown across the site.
  function computeDivisionStandings(div){
    const teams = H2H_DIVISIONS[div] || [];
    const schedule = H2H_SCHEDULE[div] || [];
    const lastPlayed = state.currentRound - 1;
    const table = {};
    teams.forEach(t => { table[t] = { team: t, played: 0, won: 0, drawn: 0, lost: 0, scoreFor: 0, scoreAgainst: 0, points: 0 }; });
    for(let r = 1; r <= Math.min(lastPlayed, schedule.length); r++){
      const pairs = schedule[r-1] || [];
      for(const [a, b] of pairs){
        if(!table[a] || !table[b]) continue; // defensive -- shouldn't happen if the schedule matches the roster
        const sa = REAL_RESULTS[a] && REAL_RESULTS[a][r-1];
        const sb = REAL_RESULTS[b] && REAL_RESULTS[b][r-1];
        if(sa == null || sb == null) continue; // result not in yet
        table[a].played++; table[b].played++;
        table[a].scoreFor += sa; table[a].scoreAgainst += sb;
        table[b].scoreFor += sb; table[b].scoreAgainst += sa;
        if(sa > sb){ table[a].won++; table[a].points += 3; table[b].lost++; }
        else if(sb > sa){ table[b].won++; table[b].points += 3; table[a].lost++; }
        else { table[a].drawn++; table[b].drawn++; table[a].points++; table[b].points++; }
      }
    }
    return Object.values(table).sort((x,y) => y.points - x.points || y.scoreFor - x.scoreFor);
  }

  function findTeamDivision(teamName){
    for(const div in H2H_DIVISIONS){
      if(H2H_DIVISIONS[div].includes(teamName)) return div;
    }
    return null;
  }

  function allTeamsAlphabetical(){
    const seen = new Set();
    const all = [];
    Object.values(H2H_DIVISIONS).forEach(teams => teams.forEach(t => { if(!seen.has(t)){ seen.add(t); all.push(t); } }));
    return all.sort((a,b) => a.localeCompare(b));
  }

  function renderTeamDirectory(){
    const query = (state.teamDirectoryQuery || '').trim().toLowerCase();
    const all = allTeamsAlphabetical();
    const filtered = query ? all.filter(t => t.toLowerCase().includes(query)) : all;
    // Grouped by first letter, since a flat 62-team list is a long scroll
    // otherwise -- letter headers give a quick visual anchor.
    const groups = {};
    filtered.forEach(t => {
      const letter = /[A-Z]/i.test(t[0]) ? t[0].toUpperCase() : '#';
      (groups[letter] = groups[letter] || []).push(t);
    });
    const letters = Object.keys(groups).sort();
    return `<div class="bb-card" style="margin-bottom:1rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <strong style="font-size:14px;">All teams</strong>
          <span id="close-team-directory" style="cursor:pointer;color:var(--bb-text-muted);font-size:18px;line-height:1;">&times;</span>
        </div>
        <input class="bb-input" id="team-directory-search" placeholder="Search for a team\u2026" value="${esc(state.teamDirectoryQuery||'')}" style="margin-bottom:10px;">
        ${!filtered.length ? '<p style="color:var(--bb-text-muted);font-size:13px;">No teams match that search.</p>' : ''}
        <div style="max-height:520px;overflow-y:auto;">
        ${letters.map(letter => `
          <div style="font-size:11px;font-weight:700;color:var(--bb-text-muted);text-transform:uppercase;letter-spacing:0.04em;padding:8px 4px 4px;">${esc(letter)}</div>
          ${groups[letter].map(t => `<div class="bb-tab" data-view-team-profile="${esc(t)}" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;cursor:pointer;">
            ${teamLogo(t, 22)}<span style="font-size:13px;">${esc(t)}</span>
            <span style="margin-left:auto;font-size:11px;color:var(--bb-text-muted);">${esc((findTeamDivision(t)||'').replace(' (D1)',''))}</span>
          </div>`).join('')}
        `).join('')}
        </div>
      </div>`;
  }

  const TEAM_PROFILE_SUBTABS = [
    { key: 'OVERVIEW', label: 'Overview' },
    { key: 'RESULTS', label: 'Results' },
    { key: 'COMPETITIONS', label: 'Competitions' },
    { key: 'BILBBET', label: 'Bilbbet history' },
  ];

  function renderTeamProfile(teamName){
    const div = findTeamDivision(teamName);
    if(!div){
      return `<div class="bb-card"><p style="color:var(--bb-text-muted);">Couldn't find that team.</p></div>`;
    }
    const tabs = `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:1rem;">
        ${TEAM_PROFILE_SUBTABS.map(s => `<div class="bb-tab ${state.teamProfileSubTab===s.key?'active':''}" data-team-profile-subtab="${s.key}" style="font-size:12px;padding:6px 10px;">${esc(s.label)}</div>`).join('')}
      </div>`;
    const header = `<div class="bb-card" style="margin-bottom:1rem;display:flex;align-items:center;gap:12px;">
        <button class="bb-btn ghost" id="team-profile-back" style="padding:6px 10px;font-size:12px;">&larr;</button>
        ${teamLogo(teamName, 44)}
        <div>
          <div style="font-size:16px;font-weight:700;">${esc(teamName)}</div>
          <div style="font-size:12px;color:var(--bb-text-muted);">${esc(div.replace(' (D1)',''))}</div>
        </div>
      </div>`;
    let body;
    if(state.teamProfileSubTab === 'RESULTS') body = renderTeamProfileResults(teamName, div);
    else if(state.teamProfileSubTab === 'COMPETITIONS') body = renderTeamProfileCompetitions(teamName, div);
    else if(state.teamProfileSubTab === 'BILBBET') body = renderTeamProfileBilbbetHistory(teamName);
    else body = renderTeamProfileOverview(teamName, div);
    return header + tabs + body;
  }

  function renderTeamProfileOverview(teamName, div){
    const lastPlayed = state.currentRound - 1;
    const marketRows = FUTURES.divisions[div] || {};
    const oddsFor = (marketKey) => {
      const e = (marketRows[marketKey] || []).find(x => x.team === teamName);
      return e ? (e.suspended ? 'suspended' : formatOdds(e.odds)) : null;
    };
    const isEliza = div.startsWith('ELIZA');
    const isDiv3 = div.startsWith('DIVISION 3');
    const oddsBlock = [
      ['Win division', oddsFor('win_div_pct')],
      ['Top 3 finish', oddsFor('top3_pct')],
      !isEliza ? ['Promotion', oddsFor('promotion_pct')] : null,
      (isEliza || !isDiv3) ? ['Relegation', oddsFor('relegation_pct')] : null,
      isDiv3 ? ['Bottom 3 finish', oddsFor('bottom3_pct')] : null,
      ['Wooden spoon', oddsFor('wooden_spoon_pct')],
    ].filter(Boolean).filter(([,v]) => v !== null);
    const oddsHtml = `<div class="bb-card" style="margin-bottom:10px;">
        <strong style="font-size:13px;">${esc(div.replace(' (D1)',''))} betting markets</strong>
        <div style="margin-top:8px;">
          ${oddsBlock.map(([label, val]) => `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;">
              <span style="color:var(--bb-text-muted);">${esc(label)}</span><span style="font-weight:600;${val==='suspended'?'color:var(--bb-text-muted);':''}">${esc(val)}</span>
            </div>`).join('')}
        </div>
      </div>`;
    const standingsHtml = lastPlayed < 1
      ? `<div class="bb-card"><p style="color:var(--bb-text-muted);margin:0;font-size:13px;">Season hasn't started yet \u2014 standings will appear once Round 1 is played.</p></div>`
      : (() => {
          const standings = computeDivisionStandings(div);
          const rank = standings.findIndex(r => r.team === teamName) + 1;
          const row = standings[rank - 1];
          return `<div class="bb-card">
              <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:14px;">
                <div><div style="font-size:11px;color:var(--bb-text-muted);text-transform:uppercase;">Position</div><div style="font-size:20px;font-weight:700;">${rank} <span style="font-size:12px;color:var(--bb-text-muted);font-weight:400;">of ${standings.length}</span></div></div>
                <div><div style="font-size:11px;color:var(--bb-text-muted);text-transform:uppercase;">Points</div><div style="font-size:20px;font-weight:700;">${row.points}</div></div>
                <div><div style="font-size:11px;color:var(--bb-text-muted);text-transform:uppercase;">Record</div><div style="font-size:20px;font-weight:700;">${row.won}-${row.drawn}-${row.lost}</div></div>
              </div>
              <div style="font-size:12px;color:var(--bb-text-muted);">Played ${row.played} &middot; Score for ${row.scoreFor} &middot; Score against ${row.scoreAgainst}</div>
            </div>`;
        })();
    return oddsHtml + standingsHtml +
      `<div style="margin-top:10px;"><span id="team-profile-view-markets" data-team="${esc(teamName)}" style="cursor:pointer;color:var(--bb-accent);font-size:12px;">View this team's betting markets &rarr;</span></div>`;
  }

  function renderTeamProfileResults(teamName, div){
    const lastPlayed = state.currentRound - 1;
    if(lastPlayed < 1){
      return `<div class="bb-card"><p style="color:var(--bb-text-muted);margin:0;">No results yet this season.</p></div>`;
    }
    const schedule = H2H_SCHEDULE[div] || [];
    const rows = [];
    for(let r = 1; r <= Math.min(lastPlayed, schedule.length); r++){
      const pairs = schedule[r-1] || [];
      const match = pairs.find(([a,b]) => a === teamName || b === teamName);
      if(!match) continue;
      const opponent = match[0] === teamName ? match[1] : match[0];
      const yourScore = REAL_RESULTS[teamName] && REAL_RESULTS[teamName][r-1];
      const oppScore = REAL_RESULTS[opponent] && REAL_RESULTS[opponent][r-1];
      if(yourScore == null || oppScore == null) continue;
      const outcome = yourScore > oppScore ? 'W' : (yourScore < oppScore ? 'L' : 'D');
      rows.push({ round: r, opponent, yourScore, oppScore, outcome });
    }
    if(!rows.length){
      return `<div class="bb-card"><p style="color:var(--bb-text-muted);margin:0;">No results in yet.</p></div>`;
    }
    const outcomeColor = o => o === 'W' ? 'var(--bb-ok)' : (o === 'L' ? 'var(--bb-danger)' : 'var(--bb-text-muted)');
    return `<div class="bb-card" style="padding:0;overflow:hidden;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead><tr style="border-bottom:2px solid var(--bb-border-light);">
            <th style="text-align:left;padding:8px 14px;font-size:11px;color:var(--bb-text-muted);text-transform:uppercase;">Rd</th>
            <th style="text-align:left;padding:8px 8px;font-size:11px;color:var(--bb-text-muted);text-transform:uppercase;">Opponent</th>
            <th style="text-align:right;padding:8px 8px;font-size:11px;color:var(--bb-text-muted);text-transform:uppercase;">Score</th>
            <th style="text-align:center;padding:8px 14px;font-size:11px;color:var(--bb-text-muted);text-transform:uppercase;">Result</th>
          </tr></thead>
          <tbody>${rows.slice().reverse().map((r,i) => `<tr style="border-bottom:1px solid var(--bb-border);${i%2===1?'background:var(--bb-card-bg-alt);':''}">
              <td style="padding:8px 14px;color:var(--bb-text-muted);">${r.round}</td>
              <td style="padding:8px 8px;">${esc(r.opponent)}</td>
              <td style="padding:8px 8px;text-align:right;font-variant-numeric:tabular-nums;">${r.yourScore} &ndash; ${r.oppScore}</td>
              <td style="padding:8px 14px;text-align:center;font-weight:700;color:${outcomeColor(r.outcome)};">${r.outcome}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  function renderTeamProfileCompetitions(teamName, div){
    const sections = [];
    // League table position/points is on the Overview tab already -- this
    // tab is specifically about the CUP competitions (FA Cup / ECL),
    // since that's what "status in each competition" mainly means beyond
    // the league table itself.
    const inEcl = (FUTURES.ecl_field || []).includes(teamName);
    const faCupOdds = {};
    Object.entries(FUTURES.fa_cup_markets || {}).forEach(([market, rows]) => {
      const e = rows.find(x => x.team === teamName);
      if(e) faCupOdds[market] = e;
    });
    sections.push(`<div class="bb-card" style="margin-bottom:10px;">
        <strong style="font-size:13px;">FA Cup</strong>
        <p style="font-size:12px;color:var(--bb-text-muted);margin:4px 0 8px;">Every team enters the FA Cup. Round-by-round elimination tracking isn't available until real results start coming in \u2014 these are their current chances at each stage.</p>
        ${Object.entries(FA_CUP_LABELS_FOR_PROFILE).map(([key, label]) => faCupOdds[key] ? `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:13px;"><span style="color:var(--bb-text-muted);">${esc(label)}</span><span>${faCupOdds[key].suspended?'suspended':formatOdds(faCupOdds[key].odds)}</span></div>` : '').join('')}
      </div>`);
    if(inEcl){
      const eclOdds = {};
      Object.entries(FUTURES.ecl_markets || {}).forEach(([market, rows]) => {
        const e = rows.find(x => x.team === teamName);
        if(e) eclOdds[market] = e;
      });
      sections.push(`<div class="bb-card">
          <strong style="font-size:13px;">ECL</strong>
          <p style="font-size:12px;color:var(--bb-text-muted);margin:4px 0 8px;">One of 12 teams in this season's ECL field.</p>
          ${Object.entries(ECL_LABELS_FOR_PROFILE).map(([key, label]) => eclOdds[key] ? `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:13px;"><span style="color:var(--bb-text-muted);">${esc(label)}</span><span>${eclOdds[key].suspended?'suspended':formatOdds(eclOdds[key].odds)}</span></div>` : '').join('')}
        </div>`);
    } else {
      sections.push(`<div class="bb-card"><p style="font-size:12px;color:var(--bb-text-muted);margin:0;">Not in this season's ECL field.</p></div>`);
    }
    return sections.join('');
  }
  const FA_CUP_LABELS_FOR_PROFILE = { reach_r32_pct: 'Reach Round of 32', reach_r16_pct: 'Reach Round of 16', reach_qf_pct: 'Reach Quarter-Final', reach_sf_pct: 'Reach Semi-Final', reach_final_pct: 'Reach Final', win_pct: 'Win the FA Cup' };
  const ECL_LABELS_FOR_PROFILE = { reach_knockout_pct: 'Reach Knockout Stage', reach_sf_pct: 'Reach Semi-Final', reach_final_pct: 'Reach Final', win_pct: 'Win the ECL' };

  function renderTeamProfileBilbbetHistory(teamName){
    // The punter's username IS their Eliza Cup team name -- that's how
    // registration works, so no separate link/mapping is needed. Direct
    // lookup, same as any other username (getUser already lowercases).
    if(state.teamProfileBilbbetData === undefined || state.teamProfileBilbbetData === null || state.teamProfileBilbbetData.forTeam !== teamName){
      loadTeamProfileBilbbetHistory(teamName); // async -- fires off the fetch, this render shows a loading state
      return `<div class="bb-card"><p style="color:var(--bb-text-muted);margin:0;">Loading&hellip;</p></div>`;
    }
    const d = state.teamProfileBilbbetData;
    if(!d.user){
      return `<div class="bb-card"><p style="color:var(--bb-text-muted);margin:0;font-size:13px;">No bilbbet account registered under "${esc(teamName)}" yet.</p></div>`;
    }
    return `<div class="bb-card" style="margin-bottom:10px;display:flex;gap:20px;flex-wrap:wrap;">
        <div><div style="font-size:11px;color:var(--bb-text-muted);text-transform:uppercase;">Clam balance</div><div style="font-size:20px;font-weight:700;">${fmt(d.user.balance)}</div></div>
        <div><div style="font-size:11px;color:var(--bb-text-muted);text-transform:uppercase;">Tips this season</div><div style="font-size:20px;font-weight:700;">${fmtCorrect(d.tipping.correct)}/${d.tipping.total}</div></div>
        <div><div style="font-size:11px;color:var(--bb-text-muted);text-transform:uppercase;">Odds points</div><div style="font-size:20px;font-weight:700;">${d.tipping.oddsPoints.toFixed(2)}</div></div>
      </div>
      <div class="bb-card" style="padding:0;overflow:hidden;">
        <div style="padding:12px 14px 6px;"><strong style="font-size:13px;">Recent bets</strong></div>
        ${!d.bets.length ? '<p style="color:var(--bb-text-muted);font-size:13px;padding:0 14px 14px;">No bets placed yet.</p>' :
          d.bets.slice(0,10).map((b,i) => `<div style="padding:8px 14px;${i<Math.min(d.bets.length,10)-1?'border-bottom:1px solid var(--bb-border);':''}font-size:13px;display:flex;justify-content:space-between;">
            <span style="color:var(--bb-text-muted);">${b.selections.length>1?b.selections.length+'-leg multi':esc(b.selections[0]?.label||b.selections[0]?.team||'bet')}</span>
            <span>${fmt(b.stake)} @ ${b.combinedOdds.toFixed(2)} <span style="color:var(--bb-text-muted);">(${b.status})</span></span>
          </div>`).join('')}
      </div>`;
  }
  async function loadTeamProfileBilbbetHistory(teamName){
    const username = teamName; // the team name IS the punter username
    const user = await getUser(username);
    const ids = user ? await getIndex('bilbbet2_bets_index_' + username.toLowerCase()) : [];
    const bets = (await Promise.all(ids.map(id => sget('bilbbet2_bet:'+id)))).filter(Boolean).sort((a,b) => b.timestamp - a.timestamp);
    const lastPlayed = state.currentRound - 1;
    const tipping = (user && lastPlayed >= 1)
      ? (await computeTippingTotals('ALL', 1, lastPlayed))[username] || { correct: 0, total: 0, oddsPoints: 0 }
      : { correct: 0, total: 0, oddsPoints: 0 };
    if(state.viewingTeamProfile !== teamName) return; // navigated away while this was loading
    state.teamProfileBilbbetData = { forTeam: teamName, user, bets, tipping };
    render();
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
          <span>${esc(selectedTeam)}</span><span class="bb-odds">${formatOdds(o.odds)}</span></div>`;
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
          <span>${esc(o.team)}</span><span class="bb-odds">${formatOdds(o.odds)}</span></div>`;
      }).join('') + `</div>`;
    }

    html += `</div>`;
    return html;
  }

  function fixedSpecialDropdown(pickPrefix, marketLabel, outcomes, selectedTeam, selectId){
    const kind = pickPrefix.split('|')[1]; // 'charity' or 'philanthropy' -- reuses the same toggle-list click handler as win_round/lose_round, which reads this generically off the button's data attribute
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
          <span>${esc(selectedTeam)}</span><span class="bb-odds">${formatOdds(o.odds)}</span></div>`;
      }
    }
    const expanded = state.specialsExtremeExpanded === kind;
    let listHtml = `<button class="bb-btn ghost" data-toggle-extreme-list="${kind}" style="margin-top:10px;font-size:12px;padding:6px 12px;">${expanded ? 'Hide full list \u25b4' : 'Show every team in odds order \u25be'}</button>`;
    if(expanded){
      listHtml += `<div style="margin-top:10px;max-height:400px;overflow-y:auto;">` + outcomes.map(o => {
        if(o.suspended){
          return `<div class="bb-outcome" style="opacity:0.5;cursor:default;"><span>${esc(o.team)}</span><span class="bb-odds" style="color:#9a9a9a;">suspended</span></div>`;
        }
        const id = pickPrefix + '|' + o.team;
        const isSelected = state.slip.some(s=>s.id===id);
        return `<div class="bb-outcome ${isSelected?'selected':''}" data-pick="${esc(id)}" data-team="${esc(o.team)}" data-odds="${o.odds}" data-label="${esc(o.team)} \u2014 ${esc(marketLabel)}">
          <span>${esc(o.team)}</span><span class="bb-odds">${formatOdds(o.odds)}</span></div>`;
      }).join('') + `</div>`;
    }
    return `<div class="bb-card" style="margin-bottom:10px;">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px;">${esc(marketLabel)}</div>
      ${teamSearchInput(selectId, selectedTeam)}
      ${odds_row}
      ${listHtml}
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
            <span>${esc(n.name)}</span><span class="bb-odds">${formatOdds(n.odds)}</span></div>`;
        }).join('') + '</div>';
    }
    if(settled.length){
      html += '<h4 style="color:#9a9a9a;">Settled</h4><div class="bb-card" style="padding:0;overflow:hidden;margin-bottom:1.5rem;">' +
        settled.map((n,i) => `<div style="display:flex;justify-content:space-between;padding:10px 14px;${i<settled.length-1?'border-bottom:1px solid #3d3d3d;':''}">
          <span style="color:#9a9a9a;">${esc(n.name)} <span style="color:#8a8a8a;">(${formatOdds(n.odds)})</span></span>${statusPill(n.status)}
        </div>`).join('') + '</div>';
    }

    html += '<h3>Suggest your own</h3><div class="bb-card">' +
      `<textarea class="bb-input" id="suggestion-text" placeholder="Describe your special bet idea\u2026" rows="3" style="resize:vertical;">${esc(state.suggestionText||'')}</textarea>` +
      `<button class="bb-btn" id="submit-suggestion-btn" style="margin-top:8px;">Submit idea</button>` +
      `<p style="font-size:12px;color:#9a9a9a;margin:8px 0 0;">The admin reviews every idea and either sets a price and adds it above, or turns it down.</p>` +
      '</div>';
    return html;
  }

  // Shared, sortable merged leaderboard table -- one ranked list with all
  // three metrics as columns, rather than three separately-sorted lists.
  // Click a column header to sort by it; the currently-active column shows
  // a small direction arrow. Odds points is the default sort since that's
  // the metric tied to the actual reward (see the helpTip below).
  //
  // Handles two distinct row states:
  //  - graded: total > 0, real correct/oddsPoints/percentage shown.
  //  - participation-only (pre-season, nothing has resolved yet): total
  //    is 0 but the punter has genuinely submitted picks -- shown with
  //    "--" for the not-yet-knowable stats rather than a misleading 0,
  //    which would look identical to "predicted and got every single one
  //    wrong" rather than "hasn't been graded yet".
  const LEADERBOARD_SORT_COLS = [
    { key: 'oddsPoints', label: 'Odds pts', valueFn: t => t.oddsPoints, fmt: v => v.toFixed(2), diffFmt: v => v.toFixed(2) },
    { key: 'correct', label: 'Correct', valueFn: t => t.correct, fmt: (v,t) => `${fmtCorrect(v)}/${t.total}`, diffFmt: v => fmtCorrect(v) },
    { key: 'pct', label: '%', valueFn: t => t.total > 0 ? t.correct/t.total : -1, fmt: v => (v*100).toFixed(1)+'%', diffFmt: v => (v*100).toFixed(1)+'%' },
  ];

  function renderSortableLeaderboardTable(rows, sortByKey, sortDir, currentUsername, title, subtitle, showUpcomingCheck){
    if(!rows.length){
      return `<div class="bb-card"><p style="color:var(--bb-text-muted);margin:0;">Nothing to show yet.</p></div>`;
    }
    const col = LEADERBOARD_SORT_COLS.find(c => c.key === sortByKey) || LEADERBOARD_SORT_COLS[0];
    const sorted = rows.slice().sort((a,b) => {
      const av = col.valueFn(a), bv = col.valueFn(b);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    const arrow = dir => dir === 'asc' ? '&uarr;' : '&darr;';
    const headerCell = c => {
      const active = c.key === sortByKey;
      return `<th data-sort-col="${c.key}" style="text-align:right;padding:8px 8px;color:${active?'var(--bb-accent)':'var(--bb-text-muted)'};font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;cursor:pointer;user-select:none;white-space:nowrap;">
        ${esc(c.label)}${active ? ' '+arrow(sortDir) : ''}
      </th>`;
    };
    return `<div class="bb-card" style="padding:0;overflow:hidden;">
      <div style="padding:14px 18px 8px;display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:4px;">
        <strong style="font-size:14px;">${esc(title)}</strong>
        ${subtitle ? `<span style="font-size:11px;color:var(--bb-text-muted);">${esc(subtitle)}</span>` : ''}
      </div>
      <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;min-width:360px;">
        <thead>
          <tr style="border-bottom:2px solid var(--bb-border-light);">
            <th style="text-align:left;padding:8px 18px;color:var(--bb-text-muted);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">#</th>
            <th style="text-align:left;padding:8px 8px;color:var(--bb-text-muted);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Punter</th>
            ${LEADERBOARD_SORT_COLS.map(headerCell).join('')}
          </tr>
        </thead>
        <tbody>
          ${sorted.map((t,i) => {
            const isYou = currentUsername && t.username === currentUsername;
            const zebra = i % 2 === 1 ? 'background:var(--bb-card-bg-alt);' : '';
            const rowBg = isYou ? 'background:#2a2a1a;' : zebra;
            const graded = t.total > 0;
            const upcomingTick = (showUpcomingCheck && t.submittedUpcoming)
              ? ` <span style="color:var(--bb-ok);font-weight:700;" title="Already submitted picks for the upcoming round">&#10003;</span>` : '';
            return `<tr style="border-bottom:1px solid var(--bb-border);${rowBg}">
              <td style="padding:9px 18px;color:var(--bb-text-muted);font-variant-numeric:tabular-nums;">${i+1}</td>
              <td style="padding:9px 8px;font-weight:${isYou?'700':'400'};${isYou?'color:var(--bb-accent);':''}">${esc(t.username)}${upcomingTick}${isYou?' <span style="font-size:10px;color:var(--bb-text-muted);font-weight:400;">(you)</span>':''}${!graded?' <span style="font-size:10px;color:var(--bb-text-muted);">(joined, no results yet)</span>':''}</td>
              <td style="padding:9px 8px;text-align:right;font-weight:600;color:${graded?'var(--bb-accent)':'var(--bb-text-muted)'};font-variant-numeric:tabular-nums;">${graded?t.oddsPoints.toFixed(2):'&mdash;'}</td>
              <td style="padding:9px 8px;text-align:right;color:var(--bb-text-muted);font-variant-numeric:tabular-nums;">${graded?`${fmtCorrect(t.correct)}/${t.total}`:'&mdash;'}</td>
              <td style="padding:9px 18px;text-align:right;color:var(--bb-text-muted);font-variant-numeric:tabular-nums;">${graded?(t.correct/t.total*100).toFixed(1)+'%':'&mdash;'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      </div>
    </div>`;
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
      leaderboard('Most career wins (carried over from previous seasons)', s.topCareerWins, v=>v+' win'+(v!==1?'s':'')) +
      '<h4 style="color:#9a9a9a;margin-bottom:6px;">Beating the line</h4>' +
      (s.lineBeat.ready
        ? leaderboard('Cover their line most often', s.lineBeat.best.map(r => ({ label: r.team+' \u2014 '+r.covered+'/'+r.total, value: r.pct })), v=>v.toFixed(0)+'%') +
          leaderboard('Miss their line most often', s.lineBeat.worst.map(r => ({ label: r.team+' \u2014 '+r.covered+'/'+r.total, value: r.pct })), v=>v.toFixed(0)+'%')
        : '<p style="color:#9a9a9a;font-size:13px;">Not enough completed rounds yet to make this meaningful \u2014 check back around Round 5.</p>');
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
      {key:'feedback', label:'Feedback'},
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
      <div class="bb-card" style="margin-bottom:1.5rem;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-size:13px;color:#9a9a9a;">Home tab's featured picks are computed once per round and then locked in -- if the selection logic changes, an already-computed round won't pick up the fix on its own.</span>
        <button class="bb-btn ghost" id="refresh-featured-fixtures" ${state.refreshingFeatured?'disabled':''}>${state.refreshingFeatured?'Refreshing\u2026':'Force recompute for Round '+state.currentRound}</button>
        ${state.refreshedFeaturedInfo ? `<span style="font-size:12px;color:#8fc98f;width:100%;">${esc(state.refreshedFeaturedInfo)}</span>` : ''}
      </div>
      <h3>End of season</h3>
      <div class="bb-card" style="margin-bottom:1.5rem;border-color:#a3402f;">
        <p style="font-size:12px;color:#9a9a9a;margin-top:0;">
          Current season: <strong style="color:#eee;">${esc(state.currentSeasonLabel || 'not yet set')}</strong>
          &mdash; auto-derived from today's date (Jul&ndash;Dec counts as the season starting that year, Jan&ndash;Jun as
          the one that started the previous year, matching this league's actual Oct&ndash;May calendar).
          Ending the season right now would set it to <strong style="color:#eee;">${esc(deriveSeasonLabel())}</strong>.
        </p>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <input type="text" id="season-label-override" placeholder="e.g. 26/27" value="${esc(state.currentSeasonLabel || '')}" style="width:100px;padding:6px 8px;font-size:13px;"/>
          <button class="bb-btn ghost" id="save-season-label-btn" style="padding:6px 12px;font-size:12px;">Correct current season</button>
          <span style="font-size:11px;color:#9a9a9a;">Only for fixing a wrong auto-derived value -- doesn't archive or reset anything, just relabels going forward.</span>
        </div>
        <p style="font-size:12px;color:#9a9a9a;">
          Folds everyone's settled bets this season into their running career record (kept, not deleted -- just
          compacted from individual bet lines into a summary), keeps each punter's all-time best 3 wins in full detail
          for bragging rights, resets Round back to 1 with betting reopened, and clears out everyone's pre-season
          picks/results so the new season starts clean. Pending bets are left untouched.
          <strong style="color:#c0604f;">This can't be undone.</strong>
        </p>
        <button class="bb-btn ghost" id="end-season-btn" style="border-color:#a3402f;color:#c0604f;">End season &amp; archive</button>
      </div>
      <h3>Tipping season prizes</h3>
      <div class="bb-card" style="margin-bottom:1.5rem;">
        <p style="font-size:12px;color:#9a9a9a;margin-top:0;">
          Flag a section closed once its position is genuinely settled -- mathematically confirmed (title, promotion, relegation) or the season's literally finished -- to release its seasonal tipping prizes. Purely manual; nothing here is inferred automatically.
        </p>
        ${['ELIZA','DIV2','DIV3'].map(key => {
          const label = TIPPING_SECTIONS.find(s => s.key === key).label;
          return `<label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:8px;cursor:pointer;">
              <input type="checkbox" data-toggle-season-closed="${key}" ${state.seasonClosed[key]?'checked':''}/>
              <span>${esc(label)} season closed</span>
            </label>`;
        }).join('')}
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;padding-top:6px;border-top:1px solid #333333;margin-top:4px;cursor:pointer;">
          <input type="checkbox" data-toggle-season-closed="ALL" ${state.seasonClosed.ALL?'checked':''}/>
          <span>Combined competition (all tipping) season closed</span>
        </label>
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
                <span>${esc(b.username)} \u2014 ${esc(b.selections[0].label)} <span style="color:#8a8a8a;">(stake ${fmt(b.stake)}, odds ${formatOdds(b.selections[0].odds)})</span></span>
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
                  const label = esc(s.label)+' <span style="color:#8a8a8a;">('+formatOdds(s.odds)+')</span>';
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
                <span>${esc(n.name)} <span class="bb-odds">${formatOdds(n.odds)}</span> ${statusPill(n.status)}</span>
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

    const FEEDBACK_HTML = (() => {
      if(state.feedback === null){
        loadFeedback(); // async -- fires off the fetch, current render shows a brief loading state
        return `<h3 style="margin-top:0;">Feedback</h3><p style="color:#9a9a9a;">Loading&hellip;</p>`;
      }
      if(!state.feedback.length){
        return `<h3 style="margin-top:0;">Feedback</h3><p style="color:#9a9a9a;">No complaints filed yet. Give it time.</p>`;
      }
      return `<h3 style="margin-top:0;">Feedback</h3>
        <div class="bb-card">
          ${state.feedback.map(f => `<div style="padding:8px 0;border-bottom:1px solid #333333;">
              <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
                <strong style="font-size:13px;">${esc(f.username)}</strong>
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-size:11px;color:#9a9a9a;white-space:nowrap;">${new Date(f.timestamp).toLocaleString()}</span>
                  <button class="bb-btn ghost" data-delete-feedback="${esc(f.id)}" style="padding:2px 8px;font-size:11px;">Remove</button>
                </div>
              </div>
              <div style="font-size:13px;color:#cfcfcf;margin-top:2px;">${esc(f.category)}</div>
              ${f.comment ? `<div style="font-size:12px;color:#9a9a9a;margin-top:4px;font-style:italic;">"${esc(f.comment)}"</div>` : ''}
            </div>`).join('')}
        </div>`;
    })();

    const bodyByTab = { season: SEASON_HTML, fixtures: FIXTURES_HTML, bets: BETS_HTML, specials: SPECIALS_HTML, punters: PUNTERS_HTML, feedback: FEEDBACK_HTML };
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

  // Auto-derives a "YY/YY" season label from a real calendar date, rather
  // than a manually-maintained constant someone has to remember to bump.
  // This league's actual season runs October-May (confirmed directly from
  // round_dates.json: round 1 on 2026-10-16, round 26 on 2027-05-07), so
  // July is used as the cutover -- roughly the middle of the June-September
  // off-season gap, comfortably clear of both the real season's start and
  // end, so a rollover done any time in that realistic window still lands
  // on the correct label.
  function deriveSeasonLabel(date){
    const d = date || new Date();
    const year = d.getFullYear();
    const month = d.getMonth() + 1; // 1-12
    const startYear = month >= 7 ? year : year - 1;
    const yy = n => String(n % 100).padStart(2, '0');
    return `${yy(startYear)}/${yy(startYear + 1)}`;
  }
  // Storage keys use this slash-free form of the season label -- the
  // primary Supabase backend confirmed safe with a literal "/" (plain
  // string column, no path interpretation), but the window.storage
  // fallback's own key constraints weren't worth leaving to chance for
  // zero cost. Display-facing text keeps the familiar "26/27" form.
  function seasonKeyPart(){
    return (state.currentSeasonLabel || 'unversioned').replace('/', '-');
  }

  async function endSeasonRollover(){
    const outgoingSeasonLabel = state.currentSeasonLabel;
    const newSeasonLabel = deriveSeasonLabel();

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
    if(!confirm(`End the ${outgoingSeasonLabel || 'current'} season and start ${newSeasonLabel}? `
      + `This archives everyone's settled bets into their career record (compacted to a summary, plus their best 3 all-time bets kept in full), `
      + `resets Round to 1 with betting open, and clears out this season's cup/playoff fixtures, ECL group draw, `
      + `paused markets, novelty bets, and everyone's pre-season picks/results so the new season starts clean. `
      + `Punter balances are NOT touched -- everyone keeps exactly what they ended the season with. This can't be undone.${pendingWarning}`)) return;

    const results = [];
    for(const u of nonAdmin){
      const r = await archiveBetsForUser(u.username, outgoingSeasonLabel);
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
    state.seasonClosed = { ELIZA: false, DIV2: false, DIV3: false, ALL: false };
    state.currentSeasonLabel = newSeasonLabel;
    await sset('bilbbet2_cup_fixtures', state.cupFixtures);
    await sset('bilbbet2_playoff_fixtures', state.playoffFixtures);
    await sset('bilbbet2_ecl_groups', state.eclGroups);
    await sset('bilbbet2_paused_categories', state.pausedCategories);
    await sset('bilbbet2_season_closed', state.seasonClosed);
    await sset('bilbbet2_current_season_label', state.currentSeasonLabel);

    // Pre-season picks/results are per-user, unversioned data with nothing
    // anywhere that displays a history of past seasons' picks -- wiped
    // clean rather than archived, since archiving would just be unused
    // plumbing. Reward idempotency keys are versioned by season label
    // (see tipRewardKey and friends) so this wipe is about the picks UI
    // starting fresh, not reward eligibility, which is already safe.
    for(const u of nonAdmin){
      await sdelete(preseasonStorageKey(u.username));
    }
    await sdelete(PRESEASON_RESULTS_KEY);
    state.preseasonResults = null;
    state.preseasonData = null;
    state.preseasonAllPicks = null;
    state.preseasonLeaderboard = null;

    const noveltyIds = await getIndex('bilbbet2_novelty_index');
    await sset('bilbbet2_novelty_index', []);
    state.novelty = [];

    await saveCurrentRound(1);
    await reopenBetting();

    const archivedCount = results.reduce((s,r)=>s+r.archived, 0);
    alert(`${outgoingSeasonLabel || 'Season'} archived: ${archivedCount} settled bet(s) folded into career records across ${results.length} punter(s). `
      + `New season set to ${newSeasonLabel}. Round reset to 1, betting reopened. Cup/playoff fixtures, ECL draw, paused markets, season-closed flags, `
      + `pre-season picks/results, and ${noveltyIds.length} novelty bet(s) cleared. `
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
          <span>${esc(m.team)}</span><span class="bb-odds">${formatOdds(oddsInfo.odds)}</span></div>`;
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
      await logTransaction(username, 'ADMIN_ADJUSTMENT', delta, u.balance, `Balance ${delta>0?'increased':'decreased'} by an admin`);
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
        const carry = fresh.dormantCarry || 0;
        const bonus = 1000 + carry;
        fresh.balance += bonus;
        fresh.everFunded = true;
        await saveUser(fresh);
        await logTransaction(username, 'REGISTRATION_BONUS', bonus, fresh.balance, carry > 0 ? `Registration bonus (1,000 + ${carry} carried over from last season)` : 'Registration bonus');
        return fresh;
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
    if(!state.user){
      alert('You must log in first to place a bet.');
      state.loginModalOpen = true;
      render();
      return;
    }
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
    const NEGATIVE_FUT_MARKETS = ['relegation_pct', 'wooden_spoon_pct', 'bottom3_pct', 'bottom_half_pct'];
    const excludeSelf = state.user && NEGATIVE_FUT_MARKETS.includes(state.futureMarketTab);
    const eligible = (list||[]).filter(o => !o.suspended && !(excludeSelf && o.team === state.user.username));
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
    alert('Surprise pick added: '+pick.team+' @ '+formatOdds(pick.odds));
  }

  function exportBetsToCSV(){
    const bets = state.adminBets || [];
    const rows = [['Placed','User','Selections','Stake','Combined Odds','Potential Return','Status']];
    bets.forEach(b => {
      const selText = b.selections.map(s => s.label+' ('+formatOdds(s.odds)+')').join(' | ');
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
        const delta = settlementCredit(newStatus, bet) - settlementCredit(prevStatus, bet);
        u.balance += delta;
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
        if(delta !== 0){
          await logTransaction(bet.username, 'BET_STATUS_CHANGE', delta, u.balance, `Bet ${newStatus.toLowerCase()} (was ${prevStatus.toLowerCase()})`);
        }
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
          let delta = 0;
          const reasonParts = [];
          if(statusChanged){
            delta += settlementCredit(newOverall, bet) - settlementCredit(prevOverall, bet);
            reasonParts.push(`Bet leg resolved (now ${newOverall.toLowerCase()})`);
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
            delta -= bet.stake;
            u.nearMissBonusUsed = false;
            bet.nearMissBonusAwarded = false;
            reasonParts.push('near-miss bonus clawed back');
          } else if(bonusNewlyEarned && !u.nearMissBonusUsed){
            delta += bet.stake;
            u.nearMissBonusUsed = true;
            bet.nearMissBonusAwarded = true;
            reasonParts.push('near-miss bonus awarded');
          }
          u.balance += delta;
          await saveUser(u);
          if(delta !== 0){
            await logTransaction(bet.username, 'BET_STATUS_CHANGE', delta, u.balance, reasonParts.join(', '));
          }
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
  // Which teams most often beat (or miss) their own pre-match projected
  // line -- a genuine cover record, not just win/loss. A team can lose
  // outright and still have covered a big underdog line, or win outright
  // and still have missed a big favourite line. Reuses getFixtureMarkets
  // (the same cached function the H2H tab and featured picks both already
  // go through) so this reads the exact same line every other part of the
  // app would show for that fixture, not a separately-computed one.
  //
  // Gated behind a minimum games-played count -- a team 1-for-1 (100%) is
  // noise, not a real pattern, so it shouldn't outrank a team 8-for-10
  // (80%) with an actual sample behind it. In practice this means the
  // whole stat has nothing meaningful to show before roughly Round 5.
  function computeLineBeatStats(){
    const MIN_GAMES = 4;
    const record = {}; // team -> {covered, total}
    const roundsPlayed = state.currentRound - 1;

    for(let round = 1; round <= roundsPlayed; round++){
      for(const div of FUTURE_DIVS){
        if(hasNoFixtures(div, round)) continue;
        const markets = getFixtureMarkets(div, round);
        for(const m of markets){
          const scoreA = REAL_RESULTS[m.teamA] && REAL_RESULTS[m.teamA][round - 1];
          const scoreB = REAL_RESULTS[m.teamB] && REAL_RESULTS[m.teamB][round - 1];
          if(scoreA == null || scoreB == null) continue; // result not in yet
          const actualMargin = scoreA - scoreB;
          const aCovered = actualMargin > m.line; // m.line is always a .5 value, so no pushes
          if(!record[m.teamA]) record[m.teamA] = { covered: 0, total: 0 };
          if(!record[m.teamB]) record[m.teamB] = { covered: 0, total: 0 };
          record[m.teamA].total++;
          record[m.teamB].total++;
          if(aCovered) record[m.teamA].covered++; else record[m.teamB].covered++;
        }
      }
    }

    const eligible = Object.entries(record)
      .filter(([, r]) => r.total >= MIN_GAMES)
      .map(([team, r]) => ({ team, covered: r.covered, total: r.total, pct: 100 * r.covered / r.total }));

    return {
      ready: eligible.length > 0,
      best: eligible.slice().sort((a, b) => b.pct - a.pct || b.covered - a.covered).slice(0, 5),
      worst: eligible.slice().sort((a, b) => a.pct - b.pct || a.covered - b.covered).slice(0, 5),
    };
  }

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

    const lineBeat = computeLineBeatStats();

    state.statsData = {
      totalWagered: bets.reduce((s,b)=>s+b.stake,0),
      totalBets: bets.length,
      totalPunters: users.length,
      topStakes, topMultis, topWins, topLosses, topOdds, mostPopular, topKitty, topCareerWins, myKittyRank,
      lineBeat,
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
    } else if(state.activeTab === 'TIPPING'){
      body = renderTippingTab();
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
    const mainContent = state.viewingTeamProfile ? renderTeamProfile(state.viewingTeamProfile)
      : state.teamDirectoryOpen ? renderTeamDirectory()
      : mainTabs() + body;
    return `<div id="bb-page-content">${renderStorageWarning()}${renderTestingPhaseDisclaimer()}${header()}${renderTeamSearchPanel()}${mainContent}${renderFooter()}</div>${['ADMIN','STATS'].includes(state.activeTab) ? '' : slipBar()}${state.loginModalOpen ? renderLoginModal() : ''}${state.tosModalOpen ? renderTosModal() : ''}${state.readMeModalOpen ? renderReadMeModal() : ''}${state.tutorialModalOpen ? renderTutorialModal() : ''}${state.welcomeModalOpen ? renderWelcomeModal() : ''}${state.formModalOpen ? renderFormModal() : ''}${state.contactUsModalOpen ? renderContactUsModal() : ''}${teamsDatalist()}`;
  }

  function combinedOdds(){ return combinedOddsFor(state.slip); }
  function combinedOddsFor(slip){
    const naive = slip.reduce((acc,s)=>acc*s.odds,1);
    return naive * placesDependencyAdjustment(slip);
  }
  // Approximates the reduced likelihood of multiple different teams ALL
  // occupying the same limited set of "places" (top 3, top half, etc) --
  // e.g. in a 12-team division with 6 top-half spots, a second team's real
  // chance of ALSO finishing top-half, given the first one already has,
  // is closer to 5/11 than its own standalone 6/12, since they're
  // competing for the same shrinking pool of spots, not independent
  // events. Deliberately an approximation (assumes roughly even spacing
  // between teams' individual chances within one pool, rather than a full
  // joint simulation of the season) -- accepted as a fair trade-off for a
  // for-fun platform rather than building out true joint simulation.
  function placesDependencyAdjustment(slip){
    const groups = {}; // poolKey -> {places, totalTeams, teams: Set}
    for(const s of slip){
      const p = parsePick(s.id);
      let places, totalTeams, poolKey;
      if(p.type === 'fut'){
        places = placesCountFor(p.div, p.marketKey);
        if(places === null) continue;
        // Roddy is cross-divisional -- not one of the 5 regular divisions
        // in H2H_DIVISIONS, so it needs its own confirmed total (62, the
        // full roster across every division) rather than silently getting
        // skipped for having an unknown size.
        totalTeams = p.div === 'RODDY' ? 62 : (H2H_DIVISIONS[p.div] || []).length;
        if(!totalTeams) continue;
        poolKey = (p.marketKey === 'promotion_pct' ? promotionPoolKey(p.div) : p.div) + '|' + p.marketKey;
      } else if(p.type === 'facup'){
        places = FA_CUP_PLACES[p.marketKey];
        if(places === undefined) continue;
        totalTeams = FA_CUP_TOTAL_ENTRANTS;
        poolKey = 'FACUP|' + p.marketKey;
      } else if(p.type === 'ecl'){
        places = ECL_PLACES[p.marketKey];
        if(places === undefined) continue;
        totalTeams = ECL_TOTAL_ENTRANTS;
        poolKey = 'ECL|' + p.marketKey;
      } else {
        continue;
      }
      if(!groups[poolKey]) groups[poolKey] = { places, totalTeams, teams: new Set() };
      groups[poolKey].teams.add(p.team);
    }
    let factor = 1;
    for(const key in groups){
      const g = groups[key];
      const n = g.teams.size;
      if(n < 2) continue; // only one team picked from this pool -- no correction needed
      const baseline = g.places / g.totalTeams;
      let conditional = 1; // the actual hypergeometric probability of all n landing in the places together
      for(let i=0;i<n;i++){ conditional *= (g.places - i) / (g.totalTeams - i); }
      // baseline^n is what naive, independent multiplication assumes; the
      // ratio to the true (lower) joint probability is how much the
      // combined ODDS need scaling up to reflect the real, rarer outcome.
      factor *= Math.pow(baseline, n) / conditional;
    }
    return factor;
  }
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

  // How many teams can genuinely occupy a given "places" market's outcome --
  // e.g. only 3 teams can ever finish top 3, so a slip picking a 4th
  // different team for the same market is picking something that literally
  // cannot happen, not just an unlikely combination. win_div_pct/
  // wooden_spoon_pct/roddy_win_pct aren't listed here since those already
  // have exactly 1 place, handled separately via SINGLE_WINNER_FUT_MARKETS.
  function placesCountFor(div, marketKey){
    switch(marketKey){
      case 'top3_pct': case 'bottom3_pct': case 'roddy_top3_pct': return 3;
      case 'roddy_top5_pct': return 5;
      case 'roddy_top10_pct': return 10;
      case 'top_half_pct': case 'bottom_half_pct': {
        const size = (H2H_DIVISIONS[div] || []).length;
        return size ? Math.floor(size / 2) : null; // unknown division size -- don't block on a guess
      }
      case 'relegation_pct': return div.startsWith('ELIZA') ? 4 : 3;
      case 'promotion_pct': return div.startsWith('DIVISION 3') ? 6 : 4;
      default: return null; // not a fixed-places market, or already handled elsewhere
    }
  }
  // FA Cup's bracket places, verified directly against the pipeline's
  // simulation code (build_fa_cup_bracket / simulate_fa_cup_bracket) --
  // Round of 64 entry, standard knockout halving down to the Final.
  // ECL deliberately excluded from this and from the odds adjustment
  // below: no real simulation exists for it yet (its bracket data is a
  // known placeholder, not something with a confirmed entrant count) --
  // guessing a number here would risk mispricing real multis rather than
  // just leaving ECL uncorrected until that's actually confirmed.
  const FA_CUP_PLACES = { reach_r32_pct: 32, reach_r16_pct: 16, reach_qf_pct: 8, reach_sf_pct: 4, reach_final_pct: 2 };
  const FA_CUP_TOTAL_ENTRANTS = 64;
  // ECL now has real, confirmed simulation logic (simulate_ecl_market) --
  // a fixed 12-team field (9 Eliza Cup + 3 Division 2), 3-matchday league
  // phase, top 8 advance to a seeded knockout bracket. No longer excluded
  // from the places-based blocking/odds-adjustment logic below, now that
  // there's a genuine, verified entrant count and stage sizes to check a
  // multi against.
  const ECL_PLACES = { reach_knockout_pct: 8, reach_sf_pct: 4, reach_final_pct: 2 };
  const ECL_TOTAL_ENTRANTS = 12;
  // promotion_pct's places are shared across BOTH conferences of a division
  // (2A and 2B teams compete for the same 4 promotion spots via the shared
  // playoff bracket), not 4 separate spots within each conference -- so
  // picks from either conference need to be grouped together for this
  // specific market, unlike every other places market which stays within
  // its own single division/conference.
  function promotionPoolKey(div){
    if(div.startsWith('DIVISION 2')) return 'DIVISION 2';
    if(div.startsWith('DIVISION 3')) return 'DIVISION 3';
    return div;
  }

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

    // Self-interest guard: a punter here is also a competing fantasy team,
    // so betting against your own team's interests -- your opponent to
    // beat you head-to-head, or your own team to be relegated/finish last
    // -- would create a direct incentive to underperform in the actual
    // competition for a bigger payout here. Betting FOR your own team's
    // success is untouched by this: that aligns incentives rather than
    // conflicting with them, so it's not blocked.
    const NEGATIVE_FUT_MARKETS = ['relegation_pct', 'wooden_spoon_pct', 'bottom3_pct', 'bottom_half_pct'];
    if(state.user && state.user.username){
      const myTeam = state.user.username;
      if(np.type === 'h2h' && (np.teamA === myTeam || np.teamB === myTeam)){
        const myWinSide = np.teamA === myTeam ? 'a' : 'b';
        if(np.side !== myWinSide){
          return { reason:'self-interest', msg: "you can't bet against your own team \u2014 that market only allows backing your team to win" };
        }
      }
      if(np.type === 'fut' && np.team === myTeam && NEGATIVE_FUT_MARKETS.includes(np.marketKey)){
        return { reason:'self-interest', msg: "you can't bet on your own team for a negative outcome like this" };
      }
    }

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

    // Blocking picks that literally cannot all come true together -- e.g.
    // 4 different teams all "to finish top 3" in the same division is a
    // mathematically impossible outcome, not just a long shot, since only 3
    // teams can ever occupy those 3 spots. Same logic applies to FA Cup and
    // ECL's bracket stages -- only 4 teams can ever reach a Semi-Final, etc.
    if(np.type === 'fut' || np.type === 'facup' || np.type === 'ecl'){
      function placesFor(p){
        if(p.type === 'fut') return placesCountFor(p.div, p.marketKey);
        if(p.type === 'facup') return FA_CUP_PLACES[p.marketKey];
        if(p.type === 'ecl') return ECL_PLACES[p.marketKey];
        return null;
      }
      function poolKeyFor(p){
        if(p.type === 'fut') return p.marketKey === 'promotion_pct' ? promotionPoolKey(p.div) : p.div;
        if(p.type === 'facup') return 'FACUP';
        if(p.type === 'ecl') return 'ECL';
        return null;
      }
      const places = placesFor(np);
      if(places !== null && places !== undefined){
        const poolKey = poolKeyFor(np);
        const existingInPool = state.slip.filter(s => {
          const ep = parsePick(s.id);
          if(ep.type !== np.type || ep.marketKey !== np.marketKey) return false;
          return poolKeyFor(ep) === poolKey && ep.team !== np.team;
        });
        if(existingInPool.length >= places){
          return { reason:'places-exceeded', msg: `only ${places} team${places!==1?'s':''} can actually finish in that market's outcome \u2014 you already have ${places} different team${places!==1?'s':''} picked for it` };
        }
      }
    }

    for(const s of state.slip){
      const ep = parsePick(s.id);

      // same "only one outcome can be true" group, different specific outcome (CONTRARY)
      if(np.group && ep.group && np.group === ep.group){
        const npKey = np.team || np.side, epKey = ep.team || ep.side;
        if(npKey !== epKey){
          // H2H-type picks never have a .team field (only .teamA/.teamB/.side),
          // so resolving the display name needs the side lookup specifically --
          // .team || .side alone silently showed just "a" or "b" instead of the
          // actual team name.
          const epDisplayName = ep.team || (ep.side === 'a' ? ep.teamA : ep.side === 'b' ? ep.teamB : ep.side);
          return { reason:'contrary', msg: `only one outcome in that market can actually happen (you already have ${epDisplayName} in this slip)` };
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

      // H2H: every result/handicap pick for one fixture (win/draw/lose,
      // either side's handicap) is derived from the same underlying
      // simulated score margin -- none of them are genuinely independent
      // of each other, regardless of which specific two are combined.
      // Previously only the favourite's handicap was special-cased against
      // the moneyline (since covering a negative line strictly implies an
      // outright win) -- but an underdog's handicap cover is just as
      // correlated with the match result, just not as a strict guarantee,
      // so it needs blocking too rather than being treated as independent.
      // Simplest, safest rule: at most one pick per fixture, period.
      if(np.type==='h2h' && ep.type==='h2h' && np.roundTag===ep.roundTag && np.teamA===ep.teamA && np.teamB===ep.teamB){
        const resPick = np.kind==='res' ? np : (ep.kind==='res' ? ep : null);
        const hcapPick = np.kind==='hcap' ? np : (ep.kind==='hcap' ? ep : null);
        if(resPick && hcapPick){
          if(hcapPick.favTag==='fav' && resPick.side === hcapPick.side){
            return { reason:'nested', msg: `covering a favourite's handicap already means they won outright, so pairing that with the moneyline just double-dips the same result` };
          }
          return { reason:'contrary', msg: `a result and a handicap pick on the same match aren't independent outcomes \u2014 pick one or the other, not both` };
        }
        if(np.kind==='hcap' && ep.kind==='hcap'){
          return { reason:'contrary', msg: `both sides of the same match's handicap line aren't independent outcomes \u2014 pick one or the other, not both` };
        }
      }
    }
    return null;
  }

  function buildSlipText(){
    const lines = ['My bilbbet slip:'];
    state.slip.forEach(s => lines.push('- ' + s.label + ' (' + formatOdds(s.odds) + ')'));
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
        <span style="display:flex;gap:6px;align-items:center;">
          <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:#9a9a9a;cursor:pointer;">
            <input type="checkbox" id="toggle-implied-chance" ${state.showImpliedChance?'checked':''}/> Implied %${helpTip('implied', 'The odds converted into a rough win chance \u2014 e.g. odds of 2.00 mean roughly a 50% implied chance.')}
          </label>
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
            <span style="color:#cfcfcf;flex:1;">${esc(s.label)} <span class="bb-odds">${formatOdds(s.odds)}</span>${state.showImpliedChance?` <span style="color:#9a9a9a;">(${impliedChance(s.odds)})</span>`:''}</span>
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
          <span style="display:flex;gap:8px;align-items:center;"><span class="bb-odds">${formatOdds(s.odds)}</span>${state.showImpliedChance?`<span style="color:#9a9a9a;font-size:11px;">${impliedChance(s.odds)}</span>`:''}
          <span data-remove="${esc(s.id)}" style="cursor:pointer;color:#9a9a9a;">&times;</span></span></div>`).join('')}
      </div>
      ${boostToggle}
      <div style="display:flex;gap:8px;align-items:center;">
        <div style="flex:1;"><span style="font-size:11px;color:#9a9a9a;">Stake (clams)</span>
          <input class="bb-input" id="stake-input" type="number" min="1" value="${state.stake}" style="padding:6px 10px;"/></div>
        <div style="flex:1;"><span style="font-size:11px;color:#9a9a9a;">Combined odds</span>
          <div style="font-weight:600;color:#ffdd00;padding:6px 0;">${displayedCombined.toFixed(2)}${boostApplied?' \u26A1':''}${state.showImpliedChance?` <span style="font-size:11px;color:#9a9a9a;font-weight:400;">(${impliedChance(displayedCombined)})</span>`:''}</div></div>
        <div style="flex:1;"><span style="font-size:11px;color:#9a9a9a;">Potential return</span>
          <div style="font-weight:600;padding:6px 0;">${fmt(Math.round(displayedPotential))}</div></div>
        <button class="bb-btn" id="place-bet" style="align-self:flex-end;">Place bet</button>
      </div>
    </div></div>`;
  }

  async function loadMyBets(){
    const myUsername = state.user.username; // captured once -- state.user could change while the fetch below is in flight
    const ids = await getIndex('bilbbet2_bets_index_' + myUsername.toLowerCase());
    const bets = (await Promise.all(ids.map(id => sget('bilbbet2_bet:'+id)))).filter(Boolean);
    if(!state.user || state.user.username !== myUsername) return; // a different user is logged in now -- this result no longer applies to anyone
    state.myBets = bets;
    render();
  }

  // Global, not per-user -- shown to everyone regardless of who's logged
  // in, so this doesn't need the username-capture-and-guard pattern the
  // per-user loaders use.
  async function loadRecentWinners(){
    const ids = await getIndex('bilbbet2_winners_index');
    const recentIds = ids.slice(-RECENT_HISTORY_FETCH_LIMIT); // see loadTxHistory -- same reasoning, same fix
    const entries = (await Promise.all(recentIds.map(id => sget('bilbbet2_winner:'+id)))).filter(Boolean);
    state.recentWinners = entries
      .map((w, i) => ({ w, i })) // insertion-order tiebreaker, same reasoning as loadTxHistory
      .sort((a,b) => (b.w.timestamp - a.w.timestamp) || (b.i - a.i))
      .map(x => x.w);
    render();
  }
  async function loadFeedback(){
    const ids = await getIndex('bilbbet2_feedback_index');
    const recentIds = ids.slice(-RECENT_HISTORY_FETCH_LIMIT); // same reasoning as loadTxHistory/loadRecentWinners -- avoid fetching the entire history just to show the most recent batch
    const entries = (await Promise.all(recentIds.map(id => sget('bilbbet2_feedback:'+id)))).filter(Boolean);
    state.feedback = entries
      .map((f, i) => ({ f, i }))
      .sort((a,b) => (b.f.timestamp - a.f.timestamp) || (b.i - a.i))
      .map(x => x.f);
    render();
  }
  async function deleteFeedback(id){
    if(!confirm('Remove this feedback? This can\'t be undone.')) return;
    const idx = await getIndex('bilbbet2_feedback_index');
    await sset('bilbbet2_feedback_index', idx.filter(x => x !== id));
    state.feedback = (state.feedback||[]).filter(f => f.id !== id);
    render();
  }

  const RECENT_HISTORY_FETCH_LIMIT = 40; // small buffer above the 30 actually displayed, in case a few ids fail to resolve
  async function loadTxHistory(){
    const myUsername = state.user.username; // captured once -- state.user could change while the fetch below is in flight
    const ids = await getIndex('bilbbet2_tx_index_' + myUsername.toLowerCase());
    const recentIds = ids.slice(-RECENT_HISTORY_FETCH_LIMIT); // index is strictly insertion-ordered (addToIndex always pushes), so the tail is the most recent -- no need to fetch the entire history just to show the last 30
    const txs = (await Promise.all(recentIds.map(id => sget('bilbbet2_tx:'+id)))).filter(Boolean);
    if(!state.user || state.user.username !== myUsername) return; // a different user is logged in now -- this result no longer applies to anyone
    // ids (and therefore txs) are in insertion order -- used as a tiebreaker
    // when two entries share an identical millisecond timestamp, so a later
    // insertion still reliably sorts as more recent even then.
    state.txHistory = txs
      .map((tx, i) => ({ tx, i }))
      .sort((a,b) => (b.tx.timestamp - a.tx.timestamp) || (b.i - a.i))
      .map(x => x.tx);
    render();
  }

  // ---- Tipping competition: a separate, for-fun prediction game layered
  // on top of the same fixtures and results the real betting system
  // already uses. Scoring has two tracks: a straight correct-tip tally,
  // and the sum of each correct tip's odds (locked in at the moment the
  // tip was made, same as a real bet locks in its price at placement) --
  // so correctly calling an upset is worth more than a correct favourite.
  // Purely informational/for-fun on its own; the one bridge back to the
  // real betting system is the "make a multi" action once every fixture
  // in a chosen division is tipped, which pushes those exact picks into
  // the real slip for the punter to optionally place as an actual bet.
  function tipStorageKey(username, round){ return 'bilbbet2_tips_' + username.toLowerCase() + '_R' + round; }
  function preseasonStorageKey(username){ return 'bilbbet2_preseason_' + username.toLowerCase(); }

  async function loadPreseasonData(){
    if(!state.user) return;
    const myUsername = state.user.username; // captured once -- state.user could change while the fetch below is in flight
    const data = await sget(preseasonStorageKey(myUsername));
    if(!state.user || state.user.username !== myUsername) return; // a different user is logged in now -- this result no longer applies to anyone
    state.preseasonData = data || { picks: {} };
    state.preseasonPending = { ...state.preseasonData.picks }; // working copy, same as weekly tipping -- nothing saves until Confirm
    render();
  }

  // Toggles a team in/out of a slot's current selection. Winner slots
  // (count:1) behave like a radio -- picking a new team replaces the old
  // one. Multi-team slots (relegation/promotion) behave like a capped
  // multi-select -- picking toggles membership, up to the slot's count;
  // once full, picking a new team is a no-op until one is removed.
  function togglePreseasonPick(slotKey, team, odds, count){
    const current = state.preseasonPending[slotKey] || [];
    const already = current.some(p => p.team === team);
    let next;
    if(already){
      next = current.filter(p => p.team !== team);
    } else if(count === 1){
      next = [{ team, odds }];
    } else if(current.length < count){
      next = [...current, { team, odds }];
    } else {
      return; // slot is full -- remove one first
    }
    state.preseasonPending = { ...state.preseasonPending, [slotKey]: next };
    render();
  }

  async function confirmPreseasonPicks(){
    if(!state.user) return;
    state.preseasonData = { picks: { ...state.preseasonPending } };
    await sset(preseasonStorageKey(state.user.username), state.preseasonData);
    render();
  }


  async function loadTipsForRound(round){
    if(!state.user) return;
    state.tippingRound = round;
    const myUsername = state.user.username; // captured once -- state.user could change while the fetch below is in flight
    const data = await sget(tipStorageKey(myUsername, round));
    if(!state.user || state.user.username !== myUsername) return; // a different user is logged in now -- this result no longer applies to anyone
    state.tippingData = data || { round, picks: {} };
    state.tippingPending = { ...state.tippingData.picks }; // a working copy -- edits here don't touch the stored record until Confirm
    render();
  }

  // Purely local -- no persistence at all. Nothing is saved until the
  // punter explicitly hits Confirm, per direct instruction: a tip isn't
  // "real" just because a radio button was clicked.
  function setPendingTip(div, fixtureIdx, team, odds){
    if(!state.user || !state.tippingData) return;
    state.tippingPending = { ...state.tippingPending, [div+'|'+fixtureIdx]: { team, odds } };
    render();
  }

  const MR_MEDIAN_PICK_CAP = 12;
  // Check/uncheck, not a two-sided pick -- and capped at 12 across the
  // COMBINED tier (both conferences together, matching how "beat the
  // median" was scoped from the start), not 12 per conference.
  function toggleMrMedianPick(div, fixtureIdx, team, odds){
    if(!state.user || !state.tippingData) return;
    const key = div + '|' + fixtureIdx;
    if(state.tippingPending[key]){
      const next = { ...state.tippingPending };
      delete next[key];
      state.tippingPending = next;
      render();
      return;
    }
    const tierKey = (div === 'DIVISION 2A' || div === 'DIVISION 2B') ? 'DIV2' : 'DIV3';
    const tierDivs = MR_MEDIAN_TIERS[tierKey];
    const currentCount = Object.keys(state.tippingPending).filter(k => tierDivs.includes(k.split('|')[0])).length;
    if(currentCount >= MR_MEDIAN_PICK_CAP){
      alert(`You can only pick up to ${MR_MEDIAN_PICK_CAP} teams to beat the median.`);
      render(); // snaps the checkbox back to unchecked -- the browser already visually toggled it before this handler ran
      return;
    }
    state.tippingPending = { ...state.tippingPending, [key]: { team, odds } };
    render();
  }

  async function confirmTips(){
    if(!state.user || !state.tippingData) return;
    state.tippingData = { round: state.tippingData.round, picks: { ...state.tippingPending } };
    await sset(tipStorageKey(state.user.username, state.tippingRound), state.tippingData);
    render();
    if(state.tippingRound === state.currentRound) checkTipReminderStatus(); // async, fire-and-forget -- clears the flag right away rather than waiting for the next login
  }

  function divisionFixtureCount(div, round){
    return getTippableFixtures(div, round).length;
  }
  // Counts CONFIRMED (stored) tips specifically, not pending/unsaved
  // selections -- the "make a multi" option is meant to reflect what's
  // actually locked in, not a still-editable draft.
  function divisionTipsCompleted(div, round){
    if(!state.tippingData) return 0;
    const total = divisionFixtureCount(div, round);
    let done = 0;
    for(let i=0;i<total;i++){ if(state.tippingData.picks[div+'|'+i]) done++; }
    return done;
  }

  // Builds the real H2H|res-X|... pick ids for every CONFIRMED tip in a
  // completed division and adds them straight to the actual bet slip --
  // reusing the exact same pick format and findConflict/combinedOdds
  // machinery the rest of the platform already relies on, rather than a
  // parallel, tipping-specific slip implementation.
  // Status of a section's (possibly multi-division) tips against the
  // current round -- how many fixtures exist, how many are confirmed, and
  // what those confirmed tips' combined odds would be. Powers both the
  // "perfect round" multi display and the completion check for whether a
  // section is eligible to bet as a multi at all.
  function sectionTipsStatus(divs, round){
    let confirmedCount = 0, totalCount = 0, combinedOddsVal = 1;
    for(const div of divs){
      const fixtures = getTippableFixtures(div, round);
      totalCount += fixtures.length;
      for(let i=0;i<fixtures.length;i++){
        const pick = state.tippingData && state.tippingData.picks[div+'|'+i];
        if(pick){ confirmedCount++; combinedOddsVal *= pick.odds; }
      }
    }
    return { confirmedCount, totalCount, combinedOdds: combinedOddsVal, allConfirmed: totalCount > 0 && confirmedCount === totalCount };
  }

  // True only when every fixture in the section was confirmed, every one
  // of those results has actually come in, and every confirmed tip was
  // correct. An unresolved fixture means this can't be judged yet at all
  // (not that it's disqualifying) -- checked again later once more results
  // are in.
  // League sections qualify every week; FA Cup/ECL only during their
  // early-stage rounds specifically -- checked against whichever stage the
  // admin actually assigned to that round's fixtures, not assumed from the
  // round number alone (since cup rounds don't follow the league's fixed
  // weekly cadence).
  function perfectRoundEligible(sectionKey, round){
    if(sectionKey === 'ELIZA') return true;
    if(sectionKey === 'DIV2' || sectionKey === 'DIV3'){
      const section = TIPPING_SECTIONS.find(s => s.key === sectionKey);
      const inPlayoffs = section.divs.some(div => isPlayoffRound(div, round));
      return !inPlayoffs;
    }
    if(sectionKey === 'FACUP') return cupStageInList('FA CUP', round, FA_CUP_PERFECT_ROUND_STAGES);
    if(sectionKey === 'ECL') return cupStageInList('ECL', round, ECL_PERFECT_ROUND_STAGES);
    return false;
  }
  function cupStageInList(comp, round, eligibleStages){
    const fixtures = (state.cupFixtures[comp] || []).filter(f => f.round === round);
    if(!fixtures.length) return false;
    return eligibleStages.includes(fixtures[0].stage);
  }

  const MR_MEDIAN_PERFECT_WEEK_THRESHOLD = 12;
  async function checkPerfectSection(username, round, section){
    const data = await sget(tipStorageKey(username, round));
    if(!data || !data.picks) return false;
    let total = 0, resolvedAndCorrect = 0;
    for(const div of section.divs){
      const fixtures = getTippableFixtures(div, round);
      for(let i=0;i<fixtures.length;i++){
        const [teamA, teamB] = fixtures[i];
        const scoreA = REAL_RESULTS[teamA] && REAL_RESULTS[teamA][round-1];
        const scoreB = REAL_RESULTS[teamB] && REAL_RESULTS[teamB][round-1];
        // A draw is excluded entirely from the perfect-round tally --
        // doesn't lower the bar for a genuine "everything right" claim,
        // but doesn't block one either, regardless of what was picked.
        if(scoreA != null && scoreB != null && scoreA === scoreB) continue;
        total++;
        const pick = data.picks[div+'|'+i];
        if(!pick) continue; // not confirmed -- can't be a perfect round
        if(scoreA == null || scoreB == null) continue; // result not in yet
        const winner = scoreA > scoreB ? teamA : teamB;
        if(pick.team === winner) resolvedAndCorrect++;
      }
    }
    // Mr Median week: deliberately "pick 12 of the 24 available", not
    // "confirm everything" -- so perfect here means at least 12 correct,
    // not literally every one of the 24 teams tipped and right.
    if(section.divs.some(d => isMrMedianWeek(d, round))){
      return resolvedAndCorrect >= MR_MEDIAN_PERFECT_WEEK_THRESHOLD;
    }
    // Requires every fixture to be BOTH confirmed and correctly resolved --
    // any unconfirmed or unresolved fixture keeps resolvedAndCorrect below
    // total, whether that's because it's missing, still pending, or wrong.
    return total > 0 && resolvedAndCorrect === total;
  }

  // Fires the same perfect-round check used for the actual reward, but
  // purely for display -- caches a hit so the badge can show once and
  // stay put without re-checking every render, but never caches or shows
  // a miss. "Not shown yet" and "missed" are visually identical by
  // design, so there's no separate loading state to wire up either.
  async function loadPerfectRoundStatus(round, section){
    if(!state.user || state.user.isAdmin) return;
    if(!perfectRoundEligible(section.key, round)) return;
    const myUsername = state.user.username;
    const cacheKey = myUsername.toLowerCase() + '|' + round + '|' + section.key;
    if(state.perfectRoundStatus[cacheKey]) return; // already confirmed, nothing to redo
    const hit = await checkPerfectSection(myUsername, round, section);
    if(!state.user || state.user.username !== myUsername) return; // logged out/switched mid-check
    if(hit){
      state.perfectRoundStatus = { ...state.perfectRoundStatus, [cacheKey]: true };
      render();
    }
  }

  function tipRewardKey(username, round, sectionKey){
    return 'bilbbet2_tip_reward_' + username.toLowerCase() + '_' + seasonKeyPart() + '_R' + round + '_' + sectionKey;
  }

  // Idempotent and race-safe: the "already claimed" check and the balance
  // update both happen inside the same user lock, so two near-simultaneous
  // calls (e.g. two open tabs) can't both slip past the check and double-
  // award. Returns true only on the specific call that actually granted it,
  // so the caller knows whether to show a fresh celebration or stay quiet.
  async function awardPerfectSectionIfEligible(username, round, section){
    if(!perfectRoundEligible(section.key, round)) return false;
    const key = tipRewardKey(username, round, section.key);
    if(await sget(key)) return false; // cheap pre-check -- skips the heavier calculation for already-resolved rounds; the real safety guarantee is the re-check inside the lock below, not this
    const perfect = await checkPerfectSection(username, round, section); // read-only, safe outside the lock
    if(!perfect) return false;
    let awarded = false;
    await withUserLock(username, async () => {
      if(await sget(key)) return; // re-checked inside the lock -- closes the race between concurrent callers
      const fresh = await getUser(username);
      if(!fresh) return;
      fresh.balance += TIP_REWARD_AMOUNT;
      await saveUser(fresh);
      await logTransaction(username, 'TIP_REWARD', TIP_REWARD_AMOUNT, fresh.balance, `Perfect round \u2014 ${section.label} (Round ${round})`);
      await logGlobalWinner(username, 'Perfect round', TIP_REWARD_AMOUNT, section.label, round);
      await sset(key, true);
      awarded = true;
    });
    return awarded;
  }

  // Every fixture across every tippable competition for a round -- not
  // just one section. A weekly leaderboard ranking is only meaningful once
  // the WHOLE round is in; checking only one section (like the
  // perfect-round reward does) would let this fire while other results
  // are still pending, potentially crowning a "winner" whose lead later
  // evaporates once the rest of the round resolves.
  function isRoundFullyResolvedForTipping(round){
    const allDivs = TIPPING_SECTIONS.flatMap(s => s.divs);
    for(const div of allDivs){
      const fixtures = getTippableFixtures(div, round);
      for(const [teamA, teamB] of fixtures){
        const scoreA = REAL_RESULTS[teamA] && REAL_RESULTS[teamA][round-1];
        const scoreB = REAL_RESULTS[teamB] && REAL_RESULTS[teamB][round-1];
        if(scoreA == null || scoreB == null) return false;
      }
    }
    return true;
  }

  // Finds winners for one metric ('oddsPoints' or 'correct') among a set
  // of leaderboard entries, subject to a minimum correct-tip percentage so
  // a single lucky high-odds tip can't "win" despite a poor overall
  // record. Ties: everyone sharing the top qualifying score wins, not
  // just whoever sorts first. A top score of exactly 0 never counts as a
  // real win.
  function findMetricWinners(entries, metric, minCorrectPct){
    const qualifying = entries.filter(e => e.total > 0 && (e.correct / e.total) >= minCorrectPct);
    if(!qualifying.length) return [];
    const max = Math.max(...qualifying.map(e => e[metric]));
    if(max <= 0) return [];
    return qualifying.filter(e => e[metric] === max).map(e => e.username);
  }

  // Shared by every weekly/seasonal reward tier -- idempotent per
  // (tierKey, metric) so odds and points are independently, stackably
  // awarded, and a dead heat splits the stated amount rounded UP rather
  // than down (a 3-way tie for 10 clams pays 4 each, not 3.33 -- the
  // total paid out in a tie can exceed the headline amount by design).
  async function awardTierMetricIfEligible(username, tierKey, metric, winners, amount, reasonLabel){
    if(!winners.includes(username)) return null;
    const key = 'bilbbet2_tier_reward_' + username.toLowerCase() + '_' + tierKey + '_' + metric;
    if(await sget(key)) return null;
    const share = deadHeatSplit(amount, winners.length);
    let awarded = null;
    await withUserLock(username, async () => {
      if(await sget(key)) return; // re-checked inside the lock -- closes the race between concurrent callers
      const fresh = await getUser(username);
      if(!fresh) return;
      fresh.balance += share;
      await saveUser(fresh);
      const tieNote = winners.length > 1 ? ` (tied ${winners.length}-way, split rounded up)` : '';
      await logTransaction(username, 'TIER_REWARD', share, fresh.balance, `${reasonLabel}${tieNote}`);
      const category = tierKey.startsWith('SEASON') ? 'Seasonal leaderboard'
        : tierKey.startsWith('PRESEASON') ? 'Pre-season leaderboard' : 'Weekly leaderboard';
      await logGlobalWinner(username, category, share, `${reasonLabel}${tieNote}`);
      await sset(key, true);
      awarded = { amount: share, metric };
    });
    return awarded;
  }

  // Weekly, per-section prize (league sections only) -- checks both odds
  // and points independently for one already-fully-resolved round.
  async function awardWeeklySectionRewardsIfEligible(username, round, sectionKey){
    if(!WEEKLY_SECTION_REWARD_SECTIONS.includes(sectionKey)) return [];
    const section = TIPPING_SECTIONS.find(s => s.key === sectionKey);
    const totals = await computeTippingTotals(section.divs, round, round);
    const entries = Object.entries(totals).map(([u, t]) => ({ username: u, ...t })).filter(t => t.total > 0);
    const oddsWinners = findMetricWinners(entries, 'oddsPoints', WEEKLY_MIN_CORRECT_PCT);
    const correctWinners = findMetricWinners(entries, 'correct', WEEKLY_MIN_CORRECT_PCT);
    const tierKey = 'WKSEC_' + seasonKeyPart() + '_' + sectionKey + '_R' + round;
    const label = `Weekly ${sectionKey} leaderboard \u2014 Round ${round}`;
    const results = [];
    const oddsResult = await awardTierMetricIfEligible(username, tierKey, 'oddsPoints', oddsWinners, WEEKLY_SECTION_REWARD_AMOUNT, `${label} (odds)`);
    if(oddsResult) results.push(oddsResult);
    const correctResult = await awardTierMetricIfEligible(username, tierKey, 'correct', correctWinners, WEEKLY_SECTION_REWARD_AMOUNT, `${label} (points)`);
    if(correctResult) results.push(correctResult);
    return results;
  }

  // Weekly, ALL-competitions-combined prize -- same shape, different scope
  // and amount.
  async function awardWeeklyOverallRewardsIfEligible(username, round){
    const totals = await computeTippingTotals('ALL', round, round);
    const entries = Object.entries(totals).map(([u, t]) => ({ username: u, ...t })).filter(t => t.total > 0);
    const oddsWinners = findMetricWinners(entries, 'oddsPoints', WEEKLY_MIN_CORRECT_PCT);
    const correctWinners = findMetricWinners(entries, 'correct', WEEKLY_MIN_CORRECT_PCT);
    const tierKey = 'WKALL_' + seasonKeyPart() + '_R' + round;
    const label = `Weekly overall leaderboard \u2014 Round ${round}`;
    const results = [];
    const oddsResult = await awardTierMetricIfEligible(username, tierKey, 'oddsPoints', oddsWinners, WEEKLY_OVERALL_REWARD_AMOUNT, `${label} (odds)`);
    if(oddsResult) results.push(oddsResult);
    const correctResult = await awardTierMetricIfEligible(username, tierKey, 'correct', correctWinners, WEEKLY_OVERALL_REWARD_AMOUNT, `${label} (points)`);
    if(correctResult) results.push(correctResult);
    return results;
  }

  const SEASON_MAX_ROUND = 26;

  // Different qualifying basis than findMetricWinners: volume tipped (at
  // least X% of the season's available fixtures), not accuracy -- since
  // accuracy IS the value being ranked here, gating on it too would be
  // circular. Prevents one lucky early tip from "winning" the ratio
  // category over someone who tipped consistently all season.
  function findRatioWinners(entries, minTippedPct, totalPossible){
    if(totalPossible <= 0) return [];
    const qualifying = entries.filter(e => (e.total / totalPossible) >= minTippedPct);
    if(!qualifying.length) return [];
    const withRatio = qualifying.map(e => ({ username: e.username, ratio: e.total > 0 ? e.correct / e.total : 0 }));
    const max = Math.max(...withRatio.map(r => r.ratio));
    if(max <= 0) return [];
    return withRatio.filter(r => r.ratio === max).map(r => r.username);
  }
  function countSeasonFixtures(divs){
    let count = 0;
    for(const div of divs){
      for(let r=1; r<=SEASON_MAX_ROUND; r++){
        count += getTippableFixtures(div, r).length;
      }
    }
    return count;
  }

  // Seasonal, per-section prize -- league sections only, gated by the
  // admin's manual "season closed" flag for that section rather than any
  // automatic detection. No minimum-correct bar on odds/points (unlike
  // the weekly tier) since that wasn't specified for the seasonal prizes
  // -- only the ratio category has its own, separate 25%-tipped bar.
  async function awardSeasonalSectionRewardsIfEligible(username, sectionKey){
    if(!SEASONAL_SECTION_REWARD_SECTIONS.includes(sectionKey)) return [];
    if(!state.seasonClosed[sectionKey]) return [];
    const section = TIPPING_SECTIONS.find(s => s.key === sectionKey);
    const totals = await computeTippingTotals(section.divs, 1, SEASON_MAX_ROUND);
    const entries = Object.entries(totals).map(([u, t]) => ({ username: u, ...t })).filter(t => t.total > 0);
    const totalPossible = countSeasonFixtures(section.divs);
    const oddsWinners = findMetricWinners(entries, 'oddsPoints', 0);
    const correctWinners = findMetricWinners(entries, 'correct', 0);
    const ratioWinners = findRatioWinners(entries, SEASONAL_MIN_TIPPED_PCT, totalPossible);
    const tierKey = 'SEASON_' + seasonKeyPart() + '_' + sectionKey;
    const label = `Seasonal ${section.label} leaderboard`;
    const results = [];
    for(const [metric, winners, metricLabel] of [['oddsPoints', oddsWinners, 'odds'], ['correct', correctWinners, 'points'], ['ratio', ratioWinners, 'accuracy ratio']]){
      const result = await awardTierMetricIfEligible(username, tierKey, metric, winners, SEASONAL_SECTION_REWARD_AMOUNT, `${label} (${metricLabel})`);
      if(result) results.push(result);
    }
    return results;
  }

  // Seasonal, ALL-competitions-combined prize -- same shape, gated by the
  // separate "ALL" season-closed flag (the combined prize can reasonably
  // stay open even after individual league sections have been flagged
  // closed, e.g. while cup competitions are still running).
  async function awardSeasonalOverallRewardsIfEligible(username){
    if(!state.seasonClosed.ALL) return [];
    const totals = await computeTippingTotals('ALL', 1, SEASON_MAX_ROUND);
    const entries = Object.entries(totals).map(([u, t]) => ({ username: u, ...t })).filter(t => t.total > 0);
    const totalPossible = countSeasonFixtures(TIPPING_DIVS);
    const oddsWinners = findMetricWinners(entries, 'oddsPoints', 0);
    const correctWinners = findMetricWinners(entries, 'correct', 0);
    const ratioWinners = findRatioWinners(entries, SEASONAL_MIN_TIPPED_PCT, totalPossible);
    const tierKey = 'SEASON_' + seasonKeyPart() + '_ALL';
    const label = 'Seasonal overall leaderboard';
    const results = [];
    for(const [metric, winners, metricLabel] of [['oddsPoints', oddsWinners, 'odds'], ['correct', correctWinners, 'points'], ['ratio', ratioWinners, 'accuracy ratio']]){
      const result = await awardTierMetricIfEligible(username, tierKey, metric, winners, SEASONAL_OVERALL_REWARD_AMOUNT, `${label} (${metricLabel})`);
      if(result) results.push(result);
    }
    return results;
  }

  // Sweeps every past, completed round's qualifying sections for the
  // logged-in user -- not just the current round. The current round alone
  // is an unreliable trigger: the moment a section's results are actually
  // fully in is typically also when the admin advances to the next round,
  // which immediately switches the tipping tab away from viewing it (there's
  // no way to browse a past round here). Checking the whole history instead
  // means the reward reliably lands eventually, on whichever visit first
  // catches a round with results in. Safe to re-run every visit: the
  // idempotency key makes already-resolved rounds a single cheap read each.
  // Opt-in only, and only meaningful while the current round can still be
  // tipped -- once it's locked there's nothing left to submit, so nagging
  // about it would just be noise. Checks for ANY confirmed tip anywhere
  // this round, not per-section, since the flag itself is a general
  // "you haven't tipped yet" reminder, not scoped to one competition.
  // Unlike checkTipReminderStatus, this is never gated by the opt-in
  // reminder preference -- it's about surfacing that tipping and
  // pre-season predictions EXIST at all to someone who might not have
  // found the tab yet, not a nag for people who already know.
  async function checkHomeTippingNudge(){
    if(!state.user){ state.homeTippingNudge = { showWeekly: false, showPreseason: false }; return; }
    const myUsername = state.user.username; // captured once -- the session could change while the awaits below are in flight
    const round = state.currentRound;
    let showWeekly = false, showPreseason = false;
    if(!isRoundBlocked(round)){
      const anyFixturesThisRound = TIPPING_DIVS.some(d => divisionFixtureCount(d, round) > 0);
      if(anyFixturesThisRound){
        const data = await sget(tipStorageKey(myUsername, round));
        if(!state.user || state.user.username !== myUsername) return; // a different user is logged in by now
        showWeekly = !(data && data.picks && Object.keys(data.picks).length > 0);
      }
    }
    if(!isRoundBlocked(1)){
      const data2 = await sget(preseasonStorageKey(myUsername));
      if(!state.user || state.user.username !== myUsername) return;
      showPreseason = !(data2 && data2.picks && Object.keys(data2.picks).length > 0);
    }
    state.homeTippingNudge = { showWeekly, showPreseason };
    render();
  }
  // Personal, time-sensitive summary for the top of Home -- the countdown
  // piece only shows when the listed kickoff date is genuinely still in
  // the future (real dates from round_dates.json, not fabricated), since
  // a negative/past countdown would look broken rather than informative.
  function renderHomeDigest(){
    if(!state.user) return '';
    if(state.myBets === null){
      loadMyBets(); // reuses the exact same cache My Bets itself populates
      return '';
    }
    const pending = state.myBets.filter(b => b.status === 'PENDING');
    const resolved = state.myBets.filter(b => b.status === 'WON' || b.status === 'LOST').sort((a,b) => b.timestamp - a.timestamp);
    const mostRecent = resolved[0];

    let roundPiece = '';
    if(!isRoundBlocked(state.currentRound)){
      const kickoffStr = ROUND_DATES[String(state.currentRound)];
      if(kickoffStr){
        const daysLeft = Math.ceil((new Date(kickoffStr + 'T00:00:00Z').getTime() - Date.now()) / (1000*60*60*24));
        if(daysLeft > 0){
          roundPiece = `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;">
              <span style="font-size:16px;">\u{1F4C5}</span>
              <span style="font-size:13px;">Round ${state.currentRound} kicks off in ${daysLeft} day${daysLeft!==1?'s':''}</span>
            </div>`;
        }
      }
    }

    const pendingTotal = pending.reduce((s,b) => s + b.potentialReturn, 0);
    const pendingPiece = pending.length
      ? `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;">
          <span style="font-size:16px;">\u23F3</span>
          <span style="font-size:13px;">${pending.length} pending bet${pending.length!==1?'s':''} \u2014 <span style="color:#ffdd00;font-weight:600;">${fmt(pendingTotal)}</span> potential return</span>
        </div>` : '';

    const recentPiece = mostRecent
      ? `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;">
          <span style="font-size:16px;">${mostRecent.status==='WON'?'\u2705':'\u274C'}</span>
          <span style="font-size:13px;">Your last bet ${mostRecent.status==='WON'?'won':'lost'}${mostRecent.status==='WON'?` \u2014 <span style="color:#ffdd00;font-weight:600;">${fmt(mostRecent.potentialReturn)}</span>`:''}</span>
        </div>` : '';

    const pieces = [roundPiece, pendingPiece, recentPiece].filter(Boolean);
    if(!pieces.length) return '';
    // Borders between pieces only, not after the last one
    const withBorders = pieces.map((p,i) => i<pieces.length-1 ? p.replace('padding:8px 0;', 'padding:8px 0;border-bottom:1px solid #333333;') : p);
    return `<div class="bb-card" style="margin-bottom:16px;">${withBorders.join('')}</div>`;
  }

  function renderTippingNudgeCard(){
    if(!state.user) return '';
    if(state.homeTippingNudge === null){
      checkHomeTippingNudge(); // async, fire-and-forget -- card appears on its own re-render once resolved
      return '';
    }
    const n = state.homeTippingNudge;
    if(!n.showWeekly && !n.showPreseason) return '';
    const msg = n.showWeekly && n.showPreseason
      ? "Get your weekly tips and pre-season predictions in \u2014 free to play, just for bragging rights."
      : n.showWeekly
        ? "Haven't tipped this week's fixtures yet? Takes a minute, free to play."
        : "Pre-season predictions are still open \u2014 get your picks in before Round 1 kicks off.";
    return `<div class="bb-card" data-tab="TIPPING" style="margin-bottom:16px;cursor:pointer;display:flex;align-items:center;gap:10px;">
        <span style="font-size:20px;">\u{1F3AF}</span>
        <div><div style="font-weight:600;font-size:13px;">${esc(msg)}</div><div style="font-size:11px;color:#9a9a9a;margin-top:2px;">Tap to open Tipping \u2192</div></div>
      </div>`;
  }

  async function checkTipReminderStatus(){
    if(!state.user){ state.tipReminderStatus = false; return; }
    if(!state.user.tipReminderEnabled){ state.tipReminderStatus = false; return; }
    const myUsername = state.user.username; // captured once -- the session could change while the sget below is in flight
    const round = state.currentRound;
    if(isRoundBlocked(round)){ state.tipReminderStatus = false; return; }
    const anyFixturesThisRound = TIPPING_DIVS.some(d => divisionFixtureCount(d, round) > 0);
    if(!anyFixturesThisRound){ state.tipReminderStatus = false; return; }
    const data = await sget(tipStorageKey(myUsername, round));
    if(!state.user || state.user.username !== myUsername) return; // a different user is logged in by now -- this result no longer applies to anyone
    const hasAnyConfirmedTip = !!(data && data.picks && Object.keys(data.picks).length > 0);
    state.tipReminderStatus = !hasAnyConfirmedTip;
    render();
  }

  async function checkAndCelebrateReward(){
    if(!state.user || state.user.isAdmin) return; // admin balance isn't a competitive punter balance -- never eligible for any tipping reward
    const myUsername = state.user.username; // captured once -- re-reading state.user.username after each await below would silently track whoever's logged in BY THEN, not who this sweep was actually started for
    const lastPlayed = state.currentRound - 1;
    const checkKey = myUsername.toLowerCase() + '|' + lastPlayed;
    if(state.tippingRewardChecked === checkKey) return; // already swept up through this many completed rounds this session
    state.tippingRewardChecked = checkKey;
    let totalWon = 0;
    const pickResults = await awardPreseasonPickRewardsIfEligible(myUsername);
    totalWon += pickResults.reduce((s, x) => s + x.amount, 0);
    const preseasonLbResults = await awardPreseasonLeaderboardRewardsIfEligible(myUsername);
    totalWon += preseasonLbResults.reduce((s, x) => s + x.amount, 0);
    if(lastPlayed >= 1){
    for(let r = lastPlayed; r >= 1; r--){
      for(const section of TIPPING_SECTIONS){
        const awarded = await awardPerfectSectionIfEligible(myUsername, r, section);
        if(awarded) totalWon += TIP_REWARD_AMOUNT;
      }
      if(isRoundFullyResolvedForTipping(r)){
        for(const sectionKey of WEEKLY_SECTION_REWARD_SECTIONS){
          const results = await awardWeeklySectionRewardsIfEligible(myUsername, r, sectionKey);
          totalWon += results.reduce((s, x) => s + x.amount, 0);
        }
        const overallResults = await awardWeeklyOverallRewardsIfEligible(myUsername, r);
        totalWon += overallResults.reduce((s, x) => s + x.amount, 0);
      }
    }
    }
    for(const sectionKey of SEASONAL_SECTION_REWARD_SECTIONS){
      const results = await awardSeasonalSectionRewardsIfEligible(myUsername, sectionKey);
      totalWon += results.reduce((s, x) => s + x.amount, 0);
    }
    const seasonalOverallResults = await awardSeasonalOverallRewardsIfEligible(myUsername);
    totalWon += seasonalOverallResults.reduce((s, x) => s + x.amount, 0);
    if(totalWon > 0 && state.user && state.user.username === myUsername){ // only touch the live session if it's still the same user who earned this
      const fresh = await getUser(myUsername);
      if(fresh && state.user && state.user.username === myUsername) state.user = fresh; // re-checked after the second await too, for the same reason
      state.tippingRewardBanner = `\u{1F389} You earned ${totalWon} clams from tipping rewards! Check the Prizes tab for the full breakdown.`;
      render();
    }
  }

  // Builds the real H2H|res-X|... pick ids for every CONFIRMED tip across
  // the given division(s) and adds them straight to the actual bet slip --
  // reusing the exact same pick format and findConflict/combinedOdds
  // machinery the rest of the platform already relies on, rather than a
  // parallel, tipping-specific slip implementation. divs is always an
  // array so the same function covers a single-division section (Eliza,
  // ECL, FA Cup) and a combined one (Div 2 A+B, Div 3 A+B) identically --
  // and, for the "entire field" option, every section at once.
  function makeMultiFromTips(divs, stake){
    if(!state.user || !state.tippingData) return; // defensive -- shouldn't be reachable via the UI (the button only renders once tips are confirmed, which itself requires login), but don't crash or silently proceed if it somehow is
    const round = state.tippingRound;
    stake = stake || 10;
    let added = 0, skipped = 0;
    for(const div of divs){
      const fixtures = getTippableFixtures(div, round);
      for(let i=0;i<fixtures.length;i++){
        const pick = state.tippingData.picks[div+'|'+i];
        if(!pick) continue;
        const [teamA, teamB] = fixtures[i];
        if(teamB === 'MR MEDIAN'){ skipped++; continue; } // tipping-only mechanic, not a real fixture -- never becomes a real bet
        const side = pick.team === teamA ? 'a' : 'b';
        const id = 'H2H|res-'+side+'|R'+round+'|'+teamA+'|'+teamB;
        if(state.slip.some(s=>s.id===id)){ skipped++; continue; }
        const conflict = findConflict(id);
        if(conflict){ skipped++; continue; } // e.g. the self-interest guard, if a punter tipped their own team's opponent
        state.slip.push({ id, label: pick.team, odds: pick.odds, singleStake: stake });
        added++;
      }
    }
    render();
    alert(added + ' pick' + (added!==1?'s':'') + ' added to your bet slip at a ' + stake + '-clam stake' + (skipped ? ` (${skipped} skipped -- already in your slip or not currently allowed)` : '') + '. Adjust the stake and place it like any other bet, or clear it if you were just curious.');
  }

  // Computed fresh each time the leaderboard is viewed rather than kept as
  // a running total on the user record -- tip resolution is purely
  // mechanical (compare a tip to the actual result, no judgement calls the
  // way a void or a disputed bet might need), so there's no real benefit
  // to a separate "resolve" step an admin could forget to run.
  //
  // div: a specific division name, or 'ALL' to combine every competition.
  // mode: 'WEEKLY' scores only the exact round given; 'OVERALL' accumulates
  // every round from 1 through the round given.
  // Once a round locks, every tipster's picks for it become visible --
  // fetched fresh each time (same reasoning as the leaderboard: nothing
  // to resolve, just read what's already stored). divs scopes this to the
  // currently-viewed section so the table stays a manageable width.
  async function loadAllTipstersForRound(round, divs, sectionKey){
    const usernames = await getIndex('bilbbet2_users_index');
    const allUsers = (await Promise.all(usernames.map(getUser))).filter(Boolean);
    const users = allUsers.filter(u => !u.isAdmin);
    const rows = [];
    for(const u of users){
      const data = await sget(tipStorageKey(u.username, round));
      if(!data || !data.picks) continue;
      const picks = Object.keys(data.picks)
        .filter(k => divs.includes(k.split('|')[0]))
        .sort((a,b) => {
          const [divA, idxA] = a.split('|'), [divB, idxB] = b.split('|');
          return divA === divB ? (idxA - idxB) : divA.localeCompare(divB);
        })
        .map(k => data.picks[k]);
      if(picks.length) rows.push({ username: u.username, picks });
    }
    state.tippingAllPicks = { round, sectionKey, rows };
    render();
  }

  function renderAllTipstersTable(round, section){
    if(!state.tippingAllPicks || state.tippingAllPicks.round !== round || state.tippingAllPicks.sectionKey !== section.key){
      loadAllTipstersForRound(round, section.divs, section.key); // async -- fires off the fetch, current render shows a brief loading state
      return `<div class="bb-card" style="margin-top:1rem;"><p style="color:#9a9a9a;">Loading everyone's tips&hellip;</p></div>`;
    }
    const rows = state.tippingAllPicks.rows;
    if(!rows.length){
      return `<div class="bb-card" style="margin-top:1rem;"><p style="color:#9a9a9a;">Nobody tipped ${esc(section.label)} this round.</p></div>`;
    }
    return `<div class="bb-card" style="margin-top:1rem;">
        <strong style="font-size:13px;">Everyone's tips \u2014 ${esc(section.label)}</strong>
        <div style="margin-top:8px;">
          ${rows.map(r => `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #333333;flex-wrap:wrap;">
              <span style="font-size:12px;width:110px;flex-shrink:0;">${esc(r.username)}</span>
              <span style="display:flex;gap:6px;flex-wrap:wrap;">${r.picks.map(p => `<span title="${esc(p.team)}">${teamLogo(p.team,22)}</span>`).join('')}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }

  // Only scores a slot once it's FULLY resolved (the admin has recorded
  // every one of that slot's expected results) -- a partially-recorded
  // relegation/promotion slot would otherwise unfairly mark a punter's
  // still-undetermined picks as wrong just because they haven't been
  // confirmed yet, rather than genuinely known to be incorrect.
  // Pure computation, no side effects -- shared by the UI leaderboard and
  // the reward functions below, same reasoning as computeTippingTotals.
  async function computePreseasonTotals(){
    if(state.preseasonResults === null){ state.preseasonResults = (await sget(PRESEASON_RESULTS_KEY)) || {}; }
    const usernames = await getIndex('bilbbet2_users_index');
    const allUsers = (await Promise.all(usernames.map(getUser))).filter(Boolean);
    const users = allUsers.filter(u => !u.isAdmin);
    const totals = {};
    for(const u of users){ totals[u.username] = { correct:0, total:0, oddsPoints:0, submitted:0 }; }
    for(const u of users){
      const data = await sget(preseasonStorageKey(u.username));
      if(!data || !data.picks) continue;
      for(const slot of PRESEASON_SLOTS){
        const userPicks = data.picks[slot.key] || [];
        if(!userPicks.length) continue;
        // Counted the moment a pick is submitted -- shows who's actually
        // joined the competition before anything can possibly resolve
        // (pre-season slots like "wins the division" only resolve once
        // the season's basically over), separate from the graded stats
        // below, which still only count once the real outcome is known.
        totals[u.username].submitted += userPicks.length;
        const actual = state.preseasonResults[slot.key];
        if(!actual || actual.length < slot.count) continue; // not fully resolved yet
        for(const pick of userPicks){
          totals[u.username].total++;
          if(actual.includes(pick.team)){
            totals[u.username].correct++;
            totals[u.username].oddsPoints += pick.odds;
          }
        }
      }
    }
    return totals;
  }

  const PRESEASON_PICK_REWARD_AMOUNT = 50;
  const PRESEASON_LEADERBOARD_REWARD_AMOUNT = 1000;

  // 50 clams for EACH individually correct pre-season pick -- not a
  // leaderboard placement, so several correct predictions across several
  // slots all pay independently (e.g. a correct division winner pick AND
  // a correct relegation pick both pay, separately). Only pays once a
  // slot is fully resolved, same gate the pre-season scoring itself
  // already uses, and idempotent per (username, slot, team) so one
  // specific correct pick can never be paid twice.
  async function awardPreseasonPickRewardsIfEligible(username){
    if(state.preseasonResults === null){ state.preseasonResults = (await sget(PRESEASON_RESULTS_KEY)) || {}; }
    const data = await sget(preseasonStorageKey(username));
    if(!data || !data.picks) return [];
    const results = [];
    for(const slot of PRESEASON_SLOTS){
      const userPicks = data.picks[slot.key] || [];
      if(!userPicks.length) continue;
      const actual = state.preseasonResults[slot.key];
      if(!actual || actual.length < slot.count) continue; // not fully resolved yet
      for(const pick of userPicks){
        if(!actual.includes(pick.team)) continue; // wrong pick -- no reward
        const key = 'bilbbet2_preseason_pick_reward_' + username.toLowerCase() + '_' + seasonKeyPart() + '_' + slot.key + '_' + pick.team;
        if(await sget(key)) continue; // already paid for this specific correct pick
        let awarded = false;
        await withUserLock(username, async () => {
          if(await sget(key)) return; // re-checked inside the lock
          const fresh = await getUser(username);
          if(!fresh) return;
          fresh.balance += PRESEASON_PICK_REWARD_AMOUNT;
          await saveUser(fresh);
          await logTransaction(username, 'PRESEASON_PICK_REWARD', PRESEASON_PICK_REWARD_AMOUNT, fresh.balance, `Correct pre-season pick \u2014 ${slot.label}: ${pick.team}`);
          await logGlobalWinner(username, 'Pre-season pick', PRESEASON_PICK_REWARD_AMOUNT, `${slot.label}: ${pick.team}`);
          await sset(key, true);
          awarded = true;
        });
        if(awarded) results.push({ amount: PRESEASON_PICK_REWARD_AMOUNT, slot: slot.key, team: pick.team });
      }
    }
    return results;
  }

  // The overall pre-season prizes only mean anything once every single
  // slot is known -- a partial pre-season leaderboard could still swing
  // wildly once, say, the FA Cup or ECL winner is finally decided months
  // later. Same reasoning as gating weekly/seasonal tipping rewards on
  // full resolution.
  function arePreseasonResultsFullyResolved(){
    if(!state.preseasonResults) return false;
    return PRESEASON_SLOTS.every(slot => {
      const actual = state.preseasonResults[slot.key];
      return actual && actual.length >= slot.count;
    });
  }
  async function awardPreseasonLeaderboardRewardsIfEligible(username){
    if(state.preseasonResults === null){ state.preseasonResults = (await sget(PRESEASON_RESULTS_KEY)) || {}; }
    if(!arePreseasonResultsFullyResolved()) return [];
    const totals = await computePreseasonTotals();
    const entries = Object.entries(totals).map(([u,t]) => ({ username: u, ...t })).filter(t => t.total > 0);
    const oddsWinners = findMetricWinners(entries, 'oddsPoints', 0);
    const correctWinners = findMetricWinners(entries, 'correct', 0);
    const tierKey = 'PRESEASON_' + seasonKeyPart() + '_LB';
    const results = [];
    const oddsResult = await awardTierMetricIfEligible(username, tierKey, 'oddsPoints', oddsWinners, PRESEASON_LEADERBOARD_REWARD_AMOUNT, 'Pre-season leaderboard (odds)');
    if(oddsResult) results.push(oddsResult);
    const correctResult = await awardTierMetricIfEligible(username, tierKey, 'correct', correctWinners, PRESEASON_LEADERBOARD_REWARD_AMOUNT, 'Pre-season leaderboard (points)');
    if(correctResult) results.push(correctResult);
    return results;
  }

  async function computePreseasonLeaderboard(){
    const totals = await computePreseasonTotals();
    state.preseasonLeaderboard = Object.entries(totals)
      .map(([username,t]) => ({ username, ...t }))
      .filter(t => t.submitted > 0); // shows participation immediately -- t.total
                                       // only becomes nonzero once a slot actually
                                       // resolves, which pre-season it never does
    render();
  }
  function renderPreseasonLeaderboard(){
    if(state.preseasonLeaderboard === null){
      computePreseasonLeaderboard(); // async -- fires off the computation, current render shows a loading state
      return '<p style="color:var(--bb-text-muted);">Crunching the pre-season leaderboard&hellip;</p>';
    }
    if(!state.preseasonLeaderboard.length){
      return '<p style="color:var(--bb-text-muted);">No pre-season picks submitted yet \u2014 be the first to join.</p>';
    }
    return renderSortableLeaderboardTable(
      state.preseasonLeaderboard, state.preseasonLeaderboardSortBy, state.preseasonLeaderboardSortDir,
      state.user && !state.user.isAdmin ? state.user.username : null,
      'Pre-season',
      helpTip('oddspoints', 'Each correct pick scores what a 1-clam bet on that pick would have paid, based on its odds at the time. Rows show up here as soon as picks are submitted \u2014 odds/correct/% stay blank until a slot actually resolves, which for most pre-season picks is well into the season.')
    );
  }

  // Pure computation, no side effects -- shared by the UI leaderboard and
  // the weekly-reward check below, so both always agree on exactly the
  // same numbers rather than risk two scoring implementations drifting
  // apart over time.
  async function computeTippingTotals(div, fromRound, throughRound){
    const usernames = await getIndex('bilbbet2_users_index');
    const allUsers = (await Promise.all(usernames.map(getUser))).filter(Boolean);
    const users = allUsers.filter(u => !u.isAdmin);
    const totals = {}; // username -> {correct, total, oddsPoints}
    for(const u of users){ totals[u.username] = { correct:0, total:0, oddsPoints:0 }; }
    for(const u of users){
      for(let r=fromRound; r<=throughRound; r++){
        const data = await sget(tipStorageKey(u.username, r));
        if(!data || !data.picks) continue;
        for(const key in data.picks){
          const [pickDiv, idxStr] = key.split('|');
          const divList = div === 'ALL' ? null : (Array.isArray(div) ? div : [div]);
          if(divList && !divList.includes(pickDiv)) continue;
          const idx = parseInt(idxStr, 10);
          // getTippableFixtures, not a direct H2H_SCHEDULE lookup -- the
          // latter only covers league divisions, silently never matching
          // ECL/FA Cup picks at all (they're stored separately in
          // state.cupFixtures), which meant cup tips were never scored
          // here despite being fully valid, confirmed tips.
          const fixtures = getTippableFixtures(pickDiv, r);
          if(!fixtures[idx]) continue;
          const [teamA, teamB] = fixtures[idx];
          const scoreA = REAL_RESULTS[teamA] && REAL_RESULTS[teamA][r-1];
          const scoreB = REAL_RESULTS[teamB] && REAL_RESULTS[teamB][r-1];
          if(scoreA == null || scoreB == null) continue; // result not in yet
          const pick = data.picks[key];
          totals[u.username].total++;
          if(scoreA === scoreB){
            // Draw -- neither side was wrong, so half credit either way:
            // half the pick's own odds as points, and half a correct tip
            // toward the tally, regardless of which side was picked.
            totals[u.username].correct += 0.5;
            totals[u.username].oddsPoints += pick.odds / 2;
          } else {
            const actualWinner = scoreA > scoreB ? teamA : teamB;
            if(pick.team === actualWinner){
              totals[u.username].correct++;
              totals[u.username].oddsPoints += pick.odds;
            }
          }
        }
      }
    }
    return totals;
  }
  // Whether each punter has already submitted picks for the NEXT round
  // (state.currentRound -- the round currently open for tipping, one
  // ahead of whatever round the leaderboard itself is showing results
  // for) -- scoped to just this section's divisions, since submitting
  // Div 2 picks doesn't mean anything about whether someone's engaged
  // with Div 3 this week. Weekly-only by design -- pre-season picks are
  // a single, one-time submission with no "upcoming round" concept.
  async function computeUpcomingSubmissionStatus(div){
    const usernames = await getIndex('bilbbet2_users_index');
    const allUsers = (await Promise.all(usernames.map(getUser))).filter(Boolean);
    const users = allUsers.filter(u => !u.isAdmin);
    const upcomingRound = state.currentRound;
    const divList = div === 'ALL' ? null : (Array.isArray(div) ? div : [div]);
    const status = {};
    for(const u of users){
      const data = await sget(tipStorageKey(u.username, upcomingRound));
      const picks = (data && data.picks) || {};
      status[u.username] = Object.keys(picks).some(key => {
        const [pickDiv] = key.split('|');
        return !divList || divList.includes(pickDiv);
      });
    }
    return status;
  }

  async function computeTippingLeaderboard(div, mode, throughRound){
    const fromRound = mode === 'WEEKLY' ? throughRound : 1;
    const [totals, upcoming] = await Promise.all([
      computeTippingTotals(div, fromRound, throughRound),
      computeUpcomingSubmissionStatus(div),
    ]);
    state.tippingLeaderboard = Object.entries(totals)
      .map(([username, t]) => ({ username, ...t, submittedUpcoming: !!upcoming[username] }))
      .filter(t => t.total > 0);
    render();
  }

  async function attachHandlers(){
    const $ = sel => document.querySelector(sel);
    // The slip is position:fixed at the bottom, so its height is entirely
    // outside normal document flow -- without this, a tall slip (many
    // selections, singles mode, the boost-toggle row all showing at once)
    // silently overlaps the end of the page underneath it, both visually
    // and for click purposes, since a fixed element still intercepts
    // clicks to whatever's beneath it regardless of how it looks. The
    // selections list itself already caps its own height with internal
    // scrolling, so this only needs to measure the slip's total rendered
    // height once per render, not guard against unbounded growth.
    const pageContent = document.getElementById('bb-page-content');
    const slipEl = document.querySelector('.bb-slip');
    if(pageContent){
      pageContent.style.paddingBottom = slipEl ? (slipEl.offsetHeight + 16) + 'px' : '';
    }
    // Generic wiring for every teamSearchInput instance on the current
    // page -- filtering happens via direct style.display toggling on the
    // option elements, not a re-render, so typing never loses focus or
    // cursor position mid-keystroke.
    document.querySelectorAll('[data-team-dropdown]').forEach(input => {
      const dropdown = document.getElementById(input.dataset.teamDropdown);
      if(!dropdown) return;
      const options = dropdown.querySelectorAll('[data-team-option]');
      const filterOptions = () => {
        const q = input.value.trim().toLowerCase();
        options.forEach(opt => {
          opt.style.display = (!q || opt.dataset.teamOption.toLowerCase().includes(q)) ? 'block' : 'none';
        });
      };
      input.addEventListener('focus', () => { filterOptions(); dropdown.style.display = 'block'; });
      input.addEventListener('input', () => { filterOptions(); dropdown.style.display = 'block'; });
      options.forEach(opt => {
        // mousedown, not click -- on mobile Safari specifically, tapping a
        // non-input element while a different input still has focus can
        // fire a blur/keyboard-dismiss on that input BEFORE the click ever
        // registers on the actual target, silently eating the first tap
        // entirely (the second tap then works normally, since focus has
        // already moved off). mousedown fires earlier in that sequence,
        // before the blur-driven swallow happens, so it isn't affected.
        opt.onmousedown = e => {
          e.preventDefault(); // also stops the input's blur from stealing this interaction
          input.value = opt.dataset.teamOption;
          dropdown.style.display = 'none';
          input.dispatchEvent(new Event('change', { bubbles: true })); // reuses each call site's own existing onchange handler unmodified
        };
      });
    });
    // Bound once ever, not on every render -- document/window persist
    // across renders (only the inner DOM gets replaced), so a fresh
    // listener each time would silently accumulate duplicates.
    if(!window.__teamDropdownOutsideClickBound){
      window.__teamDropdownOutsideClickBound = true;
      document.addEventListener('click', (e) => {
        document.querySelectorAll('.bb-team-dropdown').forEach(dd => {
          const ownerInput = document.getElementById(dd.id.replace(/-dropdown$/, ''));
          if(e.target !== ownerInput && !dd.contains(e.target)) dd.style.display = 'none';
        });
      });
    }
    document.querySelectorAll('[data-helptip]').forEach(el => el.onclick = e => {
      e.stopPropagation();
      state.openHelpTip = state.openHelpTip === el.dataset.helptip ? null : el.dataset.helptip;
      render();
    });
    if(!window.__helpTipOutsideClickBound){
      window.__helpTipOutsideClickBound = true;
      document.addEventListener('click', (e) => {
        const onToggle = e.target.dataset && e.target.dataset.helptip;
        const onPanel = e.target.closest && e.target.closest('[data-helptip-panel]');
        if(state.openHelpTip && !onToggle && !onPanel){
          state.openHelpTip = null;
          render();
        }
      });
    }
    const fUser = $('#f-user');
    if(fUser){
      fUser.oninput = e => { state.username = e.target.value; state.adminLoginMode = false; };
      fUser.onchange = e => { state.username = matchTeamName(e.target.value); state.adminLoginMode = false; render(); };
    }
    const fUserCustom = $('#f-user-custom');
    if(fUserCustom){
      // Deliberately no team-matching here -- this input exists specifically
      // for someone whose name ISN'T a real Eliza Cup team, so snapping it
      // to one would defeat the point.
      fUserCustom.oninput = e => { state.username = e.target.value; };
    }
    const toggleCustomName = $('#toggle-custom-name');
    if(toggleCustomName) toggleCustomName.onclick = () => { state.customNameMode = !state.customNameMode; state.username = ''; state.error=''; render(); };
    const fPin = $('#f-pin'); if(fPin) fPin.oninput = e => { state.pin = e.target.value; };
    const loginForm = $('#login-form'); if(loginForm) loginForm.onsubmit = e => { e.preventDefault(); doLogin(); };
    const registerBtn = $('#register-submit');
    if(registerBtn) registerBtn.onclick = () => { state.registeringMode = true; state.error=''; render(); };
    const backFromRegisterBtn = $('#back-from-register');
    if(backFromRegisterBtn) backFromRegisterBtn.onclick = () => { state.registeringMode = false; state.customNameMode = false; state.tosAgreed = false; state.tipReminderOptIn = true; state.error=''; render(); };
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

    const openTutorialBtn = $('#open-tutorial-btn');
    if(openTutorialBtn) openTutorialBtn.onclick = () => { state.tutorialStep = 0; state.info=''; state.tutorialModalOpen = true; render(); };
    const openContactUsBtn = $('#open-contact-us-btn');
    if(openContactUsBtn) openContactUsBtn.onclick = () => { state.feedbackCategory = ''; state.feedbackOtherText = ''; state.feedbackSubmitted = false; state.contactUsModalOpen = true; render(); };
    const closeContactUsX = $('#close-contact-us-modal-x');
    if(closeContactUsX) closeContactUsX.onclick = () => { state.contactUsModalOpen = false; render(); };
    const closeContactUsModal = $('#close-contact-us-modal');
    if(closeContactUsModal) closeContactUsModal.onclick = () => { state.contactUsModalOpen = false; render(); };
    const feedbackSelect = $('#feedback-category-select');
    if(feedbackSelect) feedbackSelect.onchange = e => { state.feedbackCategory = e.target.value; render(); };
    const feedbackOtherText = $('#feedback-other-text');
    if(feedbackOtherText) feedbackOtherText.oninput = e => { state.feedbackOtherText = e.target.value; };
    const submitFeedbackBtn = $('#submit-feedback-btn');
    if(submitFeedbackBtn) submitFeedbackBtn.onclick = async () => {
      const isOther = state.feedbackCategory === 'OTHER';
      if(!state.feedbackCategory){ alert('Choose a complaint first.'); return; }
      if(isOther && !state.feedbackOtherText.trim()){ alert('Go on, tell us something.'); return; }
      const category = isOther ? 'Other' : state.feedbackCategory;
      const comment = isOther ? state.feedbackOtherText.trim() : null;
      await submitFeedback(state.user ? state.user.username : null, category, comment);
      state.feedbackSubmitted = true;
      render();
    };
    document.querySelectorAll('[data-delete-feedback]').forEach(el => el.onclick = () => deleteFeedback(el.dataset.deleteFeedback));
    const closeTutorialX = $('#close-tutorial-modal-x');
    if(closeTutorialX) closeTutorialX.onclick = () => { state.tutorialModalOpen = false; state.info=''; render(); };
    const tutorialDone = $('#tutorial-done');
    if(tutorialDone) tutorialDone.onclick = () => { state.tutorialModalOpen = false; state.info=''; render(); };
    const tutorialNext = $('#tutorial-next');
    if(tutorialNext) tutorialNext.onclick = () => { state.tutorialStep++; render(); };
    const tutorialBack = $('#tutorial-back');
    if(tutorialBack) tutorialBack.onclick = () => { state.tutorialStep--; render(); };

    const closeWelcomeBtn = $('#close-welcome-modal');
    if(closeWelcomeBtn) closeWelcomeBtn.onclick = () => { state.welcomeModalOpen = false; render(); };

    const closeFormX = $('#close-form-modal-x');
    if(closeFormX) closeFormX.onclick = () => { state.formModalOpen = false; state.formModalTeam = null; render(); };
    document.querySelectorAll('[data-show-form]').forEach(el => el.onclick = (e) => {
      e.stopPropagation(); // team names sit inside clickable rows/buttons elsewhere -- this opens the form popup without also triggering whatever that row's own click does
      state.formModalTeam = el.dataset.showForm;
      state.formModalOpen = true;
      render();
    });
    const welcomeOpenTutorial = $('#welcome-open-tutorial');
    if(welcomeOpenTutorial) welcomeOpenTutorial.onclick = () => { state.welcomeModalOpen = false; state.tutorialStep = 0; state.tutorialModalOpen = true; render(); };
    const tosCheckbox = $('#tos-agree-checkbox');
    if(tosCheckbox) tosCheckbox.onchange = e => { state.tosAgreed = e.target.checked; render(); };
    const tosCheckboxInline = $('#tos-agree-checkbox-inline');
    if(tosCheckboxInline) tosCheckboxInline.onchange = e => { state.tosAgreed = e.target.checked; render(); };
    const tipReminderCheckbox = $('#tip-reminder-optin-checkbox');
    if(tipReminderCheckbox) tipReminderCheckbox.onchange = e => { state.tipReminderOptIn = e.target.checked; render(); };
    const tipReminderToggle = $('#tip-reminder-toggle');
    if(tipReminderToggle) tipReminderToggle.onchange = async e => {
      const enabled = e.target.checked;
      const myUsername = state.user.username; // captured once for consistency, even though this handler never overwrites state.user itself
      state.user.tipReminderEnabled = enabled; // optimistic, so the checkbox itself doesn't visually revert while saving
      state.tipReminderStatus = null; // force a fresh check under the new setting
      render();
      await withUserLock(myUsername, async () => {
        const fresh = await getUser(myUsername);
        if(!fresh) return;
        fresh.tipReminderEnabled = enabled;
        await saveUser(fresh);
      });
    };
    const toggleTxHistory = $('[data-toggle-tx-history]');
    if(toggleTxHistory) toggleTxHistory.onclick = () => { state.txHistoryExpanded = !state.txHistoryExpanded; render(); };
    const logoutBtn = $('#logout-btn');
    if(logoutBtn) logoutBtn.onclick = () => { state = {...state, screen:'main', user:null, username:'', pin:'', adminLoginMode:false, registeringMode:false, tosAgreed:false, error:'', info:'', loginModalOpen:false, slip:[], betMode:'multi', activeTab:'HOME', h2hMarket:null, h2hFixtureMarket:null, myBets:null, adminPunters:null, adminBets:null, novelty:null, statsData:null, tippingData:null, tippingPending:{}, tippingRound:null, tippingAllPicks:null, tippingLeaderboard:null, tipReminderStatus:null, tippingRewardChecked:null, tippingRewardBanner:null, preseasonData:null, preseasonPending:{}, preseasonAllPicks:null, preseasonLeaderboard:null, homeTippingNudge:null, txHistory:null}; render(); };
    const openLoginBtn = $('#open-login-btn'); if(openLoginBtn) openLoginBtn.onclick = () => { state.loginModalOpen = true; state.adminLoginMode=false; state.error=''; state.info=''; render(); };
    const openTeamSearchBtn = $('#open-team-search-btn'); if(openTeamSearchBtn) openTeamSearchBtn.onclick = () => { state.teamDirectoryOpen = true; state.viewingTeamProfile = null; render(); };
    const closeTeamSearchBtn = $('#close-team-search'); if(closeTeamSearchBtn) closeTeamSearchBtn.onclick = () => { state.teamSearchOpen = false; state.teamSearchQuery=''; render(); };
    document.querySelectorAll('[data-view-team-profile]').forEach(el => el.onclick = () => {
      state.viewingTeamProfile = el.dataset.viewTeamProfile;
      state.teamDirectoryOpen = false;
      state.teamProfileSubTab = 'OVERVIEW';
      state.teamProfileBilbbetData = null;
      render();
    });
    const closeTeamDirectoryBtn = $('#close-team-directory'); if(closeTeamDirectoryBtn) closeTeamDirectoryBtn.onclick = () => { state.teamDirectoryOpen = false; state.teamDirectoryQuery = ''; render(); };
    const teamDirectorySearch = $('#team-directory-search'); if(teamDirectorySearch) teamDirectorySearch.oninput = e => { state.teamDirectoryQuery = e.target.value; render(); };
    const teamProfileBackBtn = $('#team-profile-back'); if(teamProfileBackBtn) teamProfileBackBtn.onclick = () => { state.viewingTeamProfile = null; state.teamDirectoryOpen = true; render(); };
    document.querySelectorAll('[data-team-profile-subtab]').forEach(el => el.onclick = () => {
      state.teamProfileSubTab = el.dataset.teamProfileSubtab;
      render();
    });
    const teamProfileViewMarkets = $('#team-profile-view-markets');
    if(teamProfileViewMarkets) teamProfileViewMarkets.onclick = () => {
      const teamName = teamProfileViewMarkets.dataset.team;
      state.viewingTeamProfile = null;
      state.teamDirectoryOpen = false;
      state.teamSearchOpen = true;
      state.teamSearchQuery = teamName;
      render();
    };
    const headerTeamSearch = $('#header-team-search');
    if(headerTeamSearch){
      headerTeamSearch.oninput = e => { state.teamSearchQuery = e.target.value; };
      headerTeamSearch.onchange = e => { state.teamSearchQuery = e.target.value; render(); };
    }
    const closeLoginBtn = $('#close-login-modal'); if(closeLoginBtn) closeLoginBtn.onclick = () => { state.loginModalOpen = false; state.adminLoginMode=false; state.registeringMode=false; state.customNameMode=false; state.tosAgreed=false; state.error=''; state.info=''; render(); };
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
    const impliedToggle = $('#toggle-implied-chance'); if(impliedToggle) impliedToggle.onchange = e => { state.showImpliedChance = e.target.checked; render(); };

    document.querySelectorAll('[data-tippingtab]').forEach(el => el.onclick = () => {
      state.tippingSubTab = el.dataset.tippingtab;
      if(state.tippingSubTab === 'LEADERBOARD') state.tippingLeaderboard = null; // force a fresh computation each visit
      render();
    });
    document.querySelectorAll('[data-tipping-section]').forEach(el => el.onclick = () => {
      state.tippingSection = el.dataset.tippingSection;
      render();
    });
    const tippingViewRoundEl = $('#tipping-view-round');
    if(tippingViewRoundEl) tippingViewRoundEl.onchange = e => {
      state.tippingViewRound = e.target.value ? parseInt(e.target.value, 10) : null;
      state.tippingData = null; // force a reload for the newly-viewed round
      state.tippingAllPicks = null; // same -- the all-tipsters cache is round-scoped
      render();
    };
    document.querySelectorAll('[data-tip-radio]').forEach(el => el.onchange = () => {
      if(!state.user){
        alert('You must log in first to submit a tip.');
        state.loginModalOpen = true;
        render(); // snaps the radio back to its real (unchecked) state -- the browser already visually toggled it before onchange fired
        return;
      }
      const [div, idxStr, side, team, oddsStr] = el.dataset.tipRadio.split('|');
      setPendingTip(div, parseInt(idxStr, 10), team, parseFloat(oddsStr));
    });
    document.querySelectorAll('[data-mrmedian-check]').forEach(el => el.onchange = () => {
      if(!state.user){
        alert('You must log in first to submit a tip.');
        state.loginModalOpen = true;
        render(); // snaps the checkbox back to its real (unchecked) state -- the browser already visually toggled it before onchange fired
        return;
      }
      const [div, idxStr, team, oddsStr] = el.dataset.mrmedianCheck.split('|');
      toggleMrMedianPick(div, parseInt(idxStr, 10), team, parseFloat(oddsStr));
    });
    const confirmTipsBtn = $('#confirm-tips-btn'); if(confirmTipsBtn) confirmTipsBtn.onclick = confirmTips;
    document.querySelectorAll('[data-preseason-pick]').forEach(el => el.onclick = () => {
      if(!state.user){
        alert('You must log in first to submit a tip.');
        state.loginModalOpen = true;
        render();
        return;
      }
      const parts = el.dataset.preseasonPick.split('|');
      const [team, oddsStr, countStr] = parts.slice(-3);
      const slotKey = parts.slice(0, -3).join('|'); // slot.key itself already contains a "|" (e.g. "winner|ELIZA CUP (D1)"), so it can't be split on the same delimiter naively
      togglePreseasonPick(slotKey, team, parseFloat(oddsStr), parseInt(countStr, 10));
    });
    const confirmPreseasonBtn = $('#confirm-preseason-btn'); if(confirmPreseasonBtn) confirmPreseasonBtn.onclick = confirmPreseasonPicks;
    document.querySelectorAll('[data-final-result]').forEach(el => el.onclick = () => {
      const parts = el.dataset.finalResult.split('|');
      const [team, countStr] = parts.slice(-2);
      const slotKey = parts.slice(0, -2).join('|'); // slot.key itself contains a "|" (e.g. "winner|ELIZA CUP (D1)")
      toggleFinalResult(slotKey, team, parseInt(countStr, 10));
    });
    const dismissRewardBtn = $('#dismiss-reward-banner'); if(dismissRewardBtn) dismissRewardBtn.onclick = () => { state.tippingRewardBanner = null; render(); };
    document.querySelectorAll('[data-make-multi]').forEach(el => el.onclick = () => {
      const key = el.dataset.makeMulti;
      const divs = key === 'ALL' ? TIPPING_SECTIONS.flatMap(s => s.divs) : (TIPPING_SECTIONS.find(s => s.key === key) || {divs:[]}).divs;
      makeMultiFromTips(divs, parseInt(el.dataset.multiStake, 10) || 10);
    });
    document.querySelectorAll('[data-leaderboard-section]').forEach(el => el.onclick = () => {
      state.tippingLeaderboardSection = el.dataset.leaderboardSection;
      state.tippingLeaderboard = null;
      render();
    });
    document.querySelectorAll('[data-sort-col]').forEach(el => el.onclick = () => {
      const col = el.dataset.sortCol;
      const isPreseason = state.leaderboardKind === 'PRESEASON';
      const sortByKey = isPreseason ? 'preseasonLeaderboardSortBy' : 'tippingLeaderboardSortBy';
      const sortDirKey = isPreseason ? 'preseasonLeaderboardSortDir' : 'tippingLeaderboardSortDir';
      if(state[sortByKey] === col){
        state[sortDirKey] = state[sortDirKey] === 'desc' ? 'asc' : 'desc'; // same column again -- flip direction
      } else {
        state[sortByKey] = col;
        state[sortDirKey] = 'desc'; // a newly-selected column always starts high-to-low
      }
      render(); // pure re-sort of already-loaded data -- no recomputation needed
    });
    const tippingLbRound = $('#tipping-lb-round');
    if(tippingLbRound) tippingLbRound.onchange = e => { state.tippingLeaderboardRound = parseInt(e.target.value, 10); state.tippingLeaderboard = null; render(); };
    document.querySelectorAll('[data-tipping-lb-mode]').forEach(el => el.onclick = () => {
      state.tippingLeaderboardMode = el.dataset.tippingLbMode;
      state.tippingLeaderboard = null;
      render();
    });
    document.querySelectorAll('[data-leaderboard-kind]').forEach(el => el.onclick = () => {
      state.leaderboardKind = el.dataset.leaderboardKind;
      state.preseasonLeaderboard = null;
      render();
    });
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
    const refreshFeaturedBtn = $('#refresh-featured-fixtures');
    if(refreshFeaturedBtn) refreshFeaturedBtn.onclick = refreshFeaturedFixtures;
    const endSeasonBtn = $('#end-season-btn');
    if(endSeasonBtn) endSeasonBtn.onclick = () => endSeasonRollover();
    const saveSeasonLabelBtn = $('#save-season-label-btn');
    if(saveSeasonLabelBtn) saveSeasonLabelBtn.onclick = async () => {
      const input = $('#season-label-override');
      const val = (input?.value || '').trim();
      if(!/^\d{2}\/\d{2}$/.test(val)){ alert('Season label must be in YY/YY form, e.g. 26/27.'); return; }
      if(!confirm(`Set the current season to ${val}? This only relabels going forward -- it doesn't archive, reset, or touch anything else.`)) return;
      state.currentSeasonLabel = val;
      await sset('bilbbet2_current_season_label', val);
      render();
    };
    document.querySelectorAll('[data-toggle-season-closed]').forEach(el => el.onchange = async e => {
      const key = el.dataset.toggleSeasonClosed;
      state.seasonClosed = { ...state.seasonClosed, [key]: e.target.checked };
      render();
      await sset('bilbbet2_season_closed', state.seasonClosed);
    });
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
      const myUsername = state.user.username; // captured once -- state.user could change while the awaits below are in flight
      const u = await withUserLock(myUsername, async () => {
        const fresh = await getUser(myUsername);
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
        await logTransaction(myUsername, 'BET_PLACED', -stake, fresh.balance,
          slipSnapshot.length === 1 ? `Bet placed: ${slipSnapshot[0].label}` : `Bet placed: ${slipSnapshot.length}-leg multi`);
        return fresh;
      });
      if(u === null){
        alert("You've already used this round's featured pick in another bet \u2014 only one featured (boosted) pick per round.");
        return;
      }
      if(state.user && state.user.username === myUsername) state.user = u; // only reflect the new balance if this is still the same session that placed the bet
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
      const myUsername = state.user.username; // captured once -- state.user could change while the awaits below are in flight
      const u = await withUserLock(myUsername, async () => {
        const fresh = await getUser(myUsername);
        if(hasFeatured && fresh.featuredPickUsedRound === state.currentRound){
          return null;
        }
        fresh.balance -= totalStake;
        if(hasFeatured) fresh.featuredPickUsedRound = state.currentRound;
        await saveUser(fresh);
        await logTransaction(myUsername, 'BET_PLACED', -totalStake, fresh.balance, `Placed ${slipSnapshot.length} single bet${slipSnapshot.length!==1?'s':''}`);
        return fresh;
      });
      if(u === null){
        alert("You've already used this round's featured pick in another bet \u2014 only one featured (boosted) pick per round.");
        return;
      }
      if(state.user && state.user.username === myUsername) state.user = u; // only reflect the new balance if this is still the same session that placed the bets
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
        adminUser = { username: 'admin', pinHash: simpleHash('2845'), balance: 0, isAdmin: true, status: 'APPROVED', everFunded: true, welcomeSeen: true };
        await saveUser(adminUser);
        await addToIndex('bilbbet2_users_index', 'admin');
      }
      state.user = adminUser; state.error=''; state.username=''; state.pin=''; state.adminLoginMode=false; state.screen='main'; state.loginModalOpen=false;
      state.activeTab='HOME'; state.adminPunters=null; state.adminBets=null; state.novelty=null; state.statsData=null; state.myBets=null; state.tippingData=null; state.tippingPending={}; state.tippingRound=null; state.tippingAllPicks=null; state.tippingLeaderboard=null; state.tipReminderStatus=null; state.tippingRewardChecked=null; state.tippingRewardBanner=null; state.preseasonData=null; state.preseasonPending={}; state.preseasonAllPicks=null; state.preseasonLeaderboard=null; state.homeTippingNudge=null; state.txHistory=null;
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
    state.activeTab='HOME'; state.adminPunters=null; state.adminBets=null; state.novelty=null; state.statsData=null; state.myBets=null; state.tippingData=null; state.tippingPending={}; state.tippingRound=null; state.tippingAllPicks=null; state.tippingLeaderboard=null; state.tipReminderStatus=null; state.tippingRewardChecked=null; state.tippingRewardBanner=null; state.preseasonData=null; state.preseasonPending={}; state.preseasonAllPicks=null; state.preseasonLeaderboard=null; state.homeTippingNudge=null; state.txHistory=null;
    // A punter's genuine first successful login, distinct from the pending-
    // approval wait -- shown once, ever, per account.
    if(!u.welcomeSeen){
      state.welcomeModalOpen = true;
      u.welcomeSeen = true;
      saveUser(u); // fire-and-forget -- the modal shouldn't wait on this to appear
    }
    render();
    checkTipReminderStatus(); // async, fire-and-forget -- flag appears on its own re-render once resolved
    // a punter who's genuinely punted before (not brand new) and ended last
    // season under 500 clams gets a little needling on the way in.
    if(u.historicalRecord && u.historicalRecord.totalBets > 0 && (u.dormantCarry||0) < 500){
      alert('Expect to lose more sucker');
    }
  }

  async function doRegister(){
    const username = state.username.trim(), pin = state.pin.trim();
    state.info = '';
    const isRealTeam = ALL_TEAMS.some(t => t.toLowerCase() === username.toLowerCase());
    if(state.customNameMode && isRealTeam){
      state.error = "That's a registered Eliza Cup team name \u2014 switch back to \"I have a team in the Eliza Cup\" if that's you.";
      render(); return;
    }
    if(!state.customNameMode && username && !isRealTeam){
      state.error = "Couldn't find that team \u2014 check the spelling, or use \"Not part of the Eliza Cup? Make up your own name\" below if you don't have one.";
      render(); return;
    }
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
      ? { username, pinHash: simpleHash(pin), balance: 1000, isAdmin: true, status: 'APPROVED', everFunded: true, welcomeSeen: false, tipReminderEnabled: state.tipReminderOptIn }
      : { username, pinHash: simpleHash(pin), balance: 0, isAdmin: false, status: 'PENDING', everFunded: false, welcomeSeen: false, tipReminderEnabled: state.tipReminderOptIn,
          dormantCarry: carryData ? carryData.carry : 0, historicalRecord: carryData ? carryData.historicalRecord : null };
    const saved = await sset('bilbbet2_user:' + username.toLowerCase(), u);
    if(!saved){ state.error='Could not save your account (storage unavailable). Try reloading.'; render(); return; }
    await addToIndex('bilbbet2_users_index', username);
    state.registeringMode = false; state.tosAgreed = false;
    if(isFirstEver){
      state.user = u; state.error=''; state.username=''; state.pin=''; state.screen='main'; state.loginModalOpen=false;
      state.activeTab='HOME'; state.adminPunters=null; state.adminBets=null; state.novelty=null; state.statsData=null; state.myBets=null; state.tippingData=null; state.tippingPending={}; state.tippingRound=null; state.tippingAllPicks=null; state.tippingLeaderboard=null; state.tipReminderStatus=null; state.tippingRewardChecked=null; state.tippingRewardBanner=null; state.preseasonData=null; state.preseasonPending={}; state.preseasonAllPicks=null; state.preseasonLeaderboard=null; state.homeTippingNudge=null; state.txHistory=null;
    } else {
      state.username=''; state.pin=''; state.error='';
      state.info = `Registration submitted for ${username} \u2014 an admin needs to approve your account before you can log in and get your starting clams.`;
      // Offering the tour right here, not forcing it on every visit -- this
      // is genuinely the one moment it's most useful (they're about to have
      // a wait ahead of them anyway) and it's just as dismissable as the
      // Read Me link, not a blocking gate.
      state.loginModalOpen = false;
      state.tutorialStep = 0;
      state.tutorialModalOpen = true;
    }
    render();
  }

  const savedCurrentRound = await sget('bilbbet2_current_round');
  if(savedCurrentRound){ state.currentRound = savedCurrentRound; state.h2hRound = savedCurrentRound; state.leadingAtRound = savedCurrentRound; state.specialsRound = savedCurrentRound; }
  const savedCupFixtures = await sget('bilbbet2_cup_fixtures');
  if(savedCupFixtures){ state.cupFixtures = savedCupFixtures; }
  const savedSeasonClosed = await sget('bilbbet2_season_closed');
  if(savedSeasonClosed){ state.seasonClosed = savedSeasonClosed; }
  const savedSeasonLabel = await sget('bilbbet2_current_season_label');
  if(savedSeasonLabel){
    state.currentSeasonLabel = savedSeasonLabel;
  } else {
    // First-ever run of this feature on an existing deployment -- give it
    // a real starting value immediately rather than leaving reward keys
    // unversioned until the next rollover happens to set one.
    state.currentSeasonLabel = deriveSeasonLabel();
    await sset('bilbbet2_current_season_label', state.currentSeasonLabel);
  }
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
