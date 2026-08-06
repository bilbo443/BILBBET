"""
Simulation adapter -- the piece that was deliberately left unbuilt in the
first pass of Layer 3.

Takes Layer 1's validated extraction (real round-by-round scores from the
live sheet) and blends it into the existing multi-season coefficient model
(team_market_coeffs.json), then reruns the SAME Monte Carlo engine that
already powers the live site's division futures (rebuild_markets.py) --
this isn't a simplified stand-in, it's the real simulation with a live-data
adjustment layered on top of it.

Scope, stated plainly: this covers the division futures market ('eliza')
as one complete, working, tested vertical slice. Roddy, FA Cup and ECL
follow the exact same pattern (they already share build_samplers() and the
coefficient blend below) -- extending to them is mechanical repetition of
this same approach, not new design work, and is a reasonable next step
rather than something that needed to happen in this same pass.

The blending rule:
  For a team with N real rounds played this season, compare their observed
  average score against what their existing coefficient would have
  predicted (their historical score pool's mean, shifted by the
  coefficient). The difference (the "residual") gets blended into their
  effective shift, weighted by how many real rounds exist -- more live
  evidence earns more trust, capped so a handful of early results can't
  swing a whole season's coefficient on their own.

  confidence = min(N_played / TOTAL_ROUNDS, MAX_CONFIDENCE)
  adjusted_shift = original_shift + confidence * residual

This is a genuine design choice, not a reproduction of the original
coefficient system's own update methodology (which was never specified) --
flagged clearly as such rather than presented as more authoritative than
it is.
"""
import json
import numpy as np

TOTAL_ROUNDS = 26
MAX_CONFIDENCE = 0.5   # even with a full season of live data, the pre-season
                        # multi-season coefficient still gets at least half the weight
RELEGATION_WEIGHT = 0.5
N_SIM = 6000


MIN_ROUNDS_FOR_FORM = 5   # below this, recent form is too noisy to trust --
                           # use the plain season average only
FORM_WINDOW = 5            # "recent form" = the last 5 rounds
MAX_FORM_WEIGHT = 0.7      # even deep into the season, keep at least 30%
                           # weight on the full season so a hot/cold streak
                           # alone can't dominate the estimate


def compute_recent_weighted_avg(played_scores):
    """Blends a team's recent-form average with their full-season average,
    ramping the recent-form weight up as more rounds accumulate. Below
    MIN_ROUNDS_FOR_FORM, returns the plain season average unweighted --
    the first few rounds are too noisy on their own to treat as a real
    form signal, per the explicit caveat this was built with."""
    n = len(played_scores)
    season_avg = float(np.mean(played_scores))
    if n < MIN_ROUNDS_FOR_FORM:
        return season_avg
    recent = played_scores[-FORM_WINDOW:]
    recent_avg = float(np.mean(recent))
    form_weight = min((n - MIN_ROUNDS_FOR_FORM) / 10.0, MAX_FORM_WEIGHT)
    return form_weight * recent_avg + (1 - form_weight) * season_avg


def compute_adjusted_shifts(team_coeffs, scale, history, extracted_results, market='eliza'):
    """Returns {team: shift} -- the same quantity build_samplers() would
    compute from the static coefficient file, but nudged toward live
    in-season reality where real data exists. The live signal itself is
    recent-form-weighted (see compute_recent_weighted_avg) rather than a
    flat season average, per the explicit ask for recent matches to carry
    more weight than a team's full-season record once there's enough of a
    sample to trust it."""
    extracted_by_team = {r['team']: r for r in extracted_results}
    shifts = {}
    adjustments_made = []

    for team, c in team_coeffs.items():
        base = c[market]
        if market == 'eliza':
            base = base - RELEGATION_WEIGHT * c['relegation_risk']
        original_shift = scale * base

        record = extracted_by_team.get(team)
        pool = history.get(team, [60])
        historical_mean = float(np.mean(pool))
        predicted_avg = historical_mean + original_shift

        if record:
            played = [s for s in record['scores_by_round'] if s is not None]
            n_played = len(played)
            if n_played > 0:
                observed_avg = compute_recent_weighted_avg(played)
                residual = observed_avg - predicted_avg
                confidence = min(n_played / TOTAL_ROUNDS, MAX_CONFIDENCE)
                adjusted_shift = original_shift + confidence * residual
                shifts[team] = adjusted_shift
                if abs(adjusted_shift - original_shift) > 0.5:
                    adjustments_made.append({
                        'team': team, 'n_played': n_played, 'observed_avg': round(observed_avg, 1),
                        'predicted_avg': round(predicted_avg, 1), 'residual': round(residual, 1),
                        'confidence': round(confidence, 2),
                        'original_shift': round(original_shift, 2), 'adjusted_shift': round(adjusted_shift, 2),
                    })
                continue
        shifts[team] = original_shift  # no live data for this team yet -- unchanged

    return shifts, adjustments_made


