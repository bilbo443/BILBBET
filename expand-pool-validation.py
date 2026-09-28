from pathlib import Path

validator = "pipeline/validate_sheet_data.py"
v = Path(validator).read_text()
anchor = "def check_row_count(df, expected_team_count, report, tolerance=0.15):"
helper = '''def registry_id(value):
    """Normalize sheet numeric IDs to the registry's zero-padded IDs."""
    if pd.isna(value):
        return None
    raw = str(value).strip()
    if re.fullmatch(r'\\d+(?:\\.0)?', raw):
        return str(int(float(raw))).zfill(3)
    return raw


def deferred_pool_rows(df, roster, registry_path, report):
    """Defer unassigned or inactive IDs absent from the playing roster."""
    empty = pd.Series(False, index=df.index)
    if not registry_path or 'ELIZA ID' not in df or 'TEAM NAME' not in df:
        return empty, set()
    registry = {t['id']: t for t in json.load(open(registry_path))}
    active_names = {normalize_name(t) for t in roster}
    active_ids = {tid for tid, team in registry.items()
                  if normalize_name(team['name']) in active_names}
    ids = df['ELIZA ID'].map(registry_id)
    duplicates = ids.dropna()[ids.dropna().duplicated(keep=False)]
    if not duplicates.empty:
        report.add('unique_ids', False,
                   f"Duplicate Eliza IDs in results: {sorted(set(duplicates))[:10]}.")
    deferred = pd.Series([
        bool(ids.loc[i] in registry
             and registry[ids.loc[i]].get('status') in ('DIVISION 3', 'INACTIVE')
             and ids.loc[i] not in active_ids)
        for i in df.index
    ], index=df.index)
    scored = deferred & df[[r for r in ROUND_COLS if r in df]].notna().any(axis=1)
    if scored.any():
        report.add('pending_scores', False,
                   f"Unassigned/inactive IDs have round scores: "
                   f"{df.loc[scored, 'TEAM NAME'].tolist()[:10]}. Assign and review before refresh.")
    else:
        report.add('pending_scores', True,
                   f"{int(deferred.sum())} unassigned/inactive sheet row(s) held out of odds.")
    return deferred, set(ids[deferred].dropna())


'''
assert v.count(anchor) == 1, "Validator differs; no files changed"
v = v.replace(anchor, helper + anchor)

old = '''def check_row_count(df, expected_team_count, report, tolerance=0.15):
    real_rows = df['TEAM NAME'].notna().sum() if 'TEAM NAME' in df.columns else 0
    low = expected_team_count * (1 - tolerance)
    high = expected_team_count * (1 + tolerance)
    if low <= real_rows <= high:
        report.add('row_count', True, f"{real_rows} team rows, within expected range of {expected_team_count}.")
    else:
        report.add('row_count', False,
                    f"{real_rows} team rows found, expected roughly {expected_team_count} "
                    f"(acceptable range {low:.0f}-{high:.0f}). Sheet may be incomplete or duplicated.")'''
new = '''def check_row_count(df, expected_team_count, report, tolerance=0.15, deferred=None):
    all_rows = df['TEAM NAME'].notna().sum() if 'TEAM NAME' in df.columns else 0
    playing = df.loc[~deferred] if deferred is not None else df
    real_rows = playing['TEAM NAME'].notna().sum() if 'TEAM NAME' in playing.columns else 0
    low = expected_team_count * (1 - tolerance)
    high = expected_team_count * (1 + tolerance)
    if all_rows <= 100 and low <= real_rows <= high:
        report.add('row_count', True,
                   f"{real_rows} configured rows plus {all_rows-real_rows} pending rows "
                   f"({all_rows} total, maximum 100).")
    else:
        report.add('row_count', False,
                   f"{real_rows} configured rows versus roughly {expected_team_count} "
                   f"(acceptable range {low:.0f}-{high:.0f}); {all_rows} total (maximum 100).")'''
assert v.count(old) == 1, "Row-count function differs; no files changed"
v = v.replace(old, new)

old = "def run_all_checks(csv_path, roster_path, round_dates_path, header_row=1, today=None):"
new = "def run_all_checks(csv_path, roster_path, round_dates_path, header_row=1, today=None, registry_path=None):"
assert v.count(old) == 1, "Validation entry point differs; no files changed"
v = v.replace(old, new)

old = '''    check_no_duplicate_header(df, report)
    check_row_count(df, expected_team_count, report)
    check_known_roster(df, roster, report)'''
new = '''    check_no_duplicate_header(df, report)
    deferred, report.deferred_ids = deferred_pool_rows(df, roster, registry_path, report)
    check_row_count(df, expected_team_count, report, deferred=deferred)
    check_known_roster(df.loc[~deferred], roster, report)'''
assert v.count(old) == 1, "Validation checks differ; no files changed"
v = v.replace(old, new)

extractor = "pipeline/extract_results.py"
e = Path(extractor).read_text()
old = "def extract_results(csv_path, header_row=1, known_roster=None):"
new = "def extract_results(csv_path, header_row=1, known_roster=None, excluded_ids=None):"
assert e.count(old) == 1, "Extractor entry point differs; no files changed"
e = e.replace(old, new)

old = '''    for _, row in df.iterrows():
        name = row[team_col]'''
new = '''    for _, row in df.iterrows():
        if excluded_ids and 'ELIZA ID' in df.columns:
            raw_id = row['ELIZA ID']
            if pd.notna(raw_id):
                text_id = str(raw_id).strip()
                if re.fullmatch(r'\\d+(?:\\.0)?', text_id):
                    text_id = str(int(float(text_id))).zfill(3)
                if text_id in excluded_ids:
                    continue
        name = row[team_col]'''
assert e.count(old) == 1, "Extractor loop differs; no files changed"
e = e.replace(old, new)

layer = "pipeline/pipeline_layer3.py"
l = Path(layer).read_text()
old = '''    report = run_all_checks(csv_path, roster_path, round_dates_path,
                             header_row=header_row, today=today)'''
new = '''    registry_path = os.path.join(draft_dir, 'admin_teams.json')
    if not os.path.exists(registry_path):
        registry_path = os.path.join(os.path.dirname(roster_path), 'admin_teams.json')
    report = run_all_checks(csv_path, roster_path, round_dates_path,
                             header_row=header_row, today=today, registry_path=registry_path)'''
assert l.count(old) == 1, "Pipeline validation call differs; no files changed"
l = l.replace(old, new)

old = "    results = extract_results(csv_path, header_row=header_row, known_roster=known_roster)"
new = "    results = extract_results(csv_path, header_row=header_row, known_roster=known_roster, excluded_ids=report.deferred_ids)"
assert l.count(old) == 1, "Pipeline extraction call differs; no files changed"
l = l.replace(old, new)

app = "js/app.js"
a = Path(app).read_text()
old = "  const TEAM_LOGO_ALIAS = {};"
new = """  const TEAM_LOGO_ALIAS = {
    'JUAN EL MAGICO FC': 'TSATAS DIP',
    'SONS OF VALHALLA': 'HEILAN COOS',
  };"""
assert a.count(old) == 1, "Logo alias block differs; no files changed"
a = a.replace(old, new)

changes = ((validator, v), (extractor, e), (layer, l), (app, a))
for path, content in changes:
    if path.endswith(".py"):
        compile(content, path, "exec")
for path, content in changes:
    Path(path).write_text(content)

print("100-row pool-aware validation and two visual logo aliases installed.")
