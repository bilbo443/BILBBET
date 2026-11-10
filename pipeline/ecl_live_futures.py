"""Results-aware ECL forecasts before the official group stage begins."""
import math
import json
from pathlib import Path
from regenerate_cup_futures import build_samplers, run_ecl_seed, to_odds

def load_ecl_draw(data_dir, registry, field):
    path=Path(data_dir)/'official_ecl_draw.json'
    if not path.exists():return None
    settings=json.loads(path.read_text())
    by_id={str(t['id']).zfill(3):t['name'] for t in registry}
    if settings.get('season')!='2026-27':raise ValueError('Review ECL draw for this season')
    ids=settings['field_team_ids'];pots=settings['pot1_team_ids']
    if len(ids)!=12 or len(set(ids))!=12 or any(t not in by_id for t in ids) or {by_id[t] for t in ids}!=set(field):raise ValueError('ECL draw field differs from registry')
    if len(pots)!=3 or len(set(pots))!=3 or not set(pots)<=set(ids):raise ValueError('Invalid ECL Pot 1')
    raw=settings.get('groups',{})
    if set(raw)-{'A','B','C'}:raise ValueError('Invalid ECL group names')
    if any(not isinstance(ts,list) or len(ts)>4 or any(t is not None and t not in ids for t in ts) for ts in raw.values()):raise ValueError('Unknown ECL draw slot')
    groups={g:[by_id[t] for t in raw.get(g,[]) if t is not None] for g in ('A','B','C')}
    assigned=[t for ts in groups.values() for t in ts]
    if len(assigned)!=len(set(assigned)) or not set(assigned)<=set(field):raise ValueError('Duplicate/unknown ECL group team')
    return {'pot1':[by_id[t] for t in pots], 'groups':groups}

def regenerate_ecl(roster, history, coeffs, scale, field, live_results, n_sim=12000, draw=None):
    if len(field)!=12 or len(set(field))!=12 or not set(field)<=set(t for ts in roster.values() for t in ts):
        raise ValueError('ECL needs its 12 confirmed unique entrants')
    for scores in live_results.values():
        if any(v is not None and (not isinstance(v,(int,float)) or not math.isfinite(v)) for v in scores):
            raise ValueError('Invalid live ECL form scores')
    seeds=(7,17,27)
    outputs=[]
    for seed in seeds:
        builder=lambda rng:build_samplers(rng,'ecl',roster,history,coeffs,scale,live_results)
        outputs.append(run_ecl_seed(seed,field,builder,n_sim=n_sim,**(draw or {})))
    stages={'reach_knockout_pct':'knockout','reach_sf_pct':'sf','reach_final_pct':'final','win_pct':'win'}
    result={}
    for key,stage in stages.items():
        rows=[]
        for team in field:
            pct=sum(out[team][stage] for out in outputs)/len(outputs)
            rows.append({'team':team,'probability_pct':pct,**to_odds(pct)})
        result[key]=sorted(rows,key=lambda r:(r['suspended'],r['odds'] or 0,r['team']))
    return result
