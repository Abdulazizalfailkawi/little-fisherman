-- =====================================================================
-- Fishing Tracker — initial schema
-- Postgres 15+ (uses ON DELETE SET NULL (column) on composite FKs)
--
-- Design notes
-- * Every user-owned row carries user_id and is protected by RLS.
-- * Child -> parent references use composite FKs (child_id, user_id) ->
--   (id, user_id) so a row can never point at another user's data even if
--   someone crafts a request by hand.
-- * Primary keys are UUIDs generated on the client. This makes offline
--   creation + retry idempotent (upsert on id never duplicates a record).
-- * Trip "success" is NOT stored — it is derived (>= 1 catch) so it can
--   never disagree with the catches table.
-- * Timestamps are timestamptz (UTC on disk); the UI renders Asia/Kuwait.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Arabic/English name normalisation used for duplicate detection.
-- Removes harakat + tatweel, unifies alef/yaa/taa-marbuta, lowercases, strips spaces.
create or replace function public.normalize_name(t text)
returns text language sql immutable parallel safe
set search_path = ''
as $$
  select lower(
    regexp_replace(
      translate(
        regexp_replace(coalesce(t, ''), '[ً-ٰٟـ]', '', 'g'),
        'أإآٱىةؤئ', 'اااايهوي'
      ),
      '[\s\-_\.\(\)\/]+', '', 'g'
    )
  )
$$;

-- ---------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text check (char_length(display_name) <= 80),
  locale        text not null default 'ar' check (locale in ('ar', 'en')),
  hijri_offset  smallint not null default 0 check (hijri_offset between -2 and 2),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- media (photos / videos) — deduplicated per user by SHA-256
-- ---------------------------------------------------------------------
create table public.media (
  id            uuid primary key,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  storage_path  text not null check (char_length(storage_path) <= 300),
  thumb_path    text check (char_length(thumb_path) <= 300),
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  kind          text not null default 'photo' check (kind in ('photo', 'video')),
  mime_type     text not null check (char_length(mime_type) <= 100),
  width         int check (width > 0),
  height        int check (height > 0),
  bytes         int check (bytes > 0),
  taken_at      timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, sha256)
);

-- ---------------------------------------------------------------------
-- techniques (built-ins seeded per user + custom)
-- ---------------------------------------------------------------------
create table public.techniques (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  code        text not null check (code ~ '^[a-z0-9_]{1,40}$'),
  name_ar     text not null check (char_length(name_ar) between 1 and 60),
  name_en     text not null check (char_length(name_en) between 1 and 60),
  is_builtin  boolean not null default false,
  sort_order  int not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, code)
);

-- ---------------------------------------------------------------------
-- species — normalised, editable, per user
-- ---------------------------------------------------------------------
create table public.species (
  id               uuid primary key,
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name_ar          text not null check (char_length(name_ar) between 1 and 80),
  name_en          text check (char_length(name_en) <= 120),
  scientific_name  text check (char_length(scientific_name) <= 120),
  aliases          text[] not null default '{}',
  family           text check (char_length(family) <= 80),
  notes            text check (char_length(notes) <= 2000),
  cover_media_id   uuid,
  is_builtin       boolean not null default false,
  name_ar_key      text generated always as (public.normalize_name(name_ar)) stored,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, user_id),
  foreign key (cover_media_id, user_id) references public.media (id, user_id) on delete set null (cover_media_id)
);
create unique index species_user_name_ar_key on public.species (user_id, name_ar_key);
create unique index species_user_name_en_key on public.species (user_id, public.normalize_name(name_en))
  where name_en is not null and name_en <> '';

-- ---------------------------------------------------------------------
-- locations / fishing spots
-- ---------------------------------------------------------------------
create table public.locations (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 100),
  area        text check (char_length(area) <= 100),
  lat         double precision check (lat between -90 and 90),
  lng         double precision check (lng between -180 and 180),
  kind        text not null default 'boat' check (kind in ('boat', 'shore', 'pier', 'other')),
  notes       text check (char_length(notes) <= 2000),
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id),
  check ((lat is null) = (lng is null))
);
create unique index locations_user_name_key on public.locations (user_id, public.normalize_name(name));

