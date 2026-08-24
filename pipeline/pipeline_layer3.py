"""
Layer 3: the unified pipeline.

fetch -> validate (Layer 2) -> extract (Layer 1) -> [simulate] -> draft output.

Design rules carried over from every layer before this one:
  - Never overwrite live data directly. Everything lands in a timestamped
    draft folder; publishing (merging that draft into the live data) is a
    separate, human-gated step (Layer 6), not something this script does.
  - If validation fails, stop immediately. Don't extract, don't simulate,
    don't produce anything that looks like a usable result -- just a clear
    report of what failed and why.
  - Every run writes its own log and report file, so a run that fails (or
    that someone questions later) has a full trail, not just a console
    scrollback that's already gone.

What this does NOT do yet: regenerate the actual futures odds. The full
Monte Carlo simulation (coefficient computation, division/Roddy/cup
projections) already exists from earlier work on this project, but it was
built against the OLD historical CSV format, not this sheet's live
structure. `regenerate_futures_odds()` is the integration point where that
adapter needs to be built -- deliberately left unimplemented rather than
faked, so nobody mistakes a dry run for a real odds refresh.
"""
import os
import json
import requests
import pandas as pd
import time
from datetime import datetime, date

from validate_sheet_data import run_all_checks
from extract_results import extract_results
from simulation_adapter import regenerate_division_futures
from sync_roster import sync_roster_if_changed


def fetch_sheet_csv(url, dest_path, timeout=15):
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    with open(dest_path, 'w', encoding='utf-8') as f:
        f.write(resp.text)
    return dest_path


def fetch_sheet_stable(url, dest_path, wait_seconds=180, max_attempts=3, timeout=15, log_fn=None):
    """
    Real risk this addresses: the scheduled run could fire while the sheet
    author is actively mid-edit -- some rounds fully entered, one row
    half-typed. Fetches twice, `wait_seconds` apart, and compares the raw
    content byte-for-byte; if they differ, the sheet is very likely being
    edited right now, so this waits and retries rather than proceeding
    with what could be a half-written snapshot. Deliberately strict (ANY
    difference triggers a retry, not just a change to a round column) --
    better to retry once too often on an unrelated edit than to process a
    genuinely partial one.

    Returns stable (bool) -- True means dest_path holds a fetch confirmed
    unchanged across the wait; False means every attempt saw the content
    change, and dest_path holds whatever the LAST fetch returned (not used
    by the caller in that case, but left in a known state rather than
    half-written). Progress is reported via log_fn as it happens, not
    returned separately -- the caller's own step()/log mechanism already
    captures everything passed to it.
    """
    log_fn = log_fn or (lambda msg: None)
    for attempt in range(1, max_attempts + 1):
        fetch_sheet_csv(url, dest_path, timeout=timeout)
        first = open(dest_path, encoding='utf-8').read()
        log_fn(f"Stability check {attempt}/{max_attempts}: first fetch done, "
               f"waiting {wait_seconds}s before re-checking...")
        time.sleep(wait_seconds)
        fetch_sheet_csv(url, dest_path, timeout=timeout)
        second = open(dest_path, encoding='utf-8').read()
        if first == second:
            log_fn(f"Stability check {attempt}/{max_attempts}: sheet content "
                   f"unchanged across the wait -- proceeding.")
            return True
        log_fn(f"Stability check {attempt}/{max_attempts}: sheet content CHANGED "
               f"during the wait -- looks like it's being actively edited right now.")
    return False


