alter table public.quotes_cache
  add column if not exists provider_updated_at timestamptz;
