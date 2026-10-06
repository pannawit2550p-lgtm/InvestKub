# Shared overview cache and load testing

## Activation (required before deployment)

Run the complete `supabase/migrations/0014_market_overview_shared.sql` in Supabase
SQL Editor, then deploy/restart the app. The configured live project was checked
read-only: the table is **not present** (`PGRST205`). This migration has NOT been
applied remotely. The existing production server on 3001 was left unchanged.
Updated development code requires the migration; without it overview returns
503 instead of spending uncoordinated API credits. Trading and its execution
price validation are unchanged.

The migration adds a single private snapshot table and three service-role-only
RPCs. RLS and revoked anonymous/authenticated privileges prevent browser access.
No user, portfolio, or authentication data is stored in this global snapshot.
Use the same Supabase project and service-role configuration on every instance.

## Refresh behavior

- Quotes: 60s open, 5m pre/post, 15m closed. The database uses its own clock for
  lease and TTL; instance clocks must still be synchronized for display/phase.
- One atomic 120s UUID lease per overview key; stale owners cannot publish or
  clear a newer lease. A crashed owner recovers after expiry. If a provider call
  exceeds 120s, another owner may retry: this is not exactly-once under crashes.
- Winning refresh is awaited before responding, not an unreliable detached
  serverless promise. Other instances serve the last good snapshot immediately.
  Within an instance, callers share a pending promise. Cold losers poll for up
  to approximately 2s, then return retryable 503 if no snapshot is ready.
- The existing authenticated `/api/cron/refresh-market-data` warms the overview
  once per minute even when its job queue is empty. `vercel.json` already schedules
  it; verify your host actually runs that schedule. Local npm servers don't run
  cron automatically. Without cron the first request after TTL refreshes inline.
- Shared backoff: 60s, 120s, 240s, 480s, capped at 900s; stale data survives.
  Storage failure never bypasses the lease. Existing local snapshot can still
  be shown with `stale` and `refreshFailed`.
- Each healthy quote refresh is **3 Finnhub calls**, not a batch upstream API.
  Chart window metadata is shared for 15m; underlying candle cache and guards
  are retained. Chart fallback can attempt both 1D and 1M per symbol. Overview
  is only part of total quota: stock details, execution, and cron jobs also consume it.
- The 5s L1 cache and per-instance single-flight reduce shared-row reads. This is
  still a database-backed cache: at much larger deployment scale evaluate a
  dedicated Redis store using measured database load, not assumed capacity.

## Checks performed (6 October 2026)

108 unit tests, TypeScript and lint passed. Three new tests cover two-instance
concurrency, cross-instance failure backoff and no upstream access on cache failure.
The isolated PGlite test executes the actual migration twice and checks permission
restrictions, expired-owner fencing, opening-market TTL shortening and shared backoff.

`scripts/load-test-overview.mjs` starts **two loopback HTTP servers** using the real
cache coordinator and SQL functions in isolated PGlite. Upstream quotes are synthetic
with an 80ms loader delay; no real provider calls or orders are made.

| Concurrent requests | State | p50 | p95 | p99 | Errors | Synthetic quote calls |
|---|---|---:|---:|---:|---:|---:|
| 50 | Cold | 130.0ms | 136.4ms | 136.9ms | 0/50 | 3 |
| 100 | Warm | 44.8ms | 46.9ms | 47.2ms | 0/100 | 0 |
| 200 | Warm | 48.9ms | 67.3ms | 68.5ms | 0/200 | 0 |

These are short bursts, not sustained users or production capacity. They exclude
real Supabase latency, auth, Next rendering and upstream provider latency. Real
API quota use in this test: **zero**. Do not claim the app supports 200 real users
from this test alone. Test dependencies are temporary; no app dependency was added.

To repeat, point `PGLITE_MODULE` at an installed `@electric-sql/pglite/dist/index.js`,
then `node scripts/load-test-overview.mjs`.

## Real authenticated test (after migration)

### Live backend integration completed

After the user applied migration 0014, the live table was verified successfully
on 6 October 2026. No browser tabs were exposed by the connected UI inventory
and no `LOAD_TEST_COOKIE` was configured, so an authenticated Next route test
could not be run. No session was forged and no authentication code was changed.

