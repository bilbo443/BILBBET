"""
Proper regeneration of leading_at.json's corrupted sections.

Not a relabel: the old data's odds were computed under a wrong roster
assumption (the same Division 3A/3B swap found and fixed in
h2h_divisions.json much earlier this session, plus two placeholder-name
generations of the still-unconfirmed Div 2B promotion, plus tonight's
Zouma Kicks Tim Payne -> The Drone Police rename). Relabeling the team
names alone would leave genuinely wrong odds attached to correctly-named
teams. This recomputes every affected value from scratch, from the real,
current roster and the real simulation engine.

Scope, confirmed by re-checking the live file against the current roster
before writing any of this: ELIZA CUP and DIVISION 2A were already fully
correct and are left untouched. DIVISION 2B, 3A, 3B, and the whole-league
roddy_leading_at are regenerated.

Methodology: matches test_run_scenario.py's "every team performs at their
own historical average" mode -- the same approach already used and
verified earlier tonight for the shrinkage ramp itself. For a given round
N, applies early_season_shrinkage(N-1) to the coefficient (matching how
many rounds would have been completed heading into round N), consistent
with how a live weekly run would treat that same point in the season.

division rounds: 2-23 (matching what the corrupted file already covered
-- round 1 was never present for divisions, presumably because Division
2/3's real round 1 is a Mr Median week with no fixtures to project from).
roddy rounds: 1-26 (matching what the file already covered).
"""
import json
import sys
sys.path.insert(0, '/mnt/user-data/outputs/pipeline')
from simulation_adapter import (
    simulate_division_futures, early_season_shrinkage, shrink_values_toward_pool,
    make_sampler, round_robin_schedule, TOTAL_ROUNDS,
)
from test_run_scenario import build_scenario_extracted_results
import numpy as np

MARGIN = 1.05
ODDS_FLOOR = 1.005
ODDS_CAP = 1001
SUSPEND_BELOW_ODDS = 1.0025


def pct_to_odds(pct):
    """Same correct convention used throughout tonight -- suspends near-
    certain outcomes, re-clamps after rounding to avoid the 1.005->1.0
    floating-point bug found and fixed earlier."""
    p = pct / 100
    if p <= 0:
        return {'odds': ODDS_CAP, 'suspended': False}
    raw = 1 / (p * MARGIN)
    if raw < SUSPEND_BELOW_ODDS:
        return {'odds': None, 'suspended': True}
    raw = max(ODDS_FLOOR, min(raw, ODDS_CAP))
    odds = round(raw, 2)
    if odds < ODDS_FLOOR:
        odds = ODDS_FLOOR
    return {'odds': min(odds, ODDS_CAP), 'suspended': False}


def regenerate_division_leading_at(div, team_coeffs, scale, history, divs, rounds, n_sim=15000):
    out = {}
    new_divs = {div: divs[div]}
    for round_num in rounds:
        # "Leading AT round N" means after round N has actually been
        # played, not heading into it -- confirmed by the fact that
        # Division 2/3's round 1 is a Mr Median week with no real
        # fixtures, and the original (corrupted) file's range starts at
        # round 2, not round 1. rounds_completed = round_num directly,
        # not round_num - 1 (an off-by-one caught by comparing this
        # script's first output against test_run_scenario.py's already-
        # validated numbers for the same team before trusting this
        # further).
        rounds_completed = round_num
        extracted = build_scenario_extracted_results(divs[div], history, rounds_completed)
        rows, _ = simulate_division_futures(new_divs, team_coeffs, scale, history, extracted,
                                             n_sim=n_sim, seed=7)
        entries = []
        for r in rows:
            conv = pct_to_odds(r['win_div_pct'])
            entries.append({'team': r['team'], 'odds': conv['odds'], 'suspended': conv['suspended']})
        entries.sort(key=lambda e: (e['odds'] is None, e['odds'] if e['odds'] is not None else 0))
        out[str(round_num)] = entries
    return out


def regenerate_roddy_leading_at(all_teams, divs, team_coeffs, scale, history, rounds, n_sim=15000):
    division_schedules = {d: round_robin_schedule(teams) for d, teams in divs.items()}
    out = {}
    for round_num in rounds:
        rounds_completed = round_num  # same fix as the division function -- see its comment
        shrink = early_season_shrinkage(rounds_completed)
        np.random.seed(7)

        div_pool = {}
        for d, teams in divs.items():
            pool = []
            for t in teams:
                if t in history: pool.extend(history[t])
            div_pool[d] = pool if pool else [60]

        samplers = {}
        for d, teams in divs.items():
            for t in teams:
                c = team_coeffs.get(t, {'roddy': 0.0})
                shift = scale * c.get('roddy', 0.0) * shrink
                own_values = history.get(t, div_pool[d])
                if t in history:
                    own_values = shrink_values_toward_pool(own_values, div_pool[d], shrink)
                samplers[t] = make_sampler(own_values, shift)

        totals_counts = {t: 0 for t in all_teams}
        for _ in range(n_sim):
            totals = {t: samplers[t](TOTAL_ROUNDS).sum() for t in all_teams}
            winner = max(all_teams, key=lambda t: totals[t])
            totals_counts[winner] += 1

        entries = []
        for t in all_teams:
            pct = 100 * totals_counts[t] / n_sim
            conv = pct_to_odds(pct)
            entries.append({'team': t, 'odds': conv['odds'], 'suspended': conv['suspended']})
        entries.sort(key=lambda e: (e['odds'] is None, e['odds'] if e['odds'] is not None else 0))
        out[str(round_num)] = entries
        print(f"  round {round_num} done (shrink={shrink:.2f})")
    return out


def main():
    divs = json.load(open('/mnt/user-data/outputs/bilbbet-repo/data/h2h_divisions.json'))
    tmc = json.load(open('/mnt/user-data/outputs/bilbbet-repo/data/team_market_coeffs.json'))
    team_coeffs = tmc['team_coeffs']
    scale = tmc['scale']
    history = json.load(open('/mnt/user-data/outputs/bilbbet-repo/data/roddy_history.json'))
    la = json.load(open('/mnt/user-data/outputs/bilbbet-repo/data/leading_at.json'))

    division_rounds = list(range(2, 24))  # 2-23, matching what the file already covered
    roddy_rounds = list(range(1, 27))     # 1-26

    for div in ['DIVISION 2B', 'DIVISION 3A', 'DIVISION 3B']:
        print(f"Regenerating leading_at / {div} ...")
        la['leading_at'][div] = regenerate_division_leading_at(
            div, team_coeffs, scale, history, divs, division_rounds)

    print("Regenerating roddy_leading_at (26 rounds, whole league) ...")
    all_teams = [t for teams in divs.values() for t in teams]
    la['roddy_leading_at'] = regenerate_roddy_leading_at(
        all_teams, divs, team_coeffs, scale, history, roddy_rounds)

    json.dump(la, open('/mnt/user-data/outputs/bilbbet-repo/data/leading_at_regenerated.json', 'w'), indent=2)
    print("\nWrote leading_at_regenerated.json")


if __name__ == '__main__':
    main()
