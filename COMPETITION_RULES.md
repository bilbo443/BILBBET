Competition rules and roster-dependent provisions
2026-27 Division 3 change
Division 4 is not planned. The roster stays in Division 3A and 3B while
these grow toward 16 teams each, then can split into A/B/C. Once the roster
is frozen on October 9, a three-conference layout must have 12-20 teams in
each conference. The team count and assignments come from the registry;
there is no static total in the frontend or roster validator.
The existing two-conference promotion market retains six places. In the
three-conference simulation, the champion of each conference receives one
automatic place. The next four from each conference compete in three linked
brackets, with one promoted winner per bracket, retaining six total. The
three-bracket format is based on the previously documented hypothetical
three-conference implementation. Confirm it against the competition's
actual approved rule before publishing or settling promotion markets.
Division 3C receives the same bottom-three finish market and no relegation
market as 3A and 3B. The site's weekly tipping sections combine all current
Division 3 conferences. Round 1 Mr Median uses the combined Division 3
score median, calculated only once all current teams have scores.
FA Cup entrant threshold
At 62 or fewer entrants, the existing Round of 64 path remains. Above 62,
the simulator draws an extra Preliminary Round. For 63/64 entrants it has
one match; above 64 it has one match per entrant above 64. Nonparticipants
receive byes. Winners fill the Round of 64; where Round of 64 byes remain,
they are allocated preferentially to the previous Roddy finishers named in
`roster_format.py`. The draw is deterministic from a configurable seed and
saved as a draft for review. A field above 128 requires another round and
fails validation.
The extra round's calendar week is unconfirmed. Until set in
`roster_rules.json`, it does not automatically open tipping or betting.
Actual FA Cup fixtures and official bye awards take precedence over the
simulated draw. The archived two-conference and 62-team rules in the
original documentation describe the historical format, not this new plan.
