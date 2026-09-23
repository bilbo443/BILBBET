# Bilbbet Automation Pipeline — Layer 1 Specification
### Data extraction & validation, "Eliza Cup 26/27" sheet

This document consolidates everything confirmed while building and testing Layer 1
of the weekly-refresh automation pipeline. It's meant to be the reference for
whoever builds Layers 2–6 (validation gate, simulation trigger, diff report,
scheduling, publish/rollback) — every rule below was checked against real data
pulled from the live sheet, not assumed from column names.

---

## 1. Scope and source

**Two sheets exist; only one matters for ongoing automation.**

- **"Bilbbet Home"** (clam balances, carry-over history) — a one-time source,
  already fully imported into `carry_balances.json` and `h2h_record.json`.
  Confirmed static going forward. Not part of this pipeline.
- **"Eliza Cup 26/27"** — the live sheet, updated weekly with real results once
  the season starts. This is what Layer 1 reads.

**Access method**: the sheet's actual owner is not the project owner, so
`Publish to web` can't be set directly. Workaround: `IMPORTRANGE` two live-linked
tabs into "Bilbbet Home" (which is owned), then publish *those* tabs
individually as CSV. Confirmed working — the published CSV link successfully
returns real cell data via a plain HTTP fetch, no authentication needed.

One important operational note: **`IMPORTRANGE` and "Publish to web" both have
their own propagation delay** (a few minutes, not instant) between an edit and
that edit showing up in the published CSV. Worth a short buffer before trusting
a fetch immediately after a known edit.

---

## 2. Design principle: read by header, never by position

Every extraction function below locates columns by their header text
(`"TEAM NAME"`, `"DIVISION"`, `"TOT"`, etc.), never by column index. If a column
moves, extraction still finds it. If a header is renamed or removed, extraction
**fails loudly with a clear error** rather than silently reading the wrong
column. Tested directly: renamed the `DIVISION` header to simulate the exact
kind of drift seen elsewhere in this project, confirmed the script refuses to
guess and reports exactly what changed.

**A real trap worth flagging for later layers**: the sheet reuses the header
`"TEAM NAME"` at least three times across the same row (main results table,
ladder table, FA Cup club profiles). A naive "find the column called TEAM NAME"
grabs the wrong one. The real results table's `TEAM NAME` is disambiguated by
checking it sits immediately after `ELIZA ID`.

---

## 3. Validated tables

### 3.1 Results table (Round 1–26 scores) — fully validated
Columns: `ELIZA ID, TEAM NAME, LOGO, PLAYER, DIV LOGO, KIT, DIVISION, FA CUP, ECL,
CUP NAME, 1..26, TOT, AVG, 3AV, 5AV`.

Extraction tested against every team present in the sample: **computed sum of
rounds 1–26 matched the sheet's own reported `TOT` exactly, zero mismatches.**
This is the ground-truth per-round score used everywhere else in the pipeline.

### 3.2 Main ladder — fully validated
Columns include `POSITION, TEAM NAME, POINTS, WINS, DRAW, LOSSES, PTS +, PTS -, DIFF`.

- `DIFF = PTS+ − PTS-` — exact, every row.
- `POINTS = WINS×3 + DRAW×1` — exact, every row (confirms a standard 3-1-0 system).
- `PTS+` (ladder) is **the same number** as `TOT` (results table) for the same
  team — a genuine cross-table link, confirmed exact.
- **Standings tiebreak: `POINTS` descending, then `PTS+` (points-for) descending —
  not goal difference.** Confirmed against a real tied pair (Frogbert Football,
  DIFF 542, ranked *below* Stairway To Evans, DIFF 515, because Stairway had the
  higher points-for). Easy rule to get wrong by assuming the more conventional
  goal-difference tiebreak — worth calling out explicitly to whoever implements
  the standings sort.

### 3.3 H2H Points Against ("charity" table) — fully validated
Same shape as the results table but tracks points conceded, not scored.

