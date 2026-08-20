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
permanent ID that survives renames) becomes the ONE place a human (or the
automated build_admin_teams.py fetch) writes to. Every other file listed
below gets regenerated FROM it, not patched by hand -- so there's no way
for a rename or departure to update six files but silently miss a seventh.

Directory model: functions read the CURRENT live files from `data_dir` and
write the regenerated versions to `draft_dir` -- these are different
directories when called from the automated workflow (so a roster change
lands in a PR for review, the same as an odds refresh), and can be the
same directory for direct, manual use (as this project's own testing has
done throughout).

Files this regenerates, and why each one is in scope:
    - h2h_divisions.json   -- the roster itself
    - h2h_schedule.json    -- round-robin pairings (name-substituted for a
                              pure rename, regenerated for any real
                              team-count change in a division)
    - team_market_coeffs.json, roddy_history.json, h2h_shift.json,
      h2h_cup_shift.json, h2h_variance_widen.json -- a continuing or
                              renamed team's existing values carry forward
                              unchanged (matched via admin_teams' id/
                              prev_names), NOT recomputed from a full
                              rebuild -- the raw multi-season historical
                              CSVs those rebuild scripts need were only
                              ever processed locally and aren't available
                              here. A brand-new team gets its division's
                              score pool as a neutral starting point
                              (never an empty history -- that crashes the
                              sampler outright, a real bug found and
                              fixed 2026-08-19).
    - carry_balances.json  -- preserves existing balances for continuing/
                              renamed teams (matched by ID), adds a genuine
                              $0 entry for anyone brand new
    - futures.json         -- division futures/Roddy/FA Cup markets
                              regenerated for any division whose actual
                              team composition changed
    - h2h_record.json      -- pairwise H2H history re-keyed for any
                              renamed team, both the teamA/teamB fields
                              and the human-readable lastMatch text. Added
                              2026-08-20 after finding this file was
                              genuinely left stale by an earlier version
                              of this module -- the assumption that
                              "anything that resolves aliases" would
                              still find a renamed team's old entries was
                              false; the actual lookup in app.js is a
                              direct, exact-string match with no alias
                              resolution.
    - real_results.json    -- actual per-round scores, re-keyed the same
                              way. Added 2026-08-20 alongside h2h_record.json
                              -- found via a systematic file-by-file
                              cross-check against everything app.js
                              actually loads, not just the files this
                              module happened to already touch. Higher
                              stakes than h2h_record.json even: this is
                              genuine, real game data with no way to
                              regenerate it if lost, not just historical
                              context.

