"""Refresh roster-dependent Roddy and FA Cup markets in a draft snapshot."""
import numpy as np
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


def regenerate_roddy_and_cup(roster, coeffs, scale, history, n_sim=6000, seed=11):
    teams = [t for division in roster.values() for t in division]
    pool = [score for t in teams for score in history.get(t, [])] or [60]
    def samplers_for(market):
        np.random.seed(seed)
        return {t: make_sampler(history.get(t, pool),
                    scale * coeffs.get(t, {}).get(market, 0.0)) for t in teams}

    samplers = samplers_for('roddy')
    positions = {t: np.zeros(len(teams), dtype=int) for t in teams}
    for _ in range(n_sim):
        totals = {t: samplers[t](26).sum() for t in teams}
        for pos, team in enumerate(sorted(teams, key=lambda t: -totals[t])):
            positions[team][pos] += 1
    roddy = {market: market_rows({t: 100*count[:places].sum()/n_sim
                                  for t, count in positions.items()})
             for market, places in RODDY_MARKETS.items()}

    samplers = samplers_for('fa_cup')
    draw = fa_cup_draw(teams, seed=seed)
    reached = {t: {stage: 0 for stage in FA_MARKETS.values()} for t in teams}
    def play(a, b):
        score_a, score_b = samplers[a](1)[0], samplers[b](1)[0]
        if score_a == score_b:
            return a if np.random.random() < 0.5 else b
        return a if score_a > score_b else b
    def round_matches(field):
        np.random.shuffle(field)
        return [play(field[i], field[i+1]) for i in range(0, len(field), 2)]
    for _ in range(n_sim):
        prelim = {('PRELIM', i): play(a, b)
                  for i, (a, b) in enumerate(draw['preliminary'])}
        field = list(draw['r32_byes'])
        field += [play(prelim.get(a, a), prelim.get(b, b))
                  for a, b in draw['r64_matches']]
        for stage in ('r32', 'r16', 'qf', 'sf', 'final'):
            for t in field:
                reached[t][stage] += 1
            field = round_matches(field)
        reached[field[0]]['win'] += 1
    cup = {market: market_rows({t: 100 * reached[t][stage]/n_sim for t in teams})
           for market, stage in FA_MARKETS.items()}
    return roddy, cup, draw
