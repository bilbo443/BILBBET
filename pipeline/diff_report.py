"""
Layer 4: the diff report.

Compares Layer 3's draft output against the currently-live odds and
produces a plain-language summary of what changed -- the actual content of
"here's your draft" that a human reviews before deciding whether to
publish. Flags implausible swings specifically, since a wild jump is
usually the first visible symptom of a misread column upstream, not a
genuine result (the reasoning behind this layer, agreed on much earlier in
this project).

Odds formula matches the one already used across the live site:
decimal = 1 / (p * 1.05), 5% margin, floor 1.005, cap 1001, suspended
if the raw odds would fall below breakeven -- i.e. a near-certain outcome,
like a team on a 96%+ path to winning its division, where there's no
sane price to offer. Reusing this exact logic (not a simplified version
of it) means the draft report shows the same numbers, and suspends the
same markets, that the live app actually would -- confirmed necessary
after a real PR's report showed a heavily-favored team's market at
literal odds of "1.0" instead of correctly suspended, on 2026-08-12.
"""
import json


MARGIN = 1.05
ODDS_FLOOR = 1.005
ODDS_CAP = 1001
SUSPEND_BELOW = 1.0025  # compared against raw ODDS, not probability --
                          # suspends near-certain outcomes, matching
                          # app.js's toOdds() and regenerate_futures.py's
                          # to_odds(). The previous value here (0.0025,
                          # compared against probability) could only ever
                          # suspend a near-impossible outcome, never a
                          # near-certain one -- which is exactly backwards
                          # from what a diff report reviewed before
                          # publishing needs to catch.

# A swing bigger than this (in percentage points of win probability) gets
# flagged for a human glance before publishing -- not blocked outright,
# since a genuine result can be dramatic (see Layer 3's own test: a weak
# team's title odds moved 20 points after ten strong rounds) -- just
# surfaced, since that's exactly the kind of jump a misread column would
# also produce.
FLAG_THRESHOLD_PCT_POINTS = 15


def pct_to_odds(pct):
    p = pct / 100.0
    if p <= 0:
        return ODDS_CAP
    raw = 1 / (p * MARGIN)
    if raw < SUSPEND_BELOW:
        return None  # suspended -- near-certain, no sane price to offer
    raw = max(ODDS_FLOOR, min(raw, ODDS_CAP))
    odds = round(raw, 2)
    if odds < ODDS_FLOOR:
        # 1.005 can't be represented exactly in binary floating point, so
        # a plain round(raw, 2) can silently produce 1.0 here instead --
        # this re-clamp is the actual fix, matching app.js's toOdds() and
        # regenerate_futures.py's to_odds(), both of which already do
        # this. See convert_draft_to_publishable.py's docstring for the
        # fuller account of this exact bug.
        odds = ODDS_FLOOR
    return min(odds, ODDS_CAP)


def odds_to_implied_pct(odds):
    if odds is None:
        return 0.0
    return round(100.0 / (odds * MARGIN), 2)


# The implied percentage at exactly the suspend threshold -- used as a
# floor for a suspended LIVE entry's percentage, not 0.0. Real bug found
# and fixed 2026-08-20, caught by testing against Tsatas Dip's actual,
# currently-suspended live entry rather than assuming this worked: a
# team correctly suspended in BOTH live and draft (near-certain in both,
# genuinely unchanged) was showing as a fabricated ~95+ point "swing",
# since a suspended live odds entry stores only {odds: null, suspended:
# true} -- futures.json structurally discards the exact percentage that
# triggered suspension, so there's no way to recover the true prior
# value. This floor is the most defensible estimate available: "at
# least this much", not a precise historical reading. Every suspended
# team would otherwise ALWAYS appear in the flagged section of every
# single PR regardless of whether anything actually changed -- exactly
# the kind of noise that trains a reviewer to stop trusting the flagged
# section, which is where a genuine anomaly needs to actually be seen.
SUSPENDED_IMPLIED_PCT_FLOOR = round(100.0 / (SUSPEND_BELOW * MARGIN), 2)  # ~95.0