Deliberately NOT touched here (genuinely, unlike h2h_record.json above):
`leading_at.json` and `special_markets.json` -- both are pre-computed,
round-by-round full simulations, too expensive to regenerate on every
routine roster check, so a roster change flags them for manual follow-up
(`regenerate_leading_at.py` / `regenerate_special_markets.py`) instead of
silently leaving them stale or silently slowing every check down.
"""
import json
import os

from simulation_adapter import round_robin_schedule, simulate_division_futures, N_SIM
from diff_report import pct_to_odds
from build_admin_teams import build_admin_teams

DIVISION_TIER_TO_LIVE_NAME = {
    'ELIZA CUP': 'ELIZA CUP (D1)',
    'DIVISION 2A': 'DIVISION 2A', 'DIVISION 2B': 'DIVISION 2B',
    'DIVISION 3A': 'DIVISION 3A', 'DIVISION 3B': 'DIVISION 3B',
}


def load_current_roster(admin_teams):
    """{live_division_name: [team names]} for every ACTIVE team -- anyone
    marked INACTIVE, or with no status at all, is correctly excluded.
    Takes an already-loaded admin_teams list (not a path), so callers can
    pass either the live version or a freshly-fetched draft version."""
    roster = {v: [] for v in DIVISION_TIER_TO_LIVE_NAME.values()}
    for t in admin_teams:
        status = t.get('status')
        if not isinstance(status, str) or status not in DIVISION_TIER_TO_LIVE_NAME:
            continue
        roster[DIVISION_TIER_TO_LIVE_NAME[status]].append(t['name'].strip())
    return roster


def diff_admin_teams(old_teams, new_teams):
    """Compares two admin_teams snapshots by ID (not name, since a rename
    is not a real change to flag as an 'add' + 'remove' pair) and returns
    a human-readable summary, or None if nothing actually changed. This is
    what a PR reviewer sees -- it needs to be clear enough that a roster
    change can be sanity-checked at a glance, not just "something changed
    in admin_teams.json"."""
    old_by_id = {t['id']: t for t in old_teams}
    new_by_id = {t['id']: t for t in new_teams}

    added = [t for tid, t in new_by_id.items() if tid not in old_by_id]
    removed = [t for tid, t in old_by_id.items() if tid not in new_by_id]
    changed = []
    for tid, new_t in new_by_id.items():
        old_t = old_by_id.get(tid)
        if not old_t:
            continue
        if old_t.get('name') != new_t.get('name'):
            changed.append(('renamed', old_t['name'], new_t['name']))
        if old_t.get('status') != new_t.get('status'):
            changed.append(('status', new_t['name'], f"{old_t.get('status')} -> {new_t.get('status')}"))

    if not added and not removed and not changed:
        return None

    lines = ["## Roster changes detected"]
    for t in added:
        lines.append(f"- **New team**: {t['name']} (id {t['id']}) -- status: {t.get('status')}")
    for t in removed:
        lines.append(f"- **Team removed from the registry entirely**: {t['name']} (id {t['id']}) -- unusual, double-check this is intentional")
    for kind, a, b in changed:
        if kind == 'renamed':
            lines.append(f"- **Renamed**: {a} -> {b}")
        else:
            lines.append(f"- **Status change**: {a}: {b}")

    # Real gap found and flagged 2026-08-20, not silently fixed: this sync
    # does not touch leading_at.json or special_markets.json (regenerating
    # either is a genuinely expensive full simulation -- 22 rounds x 3
    # divisions plus a whole-league pass for leading_at.json alone --
    # unsuitable to run silently on every routine roster check, and doing
    # so automatically risks masking exactly the kind of thing that needs
    # a human's attention). Any roster change here means those two files
    # are now stale relative to the new roster -- the same class of bug
    # this project already found and fixed once. Flagged explicitly in
    # every roster-change summary so it's never silently missed the way
    # it was before this was added.
    lines.append("")
    lines.append("**Not covered by this sync -- needs a manual follow-up if this change "
                 "affects them**: `leading_at.json` and `special_markets.json` still "
                 "reference the OLD roster (regenerating either is a genuinely expensive "
                 "full simulation, unsuitable to run automatically on every routine check). "
                 "Run `regenerate_leading_at.py` / `regenerate_special_markets.py` if this "
                 "change touches a division or team either of those cover. "
                 "(`h2h_record.json` is handled automatically -- no action needed there.)")

    return '\n'.join(lines)


def sync_h2h_divisions(new_roster, data_dir, draft_dir):
    out_path = os.path.join(draft_dir, 'h2h_divisions.json')
    json.dump(new_roster, open(out_path, 'w'))
    return new_roster


def sync_h2h_schedule(new_roster, admin_teams, data_dir, draft_dir):
    """For a division whose team SET is unchanged (even if some of those
    teams were just renamed), the existing round-robin pairing is still
    perfectly fair and shouldn't be thrown away and re-randomized -- this
    just relabels renamed teams in place. Only a division whose team COUNT
    or genuine membership actually changed gets a freshly generated
    schedule."""
    old_schedule = json.load(open(os.path.join(data_dir, 'h2h_schedule.json')))
    id_by_name = {}
    for t in admin_teams:
        id_by_name[t['name'].strip().upper()] = t['id']
        prev = t.get('prev_names')
        if isinstance(prev, str) and prev.strip():
            for old in prev.split(','):
                id_by_name[old.strip().upper()] = t['id']
    name_by_id = {t['id']: t['name'].strip() for t in admin_teams}

    new_schedule = {}
    for div, teams in new_roster.items():
        old_teams_in_div = set()
        for rnd in old_schedule.get(div, []):
            for a, b in rnd:
                old_teams_in_div.add(a); old_teams_in_div.add(b)
        old_ids = {id_by_name.get(t.upper()) for t in old_teams_in_div}
        new_ids = {id_by_name.get(t.upper()) for t in teams}
        if old_ids == new_ids and None not in new_ids:
            def relabel(name):
                tid = id_by_name.get(name.upper())
                return name_by_id.get(tid, name)
            new_schedule[div] = [[[relabel(a), relabel(b)] for a, b in rnd] for rnd in old_schedule[div]]
        else:
            new_schedule[div] = round_robin_schedule(teams)
    json.dump(new_schedule, open(os.path.join(draft_dir, 'h2h_schedule.json'), 'w'))
    return new_schedule


