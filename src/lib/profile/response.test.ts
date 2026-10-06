import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { profileResponse } from './response';

describe('profile response allowlist', () => {
  it('keeps the player number and profile metadata after edits, without private IDs or paths', async () => {
    const row = { id: 'private-auth-id', email: 'private@example.com', public_id: 'safe-public-id', player_number: 4321, created_at: '2026-10-05',
      display_name: 'InvestKub', display_name_custom: true, starting_balance: '100', reward_balance: '10', leaderboard_visible: true,
      avatar_type: 'character', avatar_character: 'cat', avatar_storage_path: 'private/path' };
    const result = await profileResponse({} as SupabaseClient, row);
    expect(result).toMatchObject({ public_id: 'safe-public-id', player_number: 4321, created_at: '2026-10-05', starting_balance: 100, reward_balance: 10, avatar_url: null });
    expect(JSON.stringify(result)).not.toMatch(/private-auth|private@example|private\/path/);
  });
  it('does not display an email stored as an old display name', async () => {
    const result = await profileResponse({} as SupabaseClient, { public_id: 'safe-public-id', player_number: 4321, created_at: '2026-10-05', display_name: 'private@example.com', display_name_custom: false, starting_balance: 100, leaderboard_visible: false, avatar_type: 'initial', avatar_character: null });
    expect(result.display_name).not.toContain('@');
    expect(result.leaderboard_visible).toBe(false);
  });
});
