# Pre-season testing & readiness tracker

A running document, not a one-time report. Update the checkboxes as items get
done; add rows if new scenarios come up. Season kickoff (Round 1) is
**2026-10-16**, so the phases below are built backward from that date.

How to use this: work top to bottom within whichever phase you're in. Each
item lists what needs to happen, who does it, what's needed before you can
even attempt it, and why it matters. "Owner: you" means it needs your judgment
or access (real sheet, real money data, GitHub settings) — Claude can't do it
unsupervised. "Owner: Claude" means it's safe to hand off entirely.

---

## Already verified (2026-08-13 session)

These don't need re-testing unless something else changes them. Listed here
so it's clear what's actually solid ground versus what's still open below.

- [x] **Layer 2 validation gate** — tested against the real live sheet's actual
      quirks (`#REF!` cells, garbage sections below the real table, quoted
      commas in team names). Both roster states (real names / placeholder
      names) pass cleanly via the documented, scoped allowlist.
- [x] **Extraction correctness** — confirmed it distinguishes a genuine
      `0` score from "didn't play" (blank cell) correctly.
- [x] **Simulation crash on a roster team missing from coefficients** —
      reproduced for real, fixed with a neutral (not guessed) fallback, in
      all three places the pattern existed.
- [x] **GitHub Actions PR creation** — confirmed working live, twice, after
      fixing the missing `permissions:` block and the repo's own
      "Read and write permissions" setting.
- [x] **Division 3A/3B roster corruption** — real, live bug found (teams
      swapped between divisions, `"NEW PLAYER 1/2"` placeholder junk in the
      fixture schedule) and fixed across every dependent file (schedule,
      coefficients, futures, H2H signal files).
- [x] **Pre-season tipping: suspended favorites now selectable** — pays a
      flat, clean 1.00 rather than being hidden from the picks list.
- [x] **Draft → publishable odds conversion** — this step didn't exist at all
      before tonight. Built, wired into the workflow automatically, confirmed
      live in a real PR.
- [x] **Diff report suspension bug** — the PR body was showing a heavily-favored
      team's odds as a literal "1.0" instead of correctly suspending the
      market. Fixed and confirmed against real data.
- [x] **Promotion pooling in the automated pipeline** — didn't exist before
      tonight (known gap from earlier in the project). Built properly
      (2A+2B share 4 slots, 3A+3B share 6), confirmed mathematically exact.
- [x] **Relegation incorrectly applying to Division 3** — fixed (bottom tier
      has nowhere to relegate to; `bottom3_pct` is the correct field there).
- [x] **Early-season shrinkage** — tiered ramp (round 0/3/6/10) built and
      tested at every checkpoint, both for a team performing at their
      historical average and for one genuinely over/underperforming it.
- [x] **Pre-season roster sweep** — built, tested against a reconstructed
      copy of the real Division 3A/3B bug (caught every instance), scheduled
      to run every Tuesday automatically. **Coverage gap found and fixed
      2026-08-20**: the sweep checked 8 dependent files but not
      `h2h_record.json`, `real_results.json`, `leading_at.json`, or
      `special_markets.json` — the first two had *already* had real,
      confirmed staleness bugs earlier tonight, meaning this tool's own
      coverage hadn't kept pace with what it was supposed to be guarding
      against. Added all four, proven both directions: a clean run
      against current data reports genuinely clean, and a deliberately
      corrupted `h2h_record.json` gets correctly flagged by name.
- [x] **`real_results.json` missing Heilan Coos / Toby's Troops as keys** —
      fixed.
- [x] **Weekly leaderboard rebuilt** — merged into one sortable table
      (was three separately-ranked lists), with real column-alignment
      (`tabular-nums`, right-aligned) fixing the original readability
      complaint. Section tabs now match `TIPPING_SECTIONS` exactly (Eliza,
      Div 2 A+B combined, Div 3 A+B combined, ECL, FA Cup, Overall) — this
      also fixed a real pre-existing inconsistency, since the leaderboard's
      old per-division filter never actually matched how picks themselves
      were grouped.
- [x] **Pre-season leaderboard participation bug** — found and fixed a real,
      pre-existing bug, not just a display choice: the old code only
      counted a punter once their pick's slot *fully resolved*, which for
      most pre-season picks (like "wins the division") doesn't happen
      until deep into the season. In practice this meant the pre-season
      leaderboard was *always* empty. Now shows anyone who's submitted
      immediately, with honest "—" placeholders (not misleading zeros)
      until a slot actually resolves.
