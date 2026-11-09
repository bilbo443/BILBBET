"""Reject partial futures refreshes and record the score inputs used for publication."""
from datetime import datetime, timezone

REQUIRED = {
 'roddy': ('roddy_win_pct','roddy_top3_pct','roddy_top5_pct','roddy_top10_pct'),
 'fa_cup_markets': ('reach_r32_pct','reach_r16_pct','reach_qf_pct','reach_sf_pct','reach_final_pct','win_pct'),
 'ecl_markets': ('reach_knockout_pct','reach_sf_pct','reach_final_pct','win_pct'),
}
def score_snapshot(league,roddy):
    return [[team,league.get(team),roddy.get(team)] for team in sorted(set(league)|set(roddy))]

def manifest(divisions,league,roddy):
    return {'version':1,'generated_at':datetime.now(timezone.utc).isoformat(),
            'coverage':sorted(divisions)+['RODDY','FA CUP','ECL'],
            'source_scores':score_snapshot(league,roddy)}

def validate_complete(odds):
    if not odds.get('division_rows'): raise ValueError('Incomplete futures refresh: division markets missing')
    for section,keys in REQUIRED.items():
        for key in keys:
            if not odds.get(section,{}).get(key):
                raise ValueError('Incomplete futures refresh: '+section+'/'+key+' missing')
    if not isinstance(odds.get('futures_refresh',{}).get('source_scores'),list):
        raise ValueError('Futures refresh has no validated score snapshot')

def stamp_complete(odds,league,roddy):
    divisions={row['division'] for row in odds.get('division_rows',[])}
    odds['futures_refresh']=manifest(divisions,league,roddy)
    validate_complete(odds)


def write_score_snapshots(odds, league, roddy, league_path, roddy_path):
    """Stage the exact inputs alongside prices; never reuse an older roster-only draft."""
    import json
    from pathlib import Path
    validate_complete(odds)
    if odds['futures_refresh']['source_scores'] != score_snapshot(league, roddy):
        raise ValueError('Score publication snapshot differs from simulated futures')
    for path, scores in ((league_path, league), (roddy_path, roddy)):
        Path(path).write_text(json.dumps(scores, indent=2) + '\n')