def load_live_odds(path, market_key='win_div_pct'):
    d = json.load(open(path))
    live = {}
    for div, markets in d['divisions'].items():
        for entry in markets.get(market_key, []):
            key = (div, entry['team'])
            live[key] = None if entry.get('suspended') else entry['odds']
    return live


def draft_rows_to_odds(draft_rows, market_key='win_div_pct'):
    draft = {}
    draft_pct = {}
    for row in draft_rows:
        key = (row['division'], row['team'])
        pct = row[market_key]
        draft[key] = pct_to_odds(pct)
        draft_pct[key] = pct
    return draft, draft_pct


def compute_diff(live_path, draft_rows, market_key='win_div_pct'):
    live_odds = load_live_odds(live_path, market_key)
    draft_odds, draft_pct = draft_rows_to_odds(draft_rows, market_key)

    all_keys = set(live_odds) | set(draft_odds)
    rows = []
    for key in all_keys:
        div, team = key
        l_odds = live_odds.get(key)
        d_odds = draft_odds.get(key)
        # key in live_odds but value None means "present, suspended" --
        # distinct from the key not being in live_odds at all (genuinely
        # new to the draft, where 0.0 really is the right baseline).
        if key not in live_odds:
            l_pct = 0.0
        elif l_odds is None:
            l_pct = SUSPENDED_IMPLIED_PCT_FLOOR
        else:
            l_pct = odds_to_implied_pct(l_odds)
        d_pct = draft_pct.get(key, 0.0)
        delta_pct_points = round(d_pct - l_pct, 2)
        rows.append({
            'division': div, 'team': team,
            'live_odds': l_odds, 'draft_odds': d_odds,
            'live_implied_pct': l_pct, 'draft_pct': d_pct,
            'delta_pct_points': delta_pct_points,
            'flagged': abs(delta_pct_points) >= FLAG_THRESHOLD_PCT_POINTS,
            'new_in_draft': key not in live_odds,
            'missing_from_draft': key not in draft_odds,
        })
    rows.sort(key=lambda r: -abs(r['delta_pct_points']))
    return rows


def generate_diff_report(diff_rows, market_label='Division win %'):
    flagged = [r for r in diff_rows if r['flagged']]
    lines = []
    lines.append(f"# Odds diff report -- {market_label}")
    lines.append("")
    lines.append(f"{len(diff_rows)} team/market entries compared. "
                  f"{len(flagged)} flagged as a swing of {FLAG_THRESHOLD_PCT_POINTS}+ percentage points.")
    lines.append("")

    if flagged:
        lines.append("## Flagged for review (large swing -- check before publishing)")
        lines.append("")
        for r in flagged:
            direction = "shortened" if r['delta_pct_points'] > 0 else "drifted"
            lines.append(
                f"- **{r['team']}** ({r['division']}): {r['live_implied_pct']}% -> {r['draft_pct']}% "
                f"({r['delta_pct_points']:+.2f} pts, odds {r['live_odds']} -> {r['draft_odds']}, {direction})"
            )
        lines.append("")
    else:
        lines.append("## No swings above the flag threshold -- nothing here needs a second look.")
        lines.append("")

    lines.append("## Full diff (sorted by size of change)")
    lines.append("")
    lines.append("| Division | Team | Live odds | Draft odds | Live % | Draft % | Delta (pts) |")
    lines.append("|---|---|---|---|---|---|---|")
    for r in diff_rows:
        lines.append(
            f"| {r['division']} | {r['team']} | {r['live_odds']} | {r['draft_odds']} | "
            f"{r['live_implied_pct']} | {r['draft_pct']} | {r['delta_pct_points']:+.2f} |"
        )
    return '\n'.join(lines)
