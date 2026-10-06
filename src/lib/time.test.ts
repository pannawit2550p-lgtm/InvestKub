import { describe, expect, it } from 'vitest';
import { formatThaiDateTime, formatThaiTime, parseExchangeDateTime, timestampToMilliseconds } from './time';

describe('shared timezone utilities', () => {
  it('formats timestamps explicitly in Bangkok time', () => {
    const instant = Date.parse('2026-10-05T13:30:00.000Z');
    expect(formatThaiDateTime(instant)).toContain('5 ต.ค. 2569 20:30');
    expect(formatThaiTime(instant)).toBe('20:30');
  });

  it('normalizes provider seconds and milliseconds to the same instant', () => {
    const seconds = Date.parse('2026-10-05T13:30:00.000Z') / 1_000;
    expect(timestampToMilliseconds(seconds, 'seconds')).toBe(timestampToMilliseconds(seconds * 1_000, 'milliseconds'));
  });

  it('interprets exchange-local candle datetimes using the IANA timezone', () => {
    expect(parseExchangeDateTime('2026-10-05 09:30:00', 'America/New_York')).toBe(Date.parse('2026-10-05T13:30:00.000Z'));
    expect(parseExchangeDateTime('2026-11-02 09:30:00', 'America/New_York')).toBe(Date.parse('2026-11-02T14:30:00.000Z'));
  });
});
