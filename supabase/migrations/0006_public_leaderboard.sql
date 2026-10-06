alter table public.profiles
  add column if not exists public_id uuid,
  add column if not exists display_name_custom boolean not null default false,
  add column if not exists leaderboard_visible boolean not null default true;

update public.profiles
set public_id = gen_random_uuid()
where public_id is null;

alter table public.profiles
  alter column public_id set default gen_random_uuid(),
  alter column public_id set not null;

create unique index if not exists profiles_public_id_uidx
  on public.profiles (public_id);

-- Existing accounts whose names came from email prefixes are converted to a stable,
-- non-identifying fallback name. Explicit profile names remain unchanged if valid.
update public.profiles p
set display_name_custom = case
  when lower(btrim(p.display_name)) = 'trader' then false
  when coalesce(u.email, '') <> ''
    and lower(btrim(p.display_name)) = lower(split_part(u.email, '@', 1)) then false
  when position('@' in p.display_name) > 0 then false
  when char_length(btrim(p.display_name)) not between 3 and 20 then false
  when p.display_name ~ '[[:cntrl:]]' then false
  else true
end
from auth.users u
where u.id = p.id;

update public.profiles
set display_name = 'ผู้เล่น ' || lpad(right(regexp_replace(public_id::text, '[^0-9]', '', 'g'), 4), 4, '0')
where not display_name_custom;

update public.profiles
set display_name = btrim(display_name)
where display_name_custom;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_custom_display_name_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_custom_display_name_check
      check (not display_name_custom or (
        char_length(display_name) between 3 and 20
        and position('@' in display_name) = 0
        and display_name !~ '[[:cntrl:]]'
      ));
  end if;
end;
$$;

-- Profile changes go through the authenticated server endpoint, which validates names
-- and only updates the current user's row.
revoke update (display_name) on table public.profiles from authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
  v_public_id uuid := gen_random_uuid();
  v_name text := btrim(regexp_replace(coalesce(new.raw_user_meta_data->>'display_name', ''), '[[:cntrl:]]', '', 'g'));
  v_custom boolean;
begin
  v_custom := char_length(v_name) between 3 and 20
    and position('@' in v_name) = 0
    and lower(v_name) <> 'trader';

  if not v_custom then
    v_name := 'ผู้เล่น ' || lpad(right(regexp_replace(v_public_id::text, '[^0-9]', '', 'g'), 4), 4, '0');
  end if;

  insert into public.profiles (id, public_id, display_name, display_name_custom)
  values (new.id, v_public_id, v_name, v_custom)
  returning * into v_profile;

  insert into public.portfolio_snapshots (user_id, portfolio_session_id, snapshot_date, portfolio_value, total_pl_pct)
  values (v_profile.id, v_profile.current_session_id, current_date, v_profile.starting_balance, 0);
  return new;
end;
$$;

notify pgrst, 'reload schema';
