alter table public.profiles
  add column if not exists avatar_type text not null default 'initial',
  add column if not exists avatar_character text,
  add column if not exists avatar_storage_path text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_avatar_state_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_avatar_state_check check (
      (avatar_type = 'initial' and avatar_character is null and avatar_storage_path is null)
      or (avatar_type = 'character' and avatar_character is not null and avatar_character in (
        'bull', 'bear', 'cat', 'fox', 'turtle', 'squirrel', 'owl', 'wolf', 'rabbit', 'penguin', 'shark', 'dragon'
      ) and avatar_storage_path is null)
      or (avatar_type = 'upload' and avatar_character is null and avatar_storage_path is not null and avatar_storage_path like (id::text || '/%')
        and avatar_storage_path ~ ('^' || id::text || '/[[:alnum:]-]+[.](png|jpg|webp)$'))
    );
  end if;
end;
$$;

-- Avatar mutations run through the authenticated server endpoint using the service role.
revoke update (avatar_type, avatar_character, avatar_storage_path) on table public.profiles from authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
