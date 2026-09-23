"""Roster shape and reproducible FA Cup draw rules for a season.

A roster remains provisional until the configured freeze date. The actual
conference allocation always comes from the admin registry; no automatic
transfer of teams between conferences is attempted.
"""
from datetime import date
import random

DIV3 = ('DIVISION 3A', 'DIVISION 3B', 'DIVISION 3C')
PREFERRED_FA_BYES = ("SILVERMAN'S XI", 'BIG MAC FC')


def validate_roster(roster, freeze_date, today=None, two_max=16, three_min=12, three_max=20):
    day = today or date.today()
    if isinstance(day, str):
        day = date.fromisoformat(day)
    deadline = date.fromisoformat(freeze_date)
    if not roster.get('DIVISION 3A') or not roster.get('DIVISION 3B'):
        raise ValueError('Division 3A and 3B must both have teams')
    keys = [k for k in DIV3 if roster.get(k)]
    if len(keys) == 2:
        for k in keys:
            if len(roster[k]) > two_max:
                raise ValueError(f'{k} has {len(roster[k])} teams; split into 3 conferences before exceeding {two_max}')
    elif len(keys) == 3:
        for k in keys:
            n = len(roster[k])
            if n > three_max or (day >= deadline and n < three_min):
                raise ValueError(f'{k} has {n} teams; final 3-conference sizes must be {three_min}-{three_max}')
    else:
        raise ValueError('Division 3 must have two or three conferences')
    names = [t.strip().casefold() for teams in roster.values() for t in teams]
    if not all(names) or len(names) != len(set(names)):
        raise ValueError('Roster has blank or duplicate team names')
    if len(names) > 128:
        raise ValueError('More than 128 entrants needs another FA Cup round; review the format')
    return {'division3_conferences': keys, 'total_teams': len(names),
            'provisional': day < deadline, 'fa_preliminary': len(names) > 62}


def fa_cup_draw(all_teams, seed=11, preferred_byes=PREFERRED_FA_BYES):
    """Fixed bracket slots for <=128 teams; extra round for 63+ entrants.

    At 63/64, one preliminary match makes the extra round real. For 65+
    there are N-64 preliminary matches. The preferred teams get byes when
    slots permit; remaining match entrants are drawn reproducibly from a
    sorted roster. Placeholders keep later pairings fixed across trials.
    """
    teams = sorted(all_teams)
    n = len(teams)
    if len(set(teams)) != n or not (2 <= n <= 128):
        raise ValueError('FA Cup needs 2-128 distinct entrants')
    rng = random.Random(seed)
    preferred = [t for t in preferred_byes if t in teams]
    others = [t for t in teams if t not in preferred]
    rng.shuffle(others)
    preliminary_count = max(1, n - 64) if n > 62 else 0
    if 2 * preliminary_count > len(others):
        # At 127-128 entrants no one can be protected from the first round.
        others.extend(preferred)
        preferred = []
        rng.shuffle(others)
    preliminary = [(others[2*i], others[2*i+1]) for i in range(preliminary_count)]
    slots = preferred + others[2*preliminary_count:] + [('PRELIM', i) for i in range(preliminary_count)]
    r32_byes_count = 64 - len(slots)
    if r32_byes_count < 0 or r32_byes_count > len(slots):
        raise ValueError('Cannot build a 64-slot FA Cup bracket from this field')
    r32_byes = preferred[:r32_byes_count]
    r32_byes += [s for s in slots if isinstance(s, str) and s not in r32_byes][:r32_byes_count-len(r32_byes)]
    slots = [s for s in slots if s not in r32_byes]
    rng.shuffle(slots)
    if len(slots) != 64 - 2 * r32_byes_count:
        raise AssertionError('Unexpected Round of 64 field size')
    return {'preliminary': preliminary, 'r64_matches': list(zip(slots[::2], slots[1::2])),
            'r32_byes': r32_byes, 'preliminary_byes': [t for t in teams if t not in {x for pair in preliminary for x in pair}]}
