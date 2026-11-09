# Bilbbet process sweep — 10 November 2026

Baseline: main `5e3bed011b5c933aa45c6215287bf1573eb01b7d`, with published GW4 scores and GW5 betting.

## Findings fixed

| Issue | Correction |
|---|---|
| Median/interim-win selections were omitted from the shared round parser | Their real round now participates in the client past-round/lockout checks. Server controls remain authoritative. |
| Home cup features called league-only totals “Roddy positions” | Use the separate Roddy table, including GW1, restricted to complete prior rounds. |
| FA Cup opened on an already-completed stage | Open the winner market while available; fall back to another available market or fixtures. Show remaining entrants and next confirmed fixture. |
| Price-sync failure could prevent results/reward context from syncing | Results sync first. Retain the old price board on failure and explain the price failure separately. A price failure no longer masks an already-completed rollover. |
| Weekly review drafts did not reliably stage their exact new league scores | Stage league and Roddy score inputs alongside futures/leader prices, verify their provenance, and list the four publication files in the PR. |
| Cash-out regression test used an outdated renderer setup | Supply the shared label helper so the actual cancellation, duplicate-click, confirmation and return tests run again. |

## Coverage and evidence

| Area | Result |
|---|---|
| Division 1 | 14 teams; official fixture membership valid; futures and final-table leader market agree. |
| Division 2A / 2B | 12 teams each; GW2–23 membership valid; no invented regular fixtures in finals weeks. |
| Division 3A / 3B | 14 teams each; confirmed allocation, fixture membership and all market team fields agree. |
| Roddy | All 66 active teams in each market and leader checkpoint; separate score provenance checked. |
| FA Cup | 17 survivors, including both teams awaiting the GW8 replay; eliminated teams absent from futures. Completed stages remain closed. |
| ECL | 12 confirmed entrants; futures present. Unannounced groups/fixtures are correctly absent. |
| Live futures | All 945 published season-futures quotes match the generated source snapshot. |
| Future league H2H | Both win selections present for all 648 remaining confirmed fixtures. |
| Price-book consistency | 1,658 grouped live books checked; no guaranteed-profit book found. No invalid active price found. Non-bettable promotion tipping rows deliberately excluded. |
| Round/reward context | Server and price round both 5; all 33 GW4 league fixtures scored in reward context. |
| Public navigation | Home, all futures competitions, all H2H divisions, custom matchup, cups, playoffs, weekly tipping divisions, Specials, Stats and logged-out My Bets opened in the live browser. |
| Automated checks | 20 JavaScript regression scripts and 22 Python tests passed; JavaScript syntax and published-state audit passed. |

## Ongoing checks

`python pipeline/check_published_state.py` is read-only and checks score provenance, conference membership, fixtures, market fields, active prices, final-table leader/winner agreement and cup survivors. GitHub Actions now runs it alongside regression tests on relevant main pushes, pull requests and manual dispatch.

Weekly refresh PRs remain review drafts. Merging a draft alone is not live publication. Publish the reviewed league scores, Roddy scores, futures and leader checkpoints together, then refresh admin prices. This sweep does not automatically publish new models or alter prices.

## Limits and outstanding organiser inputs

- Live logged-in submission, reward claiming, cash-out acceptance and settlement were not executed against real accounts. These paths were tested in isolation; no bets, balances, PINs or accepted odds were changed.
- ECL group assignments, later cup draws, the GW8 replay outcome and finals fixtures still need official input when available.
- Promotion betting remains suspended; tipping slots are available under the agreed rules.
- The check establishes consistency with the latest published GW4 snapshot; it does not certify every subjective strength assumption or guarantee future hosting availability.
- No source team IDs or Drone Police manual carry correction were changed.

## Deployment-cache follow-up

The live browser continued loading old code after a successful Pages deployment. The service worker comment promised shell-only caching, but its fetch handler intercepted every same-origin GET, including score JSON. Restrict it to a shell allowlist, revalidate shell requests against the network, clear only older Bilbbet shell caches, and never intercept data requests. Data-file loads also revalidate on their first attempt. A hard refresh may be required once to replace the old worker; subsequent reloads use the corrected policy. Added cache-behaviour regression checks; model data and prices remain unchanged.

The HTML startup references are versioned to help existing browsers replace the older app and service worker. One earlier pending `LEADAT|ELIZA CUP (D1)|2|STAIRWAY TO EVANS` bet remains an admin review/settlement item; this sweep did not resolve it.
