"""Draft a roster-sync PR independently of the results/odds refresh."""
import argparse
import json
import os
from datetime import date
from pipeline_layer3 import fetch_sheet_csv
from sync_roster import sync_roster_if_changed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--alltime-url', required=True)
    parser.add_argument('--data-dir', default='data')
    parser.add_argument('--draft-dir', default='draft')
    parser.add_argument('--today', default=None)
    parser.add_argument('--manual', action='store_true')
    args = parser.parse_args()
    os.makedirs(args.draft_dir, exist_ok=True)
    rules = json.load(open(os.path.join(args.data_dir, 'roster_rules.json')))
    today = date.fromisoformat(args.today) if args.today else date.today()
    if today > date.fromisoformat(rules['freeze_date']) and not args.manual:
        print('Season roster freeze has passed; scheduled check skipped.')
        return
    sheet = os.path.join(args.draft_dir, '_alltime_roster.csv')
    fetch_sheet_csv(args.alltime_url, sheet)
    changed, summary = sync_roster_if_changed(sheet, args.data_dir, args.draft_dir)
    with open(os.path.join(args.draft_dir, 'roster-watch-changed.txt'), 'w') as f:
        f.write('true' if changed else 'false')
    if changed:
        with open(os.path.join(args.draft_dir, 'roster-pr-body.md'), 'w') as f:
            f.write(summary + '\n\nReview the bracket in `draft/fa_cup_draw.json`, '
                    'schedule the additional preliminary round if total entrants exceed 62, '
                    'and review `leading_at.json` / `special_markets.json` before publishing.\n')
    print('Roster change detected' if changed else 'No roster change detected')


if __name__ == '__main__':
    main()
