import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { OverviewStore } from './overview-shared';
import type { OverviewData } from './overview';

const KEY = 'us-etf-overview-v1';
function timestamp(value: string): number {
  return value === '-infinity' ? -Infinity : value === 'infinity' ? Infinity : Date.parse(value);
}
function unavailable() { return new Error('Shared overview cache unavailable; apply migration 0014_market_overview_shared.sql'); }
export function createOverviewStore(): OverviewStore {
  return {
    async read() {
      const { data, error } = await createAdminClient().from('market_overview_cache')
        .select('payload,expires_at,retry_at,failures').eq('cache_key', KEY).maybeSingle();
      if (error) throw unavailable();
      return data ? { payload: data.payload as OverviewData | null, expires: timestamp(data.expires_at),
        retryAt: timestamp(data.retry_at), failures: data.failures } : null;
    },
    async acquire(ttl) {
      const { data, error } = await createAdminClient().rpc('acquire_overview_refresh', { p_key: KEY, p_ttl_seconds: ttl / 1000 });
      if (error) throw unavailable();
      return data as string | null;
    },
    async publish(token, payload, ttl) {
      const { data, error } = await createAdminClient().rpc('publish_overview_refresh',
        { p_key: KEY, p_token: token, p_payload: payload, p_ttl_seconds: ttl / 1000 });
      if (error) throw unavailable();
      return data === true;
    },
    async fail(token) {
      const { error } = await createAdminClient().rpc('fail_overview_refresh', { p_key: KEY, p_token: token });
      if (error) throw unavailable();
    },
  };
}
