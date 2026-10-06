import type { SupabaseClient } from '@supabase/supabase-js';

export async function getProfileAvatarUrl(client: SupabaseClient, path: string | null | undefined) {
  if (!path) return null;
  const { data, error } = await client.storage.from('profile-avatars').createSignedUrl(path, 60 * 60);
  return error ? null : data.signedUrl;
}
