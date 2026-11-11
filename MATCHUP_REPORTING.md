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

## Season and cup context

Fixture summaries include table/Roddy positions in team order. Expanded profiles
show Roddy totals and deficit to first as well as FA Cup/ECL participation and
confirmed fixtures in the selected GW. Cup fixture notes are factual context;
there is no assumption that extra fixtures cause distraction or lower scoring.
Guaranteed notes remain above same-GW cup fixtures and indicative race notes.

From GW16, with complete scores through at least GW15, a Roddy title-hunt flag
requires a deficit of no more than five points per remaining round and a last-five
scoring average within five points of the leader's last-five average. It targets
winning the Roddy, not paid/top-three/top-ten finishes. The needed gain is explicitly
to draw level with first, not a prediction or a promise of winning. Joint leaders
are labelled as such. Missing rounds or a future fixture viewed before GW16 do not
enable the indicator. Roddy uses its full 26-round season, independently of shorter
regular league schedules.

League race tags start at GW16. The default title band is nine league points;
automatic-promotion, relegation, finals and explicitly configured ECL cutoffs use
six league points. Each also checks the confirmed remaining fixtures and omits
mathematically unreachable or already-secured races. Settled regular-season facts
can be shown once the complete final table proves them, with unresolved exact
ties left out. Finals qualification is a historical regular-table fact, not a
claim that a side has survived subsequent knockout rounds. Unknown finals cutoffs
are not inferred from old cross-conference rules. Thresholds are editable under
`roster_rules.json.matchup_reporting` and disclosed beside the indicators.

FA Cup membership uses the official entry draw, explicit stage winners and
completed knockout fixtures. Confirmed advancement overrides provisional scores;
an unresolved draw remains pending through its replay. ECL entrants are resolved
by internal ID. Group exits use actual official group fixtures, points and
score-for, with unresolved qualification ties left pending. Early exits are shown
only when two opponents already exceed the side's maximum available group points.
Knockout losses require confirmed fixtures and actual past scores. Future-dated
scores do not resolve results. Competition, group and calendar changes invalidate
the context cache without changing prices or writing data.
