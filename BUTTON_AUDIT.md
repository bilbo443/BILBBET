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
`jsdom` — it installed without an error, but the module wasn't actually
present afterward, likely a network/environment restriction in this
particular sandbox. Worth retrying at the start of a future session in
case that sandbox has different constraints; if it works, it's a
significantly more rigorous way to close out the rest of this list than
manual code review.

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

## Level 2 semantic review — NOT yet done (mechanically verified only)

Everything below has passed Level 1 (a working handler exists, points to a
real function) but has not had its actual logic re-read/re-verified this
session. Grouped by functional area so this can be worked through a
section at a time in a future continuation. None of these are known or
suspected to be broken — this list exists because "mechanically wired"
and "does the right thing" are different claims, not because anything
specific looks wrong.

- [ ] **Betting slip & bet placement** — add/remove selection, stake
      input, place bet (single vs. multi), copy slip to clipboard.
- [ ] **Weekly tipping picks** — radio selection per fixture, "make a
      multi from tips", confirm tips flow, Mr Median check-in.
- [ ] **Pre-season picks** — the picking UI itself (separate from the
      leaderboard, which *was* reviewed tonight).
- [ ] **Admin: bet resolution** — set bet status, resolve individual
      multi-leg results, the "ready to review" highlighting logic.
- [ ] **Admin: punter management** — balance adjustment, kick/unkick,
      reset registration, approve/reject/approve-all registration
      (deletion specifically *was* reviewed; its siblings weren't).
- [ ] **Admin: novelty bets** — add/edit/cancel-edit/save/delete, status
      changes.
- [ ] **Admin: cup fixtures & playoffs** — add/remove/clear cup fixtures,
      playoff fixtures, cup override controls, ECL group assignment/
      clearing.
- [ ] **Admin: odds refresh & suggestions** — request/clear odds refresh,
      submit/approve/reject suggestions.
- [ ] **Admin: season rollover & round advancement** — `saveCurrentRound`
      itself (the actual round-dropdown save handler) and end-of-season
      archiving. High-value given the `currentRound` finding already
      documented in `PRESEASON_TESTING.md` — worth prioritizing this one
      specifically over the others in this list.
- [ ] **Helptip panels & outside-click-to-close behavior** — the
      `.closest()`-based dismissal pattern, and whether it's applied
      consistently everywhere a helptip appears.
- [ ] **Mobile-specific interaction quirks** — the `mousedown`-not-`click`
      pattern used for the team-search dropdown (to work around an iOS
      Safari focus/blur timing issue) — worth checking whether this
      pattern is needed and consistently applied anywhere else with a
      similar input-plus-dropdown structure, or if it was only ever a risk
      in that one place.

---

## Suggested order for continuing this

1. Retry the `jsdom` install at the start of the session — if it works,
   build a real click-simulation harness once and reuse it for everything
   below, rather than manual review each time.
2. Round advancement (`saveCurrentRound`) — highest value given it's
   already flagged as a real operational risk elsewhere.
3. Betting slip & bet placement — most real money moves through here.
4. Everything else, in whatever order is convenient.
