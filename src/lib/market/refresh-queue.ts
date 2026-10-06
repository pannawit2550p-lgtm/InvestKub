import type { SupabaseClient } from '@supabase/supabase-js';
import type { Range } from './provider';

export type RefreshKind = 'quote' | 'fundamentals' | 'candles';

export interface RefreshJob {
  id: string;
  data_type: RefreshKind;
  symbol: string;
  data_range: Range | '';
  attempts: number;
}

export async function enqueueMarketDataRefresh(
  admin: SupabaseClient,
  kind: RefreshKind,
  symbol: string,
  range: Range | '' = '',
) {
  const { error } = await admin.rpc('enqueue_market_data_refresh', {
    p_data_type: kind,
    p_symbol: symbol,
    p_range: range,
  });
  return !error;
}

export async function tryAcquireMarketDataLock(admin: SupabaseClient, key: string, leaseSeconds = 45) {
  const { data, error } = await admin.rpc('try_acquire_market_data_lock', {
    p_lock_key: key,
    p_lease_seconds: leaseSeconds,
  });
  if (!error) return data === true;
  if (error.code === 'PGRST202' || error.code === '42883' || error.message.includes('try_acquire_market_data_lock')) return null;
  throw new Error('Market data lock unavailable');
}

export async function releaseMarketDataLock(admin: SupabaseClient, key: string) {
  await admin.rpc('release_market_data_lock', { p_lock_key: key });
}
