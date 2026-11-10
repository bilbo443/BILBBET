import copy,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'pipeline'))
import regenerate_cup_futures as engine
from ecl_live_futures import load_ecl_draw,regenerate_ecl

class EclDrawTests(unittest.TestCase):
 def test_pots_committed_groups_and_six_qualifiers(self):
  field=[str(i) for i in range(12)];pot=field[:3]
  groups={'A':['0','3','4','5'],'B':['1','6','7','8'],'C':['2','9','10','11']}
  builder=lambda rng:{t:(lambda value=100-int(t):value) for t in field}
  seen=[];original=engine.group_standings
  def observe(rng,samplers,group):
   seen.append(group.copy());self.assertEqual(sum(t in pot for t in group),1)
   return original(rng,samplers,group)
  with patch.object(engine,'group_standings',observe):
   out=engine.run_ecl_seed(7,field,builder,n_sim=25,pot1=pot,groups=groups)
  self.assertTrue(all(g in groups.values() for g in seen))
  self.assertAlmostEqual(sum(r['knockout'] for r in out.values()),600)
  self.assertAlmostEqual(sum(r['sf'] for r in out.values()),400)
  self.assertAlmostEqual(sum(r['final'] for r in out.values()),200)
  self.assertAlmostEqual(sum(r['win'] for r in out.values()),100)
  self.assertEqual(out['0']['win'],100);self.assertEqual(out['4']['knockout'],0)
  self.assertEqual(out,engine.run_ecl_seed(7,field,builder,n_sim=25,pot1=pot,groups=groups))
  with patch.object(engine,'group_standings',observe):engine.run_ecl_seed(7,field,builder,n_sim=10,pot1=pot,groups={'A':['0']})
  with self.assertRaises(ValueError):engine.run_ecl_seed(7,field,builder,n_sim=1,pot1=pot,groups={'A':['0','1']})
 def test_registry_id_draw_export_and_unknown_ids(self):
  registry=json.loads((ROOT/'data/admin_teams.json').read_text());field=json.loads((ROOT/'data/futures.json').read_text())['ecl_field']
  draw=load_ecl_draw(ROOT/'data',registry,field)
  self.assertEqual(len(draw['pot1']),3);self.assertEqual(sum(map(len,draw['groups'].values())),0)
  settings=json.loads((ROOT/'data/official_ecl_draw.json').read_text())
  with tempfile.TemporaryDirectory() as folder:
   settings['groups']['A']=['075',None,'022'];p=Path(folder)/'official_ecl_draw.json';p.write_text(json.dumps(settings))
   out=load_ecl_draw(folder,registry,field);self.assertEqual(out['groups']['A'],['AFC BIG RED PORT','BC UNITED ZEBRAS'])
   settings['groups']['A']=['999'];p.write_text(json.dumps(settings))
   with self.assertRaises(ValueError):load_ecl_draw(folder,registry,field)
 def test_complete_draw_changes_group_conditioned_prices(self):
  field=[str(i) for i in range(12)];roster={'D1':field};hist={t:[40+int(t),55+int(t),65+int(t)] for t in field};coeff={t:{'ecl':0} for t in field}
  draw={'pot1':field[:3],'groups':{'A':['0','3','4','5'],'B':['1','6','7','8'],'C':['2','9','10','11']}}
  before=copy.deepcopy(draw)
  a=regenerate_ecl(roster,hist,coeff,1,field,{},n_sim=80,draw=draw)
  b=regenerate_ecl(roster,hist,coeff,1,field,{},n_sim=80,draw=draw)
  self.assertEqual(a,b);self.assertEqual(draw,before)
  self.assertAlmostEqual(sum(r['probability_pct'] for r in a['reach_knockout_pct']),600)
