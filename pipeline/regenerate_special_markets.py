"""
Proper regeneration of special_markets.json (charity and philanthropy).

Methodology confirmed directly from the app's own UI labels, not guessed:
  "Most Charity (least points conceded all season)"
  "Most Philanthropy (most points conceded all season)"
-- and cross-checked against app.js's own computeDivisionStandings(),
which tracks the identical statistic as scoreAgainst (the sum of each
opponent's score across every one of a team's matches). Charity/
philanthropy are whole-league markets (one flat 62-team list, confirmed
by the file's own structure), so this simulates every division's real
schedule together in each iteration -- not per-division independently --
since a team's points-conceded total depends on who they actually play,
the same reason the Roddy market needed a whole-league simulation rather
than treating each team's score as an independent draw.

Pre-season baseline (rounds_completed=0, maximum shrinkage) -- there is
no per-round structure in this file the way leading_at.json has one, and
the currently-deployed futures.json is itself a pre-season snapshot, so
this matches that same point in the season for consistency.
"""
import json
import numpy as np
import sys
sys.path.insert(0, '/mnt/user-data/outputs/pipeline')
from simulation_adapter import (
    compute_adjusted_shifts, early_season_shrinkage, shrink_values_toward_pool,
    make_sampler, round_robin_schedule, TOTAL_ROUNDS,
)

MARGIN = 1.05
ODDS_FLOOR = 1.005
ODDS_CAP = 1001
SUSPEND_BELOW_ODDS = 1.0025


def pct_to_odds(pct):
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


def simulate_charity_philanthropy(divs, team_coeffs, scale, history, rounds_completed=0, n_sim=15000, seed=7):
    np.random.seed(seed)
    shrink = early_season_shrinkage(rounds_completed)
    all_teams = [t for teams in divs.values() for t in teams]
    division_schedules = {d: round_robin_schedule(teams) for d, teams in divs.items()}

    div_pool = {}
    for d, teams in divs.items():
        pool = []
        for t in teams:
            if t in history: pool.extend(history[t])
        div_pool[d] = pool if pool else [60]

    samplers = {}
    for d, teams in divs.items():
        for t in teams:
            c = team_coeffs.get(t, {'eliza': 0.0, 'relegation_risk': 0.0})
            base = c.get('eliza', 0.0) - 0.5 * c.get('relegation_risk', 0.0)
            shift = scale * base * shrink
            own_values = history.get(t, div_pool[d])
            if t in history:
                own_values = shrink_values_toward_pool(own_values, div_pool[d], shrink)
            samplers[t] = make_sampler(own_values, shift)

    fewest_conceded_wins = {t: 0 for t in all_teams}
    most_conceded_wins = {t: 0 for t in all_teams}

    for _ in range(n_sim):
        conceded = {t: 0 for t in all_teams}
        for d, teams in divs.items():
            team_round_scores = {t: samplers[t](TOTAL_ROUNDS) for t in teams}
            # Bug caught before running this: round_robin_schedule returns
            # one list of pairs PER ROUND (26 rounds total), not a flat
            # pair list -- enumerate is required to correctly align each
            # round's pairs with that same round's sampled scores, exactly
            # matching simulate_division_futures()'s own established
            # pattern. The first version of this loop iterated every pair
            # against every round index independently, overcounting
            # conceded totals by roughly 26x.
            for rnd_idx, pairs in enumerate(division_schedules[d]):
                for a, b in pairs:
                    sa, sb = team_round_scores[a][rnd_idx], team_round_scores[b][rnd_idx]
                    conceded[a] += sb
                    conceded[b] += sa
        fewest = min(all_teams, key=lambda t: conceded[t])
        most = max(all_teams, key=lambda t: conceded[t])
        fewest_conceded_wins[fewest] += 1
        most_conceded_wins[most] += 1

    def to_market(wins_dict):
        entries = []
        for t in all_teams:
            pct = 100 * wins_dict[t] / n_sim
            conv = pct_to_odds(pct)
            entries.append({'team': t, 'odds': conv['odds'], 'suspended': conv['suspended']})
        entries.sort(key=lambda e: (e['odds'] is None, e['odds'] if e['odds'] is not None else 0))
        return entries

    return to_market(fewest_conceded_wins), to_market(most_conceded_wins)


def main():
    divs = json.load(open('/mnt/user-data/outputs/bilbbet-repo/data/h2h_divisions.json'))
    tmc = json.load(open('/mnt/user-data/outputs/bilbbet-repo/data/team_market_coeffs.json'))
    history = json.load(open('/mnt/user-data/outputs/bilbbet-repo/data/roddy_history.json'))

    print("Simulating charity (fewest conceded) and philanthropy (most conceded)...")
    charity, philanthropy = simulate_charity_philanthropy(
        divs, tmc['team_coeffs'], tmc['scale'], history, rounds_completed=0, n_sim=15000)

    out = {'charity': charity, 'philanthropy': philanthropy}
    json.dump(out, open('/mnt/user-data/outputs/bilbbet-repo/data/special_markets_regenerated.json', 'w'), indent=2)
    print("Wrote special_markets_regenerated.json")


if __name__ == '__main__':
    main()
