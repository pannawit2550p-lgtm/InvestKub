import type { SupabaseClient } from '@supabase/supabase-js';
import { getProfileAvatarUrl } from './avatar-url';
import { resolveDisplayName } from '@/lib/rank/privacy';
import type { ProfileAvatarId, ProfileAvatarType } from './avatars';

export const PROFILE_FIELDS = 'public_id, player_number, created_at, display_name, display_name_custom, starting_balance, reward_balance, leaderboard_visible, avatar_type, avatar_character, avatar_storage_path';
export interface ProfileSettings {
  public_id: string; player_number: number; created_at: string; display_name: string; display_name_custom: boolean;
  starting_balance: number; reward_balance: number; leaderboard_visible: boolean;
  avatar_type: ProfileAvatarType; avatar_character: ProfileAvatarId | null; avatar_url: string | null;
}

export async function profileResponse(admin: SupabaseClient, data: Record<string, unknown>): Promise<ProfileSettings> {
  return {
    public_id: String(data.public_id), player_number: Number(data.player_number), created_at: String(data.created_at),
    display_name: resolveDisplayName(String(data.display_name), Boolean(data.display_name_custom), String(data.public_id)),
    display_name_custom: Boolean(data.display_name_custom), starting_balance: Number(data.starting_balance), reward_balance: Number(data.reward_balance ?? 0),
    leaderboard_visible: Boolean(data.leaderboard_visible), avatar_type: data.avatar_type as ProfileAvatarType,
    avatar_character: data.avatar_character as ProfileAvatarId | null,
    avatar_url: data.avatar_type === 'upload' ? await getProfileAvatarUrl(admin, data.avatar_storage_path as string | null) : null,
  };
}
