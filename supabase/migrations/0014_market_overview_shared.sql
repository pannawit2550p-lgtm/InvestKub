begin;
create table if not exists public.market_overview_cache (
  cache_key text primary key,
  payload jsonb,
  expires_at timestamptz not null default '-infinity',
  retry_at timestamptz not null default '-infinity',
  failures integer not null default 0,
  lease_token uuid,
  lease_until timestamptz not null default '-infinity'
);
alter table public.market_overview_cache enable row level security;
revoke all on public.market_overview_cache from public, anon, authenticated;
grant select, insert, update on public.market_overview_cache to service_role;

create or replace function public.acquire_overview_refresh(p_key text,p_ttl_seconds integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_token uuid := gen_random_uuid(); v_result uuid;
begin
  insert into public.market_overview_cache(cache_key,lease_token,lease_until)
    values(p_key,v_token,clock_timestamp()+interval '120 seconds')
  on conflict(cache_key) do update set lease_token=v_token, lease_until=clock_timestamp()+interval '120 seconds'
    where market_overview_cache.lease_until <= clock_timestamp()
      and market_overview_cache.retry_at <= clock_timestamp()
      and least(market_overview_cache.expires_at,
        to_timestamp((market_overview_cache.payload->>'fetchedAt')::double precision/1000)
          +make_interval(secs => greatest(1,least(p_ttl_seconds,900)))) <= clock_timestamp()
  returning lease_token into v_result;
  return v_result;
end $$;

create or replace function public.publish_overview_refresh(p_key text,p_token uuid,p_payload jsonb,p_ttl_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.market_overview_cache set payload=p_payload,
    expires_at=clock_timestamp()+make_interval(secs => greatest(1,least(p_ttl_seconds,900))),
    retry_at='-infinity',failures=0,lease_token=null,lease_until='-infinity'
  where cache_key=p_key and lease_token=p_token and lease_until > clock_timestamp();
  return found;
end $$;

create or replace function public.fail_overview_refresh(p_key text,p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.market_overview_cache set failures=failures+1,
    retry_at=clock_timestamp()+make_interval(secs => least(900,60*power(2,least(failures,4))::integer)),
    lease_token=null,lease_until='-infinity'
  where cache_key=p_key and lease_token=p_token and lease_until > clock_timestamp();
end $$;
revoke all on function public.acquire_overview_refresh(text,integer) from public,anon,authenticated;
revoke all on function public.publish_overview_refresh(text,uuid,jsonb,integer) from public,anon,authenticated;
revoke all on function public.fail_overview_refresh(text,uuid) from public,anon,authenticated;
grant execute on function public.acquire_overview_refresh(text,integer) to service_role;
grant execute on function public.publish_overview_refresh(text,uuid,jsonb,integer) to service_role;
grant execute on function public.fail_overview_refresh(text,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
