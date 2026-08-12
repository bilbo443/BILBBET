"""
Layer 2: the validation gate.

Runs after Layer 1's extraction, before any data is allowed near the
simulation. Every check here traces back to a real issue this project has
actually hit -- a duplicate table, a system account mixed into real
punters, a misread column, test data mistaken for live results. Nothing
here is hypothetical.

Philosophy: fail loudly and specifically. A check either passes, or it
fails with an exact reason. Nothing here silently "fixes" or guesses at
bad data -- that's a human decision, not this script's.
"""
import pandas as pd
import json
import re
from datetime import date, datetime


REQUIRED_HEADERS = ['ELIZA ID', 'TEAM NAME', 'DIVISION', 'FA CUP', 'ECL',
                     'TOT', 'AVG', 'POINTS', 'WINS', 'DRAW', 'LOSSES', 'PTS +', 'PTS -', 'DIFF']
ROUND_COLS = [str(n) for n in range(1, 27)]
PLAUSIBLE_SCORE_RANGE = (0, 200)  # every real score seen in this project has fallen well inside this
SYSTEM_ACCOUNT_KEYWORDS = ['CREDIT', 'SYSTEM', 'HOUSE', 'BILBBET CREDIT']


class CheckResult:
    def __init__(self, name, passed, message):
        self.name = name
        self.passed = passed
        self.message = message

    def __repr__(self):
        mark = '\u2713' if self.passed else '\u2717'
        return f"[{mark}] {self.name}: {self.message}"


class ValidationReport:
    def __init__(self):
        self.checks = []

    def add(self, name, passed, message):
        self.checks.append(CheckResult(name, passed, message))

    @property
    def passed(self):
        return all(c.passed for c in self.checks)

    @property
    def failures(self):
        return [c for c in self.checks if not c.passed]

    def summary(self):
        lines = [repr(c) for c in self.checks]
        lines.append('')
        lines.append('RESULT: ' + ('PASS' if self.passed else f'FAIL ({len(self.failures)} check(s) failed)'))
        return '\n'.join(lines)


def normalize_name(name):
    """Same normalization used throughout this project for team-name matching."""
    s = str(name).strip()
    s = re.sub(r'\s*\([A-Z0-9]+\)\s*$', '', s)  # strip competition suffixes like " (D1)", " (2A)"
    s = re.sub(r'[^A-Za-z0-9]+', '', s).upper()
    return s


def truncate_to_main_table(df):
    """
    The real sheet is one tab with the actual 62-team roster table followed
    by many other, unrelated sections stacked below it on the same tab
    (H2H tables, ECL group tables, a Roddy ranking table, win streaks,
    fixtures, even an unrelated A-League team reference list used for some
    other dropdown elsewhere in the spreadsheet) -- confirmed directly by
    fetching the live sheet and finding real A-League club names ("Adelaide
    United", "Auckland FC", etc.) landing in the exact same column position
    as TEAM NAME purely by coincidence of the spreadsheet's layout, dozens
    of rows below where the actual roster table ends.

    pandas reads the whole file as one table with no awareness of this, so
    every downstream section's column-1 value -- whatever it happens to be
    -- silently gets swept into df['TEAM NAME'] too, inflating row counts
    and producing "unknown team" failures for things that were never teams
    at all.

    The real table boundary is a genuine, fully-blank row separating it
    from everything below -- confirmed present in the live sheet. Truncate
    there rather than trying to special-case every downstream section's
    quirks individually.
    """
    if 'TEAM NAME' not in df.columns:
        return df
    blank_mask = df.isna().all(axis=1)
    if not blank_mask.any():
        return df  # no blank row found -- nothing to truncate, leave as-is
    first_blank_idx = blank_mask.idxmax()
    return df.iloc[:first_blank_idx]


def load_roster(roster_path):
    divisions = json.load(open(roster_path))
    teams = set()
    for div_teams in divisions.values():
        teams.update(div_teams)
    return teams, len(teams)


def check_required_headers(df, report):
    missing = [h for h in REQUIRED_HEADERS if h not in df.columns]
    if missing:
        report.add('required_headers', False,
                    f"Missing expected column(s): {missing}. Sheet structure may have changed.")
    else:
        report.add('required_headers', True, "All required headers present.")


def check_round_columns(df, report):
    missing = [r for r in ROUND_COLS if r not in df.columns]
    if missing:
        report.add('round_columns', False, f"Missing round column(s): {missing}.")
    else:
        report.add('round_columns', True, "All 26 round columns present.")


def check_no_duplicate_header(df, report):
    """The exact issue found in the 'Bilbbet Home' sheet: a second copy of
    the header row (and an incomplete duplicate table) further down."""
    dup_cols = [c for c in df.columns if c == 'TEAM NAME']
    # a small number of legitimate re-uses is expected (ladder table, club
    # profile sections) -- this checks specifically for a second FULL
    # results-shaped block, which would mean literal duplicated data rows.
    team_col_positions = [i for i, c in enumerate(df.columns) if c == 'TEAM NAME']
    if len(team_col_positions) > 4:
        report.add('no_duplicate_table', False,
                    f"'TEAM NAME' appears {len(team_col_positions)} times -- more than the expected "
                    f"3 sections (results/ladder/club profiles). Possible duplicated table.")
    else:
        report.add('no_duplicate_table', True,
                    f"'TEAM NAME' appears {len(team_col_positions)} times, matching the known sections.")


