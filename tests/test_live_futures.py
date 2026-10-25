import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'pipeline'))
from simulation_adapter import simulate_division_futures
from cup_markets import regenerate_roddy_and_cup
from live_futures import extract_roddy

class LiveFuturesTest(unittest.TestCase):
    def test_completed_division_results_override_strength(self):
        coeff={t:{'eliza':0,'relegation_risk':0} for t in ('A','B')}
        rows,_=simulate_division_futures({'ELIZA CUP (D1)':['A','B']},coeff,1,{'A':[1,2,3],'B':[99,100,101]},
            [{'team':'A','scores_by_round':[80]*26},{'team':'B','scores_by_round':[10]*26}],n_sim=25)
        rows={r['team']:r for r in rows}
        self.assertGreater(rows['A']['win_div_pct'],99)
        self.assertLess(rows['B']['win_div_pct'],1)

    def test_roddy_complete_totals_and_cup_survivors(self):
        read=lambda n:json.loads((ROOT/'data'/f'{n}.json').read_text())
        roster=read('h2h_divisions'); teams=[t for ts in roster.values() for t in ts]
        official=read('official_fa_cup_draw'); official.pop('r64_results_final',None); official.pop('r64_winners',None); scores={t:[None]*26 for t in teams}
        for a,b in official['r64_matches']:scores[a][1]=100;scores[b][1]=10
        coeff={t:{'roddy':0,'fa_cup':0} for t in teams}
        a,c,d=regenerate_roddy_and_cup(roster,coeff,1,{t:[50,60,70] for t in teams},n_sim=25,official_cup_draw=official,live_results=scores)
        survivors={pair[0] for pair in official['r64_matches']}
        self.assertTrue(all({r['team'] for r in rows}==survivors for rows in c.values()))
        a2,c2,_=regenerate_roddy_and_cup(roster,coeff,1,{t:[50,60,70] for t in teams},n_sim=25,official_cup_draw=official,live_results=scores)
        self.assertEqual((a,c),(a2,c2))
        pair=official['r64_matches'][0];scores[pair[1]][1]=100
        with self.assertRaisesRegex(ValueError,'draw'):
            regenerate_roddy_and_cup(roster,coeff,1,{t:[60] for t in teams},n_sim=2,official_cup_draw=official,live_results=scores)

    def test_roddy_table_total_and_missing_scores(self):
        header=['RODDY','TEAM NAME']+[str(i) for i in range(1,27)]+['TOT']
        row=['','A','70','80']+['']*24+['150']
        registry=[{'id':'001','name':'A','status':'ELIZA CUP'}]
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'scores.csv'
            with p.open('w') as f:csv.writer(f).writerows([header,row])
            self.assertEqual(extract_roddy(p,registry)['A'][:2],[70,80])
            row[-1]='151'
            with p.open('w') as f:csv.writer(f).writerows([header,row])
            with self.assertRaisesRegex(ValueError,'mismatch'):extract_roddy(p,registry)

if __name__=='__main__':unittest.main()
