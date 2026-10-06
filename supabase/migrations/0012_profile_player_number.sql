-- Public display number only. Authentication and lookup continue using UUIDs.
begin;
lock table public.profiles in share row exclusive mode;
create sequence if not exists public.profile_player_number_seq start with 1000;
alter table public.profiles add column if not exists player_number bigint;
alter sequence public.profile_player_number_seq owned by public.profiles.player_number;
select setval('public.profile_player_number_seq', greatest(999, coalesce((select max(player_number) from public.profiles), 999), (select last_value from public.profile_player_number_seq)));
alter table public.profiles alter column player_number set default nextval('public.profile_player_number_seq');
do $$
declare v_id uuid;
begin
  for v_id in select id from public.profiles where player_number is null order by created_at, id loop
    update public.profiles set player_number = nextval('public.profile_player_number_seq') where id = v_id and player_number is null;
  end loop;
end;
$$;
alter table public.profiles alter column player_number set not null;
create unique index if not exists profiles_player_number_unique on public.profiles (player_number);
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_player_number_positive') then
    alter table public.profiles add constraint profiles_player_number_positive check (player_number > 0);
  end if;
end;
$$;
revoke all on sequence public.profile_player_number_seq from public, anon, authenticated;
grant usage, select on sequence public.profile_player_number_seq to service_role;
notify pgrst, 'reload schema';
commit;