- Table total matches the ladder's `PTS -` exactly for the same team.
- `AVG` = `TOT ÷ (count of rounds with a value present)` — confirmed exact to
  8 decimal places. This **is** an average specifically designed to handle
  divisions that start their season on different rounds (Division 2/3 start
  Round 2, not Round 1) — not a raw total.
- **Does not include FA Cup or ECL points against** — confirmed by the author.
  Cup weeks simply don't produce a "divisional against" figure, hence blank
  cells on those rounds.
- Blanks that *don't* fit the FA Cup pattern (e.g. Round 1 blank despite Round 1
  not being a cup week) were investigated and traced to a **different, one-off
  cause**: the author reuses last season's data for testing, and where a team's
  historical opponent has since been promoted or relegated, that carried-over
  score is lost. Confirmed by the author as a pre-season testing artifact only
  — this should not recur once the real season is live with fresh data each
  round, so no special handling is needed in the validation gate for it.

### 3.4 ECL Group tables — validated, same rules confirmed independently
Same column shape as the main ladder. Both the `POINTS`/`DIFF` formulas and the
points-then-PTS+ tiebreak rule were independently re-confirmed here (Group A),
proving the ranking rule is shared across competitions rather than something
that might silently differ between them.

### 3.5 RODDY (open-field) ranking — spot-checked, not exhaustively proven
Ranks all teams across every division by season `TOT`. One safe relative
comparison confirmed the expected direction (higher `TOT` → better/lower rank
number). Given the size of a full 62-team table and the transcription risk of
hand-copying that much data, this wasn't exhaustively swept the way the tables
above were — worth a fuller pass before treating it with the same confidence.

### 3.6 Fixtures table — spot-checked, not exhaustively proven
Round-by-round opponent list per team. One pairing checked both directions
(Alaskan Bull Worms ↔ BC United Zebras, Round 4) confirmed genuinely
reciprocal. Not swept across the full fixture list for the same reason as 3.5.

### 3.7 `STREAK` column — confirmed unreliable, not used
Shows `0` for every team in the current export regardless of their real
current run (independently computed trailing win streaks of 2, 1, 2 etc. for
teams the column shows as 0). Not a partial mismatch — uniformly blank.
Conclusion: **don't read this column**. A team's current streak is instead
computed directly from the validated round-by-round results, which is more
robust anyway.

---

## 4. Domain knowledge that must inform Layer 2 (validation gate)

These are rules a validation script needs to *know*, or it will flag correct
data as suspicious (or worse, accept genuinely wrong data as fine):

- **Divisions start at different rounds.** Division 2/3 have no Round 1 fixture
  (confirmed independently via the site's own calendar data: "NO H2H" for
  Round 1). A blank Round 1 for those divisions is expected, not an error.
- **FA Cup/ECL weeks never produce a divisional "points against" figure.**
  Expected blanks on cup rounds in the H2H Points Against table specifically —
  not present in the main results table.
- **Team names carry competition-specific suffixes in open-draw contexts.**
  e.g. `"ALASKAN BULL WORMS (D1)"` in FA Cup listings. Strip the suffix before
  matching against the canonical team roster.
- **Chips (double captain, bench boost) are not currently a factor.** The old
  platform excluded chip effects from H2H scoring specifically (to stop punters
  targeting opponents), but chips haven't been decided on for the new platform.
  Not currently reflected anywhere in the data, and nothing to build for yet —
  flagged here so it isn't forgotten if chips get added later, at which point
  H2H markets might need a different score input than Roddy/futures markets.
- **The author test-runs scores before the season starts.** Confirmed directly:
  every round in the current export scores as "before its own calendar
  kickoff date" when checked against the site's round-date calendar — meaning
  the whole current dataset is pre-season test data, correctly flagged as such.
  **This is exactly why the refresh trigger must stay manual, never scheduled**
  — an unattended automatic pipeline would treat this test data as real results.
- **Promotion/relegation breaks carried-over historical scores.** Specific to
  the author's pre-season testing method (reusing last season's numbers); not
  expected to recur once the real season is generating fresh data each round.

---

## 5. Already-built and tested: the calendar-mismatch check

