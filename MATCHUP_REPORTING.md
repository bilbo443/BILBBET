# Objective matchup reporting

The fixture list shows at most two selected notes. Expanded markets add recent
league results, completed fantasy scores, recent/season means, division-median
performance and league/Roddy positions. Reports do not change odds or write data.

Notes prioritise provable outcome consequences, then results/scoring anomalies,
form contrasts, ladder proximity, opponent scoring strength and consistency.
An aggregate winning record is never treated as evidence of strong scoring by
itself. League results and fantasy scoring rounds are labelled separately.

Only complete division scoring rounds before the selected fixture/current round
are used. Median equals are separate from beats. Ladder results require complete,
confirmed league fixture rounds. Roddy ranks require whole-league scoring coverage.
Previous meetings are described as recorded history, not proof of a first-ever game.

Guaranteed outcomes require the complete confirmed regular-season schedule and
complete earlier results. Conservative best/worst points bounds treat all unresolved
points ties against the claim. Future score-for tie-breaks are never guessed.
Already-secured outcomes are not advertised again as newly secured by the fixture.
Automatic promotion uses the confirmed conference allocation; it never claims a
finals-winner promotion from regular-table position alone. Division 3 finals places
use the confirmed eight-team conference field. Relegation places match the existing
four D1 / three D2 rules. Regular schedules end at GW26 for D1 and GW23 for D2/D3.

ECL qualification claims stay off unless an explicit current-season rule exists in
`roster_rules.json` under `matchup_ecl_qualification[division]`, with `season`,
`confirmed: true` and integer `places`. The existing ECL field is a previous-season
qualification list and must not be reused as this season's qualification rule.
Some guaranteed outcomes may be omitted when conservative bounds cannot prove them.

Reporting thresholds are selective: at least three relevant games for form stories;
ladder neighbours within two places/three points; marked ladder gaps at least half
a conference and nine points; all-three narrow wins/losses by no more than five
points each; strong opponent scoring margins of at least eight points; score-range
contrasts need four rounds. These describe facts and do not produce value ratings.

The cache includes source scores, fixtures, historical records, roster rules and
the current reporting cutoff. Price collection skips reporting entirely. The new
script is loaded before app.js on both public pages and cached with the app shell.
