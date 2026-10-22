"""Refresh roster-dependent Roddy and FA Cup markets in a draft snapshot."""
import numpy as np
import hashlib
from roster_format import fa_cup_draw
from simulation_adapter import make_sampler
from diff_report import pct_to_odds

RODDY_MARKETS = {'roddy_win_pct': 1, 'roddy_top3_pct': 3,
                 'roddy_top5_pct': 5, 'roddy_top10_pct': 10}
FA_MARKETS = {'reach_r32_pct': 'r32', 'reach_r16_pct': 'r16',
              'reach_qf_pct': 'qf', 'reach_sf_pct': 'sf',
              'reach_final_pct': 'final', 'win_pct': 'win'}


def market_rows(pcts):
    rows = []
    for team, pct in pcts.items():
        odds = pct_to_odds(pct)
        rows.append({'team': team, 'odds': odds if odds is not None else 1001,
                     'suspended': odds is None})
    return sorted(rows, key=lambda row: (row['suspended'], row['odds']))


def regenerate_roddy_and_cup(roster, coeffs, scale, history, n_sim=6000, seed=11, roddy_adjustments=None, roddy_ability_model=None, official_cup_draw=None, tier_centres=None):
    teams = [t for division in roster.values() for t in division]
    pool = [score for t in teams for score in history.get(t, [])] or [60]
    def samplers_for(market):
        np.random.seed(seed)
        result = {}
        for t in teams:
            values = np.asarray(history.get(t, pool), dtype=float)
            if t in (tier_centres or {}):
                values = values - np.mean(values) + float(tier_centres[t])
                shift = 0.0
            else:
                shift = scale * (coeffs.get(t, {}).get(market, 0.0)
                    + ((roddy_adjustments or {}).get(t, 0.0)
                       if market == 'roddy' and t not in (roddy_ability_model or {}) else 0.0))
            result[t] = make_sampler(values, shift)
        return result

    samplers = samplers_for('roddy')
    positions = {t: np.zeros(len(teams), dtype=int) for t in teams}
    ability_totals = {}
    for team, entry in (roddy_ability_model or {}).items():
        if team not in teams or team in (tier_centres or {}):
            continue
        identity = str(entry['team_id']).zfill(3)
        ability_seed = int.from_bytes(hashlib.sha256(
            (str(seed) + ':roddy-ability:' + identity).encode()
        ).digest()[:8], 'big')
        ability_rng = np.random.default_rng(ability_seed)
        mean = float(entry['weekly_mean_shift'])
        sd = float(entry['weekly_ability_sd'])
        if not -50 <= mean <= 50 or not 0 <= sd <= 10:
            raise ValueError('Invalid Roddy ability model for ' + identity)
        ability_totals[team] = 26 * (
            mean + ability_rng.normal(0, sd, size=n_sim)
        )
    for simulation in range(n_sim):
        totals = {t: samplers[t](26).sum()
                  + (ability_totals[t][simulation] if t in ability_totals else 0)
                  for t in teams}
        for pos, team in enumerate(sorted(teams, key=lambda t: -totals[t])):
            positions[team][pos] += 1
    roddy = {market: market_rows({t: 100*count[:places].sum()/n_sim
                                  for t, count in positions.items()})
             for market, places in RODDY_MARKETS.items()}

    samplers = samplers_for('fa_cup')
    draw = fa_cup_draw(teams, seed=seed)
    if official_cup_draw is not None:
        pairs = official_cup_draw['preliminary']
        participants = [t for pair in pairs for t in pair]
        if (len(teams) != 66 or len(pairs) != 2
                or any(len(pair) != 2 for pair in pairs)
                or len(set(participants)) != 4
                or not set(participants).issubset(teams)):
            raise ValueError('Official preliminary draw does not match the field')
        draw = {
            'preliminary': pairs,
            'preliminary_byes': [t for t in teams if t not in participants],
            'r64_matches': official_cup_draw.get('r64_matches', []) if official_cup_draw.get('r64_draw_confirmed') else [],
            'r32_byes': [],
            'r64_draw_confirmed': bool(official_cup_draw.get('r64_draw_confirmed'))
        }
    reached = {t: {stage: 0 for stage in FA_MARKETS.values()} for t in teams}
    def play(a, b):
        score_a, score_b = samplers[a](1)[0], samplers[b](1)[0]
        if score_a == score_b:
            return a if np.random.random() < 0.5 else b
        return a if score_a > score_b else b
    def round_matches(field):
        np.random.shuffle(field)
        return [play(field[i], field[i+1]) for i in range(0, len(field), 2)]
    confirmed_winners = []
    eliminated = set()
    if official_cup_draw is not None and official_cup_draw.get('preliminary_results_final'):
        confirmed_winners = official_cup_draw.get('preliminary_winners', [])
        if len(confirmed_winners) != len(draw['preliminary']):
            raise ValueError('Confirmed preliminary winners are incomplete')
        for pair, winner in zip(draw['preliminary'], confirmed_winners):
            if winner not in pair:
                raise ValueError('Preliminary winner does not match its fixture')
            eliminated.update(t for t in pair if t != winner)
        if eliminated != set(official_cup_draw.get('eliminated_teams', [])):
            raise ValueError('Eliminated cup field does not match confirmed results')
        draw['preliminary_winners'] = confirmed_winners
        draw['eliminated_teams'] = sorted(eliminated)
    if draw.get('r64_draw_confirmed'):
        official_pairs = draw['r64_matches']
        if not confirmed_winners:
            raise ValueError('Confirmed Round of 64 requires final preliminary winners')
        if (len(official_pairs) != 32
                or any(not isinstance(pair, list) or len(pair) != 2 for pair in official_pairs)):
            raise ValueError('Confirmed Round of 64 requires 32 pairs')
        entrants = [team for pair in official_pairs for team in pair]
        if len(set(entrants)) != 64 or set(entrants) != set(teams) - eliminated:
            raise ValueError('Confirmed Round of 64 must contain each survivor exactly once')
    for _ in range(n_sim):
        prelim = {('PRELIM', i): (
                    confirmed_winners[i] if confirmed_winners else play(a, b))
                  for i, (a, b) in enumerate(draw['preliminary'])}
        if official_cup_draw is not None:
            # Future pairings are simulated afresh, never published as official.
            r64_field = list(draw['preliminary_byes']) + list(prelim.values())
            if len(r64_field) != 64:
                raise ValueError('Official preliminary must produce 64 survivors')
            field = ([play(a, b) for a, b in draw['r64_matches']]
                     if draw.get('r64_draw_confirmed') else round_matches(r64_field))
        else:
            field = list(draw['r32_byes'])
            field += [play(prelim.get(a, a), prelim.get(b, b))
                      for a, b in draw['r64_matches']]
        for stage in ('r32', 'r16', 'qf', 'sf', 'final'):
            for t in field:
                reached[t][stage] += 1
            field = round_matches(field)
        reached[field[0]]['win'] += 1
    cup = {market: market_rows({t: 100 * reached[t][stage]/n_sim for t in teams if t not in eliminated})
           for market, stage in FA_MARKETS.items()}
    return roddy, cup, draw
