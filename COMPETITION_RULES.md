# League structure and fixture rules (2026–27)

The live roster remains provisional until 9 October 2026. Reconcile every weekly roster change against `data/h2h_divisions.json`, `data/admin_teams.json`, and all roster-dependent markets before publishing. The freeze date and Division 3 size bounds are in `data/roster_rules.json`; update them for later seasons.

| Competition | Regular season | Finals |
| --- | --- | --- |
| Division 1 (Eliza Cup) | Matchweeks 1–26 | None |
| Division 2A and 2B | Matchweeks 2–23 | Conference finals in matchweeks 24–26 |
| Division 3A, 3B, and, when formed, 3C | Matchweeks 2–23 | Conference finals in matchweeks 24–26 |

Each Division 2 or 3 conference holds its own finals fixtures; no cross-conference finals are scheduled. Admin enters each actual finals pairing, stage and matchweek in the Playoffs section. Regular-season schedules have 26 slots, with empty lists for matchweeks 1 and 24–26 in Divisions 2 and 3. Division 3 does not require balanced home-and-away pairings: 22 regular-season matchweeks cannot guarantee a full double round robin at every permitted size. In an odd-sized conference, the otherwise unmatched real team plays AVERAGE TEAM each round. Its score is the arithmetic mean of every real team in that conference for that matchweek; it does not occupy a roster or table place. Settlement waits until every conference score for that week is available.

Division 3A/B can each grow to 16 teams before a three-conference Division 3A/B/C structure is formed. Once three conferences are used, their permitted sizes are 12–20 each. The final roster and its conference assignment are not known until the freeze. At 12 teams, six teams participate in each Division 3 conference's finals; at 16 or more, the current expectation is eight. Finals size for 13–15 teams, seed ordering, and the precise bracket still require confirmation. A team already promoted can participate in finals; if it wins an additional promotion place, that place passes to the next eligible team on its conference table. The number of automatic and finals promotion places also requires confirmation.

Until promotion rules are confirmed, the existing Division 2/3 promotion betting markets are suspended and new preseason promotion predictions are disabled. Existing predictions and placed bets are retained for review and eventual settlement. Division winners and other regular-season markets continue to use the regular-season table.

The FA Cup needs one additional round when the current roster exceeds 64 teams. Its preliminary round date and actual draw must be confirmed separately before publication.

Round 1 tipping uses separate Mr Median contests for Eliza, Division 2 and Division 3. The Eliza tipping page does not use provisional fixture pairings even when a draw is imported close to kickoff; that import remains available for real H2H markets. Each tier waits for all its own scores and allows at most half its teams to be tipped above the median. The perfect-round target is the number of teams that actually finish strictly above the tier median. Earlier Round 1 fixture tips are retained separately and need to be submitted again in the new format.

## Publication checks

1. Run the roster watcher and resolve active status and division discrepancies before the 9 October freeze.
2. Confirm the official regular-season fixtures; use `pipeline/build_h2h_schedule.py` to import the published CSV. Finals belong in the Playoffs admin interface, not that CSV.
3. Recompute schedules and roster-dependent odds after roster changes; do not reuse earlier fixtures or prices for teams that moved conferences.
4. Confirm conference finals format, promotion allocation and the table fallback before restoring promotion markets or preseason picks.
5. Verify the FA Cup extra round and date if the roster exceeds 64.


FA Cup: a preliminary round is required only above 64 active entrants. When required, it is played in matchweek 2 and Round of 64 in matchweek 4. With 64 or fewer entrants, Round of 64 starts in matchweek 2. Later stage dates remain pending. Review the calendar whenever the confirmed entry count changes.


Final roster market hold: Roddy futures, FA Cup futures, Div 3 markets, Roddy leading-at, and Charity/Philanthropy remain closed pending the final roster/conference review. roster_rules.final_roster_market_hold prevents refreshed prices reopening these markets and blocks held selections at submission. Div 1/2 and unchanged ECL markets remain available. Accepted bets retain their odds. Regenerate and review affected calculations before deliberately clearing the hold; there is no automatic reopening date.


Confirmed conference promotion rules:
- Division 2A/2B: one automatic place plus one finals place each.
- Division 3A/3B: two automatic places plus one finals place each.
- Division 3 finals include the top eight in each conference.
- An already automatically promoted finals winner passes the extra place
  to the highest remaining regular-season H2H table team in its conference.
- Promotion tipping allows two picks per Division 2 conference and three per Division 3.
- Neutral 1.00 tipping values are used pending simulated promotion prices.
- Promotion betting remains suspended.
- Installation does not alter saved picks, balances or accepted bets.


Fixture-aware automated results checks:
- data/round_results_schedule.json records first/final fixture and next-morning check dates.
- Scheduled refresh gate runs daily at 22:00 UTC: 9am AEDT / 8am AEST.
- Refresh runs only on the listed morning after the final fixture.
- GW6 checks 7 December; GW16 checks 22 February, not their first Mondays.
- Extended rounds 8, 9, 12, 13 and 24 use their actual final listed dates.
- Manual workflow runs remain available for late sheet updates or retries.
- Scheduled checks produce review drafts; they do not confirm final scores or settle bets.
- A late/postponed match requires updating the results schedule before its check.
- Betting lockout dates/times and account balances are not changed by this update.


Fixture amendment:
- Adelaide United v Brisbane Roar moved from GW1 to GW7.
- New fixture: Tuesday 15 December 2026, 19:30; kickoff timezone to confirm.
- GW1 results check remains Monday 19 October.
- GW7 results check moves to Wednesday 16 December.
- Review GW1/GW7 bye and double-match projections separately.

## Unbeaten / winless streak specials

- League H2H fixtures only, excluding FA Cup, ECL, median exhibitions and finals. A draw is neither a win nor a loss.
- Teams with at least one completed league game and no loss may be backed for the round of their first league loss. Teams with no win may be backed for their first league win.
- Every remaining regular-season round is an outcome. “None” means no relevant result through Round 26 for Division 1, or Round 23 for Divisions 2/3.
- All choices in a quoted team market close at the offering round's lockout, including choices for later rounds. New weekly markets use distinct offering-round IDs; existing accepted selections retain their original odds and target round.
- Forecasts use current per-fixture H2H win/loss probabilities and the probability of surviving all earlier fixtures without that event, with the ordinary 5% margin. Weekly events are treated independently for forecasting. A no-event outcome completes each book.
- Singles only; no multi combination with these specials. Existing negative own-team betting restrictions apply to a selected first-loss round or a “no win” season. Backing one's own team to remain unbeaten is positive, not a negative outcome.
- Actual completed league results provide admin result suggestions. Draws do not void a streak selection. Missing scores, unconfirmed fixtures and retrospective changes that invalidate the original eligibility require manual review; they do not trigger automatic refunds or settlement.

## ECL format confirmed 11 November 2026

Twelve entrants form three groups of four. Pot 1 (AFC Big Red Port, Silverman's XI and Fully Scicluna) fills A4/B4/C4; the remaining nine fill A1/B1/C1/A2/B2/C2/A3/B3/C3. Groups play three H2H matchdays in GW8, GW10 and GW13, with 3 points for a win, 1 for a draw and fantasy points scored as the table tiebreaker. The top two in each group qualify. Rank those six by the same criteria: the best two receive semifinal byes and the other four play quarterfinals. Quarterfinals are GW15, semifinals GW18 and the final GW20. Official matchday pairings are entered separately. Completed group winner prices publish independently; overall ECL futures pause after draw changes until recalculated from the committed draw.
