# Admin participation restriction

Administrator accounts are for management and viewing only. They cannot place singles or multis, submit weekly/median tips, or enter preseason predictions. All accounts whose stored credentials mark them as administrators are covered.

The server-side restriction is in `supabase/admin-no-participation.sql`. It patches the installed public betting and write wrappers, preserving their existing market validation, function privileges and search paths. It checks the server-owned admin role rather than trusting the browser. It does not modify accounts, balances, accepted bets, tips, odds or results.

Betting receipt replay/recovery remains available for an already accepted request; recover-only cannot place a new bet. The admin may still settle bets, publish prices, manage results/accounts, view public tipping tables, correct other users' records and perform existing moderation operations. This restriction does not attempt to revoke the administrator's database maintenance powers.

The interface hides admin submission controls and blocks local selection/submission handlers. Published odds remain visible, and the price collector deliberately retains its normal data-pick markup so an admin refresh cannot remove ordinary player quotes.

Apply `supabase/admin-no-participation.sql` after installing/replacing the base public RPC wrappers. It is idempotent and fails if their expected layout is missing. `supabase/admin-no-participation-test.sql` uses temporary sessions inside a rolled-back transaction to verify admin betting and weekly/preseason tipping rejection, management access and ordinary validation. It never returns session tokens or persists test bets/tips/balance changes. The production restriction was installed and these tests passed on 13 November 2026 (Sydney).

Existing admin bets and tips are preserved; no entries are retrospectively voided or removed from historical tables by this change. A separate ordinary player account may participate under the normal rules.