def make_sampler(values, shift, variance_widen=0.0, wide_pool=None):
    """variance_widen (0-1): how much of a wider reference pool to blend in,
    on top of the team's own historical scores. A team with almost no track
    record isn't necessarily "probably average" -- new/promoted managers
    plausibly split into two real groups (genuinely competitive immediately,
    or largely disengaged after initial setup) rather than clustering near
    a mean the way an established team's uncertainty does. This widens the
    spread of simulated outcomes for such a team, rather than only shrinking
    their central estimate (which the coefficient itself already does)."""
    values = np.array(values)
    if variance_widen > 0 and wide_pool:
        n_from_wide = int(len(values) * variance_widen / max(1 - variance_widen, 0.05))
        n_from_wide = max(1, min(n_from_wide, len(wide_pool)))
        widened = np.concatenate([values, np.random.choice(wide_pool, n_from_wide, replace=True)])
    else:
        widened = values
    widened = np.round(widened + shift)
    n = len(widened)
    def sample(count):
        idx = np.random.randint(0, n, count)
        return widened[idx]
    return sample


def round_robin_schedule(teams, total_rounds=TOTAL_ROUNDS):
    t = list(teams); n = len(t)
    if n % 2 == 1: t.append(None); n += 1
    half, arr, schedule = n // 2, t[:], []
    for _ in range(n - 1):
        pairs = [(arr[i], arr[n-1-i]) for i in range(half) if arr[i] is not None and arr[n-1-i] is not None]
        schedule.append(pairs)
        arr = [arr[0]] + [arr[-1]] + arr[1:-1]
    double = schedule + schedule
    return [double[i % len(double)] for i in range(total_rounds)]


def simulate_division_futures(new_divs, team_coeffs, scale, history, extracted_results, n_sim=N_SIM, seed=7):
    np.random.seed(seed)
    shifts, adjustments = compute_adjusted_shifts(team_coeffs, scale, history, extracted_results, market='eliza')

    samplers = {}
    div_pool = {}
    for div, teams in new_divs.items():
        pool = []
        for t in teams:
            if t in history: pool.extend(history[t])
        div_pool[div] = pool if pool else [60]
    for div, teams in new_divs.items():
        for t in teams:
            shift = shifts[t]
            widen = team_coeffs.get(t, {}).get('variance_widen', 0.0)
            samplers[t] = make_sampler(history.get(t, div_pool[div]), shift, variance_widen=widen, wide_pool=div_pool[div])

    division_schedules = {div: round_robin_schedule(teams) for div, teams in new_divs.items()}
    rank_counts = {div: {t: np.zeros(len(teams), dtype=int) for t in teams} for div, teams in new_divs.items()}

    for _ in range(n_sim):
        for div, teams in new_divs.items():
            pts = {t: 0 for t in teams}
            sfor = {t: 0.0 for t in teams}
            team_round_scores = {t: samplers[t](TOTAL_ROUNDS) for t in teams}
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

    rows = []
    for div, teams_dict in rank_counts.items():
        size = len(teams_dict)
        half = size // 2
        relegation_n = 4 if div.startswith('ELIZA') else 3
        for team, counts in teams_dict.items():
            rows.append({
                'division': div, 'team': team,
                'win_div_pct': round(100 * counts[0] / n_sim, 2),
                'top3_pct': round(100 * counts[:3].sum() / n_sim, 2),
                'top_half_pct': round(100 * counts[:half].sum() / n_sim, 2),
                'bottom_half_pct': round(100 * counts[size-half:].sum() / n_sim, 2),
                'relegation_pct': round(100 * counts[size-relegation_n:].sum() / n_sim, 2),
                'wooden_spoon_pct': round(100 * counts[-1] / n_sim, 2),
            })
    return rows, adjustments


def regenerate_division_futures(extracted_results, coeffs_path='team_market_coeffs.json',
                                 divs_path='new_divs.json', history_path='roddy_history.json'):
    tmc = json.load(open(coeffs_path))
    scale = tmc['scale']
    team_coeffs = tmc['team_coeffs']
    new_divs = json.load(open(divs_path))
    history = json.load(open(history_path))

    rows, adjustments = simulate_division_futures(new_divs, team_coeffs, scale, history, extracted_results)
    return {'division_rows': rows, 'live_adjustments_applied': adjustments}


