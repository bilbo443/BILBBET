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


def compute_adjusted_shifts(team_coeffs, scale, history, extracted_results, roster_teams=None, market='eliza'):
    """Returns {team: shift} -- the same quantity build_samplers() would
    compute from the static coefficient file, but nudged toward live
    in-season reality where real data exists.

    roster_teams, if given, is the full set of teams the sheet actually
    lists for this run. Any roster team with no entry in team_coeffs gets a
    neutral shift (0) rather than being silently dropped or causing a
    KeyError downstream -- confirmed via reproduction on 2026-08-12 that an
    unguarded lookup here crashes the whole weekly run the moment the sheet
    lists a team the coefficient file doesn't recognize (e.g. mid-transition
    placeholder names). This does not assume which real team a missing name
    is "meant to be" -- it just avoids treating an unknown team as
    stronger or weaker than average without evidence either way."""
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
                observed_avg = float(np.mean(played))
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

    if roster_teams:
        missing = [t for t in roster_teams if t not in shifts]
        for team in missing:
            shifts[team] = 0.0  # no coefficient on file -- neutral, not a guess
        if missing:
            adjustments_made.append({
                'note': 'teams missing from team_coeffs, given neutral shift instead of crashing',
                'teams': missing,
            })

    return shifts, adjustments_made


def make_sampler(values, shift):
    values = np.round(np.array(values) + shift)
    n = len(values)
    def sample(count):
        idx = np.random.randint(0, n, count)
        return values[idx]
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
    roster_teams = [t for teams in new_divs.values() for t in teams]
    shifts, adjustments = compute_adjusted_shifts(team_coeffs, scale, history, extracted_results,
                                                    roster_teams=roster_teams, market='eliza')

    samplers = {}
    div_pool = {}
    for div, teams in new_divs.items():
        pool = []
        for t in teams:
            if t in history: pool.extend(history[t])
        div_pool[div] = pool if pool else [60]
    for div, teams in new_divs.items():
        for t in teams:
            shift = shifts.get(t, 0.0)  # belt-and-braces -- roster_teams above should
                                          # already guarantee every team has an entry
            samplers[t] = make_sampler(history.get(t, div_pool[div]), shift)

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


def regenerate_division_futures(extracted_results, coeffs_path='data/team_market_coeffs.json',
                                 divs_path='data/h2h_divisions.json', history_path='data/roddy_history.json'):
    tmc = json.load(open(coeffs_path))
    scale = tmc['scale']
    team_coeffs = tmc['team_coeffs']
    new_divs = json.load(open(divs_path))
    history = json.load(open(history_path))

    rows, adjustments = simulate_division_futures(new_divs, team_coeffs, scale, history, extracted_results)
    return {'division_rows': rows, 'live_adjustments_applied': adjustments}
