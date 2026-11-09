import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'pipeline'))
from check_published_state import check

class PublishedStateTests(unittest.TestCase):
 def test_current_snapshot(self):
  self.assertEqual(check(ROOT/'data'),[])

 def test_changed_scores_and_misassigned_markets_detected(self):
  with tempfile.TemporaryDirectory() as directory:
   data=Path(directory)/'data';shutil.copytree(ROOT/'data',data)
   path=data/'real_results.json';scores=json.loads(path.read_text());team=next(iter(scores));scores[team][0]=199;path.write_text(json.dumps(scores))
   self.assertTrue(any('published scores' in x for x in check(data)))
   f=data/'futures.json';prices=json.loads(f.read_text());division=next(iter(prices['divisions']));prices['divisions'][division]['win_div_pct'][0]['team']='WRONG CONFERENCE';f.write_text(json.dumps(prices))
   self.assertTrue(any('team field differs' in x for x in check(data)))

 def test_calendar_date_drift_detected(self):
  with tempfile.TemporaryDirectory() as directory:
   data=Path(directory)/'data';shutil.copytree(ROOT/'data',data)
   path=data/'round_dates.json';dates=json.loads(path.read_text());dates['10']='2027-01-01';path.write_text(json.dumps(dates))
   self.assertTrue(any('first fixture in GW10' in x for x in check(data)))
