"""
Regenerates FA Cup and ECL futures odds -- deliberately left out of the
main regenerate_futures.py rebuild until these exact rules were confirmed
directly, since guessing at bracket/group structure for real-money markets
wasn't an acceptable risk. Rules, as given:

FA CUP (62 teams, Round of 64 is the entry stage):
  - The two byes needed to fill a 64-slot bracket go to the top 2 Roddy
    finishers from the PREVIOUS season (25/26) -- confirmed directly from
    the trophy CSV's RODDY.5 column (25/26): Silverman's XI (1st) and Big
    Mac FC (2nd). Not a guess -- read from the actual season data.
  - Those 2 teams skip straight to Round of 32. The other 60 teams play
    Round of 64 (30 matches); the 30 winners join the 2 bye teams to make
    32 for Round of 32.
  - No seeding at any stage -- every round's pairings are a genuine random
    draw among whoever's left in that round.

ECL (12 teams, 3 groups of 4, confirmed from ecl_groups' existing A/B/C
shape and "3 matchdays" cleanly matching a round-robin within a 4-team
group):
  - Since the real group draw hasn't happened, each simulation run
    randomly assigns the 12 teams into 3 fresh groups of 4.
  - Full round-robin within each group (3 matchdays, points + score-for
    tiebreak -- same convention as every other standings computation in
    this pipeline).
  - Top 2 of each group (6 teams total) reach the knockout stage.
  - Of those 6, ranked again by group-stage points/score-for: the best 2
    go straight to the Semi-Final. The other 4 play a single random-draw
    knockout round to produce the other 2 semi-finalists -- this stage
    has no separate tracked market (matches ecl_labels having no
    reach_qf_pct key at all).
  - No seeding at any knockout draw.

Both competitions: multi-seed averaged (25,000 sims x 3 seeds), same
methodology as the rest of this pipeline, with the same seed-spread
reporting.
"""
import json
import numpy as np

N_SIM = 25000
SEEDS = [7, 17, 27]
SPREAD_FLAG_THRESHOLD = 10.0

ODDS_FLOOR, ODDS_CAP, SUSPEND_BELOW = 1.005, 1001, 1.0025
RELEGATION_WEIGHT = 0.5

FA_CUP_BYE_TEAMS = ["SILVERMAN'S XI", 'BIG MAC FC']


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


def make_sampler(rng, values, shift):
    values = np.round(np.array(values) + shift)
    n = len(values)
    def sample():
        return values[rng.integers(0, n)]
    return sample


def build_samplers(rng, market, new_divs, history, team_coeffs, scale):
    div_pool = {}
    for div, teams in new_divs.items():
        pool = []
        for t in teams:
            if t in history: pool.extend(history[t])
        div_pool[div] = pool if pool else [60]
    samplers = {}
    for div, teams in new_divs.items():
        for t in teams:
            # Same neutral fallback as the division futures scripts -- see
            # regenerate_futures.py and simulation_adapter.py for the
            # 2026-08-12 crash this was found and fixed alongside.
            c = team_coeffs.get(t, {'eliza': 0.0, 'roddy': 0.0, 'fa_cup': 0.0, 'ecl': 0.0,
                                     'relegation_risk': 0.0, 'variance_widen': 0.0})
            base = c[market]
            shift = scale * base
            samplers[t] = make_sampler(rng, history.get(t, div_pool[div]), shift)
    return samplers


def play_match(rng, samplers, a, b):
    """Single-leg knockout match: higher single-round sampled score wins.
    A genuine tie (rare, integer scores) is broken by a coin flip -- no
    real-world extra-time/penalty modelling exists elsewhere in this
    pipeline to draw on, so this stays simple rather than invent one."""
    sa, sb = samplers[a](), samplers[b]()
    if sa == sb:
        return a if rng.random() < 0.5 else b
    return a if sa > sb else b


def knockout_round(rng, samplers, teams):
    """One random-draw knockout round. Returns the list of winners."""
    pool = list(teams)
    rng.shuffle(pool)
    winners = []
    for i in range(0, len(pool) - 1, 2):
        winners.append(play_match(rng, samplers, pool[i], pool[i+1]))
    if len(pool) % 2 == 1:
        winners.append(pool[-1])
    return winners


def run_fa_cup_seed(seed, all_teams, samplers_builder):
    rng = np.random.default_rng(seed)
    samplers = samplers_builder(rng)
    reach = {t: {'r32': 0, 'r16': 0, 'qf': 0, 'sf': 0, 'final': 0, 'win': 0} for t in all_teams}

    field_r64 = [t for t in all_teams if t not in FA_CUP_BYE_TEAMS]
    for _ in range(N_SIM):
        r32_winners = knockout_round(rng, samplers, field_r64) + list(FA_CUP_BYE_TEAMS)
        for t in r32_winners: reach[t]['r32'] += 1
        r16_winners = knockout_round(rng, samplers, r32_winners)
        for t in r16_winners: reach[t]['r16'] += 1
        qf_winners = knockout_round(rng, samplers, r16_winners)
        for t in qf_winners: reach[t]['qf'] += 1
        sf_winners = knockout_round(rng, samplers, qf_winners)
        for t in sf_winners: reach[t]['sf'] += 1
        final_winners = knockout_round(rng, samplers, sf_winners)
        for t in final_winners: reach[t]['final'] += 1
        champion = knockout_round(rng, samplers, final_winners)
        reach[champion[0]]['win'] += 1

    return {t: {k: 100 * v / N_SIM for k, v in stages.items()} for t, stages in reach.items()}


