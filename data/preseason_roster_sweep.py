"""
Pre-season roster consistency sweep.

Purpose: this session found two real, live roster problems by accident --
Heilan Coos/Toby's Troops vs Frekeinthesheets/Deer Park United being wrong
in Division 2B, and Division 3A/3B being genuinely mixed up with two
literal placeholder names ("NEW PLAYER 1"/"NEW PLAYER 2") surviving in the
live fixture schedule. Both were only caught because someone happened to
look closely. This script is that look, made repeatable: it fetches the
real, current sheet and checks the whole league's roster and every file
that depends on it, rather than waiting for a coincidence.

This is a DIAGNOSTIC tool only -- it never writes to data/, never opens a
PR, and never auto-corrects anything. It produces a report; a human decides
what (if anything) needs fixing, the same "never guess, always ask"
philosophy as every other check in this pipeline. If nothing's wrong, it
says so plainly and exits 0.

Deliberately reuses truncate_to_main_table(), normalize_name(), and
ROSTER_TRANSITION_ALLOWLIST from validate_sheet_data.py rather than
duplicating that logic -- the sheet's structural quirks (garbage sections
below the real table, the known Heilan Coos/Frekeinthesheets flip) are
already solved there, and should stay solved in exactly one place.
"""
import json
import argparse
import sys
from datetime import date

import pandas as pd
import requests

from validate_sheet_data import truncate_to_main_table, normalize_name, ROSTER_TRANSITION_ALLOWLIST

# Same mapping sync_roster.py uses -- the sheet's own DIVISION column says
# "ELIZA CUP", but every live data file keys that division as
# "ELIZA CUP (D1)". Every other division's name is identical in both
# places. Kept in sync with sync_roster.py's DIVISION_TIER_TO_LIVE_NAME
# rather than redefined independently, so the two don't drift apart.
SHEET_DIVISION_TO_LIVE_NAME = {
    'ELIZA CUP': 'ELIZA CUP (D1)',
    'DIVISION 2A': 'DIVISION 2A', 'DIVISION 2B': 'DIVISION 2B',
    'DIVISION 3A': 'DIVISION 3A', 'DIVISION 3B': 'DIVISION 3B',
}


def fetch_sheet_csv(url, timeout=15):
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    return resp.text


def real_roster_from_sheet(csv_text, header_row=1):
    import io
    df = pd.read_csv(io.StringIO(csv_text), header=header_row, low_memory=False)
    df = truncate_to_main_table(df)
    roster = {}
    for _, row in df.iterrows():
        team = row.get('TEAM NAME')
        div = row.get('DIVISION')
        if pd.isna(team) or pd.isna(div):
            continue
        div = str(div).strip()
        live_div = SHEET_DIVISION_TO_LIVE_NAME.get(div, div)  # unknown divisions pass through
        roster.setdefault(live_div, []).append(str(team).strip())
    return roster


def is_allowlisted(team):
    return normalize_name(team) in {normalize_name(t) for t in ROSTER_TRANSITION_ALLOWLIST}


def compare_rosters(real_roster, live_roster):
    """Returns a list of human-readable issue strings, or [] if consistent.
    Known roster-transition names are tolerated here exactly as they are in
    the weekly validation gate -- this sweep is about catching genuinely
    new drift, not re-flagging the one already-explained, already-decided
    situation every single week."""
    issues = []
    all_real_divs = set(real_roster.keys())
    all_live_divs = set(live_roster.keys())

    real_by_team = {}
    for div, teams in real_roster.items():
        for t in teams:
            real_by_team[normalize_name(t)] = (t, div)
    live_by_team = {}
    for div, teams in live_roster.items():
        for t in teams:
            live_by_team[normalize_name(t)] = (t, div)

    for norm, (team, live_div) in live_by_team.items():
        if norm not in real_by_team:
            if not is_allowlisted(team):
                issues.append(f"'{team}' is in the live roster (as {live_div}) but doesn't appear anywhere "
                               f"in the current sheet at all -- departed, renamed, or a genuine data problem?")
            continue
        real_team, real_div = real_by_team[norm]
        if real_div != live_div and not is_allowlisted(team):
            issues.append(f"'{team}' is listed as {live_div} in the live roster, but the sheet currently "
                           f"shows them in {real_div} -- a real division mismatch.")

    for norm, (team, real_div) in real_by_team.items():
        if norm not in live_by_team and not is_allowlisted(team):
            issues.append(f"'{team}' is in the sheet (as {real_div}) but missing from the live roster "
                           f"entirely -- a new team, or one that hasn't been added yet.")

    return issues


def check_dependent_file(path, extractor, real_roster, label):
    """Generic check: does this file's team set match the real, current
    roster (allowing for the known transition exception)? Catches the
    Division 3A/3B "NEW PLAYER 1/2" kind of drift -- a file quietly
    diverging from the roster it's supposed to agree with."""
    issues = []
    try:
        data = json.load(open(path))
    except FileNotFoundError:
        return [f"{label}: file not found at {path} -- can't check it."]

    file_teams = extractor(data)
    real_teams = {normalize_name(t) for teams in real_roster.values() for t in teams}
    allowlist_norm = {normalize_name(t) for t in ROSTER_TRANSITION_ALLOWLIST}

    unexpected = {t for t in file_teams if normalize_name(t) not in real_teams
                  and normalize_name(t) not in allowlist_norm}
    if unexpected:
        issues.append(f"{label}: contains team name(s) not found anywhere in the current real roster: "
                       f"{sorted(unexpected)} -- possible placeholder junk or stale data.")
    return issues


