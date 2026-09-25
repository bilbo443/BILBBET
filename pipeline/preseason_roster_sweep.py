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


def compare_provisional_results_sheet(sheet_roster, live_roster):
    """Report useful clues without treating DIV 3 - TBC as an assignment."""
    sheet = {normalize_name(t): (t, div) for div, teams in sheet_roster.items() for t in teams}
    live = {normalize_name(t): (t, div) for div, teams in live_roster.items() for t in teams}
    issues = []
    missing_from_sheet = sorted(t for key, (t, _) in live.items() if key not in sheet)
    if missing_from_sheet:
        issues.append(f"{len(missing_from_sheet)} published-roster team(s) absent from the provisional "
                      f"results sheet: {missing_from_sheet}. Confirm status in the current-season registry.")
    unassigned = sorted(t for key, (t, div) in sheet.items()
                        if key not in live and div == 'DIV 3 - TBC')
    if unassigned:
        issues.append(f"{len(unassigned)} Division 3 name(s) in the provisional results sheet "
                      f"but not the published roster: {unassigned}. These are candidates, not "
                      "confirmed admissions or conference placements.")
    for key, (team, div) in sheet.items():
        if key not in live:
            if div != 'DIV 3 - TBC':
                issues.append(f"'{team}' appears only in the results sheet ({div}); "
                              "confirm in the current-season registry before admitting them.")
            continue
        live_div = live[key][1]
        if div != live_div and not (div == 'DIV 3 - TBC' and live_div.startswith('DIVISION 3')):
            issues.append(f"'{team}' is {live_div} in the published roster but {div} in the results "
                          "sheet; verify the tier before publication.")
    return issues


def compare_registry_entries(sheet_rows, saved_rows):
    """Flag identity changes in an older-season sheet, never admissions."""
    sheet = {str(row['id']): row for row in sheet_rows}
    saved = {str(row['id']): row for row in saved_rows}
    issues = []
    if len(sheet) != len(sheet_rows) or len(saved) != len(saved_rows):
        issues.append('Duplicate team ID in published sheet or saved registry.')
    for team_id in sorted(sheet.keys() - saved.keys()):
        row = sheet[team_id]
        issues.append(f"New registry record {team_id} ({row['name']}) is absent from "
                      'data/admin_teams.json -- waitlist candidate only; no admission or conference inferred.')
    for team_id in sorted(saved.keys() - sheet.keys()):
        issues.append(f"Saved registry record {team_id} ({saved[team_id]['name']}) is "
                      'absent from the published sheet -- check with the sheet author.')
    for team_id in sorted(sheet.keys() & saved.keys()):
        if sheet[team_id]['name'] != saved[team_id]['name']:
            issues.append(f"Registry ID {team_id} changed name from {saved[team_id]['name']} "
                          f"to {sheet[team_id]['name']} -- confirm before renaming live files.")
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



def check_schedule_matchweeks(path, roster):
    """Check each conference and matchweek, including an odd league's median opponent."""
    try:
        with open(path) as stream:
            schedule = json.load(stream)
    except (OSError, ValueError) as exc:
        return [f'[h2h_schedule.json] Cannot read fixture schedule: {exc}']
    if not isinstance(schedule, dict):
        return ['[h2h_schedule.json] Schedule must be a division-to-rounds object.']

    issues = []
    for division in sorted(schedule.keys() - roster.keys()):
        issues.append(f'[h2h_schedule.json] Unexpected conference {division}.')
    for division, team_names in roster.items():
        rounds = schedule.get(division)
        if not isinstance(rounds, list):
            issues.append(f'[h2h_schedule.json] {division}: missing round list.')
            continue
        if len(rounds) != 26:
            issues.append(f'[h2h_schedule.json] {division}: expected 26 matchweeks; found {len(rounds)}.')
        expected = {normalize_name(team) for team in team_names}
        if len(expected) != len(team_names):
            issues.append(f'[h2h_schedule.json] {division}: duplicate roster team name.')
        for week, fixtures in enumerate(rounds, 1):
            prefix = f'[h2h_schedule.json] {division} MW{week}:'
            if not isinstance(fixtures, list):
                issues.append(f'{prefix} fixtures must be a list.')
                continue
            is_div1 = division == 'ELIZA CUP (D1)'
            regular = is_div1 or 2 <= week <= 23
            if not regular and week >= 24 and fixtures:
                issues.append(f'{prefix} finals fixtures belong in the app Playoffs tab, '
                              'not h2h_schedule.json.')
            if not regular and week == 1 and fixtures:
                issues.append(f'{prefix} no Division 2/3 fixtures in MW1.')
            seen = set()
            average_count = 0
            for fixture in fixtures:
                if not isinstance(fixture, (list, tuple)) or len(fixture) != 2 or not all(
                    isinstance(team, str) for team in fixture
                ):
                    issues.append(f'{prefix} malformed fixture {fixture!r}.')
                    continue
                for team in fixture:
                    if team == 'AVERAGE TEAM':
                        average_count += 1
                        continue
                    name = normalize_name(team)
                    if name not in expected:
                        issues.append(f'{prefix} {team!r} is not in this conference.')
                    if name in seen:
                        issues.append(f'{prefix} {team!r} appears more than once.')
                    seen.add(name)
            if regular:
                missing = expected - seen
                if missing:
                    issues.append(f'{prefix} {len(missing)} roster team(s) have no fixture: '
                                  f'{sorted(missing)}.')
                required_average = len(team_names) % 2
                if average_count != required_average:
                    issues.append(f'{prefix} expected {required_average} AVERAGE TEAM fixture(s); '
                                  f'found {average_count}.')
            elif average_count:
                issues.append(f'{prefix} AVERAGE TEAM belongs to regular-season fixtures only.')
    return issues



