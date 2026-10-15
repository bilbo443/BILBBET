"""Draft cumulative leading-at and conference-relative conceded markets."""
import hashlib
import json
from pathlib import Path
import numpy as np
from simulation_adapter import (
    compute_adjusted_shifts, early_season_shrinkage,
    shrink_values_toward_pool, season_schedule
)
from team_strength_tiers import load_tier_centres
from diff_report import pct_to_odds

def read(path):
    return json.loads(Path(path).read_text())

def rows(names, probabilities):
    result = []
    for name, probability in zip(names, probabilities):
        odds = pct_to_odds(float(probability))
        result.append({
            "team": name,
            "odds": odds if odds is not None else 1001,
            "suspended": odds is None
        })
    return sorted(
        result,
        key=lambda r: (
            r["suspended"],
            r["odds"] if r["odds"] is not None else 0,
            r["team"]
        )
    )

def main():
    data = Path("data")
    destination = Path("draft/launch-markets-review")
    destination.mkdir(parents=True, exist_ok=True)
    registry = read(data / "admin_teams.json")
    roster = read(data / "h2h_divisions.json")
    history = read(data / "roddy_history.json")
    coefficients = read(data / "team_market_coeffs.json")
    centres = load_tier_centres(data, registry)
    active = {
        t["name"] for t in registry
        if t.get("status") not in (None, "", "INACTIVE")
    }
    assert len(active) == 66
    assert {t for group in roster.values() for t in group} == active

    ids = {t["name"]: str(t["id"]).zfill(3) for t in registry}
    roster = {
        division: sorted(group, key=lambda t: ids[t])
        for division, group in sorted(roster.items())
    }
    names = [t for group in roster.values() for t in group]
    index = {name: i for i, name in enumerate(names)}
    n = 12000
    before = {
        str(p): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in data.glob("*.json")
    }

    shifts, _ = compute_adjusted_shifts(
        coefficients["team_coeffs"], coefficients["scale"],
        history, [], roster_teams=names, market="eliza"
    )
    shrink = early_season_shrinkage(0)
    division_scores = {}
    roddy_totals = np.zeros((n, 66, 26))
    conceded = np.zeros((n, 66))
    played = np.zeros(66)

    print("Sampling 12,000 seasons...", flush=True)
    for division, group in roster.items():
        pool = np.concatenate([np.asarray(history[t]) for t in group])
        for team in group:
            values = np.asarray(history[team], dtype=float)
            assert len(values) and np.isfinite(values).all()
            seed = int.from_bytes(hashlib.sha256(
                ("launch-markets:" + ids[team]).encode()
            ).digest()[:8], "big")
            rng = np.random.default_rng(seed)
            positions = rng.integers(0, len(values), size=(n, 26))

            if team in centres:
                adjusted_division = values - values.mean() + centres[team]
                adjusted_roddy = adjusted_division
            else:
                adjusted_division = (
                    shrink_values_toward_pool(values, pool, shrink)
                    + shifts.get(team, 0)
                )
                adjusted_roddy = values + (
                    coefficients["scale"]
                    * coefficients["team_coeffs"].get(team, {}).get("roddy", 0)
                )
            division_scores[team] = np.rint(adjusted_division)[positions]
            roddy_totals[:, index[team], :] = np.cumsum(
                np.rint(adjusted_roddy)[positions], axis=1
            )

    leading = read(data / "leading_at.json")
    leading["leading_at"] = {}
    leading["roddy_leading_at"] = {}

    for division, group in roster.items():
        schedule = season_schedule(division, group)
        points = np.zeros((n, len(group)))
        scored = np.zeros_like(points)
        local = {t: i for i, t in enumerate(group)}
        leading["leading_at"][division] = {}
        valid_rounds = (
            set(range(2, 24))
            if division.startswith(("DIVISION 2", "DIVISION 3"))
            else set(range(1, 27))
        )
        rng = np.random.default_rng(700)
        for week, pairs in enumerate(schedule):
            average = np.mean(
                [division_scores[t][:, week] for t in group], axis=0
            )
            for a, b in pairs:
                sa = average if a == "AVERAGE TEAM" else division_scores[a][:, week]
                sb = average if b == "AVERAGE TEAM" else division_scores[b][:, week]
                for team, own, opponent in ((a, sa, sb), (b, sb, sa)):
                    if team not in local:
                        continue
                    j = local[team]
                    points[:, j] += 3 * (own > opponent) + (own == opponent)
                    scored[:, j] += own
                    conceded[:, index[team]] += opponent
                    played[index[team]] += 1

            round_number = week + 1
            if round_number in valid_rounds:
                # Same points/score-for ordering as division futures.
                # Exact ties receive reproducible random tie-breaks.
                order = np.lexsort(
                    (rng.random(points.shape), -scored, -points), axis=1
                )
                counts = np.bincount(order[:, 0], minlength=len(group))
                leading["leading_at"][division][str(round_number)] = rows(
                    group, 100 * counts / n
                )
        print("Completed:", division, flush=True)

    for week in range(26):
        totals = roddy_totals[:, :, week]
        top = totals == totals.max(axis=1, keepdims=True)
        shares = top / top.sum(axis=1, keepdims=True)
        leading["roddy_leading_at"][str(week + 1)] = rows(
            names, 100 * shares.mean(axis=0)
        )

    assert np.all(played > 0)
    rates = conceded / played[None, :]
    relative = np.zeros_like(rates)
    for group in roster.values():
        positions = [index[t] for t in group]
        values = rates[:, positions]
        mean = values.mean(axis=1, keepdims=True)
        sd = values.std(axis=1, keepdims=True)
        relative[:, positions] = np.divide(
            values - mean, sd,
            out=np.zeros_like(values), where=sd > 0
        )

    specials = read(data / "special_markets.json")
    for key, target in (
        ("charity", relative.min(axis=1, keepdims=True)),
        ("philanthropy", relative.max(axis=1, keepdims=True))
    ):
        tied = np.isclose(relative, target, rtol=0, atol=1e-9)
        shares = tied / tied.sum(axis=1, keepdims=True)
        specials[key] = rows(names, 100 * shares.mean(axis=0))

    for division, rounds in leading["leading_at"].items():
        for entries in rounds.values():
            assert len(entries) == len(roster[division])
            assert {r["team"] for r in entries} == set(roster[division])
    for entries in leading["roddy_leading_at"].values():
        assert len(entries) == 66
        assert {r["team"] for r in entries} == active
    for key in ("charity", "philanthropy"):
        assert len(specials[key]) == 66
        assert {r["team"] for r in specials[key]} == active

    for filename, value in (
        ("leading_at.json", leading),
        ("special_markets.json", specials)
    ):
        (destination / filename).write_text(
            json.dumps(value, indent=2) + "\n"
        )

    after = {
        str(p): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in data.glob("*.json")
    }
    assert before == after
    print("PASS: final roster and shared tiers used.")
    print("PASS: leading-at calculated cumulatively at each round.")
    print("PASS: charity/philanthropy cover all 66 teams.")
    print("PASS: live files unchanged; markets not reopened.")
    print("Draft:", destination)
    for key in ("charity", "philanthropy"):
        print("\n" + key.upper() + " — FIRST FIVE")
        for entry in specials[key][:5]:
            print(entry["team"], entry["odds"])

if __name__ == "__main__":
    main()