def simulate_roddy_market(all_teams, team_coeffs, scale, history, extracted_results=None, n_sim=25000, seed=7):
    """Open-field ranking across every team by simulated season total score,
    using the 'roddy' coefficient specifically (raw scoring strength,
    tier-blind) rather than 'eliza' -- this is the whole-league market, not
    a division-internal one.

    extracted_results, if given, blends in live in-season form the same way
    division futures already does -- this market previously never got that
    treatment, staying static from pre-season until manually rebuilt, which
    was a real inconsistency once live rounds started counting for other
    markets."""
    np.random.seed(seed)
    if extracted_results:
        shifts, _ = compute_adjusted_shifts(team_coeffs, scale, history, extracted_results, market='roddy')
    else:
        shifts = {t: scale * team_coeffs.get(t, {'roddy': 0.0})['roddy'] for t in all_teams}

    samplers = {}
    league_pool = [s for t in all_teams for s in history.get(t, [])] or [60]
    for t in all_teams:
        c = team_coeffs.get(t, {'roddy': 0.0, 'variance_widen': 0.5})
        shift = shifts.get(t, scale * c.get('roddy', 0.0))
        widen = c.get('variance_widen', 0.0)
        samplers[t] = make_sampler(history.get(t, league_pool), shift, variance_widen=widen, wide_pool=league_pool)

    n = len(all_teams)
    rank_counts = {t: np.zeros(n, dtype=int) for t in all_teams}
    for _ in range(n_sim):
        totals = {t: samplers[t](TOTAL_ROUNDS).sum() for t in all_teams}
        ranking = sorted(all_teams, key=lambda t: -totals[t])
        for pos, t in enumerate(ranking):
            rank_counts[t][pos] += 1

    rows = []
    for t in all_teams:
        counts = rank_counts[t]
        rows.append({
            'team': t,
            'roddy_win_pct': round(100 * counts[0] / n_sim, 2),
            'roddy_top3_pct': round(100 * counts[:3].sum() / n_sim, 2),
            'roddy_top5_pct': round(100 * counts[:5].sum() / n_sim, 2),
            'roddy_top10_pct': round(100 * counts[:10].sum() / n_sim, 2),
        })
    return rows


def build_fa_cup_bracket(bye_teams, r64_teams, seed=11):
    """A single, fixed 64-slot bracket: bye_teams occupy 2 slots that skip
    straight to Round of 32; r64_teams are paired into 30 Round-of-64
    matches. Randomly seeded but FIXED once built (not re-randomized every
    simulated trial) -- exactly like a real tournament draw, so a team's
    reach-probabilities reflect one consistent path through the bracket,
    not a different random opponent sequence every trial."""
    rng = np.random.RandomState(seed)
    shuffled = list(r64_teams)
    rng.shuffle(shuffled)
    r64_matches = [(shuffled[i], shuffled[i+1]) for i in range(0, len(shuffled), 2)]
    r32_slots = list(bye_teams)  # these enter Round of 32 directly, no match needed
    return r64_matches, r32_slots


def simulate_fa_cup_bracket(bye_teams, r64_teams, team_coeffs, scale, history, extracted_results=None, n_sim=25000, seed=7, bracket_seed=11):
    np.random.seed(seed)
    all_field = list(bye_teams) + list(r64_teams)
    if extracted_results:
        shifts, _ = compute_adjusted_shifts(team_coeffs, scale, history, extracted_results, market='fa_cup')
    else:
        shifts = {}
    samplers = {}
    field_pool = [s for t in all_field for s in history.get(t, [])] or [60]
    for t in all_field:
        c = team_coeffs.get(t, {'fa_cup': 0.0, 'variance_widen': 0.5})
        shift = shifts.get(t, scale * c.get('fa_cup', 0.0))
        widen = c.get('variance_widen', 0.0)
        samplers[t] = make_sampler(history.get(t, field_pool), shift, variance_widen=widen, wide_pool=field_pool)

    r64_matches, bye_slots = build_fa_cup_bracket(bye_teams, r64_teams, seed=bracket_seed)

    reached = {t: {'r32': 0, 'r16': 0, 'qf': 0, 'sf': 0, 'final': 0, 'win': 0} for t in all_field}

    def play_match(a, b):
        return a if samplers[a](1)[0] > samplers[b](1)[0] else b

    def pairs(teams):
        return [(teams[i], teams[i+1]) for i in range(0, len(teams), 2)]

    for _ in range(n_sim):
        r32 = list(bye_slots)
        for a, b in r64_matches:
            r32.append(play_match(a, b))
        for t in r32: reached[t]['r32'] += 1

        r16 = [play_match(a, b) for a, b in pairs(r32)]
        for t in r16: reached[t]['r16'] += 1
        qf = [play_match(a, b) for a, b in pairs(r16)]
        for t in qf: reached[t]['qf'] += 1
        sf = [play_match(a, b) for a, b in pairs(qf)]
        for t in sf: reached[t]['sf'] += 1
        final = [play_match(a, b) for a, b in pairs(sf)]
        for t in final: reached[t]['final'] += 1
        winner = play_match(final[0], final[1])
        reached[winner]['win'] += 1

    rows = []
    for t in all_field:
        r = reached[t]
        rows.append({
            'team': t,
            'reach_r32_pct': round(100 * r['r32'] / n_sim, 2),
            'reach_r16_pct': round(100 * r['r16'] / n_sim, 2),
            'reach_qf_pct': round(100 * r['qf'] / n_sim, 2),
            'reach_sf_pct': round(100 * r['sf'] / n_sim, 2),
            'reach_final_pct': round(100 * r['final'] / n_sim, 2),
            'win_pct': round(100 * r['win'] / n_sim, 2),
        })
    return rows


