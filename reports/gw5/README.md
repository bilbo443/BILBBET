# GW5 score and price publication

Source: final Gameweek 5 scores supplied by the owner on 23 November 2026 (Sydney). Player counts are not substituted for scores. All 33 submitted fixtures match the current schedule; all 66 active teams appear exactly once. No ties.

Publish all four data products together: league scores, separate Roddy scores, futures and leader-after-round markets. Previous rounds, future score slots, fixtures, coefficients, team IDs, carry balances and cup result declarations are unchanged. Roddy GW1 coverage is preserved separately from league GW1.

All five division markets, Roddy, FA Cup and ECL were regenerated with the existing main-branch model and its ordinary simulation settings. Leader checkpoints come from the same run. The futures provenance manifest matches the exact new score arrays.

## GW5 score checks

| Division | Median |
| --- | ---: |
| ELIZA CUP (D1) | 85.5 |
| DIVISION 2A | 90.5 |
| DIVISION 2B | 96.5 |
| DIVISION 3A | 75.5 |
| DIVISION 3B | 88 |

Highest: BIG MAC FC — 128. Lowest: MACCA'S STARS — 39.

## Division winner price examples

| Division | Team | Previous | GW5 refresh |
| --- | --- | ---: | ---: |
| ELIZA CUP (D1) | BC UNITED ZEBRAS | 4.21 | 3.23 |
| ELIZA CUP (D1) | GIVE US WANG | 4.09 | 3.71 |
| ELIZA CUP (D1) | KALLO FC | 9.75 | 13.47 |
| DIVISION 2A | THE WAINE TRAIN | 4.49 | 3.3 |
| DIVISION 2A | ALBANIAN BOARS | 5.82 | 4.6 |
| DIVISION 2A | AFC BIG RED PORT | 9.04 | 6.61 |
| DIVISION 2B | THE GARUCCI-SHOW | 3.43 | 3.24 |
| DIVISION 2B | SILVERMAN'S XI | 5.83 | 4.32 |
| DIVISION 2B | SPOONERS FC | 5.3 | 5.63 |
| DIVISION 3A | E/MELB SUCCULENT CHINESE MEAL | 4.88 | 3.18 |
| DIVISION 3A | SK STURM MELBOURNE | 17.54 | 6.64 |
| DIVISION 3A | SABITEURS | 3.96 | 8.06 |
| DIVISION 3B | CONCEICAO | 7.63 | 3.69 |
| DIVISION 3B | FOR VUCK'S SAKE FC | 8.71 | 3.76 |
| DIVISION 3B | AARONGURDWOODREICH | 3.64 | 7.73 |

## Validation and next step

- Published-state checker passes: five conferences, official schedules, market identity/coverage, leader endpoints and current cup survivor field.
- Exact GW5 inputs validated; GW1–4 and GW6–26 unchanged in both score tables.
- Drone Police source carry remains 9,998.87; it must not be credited again.
- No database writes, account changes, settlements, cash-outs or balance changes were performed.
- After merging and deployment, reload Bilbbet and sign in as admin once so the existing results/reward context and trusted price board can sync. Automatic round progression is driven by that backend sync; merely publishing JSON does not itself update backend state. Review settlement suggestions before settling bets.
