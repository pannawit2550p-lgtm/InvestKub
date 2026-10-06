-- Read-only: run in Supabase SQL Editor AFTER migrations 0008, 0009 and 0014.
select cache_key, payload->>'fetchedAt' as fetched_at_epoch_ms,
  expires_at, retry_at, failures,
  lease_until > clock_timestamp() as refresh_in_progress,
  payload is not null as has_snapshot,
  jsonb_array_length(payload->'items') as item_count
from public.market_overview_cache;

-- Capture before/after load; quota_day is UTC. Counters include ALL app traffic.
-- tokens is persisted bucket state, not a live-refilled remaining balance.
select provider, quota_day, calls_today, tokens as stored_bucket_tokens, updated_at
from public.market_provider_tokens order by provider;
