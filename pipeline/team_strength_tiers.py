"""Read ID-based subjective strength centres without changing source histories."""
import json
import math
from pathlib import Path

def load_tier_centres(data_dir, registry):
    path = Path(data_dir) / "team_strength_tiers.json"
    if not path.exists():
        return {}
    settings = json.loads(path.read_text())
    if not settings.get("enabled"):
        return {}
    if settings.get("season") != "2026-27":
        raise ValueError("Review strength tiers for the current season")
    centres = {}
    for team in registry:
        tid = str(team["id"]).zfill(3)
        entry = settings.get("teams", {}).get(tid)
        if entry is not None:
            mean = float(settings["weekly_score_anchors"][entry["tier"]])
            if not math.isfinite(mean) or not 0 <= mean <= 200:
                raise ValueError("Invalid strength centre for " + tid)
            centres[team["name"]] = mean
    return centres
