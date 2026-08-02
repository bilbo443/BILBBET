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
from datetime import datetime, date

from validate_sheet_data import run_all_checks
from extract_results import extract_results
from simulation_adapter import regenerate_division_futures, regenerate_roddy_and_fa_cup, regenerate_promotion_and_leading_at


def fetch_sheet_csv(url, dest_path, timeout=60):
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    with open(dest_path, 'w', encoding='utf-8') as f:
        f.write(resp.text)
    return dest_path


def regenerate_futures_odds(extracted_results):
    """
    Runs the real division-futures simulation (the same Monte Carlo engine
    behind the live site, confirmed to reproduce its output exactly with no
    live data) with extracted_results blended in as a live-season
    adjustment on top of the existing multi-season coefficients.

    Roddy, FA Cup, Promotion, and Leading At all get the same live
    recalibration now -- these were added across several later sessions and,
    until now, only division futures/Roddy/FA Cup were actually wired into
    this automated entry point, meaning a real weekly refresh would have
    silently left Promotion and Leading At stale even as everything else
    updated. ECL still isn't included: its stage markets depend on a real
    group draw that doesn't exist yet, so there's nothing meaningful to
    recalibrate until that's entered. Charity/Philanthropy also isn't
    included -- it lives in a separate script (build_charity.py) that was
    never merged into this pipeline.
    """
    division_result = regenerate_division_futures(extracted_results)
    roddy_fa_cup_result = regenerate_roddy_and_fa_cup(extracted_results)
    promotion_leading_at_result = regenerate_promotion_and_leading_at(extracted_results)
    return {**division_result, **roddy_fa_cup_result, **promotion_leading_at_result}


def write_run_report(draft_dir, run_id, result):
    path = os.path.join(draft_dir, f'run-report-{run_id}.json')
    with open(path, 'w') as f:
        json.dump(result, f, indent=2, default=str)
    return path


def run_pipeline(url, roster_path, round_dates_path, draft_dir,
                  header_row=1, today=None, run_simulation=False):
    os.makedirs(draft_dir, exist_ok=True)
    run_id = datetime.now().strftime('%Y%m%d-%H%M%S')
    log = []

    def step(msg):
        entry = f"[{datetime.now().isoformat(timespec='seconds')}] {msg}"
        log.append(entry)
        print(entry)

    step("Layer 3 pipeline starting")
    step(f"Fetching sheet from {url}")
    csv_path = os.path.join(draft_dir, f'sheet-{run_id}.csv')
    try:
        fetch_sheet_csv(url, csv_path)
    except Exception as e:
        step(f"FETCH FAILED: {e}")
        result = {'status': 'fetch_failed', 'error': str(e), 'log': log}
        write_run_report(draft_dir, run_id, result)
        return result
    step("Fetch succeeded")

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
    results = extract_results(csv_path, header_row=header_row)
    extracted_path = os.path.join(draft_dir, f'extracted-{run_id}.json')
    with open(extracted_path, 'w') as f:
        json.dump(results, f, indent=2)
    step(f"Extracted {len(results)} team record(s) to {extracted_path}")

    if not run_simulation:
        step("run_simulation=False -- stopping here as a dry run (extraction only, no odds regenerated)")
        result = {'status': 'validated_dry_run', 'extracted_path': extracted_path, 'log': log}
        write_run_report(draft_dir, run_id, result)
        return result

    step("Running simulation")
    try:
        odds = regenerate_futures_odds(results)
    except NotImplementedError as e:
        step(f"SIMULATION NOT AVAILABLE: {e}")
        result = {'status': 'simulation_not_implemented', 'extracted_path': extracted_path, 'log': log}
        write_run_report(draft_dir, run_id, result)
        return result

    step("Simulation complete -- writing draft odds")
    odds_path = os.path.join(draft_dir, f'odds-draft-{run_id}.json')
    with open(odds_path, 'w') as f:
        json.dump(odds, f, indent=2)
    result = {'status': 'draft_ready', 'extracted_path': extracted_path, 'odds_path': odds_path, 'log': log}
    write_run_report(draft_dir, run_id, result)
    return result


if __name__ == '__main__':
    import sys
    url = sys.argv[1]
    result = run_pipeline(url, 'h2h_divisions.json', 'round_dates.json', 'draft')
    print()
    print('FINAL STATUS:', result['status'])
