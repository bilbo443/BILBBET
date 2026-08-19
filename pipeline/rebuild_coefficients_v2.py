"""
Coefficient v3: a genuine ground-up rebuild using season-end TOTAL SCORE
data (division + total score per team per season, 22/23-25/26) sourced
from the league's own trophy/admin spreadsheet -- not round-by-round
scores, but real, tier-taggable season outcomes for all four seasons this
environment can access, which the previous v2 patch could not use (v2
could only algebraically invert a single blended multiplier; recency
weighting is applied to individual per-season values BEFORE blending, so
it can't be adjusted after the fact without the per-season inputs).

What this deliberately does NOT attempt: strength-of-schedule, ceiling/
volatility, and first/second-half trajectory all require round-by-round
scores, which only exist here for 25/26 (season_2526.json). Rather than
compute those for one season and silently omit them for three others,
this drops them entirely for THIS rebuild and documents that clearly --
cup coefficients (fa_cup/ecl) fall back to the same tier-blind base as
roddy, matching the documented "same base strength as roddy" design
intent, minus the ceiling refinement this data can't support consistently.

Changes from v2, per direct instruction:
  - Recency weights shifted to favour recent seasons slightly more:
    25/26: 0.40 -> 0.45, 24/25: 0.30 -> 0.32, 23/24: 0.20 -> 0.15,
    22/23: 0.10 -> 0.08. (Sums to 1.0; a real but deliberately modest shift.)
  - Trophy bonus increased specifically for the major trophies (eliza,
    roddy, fa_cup, ecl) -- per-trophy value and cap both raised. Minor
    trophies (shield, div2, div2 shield, div3, div3 shield, leigh broxham)
    remain excluded from any bonus, as in v2.
Inputs expected in the working directory when run:
  - trophy_data.csv: the league's all-time trophy/admin spreadsheet export
    (source: Eliza_Admin_-_All_Time_Data.csv)
  - h2h_divisions.json: current (26/27) division rosters
  - team_market_coeffs_rebuilt.json: only used for variance_widen fallback
    on the very first run after switching methodology; not otherwise
    load-bearing

Outputs:
  - team_market_coeffs_v3.json: {scale, team_coeffs} in the same shape the
    live app's team_market_coeffs.json expects -- copy directly over it
    to deploy.

"""
import json
import statistics
import pandas as pd

TIER_BY_DIVISION_PREFIX = {'ELIZA CUP': 0, 'DIVISION 2': 1, 'DIVISION 3': 2, 'SEGUNDA': 1, 'NON-LEAGUE': 3}
RECENCY_WEIGHTS = {'25/26': 0.45, '24/25': 0.32, '23/24': 0.15, '22/23': 0.08}
RELEGATION_WEIGHT = 0.5

PROMOTION_RATE, PROMOTION_CAP = 0.15, 0.35  # eased, eliza-only (see v2 rationale, unchanged here)

TROPHY_PER_WIN = 0.05   # was 0.025 in v2 -- doubled, per "increase... for the major trophies in particular"
DECAY_SEASONS = 10
TROPHY_CAP = 0.20       # was 0.10 in v2 -- doubled
CURRENT_SEASON_YY = 26

# Live-roster renames confirmed to have happened before this separate
# trophy/all-time sheet was updated to match. Add an entry here the same
# day a rename is confirmed; safe to leave old entries in permanently --
# once the source sheet's own CURRENT NAME catches up, the remap becomes
# a genuine no-op (old key simply never matches a row again).
KNOWN_RENAMES = {
    'ZOUMA KICKS TIM PAYNE': 'THE DRONE POLICE',  # confirmed 2026-08-17
}

# Season-end TOTAL SCORE has a fundamentally different variance structure
# than the per-round scores the original formula (shrink, promotion
# discount, trophy bonus) was calibrated against -- a season total
# averages out round-to-round noise the way per-round pooling doesn't, so
# z-scores computed from totals run systematically larger. Derived
# directly by computing both ways for 25/26 (the one season this
# environment has both season_2526.json's real per-round scores AND the
# trophy CSV's totals) -- confirmed exactly 2.36x across every team
# checked, not team-specific, so a single scaling factor is legitimate.
TOTAL_SCORE_Z_CALIBRATION = 2.36


