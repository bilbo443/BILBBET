"""Gate scheduled results refreshes by final fixture date."""
import json
import os
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

def due_rounds(schedule, now):
    local = now.astimezone(ZoneInfo(schedule["timezone"]))
    return [
        int(number)
        for number, entry in schedule["rounds"].items()
        if entry["results_check_date"] == local.date().isoformat()
        and local.hour >= 8
    ]

def main():
    path = Path("data/round_results_schedule.json")
    schedule = json.loads(path.read_text())
    rounds = due_rounds(schedule, datetime.now(ZoneInfo("UTC")))
    ready = bool(rounds)
    print("Scheduled completed-round checks:", rounds or "none today")
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a") as stream:
            stream.write("ready=" + str(ready).lower() + "\n")
            stream.write("rounds=" + ",".join(map(str, rounds)) + "\n")

if __name__ == "__main__":
    main()
