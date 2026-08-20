"""
Layer 1: header-based extraction of per-round results from the
'DATA 26/27' sheet.

Design principle: every column is located by its header text, never by
position. If a column moves, this still finds it. If a header goes missing
entirely, this fails loudly (raises) rather than silently reading the wrong
column -- exactly the validation-gate philosophy agreed on for this pipeline.
"""
import pandas as pd
import sys
import re

REQUIRED_HEADERS = ['TEAM NAME', 'DIVISION', 'TOT']
ROUND_COLS = [str(n) for n in range(1, 27)]


def _normalize_name(name):
    """Same normalization validate_sheet_data.py uses for roster matching --
    duplicated rather than imported to keep this module's only dependency
    being pandas, matching its existing design. Keep in sync if either
    changes."""
    s = str(name).strip()
    s = re.sub(r'\s*\([A-Z0-9]+\)\s*$', '', s)
    s = re.sub(r'[^A-Za-z0-9]+', '', s).upper()
    return s


def _resolve_team_name(raw_name, known_roster_lookup):
    """Maps a raw sheet name to its canonical roster form when they match
    after normalization but differ verbatim (different casing, extra
    whitespace, etc). Real bug found and fixed 2026-08-19: without this,
    extraction used the raw sheet string directly -- validation would
    still pass (it already normalizes for its own comparison), but the
    extracted result would be keyed by e.g. 'tsatas dip' while every other
    file (coefficients, schedule, history) is keyed by 'TSATAS DIP'. The
    real team would silently get no score that round, and a phantom,
    unrecognized entry would exist instead -- exactly the kind of silent
    data loss a validation pass gives false confidence against. Falls back
    to the raw (stripped) name when there's no known roster to match
    against, or no match is found -- unchanged behavior in that case, and
    an unmatched name is already validation's job to catch, not
    extraction's."""
    stripped = str(raw_name).strip()
    if not known_roster_lookup:
        return stripped
    canonical = known_roster_lookup.get(_normalize_name(stripped))
    return canonical if canonical is not None else stripped


def extract_results(csv_path, header_row=1, known_roster=None):
    df = pd.read_csv(csv_path, header=header_row, low_memory=False)
    known_roster_lookup = {_normalize_name(t): t for t in known_roster} if known_roster else None

    # Fail loudly if the sheet's shape has changed enough that we can't
    # trust it -- this is the validation gate, not a guess-and-continue.
    missing = [h for h in REQUIRED_HEADERS if h not in df.columns]
    if missing:
        raise ValueError(f"Expected headers not found: {missing}. "
                          f"The sheet's structure may have changed -- stopping rather than guessing.")
    missing_rounds = [r for r in ROUND_COLS if r not in df.columns]
    if missing_rounds:
        raise ValueError(f"Expected round columns not found: {missing_rounds}.")

    # The real roster table is followed by many other, unrelated sections
    # stacked below it on the same sheet tab (H2H tables, ECL group tables,
    # a Roddy table, fixtures, even an unrelated A-League team reference
    # list) -- confirmed directly against the live sheet. Those sections'
    # own column-1 values land in the same pandas column as TEAM NAME
    # purely by coincidence of the spreadsheet's layout, and aren't all
    # reliably caught by the division-blank check below on their own (the
    # A-League rows, for instance, have "#REF!" in the division position,
    # not a true blank). Truncate at the real table's boundary -- a fully
    # blank row, confirmed present in the live sheet -- rather than trying
    # to special-case every downstream section's quirks individually.
    if 'TEAM NAME' in df.columns:
        blank_mask = df.isna().all(axis=1)
        if blank_mask.any():
            df = df.iloc[:blank_mask.idxmax()]

    # Only the first 'TEAM NAME' column is the real one -- the sheet reuses
    # that header name in at least two other sections further along the row.
    # Locate it by finding the occurrence adjacent to 'ELIZA ID' and 'DIVISION'.
    team_col = None
    for i, c in enumerate(df.columns):
        if c == 'TEAM NAME' and i > 0 and df.columns[i-1] in ('ELIZA ID', 'TEAM NAME'):
            team_col = c
            break
    if team_col is None:
        team_col = 'TEAM NAME'  # fallback: pandas gives the first occurrence this exact name

    results = []
    for _, row in df.iterrows():
        name = row[team_col]
        if pd.isna(name) or str(name).strip() == '':
            continue
        division = row['DIVISION']
        if pd.isna(division):
            continue
        scores = []
        for r in ROUND_COLS:
            v = row[r]
            scores.append(int(v) if pd.notna(v) and str(v).strip() != '' else None)
        total_reported = row['TOT']
        total_computed = sum(s for s in scores if s is not None)
        # Validation: does our extraction match the sheet's own reported total?
        # A mismatch here means we've misread something -- surfaced, not hidden.
        consistent = (pd.notna(total_reported) and int(total_reported) == total_computed) or \
                     (pd.isna(total_reported) and total_computed == 0)
        results.append({
            'team': _resolve_team_name(name, known_roster_lookup),
            'division': str(division).strip(),
            'scores_by_round': scores,
            'total_reported': None if pd.isna(total_reported) else int(total_reported),
            'total_computed': total_computed,
            'consistent': consistent,
        })
    return results


if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else 'data_2627_raw.csv'
    results = extract_results(path)
    inconsistent = [r for r in results if not r['consistent']]
    print(f"Extracted {len(results)} teams.")
    print(f"Inconsistent totals (extraction mismatch -- would be flagged, not silently used): {len(inconsistent)}")
    for r in results[:5]:
        print(f"  {r['team']:30s} ({r['division']:12s}) reported={r['total_reported']} computed={r['total_computed']} ok={r['consistent']}")
