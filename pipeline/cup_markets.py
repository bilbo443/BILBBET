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
        rows.append({'team': team, 'probability_pct': float(pct), 'odds': odds if odds is not None else 1001,
                     'suspended': odds is None})
    return sorted(rows, key=lambda row: (row['suspended'], row['odds']))


def regenerate_roddy_and_cup(roster, coeffs, scale, history, n_sim=6000, seed=11, roddy_adjustments=None, roddy_ability_model=None, official_cup_draw=None, tier_centres=None, live_results=None, apply_cup_results=True, checkpoint_output=None):
    teams = [t for division in roster.values() for t in division]
    live_results = live_results or {}
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
            played = [v for v in live_results.get(t, []) if v is not None]
            if played:
                # Gentle form update; actual season totals are retained separately.
                weight = min(len(played) / 26.0, 0.5)
                shift += weight * (float(np.mean(played)) - float(np.mean(values)) - shift)
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
    checkpoint_counts = np.zeros((26,len(teams)),dtype=int) if checkpoint_output is not None else None
    for simulation in range(n_sim):
        totals = {}
        progress = []
        for t in teams:
            known = list(live_results.get(t, [None]*26))
            remaining = sum(v is None for v in known)
            samples = samplers[t](remaining)
            ability = ability_totals[t][simulation]/26.0 if t in ability_totals else 0.0
            totals[t] = sum(v for v in known if v is not None) + samples.sum() + ability*remaining
            if checkpoint_counts is not None:
                sample_index = 0
                weeks = []
                for score in known:
                    if score is None:
                        score = samples[sample_index]+ability
                        sample_index += 1
                    weeks.append(score)
                progress.append(np.cumsum(weeks))
        if checkpoint_counts is not None:
            leaders = np.argmax(np.asarray(progress),axis=0)
            np.add.at(checkpoint_counts,(np.arange(26),leaders),1)
        for pos, team in enumerate(sorted(teams, key=lambda t: -totals[t])):
            positions[team][pos] += 1
    roddy = {market: market_rows({t: 100*count[:places].sum()/n_sim
                                  for t, count in positions.items()})
             for market, places in RODDY_MARKETS.items()}

    for places in (3, 5, 10):
        roddy[f'roddy_miss_top{places}_pct'] = market_rows({
            t: 100 * count[places:].sum()/n_sim for t, count in positions.items()})

    if checkpoint_output is not None:
        checkpoint_output.update({str(r+1):market_rows({t:100*checkpoint_counts[r,i]/n_sim for i,t in enumerate(teams)})
                                  for r in range(26)})
        checkpoint_output['26'] = [dict(row) for row in roddy['roddy_win_pct']]

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
    r64_winners = []
    if official_cup_draw is not None and official_cup_draw.get('r64_results_final'):
        r64_winners = official_cup_draw.get('r64_winners', [])
        if len(r64_winners) != 32 or any(w not in pair for w,pair in zip(r64_winners,draw['r64_matches'])):
            raise ValueError('Incomplete official Round of 64 results')
        eliminated.update(t for pair in draw['r64_matches'] for t in pair if t not in r64_winners)
    if apply_cup_results and not r64_winners and draw.get('r64_draw_confirmed') and live_results:
        ri = int(official_cup_draw['round_of_64_round']) - 1
        pairs = draw['r64_matches']
        values = [(live_results.get(a, [None]*26)[ri], live_results.get(b, [None]*26)[ri]) for a,b in pairs]
        if all(a is not None and b is not None for a,b in values):
            if any(a == b for a,b in values):
                raise ValueError('Completed FA Cup round contains a draw; advancement needs organiser confirmation')
            r64_winners = [pair[0] if scores[0] > scores[1] else pair[1] for pair,scores in zip(pairs,values)]
            eliminated.update(t for pair in pairs for t in pair if t not in r64_winners)
    for _ in range(n_sim):
        prelim = {('PRELIM', i): (
                    confirmed_winners[i] if confirmed_winners else play(a, b))
                  for i, (a, b) in enumerate(draw['preliminary'])}
        if official_cup_draw is not None:
            # Future pairings are simulated afresh, never published as official.
            r64_field = list(draw['preliminary_byes']) + list(prelim.values())
            if len(r64_field) != 64:
                raise ValueError('Official preliminary must produce 64 survivors')
            field = (list(r64_winners) if r64_winners else
                     [play(a, b) for a, b in draw['r64_matches']]
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
