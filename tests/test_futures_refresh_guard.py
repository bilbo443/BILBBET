import sys,unittest,copy
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'pipeline'))
from futures_refresh_guard import REQUIRED,stamp_complete,validate_complete
class CoverageTests(unittest.TestCase):
 def test_partial_refresh_rejected(self):
  odds={'division_rows':[{'division':'D1'}],**{section:{key:[{'team':'A'}] for key in keys} for section,keys in REQUIRED.items()}}
  stamp_complete(odds,{'A':[80]},{'A':[80]});validate_complete(odds)
  for section in REQUIRED:
   partial=copy.deepcopy(odds);del partial[section]
   with self.assertRaisesRegex(ValueError,'Incomplete'):validate_complete(partial)
  self.assertEqual(odds['futures_refresh']['source_scores'],[['A',[80],[80]]])

class ScorePublicationTests(unittest.TestCase):
 def test_stage_exact_scores_and_reject_mixed_snapshot(self):
  import json,tempfile
  from futures_refresh_guard import write_score_snapshots
  odds={'division_rows':[{'division':'D1'}],**{section:{key:[{'team':'A'}] for key in keys} for section,keys in REQUIRED.items()}}
  league={'A':[None,80]};roddy={'A':[70,80]}
  stamp_complete(odds,league,roddy)
  with tempfile.TemporaryDirectory() as directory:
   l,r=Path(directory)/'real_results.json',Path(directory)/'roddy-results.json'
   write_score_snapshots(odds,league,roddy,l,r)
   self.assertEqual(json.loads(l.read_text()),league)
   self.assertEqual(json.loads(r.read_text()),roddy)
   original=l.read_text()
   with self.assertRaisesRegex(ValueError,'differs'):
    write_score_snapshots(odds,{'A':[None,81]},roddy,l,r)
   self.assertEqual(l.read_text(),original)
