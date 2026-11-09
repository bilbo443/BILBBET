-- Reviewed GW5 calendar alignment. Already applied; idempotent if calendars match.
-- Date changes only: the existing 19:00 Sydney time policy is unchanged.
DO $calendar$
DECLARE dates jsonb; schedule jsonb;
BEGIN
 SELECT value INTO dates FROM bilbbet_private.settings WHERE key='round_dates' FOR UPDATE;
 SELECT value INTO schedule FROM bilbbet_private.settings WHERE key='round_results_schedule' FOR UPDATE;
 IF dates IS NOT DISTINCT FROM $new_dates${
  "1": "2026-10-16",
  "2": "2026-10-23",
  "3": "2026-10-30",
  "4": "2026-11-06",
  "5": "2026-11-20",
  "6": "2026-11-27",
  "7": "2026-12-11",
  "8": "2026-12-18",
  "9": "2026-12-26",
  "10": "2026-12-31",
  "11": "2027-01-08",
  "12": "2027-01-14",
  "13": "2027-01-22",
  "14": "2027-01-29",
  "15": "2027-02-05",
  "16": "2027-02-13",
  "17": "2027-02-26",
  "18": "2027-03-05",
  "19": "2027-03-12",
  "20": "2027-03-19",
  "21": "2027-04-02",
  "22": "2027-04-09",
  "23": "2027-04-16",
  "24": "2027-04-23",
  "25": "2027-04-30",
  "26": "2027-05-07"
}
$new_dates$::jsonb AND schedule IS NOT DISTINCT FROM $new_schedule${
  "season": "2026-27",
  "timezone": "Australia/Sydney",
  "source": "User-supplied A-League fixture CSV, 16 October 2026",
  "note": "Dates are planned; revise for postponements. No automatic final-results declaration.",
  "rounds": {
    "1": {
      "first_fixture_date": "2026-10-16",
      "last_fixture_date": "2026-10-18",
      "results_check_date": "2026-10-19",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 0,
        "DIV3": 0
      }
    },
    "2": {
      "first_fixture_date": "2026-10-23",
      "last_fixture_date": "2026-10-25",
      "results_check_date": "2026-10-26",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "3": {
      "first_fixture_date": "2026-10-30",
      "last_fixture_date": "2026-11-01",
      "results_check_date": "2026-11-02",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "4": {
      "first_fixture_date": "2026-11-06",
      "last_fixture_date": "2026-11-08",
      "results_check_date": "2026-11-09",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "5": {
      "first_fixture_date": "2026-11-20",
      "last_fixture_date": "2026-11-22",
      "results_check_date": "2026-11-23",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "6": {
      "first_fixture_date": "2026-11-27",
      "last_fixture_date": "2026-12-06",
      "results_check_date": "2026-12-07",
      "split_round": true,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "7": {
      "first_fixture_date": "2026-12-11",
      "last_fixture_date": "2026-12-15",
      "results_check_date": "2026-12-16",
      "split_round": false,
      "fixture_change": {
        "home": "Adelaide United",
        "away": "Brisbane Roar",
        "moved_from_round": 1,
        "kickoff_date": "2026-12-15",
        "kickoff_time": "19:30",
        "kickoff_timezone": "Awaiting confirmation: Adelaide or Sydney local time"
      },
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "8": {
      "first_fixture_date": "2026-12-18",
      "last_fixture_date": "2026-12-21",
      "results_check_date": "2026-12-22",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "9": {
      "first_fixture_date": "2026-12-26",
      "last_fixture_date": "2026-12-30",
      "results_check_date": "2026-12-31",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "10": {
      "first_fixture_date": "2026-12-31",
      "last_fixture_date": "2027-01-03",
      "results_check_date": "2027-01-04",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "11": {
      "first_fixture_date": "2027-01-08",
      "last_fixture_date": "2027-01-10",
      "results_check_date": "2027-01-11",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "12": {
      "first_fixture_date": "2027-01-14",
      "last_fixture_date": "2027-01-19",
      "results_check_date": "2027-01-20",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "13": {
      "first_fixture_date": "2027-01-22",
      "last_fixture_date": "2027-01-26",
      "results_check_date": "2027-01-27",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "14": {
      "first_fixture_date": "2027-01-29",
      "last_fixture_date": "2027-01-31",
      "results_check_date": "2027-02-01",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "15": {
      "first_fixture_date": "2027-02-05",
      "last_fixture_date": "2027-02-07",
      "results_check_date": "2027-02-08",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "16": {
      "first_fixture_date": "2027-02-13",
      "last_fixture_date": "2027-02-21",
      "results_check_date": "2027-02-22",
      "split_round": true,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "17": {
      "first_fixture_date": "2027-02-26",
      "last_fixture_date": "2027-02-28",
      "results_check_date": "2027-03-01",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "18": {
      "first_fixture_date": "2027-03-05",
      "last_fixture_date": "2027-03-07",
      "results_check_date": "2027-03-08",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "19": {
      "first_fixture_date": "2027-03-12",
      "last_fixture_date": "2027-03-14",
      "results_check_date": "2027-03-15",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "20": {
      "first_fixture_date": "2027-03-19",
      "last_fixture_date": "2027-03-21",
      "results_check_date": "2027-03-22",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "21": {
      "first_fixture_date": "2027-04-02",
      "last_fixture_date": "2027-04-04",
      "results_check_date": "2027-04-05",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "22": {
      "first_fixture_date": "2027-04-09",
      "last_fixture_date": "2027-04-11",
      "results_check_date": "2027-04-12",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "23": {
      "first_fixture_date": "2027-04-16",
      "last_fixture_date": "2027-04-18",
      "results_check_date": "2027-04-19",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "24": {
      "first_fixture_date": "2027-04-23",
      "last_fixture_date": "2027-04-26",
      "results_check_date": "2027-04-27",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 0,
        "DIV3": 0
      }
    },
    "25": {
      "first_fixture_date": "2027-04-30",
      "last_fixture_date": "2027-05-02",
      "results_check_date": "2027-05-03",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 0,
        "DIV3": 0
      }
    },
    "26": {
      "first_fixture_date": "2027-05-07",
      "last_fixture_date": "2027-05-09",
      "results_check_date": "2027-05-10",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 0,
        "DIV3": 0
      }
    }
  }
}
$new_schedule$::jsonb THEN RETURN; END IF;
 IF bilbbet_private.current_round()<>5 THEN RAISE EXCEPTION 'Current round changed; review before applying'; END IF;
 IF dates IS DISTINCT FROM $old${"1": "2026-10-16", "2": "2026-10-23", "3": "2026-10-30", "4": "2026-11-06", "5": "2026-11-20", "6": "2026-11-27", "7": "2026-12-11", "8": "2026-12-18", "9": "2026-12-25", "10": "2027-01-01", "11": "2027-01-08", "12": "2027-01-15", "13": "2027-01-22", "14": "2027-01-29", "15": "2027-02-05", "16": "2027-02-12", "17": "2027-02-26", "18": "2027-03-05", "19": "2027-03-12", "20": "2027-03-19", "21": "2027-03-26", "22": "2027-04-02", "23": "2027-04-16", "24": "2027-04-23", "25": "2027-04-30", "26": "2027-05-07"}$old$::jsonb OR schedule IS DISTINCT FROM $old_schedule${"season": "2026-27", "timezone": "Australia/Sydney", "source": "User-supplied A-League fixture CSV, 16 October 2026", "note": "Dates are planned; revise for postponements. No automatic final-results declaration.", "rounds": {"1": {"first_fixture_date": "2026-10-16", "last_fixture_date": "2026-10-18", "results_check_date": "2026-10-19", "split_round": false}, "2": {"first_fixture_date": "2026-10-23", "last_fixture_date": "2026-10-25", "results_check_date": "2026-10-26", "split_round": false}, "3": {"first_fixture_date": "2026-10-30", "last_fixture_date": "2026-11-01", "results_check_date": "2026-11-02", "split_round": false}, "4": {"first_fixture_date": "2026-11-06", "last_fixture_date": "2026-11-08", "results_check_date": "2026-11-09", "split_round": false}, "5": {"first_fixture_date": "2026-11-20", "last_fixture_date": "2026-11-22", "results_check_date": "2026-11-23", "split_round": false}, "6": {"first_fixture_date": "2026-11-27", "last_fixture_date": "2026-12-06", "results_check_date": "2026-12-07", "split_round": true}, "7": {"first_fixture_date": "2026-12-11", "last_fixture_date": "2026-12-15", "results_check_date": "2026-12-16", "split_round": false, "fixture_change": {"home": "Adelaide United", "away": "Brisbane Roar", "moved_from_round": 1, "kickoff_date": "2026-12-15", "kickoff_time": "19:30", "kickoff_timezone": "Awaiting confirmation: Adelaide or Sydney local time"}}, "8": {"first_fixture_date": "2026-12-18", "last_fixture_date": "2026-12-21", "results_check_date": "2026-12-22", "split_round": false}, "9": {"first_fixture_date": "2026-12-26", "last_fixture_date": "2026-12-30", "results_check_date": "2026-12-31", "split_round": false}, "10": {"first_fixture_date": "2026-12-31", "last_fixture_date": "2027-01-03", "results_check_date": "2027-01-04", "split_round": false}, "11": {"first_fixture_date": "2027-01-08", "last_fixture_date": "2027-01-10", "results_check_date": "2027-01-11", "split_round": false}, "12": {"first_fixture_date": "2027-01-14", "last_fixture_date": "2027-01-19", "results_check_date": "2027-01-20", "split_round": false}, "13": {"first_fixture_date": "2027-01-22", "last_fixture_date": "2027-01-26", "results_check_date": "2027-01-27", "split_round": false}, "14": {"first_fixture_date": "2027-01-29", "last_fixture_date": "2027-01-31", "results_check_date": "2027-02-01", "split_round": false}, "15": {"first_fixture_date": "2027-02-05", "last_fixture_date": "2027-02-07", "results_check_date": "2027-02-08", "split_round": false}, "16": {"first_fixture_date": "2027-02-13", "last_fixture_date": "2027-02-21", "results_check_date": "2027-02-22", "split_round": true}, "17": {"first_fixture_date": "2027-02-26", "last_fixture_date": "2027-02-28", "results_check_date": "2027-03-01", "split_round": false}, "18": {"first_fixture_date": "2027-03-05", "last_fixture_date": "2027-03-07", "results_check_date": "2027-03-08", "split_round": false}, "19": {"first_fixture_date": "2027-03-12", "last_fixture_date": "2027-03-14", "results_check_date": "2027-03-15", "split_round": false}, "20": {"first_fixture_date": "2027-03-19", "last_fixture_date": "2027-03-21", "results_check_date": "2027-03-22", "split_round": false}, "21": {"first_fixture_date": "2027-04-02", "last_fixture_date": "2027-04-04", "results_check_date": "2027-04-05", "split_round": false}, "22": {"first_fixture_date": "2027-04-09", "last_fixture_date": "2027-04-11", "results_check_date": "2027-04-12", "split_round": false}, "23": {"first_fixture_date": "2027-04-16", "last_fixture_date": "2027-04-18", "results_check_date": "2027-04-19", "split_round": false}, "24": {"first_fixture_date": "2027-04-23", "last_fixture_date": "2027-04-26", "results_check_date": "2027-04-27", "split_round": false}, "25": {"first_fixture_date": "2027-04-30", "last_fixture_date": "2027-05-02", "results_check_date": "2027-05-03", "split_round": false}, "26": {"first_fixture_date": "2027-05-07", "last_fixture_date": "2027-05-09", "results_check_date": "2027-05-10", "split_round": false}}}$old_schedule$::jsonb THEN RAISE EXCEPTION 'Server calendar differs from reviewed source'; END IF;
 UPDATE bilbbet_private.settings SET value=$new${
  "1": "2026-10-16",
  "2": "2026-10-23",
  "3": "2026-10-30",
  "4": "2026-11-06",
  "5": "2026-11-20",
  "6": "2026-11-27",
  "7": "2026-12-11",
  "8": "2026-12-18",
  "9": "2026-12-26",
  "10": "2026-12-31",
  "11": "2027-01-08",
  "12": "2027-01-14",
  "13": "2027-01-22",
  "14": "2027-01-29",
  "15": "2027-02-05",
  "16": "2027-02-13",
  "17": "2027-02-26",
  "18": "2027-03-05",
  "19": "2027-03-12",
  "20": "2027-03-19",
  "21": "2027-04-02",
  "22": "2027-04-09",
  "23": "2027-04-16",
  "24": "2027-04-23",
  "25": "2027-04-30",
  "26": "2027-05-07"
}
$new$::jsonb WHERE key='round_dates';
 UPDATE bilbbet_private.settings SET value=$schedule${
  "season": "2026-27",
  "timezone": "Australia/Sydney",
  "source": "User-supplied A-League fixture CSV, 16 October 2026",
  "note": "Dates are planned; revise for postponements. No automatic final-results declaration.",
  "rounds": {
    "1": {
      "first_fixture_date": "2026-10-16",
      "last_fixture_date": "2026-10-18",
      "results_check_date": "2026-10-19",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 0,
        "DIV3": 0
      }
    },
    "2": {
      "first_fixture_date": "2026-10-23",
      "last_fixture_date": "2026-10-25",
      "results_check_date": "2026-10-26",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "3": {
      "first_fixture_date": "2026-10-30",
      "last_fixture_date": "2026-11-01",
      "results_check_date": "2026-11-02",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "4": {
      "first_fixture_date": "2026-11-06",
      "last_fixture_date": "2026-11-08",
      "results_check_date": "2026-11-09",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "5": {
      "first_fixture_date": "2026-11-20",
      "last_fixture_date": "2026-11-22",
      "results_check_date": "2026-11-23",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "6": {
      "first_fixture_date": "2026-11-27",
      "last_fixture_date": "2026-12-06",
      "results_check_date": "2026-12-07",
      "split_round": true,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "7": {
      "first_fixture_date": "2026-12-11",
      "last_fixture_date": "2026-12-15",
      "results_check_date": "2026-12-16",
      "split_round": false,
      "fixture_change": {
        "home": "Adelaide United",
        "away": "Brisbane Roar",
        "moved_from_round": 1,
        "kickoff_date": "2026-12-15",
        "kickoff_time": "19:30",
        "kickoff_timezone": "Awaiting confirmation: Adelaide or Sydney local time"
      },
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "8": {
      "first_fixture_date": "2026-12-18",
      "last_fixture_date": "2026-12-21",
      "results_check_date": "2026-12-22",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "9": {
      "first_fixture_date": "2026-12-26",
      "last_fixture_date": "2026-12-30",
      "results_check_date": "2026-12-31",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "10": {
      "first_fixture_date": "2026-12-31",
      "last_fixture_date": "2027-01-03",
      "results_check_date": "2027-01-04",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "11": {
      "first_fixture_date": "2027-01-08",
      "last_fixture_date": "2027-01-10",
      "results_check_date": "2027-01-11",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "12": {
      "first_fixture_date": "2027-01-14",
      "last_fixture_date": "2027-01-19",
      "results_check_date": "2027-01-20",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "13": {
      "first_fixture_date": "2027-01-22",
      "last_fixture_date": "2027-01-26",
      "results_check_date": "2027-01-27",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "14": {
      "first_fixture_date": "2027-01-29",
      "last_fixture_date": "2027-01-31",
      "results_check_date": "2027-02-01",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "15": {
      "first_fixture_date": "2027-02-05",
      "last_fixture_date": "2027-02-07",
      "results_check_date": "2027-02-08",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "16": {
      "first_fixture_date": "2027-02-13",
      "last_fixture_date": "2027-02-21",
      "results_check_date": "2027-02-22",
      "split_round": true,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "17": {
      "first_fixture_date": "2027-02-26",
      "last_fixture_date": "2027-02-28",
      "results_check_date": "2027-03-01",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "18": {
      "first_fixture_date": "2027-03-05",
      "last_fixture_date": "2027-03-07",
      "results_check_date": "2027-03-08",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "19": {
      "first_fixture_date": "2027-03-12",
      "last_fixture_date": "2027-03-14",
      "results_check_date": "2027-03-15",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "20": {
      "first_fixture_date": "2027-03-19",
      "last_fixture_date": "2027-03-21",
      "results_check_date": "2027-03-22",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "21": {
      "first_fixture_date": "2027-04-02",
      "last_fixture_date": "2027-04-04",
      "results_check_date": "2027-04-05",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "22": {
      "first_fixture_date": "2027-04-09",
      "last_fixture_date": "2027-04-11",
      "results_check_date": "2027-04-12",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "23": {
      "first_fixture_date": "2027-04-16",
      "last_fixture_date": "2027-04-18",
      "results_check_date": "2027-04-19",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 12,
        "DIV3": 14
      }
    },
    "24": {
      "first_fixture_date": "2027-04-23",
      "last_fixture_date": "2027-04-26",
      "results_check_date": "2027-04-27",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 0,
        "DIV3": 0
      }
    },
    "25": {
      "first_fixture_date": "2027-04-30",
      "last_fixture_date": "2027-05-02",
      "results_check_date": "2027-05-03",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 0,
        "DIV3": 0
      }
    },
    "26": {
      "first_fixture_date": "2027-05-07",
      "last_fixture_date": "2027-05-09",
      "results_check_date": "2027-05-10",
      "split_round": false,
      "expected_league_fixtures": {
        "ELIZA": 7,
        "DIV2": 0,
        "DIV3": 0
      }
    }
  }
}
$schedule$::jsonb WHERE key='round_results_schedule';
 INSERT INTO bilbbet_private.settings(key,value) VALUES('calendar_alignment_review',jsonb_build_object('date_changes',$changes${"9": {"before": "2026-12-25", "after": "2026-12-26"}, "10": {"before": "2027-01-01", "after": "2026-12-31"}, "12": {"before": "2027-01-15", "after": "2027-01-14"}, "16": {"before": "2027-02-12", "after": "2027-02-13"}, "21": {"before": "2027-03-26", "after": "2027-04-02"}, "22": {"before": "2027-04-02", "after": "2027-04-09"}}$changes$::jsonb,'source','Stored user-supplied fixture calendar, 16 October 2026','time_policy','Existing 19:00 Sydney default retained; exact first kickoffs not supplied','reviewed_at',now()))
 ON CONFLICT(key) DO UPDATE SET value=excluded.value;
END $calendar$;