def regenerate_futures_odds(extracted_results, coeffs_path, roster_path, history_path):
    """
    Runs the real division-futures simulation (the same Monte Carlo engine
    behind the live site, confirmed to reproduce its output exactly with no
    live data) with extracted_results blended in as a live-season
    adjustment on top of the existing multi-season coefficients.

    coeffs_path/roster_path/history_path are passed through explicitly
    rather than relying on regenerate_division_futures()'s own relative-
    path defaults -- those defaults resolve against the process's current
    working directory, which is the repo root when the GitHub Actions
    workflow invokes this (`python pipeline/run_refresh.py`, no `cd`), not
    this script's own directory. Silently falling back to those defaults
    was a real, guaranteed-crash bug caught before ever running for real:
    no file named exactly 'team_market_coeffs.json' exists at the repo
    root, only under data/. roster_path is reused directly rather than a
    separate divs_path -- h2h_divisions.json and new_divs.json are the
    same underlying roster data, and giving that a second, independent
    path was exactly the kind of duplication that let this pipeline's
    copies quietly drift out of sync with the live site's real data in the
    first place.

    Scope note: this covers division futures ('eliza' market) as one
    complete, tested vertical slice. Roddy/FA Cup/ECL use the same
    coefficient-blend approach and the same build_samplers() pattern --
    extending to them is the same method applied again, not new design
    work, and is reasonable to scope as a separate follow-up pass.
    """
    return regenerate_division_futures(extracted_results, coeffs_path=coeffs_path,
                                        divs_path=roster_path, history_path=history_path)


def write_run_report(draft_dir, run_id, result):
    path = os.path.join(draft_dir, f'run-report-{run_id}.json')
    with open(path, 'w') as f:
        json.dump(result, f, indent=2, default=str)
    return path


