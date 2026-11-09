"""Exercise the real GW4 -> synthetic GW5 calculation/publication chain in a temporary copy."""
import copy
import csv
import hashlib
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'pipeline'))
from simulation_adapter import simulate_division_futures,load_simulation_schedules
from team_strength_tiers import load_tier_centres
from live_futures import refresh_whole_league
from futures_refresh_guard import stamp_complete,write_score_snapshots
from leading_markets import write_leading_snapshot
from convert_draft_to_publishable import convert_draft_to_publishable
from check_published_state import check

class WeeklyRolloverRehearsal(unittest.TestCase):
 def test_actual_models_stage_and_publish_together_without_touching_source(self):
  hashes={p:hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT/'data').glob('*.json')}
  with tempfile.TemporaryDirectory() as directory:
   data=Path(directory)/'data';shutil.copytree(ROOT/'data',data);draft=Path(directory)/'draft';draft.mkdir()
   read=lambda n:json.loads((data/(n+'.json')).read_text())
   registry,roster,coeff,history=(read(n) for n in ('admin_teams','h2h_divisions','team_market_coeffs','roddy_history'))
   league,roddy=read('real_results'),read('roddy_results');teams=sorted(league)
   self.assertEqual(len(teams),66)
   def run(l,r):
    csv_path=Path(directory)/'synthetic-results.csv'
    with csv_path.open('w') as target:
     writer=csv.writer(target);writer.writerow(['RODDY','TEAM NAME']+[str(i) for i in range(1,27)]+['TOT'])
     for team in teams:writer.writerow(['',team]+['' if v is None else v for v in r[team]]+[sum(v for v in r[team] if v is not None)])
    rows,adjustments=simulate_division_futures(roster,coeff['team_coeffs'],coeff['scale'],history,
     [{'team':t,'scores_by_round':l[t]} for t in teams],n_sim=120,seed=7,
     team_ids={t['name']:str(t['id']) for t in registry},tier_centres=load_tier_centres(data,registry),
     official_schedules=load_simulation_schedules(data,registry,roster),checkpoint_output=(checkpoints:={}))
    whole,extracted=refresh_whole_league(csv_path,data,registry,roster,coeff,history,l,n_sim=120)
    odds={'division_rows':rows,'live_adjustments_applied':adjustments,'leading_at_probabilities':checkpoints,**whole}
    stamp_complete(odds,l,extracted)
    return odds,extracted
   baseline,_=run(league,roddy)
   next_league,next_roddy=copy.deepcopy(league),copy.deepcopy(roddy)
   for i,team in enumerate(teams):next_league[team][4]=next_roddy[team][4]=45+(i*17)%70
   next_odds,extracted=run(next_league,next_roddy)
   again,_=run(next_league,next_roddy)
   for section in ('division_rows','roddy','fa_cup_markets','ecl_markets','leading_at_probabilities','roddy_leading_at'):
    self.assertEqual(next_odds[section],again[section],section+' must repeat identically')
   for section in ('division_rows','roddy','fa_cup_markets','ecl_markets'):
    self.assertNotEqual(baseline[section],next_odds[section],section+' must react to synthetic new scores')
   odds_path=draft/'odds.json';odds_path.write_text(json.dumps(next_odds))
   write_leading_snapshot(next_odds,draft/'leading-at-publishable.json')
   write_score_snapshots(next_odds,next_league,extracted,draft/'real_results.json',draft/'roddy-results.json')
   convert_draft_to_publishable(odds_path,data/'futures.json',draft/'futures-publishable.json')
   # Isolated publication rehearsal: copy the four reviewed products together.
   for source,target in [('futures-publishable.json','futures.json'),('leading-at-publishable.json','leading_at.json'),('real_results.json','real_results.json'),('roddy-results.json','roddy_results.json')]:shutil.copyfile(draft/source,data/target)
   self.assertEqual(check(data),[])
   carry=read('carry_balances');self.assertAlmostEqual(float(carry['THE DRONE POLICE']['carry']),9998.87)
   # An incomplete publication is rejected instead of marking the old prices fresh.
   incomplete=read('real_results');incomplete[teams[0]][4]+=1;(data/'real_results.json').write_text(json.dumps(incomplete))
   self.assertTrue(any('published scores' in error for error in check(data)))
  self.assertTrue(all(hashlib.sha256(p.read_bytes()).hexdigest()==digest for p,digest in hashes.items()))