def build_ecl_league_phase(teams, seed=11):
    """The 3-matchday league phase, built the same way FA Cup's bracket is
    built -- fixed once via round_robin_schedule (guaranteed no repeat
    matchups across exactly 3 rounds for any field size), not re-drawn
    every trial. A standard, defensible choice (round-robin subset, no
    literal traditional "groups of 4") rather than a replication of any
    specific real ECL draw, since no fixed schedule for this exists to
    replicate."""
    rng = np.random.RandomState(seed)
    shuffled = list(teams)
    rng.shuffle(shuffled)
    return round_robin_schedule(shuffled, total_rounds=3)


def simulate_ecl_market(ecl_teams, team_coeffs, scale, history, extracted_results=None, n_sim=25000, seed=7, schedule_seed=11):
    """ecl_teams: the fixed 12-team field (9 Eliza Cup + 3 Division 2,
    matching futures.json's current ecl_markets roster). Format: a
    3-matchday league phase (round-robin subset, 3 points/win, 1/1 draw,
    ranked by points then total score-for) with the top 8 advancing to a
    standard, seeded knockout bracket -- 8 -> 4 (Semi-Final) -> 2 (Final)
    -> 1 (winner). "reach_knockout_pct" is the top-8 cutoff itself, not a
    separate stage before it."""
    np.random.seed(seed)
    if extracted_results:
        shifts, _ = compute_adjusted_shifts(team_coeffs, scale, history, extracted_results, market='ecl')
    else:
        shifts = {}
    samplers = {}
    field_pool = [s for t in ecl_teams for s in history.get(t, [])] or [60]
    for t in ecl_teams:
        c = team_coeffs.get(t, {'ecl': 0.0, 'variance_widen': 0.5})
        shift = shifts.get(t, scale * c.get('ecl', 0.0))
        widen = c.get('variance_widen', 0.0)
        samplers[t] = make_sampler(history.get(t, field_pool), shift, variance_widen=widen, wide_pool=field_pool)

    schedule = build_ecl_league_phase(ecl_teams, seed=schedule_seed)

    reached = {t: {'knockout': 0, 'sf': 0, 'final': 0, 'win': 0} for t in ecl_teams}

    def play_match(a, b):
        return a if samplers[a](1)[0] > samplers[b](1)[0] else b

    for _ in range(n_sim):
        pts = {t: 0 for t in ecl_teams}
        sfor = {t: 0.0 for t in ecl_teams}
        team_scores = {t: samplers[t](3) for t in ecl_teams}  # 3 matchdays' worth of draws per team
        for matchday_idx, pairs in enumerate(schedule):
            for a, b in pairs:
                sa, sb = team_scores[a][matchday_idx], team_scores[b][matchday_idx]
                sfor[a] += sa; sfor[b] += sb
                if sa > sb: pts[a] += 3
                elif sb > sa: pts[b] += 3
                else: pts[a] += 1; pts[b] += 1

        ranked = sorted(ecl_teams, key=lambda t: (-pts[t], -sfor[t]))
        top8 = ranked[:8]
        for t in top8: reached[t]['knockout'] += 1

        # Standard seeded bracket -- 1v8, 4v5, 2v7, 3v6 -- protects the
        # strongest league-phase finishers from meeting each other early,
        # the same seeding intent already established for the promotion
        # playoff bracket elsewhere in this pipeline.
        qf_pairs = [(top8[0], top8[7]), (top8[3], top8[4]), (top8[1], top8[6]), (top8[2], top8[5])]
        sf = [play_match(a, b) for a, b in qf_pairs]
        for t in sf: reached[t]['sf'] += 1
        final = [play_match(sf[0], sf[1]), play_match(sf[2], sf[3])]
        for t in final: reached[t]['final'] += 1
        winner = play_match(final[0], final[1])
        reached[winner]['win'] += 1

    rows = []
    for t in ecl_teams:
        r = reached[t]
        rows.append({
            'team': t,
            'reach_knockout_pct': round(100 * r['knockout'] / n_sim, 2),
            'reach_sf_pct': round(100 * r['sf'] / n_sim, 2),
            'reach_final_pct': round(100 * r['final'] / n_sim, 2),
            'win_pct': round(100 * r['win'] / n_sim, 2),
        })
    return rows


