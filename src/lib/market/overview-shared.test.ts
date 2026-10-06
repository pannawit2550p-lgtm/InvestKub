import { describe, expect, it } from 'vitest';
import { createSharedOverviewCache, type OverviewSnapshot, type OverviewStore } from './overview-shared';
import type { OverviewData } from './overview';

function fixture() {
  let time = 1_000_000; let record: OverviewSnapshot | null = null; let locked = false; let calls = 0;
  const store: OverviewStore = {
    read: async () => record,
    acquire: async () => { if (locked || (record && record.retryAt > time)) return null; locked = true; return 'lease'; },
    publish: async (_, payload, ttl) => { record = { payload, expires: time + ttl, retryAt: 0, failures: 0 }; locked = false; return true; },
    fail: async () => { record = { payload: record?.payload ?? null, expires: 0, retryAt: time + 60_000, failures: 1 }; locked = false; },
  };
  const load = async (): Promise<OverviewData> => {
    calls++; await new Promise((resolve) => setTimeout(resolve, 10));
    return { asOf: time, fetchedAt: time, session: 'open', isDelayed: false, delayMinutes: 0,
      mode: 'etf-proxy', stale: false, refreshFailed: false, items: [] };
  };
  return { store, load, now: () => time, advance: () => { time += 61_000; }, calls: () => calls };
}
describe('cross-instance overview cache', () => {
  it('200 concurrent readers across two cold instances share one refresh', async () => {
    const f = fixture(); const a = createSharedOverviewCache(f.store, f.load, () => 'open', f.now);
    const b = createSharedOverviewCache(f.store, f.load, () => 'open', f.now);
    const values = await Promise.all(Array.from({ length: 200 }, (_, i) => (i % 2 ? a : b)()));
    expect(f.calls()).toBe(1); expect(values.every((v) => v.fetchedAt === f.now())).toBe(true);
    f.advance(); await Promise.all([a(), b()]); expect(f.calls()).toBe(2);
  });
  it('shares failure backoff and serves last good data on another cold instance', async () => {
    const f = fixture(); await createSharedOverviewCache(f.store, f.load, () => 'open', f.now)(); f.advance();
    let failedCalls = 0; const bad = async () => { failedCalls++; throw new Error('429'); };
    const a = createSharedOverviewCache(f.store, bad, () => 'open', f.now);
    expect((await a()).refreshFailed).toBe(true);
    const b = createSharedOverviewCache(f.store, bad, () => 'open', f.now);
    expect((await b()).stale).toBe(true); expect(failedCalls).toBe(1);
  });
  it('does not call the provider if shared storage is unavailable', async () => {
    const f = fixture(); let called = false;
    const read = createSharedOverviewCache({ ...f.store, read: async () => { throw new Error('missing SQL'); } },
      async () => { called = true; return f.load(); }, () => 'open');
    await expect(read()).rejects.toThrow('missing SQL'); expect(called).toBe(false);
  });
});
