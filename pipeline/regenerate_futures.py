"""
Regenerates the live futures.json using the new (v3) coefficients.

Runs at 25,000 simulations x 3 distinct seeds, averaged -- the same
methodology REVIEW.md already established and vetted for the coefficient
review (not a new, untested approach), specifically because a single
6,000-simulation run left at least one division (2A) with a seed-to-seed
spread wide enough to flag as low-confidence. Every team/market's final
percentage is the mean across all 3 seeds; the seed-to-seed spread
(max - min across the 3 seeds, in percentage points) is computed and
reported for every entry rather than silently averaged away, and anything
above SPREAD_FLAG_THRESHOLD is printed explicitly and written to
seed_spread_report.json so a high-variance result stays visible instead
of looking as confident as a stable one.

Extends the existing eliza_rebuild_markets.py logic with the one piece it
didn't handle: promotion_pct for Division 2 and Division 3 is a SHARED
pool across both conferences (2A+2B combined top 4; 3A+3B combined top 6)
-- confirmed directly from the app's own promotionPoolKey() and its use in
multi-bet conflict-blocking, which only makes sense if the underlying
probability reflects a merged-standings simulation, not each conference
judged independently. The reference script simulated each division in
isolation and never computed promotion_pct at all.

Also applies the app's own toOdds() transformation (same formula, same
constants: ODDS_FLOOR=1.005, ODDS_CAP=1001, SUSPEND_BELOW=1.0025, 5%
margin) so the output "odds" fields are directly usable, matching the
existing futures.json's own pre-computed-odds format exactly.
"""
import json
import numpy as np

N_SIM = 25000
SEEDS = [7, 17, 27]
SPREAD_FLAG_THRESHOLD = 10.0  # percentage points -- matches the level REVIEW.md flagged as "high" for 2A

ODDS_FLOOR, ODDS_CAP, SUSPEND_BELOW = 1.005, 1001, 1.0025
RELEGATION_WEIGHT = 0.5


def to_odds(pct):
    p = pct / 100
    if p <= 0:
        return {'odds': ODDS_CAP, 'suspended': False}
    raw = 1 / (p * 1.05)
    if raw < SUSPEND_BELOW:
        return {'odds': None, 'suspended': True}
    raw = max(ODDS_FLOOR, min(raw, ODDS_CAP))
    odds = round(raw, 2)
    odds = max(ODDS_FLOOR, min(odds, ODDS_CAP))
    return {'odds': odds, 'suspended': False}


def make_sampler(values, shift):
    values = np.round(np.array(values) + shift)
    n = len(values)
    def sample(count):
        idx = np.random.randint(0, n, count)
        return values[idx]
    return sample


def round_robin_schedule(teams, total_rounds=26):
    t = list(teams); n = len(t)
    if n % 2 == 1: t.append(None); n += 1
    half, arr, schedule = n // 2, t[:], []
    for _ in range(n - 1):
        pairs = [(arr[i], arr[n-1-i]) for i in range(half) if arr[i] is not None and arr[n-1-i] is not None]
        schedule.append(pairs)
        arr = [arr[0]] + [arr[-1]] + arr[1:-1]
    double = schedule + schedule
    return [double[i % len(double)] for i in range(total_rounds)]


