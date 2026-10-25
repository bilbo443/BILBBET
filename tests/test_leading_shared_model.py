import json
import sys
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'pipeline'))
from simulation_adapter import simulate_division_futures
from cup_markets import regenerate_roddy_and_cup

class SharedLeaderTests(unittest.TestCase):
    def test_division_actual_scores_and_endpoint(self):
        teams=['A','B','C','D'];coeff={t:{'eliza':0,'relegation_risk':0} for t in teams}
        records=[{'team':t,'scores_by_round':[90-i*10]*2+[None]*24} for i,t in enumerate(teams)]
        checkpoints={}
        args=({'ELIZA CUP (D1)':teams},coeff,1,{t:[50,60,70] for t in teams},records)
        rows,_=simulate_division_futures(*args,n_sim=30,checkpoint_output=checkpoints)
        again,_=simulate_division_futures(*args,n_sim=30)
        self.assertEqual(rows,again)
        self.assertEqual(next(r['probability_pct'] for r in checkpoints['ELIZA CUP (D1)']['2'] if r['team']=='A'),100)
        final={r['team']:r['probability_pct'] for r in checkpoints['ELIZA CUP (D1)']['26']}
        self.assertEqual(final,{r['team']:r['win_div_pct'] for r in rows})

    def test_roddy_same_path_endpoints_and_actuals(self):
        read=lambda n:json.loads((ROOT/'data'/f'{n}.json').read_text())
        roster=read('h2h_divisions');teams=[t for ts in roster.values() for t in ts]
        scores={t:[100 if i==0 else 30]*2+[None]*24 for i,t in enumerate(teams)}
        checkpoint={}
        args=(roster,{t:{'roddy':0,'fa_cup':0} for t in teams},1,{t:[50,60,70] for t in teams})
        roddy,cup,_=regenerate_roddy_and_cup(*args,n_sim=20,official_cup_draw=read('official_fa_cup_draw'),live_results=scores,checkpoint_output=checkpoint)
        a,b,_=regenerate_roddy_and_cup(*args,n_sim=20,official_cup_draw=read('official_fa_cup_draw'),live_results=scores)
        self.assertEqual((roddy,cup),(a,b))
        self.assertEqual(checkpoint['26'],roddy['roddy_win_pct'])
        self.assertEqual(next(r['probability_pct'] for r in checkpoint['2'] if r['team']==teams[0]),100)

if __name__=='__main__':unittest.main()
