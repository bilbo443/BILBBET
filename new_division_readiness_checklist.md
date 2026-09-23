# New Division Readiness Checklist (Division 4 / Division 3C)

Purpose: a single, comprehensive reference for exactly what needs to
change if a new division gets added -- built by auditing the actual
codebase for every place a division name is hardcoded or assumed,
rather than guessed at from memory. Not a implementation of the new
division itself -- deliberately deferred until the actual rules for
it are confirmed (see the open questions at the bottom).

## Why "DIVISION 3C" and "DIVISION 4" are NOT the same amount of work

Checked the actual matching logic rather than assuming: several parts
of the system match divisions by NAME PREFIX ("DIVISION 3" as a
prefix), not by an exact, enumerated list. This means:

- **DIVISION 3C** would automatically inherit correct behavior in
  those specific spots, with zero code changes, because it already
  starts with "DIVISION 3".
- **DIVISION 4** would NOT match any existing prefix, and in at least
  one confirmed case, falls through to a DEFAULT that is actively
  wrong (see Finding #2 below) rather than failing loudly.

This asymmetry matters a lot for how urgent/risky each addition is.

---

## Findings, in order of severity

### 1. [CRITICAL] `sync_roster.py` -- DIVISION_TIER_TO_LIVE_NAME

```python
DIVISION_TIER_TO_LIVE_NAME = {
    'ELIZA CUP': 'ELIZA CUP (D1)',
    'DIVISION 2A': 'DIVISION 2A', 'DIVISION 2B': 'DIVISION 2B',
    'DIVISION 3A': 'DIVISION 3A', 'DIVISION 3B': 'DIVISION 3B',
}
```

This is an ALLOWLIST, not a prefix match. Any team whose sheet status
isn't an exact key in this dict is **silently excluded from the
roster entirely** -- not shown with a wrong division, just dropped
as if the team doesn't exist. This is the single highest-stakes item
on this whole list: missing this update means new-division teams
would vanish from the site, not just display incorrectly.

**Needs**: a new entry for whatever exact status string the sheet
will use (e.g. `'DIVISION 3C': 'DIVISION 3C'`, `'DIVISION 4':
'DIVISION 4'`), matching precisely what the sheet author will type.

### 2. [CRITICAL] `rebuild_coefficients.py` -- TIER_BY_DIVISION_PREFIX

```python
TIER_BY_DIVISION_PREFIX = {'ELIZA CUP': 0, 'DIVISION 2': 1, 'DIVISION 3': 2, 'SEGUNDA': 1, 'NON-LEAGUE': 3}

def division_tier(div_name):
    for prefix, tier in TIER_BY_DIVISION_PREFIX.items():
        if div_name.upper().startswith(prefix):
            return tier
    return 1
```

Confirmed via the actual prefix-matching logic:
- "DIVISION 3C" -> matches "DIVISION 3" prefix -> tier 2. **Correct
  automatically, no change needed.**
- "DIVISION 4" -> matches nothing -> falls through to `return 1` ->
  **silently treated as tier 1, the same tier as Division 2.** For a
  division described as a below-Division-3 waitlist tier, this would
  be actively wrong, not just unhandled -- it would materially skew
  every coefficient computed for those teams' relative strength.

**Needs**: `'DIVISION 4': 3` (or whatever tier number is actually
correct) added to this dict before any coefficient rebuild runs with
Division 4 teams in the data.

### 3. [MODERATE] `app.js` -- divColorClass

```js
function divColorClass(tabName){
    if(tabName === 'ELIZA CUP (D1)') return 'div-eliza';
    if(tabName === 'DIVISION 2A') return 'div-2a';
    if(tabName === 'DIVISION 2B') return 'div-2b';
    if(tabName === 'DIVISION 3A') return 'div-3a';
    if(tabName === 'DIVISION 3B') return 'div-3b';
    ...
    return '';
}
```

An exact-match allowlist, not a prefix match. A new division not
listed here gets `''` -- fails safe (no color-related crash, no logo
banner shown, no colored stripe), but loses the whole visual-identity
system this session built (the prominent banner, the sub-tab logos,
the color stripes). Cosmetic, not functional -- the site keeps
working, it just looks unbranded for that one division everywhere
color is used.

**Needs**: a new `if` line, a new CSS color variable (`--div-3c` or
`--div-4` in `styles.css`), and matching `.bb-div-stripe`/
`.bb-div-banner` CSS rules (both already have a clear per-division
pattern to copy).

### 4. [MODERATE] `app.js` -- DIV3_TABS (market filtering)

```js
const DIV3_TABS = ['DIVISION 3A', 'DIVISION 3B'];
...
(key !== 'relegation_pct' || !DIV3_TABS.includes(state.futuresSubTab)) &&
(key !== 'bottom3_pct' || DIV3_TABS.includes(state.futuresSubTab))
```

Controls which futures market a division sees: bottom-3 finish (for
divisions with no relegation destination) vs a regular relegation
market. An exact-match array, not a prefix check.

**Needs**: if Division 3C should behave like 3A/3B (bottom-3, no
relegation market), add it to this array. If Division 4 is a genuine
waitlist tier with no relegation/promotion stakes at all, it likely
needs neither market -- see the open question below, since this is a
rules decision, not just a code change.

### 5. [MODERATE] `app.js` -- PLAYOFF_DIVS

```js
const PLAYOFF_DIVS = ['DIVISION 2', 'DIVISION 3'];
```

Drives the whole Playoffs section: which divisions get a playoff
bracket, the Playoffs sub-tab toggle, the admin fixture-entry UI, and
the "needs attention" flag for missing playoff fixtures. Prefix-style
values already ("DIVISION 3" covers both 3A and 3B as conferences),
so Division 3C would likely need conference-splitting logic
reconsidered too, not just an added string -- this is more
structural than the other items on this list.

**Needs**: a real design conversation once the actual promotion/
playoff structure for the new division is decided, not just a
one-line addition. Flagged here specifically so it doesn't get
missed or rushed.

### 6. [LOW] Data files: `carry_balances.json`, `admin_teams.json`

Both already keyed generically (by team name / by team ID), no
hardcoded division list inside either file. `sync_roster.py` already
regenerates both automatically from whatever `h2h_divisions.json`
contains. **No changes needed here** -- these will pick up a new
division automatically once Finding #1 is fixed, since they're
downstream of that same roster-sync process this whole system was
already built around.

### 7. [LOW] `div23_schedule_exceptions.json` naming

The file's internal structure is already generic (`{division: {...}}`,
keyed dynamically) -- a new division's bye-week/playoff-round
exceptions could be added as a new key with zero code changes. Only
the FILENAME itself specifically says "div23", which is misleading
now but not a functional blocker. Worth a rename to something like
`schedule_exceptions.json` at some point for clarity, not urgent.

