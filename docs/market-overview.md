# Market overview implementation and provider probe

The real `<MarketOverview />` is below search on `/explore`. The API is
`GET /api/market/overview`, authenticated like the existing quote routes. No
browser request goes to Finnhub/Twelve Data. Existing provider quota/cooldown,
candle cache, `formatThaiDateTime`, and `getUsMarketStatus` are reused.

## Provider probe (local configured keys, 6 October 2026)

The one-off inline Node probe was not committed and did not print credentials.

| Provider / symbols | Result |
| --- | --- |
| Finnhub `^GSPC`, `^IXIC`, `^DJI` | Market data subscription required for CFD indices |
| Finnhub `SPX`, `.INX`, `IXIC`, `DJI`, `.DJI` | Zero price/previous close/timestamp; unusable |
| Finnhub `COMP` | Nonzero equity quote, **not** proof of Nasdaq Composite support; rejected to avoid symbol collision |
| Finnhub `SPY` | Quote 774.83, previous close 769.64, provider epoch seconds 1791230400 |
| Finnhub `QQQ` | Quote 756.20, previous close 749.58, same provider timestamp |
| Finnhub `DIA` | Quote 512.11, previous close 511.10, same provider timestamp |
| Twelve Data `SPX` 5min/1day | Pro/Venture subscription required |
| Twelve Data `IXIC`, `DJI` 5min/1day | Invalid/missing symbol |
| Twelve Data `SPY` 5min/1day | Successful (3-point probe); latest 2026-10-05 15:55 / 2026-10-05 |
| Twelve Data `QQQ`, `DIA` initial probe | Per-minute credits exhausted; not interpreted as missing symbol |
| Twelve Data `QQQ`, `DIA` retry in a later quota window | Both 5min/1day successful, 78 points each; latest 2026-10-05 15:55 / 2026-10-05 |

Chosen mode: **etf-proxy**. SPY represents S&P 500, QQQ represents Nasdaq-100
(not Nasdaq Composite), DIA represents Dow Jones. Large values are signed
percent changes, never ETF prices labeled as index values. The response still
contains real ETF price/previousClose for transparency. Both numerical changes
are computed once on the server from Finnhub's quote previous close. True index
UI rendering is tested with fixtures, but no production index adapter is enabled.
No new provider, paid subscription, or unofficial Yahoo/scraping is introduced.

## Cache and limits

- Shared Supabase snapshot and fenced refresh lease (migration 0014): open 60 seconds,
  pre/post 5 minutes, closed 15 minutes. A 5-second local read-through cache reduces
  database reads. The refresh winner awaits loading/publishing; other instances
  serve stale data during its lease. The authenticated minute cron also warms it.
  Failures retain timestamps and share exponential backoff from 60 seconds to 15 minutes.
- One refresh uses three Finnhub single-symbol quote calls (the existing quote
  adapter has no batch quote method), not three calls per visitor. Provider guards
  remain active. A cold snapshot has no guessed fallback: failure returns 503.
- Intraday graphs reuse existing Supabase candles cache/locks and their overview
  copies for 15 minutes. At worst a cold chart attempts 1D and then daily 1M;
  graph failures cannot discard valid quote data. Missing graphs show dashed lines.
- Intraday data is filtered to the latest exchange session, at most 78 real
  points. Daily fallback is the latest 30 closes and is visibly labeled 30 days.
- The oldest contributing provider timestamp is `asOf` in milliseconds; absent
  provider time is null, never replaced with request time. `fetchedAt` is separate.
  During pre/open/post, age over 20 minutes gets an amber warning. Overnight/weekend
  previous-session quotes are not mislabeled as live trading.
- Browser polling: 60 seconds / 5 minutes / 15 minutes, stopped in hidden tabs;
  visibility return refreshes immediately. A local minute clock updates the phase
  using the existing calendar, so closed-to-open does not await the 15-minute poll.
- Probe account observed Twelve Data limit: **8 credits/minute**. Repository guard
  default: 8/minute, 800/day for Twelve Data and 50/minute for Finnhub. These limits
  are account/configuration-dependent. Charts are not refreshed every minute.
- The shared overview row coordinates all instances using the same Supabase project.
  No provider request is permitted without its lease. Chart reuse timestamps are
  stored with the snapshot so cold instances reuse the same chart window.
  See `docs/shared-overview-load-test.md` for rollout and measured test limits.
- Existing calendar currently lists US holidays for 2026; keep it updated yearly.
- Credit is shown for both providers. Confirm your account permits public/business
  redistribution before opening access broadly; attribution alone is not a license.

## Verification

`overview.test.ts`: 50 concurrent reads => one loader invocation, cache/backoff
and stale timestamp preservation, session TTLs/holiday/weekend handling, rounded
positive/negative/zero presentation, empty/single/400-point series, delayed and
unknown timestamps. `overview-server.test.ts` verifies actual provider adapter
call counts, fallback charts and canonical changes (mocked provider boundary).

`scripts/test-market-overview-layout.mjs` renders the real React presentation in
headless Edge at 320, 360, 390, 430, 768, 1280 pixels. It checks 3 cards, no page
or text overflow, index/proxy distinction, skeleton/error/delay, empty/daily charts,
and closed status. At 320 only the card strip scrolls horizontally.

Full files are in the repository. Apply migration 0014 before deploying the new
shared cache; no extra provider key is required.

Changed/added files: `src/components/MarketOverview.tsx`,
`src/components/market-overview.css`, `src/lib/market/overview.ts`,
`src/lib/market/overview-server.ts`, `src/app/api/market/overview/route.ts`,
`src/app/(app)/explore/page.tsx`, `src/lib/market/overview.test.ts`,
`src/lib/market/overview-server.test.ts`, `scripts/test-market-overview-layout.mjs`,
`README.md`, and this document. Checks: all 99 unit tests, TypeScript, and lint
passed. Local unauthenticated smoke check: overview endpoint 401; explore redirects
to login, as expected. Authenticated API wiring was exercised with provider mocks;
live provider capability probes were separate, not a logged-in end-to-end test.
