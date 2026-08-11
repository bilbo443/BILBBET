"""
Regenerates the live futures.json using the new (v3) coefficients.

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
Inputs expected in the working directory when run:
  - new_divs.json: current (26/27) division rosters (h2h_divisions.json)
  - roddy_history.json: per-team historical score pools -- the
    AUTHORITATIVE source is roddy_history_rebuilt.json from the
    coefficient_rebuild pipeline; teams present in the live app's own
    roddy_history.json but absent from the authoritative source should be
    merged in (not dropped), since their data isn't contradicted, just not
    yet present in the rebuilt source.
  - team_market_coeffs_v3.json: output of rebuild_coefficients_v2.py
  - existing_futures.json: the CURRENT live futures.json, used only to
    preserve static structure/labels/ECL field and (deliberately) the
    existing FA Cup/ECL markets -- see note below.

Deliberately NOT regenerated: FA Cup and ECL's stage-by-stage markets
(reach R32/R16/QF/SF/Final, ECL's group-stage-to-knockout structure).
This script's knockout_sim only tracks the eventual winner, and the exact
group-stage seeding/advancement rules for ECL weren't confirmed at the
time this was written. Extending this properly is a real follow-up, not
an oversight -- flagged explicitly rather than deployed on an assumption.

Output: futures_v3.json, in the exact shape the live app's futures.json
expects -- copy directly over it to deploy.
"""
import json
import numpy as np

np.random.seed(7)
N_SIM = 6000

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


def main():
    new_divs = json.load(open('new_divs.json'))
    history = json.load(open('roddy_history.json'))
    tmc = json.load(open('team_market_coeffs_v3.json'))
    scale = tmc['scale']
    team_coeffs = tmc['team_coeffs']
    existing_futures = json.load(open('existing_futures.json'))  # for preserving static metadata

    all_teams = [t for teams in new_divs.values() for t in teams]

    def build_samplers(market):
        div_pool = {}
        for div, teams in new_divs.items():
            pool = []
            for t in teams:
                if t in history:
                    pool.extend(history[t])
            div_pool[div] = pool if pool else [60]

        samplers = {}
        for div, teams in new_divs.items():
            for t in teams:
                c = team_coeffs[t]
                base = c[market]
                if market == 'eliza':
                    base = base - RELEGATION_WEIGHT * c['relegation_risk']
                shift = scale * base
                if t in history:
                    samplers[t] = make_sampler(history[t], shift)
                else:
                    samplers[t] = make_sampler(div_pool[div], shift)
        return samplers

    division_schedules = {div: round_robin_schedule(teams, 26) for div, teams in new_divs.items()}

    # ---------- Division-level standings simulation ----------
    eliza_samplers = build_samplers('eliza')
    rank_counts = {div: {t: np.zeros(len(teams), dtype=int) for t in teams} for div, teams in new_divs.items()}
    # Combined-standings position tracking for cross-conference promotion pools
    combined_promo_field = {
        'DIVISION 2': new_divs['DIVISION 2A'] + new_divs['DIVISION 2B'],
        'DIVISION 3': new_divs['DIVISION 3A'] + new_divs['DIVISION 3B'],
    }
    combined_promo_counts = {
        pool: {t: 0 for t in teams} for pool, teams in combined_promo_field.items()
    }
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

        # Merge each promotion pool's two conferences into one combined
        # standings for this simulation run, same tiebreak (points, then
        # score-for) as within a single division.
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

    divisions_out = {}
    for div, teams_dict in rank_counts.items():
        market_vals = market_rows_for_division(div, teams_dict)
        divisions_out[div] = {}
        # Match the existing file's exact market-key set per division
        for market_key in existing_futures['divisions'][div].keys():
            entries = []
            for team, m in market_vals.items():
                pct = m[market_key]
                odds_info = to_odds(pct)
                entries.append({'team': team, **odds_info})
            entries_unsuspended = sorted([e for e in entries if not e['suspended']], key=lambda e: e['odds'])
            entries_suspended = [e for e in entries if e['suspended']]
            divisions_out[div][market_key] = entries_unsuspended + entries_suspended

    # ---------- Roddy futures ----------
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
    roddy_out = {}
    for market_key, count_fn in roddy_market_map.items():
        entries = []
        for t, counts in roddy_positions.items():
            pct = 100 * count_fn(counts) / N_SIM
            entries.append({'team': t, **to_odds(pct)})
        roddy_out[market_key] = sorted([e for e in entries if not e['suspended']], key=lambda e: e['odds']) + \
                                  [e for e in entries if e['suspended']]

    # ---------- FA Cup & ECL knockout ----------
    def knockout_sim(field, samplers, n_sim=4000):
        wins = {t: 0 for t in field}
        for _ in range(n_sim):
            pool = list(field)
            np.random.shuffle(pool)
            while len(pool) > 1:
                nxt = []
                for i in range(0, len(pool) - 1, 2):
                    a, b = pool[i], pool[i+1]
                    sa, sb = samplers[a](1)[0], samplers[b](1)[0]
                    nxt.append(a if sa >= sb else b)
                if len(pool) % 2 == 1:
                    nxt.append(pool[-1])
                pool = nxt
            wins[pool[0]] += 1
        return {t: 100 * w / n_sim for t, w in wins.items()}

    # FA Cup and ECL are NOT regenerated here. Both have detailed,
    # stage-by-stage markets (reach R32/R16/QF/SF/Final for FA Cup; a
    # 12-team group stage feeding an 8-team knockout for ECL) that this
    # script's simple knockout_sim (tracks only the eventual winner) can't
    # correctly reproduce, and the exact group-stage seeding/advancement
    # rules weren't available to confirm here. Deliberately left as the
    # existing, already-correct odds rather than risk deploying a bracket
    # simulation built on assumptions about rules that weren't verified --
    # a real follow-up, not an oversight.
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
    print("Wrote futures_v3.json")


if __name__ == '__main__':
    main()
