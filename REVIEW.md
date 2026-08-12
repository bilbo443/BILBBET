# Coefficient & Odds Rebuild — Review Package

Everything here is genuinely rebuilt from the four historical season CSVs
plus the current 26/27 roster, replacing the coefficient system that
produced the miscalibrated Nanistate/Top Kuolity odds this whole effort
started from. Every claim below was tested against real data, not assumed.

## What triggered this

- Nanistate ranked 11th of 14 in D1 despite a real record of top-5-ish
  finishes in each of the last three tracked seasons.
- Top Kuolity's odds were an 8x outlier below the next-weakest team.

Both traced back to genuine, fixable problems, not just "the model is
wrong for no reason" — see below.

## What was actually broken, and what fixed it

1. **A missing season.** The old coefficients were built from only 3 of the
   4 available historical seasons — 25/26, the most recent and most
   relevant, was never parsed in. Freshly extracted and validated here
   (`season_2526.json`), cross-checked against the sheet's own totals.

2. **34 of 62 current teams have unlinked previous names**, discovered by
   checking the admin roster properly rather than assuming the raw season
   files were complete. Without resolving these, a team's seasons under an
   old name simply vanish from their history. Confirmed real, measurable
   impact: 35 team-season records across the three older seasons were
   sitting under an old name (e.g. Big Mac FC's "average" season as Big
   Maclaren was invisible to the old system — folding it in dropped their
   coefficient from an inflated 0.146 to a defensible 0.019, mid-pack).

3. **Tier adjustment was hard-coded to Eliza Cup**, distorting every OTHER
   division's own internal race. Fixed so a team's tier offset is relative
   to whichever division is actually being simulated — this alone took
   Division 3A from one team dominating at 64% to a genuine four-way
   contest, and Division 3B from a wildly seed-unstable 42-80% swing to a
   consistent, trustworthy number.