def run_one_seed(seed, new_divs, history, team_coeffs, scale, all_teams, division_schedules):
    """One full pass of the division + roddy simulation at a single seed.
    Returns per-team-per-market raw win% for this seed alone -- averaging
    and spread computation happen one level up, across all seeds."""
    np.random.seed(seed)

    def build_samplers(market):
        div_pool = {}
        for div, teams in new_divs.items():
            pool = []
            for t in teams:
                if t in history: pool.extend(history[t])
            div_pool[div] = pool if pool else [60]
        samplers = {}
        for div, teams in new_divs.items():
            for t in teams:
                # Any roster team missing from team_coeffs gets treated as
                # perfectly average rather than crashing the whole run --
                # matches the same fallback now used in the automated
                # weekly pipeline (simulation_adapter.py), added after
                # reproducing a KeyError crash here on 2026-08-12 when the
                # source sheet listed a team not yet in the coefficient
                # file (mid roster-transition placeholder names).
                c = team_coeffs.get(t, {'eliza': 0.0, 'roddy': 0.0, 'fa_cup': 0.0, 'ecl': 0.0,
                                         'relegation_risk': 0.0, 'variance_widen': 0.0})
                base = c[market]
                if market == 'eliza': base = base - RELEGATION_WEIGHT * c['relegation_risk']
                shift = scale * base
                samplers[t] = make_sampler(history.get(t, div_pool[div]), shift)
        return samplers

    eliza_samplers = build_samplers('eliza')
    rank_counts = {div: {t: np.zeros(len(teams), dtype=int) for t in teams} for div, teams in new_divs.items()}
    combined_promo_field = {
        'DIVISION 2': new_divs['DIVISION 2A'] + new_divs['DIVISION 2B'],
        'DIVISION 3': new_divs['DIVISION 3A'] + new_divs['DIVISION 3B'],
    }
    combined_promo_counts = {pool: {t: 0 for t in teams} for pool, teams in combined_promo_field.items()}
    PROMO_N = {'DIVISION 2': 4, 'DIVISION 3': 6}

    for _ in range(N_SIM):
        sim_pts, sim_sfor = {}, {}
        for div, teams in new_divs.items():
            pts = {t: 0 for t in teams}
            sfor = {t: 0.0 for t in teams}
            team_round_scores = {t: eliza_samplers[t](26) for t in teams}
            for rnd_idx, pairs in enumerate(division_schedules[div]):
                for a, b in pairs:
                    sa, sb = team_round_scores[a][rnd_idx], team_round_scores[b][rnd_idx]
                    sfor[a] += sa; sfor[b] += sb
                    if sa > sb: pts[a] += 3
                    elif sb > sa: pts[b] += 3
                    else: pts[a] += 1; pts[b] += 1
            ranking = sorted(teams, key=lambda t: (-pts[t], -sfor[t]))
            for pos, t in enumerate(ranking):
                rank_counts[div][t][pos] += 1
            sim_pts.update(pts); sim_sfor.update(sfor)

        for pool, teams in combined_promo_field.items():
            combined_ranking = sorted(teams, key=lambda t: (-sim_pts[t], -sim_sfor[t]))
            for t in combined_ranking[:PROMO_N[pool]]:
                combined_promo_counts[pool][t] += 1

    def market_rows_for_division(div, teams_dict):
        size = len(teams_dict)
        half = size // 2
        is_eliza = div.startswith('ELIZA')
        is_div3 = div.startswith('DIVISION 3')
        rows = {}
        for team, counts in teams_dict.items():
            m = {
                'win_div_pct': 100 * counts[0] / N_SIM,
                'top3_pct': 100 * counts[:3].sum() / N_SIM,
                'top_half_pct': 100 * counts[:half].sum() / N_SIM,
                'bottom_half_pct': 100 * counts[size-half:].sum() / N_SIM,
                'wooden_spoon_pct': 100 * counts[-1] / N_SIM,
            }
            if not is_eliza:
                pool = 'DIVISION 3' if is_div3 else 'DIVISION 2'
                m['promotion_pct'] = 100 * combined_promo_counts[pool][team] / N_SIM
            if is_eliza or not is_div3:
                m['relegation_pct'] = 100 * counts[size - (4 if is_eliza else 3):].sum() / N_SIM
            if is_div3:
                m['bottom3_pct'] = 100 * counts[-3:].sum() / N_SIM
            rows[team] = m
        return rows

    division_results = {div: market_rows_for_division(div, teams_dict) for div, teams_dict in rank_counts.items()}

    roddy_samplers = build_samplers('roddy')
    roddy_positions = {t: np.zeros(len(all_teams), dtype=int) for t in all_teams}
    for _ in range(N_SIM):
        totals = {}
        for div, teams in new_divs.items():
            for t in teams:
                totals[t] = roddy_samplers[t](26).sum()
        ranking = sorted(all_teams, key=lambda t: -totals[t])
        for pos, t in enumerate(ranking):
            roddy_positions[t][pos] += 1
    roddy_market_map = {
        'roddy_win_pct': lambda c: c[0], 'roddy_top3_pct': lambda c: c[:3].sum(),
        'roddy_top5_pct': lambda c: c[:5].sum(), 'roddy_top10_pct': lambda c: c[:10].sum(),
    }
    roddy_results = {
        market_key: {t: 100 * count_fn(counts) / N_SIM for t, counts in roddy_positions.items()}
        for market_key, count_fn in roddy_market_map.items()
    }

    return division_results, roddy_results


def average_with_spread(per_seed_values):
    """per_seed_values: list of floats, one per seed. Returns (mean, spread)."""
    arr = np.array(per_seed_values)
    return float(arr.mean()), float(arr.max() - arr.min())


