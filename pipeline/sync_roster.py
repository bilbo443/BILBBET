"""
sync_roster.py -- the single, robust process for any roster change: a new
team joining, a rename, a departure, or a charity-promotion backfill.

Why this exists: this project has repeatedly found roster changes applied
inconsistently across files that all need to agree with each other (most
recently, h2h_schedule.json silently keeping two placeholder team names
after the real roster had already moved on, which crashed the live H2H
fixture list outright). That happened because roster changes were being
applied by hand, file by file, with nothing enforcing that every dependent
file actually got touched.

The fix: admin_teams.json (the sheet author's own team registry, keyed by a
permanent ID that survives renames) becomes the ONE place a human edits.
Every other file listed below gets regenerated FROM it, not patched by
hand -- so there's no way for a rename or departure to update six files but
silently miss a seventh.

Usage (see the bottom of this file for a runnable example of each):
    - Rename: edit admin_teams.json directly (change `name`, move the old
      name into `prev_names`), then run sync_roster().
    - Add a team: edit admin_teams.json directly (new row, new id, set
      `status` to the division they're joining), then run sync_roster().
    - Remove/charity-promote: edit `status` (to 'INACTIVE' for a full
      departure, or to the new division for a charity promotion), then run
      sync_roster().

Files this regenerates, and why each one is in scope:
    - h2h_divisions.json   -- the roster itself
    - h2h_schedule.json    -- round-robin pairings (name-substituted for a
                              pure rename, regenerated for any real
                              team-count change in a division)
    - h2h_shift.json, h2h_cup_shift.json, h2h_variance_widen.json,
      h2h_history.json     -- via the existing rebuild_coefficients.py /
                              rebuild_roddy_history.py logic, which already
                              knows how to alias-resolve renamed teams and
                              give brand-new teams sensible neutral
                              defaults rather than crashing on them
    - carry_balances.json  -- preserves existing balances for continuing/
                              renamed teams (matched by ID), adds a genuine
                              $0 entry for anyone brand new
    - futures.json         -- division futures/Roddy/FA Cup markets
                              regenerated for any division whose actual
                              team composition changed

Deliberately NOT touched here: team_market_coeffs.json/roddy_history.json
staying in sync is handled by the coefficient rebuild scripts this already
calls into; h2h_record.json (pairwise H2H history) is left alone, since a
brand-new team simply has no history yet (correctly reflected by its
absence, not something to synthesize), and a renamed team's old-name
entries remain genuinely reachable by anything that resolves aliases.
"""
import json
import statistics

from rebuild_coefficients import (
    build_alias_map, load_season_with_aliases, rebuild_all_coefficients,
    division_tier, SEASON_FILES,
)
from rebuild_roddy_history import rebuild_roddy_history
from simulation_adapter import round_robin_schedule, simulate_division_futures, N_SIM
from diff_report import pct_to_odds

DIVISION_TIER_TO_LIVE_NAME = {
    'ELIZA CUP': 'ELIZA CUP (D1)',
    'DIVISION 2A': 'DIVISION 2A', 'DIVISION 2B': 'DIVISION 2B',
    'DIVISION 3A': 'DIVISION 3A', 'DIVISION 3B': 'DIVISION 3B',
}


def load_current_roster(admin_path='admin_teams.json'):
    """{live_division_name: [team names]} for every ACTIVE team -- anyone
    marked INACTIVE, or with no status at all, is correctly excluded."""
    admin = json.load(open(admin_path))
    roster = {v: [] for v in DIVISION_TIER_TO_LIVE_NAME.values()}
    for t in admin:
        status = t.get('status')
        if not isinstance(status, str) or status not in DIVISION_TIER_TO_LIVE_NAME:
            continue
        roster[DIVISION_TIER_TO_LIVE_NAME[status]].append(t['name'].strip())
    return roster


def sync_h2h_divisions(new_roster, out_path='h2h_divisions.json'):
    json.dump(new_roster, open(out_path, 'w'))
    return new_roster