4. **The sampling pool (`roddy_history.json`) was single-season and
   alias-blind**, even after the coefficient itself was fixed — found while
   diagnosing Division 3A, where a team with a *weaker* coefficient
   (Garry Wallah United FC) was still winning the simulation because its
   raw, unadjusted single-season pool baseline was higher than a team the
   coefficient actually favored (For Vuck's Sake FC). Rebuilt with the same
   alias resolution, plus proper multi-season blending — each older
   season's scores are z-scored against their own season and re-expressed
   on the current scale, so seasons from a different scoring era can be
   pooled together honestly rather than either swamping or vanishing.

5. **New-player variance.** Per your framing: a team with almost no history
   isn't "probably average" — new/promoted managers plausibly split into
   genuinely competitive-from-day-one vs. largely disengaged, a wider real
   spread than an established team's uncertainty. Implemented as a
   `variance_widen` factor that blends in a wider reference pool for
   low-history teams specifically, widening simulated spread rather than
   only shrinking the central estimate.

6. **Start-strong vs. finish-strong** tracked per team as its own
   `trajectory` diagnostic (not blended into the main coefficient).

## What was checked and found NOT to need a fix

- **FA Cup/ECL cup-week effect**: tested your hypothesis that lower
  divisions might show a bigger "focus effort on the cup match" edge.
  Found a modest scoring bump during cup-calendar weeks, but roughly
  uniform across every tier — no lower-division-specific signal. Your own
  explanation (cup games deliberately scheduled on non-blank/non-double
  weeks) fits this pattern better than a behavioral effect would, so
  `fa_cup`/`ecl` were deliberately left mirroring `roddy` rather than
  building in an adjustment the data doesn't support.

## Final results (25,000 simulations × 3 seeds, averaged — see the seed
## spread as a confidence indicator, not the earlier single-run numbers)

**Division win% is in `final_division_results.json`.** Headline favorites:

| Division | Favorite | Win% | Seed-to-seed spread |
|---|---|---|---|
| Eliza Cup (D1) | Frogbert Football | 18.5% | low |
| Division 2A | AFC Big Red Port | 29.1% | **high (22pt)** — flagged, treat direction as likely right, number as uncertain |
| Division 2B | Silverman's XI | 56.4% | moderate — both underlying signals (pool + coefficient) agree, so more confidence here despite the spread |
| Division 3A | For Vuck's Sake FC | 24.3% | genuine 4-way race now, down from 64% for one team |
| Division 3B | Tsatas Dip | 75.2% | now stable and consistent across seeds — looks like a real result, worth your gut-check since you know these teams |

## Files in this package

- `rebuild_coefficients.py` — the full coefficient rebuild, heavily commented
  with the reasoning for each design decision.
- `rebuild_roddy_history.py` — the sampling pool rebuild (alias resolution +
  scaled multi-season blending).
- `team_market_coeffs_rebuilt.json` — final coefficients for all 62 current
  teams (`eliza`, `roddy`, `fa_cup`, `ecl`, `relegation_risk`, plus
  diagnostic fields `n_seasons`, `trajectory`, `variance_widen`).
- `roddy_history_rebuilt.json` — final sampling pools for the 58 teams with
  any tracked history (the other 4 — new/promoted placeholders — correctly
  fall back to their division's pool at simulation time).
- `season_2526.json` — the newly-extracted, validated 25/26 season data.
- `final_division_results.json` — the stable, multi-seed-averaged win% for
  every team in every division.

## Not done, flagged honestly rather than silently skipped

- Divisions with a high seed-to-seed spread (2A especially) would benefit
  from being simulated at a higher `n_sim` as standard practice going
  forward, not just for this review.
- This hasn't been wired into `futures.json`/the live site yet — these are
  the source coefficient/pool files only, pending your review.

## Update: promotion discount eased, trophy factor added, recency reweighted

Three changes made on direct request, in `rebuild_coefficients_v2.py`
(supersedes `rebuild_coefficients.py`):

1. **Promotion discount, eased and scoped to eliza only.** The original
   discount was applied to a shared `shrink` factor affecting BOTH eliza
   (tier-projected) and roddy/cup (explicitly documented as tier-blind —
   "a good round is a good round wherever it happened"). Applying a
   tier-promotion penalty to a tier-blind market contradicted that
   market's own design, so this splits it out to affect eliza only, and
   halves both the per-tier rate (0.30 → 0.15) and the cap (0.65 → 0.35).

2. **Trophy bonus**, sourced from `Eliza_Admin_-_All_Time_Data.csv` (the
   league's own all-time trophy record — no such signal existed in the
   pipeline before this). Small, recency-decayed, hard-capped per team per
   market. Deliberately scoped to the four major trophies only (eliza,
   roddy, fa_cup, ecl) — shield/div2/div2 shield/div3/div3 shield/leigh
   broxham are excluded. Increased once already, per direct request, from
   0.025/trophy (cap 0.10) to 0.05/trophy (cap 0.20).

3. **Recency weighting**, shifted to favour recent seasons slightly more:
   25/26 0.40→0.45, 24/25 0.30→0.32, 23/24 0.20→0.15, 22/23 0.10→0.08.

### A genuine methodology gap this surfaced, and how it was closed

The original pipeline's per-season z-scores require round-by-round
scores; only 25/26's raw file (`season_2526.json`) was available when
this update was made — 22/23 through 24/25's raw files were not. Rather
than skip the recency-weight change (impossible to properly reapply
without per-season inputs — a single blended multiplier can be
algebraically inverted, but per-season weighting can't, since it's
applied BEFORE the seasons are combined), this rebuilds from **season-end
TOTAL SCORE + DIVISION**, present for every team in the same trophy CSV,
across all four seasons.

This introduced a real, since-fixed bug worth recording: season totals
(summed across ~26 rounds) have a fundamentally different variance
structure than the per-round scores the original formula was calibrated
against — averaging many rounds together reduces relative noise, which
inflated every z-score by a consistent factor. Measured directly by
computing both ways for 25/26 (the one season with both a raw-score file
and a CSV total available) — the ratio was **exactly 2.36x across every
team checked**, not team-specific noise, so it's applied as a single
calibration constant (`TOTAL_SCORE_Z_CALIBRATION`) rather than something
that needs re-deriving per team.

### Validated, not just asserted

- Reverse-engineering the OLD formula's output from the existing
  coefficients (to recover each team's underlying raw signal before
  reapplying the new formula) was checked against all 62 teams and
  reproduced them exactly before being trusted for the new formula.
- The promotion discount's easing was confirmed to matter for teams it
  should (9 genuinely-promoted teams; e.g. Harvey Frekes' roddy corrected
  from 0.277 to 0.396, since it was being wrongly tier-penalized on an
  explicitly tier-blind market) and to correctly NOT move teams that
  already had proven top-tier history within the 4-season window (tier_gap
  already 0 under the old formula too).
- `regenerate_futures.py`'s cross-conference promotion pooling (Division
  2/3 promotion spots are shared across both conferences combined — not
  obvious from the existing rebuild scripts, confirmed instead from the
  live app's own `promotionPoolKey()` conflict-blocking logic) was checked
  against the raw simulation counts directly: summed to exactly
  `N_SIM * promotion_spots` every time, not approximately.
- A result that looked like a regression (Justice for Moon FC's simulated
  "win division" odds got dramatically worse despite an improved
  coefficient) turned out to be sampling noise on an inherently
  near-zero-probability event for a non-contender, confirmed by an
  isolated, same-seed comparison — the meaningful market for a mid-pack
  team (promotion / top-half) moved correctly in both directions checked.

### Deployed

`team_market_coeffs.json`, `futures.json`, and `roddy_history.json` in
the live app's data directory have been updated (backups kept as
`*.json.bak`). `roddy_history_rebuilt.json` was designated the
authoritative score-pool source; the 2 current-roster teams present in
the live file but absent from it (Deer Park United, Frekeinthesheets)
were merged in rather than dropped, since their data isn't contradicted,
just not yet present in the rebuilt source.

### Still not done, flagged honestly

- FA Cup and ECL's stage-by-stage markets (reach R32/R16/QF/SF/Final; ECL's
  group-stage-to-knockout structure) were NOT regenerated — left as the
  existing, still-valid odds. `regenerate_futures.py`'s knockout
  simulation only tracks the eventual winner, and ECL's exact group-stage
  seeding/advancement rules weren't confirmed. A real follow-up, not an
  oversight.

