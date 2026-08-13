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
      to run every Tuesday automatically.
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

- [ ] **Fix: extraction's `consistent` flag is computed but never checked.**
      `extract_results.py` already flags when a team's reported total doesn't
      match the sum of their round scores — a real, cheap way to catch a
      typo'd score — but nothing downstream reads it. A silent data-entry
      error could feed straight into the simulation once the season starts.
      **Owner: Claude.** Prerequisite: none, ready to build now. Still not
      done as of this update — flagged twice now, worth actually
      scheduling rather than letting it slide a third time.

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

- [ ] **Decide: `carry_balances.json` missing entries for the 4 teams in
      flux.** Real betting history, not something safe to default. Confirmed
      tonight it's not hiding under an old name. **Owner: you.**
      Prerequisite: knowing whether those teams' real balances exist
      somewhere else, or should genuinely start at zero.

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

- [ ] **Round-milestone checks: 0/1, 3, 6, 10.** These are the shrinkage
      ramp's own checkpoints. Confirm nothing looks like a lock at round 1,
      a team with a rough start but strong priors is visibly recovering by
      round 6, and a team still weak by round 10 looks genuinely weak, not
      artificially propped up. **Owner: you** (review the output) **+
      Claude** (runs it). Prerequisite: Phase 2's data prerequisite above.

- [ ] **Round 13 check — the live-data confidence cap.** Separate,
      pre-existing mechanism: observed results can never outweigh the prior
      coefficient by more than 50%, no matter how many rounds pass. Worth
      deliberately confirming you're comfortable with that cap using
      realistic halfway-point data, not just trusting the number was right
      when it was set. **Owner: you** (judgment call on the cap itself).

- [ ] **Round 23 structural check.** Last normal round before playoffs.
      Sanity-check promotion/relegation-zone teams look sensible as the
      season's shape locks in.

- [ ] **Data-entry edge cases, deliberately constructed:**
  - [ ] Two teams tied on score in the same round (logic already confirmed
        correct in code; worth seeing it live once).
  - [ ] A team's reported total not matching its round-by-round sum — once
        Phase 1's `consistent`-flag fix lands, deliberately break a test
        file this way and confirm it actually gets surfaced.
  - [ ] A team name with different casing or trailing whitespace appearing
        mid-season — does it get matched to the existing team, or silently
        treated as new?

- [ ] **Confirm shrinkage reduces over-suspension.** A team that would have
      been suspended (near-certain) pre-shrinkage should now show a normal,
      if short, price instead. Quick visual check against Phase 2's test
      data.

---

## Phase 3 — operational hardening (by 2026-09-24)

- [ ] **Wire `sync_roster.py` into the automated pipeline.** Still fully
      built but unused — every roster change between now and season start
      (and during the season) still needs the same manual handling tonight's
      Heilan Coos situation did. Genuinely reduces your workload for anything
      that comes up between now and Phase 4. **Owner: Claude** (build) **+
      you** (review the design before it goes live, since it touches the
      same roster files everything else depends on).

- [ ] **Decide how to handle the sheet-mid-edit timing risk.** If the
      scheduled Monday run fires while the sheet author is actively editing
      — some rounds fully entered, one half-typed — the pipeline extracts
      whatever's there at that instant. Narrow window, but real. Options
      range from "accept the risk, it's rare" to "add a small buffer/retry."
      **Owner: you** (how much this is worth building around) **+ Claude**
      (implements whatever you decide).

---

## Phase 4 — final pre-season sweep (2026-10-06 to 2026-10-15)

- [ ] **Let the scheduled Tuesday roster sweep actually run for real** at
      least once in this window (falls naturally on 2026-10-06 and
      2026-10-13 — the second one is the "Tuesday night before the season"
      check this was originally built for). Confirm it reports clean, or
      review whatever it flags.
- [ ] **Re-run the full internal-consistency sweep** across all 9 core data
      files (the one done tonight) one more time, since several files will
      have changed across Phases 1-3.
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