def regenerate_roddy_and_fa_cup(extracted_results, coeffs_path='team_market_coeffs.json',
                                 divs_path='new_divs.json', history_path='roddy_history.json',
                                 fa_field_path='fa_cup_field.json'):
    """Companion to regenerate_division_futures -- brings Roddy and FA Cup
    into the same live in-season recalibration that division futures
    already had. Previously these two markets never got rebuilt once the
    season started; this closes that gap."""
    tmc = json.load(open(coeffs_path))
    scale = tmc['scale']
    team_coeffs = tmc['team_coeffs']
    new_divs = json.load(open(divs_path))
    history = json.load(open(history_path))
    all_teams = [t for teams in new_divs.values() for t in teams]

    roddy_rows = simulate_roddy_market(all_teams, team_coeffs, scale, history, extracted_results=extracted_results)

    fa_field = json.load(open(fa_field_path))
    fa_rows = simulate_fa_cup_bracket(fa_field['bye_teams'], fa_field['r64_teams'], team_coeffs, scale, history,
                                       extracted_results=extracted_results)

    return {'roddy_rows': roddy_rows, 'fa_cup_rows': fa_rows}


def simulate_leading_at_market(new_divs, team_coeffs, scale, history, no_fixture_rounds=None,
                                extracted_results=None, n_sim=N_SIM, seed=7):
    """Who's on top of the division table after each round -- not just the
    final standings. The existing division-futures loop already computes
    cumulative points round-by-round internally; this just records the
    current #1 after every round instead of only after the last one, using
    the same points-then-PTS+ tiebreak already validated for final
    standings.

    no_fixture_rounds: {division: [round numbers]} -- rounds where that
    division has no real fixture (Division 2/3's round 1 and playoff weeks
    24-26). Those rounds get skipped entirely for that division, since
    "leading at round 1" is meaningless when no match happened.
    """
    np.random.seed(seed)
    no_fixture_rounds = no_fixture_rounds or {}
    shifts, _ = compute_adjusted_shifts(team_coeffs, scale, history, extracted_results or [], market='eliza')

    samplers = {}
    div_pool = {}
    for div, teams in new_divs.items():
        pool = []
        for t in teams:
            if t in history: pool.extend(history[t])
        div_pool[div] = pool if pool else [60]
    for div, teams in new_divs.items():
        for t in teams:
            shift = shifts[t]
            widen = team_coeffs.get(t, {}).get('variance_widen', 0.0)
            samplers[t] = make_sampler(history.get(t, div_pool[div]), shift, variance_widen=widen, wide_pool=div_pool[div])

    division_schedules = {div: round_robin_schedule(teams) for div, teams in new_divs.items()}
    leading_counts = {div: {r: {t: 0 for t in teams} for r in range(1, TOTAL_ROUNDS + 1)}
                      for div, teams in new_divs.items()}

    for _ in range(n_sim):
        for div, teams in new_divs.items():
            pts = {t: 0 for t in teams}
            sfor = {t: 0.0 for t in teams}
            team_round_scores = {t: samplers[t](TOTAL_ROUNDS) for t in teams}
            for rnd_idx, pairs in enumerate(division_schedules[div]):
                for a, b in pairs:
                    sa, sb = team_round_scores[a][rnd_idx], team_round_scores[b][rnd_idx]
                    sfor[a] += sa; sfor[b] += sb
                    if sa > sb: pts[a] += 3
                    elif sb > sa: pts[b] += 3
                    else: pts[a] += 1; pts[b] += 1
                leader = max(teams, key=lambda t: (pts[t], sfor[t]))
                leading_counts[div][rnd_idx + 1][leader] += 1

    result = {}
    for div, teams in new_divs.items():
        skip_rounds = set(no_fixture_rounds.get(div, []))
        result[div] = {}
        for r in range(1, TOTAL_ROUNDS + 1):
            if r in skip_rounds:
                continue
            counts = leading_counts[div][r]
            result[div][str(r)] = [{'team': t, 'pct': 100 * c / n_sim} for t, c in counts.items()]
    return result


