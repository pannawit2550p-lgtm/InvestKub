import { describe, expect, it } from 'vitest';
import { isProfileAvatarId, profileAvatars } from './avatars';

describe('profile character avatars', () => {
  it('keeps the supported character catalog to the twelve available image assets', () => {
    expect(profileAvatars.map((avatar) => avatar.id)).toEqual([
      'bull', 'bear', 'cat', 'fox', 'turtle', 'squirrel', 'owl', 'wolf', 'rabbit', 'penguin', 'shark', 'dragon',
    ]);
    expect(profileAvatars).toHaveLength(12);
  });

  it('rejects avatar ids outside the catalog', () => {
    expect(isProfileAvatarId('bull')).toBe(true);
    expect(isProfileAvatarId('bear')).toBe(true);
    expect(isProfileAvatarId('unknown')).toBe(false);
    expect(isProfileAvatarId(null)).toBe(false);
  });
});
