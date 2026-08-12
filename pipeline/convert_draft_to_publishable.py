"""
Layer 6 (part 1): draft -> publishable conversion.

This is the missing piece between "a draft PR with clean, correct
underlying data" and "something safe to actually copy into
data/futures.json". It did not exist anywhere in this project before
now -- confirmed by searching every script here: verify_published.py
(Layer 6's other half) only compares an already-merged live file against
a draft, it doesn't produce one. Nothing else touched this at all.

Why this matters concretely: the automated pipeline's draft output
(odds-draft-*.json, via simulation_adapter.py) contains only raw
percentages -- win_div_pct, top3_pct, etc. The live app reads
data/futures.json expecting {team, odds, suspended} objects per market.
Those are not the same shape. Without this conversion, merging a draft
PR's odds-draft file straight into data/ wouldn't just be risky, it
would be structurally wrong -- the live app has no code path that
understands a bare percentage.

Odds conversion here deliberately reuses the correct reference logic
from regenerate_futures.py's to_odds() -- which suspends markets that
have gone past breakeven (a near-certain outcome, like a team on a
96%+ path to winning its division) rather than pricing them below 1.00
-- NOT diff_report.py's pct_to_odds(), which is display-only, was never
meant to produce publishable values, and has its own separate bug
(ODDS_FLOOR=1.005 rounds down to 1.0 due to floating-point
representation, not up to the intended ~1.01). Fixed here by using a
floor value with no such boundary ambiguity.

This script does NOT write to data/ -- consistent with this project's
standing rule that nothing publishes automatically. It writes a ready-
to-review file; a human still copies it into data/futures.json as the
explicit publish action.
"""
import json
import argparse

MARGIN = 1.05
ODDS_FLOOR = 1.01   # not 1.005 -- see module docstring; this value has
                     # no floating-point rounding ambiguity at 2dp.
ODDS_CAP = 1001
SUSPEND_BELOW_ODDS = 1.0025  # suspend if raw odds would fall below this
                              # (i.e. the outcome is close enough to
                              # certain that pricing it makes no sense)


def pct_to_market_odds(pct):
    """The correct, publishable conversion -- mirrors regenerate_futures.py's
    to_odds(), not diff_report.py's preview-only version."""
    p = pct / 100
    if p <= 0:
        return {'odds': ODDS_CAP, 'suspended': False}
    raw = 1 / (p * MARGIN)
    if raw < SUSPEND_BELOW_ODDS:
        return {'odds': None, 'suspended': True}
    raw = max(ODDS_FLOOR, min(raw, ODDS_CAP))
    return {'odds': round(raw, 2), 'suspended': False}


def convert_draft_to_publishable(draft_path, live_futures_path, out_path):
    draft = json.load(open(draft_path))
    live = json.load(open(live_futures_path))

    rows = draft['division_rows']
    by_div = {}
    for r in rows:
        by_div.setdefault(r['division'], []).append(r)

    market_keys = set()
    for r in rows:
        market_keys.update(k for k in r.keys() if k not in ('division', 'team'))

    converted_divisions = {}
    for div, div_rows in by_div.items():
        converted_divisions[div] = {}
        for key in market_keys:
            if key not in div_rows[0]:
                continue
            market_rows = []
            for r in div_rows:
                conv = pct_to_market_odds(r[key])
                market_rows.append({'team': r['team'], 'odds': conv['odds'], 'suspended': conv['suspended']})
            market_rows.sort(key=lambda e: (e['odds'] is None, e['odds'] if e['odds'] is not None else 0))
            converted_divisions[div][key] = market_rows

    publishable = json.loads(json.dumps(live))  # deep copy, don't mutate the live file on disk
    for div, markets in converted_divisions.items():
        publishable.setdefault('divisions', {}).setdefault(div, {})
        for key, market_rows in markets.items():
            publishable['divisions'][div][key] = market_rows

    json.dump(publishable, open(out_path, 'w'), indent=2)

    summary = []
    for div, markets in converted_divisions.items():
        for key, market_rows in markets.items():
            n_suspended = sum(1 for e in market_rows if e['suspended'])
            if n_suspended:
                summary.append(f"{div} / {key}: {n_suspended} team(s) suspended "
                                f"({', '.join(e['team'] for e in market_rows if e['suspended'])})")
    return publishable, summary


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--draft-path', required=True, help='draft/odds-draft-<run_id>.json')
    ap.add_argument('--live-futures-path', default='data/futures.json')
    ap.add_argument('--out-path', default='draft/futures-publishable.json')
    args = ap.parse_args()

    publishable, summary = convert_draft_to_publishable(args.draft_path, args.live_futures_path, args.out_path)
    print(f"Wrote {args.out_path} -- ready for human review, NOT auto-published.")
    if summary:
        print("\nMarkets suspended in the conversion (near-certain outcome, correctly not priced):")
        for line in summary:
            print(f"  - {line}")
    else:
        print("\nNo markets required suspension.")


if __name__ == '__main__':
    main()
