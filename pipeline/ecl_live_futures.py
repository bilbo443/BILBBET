"""Results-aware ECL forecasts before the official group stage begins."""
import math
from regenerate_cup_futures import build_samplers, run_ecl_seed, to_odds

def regenerate_ecl(roster, history, coeffs, scale, field, live_results, n_sim=12000):
    if len(field)!=12 or len(set(field))!=12 or not set(field)<=set(t for ts in roster.values() for t in ts):
        raise ValueError('ECL needs its 12 confirmed unique entrants')
    for scores in live_results.values():
        if any(v is not None and (not isinstance(v,(int,float)) or not math.isfinite(v)) for v in scores):
            raise ValueError('Invalid live ECL form scores')
    seeds=(7,17,27)
    outputs=[]
    for seed in seeds:
        builder=lambda rng:build_samplers(rng,'ecl',roster,history,coeffs,scale,live_results)
        outputs.append(run_ecl_seed(seed,field,builder,n_sim=n_sim))
    stages={'reach_knockout_pct':'knockout','reach_sf_pct':'sf','reach_final_pct':'final','win_pct':'win'}
    result={}
    for key,stage in stages.items():
        rows=[]
        for team in field:
            pct=sum(out[team][stage] for out in outputs)/len(outputs)
            rows.append({'team':team,'probability_pct':pct,**to_odds(pct)})
        result[key]=sorted(rows,key=lambda r:(r['suspended'],r['odds'] or 0,r['team']))
    return result
