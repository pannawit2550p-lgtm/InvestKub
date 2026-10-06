# Decisions

- PaperTrade supports live-provider US equities plus simulated Thai equities, mutual funds and gold. The non-US catalog is intentionally simulated until dedicated market providers are configured.
- US market hours use America/New_York Monday-Friday 09:30-16:00 and intentionally ignore exchange holidays.
- Finnhub supplies quotes, fundamentals, and symbols; Twelve Data supplies candles. Provider calls are server-only.
- If provider credentials are absent, the UI still renders cached/database data and reports a clear configuration error for live refreshes.
- The cron snapshot schedule is intentionally 21:30 UTC on weekdays; it is not assumed to equal exactly 16:00 ET across DST seasons.
- Amount orders use six-decimal fractional shares. Money authority remains in Postgres numeric columns and the atomic trade function.
- The initial stock seed is populated by the weekly sync route rather than duplicated in the migration.
- Provider docs were checked on 2026-10-04: Finnhub's REST contract uses quote fields `c/d/dp/o/h/l/pc`, `/stock/metric?metric=all` exposes the basic-financial metrics used here, and `/stock/profile2` supplies company profile data. Finnhub also documents HTTP 429 on exceeded limits and a 30-requests/second ceiling; account-plan limits still apply (https://finnhub.io/docs/api, https://finnhub.io/api/v1/stock/metric).
- Twelve Data's `/time_series` uses `symbol`, `interval`, and `outputsize`, with timestamps in the instrument's local exchange timezone by default. The Basic individual plan currently lists 8 API credits/minute and 800/day, so the app's 50 calls/minute in-memory limiter is only a local guard; Supabase caching and symbol de-duplication remain the real quota protection (https://twelvedata.com/docs, https://twelvedata.com/pricing).
- The local verification environment has no Supabase project or provider credentials, so live signup, OAuth, RLS execution, cron calls, and provider responses are covered by the migration/API code but not executed end-to-end here. Apply the migration and set `.env.local` before running those flows.
- Closed-market orders use standard limit semantics: buys match when the simulated execution price is less than or equal to the limit, and sells match when it is greater than or equal to the limit. Their 24-hour validity window starts at the next calculated US market open. Cash and shares are validated when the order is placed but are not reserved; the atomic trade function validates them again at execution and records a failed status if they are no longer available.
- Pending limit orders are processed every five minutes by a cron route and opportunistically when the owner loads the order list. The existing MVP market calendar still ignores US exchange holidays.