def main():
    new_divs = json.load(open('new_divs.json'))
    history = json.load(open('roddy_history.json'))
    tmc = json.load(open('team_market_coeffs_v3.json'))
    scale = tmc['scale']
    team_coeffs = tmc['team_coeffs']
    existing_futures = json.load(open('existing_futures.json'))

    all_teams = [t for teams in new_divs.values() for t in teams]
    division_schedules = {div: round_robin_schedule(teams, 26) for div, teams in new_divs.items()}

    print(f"Running {len(SEEDS)} seeds x {N_SIM} simulations each...")
    per_seed_division, per_seed_roddy = [], []
    for seed in SEEDS:
        div_res, roddy_res = run_one_seed(seed, new_divs, history, team_coeffs, scale, all_teams, division_schedules)
        per_seed_division.append(div_res)
        per_seed_roddy.append(roddy_res)
        print(f"  seed {seed} done")

    spread_report = []

    divisions_out = {}
    for div in new_divs:
        market_keys = existing_futures['divisions'][div].keys()
        divisions_out[div] = {}
        for market_key in market_keys:
            entries = []
            for team in new_divs[div]:
                per_seed_pcts = [per_seed_division[i][div][team][market_key] for i in range(len(SEEDS))]
                mean_pct, spread = average_with_spread(per_seed_pcts)
                if spread >= SPREAD_FLAG_THRESHOLD:
                    spread_report.append({'division': div, 'team': team, 'market': market_key,
                                           'mean_pct': round(mean_pct, 1), 'spread_pts': round(spread, 1),
                                           'per_seed_pcts': [round(p, 1) for p in per_seed_pcts]})
                entries.append({'team': team, **to_odds(mean_pct)})
            entries_unsuspended = sorted([e for e in entries if not e['suspended']], key=lambda e: e['odds'])
            entries_suspended = [e for e in entries if e['suspended']]
            divisions_out[div][market_key] = entries_unsuspended + entries_suspended

    roddy_out = {}
    for market_key in per_seed_roddy[0]:
        entries = []
        for t in all_teams:
            per_seed_pcts = [per_seed_roddy[i][market_key][t] for i in range(len(SEEDS))]
            mean_pct, spread = average_with_spread(per_seed_pcts)
            if spread >= SPREAD_FLAG_THRESHOLD:
                spread_report.append({'division': 'RODDY', 'team': t, 'market': market_key,
                                       'mean_pct': round(mean_pct, 1), 'spread_pts': round(spread, 1),
                                       'per_seed_pcts': [round(p, 1) for p in per_seed_pcts]})
            entries.append({'team': t, **to_odds(mean_pct)})
        roddy_out[market_key] = sorted([e for e in entries if not e['suspended']], key=lambda e: e['odds']) + \
                                  [e for e in entries if e['suspended']]

    fa_cup_out = existing_futures['fa_cup_markets']
    ecl_field = existing_futures['ecl_field']
    ecl_out = existing_futures['ecl_markets']

    result = {
        'market_labels': existing_futures['market_labels'],
        'roddy_labels': existing_futures['roddy_labels'],
        'divisions': divisions_out,
        'roddy': roddy_out,
        'ecl_field': ecl_field,
        'fa_cup_labels': existing_futures['fa_cup_labels'],
        'fa_cup_markets': fa_cup_out,
        'ecl_labels': existing_futures['ecl_labels'],
        'ecl_markets': ecl_out,
        'ecl_groups': existing_futures['ecl_groups'],
    }
    json.dump(result, open('futures_v3.json', 'w'), indent=2)
    spread_report.sort(key=lambda r: -r['spread_pts'])
    json.dump(spread_report, open('seed_spread_report.json', 'w'), indent=2)

    print(f"\nWrote futures_v3.json ({len(SEEDS)} seeds x {N_SIM} sims, averaged)")
    print(f"Wrote seed_spread_report.json -- {len(spread_report)} entries with spread >= {SPREAD_FLAG_THRESHOLD}pts")
    if spread_report:
        print("Highest-spread entries:")
        for r in spread_report[:5]:
            print(f"  {r['team']} ({r['division']}, {r['market']}): mean={r['mean_pct']}%, "
                  f"spread={r['spread_pts']}pts, per-seed={r['per_seed_pcts']}")


if __name__ == '__main__':
    main()
