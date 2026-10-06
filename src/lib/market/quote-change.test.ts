import { describe, expect, it } from 'vitest';
import { getChangePresentation } from './quote-change';

describe('rounded quote direction', () => {
  it('keeps positive text, arrow direction, and color direction aligned', () => {
    const result = getChangePresentation(333.55, 333.42);
    expect(result).toMatchObject({ roundedPercent: 0.04, direction: 1, text: '+0.04%' });
  });

  it('keeps negative text, arrow direction, and color direction aligned', () => {
    const result = getChangePresentation(333.30, 333.42);
    expect(result).toMatchObject({ roundedPercent: -0.04, direction: -1, text: '−0.04%' });
  });

  it('uses neutral presentation when the displayed percent rounds to zero', () => {
    expect(getChangePresentation(100.001, 100)).toMatchObject({ direction: 0, text: '–' });
    expect(getChangePresentation(100, 100)).toMatchObject({ direction: 0, text: '–' });
  });
});
