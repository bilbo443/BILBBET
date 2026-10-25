"""Serialize end-of-round checkpoints produced by the shared futures simulations."""
import json
from pathlib import Path
from convert_draft_to_publishable import pct_to_market_odds


def write_leading_snapshot(odds, out_path):
    divisions = {}
    for div, rounds in odds['leading_at_probabilities'].items():
        divisions[div] = {}
        for r, entries in rounds.items():
            converted = []
            for row in entries:
                price = pct_to_market_odds(row['probability_pct'])
                converted.append({'team':row['team'], 'probability_pct':row['probability_pct'], **price})
            divisions[div][r] = sorted(converted,key=lambda row:(row['suspended'],row['odds'] or 0,row['team']))
    result = {'leading_at':divisions,'roddy_leading_at':odds['roddy_leading_at']}
    Path(out_path).write_text(json.dumps(result,indent=2)+'\n')
    return result
