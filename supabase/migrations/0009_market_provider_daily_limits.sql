alter table public.market_provider_tokens
  add column if not exists quota_day date not null default (timezone('utc', now())::date),
  add column if not exists calls_today integer not null default 0 check (calls_today >= 0);

create or replace function public.consume_market_provider_token_with_daily_limit(
  p_provider text,
  p_capacity numeric,
  p_refill_per_second numeric,
  p_daily_capacity integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_today date := (clock_timestamp() at time zone 'UTC')::date;
  v_tokens numeric;
  v_updated_at timestamptz;
  v_quota_day date;
  v_calls_today integer;
begin
  if p_provider not in ('finnhub', 'twelvedata')
    or p_capacity < 1
    or p_refill_per_second <= 0
    or p_daily_capacity < 1 then
    return false;
  end if;

  insert into public.market_provider_tokens (provider, tokens, updated_at, quota_day, calls_today)
  values (p_provider, p_capacity, v_now, v_today, 0)
  on conflict (provider) do nothing;

  select bucket.tokens, bucket.updated_at, bucket.quota_day, bucket.calls_today
    into v_tokens, v_updated_at, v_quota_day, v_calls_today
  from public.market_provider_tokens as bucket
  where bucket.provider = p_provider
  for update;

  if v_quota_day <> v_today then
    v_quota_day := v_today;
    v_calls_today := 0;
  end if;

  v_tokens := least(p_capacity, v_tokens + greatest(0, extract(epoch from (v_now - v_updated_at))) * p_refill_per_second);
  if v_tokens < 1 or v_calls_today >= p_daily_capacity then
    update public.market_provider_tokens
      set tokens = v_tokens, updated_at = v_now, quota_day = v_quota_day, calls_today = v_calls_today
      where provider = p_provider;
    return false;
  end if;

  update public.market_provider_tokens
    set tokens = v_tokens - 1, updated_at = v_now, quota_day = v_quota_day, calls_today = v_calls_today + 1
    where provider = p_provider;
  return true;
end;
$$;

revoke all on function public.consume_market_provider_token_with_daily_limit(text, numeric, numeric, integer) from public, anon, authenticated;
grant execute on function public.consume_market_provider_token_with_daily_limit(text, numeric, numeric, integer) to service_role;

notify pgrst, 'reload schema';