def run_pipeline(url, roster_path, round_dates_path, draft_dir,
                  coeffs_path='data/team_market_coeffs.json', history_path='data/roddy_history.json',
                  header_row=1, today=None, run_simulation=False, alltime_url=None,
                  stability_wait_seconds=180, stability_max_attempts=3):
    os.makedirs(draft_dir, exist_ok=True)
    run_id = datetime.now().strftime('%Y%m%d-%H%M%S')
    log = []
    roster_change_summary = None

    def step(msg):
        entry = f"[{datetime.now().isoformat(timespec='seconds')}] {msg}"
        log.append(entry)
        print(entry)

    step("Layer 3 pipeline starting")

    # Roster sync runs first, before the main results sheet is even
    # fetched -- a roster change (new team, rename, departure) needs to be
    # reflected in THIS SAME run's validation and simulation, not lag a
    # week behind because it was only picked up after everything else had
    # already read the old roster. alltime_url is optional and off by
    # default: existing manual/test invocations that don't pass it behave
    # exactly as before, untouched.
    if alltime_url:
        step("Checking for roster changes (All Time Data sheet)")
        alltime_csv_path = os.path.join(draft_dir, f'alltime-{run_id}.csv')
        try:
            fetch_sheet_csv(alltime_url, alltime_csv_path)
        except Exception as e:
            step(f"Roster check FAILED to fetch -- continuing with the existing roster unchanged: {e}")
        else:
            data_dir = os.path.dirname(roster_path) or '.'
            try:
                changed, summary = sync_roster_if_changed(alltime_csv_path, data_dir, draft_dir)
            except Exception as e:
                step(f"Roster sync FAILED -- continuing with the existing roster unchanged, "
                     f"this needs a human look: {e}")
            else:
                if changed:
                    step("Roster change detected -- using the freshly-synced files for this run")
                    step(summary)
                    roster_change_summary = summary
                    # Redirect to the freshly-synced draft files for the
                    # rest of THIS run, rather than the now-stale data_dir
                    # versions -- otherwise a same-day roster change
                    # wouldn't actually take effect until the following
                    # week's run.
                    roster_path = os.path.join(draft_dir, 'h2h_divisions.json')
                    coeffs_path = os.path.join(draft_dir, 'team_market_coeffs.json')
                    history_path = os.path.join(draft_dir, 'roddy_history.json')
                else:
                    step("No roster change detected")
    step(f"Fetching sheet from {url}")
    csv_path = os.path.join(draft_dir, f'sheet-{run_id}.csv')
    try:
        stable = fetch_sheet_stable(url, csv_path, wait_seconds=stability_wait_seconds,
                                     max_attempts=stability_max_attempts, log_fn=step)
    except Exception as e:
        step(f"FETCH FAILED: {e}")
        result = {'status': 'fetch_failed', 'error': str(e), 'log': log}
        write_run_report(draft_dir, run_id, result)
        return result
    if not stable:
        step("SHEET UNSTABLE -- content kept changing across every retry, likely being "
             "actively edited right now. Halting rather than risk a half-written snapshot.")
        result = {'status': 'sheet_unstable', 'log': log}
        write_run_report(draft_dir, run_id, result)
        return result
    step("Fetch succeeded and confirmed stable")

    step("Running Layer 2 validation gate")
    report = run_all_checks(csv_path, roster_path, round_dates_path,
                             header_row=header_row, today=today)
    for check in report.checks:
        step(str(check))

    if not report.passed:
        step("VALIDATION FAILED -- halting before touching extraction or simulation")
        result = {'status': 'validation_failed', 'report': report.summary(), 'log': log}
        write_run_report(draft_dir, run_id, result)
        return result

    step("Validation passed -- extracting results (Layer 1)")
    with open(roster_path) as f:
        roster_divs = json.load(f)
    known_roster = [t for teams in roster_divs.values() for t in teams]
    results = extract_results(csv_path, header_row=header_row, known_roster=known_roster)
    extracted_path = os.path.join(draft_dir, f'extracted-{run_id}.json')
    with open(extracted_path, 'w') as f:
        json.dump(results, f, indent=2)
    step(f"Extracted {len(results)} team record(s) to {extracted_path}")

    # extract_results() already computes, per team, whether the sheet's own
    # reported total agrees with the sum of that team's round-by-round
    # scores -- a real, cheap way to catch a misread or typo'd cell -- but
    # until now nothing ever checked it. A silent mismatch here would feed
    # straight into the simulation with no one the wiser. Same halt
    # pattern as a Layer 2 validation failure: stop before simulation,
    # surface exactly what's wrong, let a human decide rather than guess.
    inconsistent = [r for r in results if not r['consistent']]
    if inconsistent:
        step(f"EXTRACTION CONSISTENCY CHECK FAILED -- {len(inconsistent)} team(s) have a mismatch "
             f"between the sheet's own reported total and the sum of their round-by-round scores")
        for r in inconsistent:
            step(f"  {r['team']} ({r['division']}): sheet says {r['total_reported']}, "
                 f"but the round scores sum to {r['total_computed']}")
        result = {'status': 'extraction_inconsistent', 'inconsistent_teams': inconsistent,
                   'extracted_path': extracted_path, 'log': log}
        write_run_report(draft_dir, run_id, result)
        return result
    step(f"Extraction consistency check passed -- every team's reported total matches its round-by-round sum")

    if not run_simulation:
        step("run_simulation=False -- stopping here as a dry run (extraction only, no odds regenerated)")
        result = {'status': 'validated_dry_run', 'extracted_path': extracted_path, 'log': log}
        write_run_report(draft_dir, run_id, result)
        return result

    step("Running simulation")
    try:
        odds = regenerate_futures_odds(results, coeffs_path, roster_path, history_path)
    except NotImplementedError as e:
        step(f"SIMULATION NOT AVAILABLE: {e}")
        result = {'status': 'simulation_not_implemented', 'extracted_path': extracted_path, 'log': log}
        write_run_report(draft_dir, run_id, result)
        return result

    step("Simulation complete -- writing draft odds")
    odds_path = os.path.join(draft_dir, f'odds-draft-{run_id}.json')
    with open(odds_path, 'w') as f:
        json.dump(odds, f, indent=2)
    result = {'status': 'draft_ready', 'extracted_path': extracted_path, 'odds_path': odds_path,
              'roster_change_summary': roster_change_summary, 'log': log}
    write_run_report(draft_dir, run_id, result)
    return result


if __name__ == '__main__':
    import sys
    url = sys.argv[1]
    result = run_pipeline(url, 'h2h_divisions.json', 'round_dates.json', 'draft')
    print()
    print('FINAL STATUS:', result['status'])
