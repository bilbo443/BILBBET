"""Prepare confirmed-draw cup futures for review; never publish live data."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
from cup_markets import regenerate_roddy_and_cup
from team_strength_tiers import load_tier_centres


def prepare(data_dir, out_dir, n_sim=12000):
    data_dir, out_dir = Path(data_dir), Path(out_dir)
    read = lambda n: json.loads((data_dir / (n + '.json')).read_text())
    before = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in data_dir.glob('*.json')}
    registry, roster, coeffs = read('admin_teams'), read('h2h_divisions'), read('team_market_coeffs')
    official, live = read('official_fa_cup_draw'), read('futures')
    active = {t['name'] for t in registry if t.get('status') not in (None, '', 'INACTIVE')}
    flat = [t for teams in roster.values() for t in teams]
    assert len(flat) == len(set(flat)) == len(active) == 66 and set(flat) == active
    assert official.get('r64_draw_confirmed') is True
    assert official.get('preliminary_results_final') is True
    assert int(official['round_of_64_round']) == 2
    expected = active - set(official['eliminated_teams'])
    assert len(expected) == 64
    _, cup, draw = regenerate_roddy_and_cup(
        roster, coeffs['team_coeffs'], coeffs['scale'], read('roddy_history'),
        n_sim=n_sim, seed=11, official_cup_draw=official,
        tier_centres=load_tier_centres(data_dir, registry))
    for market, rows in cup.items():
        assert len(rows) == 64 and {row['team'] for row in rows} == expected, market
    assert draw['r64_matches'] == official['r64_matches'] and draw['r64_draw_confirmed']
    reviewed = copy.deepcopy(live)
    reviewed['fa_cup_markets'] = cup
    for section in live:
        if section != 'fa_cup_markets':
            assert reviewed[section] == live[section]
    assert all(hashlib.sha256(p.read_bytes()).hexdigest() == h for p, h in before.items())
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, value in [('futures', reviewed), ('fa_cup_draw', draw)]:
        (out_dir / (name+'.json')).write_text(json.dumps(value, indent=2)+'\n')
    print('PASS: confirmed 32-pair draw used; all six cup markets contain 64 survivors.')
    print('PASS: Roddy, divisions, ECL, live data, balances and accepted bets unchanged.')
    print('Review files:', out_dir)


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--data-dir', default='data')
    p.add_argument('--out-dir', default='draft/fa-cup-r64-review')
    p.add_argument('--n-sim', type=int, default=12000)
    args = p.parse_args()
    if args.n_sim < 100:
        p.error('--n-sim must be at least 100')
    prepare(args.data_dir, args.out_dir, args.n_sim)
