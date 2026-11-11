# ECL draw sheet calculator

The complete installer is [BilbbetEcl.gs.txt](BilbbetEcl.gs.txt). It reads the owner's existing draw and displays decimal prices below the qualified teams table. It does not connect to the Bilbbet database or publish the draw.

| Group | Read four rows, one team per row |
| --- | --- |
| A | ECL!U9:Y12 |
| B | ECL!Z9:AD12 |
| C | ECL!AE9:AI12 |

Rows 9–12 correspond to positions 1–4. Position 4 must contain a Pot 1 team. Each row may have a merged name cell and blank crest cells. Only exact current names or unambiguous registry aliases are accepted, ignoring case and repeated whitespace. Numeric cells and embedded images are ignored. Do not put extra text inside these input blocks.

## Owner installation

1. Open the original spreadsheet as an editor. Choose **Extensions → Apps Script**.
2. Add a **new script file** named `BilbbetEcl`. Keep existing scripts. Paste the entire contents of `BilbbetEcl.gs.txt` and save.
3. Select `BILBBET_ECL_INSTALL` in the editor and run it once. Authorize spreadsheet access. It creates a `Bilbbet ECL` menu and its own edit/open triggers without removing existing triggers. One owner should install the triggers.
4. On Bilbbet, open **Futures → ECL → Groups → Download ECL calculator data**. Use a fresh schema 2 JSON download.
5. Back in the spreadsheet, choose **Bilbbet ECL → Import current calculator data**, then select the downloaded JSON. No Drive sharing or API key is needed.
6. Enter/paste names during the draw as usual. Each completed group updates automatically. Incomplete groups display no prices. Invalid names, duplicate entrants or incorrect pots clear the panel's prices and show an error. Correct the draw or choose **Recalculate odds** to retry.

Output is confined to **ECL!AM65:AS89**. The installer refuses an initially occupied or merged output area. It marks this panel as its own and replaces its contents on refresh. Do not put other content there after installation. Other qualification tables, draw inputs and existing scripts are preserved. The hidden `_BilbbetEclModel` tab stores the public snapshot in chunks. Keep that tab intact.

Typing/pasting by the owner triggers calculation. Formula changes or other scripts/API writes do not fire the edit trigger: choose **Recalculate odds** in that case. The owner should test with four valid names and then remove one to check prices disappear before the live draw. The actual owner sheet still requires this installation and test.

## Price meaning and refresh

Each group displays **Win group** and **Qualify top 2**. Both use the same three-matchday simulation (GW8, 10, 13), 3/1/0 league points and fantasy points scored as the table tiebreak. Unresolved equal table records are split randomly in the forecast. These are group-stage forecasts, not individual match H2H or knockout advancement prices.

The calculator uses current cup histories/shifts, variance widening, shared ID-based strength tiers and complete-round scoring form, with Bilbbet's ordinary 5% margin and price caps. It runs the same deterministic winner simulation as Bilbbet and counts the top two in the same simulation. A 1001 price can reflect the price cap or zero sampled successes, not mathematical impossibility. Suspended prices are shown as text.

The timestamp is the **model download time**, not a promise of a live connection. Import a new download before the draw and after new scores/model changes. Identical snapshot and draw inputs reproduce identical prices. Prices on the site and sheet match only when both use identical model inputs, current round and official fixtures. Changing the spreadsheet does not change Bilbbet's live groups; the admin must commit the official draw on Bilbbet separately.

Source modules: `js/ecl-draw.js`, `js/ecl-sheet-model.js`, `sheets/owner-wrapper.gs`. Rebuild the complete installer with `node sheets/build-ecl-installer.cjs` after changing any source module.