def sync_h2h_schedule(new_roster, old_schedule_path='h2h_schedule.json', out_path='h2h_schedule.json',
                       alias_map=None, id_by_current_name=None, admin_path='admin_teams.json'):
    """For a division whose team SET is unchanged (even if some of those
    teams were just renamed), the existing round-robin pairing is still
    perfectly fair and shouldn't be thrown away and re-randomized -- this
    just relabels renamed teams in place. Only a division whose team COUNT
    or genuine membership actually changed gets a freshly generated
    schedule."""
    old_schedule = json.load(open(old_schedule_path))
    admin = json.load(open(admin_path))
    id_by_name = {}
    for t in admin:
        id_by_name[t['name'].strip().upper()] = t['id']
        prev = t.get('prev_names')
        if isinstance(prev, str) and prev.strip():
            for old in prev.split(','):
                id_by_name[old.strip().upper()] = t['id']
    name_by_id = {t['id']: t['name'].strip() for t in admin}

    new_schedule = {}
    for div, teams in new_roster.items():
        old_teams_in_div = set()
        for rnd in old_schedule.get(div, []):
            for a, b in rnd:
                old_teams_in_div.add(a); old_teams_in_div.add(b)
        old_ids = {id_by_name.get(t.upper()) for t in old_teams_in_div}
        new_ids = {id_by_name.get(t.upper()) for t in teams}
        if old_ids == new_ids and None not in new_ids:
            # same teams, possibly renamed -- relabel in place, keep the pairing
            def relabel(name):
                tid = id_by_name.get(name.upper())
                return name_by_id.get(tid, name)
            new_schedule[div] = [[[relabel(a), relabel(b)] for a, b in rnd] for rnd in old_schedule[div]]
        else:
            # genuine membership change -- a fresh, fair round-robin is required
            new_schedule[div] = round_robin_schedule(teams)
    json.dump(new_schedule, open(out_path, 'w'))
    return new_schedule


def sync_coefficients_and_pools(new_roster, admin_path='admin_teams.json',
                                 coeffs_out='team_market_coeffs.json', history_out='roddy_history.json',
                                 shift_out='h2h_shift.json', cup_shift_out='h2h_cup_shift.json',
                                 widen_out='h2h_variance_widen.json'):
    current_divisions = {}
    for div, teams in new_roster.items():
        normalized = div.replace(' (D1)', '')
        for t in teams:
            current_divisions[t] = normalized

    profiles = rebuild_all_coefficients(current_divisions)
    all_teams = [t for teams in new_roster.values() for t in teams]
    team_coeffs = {}
    for t in all_teams:
        p = profiles.get(t)
        team_coeffs[t] = {k: p[k] for k in ('eliza', 'roddy', 'fa_cup', 'ecl', 'relegation_risk', 'variance_widen')} if p else \
                          {'eliza': 0.0, 'roddy': 0.0, 'fa_cup': 0.0, 'ecl': 0.0, 'relegation_risk': 0.0, 'variance_widen': 0.5}
    scale = 15.045914141732512
    tmc = {'scale': scale, 'team_coeffs': team_coeffs}
    json.dump(tmc, open(coeffs_out, 'w'))

    history = rebuild_roddy_history(all_teams)
    json.dump(history, open(history_out, 'w'))

    shift = {t: round(scale * (c['eliza'] - 0.5 * c['relegation_risk']), 3) for t, c in team_coeffs.items()}
    json.dump(shift, open(shift_out, 'w'))
    cup_shift = {t: round(scale * c['fa_cup'], 3) for t, c in team_coeffs.items()}
    json.dump(cup_shift, open(cup_shift_out, 'w'))
    widen = {t: c.get('variance_widen', 0.0) for t, c in team_coeffs.items()}
    json.dump(widen, open(widen_out, 'w'))

    return tmc, history


