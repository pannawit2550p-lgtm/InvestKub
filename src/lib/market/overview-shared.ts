import { overviewInterval, type OverviewData } from './overview';
import type { MarketPhase } from './hours';

export interface OverviewSnapshot { payload: OverviewData | null; expires: number; retryAt: number; failures: number }
export interface OverviewStore {
  read(): Promise<OverviewSnapshot | null>;
  acquire(ttl: number): Promise<string | null>;
  publish(token: string, data: OverviewData, ttl: number): Promise<boolean>;
  fail(token: string): Promise<void>;
}

/** Each refresh is awaited: safe even when a serverless request freezes after returning. */
export function createSharedOverviewCache(store: OverviewStore,
  load: (previous: OverviewData | null) => Promise<OverviewData>, phase: () => MarketPhase, now = Date.now) {
  let local: OverviewSnapshot | null = null;
  let checkedAt = -Infinity;
  let pending: Promise<OverviewData> | undefined;
  const present = (record: OverviewSnapshot, unavailable = false): OverviewData => {
    if (!record.payload) throw new Error('Market overview warming up or temporarily unavailable');
    const value = record.payload; const session = phase();
    const delayMinutes = value.asOf === null ? null : Math.max(0, Math.floor((now() - value.asOf) / 60_000));
    return { ...value, session, delayMinutes,
      isDelayed: session !== 'closed' && (delayMinutes === null || delayMinutes > 20),
      stale: unavailable || now() >= Math.min(record.expires, value.fetchedAt + overviewInterval(session)),
      refreshFailed: unavailable || record.failures > 0 };
  };
  async function read() {
    if (local?.payload && now() - checkedAt < 5_000 &&
      now() < Math.min(local.expires, local.payload.fetchedAt + overviewInterval(phase()))) return present(local);
    try { local = await store.read(); checkedAt = now(); }
    catch (error) { if (local?.payload) return present(local, true); throw error; }
    if (local && now() < local.retryAt) return present(local);
    if (local?.payload && !present(local).stale) return present(local);
    // No provider call without the shared lease, including when SQL is missing.
    let token: string | null;
    try { token = await store.acquire(overviewInterval(phase())); }
    catch (error) { if (local?.payload) return present(local, true); throw error; }
    if (!token) {
      // Other instances serve the last good snapshot immediately during refresh.
      if (local?.payload) return present(local);
      for (let attempt = 0; attempt < 20; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const record = await store.read();
        if (record?.payload) { local = record; checkedAt = now(); return present(record); }
      }
      throw new Error('Market overview warming up; retry later');
    }
    try {
      const data = await load(local?.payload ?? null);
      if (!await store.publish(token, data, overviewInterval(phase()))) throw new Error('Overview lease expired');
      local = { payload: data, expires: now() + overviewInterval(phase()), retryAt: 0, failures: 0 };
      checkedAt = now(); return present(local);
    } catch (error) {
      try { await store.fail(token); local = await store.read(); checkedAt = now(); }
      catch { if (local?.payload) return present(local, true); throw error; }
      if (local?.payload) return present(local);
      throw error;
    }
  }
  return () => {
    if (!pending) pending = read().finally(() => { pending = undefined; });
    return pending;
  };
}
