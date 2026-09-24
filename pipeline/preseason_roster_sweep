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

Reuses truncate_to_main_table() and normalize_name() from the results-sheet
validator. The final check deliberately has no transition allowlist: a team
missing the day before kickoff needs a human review, even if it was previously
treated as a placeholder. The current-season All Time Data division column is
also checked so late pullouts and waitlist admissions are visible.
"""
import json
import argparse
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import requests

# This script lives under data/, while its shared parsers live under pipeline/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'pipeline'))
from validate_sheet_data import truncate_to_main_table, normalize_name
from build_admin_teams import build_admin_teams
from sync_roster import load_current_roster

# Same mapping sync_roster.py uses -- the sheet's own DIVISION column says
# "ELIZA CUP", but every live data file keys that division as
# "ELIZA CUP (D1)". Every other division's name is identical in both
# places. Kept in sync with sync_roster.py's DIVISION_TIER_TO_LIVE_NAME
# rather than redefined independently, so the two don't drift apart.
SHEET_DIVISION_TO_LIVE_NAME = {
    'ELIZA CUP': 'ELIZA CUP (D1)',
    'DIVISION 2A': 'DIVISION 2A', 'DIVISION 2B': 'DIVISION 2B',
    'DIVISION 3A': 'DIVISION 3A', 'DIVISION 3B': 'DIVISION 3B',
    'DIVISION 3C': 'DIVISION 3C',
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


def compare_rosters(real_roster, live_roster):
    """Returns a list of human-readable issue strings, or [] if consistent.
    A departed team or late admission must be reported even if it was
    previously considered a transitional name."""
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
            issues.append(f"'{team}' is in the live roster (as {live_div}) but doesn't appear anywhere "
                          f"in the current sheet at all -- departed, renamed, or a genuine data problem?")
            continue
        real_team, real_div = real_by_team[norm]
        if real_div != live_div:
            issues.append(f"'{team}' is listed as {live_div} in the live roster, but the sheet currently "
                           f"shows them in {real_div} -- a real division mismatch.")

    for norm, (team, real_div) in real_by_team.items():
        if norm not in live_by_team:
            issues.append(f"'{team}' is in the sheet (as {real_div}) but missing from the live roster "
                           f"entirely -- a new team, or one that hasn't been added yet.")

    return issues


def check_dependent_file(path, extractor, real_roster, label):
    """Generic check: does this file's team set match the real, current
    roster? Catches stale placeholders and departed teams. AVERAGE TEAM is
    an expected synthetic fixture in odd-sized conferences."""
    issues = []
    try:
        data = json.load(open(path))
    except FileNotFoundError:
        return [f"{label}: file not found at {path} -- can't check it."]

    file_teams = extractor(data)
    real_teams = {normalize_name(t) for teams in real_roster.values() for t in teams}
    file_names = {normalize_name(t) for t in file_teams if t != 'AVERAGE TEAM'}
    # Historical coefficients and score records may legitimately retain
    # departed teams. Fixtures and futures cannot; obvious placeholders
    # cannot appear in any live-dependent file.
    active_only = label in ('h2h_schedule.json', 'futures.json')
    unexpected = {t for t in file_teams if normalize_name(t) not in real_teams
                  and t != 'AVERAGE TEAM' and
                  (active_only or any(marker in t.upper() for marker in
                                      ('NEW PLAYER', 'TBD', 'PLACEHOLDER')))}
    missing = real_teams - file_names
    if unexpected:
        issues.append(f"{label}: contains team name(s) not found anywhere in the current real roster: "
                       f"{sorted(unexpected)} -- possible placeholder junk or stale data.")
    if missing:
        issues.append(f"{label}: missing {len(missing)} active team(s) from the current real roster: "
                      f"{sorted(missing)} -- regenerate/review before kickoff.")
    return issues


def run_sweep(sheet_url, roster_path, schedule_path, coeffs_path, history_path,
              futures_path, shift_path, cup_shift_path, widen_path, hist_path,
              round_dates_path, header_row=1, today=None, alltime_url=None,
              only_on_eve=False):
    today = today or date.today()

    round_dates = json.load(open(round_dates_path))
    r1_date = date.fromisoformat(round_dates.get('1', round_dates.get(1, '9999-01-01')))
    if only_on_eve and today != r1_date - timedelta(days=1):
        return {'status': 'skipped', 'reason': f'Final sweep is due only the day before Round 1 ({r1_date}).'}
    if today >= r1_date:
        return {'status': 'skipped', 'reason': f"Round 1 already kicked off ({r1_date}) -- "
                                                 f"this is a pre-season check, nothing to do now."}

    csv_text = fetch_sheet_csv(sheet_url)
    real_roster = real_roster_from_sheet(csv_text, header_row=header_row)
    live_roster = json.load(open(roster_path))

    all_issues = []
    all_issues.extend([f"[roster] {i}" for i in compare_rosters(real_roster, live_roster)])

    # The current-season registry is the authority for late pullouts and
    # waitlist admissions; a results-sheet row alone cannot establish that.
    if not alltime_url:
        all_issues.append('[source] ALLTIME_URL is missing; current-season admissions and departures cannot be verified.')
    else:
        try:
            rules = json.load(open(Path(roster_path).with_name('roster_rules.json')))
            expected = rules['season'][2:4] + '/' + rules['season'][-2:]
            with tempfile.TemporaryDirectory() as tmp:
                sheet = Path(tmp) / 'alltime.csv'
                sheet.write_text(fetch_sheet_csv(alltime_url))
                official, season = build_admin_teams(sheet, out_path=str(Path(tmp) / 'admin.json'))
            if season != expected:
                all_issues.append(f'[source] Latest All Time Data division column is {season}; expected {expected}. Cannot verify current-season pullouts.')
            else:
                official_roster = load_current_roster(official)
                all_issues.extend(f'[current-season registry] {issue}'
                                  for issue in compare_rosters(official_roster, live_roster))
        except Exception as exc:
            all_issues.append(f'[source] Could not read current-season roster: {exc}')

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
    ap.add_argument('--alltime-url', default=None)
    ap.add_argument('--only-on-eve', action='store_true')
    ap.add_argument('--header-row', type=int, default=1)
    ap.add_argument('--today', default=None, help='Override for testing, YYYY-MM-DD.')
    ap.add_argument('--report-path', default=None, help='Optional path to write the report as markdown.')
    args = ap.parse_args()

    today = date.fromisoformat(args.today) if args.today else None

    try:
        result = run_sweep(
            args.sheet_url, args.roster_path, args.schedule_path, args.coeffs_path,
            args.history_path, args.futures_path, args.shift_path, args.cup_shift_path,
            args.widen_path, args.h2h_history_path, args.round_dates_path,
            header_row=args.header_row, today=today, alltime_url=args.alltime_url,
            only_on_eve=args.only_on_eve,
        )
    except Exception as exc:
        result = {'status': 'issues_found', 'issues': [f'[source] Sweep could not complete: {exc}'],
                  'real_roster_team_count': 0}

    if result['status'] == 'skipped':
        print(result['reason'])
        sys.exit(0)

    title = 'Final day-before-kickoff roster sweep' if args.only_on_eve else 'Pre-season roster sweep'
    if result['status'] == 'clean':
        report = (f"{title} -- clean.\n\n"
                  f"Checked {result['real_roster_team_count']} teams across the live roster, "
                  f"fixture schedule, coefficients, history, futures, and every H2H signal file. "
                  f"Nothing inconsistent found.")
        print(report)
        if args.report_path:
            open(args.report_path, 'w').write(report)
        sys.exit(0)

    lines = [f"## {title} -- issues found", "",
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
