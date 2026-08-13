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

---

## Level 2 semantic review — still not done

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
- [ ] **Admin: end-of-season archiving** — the rollover flow itself
      (distinct from `saveCurrentRound`, which it calls as one step of a
      larger process — the rest of that process hasn't been reviewed).
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

1. `jsdom` install confirmed genuinely blocked in this sandbox (403
   Forbidden from the registry, not transient) — don't retry here; worth
   trying only if a future session has different network access.
2. Weekly/pre-season tipping picks — most real user interaction happens
   here, similar traffic level to the betting slip already reviewed.
3. Admin: end-of-season archiving — worth doing before it's ever actually
   used for real, given it's a one-way, high-consequence operation.
4. Everything else, in whatever order is convenient.
