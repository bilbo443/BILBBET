import copy
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'pipeline'))
from official_division_rotations import clockwise_schedule, load_official_rotations


class OfficialRotationsTest(unittest.TestCase):
    def setUp(self):
        self.registry = json.loads((ROOT/'data/admin_teams.json').read_text())
        self.roster = json.loads((ROOT/'data/h2h_divisions.json').read_text())
        self.schedules = load_official_rotations(ROOT/'data', self.registry, self.roster)
        self.ids = {t['name']: str(t['id']).zfill(3) for t in self.registry}

    def test_screenshot_round_three(self):
        expected = {
            'DIVISION 2A': [('043','072'),('077','067'),('055','075'),('052','083'),('064','074'),('088','049')],
            'DIVISION 2B': [('089','087'),('018','028'),('085','079'),('001','042'),('068','069'),('080','006')],
            'DIVISION 3A': [('058','065'),('078','005'),('091','095'),('092','038'),('057','012'),('102','100'),('081','101')],
            'DIVISION 3B': [('099','097'),('053','029'),('076','094'),('096','047'),('106','105'),('066','011'),('103','104')],
        }
        for div, pairs in expected.items():
            self.assertEqual([tuple(self.ids[t] for t in p) for p in self.schedules[div][2]], pairs)

    def test_cycles_and_league_window(self):
        saved = json.loads((ROOT/'data/h2h_schedule.json').read_text())
        for div, weeks in self.schedules.items():
            self.assertEqual(saved[div], weeks)
            self.assertEqual(len(weeks), 26)
            self.assertFalse(weeks[0])
            self.assertEqual(weeks[23:], [[], [], []])
            teams = set(self.roster[div])
            for pairs in weeks[1:23]:
                flat = [t for p in pairs for t in p]
                self.assertEqual(len(flat), len(teams))
                self.assertEqual(set(flat), teams)
            cycle = len(teams)-1
            seen = {frozenset(p) for week in weeks[1:cycle+1] for p in week}
            self.assertEqual(len(seen), len(teams)*cycle//2)
            self.assertEqual(weeks[1], weeks[cycle+1])

    def test_identity_and_membership_guard(self):
        registry = copy.deepcopy(self.registry)
        roster = copy.deepcopy(self.roster)
        old = next(t for t in registry if str(t['id']).zfill(3)=='085')
        old_name = old['name']
        old['name'] = 'RENAMED FOR TEST'
        roster['DIVISION 2B'] = [old['name'] if t==old_name else t for t in roster['DIVISION 2B']]
        renamed = load_official_rotations(ROOT/'data', registry, roster)
        self.assertIn('RENAMED FOR TEST', str(renamed))
        roster['DIVISION 2B'].pop()
        with self.assertRaises(ValueError):
            load_official_rotations(ROOT/'data', registry, roster)

    def test_duplicate_seed_rejected(self):
        with self.assertRaises(ValueError):
            clockwise_schedule([['a','b'],['a','c']])


if __name__ == '__main__':
    unittest.main()
