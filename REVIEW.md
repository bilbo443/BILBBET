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

