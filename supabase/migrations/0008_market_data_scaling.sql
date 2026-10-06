create table if not exists public.market_provider_tokens (
  provider text primary key check (provider in ('finnhub', 'twelvedata')),
  tokens numeric(12, 4) not null,
  updated_at timestamptz not null default now()
);
alter table public.market_provider_tokens enable row level security;
revoke all on public.market_provider_tokens from anon, authenticated;

create or replace function public.consume_market_provider_token(
  p_provider text,
  p_capacity numeric,
  p_refill_per_second numeric
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_tokens numeric;
  v_updated_at timestamptz;
begin
  if p_provider not in ('finnhub', 'twelvedata') or p_capacity < 1 or p_refill_per_second <= 0 then
    return false;
  end if;

  insert into public.market_provider_tokens (provider, tokens, updated_at)
  values (p_provider, p_capacity, v_now)
  on conflict (provider) do nothing;

  select bucket.tokens, bucket.updated_at
    into v_tokens, v_updated_at
  from public.market_provider_tokens as bucket
  where bucket.provider = p_provider
  for update;

  v_tokens := least(p_capacity, v_tokens + greatest(0, extract(epoch from (v_now - v_updated_at))) * p_refill_per_second);
  if v_tokens < 1 then
    update public.market_provider_tokens set tokens = v_tokens, updated_at = v_now where provider = p_provider;
    return false;
  end if;

  update public.market_provider_tokens set tokens = v_tokens - 1, updated_at = v_now where provider = p_provider;
  return true;
end;
$$;

create table if not exists public.market_data_refresh_queue (
  id uuid primary key default gen_random_uuid(),
  data_type text not null check (data_type in ('quote', 'fundamentals', 'candles')),
  symbol text not null check (symbol ~ '^[A-Z0-9.-]{1,12}$'),
  range text not null default '',
  requested_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  lease_until timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error_code text,
  constraint market_data_refresh_range_check check (
    (data_type = 'candles' and range in ('1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y'))
    or (data_type <> 'candles' and range = '')
  ),
  unique (data_type, symbol, range)
);
create index if not exists market_data_refresh_available_idx
  on public.market_data_refresh_queue (available_at, requested_at);
alter table public.market_data_refresh_queue enable row level security;
revoke all on public.market_data_refresh_queue from anon, authenticated;

create or replace function public.enqueue_market_data_refresh(
  p_data_type text,
  p_symbol text,
  p_range text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.market_data_refresh_queue (data_type, symbol, range)
  values (p_data_type, upper(btrim(p_symbol)), coalesce(p_range, ''))
  on conflict (data_type, symbol, range) do nothing;
end;
$$;

create table if not exists public.market_data_refresh_locks (
  lock_key text primary key,
  lease_until timestamptz not null
);
alter table public.market_data_refresh_locks enable row level security;
revoke all on public.market_data_refresh_locks from anon, authenticated;

create or replace function public.try_acquire_market_data_lock(p_lock_key text, p_lease_seconds integer default 45)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acquired boolean := false;
  v_now timestamptz := clock_timestamp();
begin
  if p_lock_key is null or length(p_lock_key) > 160 or p_lease_seconds not between 5 and 300 then
    return false;
  end if;

  insert into public.market_data_refresh_locks (lock_key, lease_until)
  values (p_lock_key, v_now + make_interval(secs => p_lease_seconds))
  on conflict (lock_key) do update
    set lease_until = excluded.lease_until
    where public.market_data_refresh_locks.lease_until <= v_now
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$$;

create or replace function public.release_market_data_lock(p_lock_key text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.market_data_refresh_locks where lock_key = p_lock_key;
$$;

create or replace function public.claim_market_data_refresh_jobs(p_limit integer default 20)
returns table(id uuid, data_type text, symbol text, data_range text, attempts integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select job.id
    from public.market_data_refresh_queue as job
    where job.available_at <= clock_timestamp()
      and (job.lease_until is null or job.lease_until < clock_timestamp())
    order by job.requested_at asc
    limit greatest(1, least(coalesce(p_limit, 20), 50))
    for update skip locked
  )
  update public.market_data_refresh_queue as job
  set lease_until = clock_timestamp() + interval '2 minutes',
      attempts = job.attempts + 1
  from candidates
  where job.id = candidates.id
  returning job.id, job.data_type, job.symbol, job.range, job.attempts;
end;
$$;

create or replace function public.finish_market_data_refresh_job(
  p_job_id uuid,
  p_success boolean,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts integer;
begin
  if p_success then
    delete from public.market_data_refresh_queue where id = p_job_id;
    return;
  end if;

  select attempts into v_attempts from public.market_data_refresh_queue where id = p_job_id;
  if not found then return; end if;

  update public.market_data_refresh_queue
  set lease_until = null,
      available_at = clock_timestamp() + make_interval(secs => least(3600, 15 * power(2, least(v_attempts, 8))::integer)),
      last_error_code = left(coalesce(p_error_code, 'PROVIDER_ERROR'), 80),
      attempts = case when v_attempts >= 12 then 0 else v_attempts end
  where id = p_job_id;
end;
$$;

revoke all on function public.consume_market_provider_token(text, numeric, numeric) from public, anon, authenticated;
revoke all on function public.enqueue_market_data_refresh(text, text, text) from public, anon, authenticated;
revoke all on function public.try_acquire_market_data_lock(text, integer) from public, anon, authenticated;
revoke all on function public.release_market_data_lock(text) from public, anon, authenticated;
revoke all on function public.claim_market_data_refresh_jobs(integer) from public, anon, authenticated;
revoke all on function public.finish_market_data_refresh_job(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.consume_market_provider_token(text, numeric, numeric) to service_role;
grant execute on function public.enqueue_market_data_refresh(text, text, text) to service_role;
grant execute on function public.try_acquire_market_data_lock(text, integer) to service_role;
grant execute on function public.release_market_data_lock(text) to service_role;
grant execute on function public.claim_market_data_refresh_jobs(integer) to service_role;
grant execute on function public.finish_market_data_refresh_job(uuid, boolean, text) to service_role;

notify pgrst, 'reload schema';
