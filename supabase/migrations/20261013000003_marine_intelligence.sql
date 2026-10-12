-- =====================================================================
-- Marine intelligence upgrade (additive, preserves existing data)
-- * Locations: English name, favourites, typical depth, tide station
-- * Catches: own coordinates, extra tackle fields, Hijri correction
-- * catch_media: several photos per catch (one fish = one catch)
-- * environment_observations: snapshot grouping + provenance
-- =====================================================================

-- ---- locations -------------------------------------------------------
alter table public.locations
  add column if not exists name_en         text check (char_length(name_en) <= 100),
  add column if not exists is_favorite     boolean not null default false,
  add column if not exists typical_depth_m numeric(6,1) check (typical_depth_m >= 0 and typical_depth_m < 11000),
  add column if not exists tide_station    text check (char_length(tide_station) <= 120);

-- ---- catches ---------------------------------------------------------
alter table public.catches
  add column if not exists lat                 double precision check (lat between -90 and 90),
  add column if not exists lng                 double precision check (lng between -180 and 180),
  add column if not exists rod_reel            text check (char_length(rod_reel) <= 200),
  add column if not exists leader              text check (char_length(leader) <= 120),
  add column if not exists hook                text check (char_length(hook) <= 120),
  add column if not exists hijri_date_override text check (hijri_date_override ~ '^1[34][0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|30)$');
alter table public.catches drop constraint if exists catches_latlng_pair;
alter table public.catches add constraint catches_latlng_pair check ((lat is null) = (lng is null));

-- ---- extra photos per catch -----------------------------------------
create table if not exists public.catch_media (
  catch_id    uuid not null,
  media_id    uuid not null,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  primary key (catch_id, media_id),
  foreign key (catch_id, user_id) references public.catches (id, user_id) on delete cascade,
  foreign key (media_id, user_id) references public.media   (id, user_id) on delete cascade
);
create index if not exists catch_media_media_idx on public.catch_media (media_id);
alter table public.catch_media enable row level security;
drop policy if exists "own rows" on public.catch_media;
create policy "own rows" on public.catch_media for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---- environmental snapshots -----------------------------------------
-- kind (data type), never mixed up:
--   observation        measured on site (none of the integrated providers supply this)
--   forecast           prediction for a time after it was retrieved
--   model              legacy rows (model value, unspecified)
--   archived_forecast  stored model forecast for a past time (reconstruction)
--   reanalysis         ERA5-style reanalysis for a past time
--   calculated         astronomy (sun, moon)
--   manual             entered by the user
--   unavailable        a retrieval was attempted and no reliable value exists
alter table public.environment_observations drop constraint if exists environment_observations_kind_check;
alter table public.environment_observations add constraint environment_observations_kind_check
  check (kind in ('observation','forecast','model','archived_forecast','reanalysis','calculated','manual','unavailable'));

alter table public.environment_observations
  add column if not exists snapshot_id uuid,
  add column if not exists purpose     text not null default 'legacy'
    check (purpose in ('legacy','planned','trip_start','catch','manual','refresh')),
  add column if not exists category    text not null default 'weather'
    check (category in ('weather','marine','tide','astronomy','status')),
  add column if not exists method      text check (char_length(method) <= 300);

create index if not exists env_obs_snapshot_idx on public.environment_observations (snapshot_id);
create index if not exists catches_location_idx on public.catches (location_id);
