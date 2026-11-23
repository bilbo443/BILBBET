# Published results advance the round automatically

Merging reviewed score/futures updates now triggers `Sync published results and advance round`. The worker fetches only the fixed BILBBET main-branch publication. A normal public app startup also requests the same reconciliation before reading the server round; an admin session is not required. The fixture-share page remains read-only.

The source must contain matching league and Roddy score arrays, the same futures source-score manifest, all competition coverage, the correct 66-team roster, a complete official schedule and the server's season calendar. The worker derives completion from that official schedule, not stale median-only tipping fixtures. It cannot jump over an incomplete league round, declare future-dated rounds complete, regress a confirmed round, or remove a manual round override.

Only the worker can call the result-payload RPC. The Edge endpoint checks the application API key itself (new publishable keys use `apikey`, not a JWT header); gateway JWT verification is disabled for that reason. Public callers cannot submit scores, choose a URL or select a round. Worker credentials remain in Supabase's server environment. The browser has only the existing public key. Calls update the completed league result context and finalisation marker only, with no settlement/reward/payment function calls or accepted-odds changes.

Failures retain the existing server state. The workflow retries while the matching public snapshot becomes available and reports a failed run if it cannot sync. Public startup retries on the next page load. The endpoint coalesces concurrent calls and caches successful results for 15 seconds. Reviewed score publication is still required: this does not automatically merge drafts or treat an unfinished live sheet as final.

Validation covered the live public-source sync (GW5 finalised, active GW6), the full authoritative GW1 schedule despite legacy median-only server entries, source/manifest/calendar rejection, absent client write privileges, and a rolled-back real-database rehearsal advancing synthetic completed GW6 to GW7. A stale/incomplete publication could not reverse that advancement, and a manual override remained intact. No live account, bet or balance record was changed.

Server prerequisites are `supabase/automatic-published-results.sql` and the deployed `supabase/functions/sync-published-results` function. The workflow uses only the public application key already present in the app; it requires no repository server-key secret.