-- ---------------------------------------------------------------------
-- equipment inventory
-- ---------------------------------------------------------------------
create table public.equipment (
  id              uuid primary key,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category        text not null check (category in ('rod','reel','line','leader','lure','jig','hook','bait','accessory')),
  name            text not null check (char_length(name) between 1 and 100),
  brand           text check (char_length(brand) <= 80),
  model           text check (char_length(model) <= 80),
  specs           text check (char_length(specs) <= 1000),
  pe_rating       numeric(4,1) check (pe_rating > 0 and pe_rating <= 20),
  photo_media_id  uuid,
  notes           text check (char_length(notes) <= 2000),
  retired         boolean not null default false,
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, user_id),
  foreign key (photo_media_id, user_id) references public.media (id, user_id) on delete set null (photo_media_id)
);
create index equipment_user_idx on public.equipment (user_id, category);

-- ---------------------------------------------------------------------
-- trips
-- ---------------------------------------------------------------------
create table public.trips (
  id                    uuid primary key,
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title                 text check (char_length(title) <= 120),
  status                text not null default 'completed' check (status in ('draft', 'completed')),
  started_at            timestamptz not null,
  ended_at              timestamptz,
  hijri_date_override   text check (hijri_date_override ~ '^1[34][0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|30)$'),
  location_id           uuid,
  lat                   double precision check (lat between -90 and 90),
  lng                   double precision check (lng between -180 and 180),
  technique_id          uuid,
  target_species_id     uuid,
  weather               text check (char_length(weather) <= 200),
  air_temp_c            numeric(4,1) check (air_temp_c between -20 and 65),
  wind_speed_kmh        numeric(5,1) check (wind_speed_kmh >= 0 and wind_speed_kmh < 300),
  wind_dir              text check (wind_dir in ('N','NE','E','SE','S','SW','W','NW')),
  sea_state             text check (sea_state in ('calm','slight','moderate','rough','very_rough')),
  water_depth_m         numeric(6,1) check (water_depth_m >= 0 and water_depth_m < 11000),
  tide                  text check (tide in ('high','rising','falling','low')),
  moon_phase            text check (moon_phase in ('new','waxing_crescent','first_quarter','waxing_gibbous','full','waning_gibbous','last_quarter','waning_crescent')),
  line_pe               numeric(4,1) check (line_pe > 0 and line_pe <= 20),
  lure_bait             text check (char_length(lure_bait) <= 300),
  gear_notes            text check (char_length(gear_notes) <= 1000),
  notes                 text check (char_length(notes) <= 5000),
  is_demo               boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (id, user_id),
  check (ended_at is null or ended_at >= started_at),
  check ((lat is null) = (lng is null)),
  foreign key (location_id, user_id)       references public.locations  (id, user_id) on delete set null (location_id),
  foreign key (technique_id, user_id)      references public.techniques (id, user_id) on delete set null (technique_id),
  foreign key (target_species_id, user_id) references public.species    (id, user_id) on delete set null (target_species_id)
);
create index trips_user_started_idx on public.trips (user_id, started_at desc);
create index trips_location_idx on public.trips (location_id);
create index trips_technique_idx on public.trips (technique_id);

-- ---------------------------------------------------------------------
-- catches — one row per fish
-- ---------------------------------------------------------------------
create table public.catches (
  id                     uuid primary key,
  user_id                uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_id                uuid not null,
  species_id             uuid,           -- null = not identified yet
  caught_at              timestamptz not null,
  weight_kg              numeric(7,3) check (weight_kg > 0 and weight_kg < 1000),
  weight_is_estimate     boolean not null default false,
  length_cm              numeric(6,1) check (length_cm > 0 and length_cm < 1000),
  length_is_estimate     boolean not null default false,
  location_id            uuid,
  depth_m                numeric(6,1) check (depth_m >= 0 and depth_m < 11000),
  technique_id           uuid,
  line_type              text check (char_length(line_type) <= 80),
  pe_rating              numeric(4,1) check (pe_rating > 0 and pe_rating <= 20),
  lure_bait              text check (char_length(lure_bait) <= 300),
  weather                text check (char_length(weather) <= 200),
  tide                   text check (tide in ('high','rising','falling','low')),
  moon_phase             text check (moon_phase in ('new','waxing_crescent','first_quarter','waxing_gibbous','full','waning_gibbous','last_quarter','waning_crescent')),
  notes                  text check (char_length(notes) <= 5000),
  released               boolean not null default false,
  photo_media_id         uuid,
  identification_status  text not null default 'manual'
                         check (identification_status in ('manual','ai_confirmed','ai_corrected','pending_ai','unidentified')),
  ai_species_id          uuid,
  ai_suggestion          jsonb,          -- raw AI candidates + confidence, kept for audit
  is_demo                boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (id, user_id),
  foreign key (trip_id, user_id)        references public.trips      (id, user_id) on delete cascade,
  foreign key (species_id, user_id)     references public.species    (id, user_id) on delete set null (species_id),
  foreign key (ai_species_id, user_id)  references public.species    (id, user_id) on delete set null (ai_species_id),
  foreign key (location_id, user_id)    references public.locations  (id, user_id) on delete set null (location_id),
  foreign key (technique_id, user_id)   references public.techniques (id, user_id) on delete set null (technique_id),
  foreign key (photo_media_id, user_id) references public.media      (id, user_id) on delete set null (photo_media_id)
);
create index catches_user_caught_idx on public.catches (user_id, caught_at desc);
create index catches_trip_idx on public.catches (trip_id);
create index catches_species_idx on public.catches (species_id);

