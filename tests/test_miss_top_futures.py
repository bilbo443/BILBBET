import json
import sys
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'pipeline'))
from simulation_adapter import simulate_division_futures
from cup_markets import regenerate_roddy_and_cup

class MissTopTests(unittest.TestCase):
    def test_same_rank_distribution_complements(self):
        teams=['A','B','C','D'];coeff={t:{'eliza':0,'relegation_risk':0} for t in teams}
        records=[{'team':t,'scores_by_round':[90-i*10]*26} for i,t in enumerate(teams)]
        rows,_=simulate_division_futures({'ELIZA CUP (D1)':teams},coeff,1,{t:[50,60] for t in teams},records,n_sim=20)
        for row in rows:
            self.assertAlmostEqual(row['top3_pct']+row['miss_top3_pct'],100)
            self.assertAlmostEqual(row['top_half_pct']+row['miss_top_half_pct'],100)
        self.assertAlmostEqual(sum(r['miss_top3_pct'] for r in rows),100)
        self.assertAlmostEqual(sum(r['miss_top_half_pct'] for r in rows),200)

    def test_roddy_complements_and_fields(self):
        read=lambda n:json.loads((ROOT/'data'/f'{n}.json').read_text())
        roster=read('h2h_divisions');teams=[t for ts in roster.values() for t in ts]
        roddy,_,_=regenerate_roddy_and_cup(roster,{t:{'roddy':0,'fa_cup':0} for t in teams},1,{t:[40,60,80] for t in teams},n_sim=20,official_cup_draw=read('official_fa_cup_draw'))
        for n in (3,5,10):
            top={r['team']:r['probability_pct'] for r in roddy[f'roddy_top{n}_pct']}
            miss=roddy[f'roddy_miss_top{n}_pct']
            self.assertEqual(len(miss),66)
            for row in miss:self.assertAlmostEqual(top[row['team']]+row['probability_pct'],100)

if __name__=='__main__':unittest.main()
