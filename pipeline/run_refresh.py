"""
Layer 5 orchestration script -- what the GitHub Action actually runs.

Ties Layers 1-4 together into one CLI call with a clean exit code, since
that's what a CI step needs: run everything, exit 0 only if there's a
genuine draft worth opening a PR for, exit non-zero (with the reason
printed plainly) for every other outcome -- fetch failure, validation
failure, or the simulation step not producing anything.

Confirmed against a real GitHub Actions run: the workflow-to-script
handoff itself works (fetch, validate, extract, simulate, draft all fire
correctly with the right exit codes). The first real run failed for a
different, narrower reason -- the workflow YAML passes --alltime-url and
--data-dir, which this script didn't recognize (argparse exit code 2).

--alltime-url: found and fixed 2026-08-20, a serious gap that would have
silently undermined the whole roster-sync feature even after
pipeline_layer3.py and the workflow's add-paths were both correctly
wired -- this script accepted the flag to stop the crash, but never
actually passed it through to run_pipeline(), so roster sync could never
have fired no matter how correct everything downstream was. Now threaded
through for real.
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
    parser.add_argument('--data-dir', default='data',
                         help='Accepted for compatibility with the workflow YAML -- not currently used for '
                              'anything; every data file path is already passed explicitly and independently '
                              '(--roster-path, --coeffs-path, etc.) rather than built from a shared base directory.')
    parser.add_argument('--alltime-url', default=None,
                         help='The All Time Data sheet URL, for roster sync (see sync_roster.py). '
                              'Optional -- omit to skip roster sync entirely (unchanged behavior otherwise).')
    parser.add_argument('--today', default=None,
                         help='Override "today" as YYYY-MM-DD, for testing or an intentional dry-run. '
                              'Defaults to the real current date.')
    args = parser.parse_args()

    today = date.fromisoformat(args.today) if args.today else None

    result = run_pipeline(
        args.sheet_url, args.roster_path, args.round_dates_path, args.draft_dir,
        coeffs_path=args.coeffs_path, history_path=args.history_path,
        header_row=args.header_row, run_simulation=True, today=today,
        alltime_url=args.alltime_url,
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

    if status == 'extraction_inconsistent':
        print(f"\nSTOPPING: {len(result['inconsistent_teams'])} team(s) have a total that doesn't "
              f"match the sum of their round-by-round scores -- likely a typo'd score in the sheet.")
        for t in result['inconsistent_teams']:
            print(f"  {t['team']} ({t['division']}): sheet says {t['total_reported']}, "
                  f"round scores sum to {t['total_computed']}")
        print("\nNo PR will be opened. Fix the sheet and re-run.")
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
    ]
    # Real gap found and fixed 2026-08-20: roster_change_summary was being
    # correctly computed by sync_roster.py and captured in the pipeline's
    # result dict, but nothing ever actually surfaced it here -- a real
    # roster change (new team, rename, departure) would have been silently
    # dropped, with the PR looking identical to a normal unchanged week.
    # Placed first, before the odds diff, since it's the thing most likely
    # to need a reviewer's actual judgment, not just a glance.
    if result.get('roster_change_summary'):
        pr_body_lines += [
            "### \u26a0\ufe0f Roster change detected this run",
            "",
            result['roster_change_summary'],
            "",
            "---",
            "",
        ]
    pr_body_lines += [
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

    # Expose the exact paths to the next workflow step (the draft-to-publishable
    # conversion) rather than making it glob for the newest odds-draft-*.json --
    # a glob is fragile if a stale file from a previous run is ever left lying
    # around in draft/, which timestamped filenames don't fully rule out on a
    # persistent runner or a re-run.
    github_output = os.environ.get('GITHUB_OUTPUT')
    if github_output:
        with open(github_output, 'a') as f:
            f.write(f"odds_path={result['odds_path']}\n")
            f.write(f"pr_body_path={args.pr_body_path}\n")

    sys.exit(0)


if __name__ == '__main__':
    main()
