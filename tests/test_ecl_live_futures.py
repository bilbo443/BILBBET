import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'pipeline'))
from ecl_live_futures import regenerate_ecl
class EclFormTests(unittest.TestCase):
 def test_form_repeatable_and_field_preserved(self):
  teams=[str(i) for i in range(12)];roster={'D1':teams};history={t:[40,50,60] for t in teams};coeff={t:{'ecl':0} for t in teams}
  base=regenerate_ecl(roster,history,coeff,1,teams,{},n_sim=100)
  live={t:[50]*4 for t in teams};live['0']=[110]*4
  changed=regenerate_ecl(roster,history,coeff,1,teams,live,n_sim=100)
  self.assertEqual(changed,regenerate_ecl(roster,history,coeff,1,teams,live,n_sim=100))
  p=lambda data:next(r['probability_pct'] for r in data['win_pct'] if r['team']=='0')
  self.assertGreater(p(changed),p(base))
  self.assertTrue(all({r['team'] for r in rows}==set(teams) for rows in changed.values()))
  with self.assertRaises(ValueError):regenerate_ecl(roster,history,coeff,1,teams[:-1],live,n_sim=1)