Instead, `node scripts/load-test-overview-live.mjs --live` ran the actual
`overview-server.ts` coordinator/provider/store code in two independent Node
processes, each with its own L1 memory, against the configured **real Supabase,
Finnhub and Twelve Data**. Loopback test HTTP servers returned only public market
snapshot metadata. The `server-only` build marker is omitted only in the isolated
Node harness; application authentication routes are not compiled or modified.

Cold warm-up: HTTP 200 in **2243.7ms**, three valid symbols, 78 chart points per
symbol, `stale=false`, `refreshFailed=false`. The snapshot's provider timestamp
remained the previous US trading session, not a fabricated current timestamp.

| Concurrency | Requests | HTTP 200 | Errors | p50 | p95 | p99 |
|---|---:|---:|---:|---:|---:|---:|
| 5 | 30 | 30 | 0 | 3.8ms | 232.7ms | 233.1ms |
| 10 | 60 | 60 | 0 | 4.2ms | 8.7ms | 9.5ms |
| 20 | 100 | 100 | 0 | 8.5ms | 17.1ms | 19.2ms |

Instrumented outgoing network requests: first process Finnhub **3**, Twelve Data
**3**; second process **0 / 0**. Upstream HTTP 429 and 5xx: **0**. Shared guard
counter deltas agreed: **+3 / +3**. No trading/profile changes were made; only
normal market snapshot/candle-cache and provider quota writes occurred.

This confirms cross-process sharing with real dependencies, but **not total
website/user capacity**. These short, mostly warm bursts omit Next authentication,
frontend rendering and distinct-user database workloads. Both processes ran on
one machine. Simultaneous cold start across instances, sustained load beyond TTL,
and production-host performance remain separate checks. Existing production on
3001 was not rebuilt or restarted by this test.

The live script requires explicit `--live`, honors the existing provider guards,
does not expire/delete shared snapshots to force quota spending, and stops ramping
on errors. Subsequent runs may use an already-warm snapshot and consume no provider
credits; report that state instead of calling it another cold-start measurement.

### Authenticated route test still pending

`scripts/load-test-web.mjs` is bounded and read-only, accepts only localhost URLs,
and requires an authenticated preflight before generating traffic. It never sends
orders or prints/stores cookies. Use your test account's Cookie request header
as process environment `LOAD_TEST_COOKIE`; don't paste it into chat or commit it.
Set `LOAD_TEST_URL` to `http://localhost:3001`; start with concurrency 5 / requests
30 (defaults). Run `node scripts/load-test-web.mjs`. It reports p50/p95/p99,
status counts/error rate. Limits are 50 concurrency / 500 total requests.
When service-role configuration is available (`.env.local` or environment), it
also reports before/after deltas of the existing shared quota guard counters.
The delta excludes preflight, includes concurrent unrelated traffic, and is null
if the table is unavailable or its UTC day changes. The read-only diagnostic
`supabase/diagnostics/overview_cache_health.sql` exposes snapshot/lease/backoff
health and quota counters without printing keys or portfolio data.
Missing authentication or failed overview preflight aborts instead of benchmarking 401s.
This was **not run with a real login** because no test session was supplied.

Before estimating capacity, run production-mode tests in staging with multiple
test accounts, ramp 5 → 10 → 20, then soak across refresh boundaries for 10–15m.
Monitor application CPU/memory, Supabase connections/query latency and provider
dashboard credits/429s. Sample the existing shared quota table before/after;
remember its counter measures tokens admitted by the guard, not guaranteed
successful upstream responses. Do not reset the limiter or increase configured
quota above your subscribed plan to make a load test pass. Separate warm cache,
cold cache, refresh failure, rank, portfolio and real trade validation workloads.
Agree latency/error targets first; pause load if 429/5xx rise. Never load-test
order creation against real user portfolios.

## Files

`src/lib/market/overview-shared.ts`, `overview-store.ts`, `overview-server.ts`,
`overview-shared.test.ts`, `overview-server.test.ts`,
`src/app/api/cron/refresh-market-data/route.ts`, migration 0014,
`scripts/load-test-overview.mjs`, `scripts/load-test-web.mjs`,
`scripts/load-test-overview-live.mjs`,
`supabase/diagnostics/overview_cache_health.sql`,
`docs/market-overview.md`, and this document.
