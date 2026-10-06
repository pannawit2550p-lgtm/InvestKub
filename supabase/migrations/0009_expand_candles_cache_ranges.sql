alter table public.candles_cache
  drop constraint if exists candles_cache_range_check;

alter table public.candles_cache
  add constraint candles_cache_range_check
  check (range in ('1D', '1W', '5D', '1M', '6M', 'YTD', '1Y', '5Y'));

notify pgrst, 'reload schema';