def sync_coefficients_and_pools(new_roster, admin_teams, data_dir, draft_dir):
    """Deliberately does NOT call rebuild_all_coefficients() / a full
    from-scratch rebuild -- those depend on the raw multi-season historical
    CSVs, which were only ever processed locally and were never part of
    the deployed repo, so the automated workflow genuinely cannot call
    them. Instead: a continuing or renamed team's existing coefficient is
    carried forward unchanged (matched via admin_teams' id/prev_names, the
    same alias resolution used everywhere else) -- their underlying skill
    hasn't changed just because their name or division did. A genuinely
    new team with no prior entry gets the same neutral defaults already
    used elsewhere for a team with no tracked history.

    Known trade-off: a team that's promoted or relegated keeps its prior
    tier-adjusted 'eliza' value rather than having the tier-offset
    immediately recalculated against its new division -- that recalc still
    needs an occasional full manual rebuild (the same process already used
    each time this project has done one), not something this automated
    path attempts on its own."""
    id_by_name = {}
    for t in admin_teams:
        id_by_name[t['name'].strip().upper()] = t['id']
        prev = t.get('prev_names')
        if isinstance(prev, str) and prev.strip():
            for old in prev.split(','):
                id_by_name[old.strip().upper()] = t['id']

    old_tmc = json.load(open(os.path.join(data_dir, 'team_market_coeffs.json')))
    old_history = json.load(open(os.path.join(data_dir, 'roddy_history.json')))
    old_shift = json.load(open(os.path.join(data_dir, 'h2h_shift.json')))
    old_cup_shift = json.load(open(os.path.join(data_dir, 'h2h_cup_shift.json')))
    old_widen = json.load(open(os.path.join(data_dir, 'h2h_variance_widen.json')))
    old_coeffs_by_id = {}
    for name, c in old_tmc['team_coeffs'].items():
        tid = id_by_name.get(name.upper())
        if tid:
            old_coeffs_by_id[tid] = (name, c)

    scale = old_tmc.get('scale', 15.045914141732512)
    neutral = {'eliza': 0.0, 'roddy': 0.0, 'fa_cup': 0.0, 'ecl': 0.0, 'relegation_risk': 0.0, 'variance_widen': 0.5}

    # Real bug found and fixed 2026-08-19: a genuinely new team (or any
    # team whose individual history is missing for another reason) used
    # to get history[t] = [] outright -- an empty score pool that crashes
    # the sampler downstream (np.random.randint(0, 0, ...) has no valid
    # range to draw from) the moment this new roster is actually
    # simulated. Every other place in this project handles "no individual
    # history" the same way: fall back to the division's pool of other
    # teams' scores, never an empty list. Built here to match.
    division_pool = {}
    for div, teams in new_roster.items():
        pool = []
        for t in teams:
            tid = id_by_name.get(t.upper())
            old_entry = old_coeffs_by_id.get(tid)
            if old_entry:
                pool.extend(old_history.get(old_entry[0], []))
        division_pool[div] = pool if pool else [60]

    team_division = {t: div for div, teams in new_roster.items() for t in teams}
    all_teams = [t for teams in new_roster.values() for t in teams]
    team_coeffs, history, shift, cup_shift, widen = {}, {}, {}, {}, {}
    for t in all_teams:
        tid = id_by_name.get(t.upper())
        old_entry = old_coeffs_by_id.get(tid)
        fallback_pool = division_pool[team_division[t]]
        if old_entry:
            old_name, c = old_entry
            team_coeffs[t] = c
            history[t] = old_history.get(old_name) or fallback_pool
            shift[t] = old_shift.get(old_name, round(scale * (c['eliza'] - 0.5 * c['relegation_risk']), 3))
            cup_shift[t] = old_cup_shift.get(old_name, round(scale * c['fa_cup'], 3))
            widen[t] = old_widen.get(old_name, c.get('variance_widen', 0.0))
        else:
            team_coeffs[t] = neutral
            history[t] = fallback_pool
            shift[t] = 0.0
            cup_shift[t] = 0.0
            widen[t] = 0.5

    tmc = {'scale': scale, 'team_coeffs': team_coeffs}
    json.dump(tmc, open(os.path.join(draft_dir, 'team_market_coeffs.json'), 'w'))
    json.dump(history, open(os.path.join(draft_dir, 'roddy_history.json'), 'w'))
    json.dump(history, open(os.path.join(draft_dir, 'h2h_history.json'), 'w'))
    json.dump(shift, open(os.path.join(draft_dir, 'h2h_shift.json'), 'w'))
    json.dump(cup_shift, open(os.path.join(draft_dir, 'h2h_cup_shift.json'), 'w'))
    json.dump(widen, open(os.path.join(draft_dir, 'h2h_variance_widen.json'), 'w'))

    return tmc, history


