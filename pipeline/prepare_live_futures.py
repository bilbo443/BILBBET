"""Generate review-only futures from a validated extraction and stable source CSV."""
import argparse
import json
from pathlib import Path
from live_futures import refresh_whole_league
from simulation_adapter import regenerate_division_futures
from convert_draft_to_publishable import convert_draft_to_publishable


def prepare(csv_path, extracted_path, out_dir, data_dir='data'):
    data, out = Path(data_dir), Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    read = lambda n: json.loads((data/(n+'.json')).read_text())
    results = json.loads(Path(extracted_path).read_text())
    odds = regenerate_division_futures(results, str(data/'team_market_coeffs.json'), str(data/'h2h_divisions.json'), str(data/'roddy_history.json'))
    whole, roddy_scores = refresh_whole_league(csv_path,data,read('admin_teams'),read('h2h_divisions'),read('team_market_coeffs'),read('roddy_history'),{r['team']:r['scores_by_round'] for r in results})
    odds.update(whole)
    draft = out/'odds.json'; draft.write_text(json.dumps(odds,indent=2)+'\n')
    converted, summary = convert_draft_to_publishable(str(draft),str(data/'futures.json'),str(out/'futures.json'))
    (out/'roddy-results.json').write_text(json.dumps(roddy_scores,indent=2)+'\n')
    print('Review prepared:',out)
    for line in summary: print(line)
    return converted


if __name__ == '__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--csv-path',required=True);p.add_argument('--extracted-path',required=True)
    p.add_argument('--out-dir',required=True);p.add_argument('--data-dir',default='data')
    a=p.parse_args();prepare(a.csv_path,a.extracted_path,a.out_dir,a.data_dir)
