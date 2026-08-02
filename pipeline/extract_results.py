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

REQUIRED_HEADERS = ['TEAM NAME', 'DIVISION', 'TOT']
ROUND_COLS = [str(n) for n in range(1, 27)]


def extract_results(csv_path, header_row=1):
    df = pd.read_csv(csv_path, header=header_row, low_memory=False)

    # Fail loudly if the sheet's shape has changed enough that we can't
    # trust it -- this is the validation gate, not a guess-and-continue.
    missing = [h for h in REQUIRED_HEADERS if h not in df.columns]
    if missing:
        raise ValueError(f"Expected headers not found: {missing}. "
                          f"The sheet's structure may have changed -- stopping rather than guessing.")
    missing_rounds = [r for r in ROUND_COLS if r not in df.columns]
    if missing_rounds:
        raise ValueError(f"Expected round columns not found: {missing_rounds}.")

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
            'team': str(name).strip(),
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