-- ---------------------------------------------------------------------
-- join tables
-- ---------------------------------------------------------------------
create table public.trip_equipment (
  trip_id       uuid not null,
  equipment_id  uuid not null,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (trip_id, equipment_id),
  foreign key (trip_id, user_id)      references public.trips     (id, user_id) on delete cascade,
  foreign key (equipment_id, user_id) references public.equipment (id, user_id) on delete cascade
);
create index trip_equipment_equipment_idx on public.trip_equipment (equipment_id);

create table public.catch_equipment (
  catch_id      uuid not null,
  equipment_id  uuid not null,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (catch_id, equipment_id),
  foreign key (catch_id, user_id)     references public.catches   (id, user_id) on delete cascade,
  foreign key (equipment_id, user_id) references public.equipment (id, user_id) on delete cascade
);
create index catch_equipment_equipment_idx on public.catch_equipment (equipment_id);

create table public.trip_media (
  trip_id     uuid not null,
  media_id    uuid not null,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (trip_id, media_id),
  foreign key (trip_id, user_id)  references public.trips (id, user_id) on delete cascade,
  foreign key (media_id, user_id) references public.media (id, user_id) on delete cascade
);
create index trip_media_media_idx on public.trip_media (media_id);

-- ---------------------------------------------------------------------
-- achievements (global catalogue) + per-user unlocks
-- Unlocking is evaluated from the user's records by the app; this table
-- keeps the first-unlock timestamp history.
-- ---------------------------------------------------------------------
create table public.achievements (
  code            text primary key check (code ~ '^[a-z0-9_]{1,60}$'),
  category        text not null,
  name_ar         text not null,
  name_en         text not null,
  description_ar  text not null,
  description_en  text not null,
  threshold       int,
  sort_order      int not null default 100
);

create table public.user_achievements (
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  achievement_code  text not null references public.achievements (code) on delete cascade,
  unlocked_at       timestamptz not null,
  context           jsonb,
  created_at        timestamptz not null default now(),
  primary key (user_id, achievement_code)
);

-- ---------------------------------------------------------------------
-- personal goals / custom challenges
-- ---------------------------------------------------------------------
create table public.goals (
  id            uuid primary key,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 120),
  kind          text not null check (kind in ('species_count','distinct_species','trip_count','catch_count',
                                              'fish_over_weight','fish_over_length','technique_success_rate','species_with_technique')),
  target_value  numeric(8,2) not null check (target_value > 0),
  species_id    uuid,
  technique_id  uuid,
  period_start  date,
  period_end    date,
  baseline      jsonb,          -- e.g. success rate at creation time for "improve" goals
  status        text not null default 'active' check (status in ('active','archived')),
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, user_id),
  check (period_end is null or period_start is null or period_end >= period_start),
  foreign key (species_id, user_id)   references public.species    (id, user_id) on delete set null (species_id),
  foreign key (technique_id, user_id) references public.techniques (id, user_id) on delete set null (technique_id)
);
create index goals_user_idx on public.goals (user_id, status);

