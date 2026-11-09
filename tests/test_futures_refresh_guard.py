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
