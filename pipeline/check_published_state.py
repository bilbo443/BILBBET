"""Read-only consistency check for the published season snapshot (no network or writes)."""
import json
import math
from collections import Counter
from pathlib import Path


def check(data_dir='data'):
    data = Path(data_dir)
    read = lambda name: json.loads((data / (name + '.json')).read_text())
    registry, roster, schedule = (read(n) for n in ('admin_teams', 'h2h_divisions', 'h2h_schedule'))
    futures, leading = (read(n) for n in ('futures', 'leading_at'))
    league, roddy, cup = (read(n) for n in ('real_results', 'roddy_results', 'official_fa_cup_draw'))
    active = {t['name']: str(t['id']).zfill(3) for t in registry if t.get('status') not in (None, '', 'INACTIVE')}
    errors = []
    def require(ok, message):
        if not ok: errors.append(message)
    require(len(active) == len(set(active.values())), 'Duplicate active team ID')
    names = [t for teams in roster.values() for t in teams]
    require(Counter(names) == Counter(list(active)), 'Registry/conference membership differs')
    require(set(league) == set(active) == set(roddy), 'Score tables must cover exactly the active teams')
    snapshot = [[t, league.get(t), roddy.get(t)] for t in sorted(set(league) | set(roddy))]
    meta = futures.get('futures_refresh', {})
    require(meta.get('source_scores') == snapshot, 'Futures were not generated from the published scores')
    require(set(roster) | {'RODDY', 'FA CUP', 'ECL'} <= set(meta.get('coverage', [])), 'Incomplete futures coverage')

    def market(rows, expected, label):
        require(Counter(r.get('team') for r in rows) == Counter(list(expected)), label + ': team field differs')
        for row in rows:
            if not row.get('suspended'):
                value = row.get('odds')
                require(isinstance(value, (int, float)) and math.isfinite(value) and value > 1,
                        label + ': invalid active price for ' + str(row.get('team')))

    for division, teams in roster.items():
        rounds = schedule.get(division, [])
        require(len(rounds) == 26, division + ': expected 26 schedule slots')
        for week, pairs in enumerate(rounds, 1):
            expected = teams if division.startswith('ELIZA') or 2 <= week <= 23 else []
            actual = [t for pair in pairs for t in pair if t != 'AVERAGE TEAM']
            require(Counter(actual) == Counter(list(expected)), division + ': bad fixture membership in GW' + str(week))
            require(all(len(pair) == 2 and pair[0] != pair[1] for pair in pairs), division + ': invalid/self fixture')
        for key, rows in futures['divisions'].get(division, {}).items(): market(rows, teams, division + '/' + key)
        final = '26' if division.startswith('ELIZA') else '23'
        win = {r['team']: (r.get('odds'), r.get('suspended')) for r in futures['divisions'][division]['win_div_pct']}
        endpoint = {r['team']: (r.get('odds'), r.get('suspended')) for r in leading['leading_at'][division][final]}
        require(win == endpoint, division + ': last-table leader differs from division winner')
        for week, rows in leading['leading_at'][division].items(): market(rows, teams, division + '/leader/' + week)
    for key, rows in futures['roddy'].items(): market(rows, active, 'Roddy/' + key)
    for week, rows in leading['roddy_leading_at'].items(): market(rows, active, 'Roddy leader/' + week)
    survivors = set(active)
    if cup.get('preliminary_results_final'): survivors -= set(cup.get('eliminated_teams', []))
    if cup.get('r64_results_final'): survivors = set(cup['r64_winners'])
    for pair, winner in zip(cup.get('r32_matches', []), cup.get('r32_winners', [])):
        if winner is not None: survivors -= set(pair) - {winner}
    for key, rows in futures['fa_cup_markets'].items(): market(rows, survivors, 'FA Cup/' + key)
    for key, rows in futures['ecl_markets'].items(): market(rows, futures['ecl_field'], 'ECL/' + key)
    return errors


if __name__ == '__main__':
    issues = check()
    if issues:
        for issue in issues: print('FAIL:', issue)
        raise SystemExit(1)
    print('PASS: every conference, 26-week fixtures, score/futures snapshot, market field, price, leader endpoint and cup survivor field.')