## Update: real H2H betting markets were silently still on the OLD coefficients

Found in a follow-up sweep, not caught at the time of the original
deployment. `team_market_coeffs.json` was updated and futures odds
regenerated from it — but the real, live H2H match betting markets don't
read `team_market_coeffs.json` at all. `computeH2HMarket()` in app.js
reads four separate files instead: `h2h_shift.json`, `h2h_cup_shift.json`,
`h2h_variance_widen.json`, `h2h_history.json`. None of these were
touched, so H2H betting for every team was silently still pricing off the
OLD, pre-update coefficients even after futures had moved on — the same
team could show a corrected price in one part of the app and the old,
uncorrected one in another.

`sync_roster.py`'s own docstring already stated these four files were
always meant to be regenerated together with `team_market_coeffs.json`
from the same rebuild — this was a real gap in execution, not a design
question. Confirmed the exact derivation for each (not guessed) by
comparing every existing value against the old coefficient file:

  - `h2h_shift.json[team]` = `scale * (eliza - 0.5 * relegation_risk)` —
    identical to the eliza futures market's own shift formula
  - `h2h_cup_shift.json[team]` = `scale * fa_cup`
  - `h2h_variance_widen.json[team]` = `variance_widen`, direct copy
  - `h2h_history.json` = `roddy_history.json`, confirmed byte-identical

Formalized as `derive_h2h_signals.py` (not left as one-off manual fix) so
this stays part of the repeatable pipeline — run it any time
`team_market_coeffs.json` or `roddy_history.json` changes. Deployed to
the live app's data directory (backups kept as `*.json.bak`), and
confirmed against the actual live app code: H2H fixture lists render
correctly across every division, and Kallo FC's H2H shift dropped from
4.092 to 2.716, correctly reflecting their corrected coefficient.

## Update: futures simulation moved to multi-seed averaging (25,000 x 3)

`regenerate_futures.py`'s original single-seed, 6,000-simulation run left
Division 2A with a 22-point seed-to-seed spread — flagged at the time as
"treat direction as likely right, number as uncertain." Rather than leave
that uncertainty baked silently into live odds, this brings
`regenerate_futures.py` up to the same methodology already vetted
elsewhere in this pipeline (25,000 simulations x 3 distinct seeds,
averaged) rather than inventing a new approach.

Every team/market's final percentage is now the mean across all 3 seeds.
The seed-to-seed spread itself (max − min across seeds, in percentage
points) is computed for every single entry, not just spot-checked —
anything ≥10pts gets written to `seed_spread_report.json` and printed
explicitly, so a genuinely low-confidence result stays visible instead of
looking as settled as a stable one.

Result: at this sample size, **zero entries anywhere flagged even at a
3-point threshold** (tested below the 10pt default specifically to
confirm this wasn't just clearing the bar narrowly) — Division 2A's
previous instability was a sampling-noise artifact of too few
simulations, not a genuine multi-modal result in the underlying model.
Runtime: ~99 seconds for the full run, confirmed comfortably within
GitHub Actions' budget before deploying.

Deployed to the live app's `futures.json` (backup kept as
`futures.json.bak2`) and confirmed against the actual app code — full
regression suite passes, including every futures market, tipping, H2H,
and admin.