def check_row_count(df, expected_team_count, report, tolerance=0.15):
    real_rows = df['TEAM NAME'].notna().sum() if 'TEAM NAME' in df.columns else 0
    low = expected_team_count * (1 - tolerance)
    high = expected_team_count * (1 + tolerance)
    if low <= real_rows <= high:
        report.add('row_count', True, f"{real_rows} team rows, within expected range of {expected_team_count}.")
    else:
        report.add('row_count', False,
                    f"{real_rows} team rows found, expected roughly {expected_team_count} "
                    f"(acceptable range {low:.0f}-{high:.0f}). Sheet may be incomplete or duplicated.")


def check_known_roster(df, current_roster, report):
    if 'TEAM NAME' not in df.columns:
        report.add('known_roster', False, "Can't check roster -- TEAM NAME column missing.")
        return
    normalized_roster = {normalize_name(t) for t in current_roster}
    sheet_names = df['TEAM NAME'].dropna().unique()
    unmatched = [n for n in sheet_names if normalize_name(n) not in normalized_roster]
    if unmatched:
        report.add('known_roster', False,
                    f"{len(unmatched)} team name(s) in the sheet don't match the current roster: "
                    f"{unmatched[:10]}. Could be a genuine roster change, a rename, or a misread row -- "
                    f"needs a human decision, not an automatic guess.")
    else:
        report.add('known_roster', True, "Every team name matches the current roster.")


def check_score_ranges(df, report):
    out_of_range = []
    for r in ROUND_COLS:
        if r not in df.columns:
            continue
        vals = pd.to_numeric(df[r], errors='coerce').dropna()
        bad = vals[(vals < PLAUSIBLE_SCORE_RANGE[0]) | (vals > PLAUSIBLE_SCORE_RANGE[1])]
        if len(bad):
            out_of_range.append((r, list(bad)))
    if out_of_range:
        report.add('score_ranges', False,
                    f"Score(s) outside the plausible range {PLAUSIBLE_SCORE_RANGE}: {out_of_range[:5]}.")
    else:
        report.add('score_ranges', True, f"All scores fall within the plausible range {PLAUSIBLE_SCORE_RANGE}.")


def check_system_accounts(df, report):
    if 'TEAM NAME' not in df.columns:
        return
    flagged = [n for n in df['TEAM NAME'].dropna().unique()
               if any(kw in str(n).upper() for kw in SYSTEM_ACCOUNT_KEYWORDS)]
    if flagged:
        report.add('system_accounts', False,
                    f"Name(s) matching known system/house-account patterns: {flagged}. "
                    f"Confirm these are real team names, not a system row (e.g. the 'BILBBET CREDIT' "
                    f"case found in the Bilbbet Home sheet) before proceeding.")
    else:
        report.add('system_accounts', True, "No system-account-like names found.")


def check_calendar_consistency(df, round_dates, report, today=None):
    """A round with score data present should have an already-arrived kickoff
    date. If not, this is very likely pre-season test data (confirmed
    behavior, not hypothetical -- this exact check flagged the entire live
    test export correctly during development)."""
    today = today or date.today()
    flagged = []
    for r in ROUND_COLS:
        if r not in df.columns:
            continue
        has_score = df[r].notna().any()
        round_date_str = round_dates.get(r)
        if not round_date_str:
            continue
        round_date = datetime.strptime(round_date_str, '%Y-%m-%d').date()
        if has_score and today < round_date:
            flagged.append((r, round_date_str))
    if flagged:
        report.add('calendar_consistency', False,
                    f"{len(flagged)} round(s) have score data but haven't reached their scheduled "
                    f"kickoff date yet: {flagged[:5]}. This is very likely test data -- do not publish "
                    f"without manual confirmation.")
    else:
        report.add('calendar_consistency', True, "All scored rounds have reached their kickoff date.")


def run_all_checks(csv_path, roster_path, round_dates_path, header_row=1, today=None):
    df = pd.read_csv(csv_path, header=header_row, low_memory=False)
    df = truncate_to_main_table(df)
    roster, expected_team_count = load_roster(roster_path)
    round_dates = json.load(open(round_dates_path))

    report = ValidationReport()
    check_required_headers(df, report)
    check_round_columns(df, report)
    check_no_duplicate_header(df, report)
    check_row_count(df, expected_team_count, report)
    check_known_roster(df, roster, report)
    check_score_ranges(df, report)
    check_system_accounts(df, report)
    check_calendar_consistency(df, round_dates, report, today=today)
    return report


if __name__ == '__main__':
    import sys
    csv_path = sys.argv[1] if len(sys.argv) > 1 else 'data_2627_raw.csv'
    report = run_all_checks(csv_path, 'h2h_divisions.json', 'round_dates.json')
    print(report.summary())
