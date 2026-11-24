# Conclusive futures in the admin review queue

After confirmed published results, pending futures with a conclusive outcome join **Admin → Bets → Resolve outstanding bets**. Each leg shows WON/LOST and its mathematical or elimination reason. Existing confirmation buttons remain the only settlement path. No automatic settlement, refund, cash-out or balance change is introduced.

Checks run again on each render after the weekly results/reward sync and when the admin queue is opened. The full published score snapshot must match the futures provenance; unsynced local edits, a manually advanced round or forecast prices cannot by themselves establish a result. Dates and complete published round scores gate result use. There is no new database write path.

## Supported conclusions

- All divisions: regular-season title, top/miss-top positions, half-table positions, bottom three, wooden spoon and applicable relegation. Validate the full confirmed regular-season fixture list first. League points bound the best/worst attainable finish; equal possible points remain undecided. On a fully played table, fantasy points scored provide the existing tiebreak; equal cutoff records remain pending.
- Promotion: a guaranteed automatic place is WON; mathematical exclusion from a confirmed finals field is LOST. Otherwise pending, since a finals path still exists. Unknown finals field sizes are never assumed.
- FA Cup: use official per-match winners verified against published decisive results, with the existing organiser-confirmed preliminary exception. A later elimination cannot erase an already reached stage. Partial round winners are handled individually. A tied original fixture needs its official replay and a decisive final replay result plus confirmed stage winner; null/conflicting winners stay pending.
- ECL: complete official three-matchday pairings establish group winner/top-two bounds. Group elimination loses subsequent advancement/winner bets. Actual decisive knockout fixtures establish later advancement/elimination; semi-final byes are not guessed from group standings.
- Roddy: use the final complete score table. No declared maximum weekly fantasy score exists, so a low forecast or 1001 price never proves an early mathematical elimination.
- Multis: one confirmed losing leg suggests an overall loss; a winning suggestion requires all legs WON/VOID. Suggestions still require admin confirmation through existing server settlement controls.

## Verification

`node tests/futures-settlement.test.cjs` exhaustively compares small-table early bounds against possible remaining points and covers cutoff ties, negative markets, promotion paths, missing/unconfirmed data, partial cup rounds, replay handling, conflicting results, previously reached stages, ECL groups and multi aggregation. Against the current GW5 publication the integration identified 49 eliminated cup teams, retained all 17 remaining contenders and left both GW8 replay participants pending. It did not suggest any premature division champions.

This is conservative grading assistance, not an exhaustive solver of every correlated remaining-fixture scenario. Some logically settled cases may remain pending for manual review; uncertain cases must never be guessed. It deliberately excludes inferred fantasy-score ceilings, unconfirmed promotion/finals outcomes, and unresolved tiebreak rules.
