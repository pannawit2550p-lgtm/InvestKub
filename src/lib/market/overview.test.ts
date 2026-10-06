import { describe, expect, it, vi } from 'vitest';
import { createOverviewCache, downsampleSeries, overviewDirection, overviewInterval, signedOverviewNumber, type OverviewData } from './overview';
import { getUsMarketStatus } from './hours';

function data(time: number): OverviewData {
  return { asOf: time, fetchedAt: time, session: 'open', isDelayed: false, delayMinutes: null,
    mode: 'etf-proxy', stale: false, refreshFailed: false, items: [] };
}
describe('market overview', () => {
  it('coalesces 50 requests into one data loader call', async () => {
    const load = vi.fn(async () => data(1000));
    const read = createOverviewCache(load, () => 'open', () => 1000);
    const results = await Promise.all(Array.from({ length: 50 }, () => read()));
    expect(load).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(50);
    await read(); expect(load).toHaveBeenCalledTimes(1);
  });
  it('serves stale data and backs off after 429 without replacing the timestamp', async () => {
    let now = 1000;
    const load = vi.fn().mockResolvedValueOnce(data(now)).mockRejectedValue(new Error('429'));
    const read = createOverviewCache(load, () => 'open', () => now);
    await read(); now += 60_001;
    expect((await read()).stale).toBe(true);
    await vi.waitFor(async () => expect((await read()).refreshFailed).toBe(true));
    const old = await read();
    expect(old.refreshFailed).toBe(true); expect(old.asOf).toBe(1000);
    await Promise.all(Array.from({ length: 50 }, () => read()));
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('fails without inventing data and allows retry after backoff', async () => {
    let now = 0; const load = vi.fn().mockRejectedValueOnce(new Error('429')).mockResolvedValue(data(60_001));
    const read = createOverviewCache(load, () => 'closed', () => now);
    await expect(read()).rejects.toThrow('429');
    await expect(read()).rejects.toThrow('temporarily unavailable');
    now = 60_001; expect((await read()).mode).toBe('etf-proxy');
  });
  it('uses session-specific TTLs and marks old/unknown quote timestamps', async () => {
    expect(['open', 'pre', 'post', 'closed'].map((p) => overviewInterval(p as OverviewData['session']))).toEqual([60000, 300000, 300000, 900000]);
    let session: OverviewData['session'] = 'closed';
    const read = createOverviewCache(async () => data(0), () => session, () => 21 * 60_000);
    expect((await read()).isDelayed).toBe(false);
    session = 'open'; expect((await read()).isDelayed).toBe(true);
    expect((await read()).delayMinutes).toBe(21);
    const unknown = createOverviewCache(async () => ({ ...data(0), asOf: null }), () => 'open', () => 0);
    expect((await unknown()).delayMinutes).toBeNull();
    expect((await unknown()).isDelayed).toBe(true);
  });
  it('preserves first/last chart points with at most 78 sorted finite points', () => {
    const candles = Array.from({ length: 400 }, (_, i) => ({ t: i, c: i + 1, o: 1, h: 1, l: 1, v: 1 }));
    const points = downsampleSeries(candles.reverse());
    expect(points).toHaveLength(78); expect(points[0]).toEqual({ t: 0, v: 1 });
    expect(points.at(-1)).toEqual({ t: 399000, v: 400 });
    expect(downsampleSeries([])).toEqual([]);
    expect(downsampleSeries([candles[0]])).toHaveLength(1);
  });
  it('keeps rounded direction/sign consistent for positive, negative and zero', () => {
    expect([1, -1, 0, -.0001].map(overviewDirection)).toEqual([1, -1, 0, 0]);
    expect([1, -1, 0, -.0001].map(signedOverviewNumber)).toEqual(['+1.00', '-1.00', '0.00', '0.00']);
  });
  it('uses the existing exchange calendar for pre/open/post/weekend/holiday phases', () => {
    expect(['2026-10-06T12:00:00Z', '2026-10-06T15:00:00Z', '2026-10-06T21:00:00Z', '2026-10-10T15:00:00Z', '2026-12-25T15:00:00Z'].map((date) => getUsMarketStatus(new Date(date)).phase)).toEqual(['pre', 'open', 'post', 'closed', 'closed']);
  });
});
