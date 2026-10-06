alter table public.profiles
  add column if not exists reward_balance numeric(18,2) not null default 0;

alter table public.profiles
  drop constraint if exists profiles_reward_balance_check;
alter table public.profiles
  add constraint profiles_reward_balance_check check (reward_balance >= 0);

alter table public.lesson_progress
  add column if not exists read_at timestamptz,
  add column if not exists passed boolean not null default false,
  add column if not exists best_score integer not null default 0,
  add column if not exists attempts integer not null default 0,
  add column if not exists reward_claimed_at timestamptz,
  add column if not exists reward_amount numeric(18,2);

alter table public.lesson_progress
  drop constraint if exists lesson_progress_best_score_check;
alter table public.lesson_progress
  add constraint lesson_progress_best_score_check check (best_score between 0 and 4);
alter table public.lesson_progress
  drop constraint if exists lesson_progress_attempts_check;
alter table public.lesson_progress
  add constraint lesson_progress_attempts_check check (attempts >= 0);

-- Keep every legacy row, and copy its completion state to the canonical lesson key.
insert into public.lesson_progress (
  user_id, lesson_id, completed_at, read_at, passed, best_score, attempts,
  reward_claimed_at, reward_amount
)
select user_id,
  case lesson_id
    when 'stock-basics' then 'what-is-stock'
    when 'index' then 'what-is-index'
    when 'eps' then 'what-is-eps'
    when 'pe' then 'what-is-pe'
    when 'dividend' then 'what-is-dividend'
    when 'orders' then 'market-vs-limit'
    else lesson_id
  end,
  completed_at, completed_at, true, 0, 0, null, null
from public.lesson_progress
where lesson_id in ('stock-basics', 'index', 'eps', 'pe', 'dividend', 'orders')
on conflict (user_id, lesson_id) do update set
  completed_at = least(public.lesson_progress.completed_at, excluded.completed_at),
  read_at = coalesce(public.lesson_progress.read_at, excluded.read_at),
  passed = public.lesson_progress.passed or excluded.passed;

update public.lesson_progress
set read_at = coalesce(read_at, completed_at),
    passed = true
where lesson_id in ('diversification', 'risk-discipline')
  and completed_at is not null;

revoke insert, update on table public.lesson_progress from authenticated;

create or replace function public.mark_lesson_read(p_user_id uuid, p_lesson_id text)
returns public.lesson_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  v_progress public.lesson_progress;
begin
  if p_lesson_id not in (
    'what-is-stock', 'what-is-index', 'what-is-eps', 'what-is-pe',
    'what-is-dividend', 'diversification', 'market-vs-limit', 'risk-discipline'
  ) then
    raise exception using errcode = 'P0001', message = 'LESSON_NOT_FOUND';
  end if;
  insert into public.lesson_progress (user_id, lesson_id, completed_at, read_at)
  values (p_user_id, p_lesson_id, now(), now())
  on conflict (user_id, lesson_id) do update
    set read_at = coalesce(public.lesson_progress.read_at, now())
  returning * into v_progress;
  return v_progress;
end;
$$;

create or replace function public.record_lesson_attempt(p_user_id uuid, p_lesson_id text, p_score integer, p_passed boolean)
returns public.lesson_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  v_progress public.lesson_progress;
begin
  if p_lesson_id not in (
    'what-is-stock', 'what-is-index', 'what-is-eps', 'what-is-pe',
    'what-is-dividend', 'diversification', 'market-vs-limit', 'risk-discipline'
  ) then
    raise exception using errcode = 'P0001', message = 'LESSON_NOT_FOUND';
  end if;
  if p_score is null or p_score < 0 or p_score > 4 then
    raise exception using errcode = 'P0001', message = 'INVALID_SCORE';
  end if;
  insert into public.lesson_progress (user_id, lesson_id, completed_at, read_at, passed, best_score, attempts)
  values (p_user_id, p_lesson_id, now(), now(), p_passed, p_score, 1)
  on conflict (user_id, lesson_id) do update set
    completed_at = case when p_passed then now() else public.lesson_progress.completed_at end,
    read_at = coalesce(public.lesson_progress.read_at, now()),
    passed = public.lesson_progress.passed or p_passed,
    best_score = greatest(public.lesson_progress.best_score, excluded.best_score),
    attempts = public.lesson_progress.attempts + 1
  returning * into v_progress;
  return v_progress;
end;
$$;

create or replace function public.claim_lesson_reward(p_user_id uuid, p_lesson_id text, p_reward_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_progress public.lesson_progress;
  v_claimed_at timestamptz;
begin
  if p_reward_amount is null or p_reward_amount <= 0 then
    raise exception using errcode = 'P0001', message = 'INVALID_REWARD';
  end if;
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'PROFILE_NOT_FOUND'; end if;
  select * into v_progress from public.lesson_progress
    where user_id = p_user_id and lesson_id = p_lesson_id for update;
  if not found or not v_progress.passed or v_progress.best_score < 3 then
    raise exception using errcode = 'P0001', message = 'LESSON_NOT_PASSED';
  end if;
  if v_progress.reward_claimed_at is not null then
    return jsonb_build_object(
      'paid', false,
      'already_claimed', true,
      'reward_amount', v_progress.reward_amount,
      'cash_balance', v_profile.cash_balance,
      'reward_balance', v_profile.reward_balance
    );
  end if;
  v_claimed_at := now();
  update public.lesson_progress
    set reward_claimed_at = v_claimed_at, reward_amount = p_reward_amount
    where user_id = p_user_id and lesson_id = p_lesson_id;
  update public.profiles
    set cash_balance = cash_balance + p_reward_amount,
        reward_balance = reward_balance + p_reward_amount
    where id = p_user_id
    returning * into v_profile;
  return jsonb_build_object(
    'paid', true,
    'already_claimed', false,
    'reward_amount', p_reward_amount,
    'cash_balance', v_profile.cash_balance,
    'reward_balance', v_profile.reward_balance,
    'reward_claimed_at', v_claimed_at
  );
end;
$$;

create or replace function public.reset_portfolio(p_user_id uuid)
returns public.profiles
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'PROFILE_NOT_FOUND'; end if;
  delete from public.holdings where user_id = p_user_id;
  update public.profiles
    set cash_balance = starting_balance + reward_balance,
        realized_pl = 0,
        reset_count = reset_count + 1,
        current_session_id = gen_random_uuid(),
        session_started_at = now()
    where id = p_user_id returning * into v_profile;
  insert into public.portfolio_snapshots (user_id, portfolio_session_id, snapshot_date, portfolio_value, total_pl_pct)
  values (p_user_id, v_profile.current_session_id, current_date, v_profile.starting_balance + v_profile.reward_balance, 0);
  return v_profile;
end;
$$;

revoke all on function public.mark_lesson_read(uuid, text) from public, anon, authenticated;
revoke all on function public.record_lesson_attempt(uuid, text, integer, boolean) from public, anon, authenticated;
revoke all on function public.claim_lesson_reward(uuid, text, numeric) from public, anon, authenticated;
revoke all on function public.reset_portfolio(uuid) from public, anon, authenticated;
grant execute on function public.mark_lesson_read(uuid, text) to service_role;
grant execute on function public.record_lesson_attempt(uuid, text, integer, boolean) to service_role;
grant execute on function public.claim_lesson_reward(uuid, text, numeric) to service_role;
grant execute on function public.reset_portfolio(uuid) to service_role;

notify pgrst, 'reload schema';
