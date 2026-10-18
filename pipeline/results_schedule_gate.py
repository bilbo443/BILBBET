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
        and (local.hour, local.minute) >= (12, 30)
    ]

def main():
    path = Path("data/round_results_schedule.json")
    schedule = json.loads(path.read_text())
    now = datetime.now(ZoneInfo("UTC"))
    rounds = due_rounds(schedule, now)
    if os.environ.get("GITHUB_EVENT_NAME") == "schedule":
        event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
        local = now.astimezone(ZoneInfo(schedule["timezone"]))
        offset_hours = local.utcoffset().total_seconds() / 3600
        expected_cron = "30 1 * * *" if offset_hours == 11 else "30 2 * * *"
        if event.get("schedule") != expected_cron:
            rounds = []
    ready = bool(rounds)
    print("Scheduled completed-round checks:", rounds or "none today")
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a") as stream:
            stream.write("ready=" + str(ready).lower() + "\n")
            stream.write("rounds=" + ",".join(map(str, rounds)) + "\n")

if __name__ == "__main__":
    main()
