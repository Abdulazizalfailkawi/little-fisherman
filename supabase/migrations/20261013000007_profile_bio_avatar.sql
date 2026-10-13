-- Optional profile details shown on the account page.
-- display_name already exists; a profile photo is a row of the user's own media.

alter table public.profiles
  add column if not exists bio text check (char_length(bio) <= 300),
  add column if not exists avatar_media_id uuid;
