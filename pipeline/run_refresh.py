"""
Layer 5 orchestration script -- what the GitHub Action actually runs.

Ties Layers 1-4 together into one CLI call with a clean exit code, since
that's what a CI step needs: run everything, exit 0 only if there's a
genuine draft worth opening a PR for, exit non-zero (with the reason
printed plainly) for every other outcome -- fetch failure, validation
failure, or the simulation step not producing anything.

This script is fully tested locally (see the test runs in this session).
The GitHub Actions YAML that calls it is written to standard, correct
syntax but has NOT been run on a real GitHub Actions runner -- there's no
GitHub repo or Actions environment available in this sandbox to verify
that specific wiring against. Flagged explicitly rather than left
implicit: the workflow's first real run is the one part of this whole
pipeline that still needs to be confirmed outside of here.
"""
import sys
import os
import json
import argparse
import requests
from datetime import date

from pipeline_layer3 import run_pipeline
from diff_report import compute_diff, generate_diff_report
from sync_roster import sync_roster_if_changed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--sheet-url', required=True)
    parser.add_argument('--alltime-url', default=None,
                         help='Published CSV URL for the All Time Data / team registry sheet. '
                              'If given, roster changes (new/renamed/departed teams) are detected '
                              'and synced automatically before odds are simulated. If omitted, '
                              'roster sync is skipped entirely -- odds still refresh normally.')
    parser.add_argument('--data-dir', default='data',
                         help='Directory holding the current live data files (h2h_divisions.json, '
                              'admin_teams.json, etc.) to compare the roster against.')
    parser.add_argument('--roster-path', default='h2h_divisions.json')
    parser.add_argument('--round-dates-path', default='round_dates.json')
    parser.add_argument('--live-futures-path', default='futures.json')
    parser.add_argument('--draft-dir', default='draft')
    parser.add_argument('--pr-body-path', default='draft/pr-body.md')
    parser.add_argument('--header-row', type=int, default=1)
    parser.add_argument('--today', default=None,
                         help='Override "today" as YYYY-MM-DD, for testing or an intentional dry-run. '
                              'Defaults to the real current date.')
    args = parser.parse_args()

    today = date.fromisoformat(args.today) if args.today else None

    roster_changed = False
    roster_summary = None
    roster_path_for_odds = args.roster_path
    if args.alltime_url:
        os.makedirs(args.draft_dir, exist_ok=True)
        alltime_local_path = os.path.join(args.draft_dir, '_alltime_data.csv')
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                              '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/csv,text/plain,*/*',
            }
            resp = requests.get(args.alltime_url, timeout=60, headers=headers)
            resp.raise_for_status()
            with open(alltime_local_path, 'w', encoding='utf-8') as f:
                f.write(resp.text)
        except Exception as e:
            print(f"\nCouldn't fetch the All Time Data sheet ({e}) -- continuing with odds refresh "
                  f"only, roster sync skipped for this run.")
            alltime_local_path = None

        if alltime_local_path:
            try:
                roster_changed, roster_summary = sync_roster_if_changed(
                    alltime_local_path, data_dir=args.data_dir, draft_dir=args.draft_dir)
            except Exception as e:
                print(f"\nSTOPPING: roster sync failed -- {e}")
                print("No PR will be opened. This needs a human look before anything gets published.")
                sys.exit(1)
            if roster_changed:
                # odds must be simulated against the FRESH roster this sync just wrote,
                # not the stale one still sitting in data_dir
                roster_path_for_odds = os.path.join(args.draft_dir, 'h2h_divisions.json')

    result = run_pipeline(
        args.sheet_url, roster_path_for_odds, args.round_dates_path, args.draft_dir,
        header_row=args.header_row, run_simulation=True, today=today,
    )

    status = result['status']

    if status == 'fetch_failed':
        print(f"\nSTOPPING: couldn't fetch the sheet -- {result['error']}")
        print("No PR will be opened. Check the sheet's publish settings and the URL.")
        sys.exit(1)

    if status == 'validation_failed':
        print(f"\nSTOPPING: the sheet failed validation.\n{result['report']}")
        print("\nNo PR will be opened. This needs a human look before anything gets published --")
        print("could be genuinely bad data, or could be the author still mid-testing (see the ")
        print("calendar-consistency check above if that's what fired).")
        sys.exit(1)

    if status == 'simulation_not_implemented':
        print("\nSTOPPING: the simulation step isn't available for this run.")
        sys.exit(1)

    if status != 'draft_ready':
        print(f"\nSTOPPING: unexpected pipeline status '{status}'.")
        sys.exit(1)

    # status == 'draft_ready' -- build the diff report and PR body
    with open(result['odds_path']) as f:
        draft = json.load(f)

    # Publish real per-team round scores alongside the odds, for the
    # bet-resolution suggestion feature -- {team: [score_r1, score_r2, ...]},
    # null for any round not yet played. Only written here, in the confirmed
    # draft_ready path -- same principle as everything else in this
    # pipeline: nothing gets published, not even this, unless the whole run
    # genuinely succeeded.
    extracted = result.get('extracted_results') or []
    real_results = {}
    for r in extracted:
        scores = r.get('scores_by_round') or []
        real_results[r['team']] = [(s if s is not None else None) for s in scores]
    with open(os.path.join(args.draft_dir, 'real_results.json'), 'w') as f:
        json.dump(real_results, f)

    diffs = compute_diff(args.live_futures_path, draft['division_rows'], market_key='win_div_pct')
    diff_report = generate_diff_report(diffs, market_label='Division win %')

    other_markets = [
        ('roddy_rows', 'Roddy'), ('fa_cup_rows', 'FA Cup'),
        ('promotion_rows', 'Promotion'), ('leading_at_rows', 'Leading At (division)'),
        ('roddy_leading_at_rows', 'Leading At (Roddy)'),
    ]
    included_markets = [label for key, label in other_markets if key in draft]

    flagged = [r for r in diffs if r['flagged']]
    roster_section = []
    if roster_changed:
        roster_section = [
            "\u26a0\ufe0f **This run also includes a roster change, detected from the All Time Data "
            "sheet and already applied to the files in this draft** -- review this section with real "
            "care, since it affects the roster itself, not just this week's odds:",
            "",
            roster_summary,
            "",
        ]
    pr_body_lines = [
        "## Weekly odds refresh -- draft ready for review",
        "",
    ] + roster_section + [
        f"Fetched from the live sheet, passed all Layer 2 validation checks, "
        f"and ran through the real simulation.",
        "",
        f"**{len(flagged)} team(s) flagged** with a swing of 15+ percentage points -- "
        f"worth a specific look before merging." if flagged else
        "**Nothing flagged** -- no swing exceeded the review threshold.",
        "",
        f"Also regenerated in this draft (not shown in detail below, but included in the "
        f"files this PR touches): {', '.join(included_markets)}. Worth a manual skim of "
        f"those specifically if anything about this week's results looks unusual, since "
        f"only the division win-market gets an automatic flagged-swing check right now.",
        "",
        diff_report,
    ]
    pr_body = '\n'.join(pr_body_lines)

    os.makedirs(os.path.dirname(args.pr_body_path), exist_ok=True)
    with open(args.pr_body_path, 'w') as f:
        f.write(pr_body)

    print(f"\nDraft ready: {result['odds_path']}")
    print(f"PR body written to: {args.pr_body_path}")
    print(f"{len(flagged)} item(s) flagged for review.")
    sys.exit(0)


if __name__ == '__main__':
    main()
