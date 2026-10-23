"""Preserve organiser fixture rotations by internal team ID, including renames."""
import json
from pathlib import Path


def clockwise_schedule(seed_pairs, start_round=2, end_round=23):
    flat = [t for p in seed_pairs for t in p]
    if (not seed_pairs or any(len(p) != 2 for p in seed_pairs)
            or len(set(flat)) != len(flat) or not 1 <= start_round <= end_round <= 26):
        raise ValueError('Invalid official rotation seed')
    # Read down the home column, then up the away column around the table.
    ring = [p[0] for p in seed_pairs] + [p[1] for p in reversed(seed_pairs)]
    n = len(ring)
    schedule = [[] for _ in range(26)]
    for round_no in range(start_round, end_round+1):
        schedule[round_no-1] = [[ring[i], ring[n-1-i]] for i in range(n//2)]
        # Top-left stays fixed; every other slot moves one step clockwise.
        ring = [ring[0]] + ring[2:] + ring[1:2]
    return schedule


def load_official_rotations(data_dir, registry, roster):
    path = Path(data_dir) / 'official_division_rotations.json'
    if not path.exists():
        return {}
    cfg = json.loads(path.read_text())
    if cfg.get('season') != '2026-27' or cfg.get('method') != 'fixed_top_left_clockwise':
        raise ValueError('Review official rotation season/method')
    names = {str(t['id']).zfill(3): t['name'] for t in registry}
    result = {}
    for div, pairs in cfg['divisions'].items():
        try:
            named = [[names[str(t).zfill(3)] for t in pair] for pair in pairs]
        except KeyError as e:
            raise ValueError('Unknown official rotation team ID '+str(e)) from e
        entrants = [t for pair in named for t in pair]
        if len(entrants) != len(set(entrants)) or set(entrants) != set(roster.get(div, [])):
            raise ValueError('Official division membership changed; review '+div+' before generating fixtures')
        result[div] = clockwise_schedule(named, int(cfg['start_round']), int(cfg['end_round']))
    return result