def sync_carry_balances(new_roster, admin_teams, data_dir, draft_dir):
    """Preserves an existing balance for any continuing or renamed team
    (matched by ID, so a rename doesn't accidentally reset someone's carry
    to zero); adds a genuine $0 entry only for a team that's actually new."""
    id_by_old_name = {}
    for t in admin_teams:
        prev = t.get('prev_names')
        if isinstance(prev, str) and prev.strip():
            for old in prev.split(','):
                id_by_old_name[old.strip().upper()] = t['id']
    id_by_current_name = {t['name'].strip().upper(): t['id'] for t in admin_teams}

    old_carry = json.load(open(os.path.join(data_dir, 'carry_balances.json')))
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
    json.dump(new_carry, open(os.path.join(draft_dir, 'carry_balances.json'), 'w'))
    return new_carry


def sync_futures_divisions(new_roster, team_coeffs, scale, history, data_dir, draft_dir, n_sim=N_SIM, seed=1):
    futures = json.load(open(os.path.join(data_dir, 'futures.json')))
    div_keys_count = lambda div: {
        'win_div_pct': 1, 'top3_pct': 3,
        'top_half_pct': len(new_roster[div]) // 2, 'bottom_half_pct': len(new_roster[div]) // 2,
        'wooden_spoon_pct': 1,
        **({'bottom3_pct': 3} if div in ('DIVISION 3A', 'DIVISION 3B') else {'relegation_pct': 4 if div.startswith('ELIZA') else 3}),
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
            if key not in by_div.get(div, [{}])[0]:
                continue
            entries = [(r['team'], float(r[key])) for r in by_div[div]]
            floored = floor_and_renormalize(entries, 100.0 * n_qual)
            market_rows = []
            for t, p in floored:
                odds = pct_to_odds(p)
                market_rows.append({'team': t, 'odds': odds if odds is not None else 1001, 'suspended': odds is None})
            market_rows.sort(key=lambda r: r['odds'])
            futures['divisions'].setdefault(div, {})[key] = market_rows

    json.dump(futures, open(os.path.join(draft_dir, 'futures.json'), 'w'))
    return futures


def sync_h2h_record(admin_teams, data_dir, draft_dir):
    """Re-keys h2h_record.json (pairwise head-to-head history) for any
    renamed team -- both the teamA/teamB fields AND the human-readable
    lastMatch description text, which otherwise keeps saying the old name
    even after teamA/teamB are correct. Real bug found 2026-08-20: this
    file was originally left untouched by this whole module, on the
    documented assumption that "anything that resolves aliases" would
    still find a renamed team's old entries -- confirmed false by reading
    the actual lookup in app.js, which does a direct, exact-string match
    with no alias resolution at all. Unlike leading_at.json/
    special_markets.json (genuinely expensive full simulations, flagged
    for manual follow-up instead), this is cheap, safe text substitution
    -- no reason to leave it manual."""
    id_by_name = {}
    for t in admin_teams:
        id_by_name[t['name'].strip().upper()] = t['id']
        prev = t.get('prev_names')
        if isinstance(prev, str) and prev.strip():
            for old in prev.split(','):
                id_by_name[old.strip().upper()] = t['id']
    current_name_by_id = {t['id']: t['name'].strip() for t in admin_teams}

    def resolve(name):
        tid = id_by_name.get(str(name).strip().upper())
        return current_name_by_id.get(tid, name) if tid else name

    records = json.load(open(os.path.join(data_dir, 'h2h_record.json')))
    for r in records:
        old_a, old_b = r.get('teamA'), r.get('teamB')
        new_a, new_b = resolve(old_a), resolve(old_b)
        r['teamA'], r['teamB'] = new_a, new_b
        if 'lastMatch' in r and isinstance(r['lastMatch'], str):
            if old_a != new_a:
                r['lastMatch'] = r['lastMatch'].replace(old_a, new_a)
            if old_b != new_b:
                r['lastMatch'] = r['lastMatch'].replace(old_b, new_b)

    json.dump(records, open(os.path.join(draft_dir, 'h2h_record.json'), 'w'))
    return records


def sync_real_results(admin_teams, data_dir, draft_dir):
    """Re-keys real_results.json (actual per-round scores, by team) for
    any renamed team. Real gap found and fixed 2026-08-20: this file
    holds genuine, real game data that can never be regenerated by
    simulation the way leading_at.json/special_markets.json can -- so
    unlike those two (correctly flagged for manual follow-up given their
    expense), leaving this one to silently go stale on a rename would be
    a real, permanent data-loss risk, not just a pricing inconvenience.
    Cheap key rename, same reasoning as sync_h2h_record -- no reason to
    leave it manual."""
    id_by_name = {}
    for t in admin_teams:
        id_by_name[t['name'].strip().upper()] = t['id']
        prev = t.get('prev_names')
        if isinstance(prev, str) and prev.strip():
            for old in prev.split(','):
                id_by_name[old.strip().upper()] = t['id']
    current_name_by_id = {t['id']: t['name'].strip() for t in admin_teams}

    path = os.path.join(data_dir, 'real_results.json')
    if not os.path.exists(path):
        return None  # doesn't exist pre-season -- nothing to re-key yet
    results = json.load(open(path))
    renamed = {}
    for old_name, scores in results.items():
        tid = id_by_name.get(old_name.strip().upper())
        new_name = current_name_by_id.get(tid, old_name) if tid else old_name
        renamed[new_name] = scores
    json.dump(renamed, open(os.path.join(draft_dir, 'real_results.json'), 'w'))
    return renamed


def sync_roster(admin_teams, data_dir='.', draft_dir='.'):
    """The core entry point given an already-loaded admin_teams list --
    regenerates every dependent file from data_dir into draft_dir."""
    os.makedirs(draft_dir, exist_ok=True)
    new_roster = load_current_roster(admin_teams)
    sync_h2h_divisions(new_roster, data_dir, draft_dir)
    sync_h2h_schedule(new_roster, admin_teams, data_dir, draft_dir)
    tmc, history = sync_coefficients_and_pools(new_roster, admin_teams, data_dir, draft_dir)
    sync_carry_balances(new_roster, admin_teams, data_dir, draft_dir)
    sync_futures_divisions(new_roster, tmc['team_coeffs'], tmc['scale'], history, data_dir, draft_dir)
    sync_h2h_record(admin_teams, data_dir, draft_dir)
    sync_real_results(admin_teams, data_dir, draft_dir)
    json.dump(admin_teams, open(os.path.join(draft_dir, 'admin_teams.json'), 'w'))
    return new_roster


def sync_roster_if_changed(alltime_csv_path, data_dir, draft_dir):
    """The automated-workflow entry point: fetches a fresh admin_teams
    snapshot from the All Time Data sheet, compares it against the current
    live version, and only actually runs the full sync (writing to
    draft_dir) if something genuinely changed. Returns (changed: bool,
    summary: str|None) -- summary is the PR-body text describing exactly
    what changed, for human review."""
    fresh_teams, season_label = build_admin_teams(alltime_csv_path, out_path=os.path.join(draft_dir, '_fresh_admin_teams.json'))
    old_path = os.path.join(data_dir, 'admin_teams.json')
    old_teams = json.load(open(old_path)) if os.path.exists(old_path) else []

    summary = diff_admin_teams(old_teams, fresh_teams)
    if summary is None:
        return False, None

    sync_roster(fresh_teams, data_dir=data_dir, draft_dir=draft_dir)
    return True, f"{summary}\n\n(Source sheet's most recent season column: {season_label})"