-- ---------------------------------------------------------------------
-- environmental observations (external API data or manual readings)
-- kind: observation (measured) | forecast | model (reanalysis / model
-- estimate for a past time) | calculated (astronomy: sun & moon)
-- ---------------------------------------------------------------------
create table public.environment_observations (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_id     uuid not null,
  catch_id    uuid,
  source      text not null check (char_length(source) between 1 and 120),
  kind        text not null check (kind in ('observation','forecast','model','calculated')),
  valid_at    timestamptz not null,
  fetched_at  timestamptz not null default now(),
  lat         double precision,
  lng         double precision,
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (trip_id, user_id)  references public.trips   (id, user_id) on delete cascade,
  foreign key (catch_id, user_id) references public.catches (id, user_id) on delete cascade
);
create index env_obs_trip_idx on public.environment_observations (trip_id);
create index env_obs_catch_idx on public.environment_observations (catch_id);

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','media','techniques','species','locations','equipment',
                           'trips','catches','goals','environment_observations']
  loop
    execute format('create trigger %I_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
create policy "own profile select" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "own profile update" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['media','techniques','species','locations','equipment','trips','catches',
                           'trip_equipment','catch_equipment','trip_media','user_achievements','goals',
                           'environment_observations']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all to authenticated
                    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

alter table public.achievements enable row level security;
create policy "catalogue readable" on public.achievements for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- Storage: private bucket, one folder per user  ->  media/<uid>/<sha>.jpg
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 26214400,
        array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime'])
on conflict (id) do nothing;

create policy "media read own" on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "media insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "media update own" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "media delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------
-- Achievement catalogue
-- ---------------------------------------------------------------------
insert into public.achievements (code, category, name_ar, name_en, description_ar, description_en, threshold, sort_order) values
('first_fish',          'milestone', 'أول سمكة',               'First Fish Caught',          'سجّل أول سمكة لك',                                   'Log your first catch',                                   1,  10),
('first_new_species',   'collection','نوع جديد',               'First Catch of a New Species','أضف نوعاً جديداً إلى مجموعتك',                     'Add a species to your collection',                      1,  20),
('species_5',           'collection','٥ أنواع',                'Catch 5 Different Species',  'اصطد ٥ أنواع مختلفة',                                'Catch 5 different species',                             5,  30),
('species_10',          'collection','١٠ أنواع',               'Catch 10 Different Species', 'اصطد ١٠ أنواع مختلفة',                               'Catch 10 different species',                           10,  40),
('species_x10',         'collection','خبير نوع',               'Catch a Species 10 Times',   'اصطد نفس النوع ١٠ مرات',                             'Catch the same species 10 times',                      10,  50),
('pb_weight',           'record',    'رقم قياسي بالوزن',       'Personal Best Weight',       'سجّل وزناً مقاساً لسمكة (أثقل سمكة لديك)',          'Record a measured weight (your heaviest fish)',          1,  60),
('pb_length',           'record',    'رقم قياسي بالطول',       'Personal Best Length',       'سجّل طولاً مقاساً لسمكة (أطول سمكة لديك)',          'Record a measured length (your longest fish)',           1,  70),
('jigging_success',     'technique', 'رحلة جيقنق ناجحة',    'Successful Jigging Trip',    'رحلة جيقنق فيها صيد واحد على الأقل',                'A jigging trip with at least one catch',                 1,  80),
('trolling_success',    'technique', 'رحلة ترولنق ناجحة',      'Successful Trolling Trip',   'رحلة ترولنق فيها صيد واحد على الأقل',               'A trolling trip with at least one catch',                1,  90),
('new_species_month',   'collection','نوع جديد هذا الشهر',     'New Species This Month',     'اصطد نوعاً لم تصطده من قبل خلال الشهر الحالي',      'Catch a never-before-caught species this month',         1, 100),
('trips_10',            'milestone', '١٠ رحلات',               'Record 10 Fishing Trips',    'سجّل ١٠ رحلات صيد (الناجحة وغير الناجحة)',          'Log 10 trips (successful or not)',                      10, 110),
('improve_catch_rate',  'skill',     'تحسّن معدل الصيد',        'Improve My Catch Rate',      'معدل صيد آخر ٥ رحلات أعلى من معدلك السابق',         'Catch rate of your last 5 trips beats your earlier rate', 5, 120),
('monthly_goal',        'goal',      'إنجاز هدف شهري',          'Complete a Monthly Fishing Goal','حقق هدفاً محدداً بفترة شهر',                   'Complete a goal limited to a month',                     1, 130);
