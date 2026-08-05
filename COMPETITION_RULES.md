# Eliza Cup Competition Rules -- As Currently Implemented

Everything below was extracted directly from the actual working code
(not recalled from memory), specifically so this reflects what the
platform genuinely does, not what anyone assumes it does. Anywhere
I'm inferring rather than quoting a confirmed rule is marked clearly.

## Division structure

| Division | Format | Teams |
|---|---|---|
| Eliza Cup (Division 1) | Single table | 14 |
| Division 2 | Two conferences (2A, 2B) | 12 + 12 = 24 |
| Division 3 | Two conferences (3A, 3B) | 12 + 12 = 24 |

62 teams total. Division 1 is a single ladder; Divisions 2 and 3 each
split into two separate conferences that run their own home-and-away
season, then feed a shared promotion structure (below).

## Promotion

### Division 2 -> Division 1
- **Automatic**: 1st place in each conference (2 teams total)
- **Playoff pool**: 2nd-5th place in each conference (8 teams total)
- **Playoff format**: below
- **Total promoted**: 4 teams

### Division 3 -> Division 2
- **Automatic**: 1st AND 2nd place in each conference (4 teams total)
- **Playoff pool**: 3rd-6th place in each conference (8 teams total)
- **Playoff format**: below
- **Total promoted**: 6 teams

### The playoff format (identical structure for both Division 2 and 3)

The 8-team playoff pool is drawn from the two conferences equally (4
from each), split into two brackets of 4. The two brackets are not
fully independent: Preliminary Final winners swap brackets before
the Promotion Final, so each bracket's eventual promoted team can
come from either side. 2 teams get promoted in total, on top of the
automatic slots above.

**Seeding is by conference position, paired across conferences** --
each conference's own 4 playoff-eligible finishers are numbered
Seed 1 (best) through Seed 4 (worst) within that conference. Bracket
1 draws Conference A's Seed 1 and Seed 3, plus Conference B's Seed 2
and Seed 4; Bracket 2 is the mirror -- Conference B's Seed 1 and
Seed 3, plus Conference A's Seed 2 and Seed 4.

**Week 1:**

| Bracket | Qualifying Final | Elimination Final |
|---|---|---|
| Bracket 1 | QF1: A Seed 1 vs B Seed 2 | EF1: A Seed 4 vs B Seed 3 |
| Bracket 2 | QF2: B Seed 1 vs A Seed 2 | EF2: B Seed 4 vs A Seed 3 |

