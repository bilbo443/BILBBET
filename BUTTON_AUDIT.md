# Button & navigation audit tracker

A running document, same pattern as `PRESEASON_TESTING.md` — update as you
go, resume across sessions. Two different kinds of check happened in the
first pass (2026-08-13), explained below so a future session knows exactly
what "already checked" actually means for each area, rather than assuming
more coverage than really happened.

## Methodology (read this before continuing the audit)

**Level 1 — mechanical wiring check (done, whole file, 2026-08-13).**
Extracted every `data-*` attribute rendered anywhere in the app, and every
`data-*` attribute referenced by a click/change handler, and cross-checked
them against each other. Catches: a button that renders but has no handler
at all (dead button), or a handler wired to an attribute that's never
actually rendered (leftover from a refactor). Also checked every bare and
inline function reference used as a handler against the list of functions
that actually exist, catching typos/renamed functions. **Result: zero
genuine issues found**, across all 68 distinct clickable attributes and
268 defined functions in the file — every false positive along the way
was individually run down and confirmed legitimate (see the session log
for the full list: mostly local `const` arrow functions my first-pass
regex didn't recognize, a few plain-English "bet(s)"/"pick(s)" strings
matching call syntax by coincidence, and one genuinely dead-but-harmless
attribute, `data-option-for`, that renders but was never needed by the
mechanism it sits in).

**What Level 1 does NOT catch**: whether a working handler actually does
the *right* thing — sets the correct state, navigates to the correct
place. That needs Level 2.

**Level 2 — semantic review (done for tonight's new/changed handlers only;
NOT done for the rest of the file yet).** Directly read each handler's
actual code and confirmed it does what it should. This is the part that
still needs to be worked through methodically for the areas of the app
that weren't touched tonight — see the checklist below.

