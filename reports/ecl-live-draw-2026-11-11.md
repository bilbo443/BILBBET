# ECL live draw preparation — 11 November 2026

## Confirmed format

12 entrants, three groups of four. Pot 1 is IDs 075 (AFC Big Red Port), 069 (Silverman's XI), and 085 (Fully Scicluna). The other nine entrants are Pot 2. Draw order is A4, B4, C4, A1, B1, C1, A2, B2, C2, A3, B3, C3.

Group standings use three H2H matchdays, 3/1/0 match points and fantasy points scored as tiebreak. The top two in each group qualify. Rank those six by the same criteria: the top two advance directly to semifinals, and the other four play quarterfinals.

Matchdays are GW8, GW10 and GW13; quarterfinals GW15, semifinals GW18, final GW20. These stages do not imply official match pairings. Enter those separately when confirmed.

## During the draw

1. Open Admin → Fixtures & Draws → Live ECL draw.
2. Select the drawn team from the dropdown of remaining eligible entrants and commit it to the next displayed slot.
3. A group receives its winner-price book on the same save that completes it. Other groups may remain incomplete.
4. Public viewers open Futures → ECL → Groups. The page checks a bounded public snapshot (at most 12 group quotes) every eight seconds while visible. It does not fetch or rebuild the full price board, and unchanged polls do not redraw the page or interrupt typed stakes.
5. Corrections preserve later slots. Removing a team closes that incomplete group's old prices; accepted bets and their prices remain unchanged.

Group quotes use cup history/strength with live-form adjustment, a seeded three-matchday simulation and ordinary 5% price margin. Exact simulated table ties use seeded equal-likelihood tie resolution as forecast uncertainty; no result or settlement is inferred from it. Official matchday pairings and complete past scores are used once available; incomplete or unentered past matchdays block fresh pricing rather than invent results. Group betting closes by the third matchday's lockout and remains closed after the group stage.

## After the draw

Download `official_ecl_draw.json` from the completed draw panel and put it in `data/official_ecl_draw.json`. Run the usual odds refresh, review the ECL output, then reopen the stage markets after publishing. The export carries stable team IDs, not guessed names. Until this refresh, overall ECL stage markets are paused; completed group-winner books remain independently available.

Python forecasts respect pots and fixed/partially fixed groups. Qualifying probabilities sum to 600%, semifinal probabilities to 400%, finalist probabilities to 200% and winner probabilities to 100%. Pre-draw ECL prices were regenerated from the existing published scores with the confirmed pots; every non-ECL futures section was retained exactly.

## Backend and verification

The new admin-only `bilbbet_commit_ecl_draw` endpoint saves the draw, replaces only ECL group quotes and updates related pause controls in one transaction. It validates the 12 team IDs, pot membership, slot positions, duplicates, complete price books, no-arbitrage safety and an expected-draw concurrency check. It does not republish or remove other price books and does not write accounts, balances, accepted bets or settlements.

The endpoint was installed and tested with synthetic draw/admin records inside a rolled-back transaction. Tests checked anonymous rejection, malformed/duplicate draws, invalid pots, unsafe prices, stale edits, successful complete-group publication, removal of corrected group prices and unchanged non-ECL quotes/financial records. The temporary admin/session rolled back; no live group was entered. No new security-advisor findings were introduced.

JavaScript tests cover all draw slots, eligible pots, stable pricing, actual group scores/fixtures, missing results, published-only public rendering and failed-save preservation. Python tests cover pot constraints, committed groups, qualifier/stage counts, ID-based exports, invalid input rejection and repeatability.
