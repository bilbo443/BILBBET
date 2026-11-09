# Targeted deployment and weekly rollover checks — 10 November 2026

Baseline: main `54f04b3b4e0d07136d25f4e0f502757669b04a4f`; published GW4 scores and active GW5.

## Calendar corrections

The six date disagreements were traced to the generic betting-date list versus the fixture-aware schedule supplied earlier. The stored fixture schedule is now used for both client and server dates. These are internal consistency corrections using the existing source, not a fresh external verification of fixture times.

| Round | Corrected first-fixture/betting date |
|---|---|
| 9 | 26 December 2026 |
| 10 | 31 December 2026 |
| 12 | 14 January 2027 |
| 16 | 13 February 2027 |
| 21 | 2 April 2027 |
| 22 | 9 April 2027 |

- The existing 19:00 Sydney default remains for rounds after GW1. No exact kickoff times were invented. The GW1 19:55 exception remains.
- The server date map and stored results calendar now have zero mismatches. The repository check rejects future date drift.
- Expected regular league fixture counts are stored per round, derived from the official division schedule, and verified against it by CI. Update these counts with any future organiser fixture/roster change.
- Current GW5, its date and its open state are unchanged. Jarvis's future day-count projections follow the corrected dates after deployment.

## Isolated GW4 → GW5 → GW6 rehearsal

No future results were imported into the real site. Temporary copies and mocked client RPCs were used.

1. Generated deterministic synthetic GW5 scores for all 66 teams, preserving separate league/Roddy GW1 coverage.
2. Ran the real division, Roddy, FA Cup and ECL simulations before and after those scores. Every competition's forecast reacted; repeated identical inputs reproduced identical outputs.
3. Wrote shared leader checkpoints, futures and their exact league/Roddy score snapshots into a temporary draft.
4. Rehearsed publishing the four reviewed files together in the temporary copy. The published-state audit passed. A mixed score/price snapshot was rejected.
5. Exercised the actual client reward-sync/rollover/price-sync orchestration with local RPC substitutes. The payload included all 33 scored GW5 league fixtures and 66 distinct teams; synthetic server round 6 moved the view to GW6, rebuilt prices and stamped the cache only after success. Future GW6 scores remained empty.
6. Exercised the real server's pure round-completion helper with synthetic payloads and simulated check times. All 33 fixtures qualified at 12:30 Sydney on 23 November; they did not qualify at 12:29. Removing Division 3 prevented completion. No synthetic fixture was persisted.
7. Hashed every original data JSON before/after the calculation rehearsal: the rehearsal changed none of them. Drone Police carry remained 9998.87 with no credit applied.

## Additional gap found and fixed

The previous pure completion helper considered only fixtures present in the payload, so a single scored league fixture could qualify an entire round. It now requires the expected counts for each league tier, unique fixture keys, distinct participating teams and usable scores, as well as the configured final-fixture check time. Missing data and absent coverage metadata do not qualify. Explicit finalisation markers and manual round overrides remain unchanged.

The guard was installed together with the reviewed server calendar metadata in one migration. The live server still reports current round 5, completed round 4 and GW5 open. All 306 existing streak quotes remain present. No new security-advisor findings appeared.

## Checks and deployment verification

- 30 JavaScript scripts and 26 Python tests pass, including the new actual-model rehearsal, client orchestration, calendar drift and daylight-saving checks.
- Corrected GW10/GW12 dates convert to 08:00 UTC under AEDT; GW21 is 08:00 UTC and GW22 is 09:00 UTC after the AEST transition.
- SQL isolation tests cover missing divisions/scores, duplicate fixtures, repeated teams, missing metadata, the 12:30 boundary and both weeks of a split round.
- Draft conversion now closes its files properly; the rehearsal no longer emits unclosed-file warnings. Pipeline comments were corrected to describe the already-implemented whole-league integration.
- Financial acceptance, cash-out, reward claims and settlement are not performed as live-account tests. Existing isolated regression coverage remains the test boundary.

## Remaining input

Exact first-kickoff times are still needed to replace the 19:00 house rule with verified five-minutes-before-kickoff lockouts. The moved Adelaide–Brisbane match remains assigned to GW7; its 19:30 timezone (Adelaide versus Sydney) is still marked unconfirmed in the source schedule.

No balances, accepted odds, real scores, bet results, price-board values or current-round overrides were changed. The persisted changes are the reviewed calendar metadata and the pure completion guard.