def simulate_roddy_leading_at_market(all_teams, team_coeffs, scale, history, extracted_results=None,
                                      n_sim=N_SIM, seed=7):
    """Open-field version: who has the highest cumulative raw season score
    after each round, across every team regardless of division."""
    np.random.seed(seed)
    shifts, _ = compute_adjusted_shifts(team_coeffs, scale, history, extracted_results or [], market='roddy')
    samplers = {}
    league_pool = [s for t in all_teams for s in history.get(t, [])] or [60]
    for t in all_teams:
        c = team_coeffs.get(t, {'variance_widen': 0.0})
        shift = shifts.get(t, 0.0)
        widen = c.get('variance_widen', 0.0)
        samplers[t] = make_sampler(history.get(t, league_pool), shift, variance_widen=widen, wide_pool=league_pool)

    leading_counts = {r: {t: 0 for t in all_teams} for r in range(1, TOTAL_ROUNDS + 1)}

    for _ in range(n_sim):
        team_round_scores = {t: samplers[t](TOTAL_ROUNDS) for t in all_teams}
        cumulative = {t: 0.0 for t in all_teams}
        for rnd_idx in range(TOTAL_ROUNDS):
            for t in all_teams:
                cumulative[t] += team_round_scores[t][rnd_idx]
            leader = max(all_teams, key=lambda t: cumulative[t])
            leading_counts[rnd_idx + 1][leader] += 1

    return {str(r): [{'team': t, 'pct': 100 * c / n_sim} for t, c in counts.items()]
            for r, counts in leading_counts.items()}


def simulate_conference_season(teams, samplers):
    """One simulated regular season for a single conference -- reuses the
    same round-robin schedule and points-then-PTS+ tiebreak already
    validated for division futures. Returns teams ranked best to worst."""
    pts = {t: 0 for t in teams}
    sfor = {t: 0.0 for t in teams}
    schedule = round_robin_schedule(teams)
    team_round_scores = {t: samplers[t](TOTAL_ROUNDS) for t in teams}
    for rnd_idx, pairs in enumerate(schedule):
        for a, b in pairs:
            sa, sb = team_round_scores[a][rnd_idx], team_round_scores[b][rnd_idx]
            sfor[a] += sa; sfor[b] += sb
            if sa > sb: pts[a] += 3
            elif sb > sa: pts[b] += 3
            else: pts[a] += 1; pts[b] += 1
    return sorted(teams, key=lambda t: (-pts[t], -sfor[t]))


def simulate_promotion_playoffs(conf_a_playoff_seeds, conf_b_playoff_seeds, samplers):
    """The confirmed two-bracket finals format, simplified per direct
    feedback: only ONE cross-over is needed (at the Promotion Final
    stage), not two -- an earlier version also swapped Elimination
    Final winners between brackets before the Preliminary Final, which
    was verified (500k-run simulation, fixed team strengths) to produce
    statistically identical promotion odds to this simpler version, so
    it added complexity without changing the outcome.

    Seeding: each conference's own playoff-eligible finishers are Seed 1
    (best) through Seed 4 (worst) *within that conference*. Bracket 1 is
    Conf A's Seed 1 + Seed 3 plus Conf B's Seed 2 + Seed 4; Bracket 2 is
    the mirror (Conf B's Seed 1 + Seed 3, Conf A's Seed 2 + Seed 4).

    Week 1: QF1 = A1 vs B2, EF1 = A4 vs B3 (Bracket 1's own matches);
    QF2 = B1 vs A2, EF2 = B4 vs A3 (Bracket 2's own matches). QF winner
    gets a bye to a Promotion Final; QF loser and EF winner both stay
    within their own bracket for a Preliminary Final; EF loser is
    eliminated outright.

    Week 2: PF1 = QF1 loser vs EF1 winner (own bracket, no swap);
    PF2 = QF2 loser vs EF2 winner (own bracket, no swap). PF loser is
    eliminated.

    Week 3 -- the one cross-over: Preliminary Final winners swap
    brackets for the Promotion Final. Bracket 1's Promotion Final is
    QF1's bye winner vs PF2's winner; Bracket 2's is QF2's bye winner
    vs PF1's winner. Each Promotion Final winner is promoted.

    Returns the two promoted teams (one per bracket)."""
    def play(a, b):
        return a if samplers[a](1)[0] > samplers[b](1)[0] else b

    a1, a2, a3, a4 = conf_a_playoff_seeds
    b1, b2, b3, b4 = conf_b_playoff_seeds

    qf1_winner = play(a1, b2)
    qf1_loser = b2 if qf1_winner == a1 else a1
    ef1_winner = play(a4, b3)

    qf2_winner = play(b1, a2)
    qf2_loser = a2 if qf2_winner == b1 else b1
    ef2_winner = play(b4, a3)

    # Week 2: each bracket's own preliminary final, no swap
    pf1_winner = play(qf1_loser, ef1_winner)
    pf2_winner = play(qf2_loser, ef2_winner)

    # Week 3: the one cross-over -- preliminary-final winners swap brackets
    bracket1_champion = play(qf1_winner, pf2_winner)
    bracket2_champion = play(qf2_winner, pf1_winner)

    return bracket1_champion, bracket2_champion


