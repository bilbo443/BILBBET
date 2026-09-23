# Division 3 expansion readiness (2026-27)

The Division 4 option in the older checklist was superseded. Division 3A and
3B may grow to 16 each, then Division 3 may split into A/B/C. Three-conference
sizes can be 12-20 each at the October 9 roster freeze. The final size is
unknown until then and can vary between seasons.

## Implemented in the accompanying patch

- The roster importer accepts `DIVISION 3C` and rejects unknown active status
  strings instead of silently dropping teams. Draft validation checks two
  conferences (at most 16 each) or three (12-20 each at freeze), duplicate
  names and the configured season date.
- The frontend discovers active Div 3 conferences from `h2h_divisions.json`.
  Tabs, preseason winner and promotion slots, tipping, Round 1 median,
  bottom-three markets and colour styling include C once populated.
- The draft simulation and roster-sync futures calculate six Div 3 promotion
  places under both layouts. Three conferences use three automatic champions
  and three playoff winners from positions 2-5.
- Roddy totals and FA Cup stage markets use the current roster size.
  Above 62 entrants, a seeded preliminary round is generated and the bracket
  saved for review. A calendar round must still be supplied explicitly.
- The independent Tuesday roster watcher prepares a draft PR; the existing
  Monday pipeline fails rather than continuing with stale roster data if
  a configured roster source is unavailable or its sync fails.

## Checks still requiring real inputs

- [ ] Confirm each week's registry changes and conference assignments.
- [ ] Confirm the actual three-conference playoff rules and fixture schedule.
- [ ] Set the extra FA Cup date, check preliminary pairings and byes against
      the competition organiser's real draw, and publish recalculated odds.
- [ ] Confirm how a 26-round season schedules conferences of 17-20 teams.
      Their full double round robin would require more than 26 rounds.
- [ ] Regenerate/review `leading_at.json` and `special_markets.json` for
      each roster change, and retest tipping and admin fixture entry.
- [ ] Change `roster_rules.json` for each subsequent season's freeze date.