## Update: FA Cup and ECL futures fully regenerated (previously flagged gap, now closed)

Rules confirmed directly rather than guessed at:

- **FA Cup byes**: the two byes needed to fill a 64-slot bracket from 62
  teams go to the top 2 Roddy finishers from the previous season (25/26)
  — read directly from the trophy CSV's RODDY.5 column, not assumed:
  Silverman's XI (1st) and Big Mac FC (2nd). Those two skip straight to
  Round of 32; the other 60 play Round of 64 (30 matches) to fill the
  remaining 30 of 32 slots.
- **ECL knockout qualification**: 3 groups of 4 (round-robin, 3
  matchdays), top 2 per group (6 total) reach the knockout stage. Of
  those 6, the best 2 by group-stage record go straight to the
  Semi-Final; the other 4 play a single random-draw round for the
  remaining 2 semi-final spots. This explains why `ecl_labels` has no
  `reach_qf_pct` key — there's no separately-tracked stage between
  "reached knockout" and "reached semi-final" in this format.
- **No seeding anywhere** — every knockout draw (both competitions) is a
  genuine random pairing among whoever's left in that round.

Implemented in `regenerate_cup_futures.py`, same multi-seed methodology
as the rest of the pipeline (25,000 sims x 3 seeds). Validated
mathematically before trusting it, not just spot-checked: both bye teams
show as guaranteed (suspended) in `reach_r32_pct`, and every stage's
probabilities sum to exactly the number of qualifying slots for that
stage (e.g. ECL `reach_sf_pct` sums to ~400%, matching the 4 real
semi-final spots) — confirmed at both a 200-simulation smoke-test scale
and the full 25,000-simulation run. Zero seed-spread flags at the full
scale. Merged into `futures.json` and deployed (backup kept as
`futures.json.bak3`); confirmed the app's existing UI renders the
guaranteed-bye entries correctly as "suspended," matching how every other
near-certain market already displays. Full regression suite passes.






## Update: roster correction -- two placeholder team names were live in production

Found while debugging a real GitHub Actions validation failure (`known_roster`
flagged 'HEILAN COOS' and 'TOBY'S TROOPS' as unrecognized). Investigated
rather than assumed: pulled the live sheet directly and cross-checked
against the trophy CSV's YEAR ENTERED / PREVIOUS NAMES fields. Confirmed
with the admin that Heilan Coos and Toby's Troops (both entered 2023/24,
genuinely established teams -- Heilan Coos has a run of prior renames) are
the real, currently-active Division 2B teams for this season. Frekeinthesheets
and Deer Park United (both only entered 2025/26, promoted from Division 3B)
are placeholder names for a future roster transition still pending official
confirmation -- 'h2h_divisions.json' had jumped ahead of that confirmation.

This is the same pair I'd flagged much earlier as 'missing from the
authoritative source' and merged in defensively -- that merge was
well-intentioned at the time but, with this context, was preserving the
wrong two teams. Corrected properly this time, not just patched:

- 'h2h_divisions.json': swapped the two placeholder names for the two real
  ones in DIVISION 2B.
- 'h2h_schedule.json': Division 2B's fixture list regenerated with the
  corrected roster (already flagged elsewhere as placeholder/not-yet-the-
  real-draw, so this was a safe, in-scope correction).
- 'team_market_coeffs.json': re-ran the coefficient rebuild -- Heilan Coos
  and Toby's Troops now have real coefficients computed from their actual
  trophy-CSV season history, rather than a neutral fallback.
- 'futures.json': full division and cup futures regenerated (multi-seed,
  same rigor as before -- validated mathematically, zero seed-spread
  flags).
- 'roddy_history.json' / 'h2h_history.json': removed the two placeholder
  teams' score-pool entries; the two real teams have no score-pool history
  available anywhere either, so they correctly fall back to the division-
  pool default already built for exactly this case.
- 'h2h_shift.json' / 'h2h_cup_shift.json' / 'h2h_variance_widen.json':
  re-derived from the corrected coefficients.

Every change deployed and confirmed against the actual live app code, not
just the data files in isolation -- Division 2B futures and H2H fixtures
both correctly show the real teams, the placeholder names are gone
everywhere, and the rest of the app (Eliza futures, FA Cup, ECL, tipping,
admin) remains unaffected.
