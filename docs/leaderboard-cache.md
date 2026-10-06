# Leaderboard snapshot cache

The server shares a single internal portfolio/ranking snapshot through Next.js
14 Data Cache (`unstable_cache`), tagged `leaderboard-snapshot-v1`. Both
`/api/rank` (including viewer-only requests and pagination) and
`/api/rank/[publicId]` use it. The valuation formulas and sorting are unchanged.

- Revalidation interval: 60 seconds (`LEADERBOARD_CACHE_SECONDS`). This is
  demand-driven stale-while-revalidate, not a scheduled refresh. A request can
  receive the previous snapshot while Next refreshes it in the background.
- Concurrent snapshot reads are coalesced within each server process.
- Trades and lesson rewards do not invalidate the entire ranking on each write:
  their effects appear on the next snapshot refresh. Trade execution still uses
  its original current-price validation and never this ranking cache.
- Name, visibility, and avatar changes invalidate the snapshot tag after a
  successful profile write.
- Every response performs a fresh, lightweight read of profile IDs/public IDs
  and visibility. Hidden/deleted players are removed and ranks renumbered before
  pagination or detail lookup. A failed permission read fails closed. This read
  intentionally is not cached, even though it still grows with player count.
- Viewer identity/ownership is computed per request, outside the shared cache.
  Public responses retain the explicit field allowlist and have
  `Cache-Control: private, no-store`. Signed avatar URLs are generated outside
  the snapshot cache with their existing one-hour lifetime.

No SQL migration, API key, or new package is required. The existing browser
ranking query still refreshes every two minutes; the 60-second interval applies
to the server snapshot, not a promise that the screen updates every minute.

For self-hosting multiple instances, configure a shared Next Data Cache/cache
handler before assuming snapshots or tag invalidations are shared across hosts.
The local single-flight guard does not provide a distributed computation lock.
This change reduces repeated valuation work; it is not a capacity guarantee or
a replacement for load testing.

Verification: `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint`.
Tests cover shared snapshots across viewers/pages/details, per-viewer isolation,
immediate privacy filtering, tag invalidation, retry after errors, and avoiding
mutations to the shared snapshot. The Next Data Cache runtime itself is supplied
by the deployment; unit tests mock that boundary.