**A blocked approach, worth knowing about for next time**: the ideal way
to do Level 2 at scale is a real click-simulation against an actual DOM
(so a test literally clicks the rendered button and checks the result,
rather than a human reading the handler code). Attempted this with
`jsdom` twice — confirmed on the second attempt that it's a genuine `403
Forbidden` from the npm registry in this sandbox, not a transient issue.
Not worth retrying here; if a future session has different network
access, it's worth trying again, but otherwise the fallback is either a
different, allowed lightweight HTML-parsing package, or a small
hand-built parser scoped to just `id=`/`data-*` extraction (doesn't need
to be a real DOM, just enough to find elements and call their `.onclick`).

---

## Level 2 semantic review — done tonight (2026-08-13)

All of these were both logic-tested earlier in the session (via direct
state manipulation and checking the rendered output) AND had their actual
click-handler code re-read line by line just now to confirm the wiring
itself matches:

- [x] "Find a team" button → opens the team directory (confirmed it does
      NOT open the old markets-search panel, a real risk given the button
      was repurposed tonight)
- [x] Clicking a team in the directory → opens that team's profile,
      correctly resets the sub-tab to Overview and clears any cached
      Bilbbet-history data from a previously-viewed team
- [x] Profile "back" button → returns to the directory (not just closes
      the profile)
- [x] Profile "View this team's betting markets" link → opens the *old*
      markets-search panel, pre-filled with the right team, correctly
      closing the profile/directory first
- [x] Team profile sub-tabs (Overview/Results/Competitions/Bilbbet
      history) → each sets the right sub-tab key
- [x] Leaderboard section tabs (Eliza/Div 2/Div 3/ECL/FA Cup/Overall) →
      correctly clears the cached leaderboard so it recomputes for the
      new section, rather than showing stale data from the previous one
- [x] Leaderboard sort-column clicks → correctly flips direction on a
      repeat click of the same column, defaults to descending on a newly
      selected column, and correctly uses separate sort state for the
      weekly vs. pre-season leaderboards rather than sharing one
- [x] Admin "Delete" account button → correctly requires the exact
      username typed into the prompt before calling the actual deletion;
      a cancelled or mismatched prompt is a genuine no-op

---

## Level 2 semantic review — done this session (2026-08-13, continued)

- [x] **`saveCurrentRound` / round-advancement dropdown — real gap found
      and fixed.** No safeguard existed against an accidental backward
      move (re-opens betting on an already-settled round, breaks every
      "this round is in the past" assumption site-wide) — the exact risk
      already flagged in `PRESEASON_TESTING.md`. Added a confirmation
      specifically for backward moves only, since forward advancement is
      the normal weekly action and shouldn't get extra friction. Verified
      both directions against the actual deployed handler code, not just
      a hand-written equivalent.
- [x] **Betting slip: `placeBet`, `placeBetsAsSingles`, the core
      `data-pick` selection handler.** All confirmed solid — genuinely
      careful pre-existing code: proper locking against concurrent
      submission, slip snapshotting to prevent a real exploit (adding
      high-odds legs then removing them mid-submit to keep an inflated
      combined price), fresh-balance re-checks inside the lock for
      multi-tab safety, and a large-stake confirmation already matching
      the same pattern just added to round-advancement.
- [x] **`findConflict()` — the self-interest and impossible-combination
      guards.** Reviewed in full. Surfaced the "username = team name"
      escalation noted above; the impossible-combination logic (can't bet
      4 different teams to all finish top-3 in a 3-team-a-side market)
      correctly uses the same pooling concept as the Python pipeline's
      promotion-pool fix from earlier tonight.
- [x] **Weekly tipping picks: `setPendingTip`, `toggleMrMedianPick`,
      `confirmTips`, and their click handlers.** All confirmed correct —
      proper immutable state updates, correct login guards with the radio/
      checkbox visually snapped back on an early return (the browser
      already toggles it before `onchange` fires), and the Mr Median pick
      cap correctly scoped to the combined tier (both conferences
      together) rather than per-conference, matching the documented
      design intent.
- [x] **End-of-season archiving (`endSeasonRollover`) — a real correction
      to my own initial read, not a bug.** First glance at just the
      click-handler wiring (`onclick = () => endSeasonRollover()`) looked
      like zero confirmation on the single most destructive action in the
      admin panel — worse than "kick", which has a plain `confirm()`.
      That was wrong: the confirmation is built into the function itself,
      not the handler, and it's genuinely the most thorough one in the
      codebase — dynamically computed pending-bet warning, an explicit
      list of exactly what does and doesn't get touched, and a clear
      "can't be undone." Cross-checked `archiveBetsForUser()` too, and it
      does exactly what the confirmation dialog claims (accumulates into
      a running career record correctly across seasons, leaves pending
      bets alone). Worth including this correction rather than quietly
      dropping it, since "I was wrong, here's why" is as useful a record
      as an actual bug for a document meant to be trusted later.
- [x] **Admin: bet resolution — `setBetStatus`, `resolveSelectionResult`,
      `applyBetStatus`.** All confirmed solid. Same careful pattern
      throughout: fresh re-read inside the user lock before acting (so a
      second concurrent resolution never works from stale data), and
      delta-based balance changes (crediting only the *difference* between
      old and new settlement amounts) rather than absolute amounts, which
      is what makes re-resolving a leg safe rather than a double-pay risk.
      One genuinely subtle correct detail: voiding a bet only restores a
      featured-pick/boost allowance if *that specific bet* was the one
      that used it (checked by round), guarding against a stale older bet
      accidentally clearing a currently-in-use allowance.
- [x] **Admin: novelty bets — `deleteNoveltyItem`, `resolveNoveltyItem`,
      `approveSuggestion`/`rejectSuggestion`.** Confirmed solid. Deletion
      correctly warns with a real, dynamic count of pending bets that
      reference the item, auto-voids single-selection bets safely, and
      sensibly leaves multi-leg bets referencing it for manual review
      rather than risking an unsafe automatic partial-void. Resolving a
      novelty item back to `OPEN` correctly reverts any auto-settled bet
      back to PENDING, rather than leaving it stuck at a stale status.
- [x] **Admin: cup fixture setup — investigated from a real user report,
      not a code bug.** You noticed FA Cup/ECL leaderboard tabs showing no
      sortable columns. Confirmed directly: every section uses the exact
      same table code, and FA Cup correctly shows sortable columns the
      moment a real fixture exists for it — proved this by manually
      injecting one and re-rendering. The actual cause is that
      `state.cupFixtures` starts (and resets every season) completely
      empty; cup fixtures are admin-entered per round, not pre-built like
      league fixtures, so there's genuinely nothing to tip on yet. Also
      confirmed one real operational detail while checking the entry
      handler: a fixture gets tagged with whatever `state.currentRound` is
      *at the moment it's added* (`data-add-cupfixture`) — so entering FA
      Cup's Round 2 fixtures requires the round dropdown to actually be
      at Round 2 first, not something you can pre-schedule from Round 1.
- [x] **Admin: punter management — `adjustPunterBalance`,
      `applyRegistrationStatus` (kick/approve/reject/reset all share this
      one function), `approveAllPending`.** Confirmed solid. Balance
      adjustment logs a real audit-trail transaction and correctly syncs
      the admin's own session if they adjust their own account. The
      registration bonus has an `everFunded` guard, so re-approving
      someone after a kick/reset can never double-credit it — and it
      correctly reapplies any carried-over balance from a previous
      season, confirmed consistent with `resetRegistration`'s own
      documented promise. Bulk-approve confirms with a real, dynamic
      pending count first.
- [x] **Admin: ECL group assignment — `assignEclGroup`,
      `removeEclGroupTeam`, `clearEclGroups`.** Confirmed solid. Real
      validation throughout: rejects a team not in this season's ECL
      field, rejects assigning a team already in a different group,
      correctly enforces the 4-team-per-group cap, and every change
      correctly auto-suspends any now-stale ECL market rather than
      leaving odds computed against an outdated group.
- [x] **Pre-season picks: `togglePreseasonPick`, `confirmPreseasonPicks`,
      `toggleFinalResult` — one real gap found and fixed.**
      `toggleFinalResult` (the admin's mechanism for recording a slot's
      actual outcome) was already careful — it warns explicitly if
      changing an already-resolved slot might affect real payouts already
      made. `confirmPreseasonPicks` (the punter-facing submit action) was
      not: it had no internal check that picks hadn't already locked,
      relying entirely on the button not being rendered once Round 1
      starts. A stale page open from before the lock moment could still
      fire it. Fixed to match the defense-in-depth pattern already used
      elsewhere (e.g. weekly tipping's pick handlers) — verified both the
      normal unlocked case still saves correctly, and the locked case is
      now genuinely blocked with a clear message rather than silently
      accepted.
- [x] **Cup calendar overrides (`data-set-cupoverride`/`-off`/
      `data-clear-cupoverride`) — initial concern resolved after full
      investigation, not a bug.** Worried at first that overriding a
      round to "off" wouldn't actually stop existing fixtures from being
      tippable, since `getTippableFixtures` doesn't check the override at
      all. Traced every real usage of `getCupRoundInfo` and confirmed
      it's purely a calendar-labeling and admin-reminder tool (the
      informational note shown above a fixture list, whether a round's
      cup fixtures get featured, and the "you haven't entered fixtures
      for this scheduled round yet" nudge) — never a gate on fixture
      existence. Fixtures are always a deliberate, manual admin action
      regardless, so there's no realistic path to a fixture existing for
      a round the admin didn't intend tippable. Correct by design.
- [x] **Playoff fixtures (`data-add-playofffixture`/
      `-remove-playofffixture`/`-clear-playofffixtures`) and odds refresh
      (`requestOddsRefresh`/`clearOddsRefreshRequest`).** Both confirmed
      solid. Playoff entry uses the same real-team/no-self-match
      validation as cup fixtures. Odds refresh is a simple, correct
      communication flag for whoever runs the weekly pipeline manually —
      matches the actual architecture (the live app never runs the
      pipeline itself). Also noticed `saveCupFixtures` already has the
      same safeguard as ECL group changes: any fixture change
      auto-pauses stage-progression markets, since a newly-known fixture
      makes old "reach round X" odds stale.

---

## Level 2 semantic review — still not done

- [ ] **Helptip panels & outside-click-to-close behavior** — the
      `.closest()`-based dismissal pattern, and whether it's applied
      consistently everywhere a helptip appears.
- [ ] **Mobile-specific interaction quirks** — the `mousedown`-not-`click`
      pattern used for the team-search dropdown (to work around an iOS
      Safari focus/blur timing issue) — worth checking whether this
      pattern is needed and consistently applied anywhere else with a
      similar input-plus-dropdown structure, or if it was only ever a risk
      in that one place.

This is the last of the substantive admin/betting-flow areas — everything
with real money, real season data, or real destructive potential has now
been reviewed. What's left is genuinely polish-level.

---

## Suggested order for continuing this

1. `jsdom` confirmed genuinely blocked in this sandbox (403 Forbidden from
   the registry, not transient) — don't retry here.
2. Helptip dismissal, then mobile-specific quirks — whichever's more
   convenient, both low-stakes at this point.
3. Once both are done, this document's Level 2 review is complete for the
   whole file — worth a final skim of the "done" sections above as a
   sanity check before considering the audit fully closed out.