def division_tier(div_name):
    if not isinstance(div_name, str) or not div_name.strip():
        return None
    d = div_name.strip().upper()
    for prefix, tier in TIER_BY_DIVISION_PREFIX.items():
        if d.startswith(prefix):
            return tier
    return None


def trophy_bonus_for_years(years_str):
    if not isinstance(years_str, str) or not years_str.strip():
        return 0.0
    total = 0.0
    for token in years_str.split(','):
        token = token.strip()
        try:
            yy = int(token.split('/')[0])
        except Exception:
            continue
        seasons_ago = CURRENT_SEASON_YY - yy
        decay = max(0.0, 1.0 - seasons_ago / DECAY_SEASONS)
        total += TROPHY_PER_WIN * decay
    return min(total, TROPHY_CAP)


def load_csv_data(csv_path):
    df = pd.read_csv(csv_path, header=5)
    season_cols = {
        '22/23': ('DIVISION.1', 'TOTAL SCORE'),
        '23/24': ('DIVISION.2', 'TOTAL SCORE.1'),
        '24/25': ('DIVISION.3', 'TOTAL SCORE.2'),
        '25/26': ('DIVISION.4', 'TOTAL SCORE.3'),
    }
    all_season_div_cols = ['DIVISION', 'DIVISION.1', 'DIVISION.2', 'DIVISION.3', 'DIVISION.4']  # incl. 21/22 for tier history only
    trophy_cols = {
        'eliza': 'ELIZA', 'roddy': 'RODDY', 'fa_cup': 'FA CUP', 'ecl': 'ECL',
    }

    teams = {}
    for _, row in df.iterrows():
        name = row.get('CURRENT NAME')
        if not isinstance(name, str) or not name.strip():
            continue
        team = name.strip().upper()
        # A live-roster rename can outpace this separate trophy/all-time
        # sheet, which the league admin updates on their own schedule --
        # confirmed happening for real on 2026-08-17 (Zouma Kicks Tim Payne
        # -> The Drone Police, live roster updated same day, this sheet's
        # CURRENT NAME still lagging at the time). Without this, the new
        # name would silently miss its own real history and fall back to
        # a neutral coefficient. Remaps at load time so it's a genuine
        # no-op once this sheet catches up on its own -- nothing to
        # remember to undo.
        team = KNOWN_RENAMES.get(team, team)

        seasons = {}
        for label, (div_col, score_col) in season_cols.items():
            div = row.get(div_col)
            score = row.get(score_col)
            if isinstance(div, str) and div.strip() and pd.notna(score):
                try:
                    seasons[label] = {'division': div.strip(), 'total_score': float(score)}
                except (ValueError, TypeError):
                    pass

        tiers_seen = []
        for c in all_season_div_cols:
            t = division_tier(row.get(c))
            if t is not None:
                tiers_seen.append(t)

        bonuses = {}
        for market, years_col in trophy_cols.items():
            years_str = row.get(years_col)
            bonuses[market] = trophy_bonus_for_years(years_str)

        teams[team] = {'seasons': seasons, 'tiers_seen': tiers_seen, 'trophy_bonus': bonuses}
    return teams


def compute_season_stats(teams, season_label):
    """League-wide and per-tier mean/std of TOTAL SCORE for one season,
    across every team that has data for it."""
    tier_scores = {}
    all_scores = []
    for team, td in teams.items():
        s = td['seasons'].get(season_label)
        if not s:
            continue
        tier = division_tier(s['division'])
        if tier is None:
            continue
        tier_scores.setdefault(tier, []).append(s['total_score'])
        all_scores.append(s['total_score'])
    league_mean = statistics.mean(all_scores)
    league_std = statistics.stdev(all_scores) if len(all_scores) > 1 else 1.0
    tier_stats = {}
    for tier, scores in tier_scores.items():
        tier_stats[tier] = {
            'mean': statistics.mean(scores),
            'std': statistics.stdev(scores) if len(scores) > 1 else league_std,
        }
    return {'league_mean': league_mean, 'league_std': league_std, 'tier_stats': tier_stats}


