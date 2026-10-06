# PaperTrade

PaperTrade is a mobile-first stock-trading simulator. It uses virtual cash only, has no payments or prizes, and is not investment advice.

## Local setup

1. Install Node.js 20+ and npm.
2. Create a Supabase project and run every file in `supabase/migrations` in numeric order, including the latest migration `0009_expand_candles_cache_ranges.sql`.
3. Copy `.env.example` to `.env.local` and fill in Supabase, Finnhub, Twelve Data, and cron values.
4. Configure email/password and Google OAuth in Supabase Auth.
5. Run `npm install`, then `npm run dev`.

The app is available at `http://localhost:3000`.

## Market overview

The investment page shows SPY/QQQ/DIA ETF percentage changes as market references,
not true index values, using the existing Finnhub and Twelve Data keys. No extra
configuration or SQL migration is required. See [provider probe, cache intervals,
and limitations](docs/market-overview.md). In particular, QQQ refers to Nasdaq-100,
not Nasdaq Composite; graphs refresh more slowly to conserve API credits.

## Checks

```bash
npm run lint
npm run typecheck
npm test
```

## API limits and provider notes

- `/api/quotes` accepts at most 50 symbols per request.
- Quotes, fundamentals, and candles are cached in Supabase and coalesced in memory. With migration `0008_market_data_scaling.sql`, a shared database token bucket enforces provider-wide quotas across app instances; stale data is served immediately and refreshed by `/api/cron/refresh-market-data`, while simultaneous cold-cache misses share a distributed lock so only one request calls the provider.
- Set `FINNHUB_CALLS_PER_MINUTE` and `TWELVEDATA_CALLS_PER_MINUTE` to or below the per-minute limits of the corresponding provider plans. Defaults are 50 each; do not raise them above your account quota.
- Quotes cache for 15 seconds while the US market is open and 10 minutes when closed. Fundamentals cache for 24 hours. Candle TTLs are 60 seconds for 1D, 10 minutes for 5D, and 6 hours for longer ranges.
- Provider free-tier limits vary by account and can change. API keys never reach the browser.
- Cron endpoints require `Authorization: Bearer <CRON_SECRET>`.
- `/api/cron/sync-logos` fills missing US stock logos from Finnhub in batches of up to 20; it is scheduled every 5 minutes in `vercel.json`.
- Thai equities, mutual funds and gold are available as simulated PaperTrade assets. Their catalog prices are local simulated values; the account remains virtual and uses the configured USD/THB conversion rate for cash accounting. Mutual funds and gold use market orders only, while Thai equities support the existing limit-order flow.
- Closed-market limit orders are processed by `/api/cron/process-limit-orders` every 5 minutes on weekdays and opportunistically whenever an authenticated user loads their order list. A buy fills at or below its limit; a sell fills at or above its limit. Unmatched orders expire 24 hours after the next US market open.
