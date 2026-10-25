"""Confirmed pairings must control every Round of 64 simulation."""
import copy
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'pipeline'))
import cup_markets


class ConfirmedDrawTests(unittest.TestCase):
    def setUp(self):
        data = Path(__file__).resolve().parents[1] / 'data'
        self.roster = json.loads((data / 'h2h_divisions.json').read_text())
        self.official = json.loads((data / 'official_fa_cup_draw.json').read_text())
        self.official.pop('r64_results_final', None)
        self.official.pop('r64_winners', None)
        self.names = sorted(t for group in self.roster.values() for t in group)
        self.score = {name: i+1 for i, name in enumerate(self.names)}
        self.history = {name: [self.score[name]] for name in self.names}

    def run_model(self, draw):
        with patch.object(cup_markets, 'make_sampler', side_effect=lambda values, shift: lambda n: np.full(n, values[0]+shift)):
            with patch.object(cup_markets, 'market_rows', side_effect=lambda values: values):
                return cup_markets.regenerate_roddy_and_cup(self.roster, {}, 1, self.history, n_sim=2, official_cup_draw=draw)

    def test_exact_pairs_determine_r32_survivors(self):
        _, markets, draw = self.run_model(self.official)
        expected = {max(pair, key=self.score.get) for pair in self.official['r64_matches']}
        self.assertEqual({t for t,pct in markets['reach_r32_pct'].items() if pct==100}, expected)
        self.assertEqual(len(markets['win_pct']),64)
        self.assertEqual(draw['r64_matches'],self.official['r64_matches'])
        self.assertEqual(self.run_model(self.official), self.run_model(self.official))

    def test_duplicate_or_eliminated_entrant_rejected(self):
        for name in [self.official['r64_matches'][0][0], self.official['eliminated_teams'][0]]:
            draw=copy.deepcopy(self.official)
            draw['r64_matches'][-1][-1]=name
            with self.assertRaisesRegex(ValueError,'each survivor exactly once'):
                self.run_model(draw)

    def test_incomplete_draw_rejected(self):
        draw=copy.deepcopy(self.official);draw['r64_matches'].pop()
        with self.assertRaisesRegex(ValueError,'32 pairs'):
            self.run_model(draw)

    def test_unconfirmed_draw_stays_unpublished(self):
        draw=copy.deepcopy(self.official);draw['r64_draw_confirmed']=False;draw['r64_matches']=[]
        _,markets,generated=self.run_model(draw)
        self.assertEqual(generated['r64_matches'],[])
        self.assertEqual(len(markets['win_pct']),64)


if __name__=='__main__':unittest.main()