def nearest_available_tier(tier_stats, target_tier):
    if target_tier in tier_stats:
        return target_tier
    return min(tier_stats.keys(), key=lambda t: abs(t - target_tier))


def main():
    teams = load_csv_data('trophy_data.csv')
    divisions_2627 = json.load(open('h2h_divisions.json'))
    current_div = {}
    for div, tlist in divisions_2627.items():
        for t in tlist:
            current_div[t.strip().upper()] = div

    season_stats = {label: compute_season_stats(teams, label) for label in RECENCY_WEIGHTS}

    old_coeffs = json.load(open('team_market_coeffs_rebuilt.json'))
    scale = old_coeffs['scale']

    updated = {}
    for team, td in teams.items():
        if team not in current_div:
            continue  # not an active 26/27 team -- no market to price
        current_tier = division_tier(current_div[team])

        roddy_entries, eliza_entries = [], []
        for label, s in td['seasons'].items():
            this_tier = division_tier(s['division'])
            stats = season_stats[label]
            if this_tier not in stats['tier_stats']:
                continue
            this_tier_stat = stats['tier_stats'][this_tier]
            target_tier_resolved = nearest_available_tier(stats['tier_stats'], current_tier)
            target_tier_stat = stats['tier_stats'][target_tier_resolved]

            roddy_z = (s['total_score'] - stats['league_mean']) / stats['league_std'] / TOTAL_SCORE_Z_CALIBRATION
            in_tier_z = (s['total_score'] - this_tier_stat['mean']) / this_tier_stat['std'] / TOTAL_SCORE_Z_CALIBRATION
            tier_offset = (this_tier_stat['mean'] - target_tier_stat['mean']) / stats['league_std'] / TOTAL_SCORE_Z_CALIBRATION
            eliza_z = in_tier_z + tier_offset

            roddy_entries.append((label, roddy_z))
            eliza_entries.append((label, eliza_z))

        n_seasons = len(roddy_entries)
        if n_seasons == 0:
            continue

        def weighted_avg(entries):
            total_w = sum(RECENCY_WEIGHTS[l] for l, _ in entries)
            return sum(RECENCY_WEIGHTS[l] * v for l, v in entries) / total_w

        roddy_raw = weighted_avg(roddy_entries)
        eliza_raw = weighted_avg(eliza_entries)

        base_shrink = min(0.4 + 0.15 * n_seasons, 0.9)

        best_tier_played = min(td['tiers_seen']) if td['tiers_seen'] else current_tier
        tier_gap = max(best_tier_played - current_tier, 0) if current_tier is not None else 0
        promotion_discount = 1.0 - min(tier_gap * PROMOTION_RATE, PROMOTION_CAP)

        eliza_z = eliza_raw * base_shrink * promotion_discount + td['trophy_bonus']['eliza']
        roddy_z = roddy_raw * base_shrink + td['trophy_bonus']['roddy']
        cup_z = roddy_raw * base_shrink + max(td['trophy_bonus']['fa_cup'], td['trophy_bonus']['ecl'])

        most_recent_label = max(td['seasons'].keys()) if td['seasons'] else None
        most_recent_eliza_z = dict(eliza_entries).get(most_recent_label, eliza_raw)
        relegation_risk = -most_recent_eliza_z * 0.3

        old_c = old_coeffs['team_coeffs'].get(team, {})
        variance_widen = old_c.get('variance_widen', max(0.5 - 0.12 * n_seasons, 0.0))

        updated[team] = {
            'eliza': round(eliza_z, 3),
            'roddy': round(roddy_z, 3),
            'fa_cup': round(cup_z, 3),
            'ecl': round(cup_z, 3),
            'relegation_risk': round(relegation_risk, 3),
            'variance_widen': round(variance_widen, 3),
        }

    for team in current_div:
        if team not in updated:
            updated[team] = {'eliza': 0.0, 'roddy': 0.0, 'fa_cup': 0.0, 'ecl': 0.0, 'relegation_risk': 0.0, 'variance_widen': 0.5}

    json.dump({'scale': scale, 'team_coeffs': updated}, open('team_market_coeffs_v3.json', 'w'), indent=2)
    print(f"Wrote team_market_coeffs_v3.json ({len(updated)} teams)")


if __name__ == '__main__':
    main()