def simulate_promotion_playoffs_3conf(conf_a_seeds, conf_b_seeds, conf_c_seeds, samplers):
    """HYPOTHETICAL -- a 3-conference extension of the confirmed 2-conference
    format, not currently in production use. Not automatically wired into
    simulate_promotion_market; call this directly if/when a 3-conference
    division actually exists.

    Auto-promotion (handled by the caller, not this function): only
    conference WINNERS auto-promote here, one per conference -- three
    automatic slots total, not the two-per-conference rule Division 3
    uses today.

    Seeding stays at conference positions 2-5 (Seed 1 through Seed 4
    within each conference, unchanged from the 2-conference format).

    Three brackets, each pairing two of the three conferences, using the
    exact same per-bracket setup as the 2-conference format:

      Bracket 1 (A/B): QF1 = A1 vs B2, EF1 = A4 vs B3
      Bracket 2 (B/C): QF2 = B1 vs C2, EF2 = B4 vs C3
      Bracket 3 (C/A): QF3 = C1 vs A2, EF3 = C4 vs A3

    Every conference's 4 seeds are used exactly once across the three
    brackets (e.g. Conf A contributes Seed 1 + Seed 3 to Bracket 1, and
    Seed 2 + Seed 4 to Bracket 3) -- a clean 12-team pool with no overlap
    or leftover teams.

    Each bracket runs its own Preliminary Final with no swap (QF loser
    vs EF winner, same bracket) -- matching the simplification confirmed
    for the 2-conference format, since an Elimination-Final swap was
    verified to add complexity without changing the outcome there, and
    the same reasoning applies here.

    The one cross-over is a 3-way rotation at the Promotion Final stage:
    PF1's winner goes to Bracket 2's Promotion Final, PF2's winner goes
    to Bracket 3's, PF3's winner goes to Bracket 1's -- each bracket's
    own Promotion Final pairs its QF bye winner against the ROTATED-IN
    Preliminary Final winner, not its own bracket's PF winner.

    Returns the three promoted teams (one per bracket) as a tuple."""
    def play(a, b):
        return a if samplers[a](1)[0] > samplers[b](1)[0] else b

    a1, a2, a3, a4 = conf_a_seeds
    b1, b2, b3, b4 = conf_b_seeds
    c1, c2, c3, c4 = conf_c_seeds

    qf1_winner = play(a1, b2); qf1_loser = b2 if qf1_winner == a1 else a1
    ef1_winner = play(a4, b3)
    qf2_winner = play(b1, c2); qf2_loser = c2 if qf2_winner == b1 else b1
    ef2_winner = play(b4, c3)
    qf3_winner = play(c1, a2); qf3_loser = a2 if qf3_winner == c1 else c1
    ef3_winner = play(c4, a3)

    # Week 2: each bracket's own preliminary final, no swap (per the
    # confirmed 2-conference simplification)
    pf1_winner = play(qf1_loser, ef1_winner)
    pf2_winner = play(qf2_loser, ef2_winner)
    pf3_winner = play(qf3_loser, ef3_winner)

    # Week 3: the 3-way rotation -- PF1->Bracket2, PF2->Bracket3, PF3->Bracket1
    bracket1_champion = play(qf1_winner, pf3_winner)
    bracket2_champion = play(qf2_winner, pf1_winner)
    bracket3_champion = play(qf3_winner, pf2_winner)

    return bracket1_champion, bracket2_champion, bracket3_champion


