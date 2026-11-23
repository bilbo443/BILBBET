# Published division fixture betting

The server previously exempted only the separate Division 1 schedule from the preseason fixture hold. Missing legacy announcement switches therefore blocked confirmed Division 2 and Division 3 matches every week.

The server now checks exact published official pairs by round, in either order, for all divisions. All 754 confirmed season fixtures are seeded from main's h2h_schedule.json and confirmed_division_fixture_rounds. The service-only published-results sync refreshes this list from its validated fixed GitHub source, so no weekly admin toggle is required. Unknown fixtures still fail the check; existing round lockout, trusted-price, suspension and account controls remain in force.

Installed and tested on 23 November 2026. Read-only SQL regression assertions cover every pair in both orders, unknown pairs, self-pairs and round boundaries. No real test bets, settlements or balance changes.
