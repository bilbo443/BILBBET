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
from datetime import date

from pipeline_layer3 import run_pipeline
from diff_report import compute_diff, generate_diff_report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--sheet-url', required=True)
    parser.add_argument('--roster-path', default='data/h2h_divisions.json')
    parser.add_argument('--round-dates-path', default='data/round_dates.json')
    parser.add_argument('--coeffs-path', default='data/team_market_coeffs.json')
    parser.add_argument('--history-path', default='data/roddy_history.json')
    parser.add_argument('--live-futures-path', default='data/futures.json')
    parser.add_argument('--draft-dir', default='draft')
    parser.add_argument('--pr-body-path', default='draft/pr-body.md')
    parser.add_argument('--header-row', type=int, default=1)
    parser.add_argument('--today', default=None,
                         help='Override "today" as YYYY-MM-DD, for testing or an intentional dry-run. '
                              'Defaults to the real current date.')
    args = parser.parse_args()

    today = date.fromisoformat(args.today) if args.today else None

    result = run_pipeline(
        args.sheet_url, args.roster_path, args.round_dates_path, args.draft_dir,
        coeffs_path=args.coeffs_path, history_path=args.history_path,
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

    diffs = compute_diff(args.live_futures_path, draft['division_rows'], market_key='win_div_pct')
    diff_report = generate_diff_report(diffs, market_label='Division win %')

    flagged = [r for r in diffs if r['flagged']]
    pr_body_lines = [
        "## Weekly odds refresh -- draft ready for review",
        "",
        f"Fetched from the live sheet, passed all Layer 2 validation checks, "
        f"and ran through the real simulation.",
        "",
        f"**{len(flagged)} team(s) flagged** with a swing of 15+ percentage points -- "
        f"worth a specific look before merging." if flagged else
        "**Nothing flagged** -- no swing exceeded the review threshold.",
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