A concrete Layer 2 check, built and proven on real data: for each round with
score data present, compare that round's calendar kickoff date (Sydney time,
DST-aware) against today. If scores exist for a round whose kickoff hasn't
happened yet, flag it. Run against the live pre-season test export: **correctly
flagged all 26 rounds** as scored ahead of their real kickoff date — exactly
the intended behavior, and a working demonstration that the check catches
test-data situations rather than just being a hypothetical safeguard.

---

## 6. Status: all six layers built, all with real tests

Everything below is genuinely built and tested against real data, not just
designed — including the specific tests run for each, so this is checkable
rather than a claim.

- **Layer 1 (extraction)** — header-based reading of the results, ladder,
  H2H-points-against, and ECL group tables. Every one matched the sheet's
  own reported totals exactly. `extract_results.py`.

- **Layer 2 (validation gate)** — eight checks (required headers, round
  columns, no duplicate table, row count, known roster, score ranges,
  system-account names, calendar consistency). Tested individually against
  deliberately broken inputs (each check fires on the specific problem it's
  meant to catch) and against a genuinely clean synthetic dataset (passes
  cleanly — the gate isn't just something that always fails).
  `validate_sheet_data.py`.

- **Layer 3 (pipeline + real simulation)** — fetch → validate → extract →
  simulate → draft, over an actual HTTP fetch. The simulation adapter
  reuses the real Monte Carlo engine behind the live site (confirmed to
  reproduce the original script's output exactly with no live data), with
  live in-season scores blended into the existing multi-season
  coefficients. Proven in both directions: a weak team given a dominant
  live start jumped from ~0% to 20% title odds; a strong team given a poor
  live start collapsed from 17% to 0.02%. Covers the division futures
  market as one complete slice — Roddy/FA Cup/ECL use the same
  `build_samplers()` pattern and the same blending function, so extending
  to them is applying this same method again, not new design work, but
  that repetition hasn't been done yet. `pipeline_layer3.py`,
  `simulation_adapter.py`.

- **Layer 4 (diff report)** — compares draft odds against the real live
  `futures.json`, in the same odds format punters actually see. Tested
  against a real thin-data draft (nothing flagged, correctly) and a
  dramatic scenario (correctly flagged the outlier at +20 points, and
  correctly showed every other team in that division drifting slightly
  worse as a natural consequence — a real modeled effect, not a scripted
  one). `diff_report.py`.

- **Layer 5 (automation trigger)** — `run_refresh.py` ties Layers 1-4 into
  one CLI call with clean exit codes, tested for both the failure path
  (exit 1, no PR body written) and the success path (exit 0, a real
  PR-ready markdown file produced). `refresh-odds.yml` wires this into a
  GitHub Action, manual `workflow_dispatch` only — deliberately not
  scheduled, given the author's pre-season testing habit. **Caveat that
  matters**: the YAML itself has not run on a real GitHub Actions runner —
  no GitHub repo available in this environment to test that specific
  wiring against. Confirmed syntactically valid and structurally correct,
  but its first real trigger is the one part of this whole pipeline still
  worth treating as unverified until it actually runs.

- **Layer 6 (publish + rollback)** — publishing is just merging the PR;
  rollback is `git revert`, tested against a real local git repo: a
  simulated bad merge, rolled back, with the file content confirmed to
  genuinely return to the correct value and the commit history correctly
  preserved (the bad commit stays visible, undone by a new commit on top,
  not erased). `rollback.py`. A separate post-publish check
  (`verify_published.py`) fetches the actually-live data after a merge and
  confirms it matches what was published, rather than assuming a merge
  means it's live — tested against both a genuine match and a deliberately
  incomplete deploy (correctly named every missing team).

### What's still genuinely open

- Extending the simulation adapter to Roddy, FA Cup, and ECL (same pattern
  as division futures, not yet repeated for those markets).
- The GitHub Actions workflow's first real run, to confirm the YAML wiring
  itself.
- A fuller, non-spot-check sweep of the RODDY and Fixtures tables (only
  lightly checked in Layer 1, given the transcription risk on tables that
  large).

