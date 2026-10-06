drop function if exists public.reset_portfolio(uuid);

alter table public.profiles
  drop column if exists reset_count;

notify pgrst, 'reload schema';
