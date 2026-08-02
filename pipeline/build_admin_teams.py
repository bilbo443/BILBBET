"""
build_admin_teams.py -- rebuilds admin_teams.json from the sheet author's
"All Time Data" tab.

Why this can't just look for a column named "current division" or assume a
fixed column position: the author's own update pattern (confirmed) is to
insert a NEW season's division column in front of the previous one when a
new season starts, rather than updating the existing column's values in
place. That means the column that represents "the current season" shifts
position and gets a new header text (e.g. "25/26 DIVISION" today, "26/27
DIVISION" once the new season is entered) every single year. Hardcoding
either the name or the position would silently break the very first time
the author does exactly what they always do.

The robust approach instead: find every column whose header matches the
pattern "YY/YY DIVISION", parse each one's season label, and use whichever
one represents the MOST RECENT season -- regardless of where it sits in
the sheet. Confirmed empirically against the real file that no other
column (there are several bare "DIVISION"/"DIVISION.N" columns elsewhere,
part of unrelated per-season summary blocks) accidentally matches this
pattern, since only the real one carries a season-label prefix.
"""
import json
import re

import pandas as pd

SEASON_DIVISION_PATTERN = re.compile(r'^(\d{2})/(\d{2})\s+DIVISION$', re.IGNORECASE)


def find_header_row(csv_path, anchor_text='ELIZA ID'):
    """Locates the header row by content, not a hardcoded row number --
    matches this project's established approach for messy, multi-section
    sheets where the header's exact row shifts between exports."""
    try:
        raw = pd.read_csv(csv_path, header=None, low_memory=False)
    except Exception as e:
        with open(csv_path, 'r', encoding='utf-8', errors='replace') as f:
            snippet = f.read(500)
        raise ValueError(
            f"The fetched file couldn't even be parsed as CSV ({e}) -- this almost "
            f"always means the URL returned something other than the real file (an "
            f"error page, a permissions prompt, a redirect target). First 500 "
            f"characters actually received:\n{snippet!r}"
        )
    for r in range(len(raw)):
        row_vals = [str(v) for v in raw.iloc[r] if pd.notna(v)]
        if any(anchor_text.upper() in v.upper() for v in row_vals):
            return r
    # Parsed fine as CSV, but nothing matched the anchor text -- show what
    # was actually fetched, since this usually means the URL returned a
    # DIFFERENT real sheet/tab, not that this one's layout genuinely changed.
    with open(csv_path, 'r', encoding='utf-8', errors='replace') as f:
        snippet = f.read(500)
    raise ValueError(
        f"Could not find a header row containing '{anchor_text}' -- "
        f"the sheet's layout may have changed more than expected, or the URL "
        f"pointed at a different tab than expected. Fetched {len(raw)} row(s), "
        f"{len(raw.columns) if len(raw) else 0} column(s). "
        f"First 500 characters actually received:\n{snippet!r}"
    )


def find_current_season_division_column(columns):
    """Returns the column name representing the most recent season's
    division, by parsing every 'YY/YY DIVISION'-style header and picking
    the one with the highest season label -- not the first or last such
    column encountered, since column order isn't guaranteed."""
    candidates = []
    for col in columns:
        m = SEASON_DIVISION_PATTERN.match(str(col).strip())
        if m:
            yy1, yy2 = m.group(1), m.group(2)
            candidates.append((int(yy1), int(yy2), col))
    if not candidates:
        raise ValueError("No column matching 'YY/YY DIVISION' was found at all -- "
                          "the author's column-naming convention may have changed.")
    candidates.sort(key=lambda c: (c[0], c[1]))
    most_recent = candidates[-1]
    return most_recent[2], f"{most_recent[0]:02d}/{most_recent[1]:02d}"


def build_admin_teams(csv_path, out_path='admin_teams.json'):
    header_row = find_header_row(csv_path)
    df = pd.read_csv(csv_path, header=header_row, low_memory=False)

    status_col, season_label = find_current_season_division_column(df.columns)

    required = ['ELIZA ID', 'CURRENT NAME', 'PLAYER NAME', 'YEAR ENTERED', 'PREVIOUS NAMES']
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"Expected column(s) missing from the sheet: {missing} -- "
                          f"the layout may have changed beyond just the season columns.")

    teams = []
    for _, row in df.iterrows():
        if pd.isna(row['ELIZA ID']) or pd.isna(row['CURRENT NAME']):
            continue
        teams.append({
            'id': f"{int(row['ELIZA ID']):03d}" if str(row['ELIZA ID']).replace('.0', '').isdigit() else str(row['ELIZA ID']).strip(),
            'name': str(row['CURRENT NAME']).strip(),
            'player': str(row['PLAYER NAME']).strip() if pd.notna(row['PLAYER NAME']) else None,
            'year_entered': str(row['YEAR ENTERED']).strip() if pd.notna(row['YEAR ENTERED']) else None,
            'prev_names': str(row['PREVIOUS NAMES']).strip() if pd.notna(row['PREVIOUS NAMES']) else None,
            'status': str(row[status_col]).strip() if pd.notna(row[status_col]) else None,
        })

    json.dump(teams, open(out_path, 'w'))
    return teams, season_label