def check_conference_prices(path, roster, label):
    """Catch stale prices even when the global set of teams is correct."""
    try:
        with open(path) as stream:
            data = json.load(stream)
    except (OSError, ValueError) as exc:
        return [f'{label}: could not read {path}: {exc}']
    key = 'leading_at' if label == 'leading_at.json' else 'divisions'
    divisions = data.get(key, {})
    issues = []
    for division, teams in roster.items():
        markets = divisions.get(division)
        if not isinstance(markets, dict) or not markets:
            issues.append(f'{label}: missing markets for {division}')
            continue
        expected = {normalize_name(team) for team in teams}
        for market, rows in markets.items():
            if not isinstance(rows, list):
                issues.append(f'{label}: {division} / {market} is not a team list')
                continue
            names = [row.get('team') for row in rows if isinstance(row, dict)]
            actual = {normalize_name(team) for team in names if isinstance(team, str)}
            if actual != expected or len(names) != len(actual):
                issues.append(f'{label}: {division} / {market}: '
                              f'extra={sorted(actual - expected)}, '
                              f'missing={sorted(expected - actual)}, '
                              f'duplicate/invalid rows={len(rows) - len(actual)}')
    for division in divisions.keys() - roster.keys():
        issues.append(f'{label}: obsolete conference {division}')
    return issues


def check_whole_league_prices(path, roster, label, section):
    """Every whole-league market must contain each current team exactly once."""
    try:
        with open(path) as stream:
            data = json.load(stream)
    except (OSError, ValueError) as exc:
        return [f'{label}: could not read {path}: {exc}']
    markets = data if section is None else data.get(section)
    if not isinstance(markets, dict) or not markets:
        return [f'{label}: {section or "market"} is missing']
    expected = {normalize_name(t): t for teams in roster.values() for t in teams}
    by_difference = {}
    for market, rows in markets.items():
        if not isinstance(rows, list):
            by_difference.setdefault(('not a list',), []).append(market)
            continue
        actual = [row.get('team') for row in rows if isinstance(row, dict)]
        names = {normalize_name(t): t for t in actual if isinstance(t, str)}
        extra = tuple(sorted(names[t] for t in names.keys() - expected.keys()))
        missing = tuple(sorted(expected[t] for t in expected.keys() - names.keys()))
        invalid = len(rows) - len(names)
        if extra or missing or invalid:
            by_difference.setdefault((extra, missing, invalid), []).append(market)
    issues = []
    for difference, markets_affected in by_difference.items():
        if difference == ('not a list',):
            issues.append(f'{label}: {section or "market"} has non-list markets: {markets_affected}')
        else:
            extra, missing, invalid = difference
            issues.append(f'{label}: {section or "market"} / {", ".join(markets_affected)}: '
                          f'extra={list(extra)}, missing={list(missing)}, '
                          f'duplicate/invalid rows={invalid}')
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
    provisional_roster = real_roster_from_sheet(csv_text, header_row=header_row)
    live_roster = json.load(open(roster_path))

    all_issues = [f"[provisional results sheet] {i}" for i in
                  compare_provisional_results_sheet(provisional_roster, live_roster)]
    authoritative_roster = live_roster

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
                all_issues.append(f'[source] Latest All Time Data division column is {season}; expected {expected}. '
                                  'Using the saved registry to check published assignments; current-season '
                                  'admissions and departures still need organiser confirmation.')
                with open(Path(roster_path).with_name('admin_teams.json')) as stream:
                    saved = json.load(stream)
                all_issues.extend(f'[registry candidate] {issue}'
                                  for issue in compare_registry_entries(official, saved))
                snapshot_roster = load_current_roster(saved)
                all_issues.extend(f'[saved registry] {issue}'
                                  for issue in compare_rosters(snapshot_roster, live_roster))
            else:
                official_roster = load_current_roster(official)
                all_issues.extend(f'[current-season registry] {issue}'
                                  for issue in compare_rosters(official_roster, live_roster))
                authoritative_roster = official_roster
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
        all_issues.extend([f"[{label}] {i}" for i in
                           check_dependent_file(path, extractor, authoritative_roster, label)])

    all_issues.extend(check_schedule_matchweeks(schedule_path, live_roster))

    for filename in ('futures.json', 'leading_at.json'):
        path = futures_path if filename == 'futures.json' else Path(roster_path).with_name(filename)
        all_issues.extend(check_conference_prices(path, live_roster, filename))

    for path, label, section in (
        (futures_path, 'futures.json', 'roddy'),
        (futures_path, 'futures.json', 'fa_cup_markets'),
        (Path(roster_path).with_name('leading_at.json'), 'leading_at.json', 'roddy_leading_at'),
        (Path(roster_path).with_name('special_markets.json'), 'special_markets.json', None),
    ):
        all_issues.extend(check_whole_league_prices(path, live_roster, label, section))

    return {
        'status': 'clean' if not all_issues else 'issues_found',
        'issues': all_issues,
        'real_roster_team_count': sum(len(v) for v in authoritative_roster.values()),
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
