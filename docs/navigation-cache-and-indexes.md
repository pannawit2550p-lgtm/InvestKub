# Shared navigation cache and query/index audit

## Browser changes

- Home, Settings and Trade now use the same `usePortfolio` query function/key,
  60-second freshness and 15-minute retention. Removed unconditional portfolio
  refetch-on-mount and Trade's duplicate fetch implementation. Fresh cache mounts
  without fetching; stale cache remains visible while refreshing in the background.
  Foreground polling and explicit post-trade invalidation remain in place. Current
  quote refresh and submit validation were not changed.
- Profile query settings live in `src/lib/profile/client.ts`, using the existing
  `profile-settings` key (5-minute freshness, 15-minute retention). Profile edits
  still write complete saved responses into this same cache. Lesson rewards now
  invalidate it so reward metadata does not stay stale.
- The first full leaderboard page seeds `rank/viewer`; Settings can also initialize
  viewer data from a cached full leaderboard, preserving its original timestamp.
  Invalidated/old data does not get a new artificial freshness timestamp. Do not
  seed holdings/ownership from leaderboard rows: they have a different API shape
  and privacy contract. Viewer-only requests cannot invent a full leaderboard.
- Private caches are cleared on sign-out/account changes. Refreshing the token
  for the same account does not clear them. Requests support AbortSignal where
  changed here, and do not write late cancelled rank results into the viewer cache.

React Query tests cover fresh navigation with zero extra requests, stale portfolio
display plus one shared refresh for two consumers, viewer cache reuse, and avoiding
older viewer data overwriting newer data. All 105 unit tests, TypeScript and lint
passed. This is not a logged-in browser click timing measurement.

## Live read-only database observations

Three sequential REST round trips per query, local machine to configured Supabase:

| Query | Round-trip milliseconds | Rows in sample |
| --- | --- | --- |
| Stocks search Apple/APP | 538 / 184 / 188 | 19 |
| One user's holdings | 125 / 131 / 134 | 0 |
| One user's latest snapshots (limit 365) | 143 / 131 / 124 | 5 |
| One user's latest orders (limit 21) | 129 / 129 / 125 | 3 |

No private IDs or returned user records were printed. These times include network,
REST and database work, not pure SQL time. User samples are small/nonrepresentative;
do not infer database-wide capacity or slow query execution from them.

PostgREST EXPLAIN was unavailable (`PGRST107`), so live execution plans and catalog
index verification could not be obtained. No setting was changed to expose plans.
Use `supabase/diagnostics/query_performance.sql` in SQL Editor for read-only index
inventory, table statistics and EXPLAIN ANALYZE/BUFFERS. Replace its zero UUID with
your test user's ID; otherwise the user-query plans concern empty matches only.

## Prepared migration (NOT applied to live Supabase)

`supabase/migrations/0013_query_performance_indexes.sql` adds:

1. Partial US-stock GIN trigram indexes on symbol and name, matching the actual
   `symbol ILIKE 'prefix%' OR name ILIKE '%substring%'` search. Existing full-text
   name GIN is a different operator/query shape; text_pattern_ops is not the same
   case-insensitive OR search. [PostgreSQL pg_trgm documentation](https://www.postgresql.org/docs/17/pgtrgm.html)
2. Orders `(user_id, created_at DESC, id DESC)` to cover the deterministic tie-breaker.
3. Orders `(user_id, symbol, created_at DESC, id DESC)` for symbol-filtered histories.
4. Partial claimed-reward `(user_id, reward_claimed_at DESC, lesson_id DESC)` for
   the reward history and portfolio reward filter.

Five indexes in total. No indexes/data are dropped. Existing PKs on holdings,
profiles and the snapshot `(user_id, snapshot_at DESC)` index already match the
current reads, so they were not duplicated. No index on computed portfolio return
or low-cardinality visibility was added: it would not fix the JS ranking valuation
or the current all-profile visibility read. Small tables/very short searches may
still correctly use sequential scans; no speed-up is promised for every query.

SQL fixture validation using isolated PGlite: migration ran twice successfully,
all five indexes exist, search results are unchanged, and PostgreSQL selected the
two trigram indexes with BitmapOr on a 10,001-stock fixture. This is **not** proof
of the live database's plan or an applied live migration.

Next step: inspect live plans with the diagnostic SQL, then apply 0013 in SQL Editor
if appropriate. Ordinary index creation briefly blocks writes; run during a quiet
period. On large tables, build each index CONCURRENTLY as a separate statement
outside the migration's transaction, under DBA supervision. Existing shorter
order indexes are retained; review usage before removing any redundant prefix
index. No new publicly accessible SQL RPC was created.

Changed implementation files: portfolio/client, profile/client, rank/client,
Settings, Rank, Trade, lesson quiz and Providers. Added cache tests, migration,
diagnostic SQL, `scripts/test-performance-indexes.mjs` and this report.
