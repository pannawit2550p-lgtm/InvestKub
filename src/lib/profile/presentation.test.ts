import { describe, expect, it } from 'vitest';
import { thbToUsd } from '@/lib/currency';
import { profileReturnPresentation } from './presentation';
import { formatThaiShortDate } from '@/lib/time';

describe('profile presentation', () => {
  it('uses the same rounded amount for sign, direction, and color', () => {
    expect(profileReturnPresentation(thbToUsd(100), 1)).toMatchObject({ amount: 100, sign: '+', direction: 'arrowUp', tone: 'positive', percent: '+1.00%' });
    expect(profileReturnPresentation(thbToUsd(-100), -1)).toMatchObject({ amount: -100, sign: '−', direction: 'arrowDown', tone: 'negative', percent: '−1.00%' });
  });
  it('does not show a loss arrow or negative zero for sub-cent amounts', () => {
    expect(profileReturnPresentation(thbToUsd(-0.001), -0.000001)).toMatchObject({ sign: '+', direction: null, tone: 'muted', percent: '0.00%' });
    expect(profileReturnPresentation(0, 0)).toMatchObject({ sign: '+', direction: null, tone: 'muted', percent: '0.00%' });
  });
  it('uses Bangkok time and short Buddhist years for account creation', () => {
    expect(formatThaiShortDate(Date.parse('2026-10-04T18:00:00Z'))).toBe('5 ต.ค. 69');
    expect(formatThaiShortDate(NaN)).toBe('—');
  });
});
