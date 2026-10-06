alter table public.profiles
  alter column cash_balance type numeric(18, 6) using cash_balance::numeric(18, 6),
  alter column starting_balance type numeric(18, 6) using starting_balance::numeric(18, 6),
  alter column cash_balance set default 2976.190476,
  alter column starting_balance set default 2976.190476;

update public.limit_orders
set status = 'cancelled',
    failure_code = 'PORTFOLIO_RESET',
    failure_message = 'ยกเลิกเนื่องจากปรับเงินเริ่มต้นของพอร์ต',
    updated_at = now()
where status in ('pending', 'processing');

delete from public.holdings;

update public.profiles
set starting_balance = 2976.190476,
    cash_balance = 2976.190476 + coalesce(reward_balance, 0),
    realized_pl = 0,
    current_session_id = gen_random_uuid(),
    session_started_at = now();

insert into public.portfolio_snapshots (
  user_id, portfolio_session_id, snapshot_date, portfolio_value, total_pl_pct
)
select id,
       current_session_id,
       current_date,
       starting_balance + coalesce(reward_balance, 0),
       0
from public.profiles;