### 8. Confirmed NOT hardcoded, no action needed

- `FUTURE_DIVS` (`app.js`) -- derived from `Object.keys(FUTURES.divisions)`,
  fully data-driven already.
- `build_admin_teams.py` -- parses whatever status text the sheet
  contains, no hardcoded division list at all.
- `run_refresh.py` / `pipeline_layer3.py` -- no division-specific
  logic found.

---

## Open questions -- these change the actual scope of work

Deliberately not guessed at, since the answers materially change
which of the items above even apply:

1. **Does Division 4 have promotion/relegation, or is it purely a
   holding tier with no competitive stakes?** If it's genuinely just
   a waitlist with no real ladder position, items #4 and #5 may not
   apply to it at all -- it might not need a promotion market, a
   relegation market, or a playoff bracket, just a home for
   otherwise-unplaced players.
2. **Is Division 4 betting-enabled at all**, or is it purely an
   administrative holding structure that shouldn't appear in bilbbet
   as a bettable division in the first place?
3. **Does Division 3C follow the exact same rules as 3A/3B** (bottom-3
   finish market, no relegation destination, playoff-eligible), or
   does adding a third conference change anything structurally (e.g.
   how playoff qualification spots get split three ways instead of
   two)?
4. **What exact status text will the sheet use** for these divisions?
   Finding #1 needs the precise string, not an approximation --
   whatever the sheet author will actually type into that column.

## Recommended next step

Once these are answered, the actual changes are well-scoped and
mostly small (a dictionary entry here, a CSS variable there) --
Findings #1 and #2 in particular are quick, low-risk, high-value
fixes. The one piece worth real design time is #5 (Playoffs), given
it's more structural than a simple lookup addition. This document is
the thing to hand back to Claude when the decision is actually made,
so implementation can start from "here's exactly what needs to
change" instead of re-discovering all of this under time pressure.
