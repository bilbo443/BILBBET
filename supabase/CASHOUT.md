# Cash out for ordinary singles

Install `cashout-singles.sql` in Supabase SQL Editor before deploying the app change. It creates a private offer table and two session-authenticated RPCs, preserves existing function permissions, and leaves cash out disabled.

After deploying the app, sign in as admin once to publish the current price board. The new app fingerprint triggers this once. The board needs a current round and a publication timestamp. No existing bets are changed by installation.

Enable only after checking the My Bets confirmation flow:

```sql
UPDATE bilbbet_private.settings SET value='true'::jsonb WHERE key='cashout_enabled';
```

Disable without changing accepted cash outs:

```sql
UPDATE bilbbet_private.settings SET value='false'::jsonb WHERE key='cashout_enabled';
```

A pending single can request a 30-second server offer. Multis, boosted/featured selections and flagged bonus/free bets are excluded. Cash out also requires the exact selection on the current trusted board, a publication less than eight days old, and an open, unpaused market. It is suspended from the current round's scheduled start, including deliberate betting reopens, until the round advances and a new board is published. This conservative rule applies to futures too. The scheduled cutoff follows existing server round dates and 19:00 Sydney default; GW1 retains its explicit 19:55 cutoff.

Current win probability is inferred as `1 / (lowest current ordinary decimal price × 1.05)`. The offer is 95% of this probability times the accepted potential return, capped at that return and floored to cents. This is an implied-probability estimate from rounded prices, rather than a new simulation. For 400 potential return at a current price of 2.00, the cash out is 180.95 clams. If the underlying probability were exactly 50%, the corresponding fair-value calculation would be 190 clams.

The database locks the account and bet in the same order as placement/settlement, checks ownership, offer expiry, unchanged quote and lockout again, then atomically credits the balance, records one transaction and marks CASHED_OUT. Retrying the same accepted offer returns its receipt without another credit. Original stake, accepted price, selections and potential return remain in the bet. Cashed-out bets cannot be settled or reset through settlement RPCs. Carry and manual credit markers are untouched. My Bets shows the paid amount and includes cash-out profit/loss in settled net. Archives retain separate cash-out counts, returns and stakes.

`cashout-singles-test.sql` uses synthetic records and a temporary actor function inside a transaction ending in ROLLBACK. It checks valuation, excluded bets, ownership, stale/changed/expired offers, lockout, pause, one credit on retry, history retention and settlement rejection. Execute it only as a complete script, after installing the server functions. No real punter's bet needs to be cashed out for testing.

The cash-out status remains final. Any exceptional manual correction should be a separately audited balance adjustment, not resetting the bet for another payout.