def group_standings(rng, samplers, group):
    pts = {t: 0 for t in group}
    sfor = {t: 0.0 for t in group}
    for i in range(len(group)):
        for j in range(i + 1, len(group)):
            a, b = group[i], group[j]
            sa, sb = samplers[a](), samplers[b]()
            sfor[a] += sa; sfor[b] += sb
            if sa > sb: pts[a] += 3
            elif sb > sa: pts[b] += 3
            else: pts[a] += 1; pts[b] += 1
    return sorted(group, key=lambda t: (-pts[t], -sfor[t])), pts, sfor


def run_ecl_seed(seed, ecl_field, samplers_builder):
    rng = np.random.default_rng(seed)
    samplers = samplers_builder(rng)
    reach = {t: {'knockout': 0, 'sf': 0, 'final': 0, 'win': 0} for t in ecl_field}

    for _ in range(N_SIM):
        shuffled = list(ecl_field)
        rng.shuffle(shuffled)
        groups = [shuffled[0:4], shuffled[4:8], shuffled[8:12]]

        knockout_six = []
        all_pts, all_sfor = {}, {}
        for g in groups:
            ranking, pts, sfor = group_standings(rng, samplers, g)
            knockout_six.extend(ranking[:2])
            all_pts.update(pts); all_sfor.update(sfor)
        for t in knockout_six: reach[t]['knockout'] += 1

        ranked_six = sorted(knockout_six, key=lambda t: (-all_pts[t], -all_sfor[t]))
        bye_two = ranked_six[:2]
        playin_four = ranked_six[2:]
        playin_winners = knockout_round(rng, samplers, playin_four)

        sf_field = bye_two + playin_winners
        for t in sf_field: reach[t]['sf'] += 1
        final_two = knockout_round(rng, samplers, sf_field)
        for t in final_two: reach[t]['final'] += 1
        champion = knockout_round(rng, samplers, final_two)
        reach[champion[0]]['win'] += 1

    return {t: {k: 100 * v / N_SIM for k, v in stages.items()} for t, stages in reach.items()}


def average_with_spread(per_seed_values):
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
    ecl_field = existing_futures['ecl_field']

    for t in FA_CUP_BYE_TEAMS:
        assert t in all_teams, f"Bye team {t} not found in current roster"
    for t in ecl_field:
        assert t in all_teams, f"ECL field team {t} not found in current roster"

    print(f"Running FA Cup: {len(SEEDS)} seeds x {N_SIM} sims each...")
    fa_cup_per_seed = []
    for seed in SEEDS:
        builder = lambda rng: build_samplers(rng, 'fa_cup', new_divs, history, team_coeffs, scale)
        fa_cup_per_seed.append(run_fa_cup_seed(seed, all_teams, builder))
        print(f"  seed {seed} done")

    print(f"Running ECL: {len(SEEDS)} seeds x {N_SIM} sims each...")
    ecl_per_seed = []
    for seed in SEEDS:
        builder = lambda rng: build_samplers(rng, 'ecl', new_divs, history, team_coeffs, scale)
        ecl_per_seed.append(run_ecl_seed(seed, ecl_field, builder))
        print(f"  seed {seed} done")

    spread_report = []

    fa_cup_stage_map = {'reach_r32_pct': 'r32', 'reach_r16_pct': 'r16', 'reach_qf_pct': 'qf',
                         'reach_sf_pct': 'sf', 'reach_final_pct': 'final', 'win_pct': 'win'}
    fa_cup_out = {}
    for market_key, stage in fa_cup_stage_map.items():
        entries = []
        for t in all_teams:
            per_seed_pcts = [fa_cup_per_seed[i][t][stage] for i in range(len(SEEDS))]
            mean_pct, spread = average_with_spread(per_seed_pcts)
            if spread >= SPREAD_FLAG_THRESHOLD:
                spread_report.append({'competition': 'FA CUP', 'team': t, 'market': market_key,
                                       'mean_pct': round(mean_pct, 1), 'spread_pts': round(spread, 1)})
            entries.append({'team': t, **to_odds(mean_pct)})
        fa_cup_out[market_key] = sorted([e for e in entries if not e['suspended']], key=lambda e: e['odds']) + \
                                   [e for e in entries if e['suspended']]

    ecl_stage_map = {'reach_knockout_pct': 'knockout', 'reach_sf_pct': 'sf',
                      'reach_final_pct': 'final', 'win_pct': 'win'}
    ecl_out = {}
    for market_key, stage in ecl_stage_map.items():
        entries = []
        for t in ecl_field:
            per_seed_pcts = [ecl_per_seed[i][t][stage] for i in range(len(SEEDS))]
            mean_pct, spread = average_with_spread(per_seed_pcts)
            if spread >= SPREAD_FLAG_THRESHOLD:
                spread_report.append({'competition': 'ECL', 'team': t, 'market': market_key,
                                       'mean_pct': round(mean_pct, 1), 'spread_pts': round(spread, 1)})
            entries.append({'team': t, **to_odds(mean_pct)})
        ecl_out[market_key] = sorted([e for e in entries if not e['suspended']], key=lambda e: e['odds']) + \
                                [e for e in entries if e['suspended']]

    json.dump({'fa_cup_markets': fa_cup_out, 'ecl_markets': ecl_out}, open('cup_futures_v1.json', 'w'), indent=2)
    spread_report.sort(key=lambda r: -r['spread_pts'])
    json.dump(spread_report, open('cup_seed_spread_report.json', 'w'), indent=2)
    print(f"\nWrote cup_futures_v1.json")
    print(f"Wrote cup_seed_spread_report.json -- {len(spread_report)} entries with spread >= {SPREAD_FLAG_THRESHOLD}pts")
    if spread_report:
        for r in spread_report[:5]:
            print(f"  {r}")


if __name__ == '__main__':
    main()
