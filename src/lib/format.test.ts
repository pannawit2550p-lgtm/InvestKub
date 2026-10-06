import { describe, expect, it } from 'vitest';
import { formatPrice, formatAssetChange } from './format';

describe('compact asset row formatting', () => {
  it('uses four decimal places below one and two elsewhere with grouping', () => {
    expect([0.2619, 1.2, 1234.56, 12345.67].map(formatPrice)).toEqual(['0.2619', '1.20', '1,234.56', '12,345.67']);
    expect(formatPrice(undefined)).toBe('—');
    expect(formatPrice(Number.NaN)).toBe('—');
    expect(formatPrice(Infinity)).toBe('—');
  });
  it('uses one rounded change for arrow, sign and color, including negative zero', () => {
    expect(formatAssetChange(2.16)).toMatchObject({ direction: 1, text: '+2.16%' });
    expect(formatAssetChange(-.22)).toMatchObject({ direction: -1, text: '-0.22%' });
    expect(formatAssetChange(0)).toMatchObject({ direction: 0, text: '0.00%' });
    expect(formatAssetChange(-.0001)).toMatchObject({ direction: 0, text: '0.00%' });
    expect(formatAssetChange(undefined)).toBeNull();
  });
});
