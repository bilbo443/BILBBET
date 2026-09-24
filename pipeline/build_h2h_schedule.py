"""
Builds a new h2h_schedule.json from the real, official season draw once
it's confirmed -- replacing the current placeholder, programmatically-
generated schedule the app has been running on.

Input format: a simple CSV, one row per fixture, columns:
    division,round,team_a,team_b
This is the easiest format to transcribe from a real, published fixture
list -- no special tooling needed, just a spreadsheet export.

Thoroughly validated before ever producing output, since a transcription
error here would silently corrupt every H2H betting market and every
week's tipping fixtures:
  - every division name matches the current roster exactly
  - every team name matches the CURRENT roster exactly (catches typos
    and renamed/relegated/promoted teams that don't belong in this
    division anymore)
  - Division 1 has fixtures in MW1-26; Division 2/3 in MW2-23
  - every active round pairs every real team; odd-sized groups also
    schedule one fixture against AVERAGE TEAM
  - no team is double-booked or paired against itself

Any validation failure aborts before writing anything -- a partially
correct schedule is worse than the current placeholder, since it would
look confirmed when it isn't.

A concrete gotcha this was caught by its own dry run: at least one real
team name in the current roster contains a literal comma ("DOG GOES
WOOF, PAYNE GOES MEOW", Division 3A). If the source spreadsheet is
exported to CSV without quoting fields that contain commas, this team's
name silently splits into two fields and the row fails as an "unknown
team" error rather than something more obviously wrong -- proper CSV
quoting (which any real spreadsheet's "Export as CSV" already does
correctly) avoids this; the failure mode above is specifically for
someone hand-typing or naively string-joining the CSV instead.
"""
import csv
import json
import sys
from collections import defaultdict

EXPECTED_ROUNDS = 26


def active_rounds(div):
    return set(range(2, 24)) if div.startswith(('DIVISION 2', 'DIVISION 3')) else set(range(1, 27))


def load_current_divisions(divisions_path):
    return json.load(open(divisions_path))


def build_schedule(csv_path, divisions_path):
    divisions = load_current_divisions(divisions_path)
    errors = []

    fixtures = defaultdict(lambda: defaultdict(list))  # division -> round -> [(a,b), ...]
    with open(csv_path, newline='') as f:
        reader = csv.DictReader(f)
        required_cols = {'division', 'round', 'team_a', 'team_b'}
        if not required_cols.issubset(reader.fieldnames or []):
            errors.append(f"CSV must have columns: {required_cols}. Found: {reader.fieldnames}")
            return None, errors
        for i, row in enumerate(reader, start=2):  # row 1 is the header
            div = row['division'].strip()
            try:
                rnd = int(row['round'].strip())
            except ValueError:
                errors.append(f"Row {i}: round '{row['round']}' is not a valid integer")
                continue
            a, b = row['team_a'].strip(), row['team_b'].strip()

            if div not in divisions:
                errors.append(f"Row {i}: division '{div}' doesn't match any current division ({list(divisions.keys())})")
                continue
            average_allowed = len(divisions[div]) % 2 == 1
            if a not in divisions[div] and not (average_allowed and a == 'AVERAGE TEAM'):
                errors.append(f"Row {i}: team '{a}' is not in {div}'s current roster")
            if b not in divisions[div] and not (average_allowed and b == 'AVERAGE TEAM'):
                errors.append(f"Row {i}: team '{b}' is not in {div}'s current roster")
            if a == b:
                errors.append(f"Row {i}: team '{a}' can't play itself")
            if not (1 <= rnd <= EXPECTED_ROUNDS):
                errors.append(f"Row {i}: round {rnd} is out of range (expected 1-{EXPECTED_ROUNDS})")
                continue
            if rnd not in active_rounds(div):
                errors.append(f"Row {i}: {div} has no regular-season fixture in round {rnd}")
                continue

            fixtures[div][rnd].append((a, b))

    if errors:
        return None, errors

    # Structural validation: every division/round accounted for correctly
    for div, teams in divisions.items():
        team_set = set(teams)
        expected_per_round = (len(teams) + 1) // 2

        if div not in fixtures:
            errors.append(f"{div}: no fixtures found in the CSV at all")
            continue

        rounds_present = set(fixtures[div].keys())
        expected_rounds = active_rounds(div)
        missing_rounds = expected_rounds - rounds_present
        extra_rounds = rounds_present - expected_rounds
        if missing_rounds:
            errors.append(f"{div}: missing round(s) {sorted(missing_rounds)}")
        if extra_rounds:
            errors.append(f"{div}: unexpected round number(s) {sorted(extra_rounds)}")

        for rnd in sorted(rounds_present & expected_rounds):
            pairs = fixtures[div][rnd]
            if len(pairs) != expected_per_round:
                errors.append(f"{div} round {rnd}: {len(pairs)} fixture(s), expected {expected_per_round}")
            teams_seen = []
            for a, b in pairs:
                teams_seen.extend([a, b])
            teams_seen_set = set(teams_seen)
            if len(teams_seen) != len(teams_seen_set):
                dupes = [t for t in teams_seen_set if teams_seen.count(t) > 1]
                errors.append(f"{div} round {rnd}: team(s) appearing more than once: {dupes}")
            missing_teams = team_set - teams_seen_set
            if missing_teams:
                errors.append(f"{div} round {rnd}: team(s) not scheduled this round: {sorted(missing_teams)}")
            if len(teams) % 2 == 1 and teams_seen.count('AVERAGE TEAM') != 1:
                errors.append(f"{div} round {rnd}: expected exactly one AVERAGE TEAM fixture")

    if errors:
        return None, errors

    # All validation passed -- assemble the exact schema the app expects:
    # {division: [[[teamA, teamB], ...], ...]}, ordered by round.
    result = {}
    for div, teams in divisions.items():
        result[div] = [
            [[a, b] for a, b in fixtures[div][rnd]]
            for rnd in range(1, EXPECTED_ROUNDS + 1)
        ]
    return result, []


def main():
    if len(sys.argv) != 4:
        print("Usage: python3 build_h2h_schedule.py <fixtures.csv> <h2h_divisions.json> <output.json>")
        sys.exit(1)
    csv_path, divisions_path, output_path = sys.argv[1:4]

    schedule, errors = build_schedule(csv_path, divisions_path)
    if errors:
        print(f"VALIDATION FAILED -- {len(errors)} error(s), nothing written:")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)

    json.dump(schedule, open(output_path, 'w'), indent=2)
    total_fixtures = sum(len(rnd) for div in schedule.values() for rnd in div)
    print(f"Wrote {output_path} -- {len(schedule)} division(s), {total_fixtures} total fixtures, all validated.")


if __name__ == '__main__':
    main()
