import { describe, expect, it } from 'vitest';
import { formatOpenCountdown, getThaiMarketStatus, getUsMarketStatus, getNextUsMarketOpen } from './hours';
import { formatThaiDateTime, formatThaiTime } from '@/lib/time';

describe('US market phases and calendar', () => {
  it('recognizes the regular open and its Thai time', () => {
    const now = new Date('2026-10-05T13:30:00.000Z');
    expect(getUsMarketStatus(now).phase).toBe('open');
    expect(formatThaiTime(now.getTime())).toBe('20:30');
  });

  it('recognizes pre-market and post-market phases', () => {
    expect(getUsMarketStatus(new Date('2026-10-05T12:00:00.000Z')).phase).toBe('pre');
    const afterClose = new Date('2026-10-05T20:00:00.000Z');
    expect(getUsMarketStatus(afterClose).phase).toBe('post');
    expect(formatThaiDateTime(afterClose.getTime())).toContain('6 ต.ค. 2569 03:00');
  });

  it('skips weekends and NYSE holidays when calculating the next open', () => {
    const sunday = new Date('2026-10-04T12:00:00.000Z');
    const mondayOpen = getNextUsMarketOpen(sunday);
    expect(mondayOpen.toISOString()).toBe('2026-10-05T13:30:00.000Z');
    expect(formatOpenCountdown(mondayOpen.toISOString(), sunday)).toBe('จะเปิดใน 25 ชม. 30 นาที');
    expect(getUsMarketStatus(new Date('2026-11-26T16:00:00.000Z')).phase).toBe('closed');
  });

  it('treats the 2026 early close as closed after 13:00 ET', () => {
    const status = getUsMarketStatus(new Date('2026-11-27T18:30:00.000Z'));
    expect(status.phase).toBe('closed');
    expect(status.nextOpenAt).toBe('2026-11-30T14:30:00.000Z');
  });

  it('applies EST after the daylight-saving transition', () => {
    const now = new Date('2026-11-02T14:30:00.000Z');
    expect(getUsMarketStatus(now).phase).toBe('open');
    expect(formatThaiTime(now.getTime())).toBe('21:30');
  });

  it('models SET sessions in Bangkok time and weekdays only', () => {
    expect(getThaiMarketStatus(new Date('2026-10-05T03:00:00.000Z')).phase).toBe('open');
    expect(getThaiMarketStatus(new Date('2026-10-05T06:00:00.000Z')).phase).toBe('closed');
    expect(getThaiMarketStatus(new Date('2026-10-03T04:00:00.000Z')).phase).toBe('closed');
  });
});