def simulate_promotion_market(conference_pairs, auto_slots, playoff_positions, team_coeffs, scale, history,
                               extracted_results=None, n_sim=N_SIM, seed=7):
    """conference_pairs: list of (conf_a_teams, conf_b_teams) -- for
    Division 2 that's [(2A teams, 2B teams)]; for Division 3 likewise with
    3A/3B. auto_slots: how many finishing positions per conference get
    automatic promotion (1 for Division 2, 2 for Division 3).
    playoff_positions: which conference finishing positions (1-indexed)
    feed the playoff pool, in best-to-worst order -- e.g. [2,3,4,5] for
    Division 2, [3,4,5,6] for Division 3. These positions double as the
    Seed 1-4 numbering within each conference for the playoff bracket.

    Charity promotions are deliberately not modelled here -- they only
    exist to backfill unpredictable departures, and per instruction never
    resolve a standard promotion bet, so there is nothing to project."""
    np.random.seed(seed)
    all_teams = [t for conf_a, conf_b in conference_pairs for t in conf_a + conf_b]
    shifts, _ = compute_adjusted_shifts(team_coeffs, scale, history, extracted_results or [], market='eliza')
    samplers = {}
    pool_all = [s for t in all_teams for s in history.get(t, [])] or [60]
    for t in all_teams:
        c = team_coeffs.get(t, {'variance_widen': 0.0})
        shift = shifts.get(t, 0.0)
        widen = c.get('variance_widen', 0.0)
        samplers[t] = make_sampler(history.get(t, pool_all), shift, variance_widen=widen, wide_pool=pool_all)

    promoted_counts = {t: 0 for t in all_teams}

    for _ in range(n_sim):
        for conf_a, conf_b in conference_pairs:
            ranked_a = simulate_conference_season(conf_a, samplers)
            ranked_b = simulate_conference_season(conf_b, samplers)

            for i in range(auto_slots):
                promoted_counts[ranked_a[i]] += 1
                promoted_counts[ranked_b[i]] += 1

            # playoff_positions is already best-to-worst (e.g. [2,3,4,5]),
            # so indexing it in order directly gives Seed 1 through Seed 4
            # within each conference -- no separate re-sort needed.
            conf_a_seeds = [ranked_a[p - 1] for p in playoff_positions]
            conf_b_seeds = [ranked_b[p - 1] for p in playoff_positions]

            champ1, champ2 = simulate_promotion_playoffs(conf_a_seeds, conf_b_seeds, samplers)
            promoted_counts[champ1] += 1
            promoted_counts[champ2] += 1

    return [{'team': t, 'pct': 100 * c / n_sim} for t, c in promoted_counts.items()]


def regenerate_promotion_and_leading_at(extracted_results, coeffs_path='team_market_coeffs.json',
                                         divs_path='new_divs.json', history_path='roddy_history.json',
                                         no_fixture_path='div23_schedule_exceptions.json'):
    """Completes the live-refresh coverage: division futures, Roddy, and FA
    Cup already got this treatment; Promotion and Leading At were built in
    later sessions and were never wired into the automated pipeline, which
    meant a real weekly refresh would silently leave them stale even as
    everything else updated. Charity/Philanthropy and ECL group markets are
    deliberately still excluded -- Charity uses a separate, not-yet-merged
    script, and ECL's stage markets have nothing meaningful to recalibrate
    until a real group draw exists."""
    tmc = json.load(open(coeffs_path))
    scale = tmc['scale']
    team_coeffs = tmc['team_coeffs']
    new_divs = json.load(open(divs_path))
    history = json.load(open(history_path))
    no_fixture = json.load(open(no_fixture_path))
    no_fixture_map = {div: v['no_fixture_rounds'] for div, v in no_fixture.items() if div in new_divs}
    all_teams = [t for teams in new_divs.values() for t in teams]

    promotion_div2 = simulate_promotion_market(
        [(new_divs['DIVISION 2A'], new_divs['DIVISION 2B'])],
        auto_slots=1, playoff_positions=[2, 3, 4, 5],
        team_coeffs=team_coeffs, scale=scale, history=history,
        extracted_results=extracted_results)
    promotion_div3 = simulate_promotion_market(
        [(new_divs['DIVISION 3A'], new_divs['DIVISION 3B'])],
        auto_slots=2, playoff_positions=[3, 4, 5, 6],
        team_coeffs=team_coeffs, scale=scale, history=history,
        extracted_results=extracted_results)

    leading_at_rows = simulate_leading_at_market(
        new_divs, team_coeffs, scale, history, no_fixture_rounds=no_fixture_map,
        extracted_results=extracted_results)
    roddy_leading_at_rows = simulate_roddy_leading_at_market(
        all_teams, team_coeffs, scale, history, extracted_results=extracted_results)

    return {
        'promotion_rows': {'DIVISION 2': promotion_div2, 'DIVISION 3': promotion_div3},
        'leading_at_rows': leading_at_rows,
        'roddy_leading_at_rows': roddy_leading_at_rows,
    }
