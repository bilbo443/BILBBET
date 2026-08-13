"""
Test-run tool: "what does the simulation say if we're N rounds into the
season with these scores?"

This is a sandbox, not a pipeline step -- it never reads or writes
draft/, never touches data/futures.json, never opens a PR. It exists
purely to let you see the shrinkage ramp, the live-data blending, and
the promotion pooling all working together against realistic
round-by-round data, rather than testing each mechanism in isolation
the way tonight's development testing did.

THREE WAYS TO USE IT:

1. Quick round-N check -- "what does it look like at round 6, assuming
   every team scores at their own historical average?" This isolates
   the shrinkage ramp specifically (nothing surprising happens, since
   every team is performing exactly as expected -- so any movement you
   see between rounds is the ramp itself, not a real signal):

     python pipeline/test_run_scenario.py --division "DIVISION 3B" --round 6

2. A specific team over/under-performing -- "what if TSATAS DIP actually
   scores poorly for their first 5 rounds, contrary to what their
   history would predict?" This is the scenario that actually tests the
   live-data blending (compute_adjusted_shifts) doing its job -- the
   model should visibly react to a real result diverging from the prior,
   with more reaction the more rounds pass:

     python pipeline/test_run_scenario.py --division "DIVISION 3B" --round 5 \\
       --override "TSATAS DIP:45,48,42,50,44"

3. Compare two rounds directly, to see the ramp's effect isolated from
   any actual score difference:

     python pipeline/test_run_scenario.py --division "DIVISION 3B" --compare 0,3,6,10

Only prints results -- it's read-only against the real data files (only
ever opens them, never writes), and produces no output files at all.
"""
import argparse
import json

from simulation_adapter import simulate_division_futures, early_season_shrinkage


def build_scenario_extracted_results(roster_teams, history, round_num, overrides=None):
    """Builds a synthetic extracted_results list: every team scores at
    their own historical average for `round_num` rounds, except any team
    named in `overrides`, which uses the literal scores given instead.
    This is what 'the season has gotten this far, with these specific
    results' looks like as input to the real simulation code -- same
    shape extract_results.py would produce from a real sheet."""
    import numpy as np
    overrides = overrides or {}
    results = []
    for t in roster_teams:
        if t in overrides:
            scores = list(overrides[t])[:round_num]
            scores += [None] * (round_num - len(scores))  # pad if fewer given than round_num
        else:
            pool = history.get(t, [60])
            avg = float(np.mean(pool))
            scores = [avg] * round_num
        scores += [None] * (26 - len(scores))
        results.append({'team': t, 'scores_by_round': scores})
    return results


def run_one(division_filter, round_num, overrides, coeffs_path, history_path, roster_path, n_sim):
    team_coeffs = json.load(open(coeffs_path))['team_coeffs']
    scale = json.load(open(coeffs_path))['scale']
    history = json.load(open(history_path))
    all_divs = json.load(open(roster_path))

    new_divs = {division_filter: all_divs[division_filter]} if division_filter else all_divs
    roster_teams = [t for teams in new_divs.values() for t in teams]

    extracted = build_scenario_extracted_results(roster_teams, history, round_num, overrides)
    rows, adjustments = simulate_division_futures(new_divs, team_coeffs, scale, history, extracted, n_sim=n_sim)
    return rows, adjustments


def parse_overrides(override_args):
    """--override "TSATAS DIP:45,48,42,50,44" -> {'TSATAS DIP': [45.0, 48.0, 42.0, 50.0, 44.0]}"""
    overrides = {}
    for arg in override_args or []:
        team, scores_str = arg.rsplit(':', 1)
        overrides[team.strip()] = [float(s) for s in scores_str.split(',')]
    return overrides


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--division', default=None, help='Limit to one division (e.g. "DIVISION 3B"). Omit for the whole league.')
    ap.add_argument('--round', type=int, default=None, help='Simulate as if this many rounds have been played.')
    ap.add_argument('--compare', default=None, help='Comma-separated round numbers to compare side by side, e.g. "0,3,6,10".')
    ap.add_argument('--override', action='append', default=None,
                     help='TEAM:score,score,score -- that team\'s actual results instead of their historical average. Repeatable.')
    ap.add_argument('--coeffs-path', default='data/team_market_coeffs.json')
    ap.add_argument('--history-path', default='data/roddy_history.json')
    ap.add_argument('--roster-path', default='data/h2h_divisions.json')
    ap.add_argument('--n-sim', type=int, default=10000)
    args = ap.parse_args()

    overrides = parse_overrides(args.override)

    rounds_to_run = [int(r) for r in args.compare.split(',')] if args.compare else [args.round or 0]

    print(f"Shrinkage at each round tested: " +
          ", ".join(f"r{r}={early_season_shrinkage(r):.2f}" for r in rounds_to_run))
    print()

    for round_num in rounds_to_run:
        rows, adjustments = run_one(args.division, round_num, overrides, args.coeffs_path,
                                     args.history_path, args.roster_path, args.n_sim)
        print(f"=== Round {round_num} (shrinkage={early_season_shrinkage(round_num):.2f}) ===")
        for r in sorted(rows, key=lambda r: -r['win_div_pct']):
            print(f"  {r['team']:25s} win_div={r['win_div_pct']:6.2f}%  "
                  f"top3={r.get('top3_pct', 0):6.2f}%  "
                  f"promo={r.get('promotion_pct', '--' if 'promotion_pct' not in r else r['promotion_pct'])}")
        if adjustments:
            print(f"  (live-data adjustments applied: {len(adjustments)})")
            for a in adjustments:
                if 'team' in a:
                    print(f"    {a['team']}: observed_avg={a['observed_avg']} vs predicted_avg={a['predicted_avg']} "
                          f"-> shift {a['original_shift']} -> {a['adjusted_shift']} (confidence={a['confidence']})")
        print()


if __name__ == '__main__':
    main()