**Correcting a regression**: an earlier version of this document had
this table backwards (Bracket 1's EF listed as B Seed 4 vs A Seed 3,
Bracket 2's as A Seed 4 vs B Seed 3) -- the reverse of what's shown
here. That happened when simplifying out the redundant Elimination-
Final swap: the simplification itself was correct, but the bracket
assignment underneath it accidentally reverted to the pre-correction
pairing in the process, undoing an earlier confirmed fix rather than
just removing the extra cross-over step. Caught via direct correction
and fixed in both the document and the simulation code.

QF winner advances straight to a Promotion Final slot (a bye) with
the QF loser dropping to a Preliminary Final; EF winner also
advances to a Preliminary Final, EF loser is eliminated outright.

**Week 2 -- Preliminary Finals.** Each bracket runs its own, with no
swap at this stage:

| Match | Teams | Loser |
|---|---|---|
| PF1 | QF1 loser vs EF1 winner (own bracket) | Eliminated |
| PF2 | QF2 loser vs EF2 winner (own bracket) | Eliminated |

**Week 3 -- Promotion Finals.** This is the one cross-over in the
whole format -- Preliminary Final winners swap brackets here:

| Final | Teams | Result |
|---|---|---|
| Bracket 1 Promotion Final | QF1 winner (bye) vs **PF2** winner | Winner promoted, loser eliminated |
| Bracket 2 Promotion Final | QF2 winner (bye) vs **PF1** winner | Winner promoted, loser eliminated |

An earlier version of this document also had the Elimination Final
winners swap brackets before the Preliminary Final (a second,
separate cross-over at Week 2) -- simplified out per direct
feedback. Verified this genuinely doesn't change anything before
removing it: ran 500,000 simulations of each version against
identical, fixed team strengths, and the resulting promotion
probabilities for every team matched to within random noise (under
0.3%, with no consistent direction). The extra swap was adding
complexity without changing the outcome, not a shortcut that
happened to also work.

For Division 2 that's 2A/2B; for Division 3, the identical logic
applies to 3A/3B, just with the playoff pool being conference
positions 3-6 instead of 2-5 (since Division 3's top 2 per
conference are already automatically promoted, not just the top 1).

**The promotion-market simulation code has been updated to match this
exact structure.** Verified two ways: traced deterministic scenarios
by hand (including one with a top-seed upset, to check loser-tracking
specifically) and confirmed the code's actual output matched exactly;
then ran the full simulation against real Division 2 data and
confirmed promotion probabilities summed to exactly 400% across 24
teams -- the correct total for "4 teams promoted every simulation."

## Relegation

| Division | Relegated | To |
|---|---|---|
| Eliza Cup (D1) | 4 teams | Division 2 |
| Division 2A | 3 teams | Division 3 |
| Division 2B | 3 teams | Division 3 |
| Division 3A / 3B | **No relegation** -- bottom-3 finish market instead | n/a |

The counts are internally consistent with the promotion structure
above: D1 receives 4 from Division 2 and relegates 4 to stay at 14;
Division 2 receives 6 total from Division 3 (3 per conference) and
relegates 6 total to stay at 12 per conference. Division 3 has
nowhere lower to send teams, so there's no relegation market for it
at all -- a "finished in the bottom 3" market exists instead, purely
descriptive rather than consequential.

## Charity promotions -- a separate, non-standard mechanism

Confirmed as deliberately excluded from all of the above: the
simulation code explicitly does not model these, with the comment
"they only exist to backfill unpredictable departures, and per
instruction never resolve a standard promotion bet." A dedicated
script (`build_charity.py`) handles this separately from the main
promotion pipeline.

**Trigger**: any team deciding not to return, at any point -- there's
no minimum threshold or shortfall size that has to be reached first.
A single departure triggers a single backfill attempt; the mechanism
scales with however many teams leave in a given cycle (e.g. if 20
teams left Division 2 in one go, all 20 spots would be filled from
Division 3's near-miss pool, not just some capped number of them).

**A division only actually runs short if its own backfill pool is
exhausted** -- i.e. if the division below doesn't have enough
eligible near-miss teams left to fill every vacated spot. Charity
promotion is the default, always-attempted response to a departure,
not a last resort reserved for large-scale shortfalls.

**Source pool**: teams who had the highest divisional finish in
their season without actually achieving promotion -- i.e. the best-
placed non-promoted teams from the division below the gap that needs
filling, drawn from a maintained table of these near-misses rather
than decided fresh each time.

**Tiebreaker**: when the division in question has conferences (so
the near-miss candidates come from two separate ladders that can't
be directly compared on table position alone), the team with the
higher Roddy score wins the tie -- the Roddy being the one metric
that's genuinely comparable across conferences, since it's not tied
to either conference's own separate table.

## Hypothetical: a 3-conference division

Explicitly speculative -- not because a 3rd conference is planned,
but because it's a genuinely useful hypothetical to work through.
Confirmed and validated, not just described in the abstract.

**Auto-promotion**: only conference winners auto-promote here, one
per conference -- 3 automatic slots total. This is a real change from
both existing patterns (Division 2's 1-per-conference and Division
3's 2-per-conference), specific to this hypothetical.

**Seeding**: unchanged from the confirmed format -- conference
positions 2-5 (Seed 1 through Seed 4 within each conference).

**Three brackets, one per conference-pair rotation**: A/B, B/C, C/A.
Each conference contributes 4 playoff-eligible seeds -- 3 conferences
x 4 seeds = 12 total playoff-eligible teams, dividing evenly into
three 4-team brackets with no leftover teams. Each bracket is set up
exactly like the confirmed 2-conference format:

| Bracket | Qualifying Final | Elimination Final |
|---|---|---|
| Bracket 1 (A/B) | QF1: A1 vs B2 | EF1: A4 vs B3 |
| Bracket 2 (B/C) | QF2: B1 vs C2 | EF2: B4 vs C3 |
| Bracket 3 (C/A) | QF3: C1 vs A2 | EF3: C4 vs A3 |

Every conference's 4 seeds are used exactly once across the three
brackets (e.g. Conference A contributes Seed 1 + Seed 3 to Bracket 1,
and Seed 2 + Seed 4 to Bracket 3).

**Preliminary Finals**: each bracket's own, no swap -- PF1 = QF1
loser vs EF1 winner, and so on for PF2 and PF3. Matches the
simplification confirmed for the 2-conference format.

**Promotion Finals -- a 3-way rotation, not a mutual swap**: PF1's
winner goes to Bracket 2's Promotion Final, PF2's winner goes to
Bracket 3's, PF3's winner goes to Bracket 1's:

| Final | Teams |
|---|---|
| Bracket 1 Promotion Final | QF1 winner (bye) vs **PF3** winner |
| Bracket 2 Promotion Final | QF2 winner (bye) vs **PF1** winner |
| Bracket 3 Promotion Final | QF3 winner (bye) vs **PF2** winner |

**Promotion count**: 3 automatic + 3 playoff brackets = **6 promoted
total**.

**Verified, not just designed**: traced a fully deterministic 8-team
scenario by hand and confirmed the code's actual output matched
exactly. Separately, ran the complete pipeline end-to-end against
real team data (conference-season simulation through to final
promotion counts, 3,000 simulated seasons) split into three synthetic
groups of 8, and confirmed: all 24 teams accounted for, promotion
probability summed to exactly 600% (the correct total for "6 teams
promoted every simulation"), and no team was ever promoted through
two brackets in the same simulated season.

**Implemented in code** as `simulate_promotion_playoffs_3conf` --
not wired into the live pipeline automatically, since no 3-conference
division currently exists, but ready to call directly if one does.

## Hypothetical: Division 4 format variants

Also explicitly speculative, revisiting the open question from the
readiness-check discussion (is Division 4 a real competitive tier or
a pure holding pen) with a few concrete shapes it could take, rather
than leaving it as a single open question with no options attached.

### Variant A: Pure holding pen, no ladder stakes at all

No promotion, no relegation, no playoff, arguably no betting markets
at all -- just a place excess players sit until a Division 3 spot
opens up next season. Matches the "waitlist" framing most literally.
Lowest implementation cost by far, since most of the readiness
checklist's Division-4-specific items (playoff structure, market
filtering) simply wouldn't apply.

### Variant B: Genuine bottom tier, with real relegation feeding it

Division 4 becomes a real, bettable division with its own table and
a path up to Division 3 (via the same auto+playoff structure, or a
simplified version of it). Unlike the original framing of this
variant, this now includes Division 3 gaining a genuine relegation
market -- **if this variant is chosen, Division 3's current "no
relegation, bottom-3 market instead" rule would need to change to an
actual relegation market**, sending teams down to Division 4, the
same way Division 2 relegates to Division 3 today. That's a real
implementation item, not just a Division 4 addition -- Division 3's
existing rule and market structure would need updating too.

### Variant C: Full symmetry with Division 2/3

Division 4 gets conferences, promotion, and its own bottom-market
(matching Division 3's "no relegation, bottom-3 market" pattern),
fully mirroring the existing structure one tier further down. Highest
implementation cost of the three, and the one most worth checking
against actual team-count viability first -- a 4th tier with its own
two conferences needs enough total teams to make two genuine,
separate conferences meaningful, not just a formality.

**Not resolved here, deliberately** -- these are presented as the
range of shapes worth choosing between when the decision is actually
made, not a recommendation for which one is right.

## Open items

1. ~~Should "no relegation, bottom-3 market instead" be described
   this precisely somewhere player-facing?~~ **Resolved -- no change
   needed, current status stands.**
2. ~~Bracket composition and seeding~~ **Resolved and simplified.**
   Full Week 1-3 structure confirmed, including the Seed 3 (not
   Seed 5) numbering correction -- and per direct feedback, an
   earlier double-swap version was simplified down to a single
   cross-over at the Promotion Final stage, verified via 500,000
   simulations to produce statistically identical promotion odds to
   the more complex version.
3. ~~Promotion-market simulation code update~~ **Done**, and later
   simplified to match item 2's correction. `simulate_promotion_playoffs`
   now implements the confirmed single-cross-over structure. Verified
   via hand-traced deterministic scenarios (including a top-seed
   upset, to check loser-tracking specifically) matching the code's
   actual output, and a full run against real Division 2 data
   confirming promotion probabilities summed to exactly 400% across
   24 teams.
4. ~~Charity promotion's trigger threshold~~ **Resolved -- any
   departure triggers an attempted backfill, no threshold or cap, a
   division only runs genuinely short if the pool below it is
   exhausted.**
5. ~~3-conference hypothetical~~ **Fully specified and implemented**
   (not just explored as options) -- see above for the confirmed
   structure, and `simulate_promotion_playoffs_3conf` in the code for
   the implementation, verified against a 3,000-run synthetic test.
6. **Not actioned yet, direction narrowed**: likely Variant A or B
   for Division 4, not a final decision yet. If Variant B is chosen,
   Division 3 will need an actual relegation market implemented
   (currently has none -- see Variant B above), not just a Division 4
   addition on its own.
7. ~~Document needs a permanent home~~ **Committed** -- see below.