- [x] **Weekly leaderboard, pre-Round-1 view** — extended the same
      participation-first idea to the weekly leaderboard specifically for
      the period before Round 1 has been played (previously just showed a
      blank "no rounds played" message).
- [x] **Green checkmark for "already submitted the upcoming round"** —
      weekly leaderboard only, correctly scoped per-section (submitting
      Div 2 picks doesn't check the box on the Div 3 tab), never shown on
      the pre-season leaderboard.
- [x] **Team directory + profile pages** — "Find a team" now opens a real
      alphabetical directory; each team has Overview (odds + standings),
      Results (this season only), Competitions (FA Cup/ECL), and Bilbbet
      history (punter account looked up directly by team name — that's
      the actual registration convention, confirmed by you after an
      earlier wrong assumption on my part) sub-tabs.
- [x] **Team profile Overview odds gap** — was showing nothing but "season
      hasn't started" pre-season; now always shows the team's actual
      betting markets regardless of season state, with real standings
      added once rounds have been played.
- [x] **Admin: permanent punter account deletion** — distinct from the
      pre-existing "kick" (blocks participation, keeps history) and "reset
      registration" (clears balance, keeps account). Removes the user
      record, every bet, every week's tips, and pre-season picks. Gated
      behind typing the exact username, since it's irreversible. Verified
      against a real scenario with an unrelated second account to confirm
      no cross-contamination.

---

## Important, previously-undocumented finding (2026-08-13, later session)

**`state.currentRound` is a fully manual admin control — nothing in the
code derives it from `round_dates.json` or the real date.** It's a
dropdown + "Save" button in the admin panel
(`saveCurrentRound()`/`#admin-current-round`). Confirmed by searching the
entire codebase for any automatic-advancement logic — there isn't any.

This matters far more now than it would have last night, because almost
everything built this session reads it: the shrinkage ramp's *display*,
every leaderboard view, the "upcoming round" checkmark, and team profile
standings all depend on it being correct.

**The real risk**: this is a completely separate system from the Python
pipeline's own "how many rounds have happened" logic
(`rounds_completed_from()`, added earlier tonight for shrinkage), which
self-derives from the real sheet data and is always accurate by
construction. If the admin forgets to advance the dropdown in a given
week, the *live site's* idea of the current round drifts out of sync with
what the *simulation* is actually using — e.g., the site could still show
a "Round 3" leaderboard while the real odds were already computed as if
Round 5 had happened.

- [ ] **Confirm you understand this is a manual, weekly step**, and
      decide whether that's an acceptable process or something worth
      automating later (e.g., deriving it from `round_dates.json` + real
      date, the way the Python side already does). **Owner: you**
      (process decision) **+ Claude** (build, if you want it automated).
- [ ] **Add a cross-check**: after each real weekly pipeline run, confirm
      the admin-panel round dropdown was actually advanced to match.
      Cheap, high-value habit — worth doing every week for at least the
      first month of the season until it's second nature.

---

## Phase 1 — this week (by 2026-08-20)

Blocking issues. Don't move to Phase 2 until these are resolved.

- [x] **Fix: extraction's `consistent` flag is computed but never checked.**
      `extract_results.py` already flagged when a team's reported total
      didn't match the sum of their round scores, but nothing downstream
      ever read it. Now wired in: the pipeline halts before simulation if
      any mismatch is found, naming the exact team and numbers, same
      "stop and surface" pattern as a validation failure. Verified both
      directions against real data — a clean run still passes straight
      through, and a deliberately corrupted total (a fake typo injected
      into the real sample data) correctly halts with a clear message,
      no PR opens. Also caught and fixed a smaller related gap while
      testing the CLI wrapper: the new failure status would have safely
      stopped the run either way, but with a generic, unhelpful message
      rather than naming the actual team and mismatch — fixed to match
      the polish of the other failure messages.

- [ ] **Decide: `leading_at.json` / `special_markets.json` corruption.**
      Same real bug as the Division 3A/3B schedule issue, but never fixed in
      these two files — live, user-facing junk (`"NEW PLAYER 1/2"`,
      `"TBD PROMOTED TEAM A/B"`) is currently sitting in production. This was
      deliberately deferred until you were comfortable committing to launch.
      Given how much *more* of the site is now real and live (team
      profiles, the rebuilt leaderboard, account management), this is
      worth revisiting soon rather than continuing to defer — the surface
      area where this junk could become visible to a real punter has
      grown materially tonight. **Owner: you** (decide whether to relabel
      now with an odds-accuracy caveat, or hold for a proper regeneration)
      **+ Claude** (does the work once you decide).

- [x] **`carry_balances.json` missing entries — resolved, turned out not to
      need a fix.** Found a fifth, related issue while re-checking this
      fresh: "Zouma Kicks Tim Payne" still had their real carry balance
      (14 bets, real winnings/losses) sitting under the old name from
      before this session's rename — fixed by re-keying the existing
      entry to "The Drone Police", no data invented, nothing guessed.
      For the original four (Heilan Coos, Toby's Troops, Frekeinthesheets,
      Deer Park United): confirmed none have real prior history to
      restore. Before adding zero-value entries for them, checked how a
      missing entry actually gets read at registration
      (`CARRY_BALANCES[username] || null`) — a missing entry already,
      correctly, means "nothing to carry over, no historical record,"
      exactly matching a genuine fresh start. Adding explicit zero
      entries would have been purely redundant. No code or data change
      needed for these four; the original caution (never guess at real
      financial data) was the right call, and confirming the real answer
      resolved it rather than requiring a fix.

- [ ] **Get the "official confirmation" question resolved, if possible.**
      Heilan Coos/Toby's Troops departing vs Frekeinthesheets/Deer Park
      United promoted — still unofficial as of tonight. Not blocking (the
      allowlist handles the ambiguity safely either way), but the sooner
      this is real, the sooner the allowlist and this whole class of
      flip-flop risk can be retired. **Owner: you** (this is a real-world
      league decision, not a code one).

---

## Phase 1.5 — new features from tonight's later session, before real punters see them

- [ ] **Team directory/profile: sweep every real team, not just the ones
      directly tested.** Tested tonight against Tsatas Dip and a handful
      of others — worth a full pass checking every team with an unusual
      name specifically (apostrophes like Silverman's XI, the literal
      comma in "Dog Goes Woof, Payne Goes Meow") to confirm nothing breaks
      the directory listing, the URL-free navigation, or the profile
      render. **Owner: you** (click through) **+ Claude** (fix anything
      found).

- [x] **"Username = team name" convention — confirmed structurally
      enforced, not just a real-world assumption.** Raised as a real
      concern earlier tonight (a mismatch would silently disable
      `findConflict()`'s self-interest guard, not just mis-display a
      profile page) — but checking `doRegister()` directly shows
      registration already rejects any attempt to claim a real Eliza Cup
      team under a non-matching username (exact match required,
      case-insensitive), and "custom name" registrants can't pick a team
      name either. So the guard's assumption genuinely can't be violated
      through normal registration. Worth a final real-world sanity check
      once actual registrations happen, but this is a confirmed-safe
      design, not an open risk.

- [ ] **Dry-run the account deletion feature on a genuinely disposable
      test account before using it on your real "test" account.** The
      feature is tested in isolation tonight, but a real, once-only trial
      run (create a throwaway account, place a token bet, delete it,
      confirm it's actually gone from every view including the admin
      punters list and any leaderboard it appeared on) is worth doing
      once for real before relying on it. **Owner: you.**

- [ ] **Confirm the rebuilt leaderboard looks right at real scale.**
      Tonight's testing used 3-12 synthetic punters. Once more real
      accounts exist, worth a genuine look at how the table reads with a
      fuller, more realistic list — sort behavior, zebra striping, and
      row density were designed around a shorter synthetic list.

---

## Phase 2 — data integrity & mechanism testing (by 2026-09-03)

**Prerequisite for this whole phase:** either (a) the sheet author does a
test run in a **copy** of the sheet — never the live one, see the note
below — and exports it to CSV for you to send me, or (b) we keep using the
synthetic `test_run_scenario.py` tool for anything that doesn't need
realistic human-entered variance.

> **Why not test in the live sheet directly:** the calendar-consistency
> check only catches test scores for rounds whose real kickoff date hasn't
> happened yet. Testing against already-passed round numbers wouldn't be
> caught by anything, and a scheduled run firing mid-test could pull it into
> a real PR. Always test in a copy.

- [x] **Phase 2's prerequisite, met for real.** Tonight included a genuine
      sheet-author-style test: a full randomized season (real variance, not
      the flat-average shortcut) run through the actual `run_pipeline()`
      function against your real, freshly-exported sheet — not just the
      synthetic tool. That satisfies option (a) above properly.

- [ ] **Round-milestone checks: 0/1, 3, 6, 10 — evidence gathered, needs
      your read on whether it looks right.** Concrete findings from
      tonight's randomized run:
  - No round-1 lock anywhere: the highest any team showed at round 1 was
    Tsatas Dip at 47.5% (Division 3B) — high, but reflecting real,
    substantial historical dominance already established earlier tonight,
    not an artifact of the round-1 checkpoint itself. Every other
    division's round-1 favorite sat between 13-24%.
  - Genuine dip-then-recover patterns showing up on their own, not
    engineered: e.g. The Drone Police went 23.3% (round 1) → 20.5%
    (round 3, a real dip from that round's randomized results) → 29.4%
    (round 6, recovering) — the live-blending mechanism reacting to noise
    rather than either ignoring it or overreacting to it.
  - Round 10: every division's weakest team sits at a clean 0.00%, not an
    artificially propped-up small number.
  - **Still needs you specifically**: does this *feel* right, not just
    mathematically consistent? The numbers behaving sensibly by the tests
    above is necessary but not the same as you being comfortable with the
    magnitudes.

- [x] **Round 13 check — the live-data confidence cap. Evidence gathered,
      needs your read on the 50% figure specifically.** Confidence is
      `min(rounds_played / 26, 0.5)` — round 13 is the exact point it
      first hits the ceiling (`13/26 = 0.5`), and stays flat forever
      after, confirmed by testing rounds 13/14/20/26 all producing an
      identical result for a team on a sustained bad run. The stakes made
      concrete: Tsatas Dip with a full season of significantly
      below-average performance sits at 40.43% (capped, as deployed) vs.
      0.03% (uncapped hypothetical) — the cap is the difference between
      "taken seriously but not written off" and "treated as
      near-conclusively finished" after one bad season. **Still needs
      you**: is 50% the right ceiling, or should enough sustained evidence
      eventually be allowed to outweigh the prior further?

- [x] **Round 23 structural check — done, evidence attached.** Full
      round-23 ordering pulled for Division 2A and 3A: both show a
      sensible, smoothly-decaying shape (Division 2A: 43% → 21% → 15% →
      12%, then a long tail down to 0%; Division 3A similar) — no
      clustering artifacts, no ties-that-should-be-spread-out, nothing
      that looks structurally wrong as the season's shape locks in.

- [x] **Two teams tied on score in the same round — confirmed live, not
      just in code review.** Built a real test against a genuine scheduled
      Division 3B fixture (Brexit Lads vs. X2 Strange, both scored 55):
      both teams correctly show drawn=1, won=0, lost=0, exactly 1 point
      each. Matches the code review exactly, now backed by a real run.
  - [x] **A team's reported total not matching its round-by-round sum —
        done, and re-verified against the new real sample tonight.** Not
        just the original test from Phase 1's fix — rebuilt the corrupted
        test file from your fresh CSV specifically (Alaskan Bull Worms'
        total deliberately mismatched) and confirmed the pipeline still
        correctly halts and names the exact team.
  - [x] **A team name with different casing or trailing whitespace —
        real, previously-undiscovered bug found and fixed, not just
        tested.** Deliberately varied "TSATAS DIP" to "tsatas dip  " in a
        real sheet and ran it through actual extraction. Validation
        passed cleanly (it already normalizes for comparison), but
        extraction was using the raw sheet string directly — the
        canonical "TSATAS DIP" was completely missing from the extracted
        results, replaced by an orphaned "tsatas dip" entry that
        wouldn't match coefficients, schedule, or history anywhere
        downstream. In production this would have meant a real team
        silently getting no score that week, with no error and a clean
        validation pass giving false confidence nothing was wrong. Fixed
        by having extraction resolve each name against the known roster
        the same way validation already does, using the canonical name
        in the output. Verified the fix directly (canonical name now
        present, no phantom entry) and confirmed the full real pipeline
        runs cleanly end to end with the varied sheet. Regression-tested
        against both the normal clean sheet and the corrupted-total test
        to confirm nothing else broke.

- [ ] **Confirm shrinkage reduces over-suspension.** Partially observable
      in tonight's data (Tsatas Dip's 47.5% round-1 figure, not a
      suspended near-certainty) but not yet deliberately isolated as its
      own check against a specific pre-shrinkage comparison.

---

## Phase 3 — operational hardening (by 2026-09-24)

- [x] **Wire `sync_roster.py` into the automated pipeline — fully done,
      with a serious gap found and fixed on the very last mile.**
      `admin_teams.json` (the source of truth this depends on) was
      significantly stale first — same Division 3A/3B corruption as the
      original roster bug, plus tonight's rename, plus a genuine conflict
      where it already had Heilan Coos/Toby's Troops marked inactive
      while the live roster still has them active. Fixed to match the
      current operating assumption (all 62 teams as they currently
      stand, playing, until an official decision changes that) before
      trusting it as a sync source.

      Integration runs roster sync as an optional first step (off by
      default); when a real change is detected, the rest of that same
      run correctly uses the freshly-synced files. Found and fixed a
      real crash along the way: a genuinely new team got an empty
      history list, which crashes the sampler outright — fixed to fall
      back to the division's score pool. Tested against no-change, a
      new team, a rename, and a departure — all four confirmed working
      against the correct, current simulation engine (see the
      `simulation_adapter.py` staleness note below).

      **The serious, last-mile gap, found by checking the actual CLI
      script rather than assuming the earlier work was enough**:
      `run_refresh.py` — the real script the GitHub Action runs —
      accepted `--alltime-url` on the command line but never actually
      passed it into `run_pipeline()`. Every fix above would have been
      completely inert in production; roster sync could never have
      fired no matter how correct the code underneath it was. On top of
      that, the workflow's `add-paths` only staged the odds-refresh
      files, so even a correctly-computed roster change would never
      have been committed into the PR, and the PR body never mentioned
      it at all. All three fixed and proven end to end: ran the real CLI
      with a genuine roster change and confirmed the PR body now
      surfaces it prominently, right where a reviewer would see it
      first.

      **A correction to something said here earlier**: this document
      previously said the workflow file still needed updating with a
      real sheet URL, deferred for later. That was wrong — the workflow
      mechanism (reading the `ALLTIME_URL` repository variable,
      gracefully skipping roster sync if it's unset) was already fully
      built from before this session. **The only thing actually still
      needed from you**: set the `ALLTIME_URL` repository variable in
      GitHub with the real published-CSV link for the All Time Data
      tab. Nothing code-side is missing.

      **Two more files found and fixed via a systematic cross-check**
      (every file `app.js` loads, against everything `sync_roster.py`
      writes) rather than checking files one at a time as they came to
      mind: `h2h_record.json` (pairwise H2H history) and
      `real_results.json` (actual per-round scores) were both
      completely uncovered — a rename would have silently left real
      historical data unreachable under the old name. Both now handled
      automatically (cheap key renames, unlike `leading_at.json`/
      `special_markets.json`, which stay correctly flagged for manual
      follow-up given how expensive those are to regenerate).

- [ ] **Decide how to handle the sheet-mid-edit timing risk.** If the
      scheduled Monday run fires while the sheet author is actively editing
      — some rounds fully entered, one half-typed — the pipeline extracts
      whatever's there at that instant. Narrow window, but real. Options
      range from "accept the risk, it's rare" to "add a small buffer/retry."
      **Owner: you** (how much this is worth building around) **+ Claude**
      (implements whatever you decide).

- [x] **Reliability sweep — a genuinely different kind of check, done
      once, worth repeating periodically rather than a one-time item.**
      Not "does the logic work" (covered above) but "has anything
      quietly drifted or gone stale that the logic-level tests wouldn't
      catch." Found and fixed several real things this way:
  - **My own test environment (`repo_root_sim`) had silently drifted
        from the real pipeline** — `simulation_adapter.py` there was
        missing the entire shrinkage mechanism and the promotion-pooling
        fix (an old, pre-shrinkage version), and `convert_draft_to_publishable.py`
        there was a genuinely buggy old copy (`ODDS_FLOOR = 1.01`,
        missing the re-clamp fix entirely). Fixed, and re-ran the
        affected tests against the corrected engine to confirm the
        earlier structural conclusions still held (they did).
  - **Several stale docstrings/comments were actively describing
        outdated behavior as current** — `sync_roster.py`'s top
        docstring described an older design than what's actually
        implemented (claimed coefficients sync via full rebuild
        scripts; the real code carries them forward by ID instead),
        and `convert_draft_to_publishable.py` described a
        `diff_report.py` bug as still present that had actually been
        fixed weeks earlier. Both corrected.
  - **Dead code cleanup in `app.js`** — one genuinely orphaned state
        field (`tippingLeaderboardDiv`, superseded by
        `tippingLeaderboardSection` from the leaderboard rebuild) and
        two unused logo-wrapper functions, all confirmed dead (not
        just unused-looking) before removing, with a regression test
        after.
  - **The three oldest, longest-untouched pipeline tools**
        (`rollback.py`, `verify_published.py`, `backup_database.py`,
        all from the very start of this project) **had never had their
        actual error handling tested** — all three crashed with raw
        Python tracebacks on realistic failures (invalid commit hash,
        connection failure, non-JSON response) instead of a clear
        message, tested by actually triggering each failure, not
        assumed. All three now fail cleanly. Also confirmed via a real
        git repo with a genuine merge conflict that `rollback.py`'s
        trickiest part (cleaning up a dry-run) genuinely works.
  - **A real, previously-undiscovered false-positive bug in
        `diff_report.py`** — any team correctly suspended in both live
        and draft (a near-certain favorite, genuinely unchanged) was
        being flagged as a fabricated ~95+ point "swing", because a
        suspended live entry only stores `{odds: null, suspended:
        true}` and the diff code treated that as 0% implied probability
        instead of the ~95% it actually represents. Confirmed against
        Tsatas Dip's real, currently-suspended entry — this would have
        put a fake massive alarm on every single PR for as long as any
        team stays suspended, exactly the kind of noise that trains a
        reviewer to stop trusting the flagged section, which is where a
        genuine anomaly needs to actually be seen. Fixed using the
        suspend threshold's own implied percentage (~95%) as a floor.
        Tested three ways: the false-positive case (now correctly
        shows a small, real delta and isn't flagged), a genuine large
        change *from* suspended (still correctly flagged), and a
        genuinely new team with no live entry at all (still correctly
        baselines at 0%). Confirmed against a real, full pipeline run
        too, not just isolated unit tests.
  - **One abandoned, genuinely dead file removed**
        (`team_owner_links.json`, empty, zero references anywhere).
  - **A systematic sweep of every historical `prev_names` entry** (45
        of them, not just the one already known about) **against every
        deployed data file — came back clean.** Good confirmation the
        Drone Police staleness was a one-off tied to that specific
        rename, not a symptom of a wider pattern.

---

## Phase 4 — final pre-season sweep (2026-10-06 to 2026-10-15)

- [ ] **Let the scheduled Tuesday roster sweep actually run for real** at
      least once in this window (falls naturally on 2026-10-06 and
      2026-10-13 — the second one is the "Tuesday night before the season"
      check this was originally built for). Confirm it reports clean, or
      review whatever it flags.
- [ ] **Re-run the full internal-consistency sweep** across all 9 core data
      files (the one done tonight) one more time, since several files will
      have changed across Phases 1-3. Worth doing fresh close to kickoff
      regardless of the reliability sweep above — that one confirmed things
      were correct as of 2026-08-20, not as of whenever this actually gets
      read.
- [ ] **Confirm the manual publish flow start to finish**, once, with
      whatever the real sheet looks like closest to kickoff: real run →
      PR → review `futures-publishable.json` → copy into `data/futures.json`
      → confirm the live site actually updates (same propagation-delay
      check as tonight).
- [ ] **Confirm the admin-panel round dropdown is set correctly for
      Round 1** right before kickoff, and that you have a clear, simple
      habit in mind for advancing it every week once the season's live —
      see the `currentRound` finding above.

---

## Phase 5 — season live (2026-10-16 onward)

- [ ] **Watch the first 2-3 real automated Monday runs closely.** This is
      the actual season's real data hitting every mechanism built tonight
      for the first time simultaneously — worth more attention than a
      typical mid-season week.
- [ ] **Every week for at least the first month: confirm the admin round
      dropdown actually got advanced after the weekly pipeline run.** This
      is the single easiest thing to forget and the one most likely to
      make the live site quietly show stale information across every
      feature built this session — leaderboards, team profiles, the
      shrinkage-adjusted odds display, all of it. Worth treating as a
      genuine weekly checklist item, not an assumption.
- [ ] **Confirm the round-based shrinkage feels right in practice** once
      real (not synthetic) results are coming in — the checkpoint values
      (0.20 → 0.40 → 0.70 → 1.00) were a reasonable translation of your
      description into numbers, not something mathematically derived. Easy
      to retune later if round 3 or 6 doesn't match what you're seeing.
