-- Community timeline: signed-in users post a fish photo with a note, others
-- like and comment. Reads go through security-definer functions so the author
-- name can be shown without exposing profiles or e-mails. Moderation: any user
-- can report, the admin hides; owners delete their own.

-- ---------------------------------------------------------------- tables
create table if not exists public.community_posts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  body         text check (char_length(body) <= 500),
  species_name text check (char_length(species_name) <= 60),
  weight_kg    numeric check (weight_kg > 0 and weight_kg < 1000),
  place_label  text check (char_length(place_label) <= 60),  -- chosen per post; null = hidden
  photo_path   text not null check (char_length(photo_path) <= 200),
  thumb_path   text check (char_length(thumb_path) <= 200),
  catch_id     uuid,
  is_hidden    boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists community_posts_feed on public.community_posts (created_at desc) where not is_hidden;
create index if not exists community_posts_user on public.community_posts (user_id);

create table if not exists public.community_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.community_posts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 300),
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists community_comments_post on public.community_comments (post_id, created_at);

create table if not exists public.community_likes (
  post_id    uuid not null references public.community_posts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.community_reports (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid references public.community_posts (id) on delete cascade,
  comment_id uuid references public.community_comments (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  reason     text check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  check ((post_id is not null) <> (comment_id is not null))
);
create unique index if not exists community_reports_once_post on public.community_reports (user_id, post_id) where post_id is not null;
create unique index if not exists community_reports_once_comment on public.community_reports (user_id, comment_id) where comment_id is not null;

-- ---------------------------------------------------------------- RLS
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_likes enable row level security;
alter table public.community_reports enable row level security;

create policy "own posts select" on public.community_posts for select to authenticated using (user_id = (select auth.uid()));
create policy "own posts insert" on public.community_posts for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own posts delete" on public.community_posts for delete to authenticated using (user_id = (select auth.uid()));

create policy "own comments select" on public.community_comments for select to authenticated using (user_id = (select auth.uid()));
-- helper: lets the comment policy see whether a post is visible without
-- needing read access to other people's rows
create or replace function public.community_post_open(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.community_posts where id = p_id and not is_hidden);
$$;
revoke all on function public.community_post_open(uuid) from public, anon;
grant execute on function public.community_post_open(uuid) to authenticated;

create policy "own comments insert" on public.community_comments for insert to authenticated
  with check (user_id = (select auth.uid()) and public.community_post_open(post_id));
create policy "own comments delete" on public.community_comments for delete to authenticated using (user_id = (select auth.uid()));

create policy "own likes select" on public.community_likes for select to authenticated using (user_id = (select auth.uid()));
create policy "own likes insert" on public.community_likes for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own likes delete" on public.community_likes for delete to authenticated using (user_id = (select auth.uid()));

create policy "own reports insert" on public.community_reports for insert to authenticated with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- daily limits (spam guard)
create or replace function public.community_limit()
returns trigger language plpgsql set search_path = public as $$
declare n int; cap int;
begin
  if tg_table_name = 'community_posts' then
    select count(*) into n from public.community_posts where user_id = new.user_id and created_at > now() - interval '1 day'; cap := 20;
  else
    select count(*) into n from public.community_comments where user_id = new.user_id and created_at > now() - interval '1 day'; cap := 200;
  end if;
  if n >= cap then raise exception 'daily_limit' using errcode = 'P0001'; end if;
  return new;
end $$;
drop trigger if exists community_posts_limit on public.community_posts;
create trigger community_posts_limit before insert on public.community_posts for each row execute function public.community_limit();
drop trigger if exists community_comments_limit on public.community_comments;
create trigger community_comments_limit before insert on public.community_comments for each row execute function public.community_limit();

-- ---------------------------------------------------------------- reads
create or replace function public.community_feed(p_before timestamptz default now(), p_limit int default 20)
returns table (
  id uuid, user_id uuid, author text, body text, species_name text, weight_kg numeric, place_label text,
  photo_path text, thumb_path text, created_at timestamptz, likes bigint, comments bigint, liked boolean, mine boolean
)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  return query
    select p.id, p.user_id,
           coalesce(nullif(btrim(pr.display_name), ''), 'صياد ' || upper(left(md5(p.user_id::text), 4))) as author,
           p.body, p.species_name, p.weight_kg, p.place_label, p.photo_path, p.thumb_path, p.created_at,
           (select count(*) from public.community_likes l where l.post_id = p.id),
           (select count(*) from public.community_comments c where c.post_id = p.id and not c.is_hidden),
           exists (select 1 from public.community_likes l where l.post_id = p.id and l.user_id = auth.uid()),
           p.user_id = auth.uid()
    from public.community_posts p
    left join public.profiles pr on pr.id = p.user_id
    where not p.is_hidden and p.created_at < p_before
    order by p.created_at desc
    limit least(greatest(p_limit, 1), 50);
end $$;

create or replace function public.community_comments(p_post uuid)
returns table (id uuid, user_id uuid, author text, body text, created_at timestamptz, mine boolean)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  return query
    select c.id, c.user_id,
           coalesce(nullif(btrim(pr.display_name), ''), 'صياد ' || upper(left(md5(c.user_id::text), 4))),
           c.body, c.created_at, c.user_id = auth.uid()
    from public.community_comments c
    join public.community_posts p on p.id = c.post_id and not p.is_hidden
    left join public.profiles pr on pr.id = c.user_id
    where c.post_id = p_post and not c.is_hidden
    order by c.created_at
    limit 200;
end $$;

-- new comments / likes by other people on my posts since a moment
create or replace function public.community_activity(p_since timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then return jsonb_build_object('comments', 0, 'likes', 0); end if;
  return jsonb_build_object(
    'comments', (select count(*) from public.community_comments c join public.community_posts p on p.id = c.post_id
                 where p.user_id = auth.uid() and c.user_id <> auth.uid() and not c.is_hidden and c.created_at > p_since),
    'likes', (select count(*) from public.community_likes l join public.community_posts p on p.id = l.post_id
              where p.user_id = auth.uid() and l.user_id <> auth.uid() and l.created_at > p_since));
end $$;

-- ---------------------------------------------------------------- admin
create or replace function public.admin_community_reports()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> 'alfailkaw33@gmail.com' then raise exception 'not_admin' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
      select r.id, r.created_at, r.reason, r.post_id, r.comment_id,
             coalesce(p.body, cp.body) as post_body, p.thumb_path, p.is_hidden as post_hidden,
             c.body as comment_body, c.is_hidden as comment_hidden
      from public.community_reports r
      left join public.community_posts p on p.id = r.post_id
      left join public.community_comments c on c.id = r.comment_id
      left join public.community_posts cp on cp.id = c.post_id
      order by r.created_at desc limit 100) x), '[]'::jsonb);
end $$;

create or replace function public.community_admin_hide(p_post uuid default null, p_comment uuid default null, p_hide boolean default true)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> 'alfailkaw33@gmail.com' then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_post is not null then update public.community_posts set is_hidden = p_hide where id = p_post; end if;
  if p_comment is not null then update public.community_comments set is_hidden = p_hide where id = p_comment; end if;
end $$;

revoke all on function public.community_feed(timestamptz, int), public.community_comments(uuid), public.community_activity(timestamptz),
  public.admin_community_reports(), public.community_admin_hide(uuid, uuid, boolean) from public, anon;
grant execute on function public.community_feed(timestamptz, int), public.community_comments(uuid), public.community_activity(timestamptz),
  public.admin_community_reports(), public.community_admin_hide(uuid, uuid, boolean) to authenticated;
revoke all on function public.community_limit() from public, anon, authenticated;

-- ---------------------------------------------------------------- photos (private bucket, signed URLs)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community', 'community', false, 3145728, array['image/jpeg'])
on conflict (id) do nothing;

create policy "community read signed-in" on storage.objects for select to authenticated using (bucket_id = 'community');
create policy "community insert own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'community' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "community delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'community' and (storage.foldername(name))[1] = (select auth.uid())::text);
