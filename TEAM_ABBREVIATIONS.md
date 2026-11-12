# Club abbreviations

Approved three-character display labels live in `js/team-abbreviations.js`, keyed by permanent internal team ID. The mapping covers all 66 active clubs and includes the user's 17 corrections. Codes must be unique across the entire field, not only within a division.

## Where they appear

- H2H matchup context: recent league outcomes now identify opponents, such as `W vs BCU`.
- Team profile results: compact opponent labels.
- H2H division tabs: an expandable season fixture calendar shows compact pairings. Only rounds marked confirmed in the published roster rules reveal their pairings. Provisional schedules remain hidden.
- Custom matchup CSV: row and column headings use the approved codes. A separate abbreviation-key CSV and expandable full-name key are available beside the export button. Existing timestamp, price sources, calculation, row/column orientation and unavailable-market labels are retained.

On-screen club codes are buttons with full-name titles and accessible labels. Tapping opens the existing form popup, whose heading uses the full team name.

## Identity and betting

Codes are display labels only. Canonical team names and IDs still drive market IDs, model inputs, published prices, bet slips, receipts, accepted odds, account records and settlement. Main fixture betting rows, team selectors, futures selections, public share graphics and the owner's ECL sheet are unchanged in this first rollout.

Current registry names take precedence over historical aliases. Ambiguous aliases and unknown clubs retain their full names rather than being guessed. A known ID keeps its approved code through a rename; review that code if the new branding makes it unsuitable. A newly added ID needs an explicit approved code; until then its full name is displayed. The matrix refuses duplicate labels.

Run `node tests/team-abbreviations.test.cjs` after changes. Both public entry pages load the module before the app. The service worker includes it in the static shell only; result and registry JSON remain uncached.