def run_sweep(sheet_url, roster_path, schedule_path, coeffs_path, history_path,
              futures_path, shift_path, cup_shift_path, widen_path, hist_path,
              round_dates_path, header_row=1, today=None):
    today = today or date.today()

    round_dates = json.load(open(round_dates_path))
    r1_date = date.fromisoformat(round_dates.get('1', round_dates.get(1, '9999-01-01')))
    if today >= r1_date:
        return {'status': 'skipped', 'reason': f"Round 1 already kicked off ({r1_date}) -- "
                                                 f"this is a pre-season check, nothing to do now."}

    csv_text = fetch_sheet_csv(sheet_url)
    real_roster = real_roster_from_sheet(csv_text, header_row=header_row)
    live_roster = json.load(open(roster_path))

    all_issues = []
    all_issues.extend([f"[roster] {i}" for i in compare_rosters(real_roster, live_roster)])

    def schedule_teams(d):
        teams = set()
        for div_games in d.values():
            for rnd in div_games:
                for a, b in rnd:
                    teams.add(a); teams.add(b)
        return teams

    def coeffs_teams(d):
        return set(d['team_coeffs'].keys())

    def flat_dict_teams(d):
        return set(d.keys())

    def futures_teams(d):
        teams = set()
        for div, markets in d.get('divisions', {}).items():
            for rows in markets.values():
                for e in rows:
                    teams.add(e['team'])
        return teams

    checks = [
        (schedule_path, schedule_teams, 'h2h_schedule.json'),
        (coeffs_path, coeffs_teams, 'team_market_coeffs.json'),
        (history_path, flat_dict_teams, 'roddy_history.json'),
        (shift_path, flat_dict_teams, 'h2h_shift.json'),
        (cup_shift_path, flat_dict_teams, 'h2h_cup_shift.json'),
        (widen_path, flat_dict_teams, 'h2h_variance_widen.json'),
        (hist_path, flat_dict_teams, 'h2h_history.json'),
        (futures_path, futures_teams, 'futures.json'),
    ]
    for path, extractor, label in checks:
        all_issues.extend([f"[{label}] {i}" for i in check_dependent_file(path, extractor, real_roster, label)])

    return {
        'status': 'clean' if not all_issues else 'issues_found',
        'issues': all_issues,
        'real_roster_team_count': sum(len(v) for v in real_roster.values()),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sheet-url', required=True)
    ap.add_argument('--roster-path', default='data/h2h_divisions.json')
    ap.add_argument('--schedule-path', default='data/h2h_schedule.json')
    ap.add_argument('--coeffs-path', default='data/team_market_coeffs.json')
    ap.add_argument('--history-path', default='data/roddy_history.json')
    ap.add_argument('--futures-path', default='data/futures.json')
    ap.add_argument('--shift-path', default='data/h2h_shift.json')
    ap.add_argument('--cup-shift-path', default='data/h2h_cup_shift.json')
    ap.add_argument('--widen-path', default='data/h2h_variance_widen.json')
    ap.add_argument('--h2h-history-path', default='data/h2h_history.json')
    ap.add_argument('--round-dates-path', default='data/round_dates.json')
    ap.add_argument('--header-row', type=int, default=1)
    ap.add_argument('--today', default=None, help='Override for testing, YYYY-MM-DD.')
    ap.add_argument('--report-path', default=None, help='Optional path to write the report as markdown.')
    args = ap.parse_args()

    today = date.fromisoformat(args.today) if args.today else None

    result = run_sweep(
        args.sheet_url, args.roster_path, args.schedule_path, args.coeffs_path,
        args.history_path, args.futures_path, args.shift_path, args.cup_shift_path,
        args.widen_path, args.h2h_history_path, args.round_dates_path,
        header_row=args.header_row, today=today,
    )

    if result['status'] == 'skipped':
        print(result['reason'])
        sys.exit(0)

    if result['status'] == 'clean':
        report = (f"Pre-season roster sweep -- clean.\n\n"
                  f"Checked {result['real_roster_team_count']} teams across the live roster, "
                  f"fixture schedule, coefficients, history, futures, and every H2H signal file. "
                  f"Nothing inconsistent found.")
        print(report)
        if args.report_path:
            open(args.report_path, 'w').write(report)
        sys.exit(0)

    lines = ["## Pre-season roster sweep -- issues found", "",
             f"{len(result['issues'])} issue(s) flagged. Nothing has been changed -- this is a report only.", ""]
    for issue in result['issues']:
        lines.append(f"- {issue}")
    report = '\n'.join(lines)
    print(report)
    if args.report_path:
        open(args.report_path, 'w').write(report)
    sys.exit(1)


if __name__ == '__main__':
    main()
