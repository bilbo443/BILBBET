"""Refresh season futures from validated league scores and the separate Roddy table."""
import csv
import json
import math
import re
from pathlib import Path
from cup_markets import regenerate_roddy_and_cup
from team_strength_tiers import load_tier_centres


def extract_roddy(csv_path, registry):
    with Path(csv_path).open() as source:
        rows = list(csv.reader(source))
    norm = lambda name: re.sub('[^A-Z0-9]', '', name.upper())
    aliases = {}
    for team in registry:
        for name in [team['name'], *str(team.get('prev_names') or '').split(',')]:
            if name.strip(): aliases.setdefault(norm(name), set()).add(team['name'])
    headers = [i for i,row in enumerate(rows) if 'RODDY' in [v.strip().upper() for v in row] and 'TEAM NAME' in row and row[row.index('TEAM NAME')+1:row.index('TEAM NAME')+27] == [str(n) for n in range(1,27)]]
    if len(headers) != 1: raise ValueError('Expected one labelled Roddy results table')
    header = rows[headers[0]]
    ti = header.index('TEAM NAME'); indices = [header.index(str(i)) for i in range(1,27)]
    total_i = header.index('TOT'); result = {}
    for row in rows[headers[0]+1:]:
        if len(row)<=ti or not row[ti].strip(): break
        matches = aliases.get(norm(row[ti]), set())
        if len(matches)!=1: raise ValueError('Unknown/ambiguous Roddy team: '+row[ti])
        name = next(iter(matches))
        if name in result: raise ValueError('Duplicate Roddy team: '+name)
        values = [float(row[i]) if row[i].strip() else None for i in indices]
        if any(v is not None and (not math.isfinite(v) or not 0<=v<=200) for v in values):
            raise ValueError('Invalid Roddy scores: '+name)
        if abs(sum(v for v in values if v is not None)-float(row[total_i]))>0.001:
            raise ValueError('Roddy total mismatch: '+name)
        result[name] = values
    active = {t['name'] for t in registry if t.get('status') not in (None,'','INACTIVE')}
    if set(result)!=active: raise ValueError('Roddy table does not match active roster')
    completed = [i for i in range(26) if any(v[i] is not None for v in result.values())]
    if any(any(v[i] is None for v in result.values()) for i in completed):
        raise ValueError('Incomplete Roddy round; keep published Roddy prices')
    return result


def refresh_whole_league(csv_path, data_dir, registry, roster, coeffs, history, league_results, n_sim=12000):
    data_dir = Path(data_dir)
    read = lambda n: json.loads((data_dir/(n+'.json')).read_text())
    settings = read('roddy_ability_model')
    ability = {t['name']:{**settings['teams'][str(t['id']).zfill(3)],'team_id':str(t['id']).zfill(3)}
               for t in registry if settings.get('enabled') and str(t['id']).zfill(3) in settings['teams']}
    roddy_scores = extract_roddy(csv_path, registry)
    latest = max(i for values in league_results.values() for i,v in enumerate(values) if v is not None)
    if any(v is not None for values in roddy_scores.values() for v in values[latest+1:]):
        raise ValueError('Roddy table contains scores beyond validated league rounds')
    if any(values[i] is None for values in roddy_scores.values() for i in range(latest+1)):
        raise ValueError('Roddy scores incomplete through the latest league round')
    for team, values in league_results.items():
        if team in roddy_scores:
            for i, score in enumerate(values):
                if score is not None and roddy_scores[team][i] != score:
                    raise ValueError('League/Roddy score conflict: '+team+' GW'+str(i+1))
    centres = load_tier_centres(data_dir, registry)
    official = read('official_fa_cup_draw')
    # Roddy and league scores have different GW1 coverage. Never substitute one table for the other.
    roddy, _, _ = regenerate_roddy_and_cup(roster, coeffs['team_coeffs'], coeffs['scale'], history,
        n_sim=n_sim, seed=11, roddy_ability_model=ability, tier_centres=centres,
        official_cup_draw=official, live_results=roddy_scores, apply_cup_results=False)
    _, cup, _ = regenerate_roddy_and_cup(roster, coeffs['team_coeffs'], coeffs['scale'], history,
        n_sim=n_sim, seed=11, roddy_ability_model=ability, tier_centres=centres,
        official_cup_draw=official, live_results=league_results)
    return {'roddy':roddy, 'fa_cup_markets':cup}, roddy_scores
