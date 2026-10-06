import { describe, expect, it } from 'vitest';
import { fallbackPlayerName, isValidDisplayName, resolveDisplayName, sanitizeDisplayName } from './privacy';

describe('leaderboard display-name privacy', () => {
  it('strips control characters and validates the 3–20 character rule', () => {
    expect(sanitizeDisplayName('  ชื่อ\nผู้เล่น  ')).toBe('ชื่อผู้เล่น');
    expect(isValidDisplayName('abc')).toBe(true);
    expect(isValidDisplayName('ab')).toBe(false);
    expect(isValidDisplayName('player@example.com')).toBe(false);
    expect(isValidDisplayName('x'.repeat(21))).toBe(false);
  });

  it('uses a stable non-email fallback unless a valid custom name exists', () => {
    const publicId = '9fa8b7c6-5d4e-3f21-9876-543210123456';
    expect(fallbackPlayerName(publicId)).toBe('ผู้เล่น 3456');
    expect(resolveDisplayName('email-prefix', false, publicId)).toBe('ผู้เล่น 3456');
    expect(resolveDisplayName('ชื่อที่ตั้งเอง', true, publicId)).toBe('ชื่อที่ตั้งเอง');
  });
});
