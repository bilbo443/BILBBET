import json
import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'pipeline'))
from results_schedule_gate import due_rounds
class ResultsScheduleTests(unittest.TestCase):
 def setUp(self):
  self.schedule=json.loads((ROOT/'data/round_results_schedule.json').read_text())
 def test_all_rounds_check_only_after_last_fixture_at_1230(self):
  for number,entry in self.schedule['rounds'].items():
   with self.subTest(round=number):
    due=datetime.fromisoformat(entry['results_check_date']+'T12:30:00').replace(tzinfo=ZoneInfo('Australia/Sydney'))
    self.assertIn(int(number),due_rounds(self.schedule,due))
    self.assertNotIn(int(number),due_rounds(self.schedule,due-timedelta(minutes=1)))
    self.assertGreater(due.date().isoformat(),entry['last_fixture_date'])
    self.assertEqual(due_rounds(self.schedule,due),due_rounds(self.schedule,due.astimezone(ZoneInfo('UTC'))))
 def test_split_rounds_not_checked_after_first_week(self):
  for number in ('6','16'):
   entry=self.schedule['rounds'][number]
   early=datetime.fromisoformat(entry['first_fixture_date']+'T13:00:00').replace(tzinfo=ZoneInfo('Australia/Sydney'))+timedelta(days=3)
   self.assertNotIn(int(number),due_rounds(self.schedule,early))