def sync_carry_balances(new_roster, admin_path='admin_teams.json', carry_path='carry_balances.json',
                         out_path='carry_balances.json'):
    """Preserves an existing balance for any continuing or renamed team
    (matched by ID, so a rename doesn't accidentally reset someone's carry
    to zero); adds a genuine $0 entry only for a team that's actually new."""
    admin = json.load(open(admin_path))
    id_by_old_name = {}
    for t in admin:
        prev = t.get('prev_names')
        if isinstance(prev, str) and prev.strip():
            for old in prev.split(','):
                id_by_old_name[old.strip().upper()] = t['id']
    id_by_current_name = {t['name'].strip().upper(): t['id'] for t in admin}

    old_carry = json.load(open(carry_path))
    old_carry_by_id = {}
    for name, rec in old_carry.items():
        tid = id_by_old_name.get(name.upper()) or id_by_current_name.get(name.upper())
        if tid:
            old_carry_by_id[tid] = rec

    all_teams = [t for teams in new_roster.values() for t in teams]
    new_carry = {}
    for t in all_teams:
        tid = id_by_current_name.get(t.upper())
        if tid and tid in old_carry_by_id:
            new_carry[t] = old_carry_by_id[tid]
        else:
            new_carry[t] = {'carry': 0.0, 'historicalRecord': {
                'totalBets': 0, 'winningBets': 0, 'winnings': 0.0,
                'losingBets': 0, 'losses': 0.0, 'voidBets': 0, 'voidReturn': 0.0}}
    json.dump(new_carry, open(out_path, 'w'))
    return new_carry


def sync_futures_divisions(new_roster, team_coeffs, scale, history, futures_path='futures.json',
                            out_path='futures.json', n_sim=N_SIM, seed=1):
    futures = json.load(open(futures_path))
    div_keys_count = lambda div: {
        'win_div_pct': 1, 'top3_pct': 3,
        'top_half_pct': len(new_roster[div]) // 2, 'bottom_half_pct': len(new_roster[div]) // 2,
        'wooden_spoon_pct': 1,
        **({'bottom3_pct': 3} if div in ('DIVISION 3A', 'DIVISION 3B') else {'relegation_pct': 4 if div.startswith('ELIZA') else 3}),
        'promotion_pct': None,  # left untouched here -- computed by the dedicated promotion market rebuild, not per-division
    }

    def floor_and_renormalize(entries, target_total, floor_pct=0.5, max_passes=10):
        current = list(entries)
        for _ in range(max_passes):
            floored = [(t, max(p, floor_pct)) for t, p in current]
            total = sum(p for _, p in floored)
            renorm = [(t, p * target_total / total) for t, p in floored]
            if all(p >= floor_pct - 1e-9 for _, p in renorm):
                return renorm
            current = renorm
        return current

    rows, _ = simulate_division_futures(new_roster, team_coeffs, scale, history, [], n_sim=n_sim, seed=seed)
    by_div = {}
    for r in rows:
        by_div.setdefault(r['division'], []).append(r)

    for div, teams in new_roster.items():
        counts = div_keys_count(div)
        for key, n_qual in counts.items():
            if n_qual is None or key not in by_div.get(div, [{}])[0]:
                continue
            entries = [(r['team'], float(r[key])) for r in by_div[div]]
            floored = floor_and_renormalize(entries, 100.0 * n_qual)
            market_rows = []
            for t, p in floored:
                odds = pct_to_odds(p)
                market_rows.append({'team': t, 'odds': odds if odds is not None else 1001, 'suspended': odds is None})
            market_rows.sort(key=lambda r: r['odds'])
            futures['divisions'].setdefault(div, {})[key] = market_rows

    json.dump(futures, open(out_path, 'w'))
    return futures


def sync_roster(admin_path='admin_teams.json'):
    """The single entry point: run this after editing admin_teams.json for
    any roster change, and every dependent file gets regenerated
    consistently from it."""
    new_roster = load_current_roster(admin_path)
    sync_h2h_divisions(new_roster)
    sync_h2h_schedule(new_roster, admin_path=admin_path)
    tmc, history = sync_coefficients_and_pools(new_roster, admin_path=admin_path)
    sync_carry_balances(new_roster, admin_path=admin_path)
    sync_futures_divisions(new_roster, tmc['team_coeffs'], tmc['scale'], history)
    return new_roster
