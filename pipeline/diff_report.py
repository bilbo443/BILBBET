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
if the raw probability is under 0.25%. Reusing it here means the draft
report shows the exact same numbers a punter would actually see if this
were published, not an approximation.
"""
import json


MARGIN = 1.05
ODDS_FLOOR = 1.005
ODDS_CAP = 1001
SUSPEND_BELOW = 0.0025

# A swing bigger than this (in percentage points of win probability) gets
# flagged for a human glance before publishing -- not blocked outright,
# since a genuine result can be dramatic (see Layer 3's own test: a weak
# team's title odds moved 20 points after ten strong rounds) -- just
# surfaced, since that's exactly the kind of jump a misread column would
# also produce.
FLAG_THRESHOLD_PCT_POINTS = 15


def pct_to_odds(pct):
    p = pct / 100.0
    if p < SUSPEND_BELOW:
        return None  # suspended
    raw = 1 / (p * MARGIN)
    return round(min(max(raw, ODDS_FLOOR), ODDS_CAP), 2)


def odds_to_implied_pct(odds):
    if odds is None:
        return 0.0
    return round(100.0 / (odds * MARGIN), 2)


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
        l_pct = odds_to_implied_pct(l_odds) if l_odds else 0.0
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
