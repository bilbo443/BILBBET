# Bilbbet process follow-up — 10 November 2026

Baseline: main `0fcef84477095f9881d9e3092be4d4628bc0d520`, published GW4 scores and GW5 betting.

## Fixes

| Finding | Change | Practical effect |
|---|---|---|
| Draw selections never received suggested results; cup match wins could be treated as advancement | Three-way draw wins on a tie and loses otherwise; team-to-win selections lose on a tie; explicit advance/qualify selections void on a tie | Suggestions match the stated contracts. Ambiguous old cup wording remains a manual review; no existing settlement was changed. |
| Malformed H2H round IDs could be partially parsed | Validate complete ID, round token and supported outcome | Invalid IDs do not generate result suggestions. |
| Cached price status could hide absent special books | Check eligible current streak books before cache reuse and after publication; retain active outcome counts | Missing or partial special books force regeneration rather than silently remaining absent. Intentionally blocked books and truly suspended outcomes are respected. |
| Stats made one request per user and bet, with no recovery view | Batch reads in groups of 100 through the existing protected reader; show an error and Retry statistics button | Fewer requests, preserved permissions, clear recovery after failure. |
| An old cup fixture anywhere in the season suppressed the current-round fixture flag | Require a fixture for the actual current round | Past/future fixtures cannot hide a missing actionable draw. No alerts are raised for rounds without a cup stage. |
| An unused odds-display prank and obsolete reward stubs remained in app.js | Remove twelve unused functions, the prank configuration and an unreachable auto-close branch; correct outdated Home and workflow comments | Removes misleading alternative code paths. Financial credit remains server-side. |
| Beating-the-line statistics were presented without their reconstruction limitation | Explain that lines use the current model rather than archived pre-match handicaps | Users can interpret the statistic correctly. |

## Verification

- 28 JavaScript regression scripts and 24 Python tests passed, including new coverage, tie, Stats, fixture-flag and split-round scheduler checks.
- JavaScript syntax and published-state consistency checks passed.
- All five conference rosters, fixtures, market fields and score/futures provenance match.
- Live board: GW5, 10,344 quotes, 306 streak quotes across 15 markets, no invalid active prices. The server quote-book validator accepts the board.
- 945 offered futures source prices agree with the live quote board. Two additional source rows, Nanistate and Justiceformoon reach-R16 prices, are absent because that replay-dependent category is explicitly paused.
- Both match-win prices are present for all 648 remaining confirmed league fixtures (1,296 selections).
- The old Stairway-to-Evans leader-after-R2 selection has no pending bet remaining.
- Public browser checks: Home shortcuts and both streak filters; H2H in all five divisions; all division, Roddy, FA Cup and ECL futures; weekly tipping; Stats; logged-out My Bets gate. No real submission was made.
- Split rounds 6 and 16 stay in one scoring round, with checks deferred until after the final match. All 26 configured results checks require 12:30 Sydney time on the configured check date.

## Calendar conflicts — resolved in the targeted follow-up

The first sweep recorded the discrepancies below. The targeted follow-up aligned client/server dates to the existing fixture-aware source; see rollover-rehearsal-2026-11-10.md. Exact first-kickoff times remain unconfirmed, and the existing 19:00 house rule remains in place.

| Round | Current betting date | First-fixture date in results calendar | Consequence if the results calendar is correct |
|---|---|---|---|
| 9 | 25 December 2026 | 26 December 2026 | Betting closes a day early. |
| 10 | 1 January 2027 | 31 December 2026 | Priority: betting date is a day late. |
| 12 | 15 January 2027 | 14 January 2027 | Priority: betting date is a day late. |
| 16 | 12 February 2027 | 13 February 2027 | Betting closes a day early. |
| 21 | 26 March 2027 | 2 April 2027 | Betting closes a week early. |
| 22 | 2 April 2027 | 9 April 2027 | Betting closes a week early. |

The generic lockout time after GW1 remains 19:00 Sydney under the existing rule. The schedule stores fixture dates, not exact kickoff times; it cannot establish a five-minutes-before-kickoff deadline by itself. Jarvis day projections follow the betting calendar and will follow any confirmed date corrections.

## Other observations and limits

- ECL groups/fixtures, later cup draws, the GW8 replay outcome and finals fixtures still require official input when available. Promotion betting remains held under existing rules.
- Database advisors flag private tables without direct-access policies (intentional API-only access), expected executable protected RPCs, two non-definer helper search paths and a missing sessions-username index. The inspected settlement helper only computes a number; it cannot credit balances. No permissions or database schema were changed.
- No live account registration, PIN reset, bet placement, cash-out acceptance, reward claim or settlement was executed. Those paths retain existing isolated regression coverage; they are not certified here through a real-account transaction.
- No balances, accepted odds, source coefficients, team IDs, results or published prices were changed during this sweep. Drone Police ID 088's already-applied manual carry correction remains untouched.
- This establishes consistency with the published snapshot and does not judge the subjective strength assumptions or guarantee hosting availability.
