-- =====================================================================
-- Trip lifecycle, multiple target species, planned vs actual tackle/depth,
-- catches that are not (yet) linked to a trip. Additive; existing rows stay
-- valid ('draft' is kept as a legacy alias of 'active').
-- =====================================================================

-- ---- trip lifecycle ---------------------------------------------------
alter table public.trips drop constraint if exists trips_status_check;
alter table public.trips add constraint trips_status_check
  check (status in ('planned','active','completed','cancelled','draft'));

alter table public.trips
  add column if not exists planned_start_at   timestamptz,
  add column if not exists target_depth_m     numeric(6,1) check (target_depth_m >= 0 and target_depth_m < 11000),
  add column if not exists target_depth_max_m numeric(6,1) check (target_depth_max_m >= 0 and target_depth_max_m < 11000),
  add column if not exists lure_type          text check (char_length(lure_type) <= 120),
  add column if not exists lure_weight_g      numeric(7,1) check (lure_weight_g > 0 and lure_weight_g < 100000),
  add column if not exists lure_color         text check (char_length(lure_color) <= 60),
  add column if not exists lure_size          text check (char_length(lure_size) <= 60),
  add column if not exists trolling_speed_kn  numeric(4,1) check (trolling_speed_kn >= 0 and trolling_speed_kn < 40),
  add column if not exists what_worked        text check (char_length(what_worked) <= 2000),
  add column if not exists next_time          text check (char_length(next_time) <= 2000);
alter table public.trips drop constraint if exists trips_target_depth_range;
alter table public.trips add constraint trips_target_depth_range
  check (target_depth_max_m is null or target_depth_m is null or target_depth_max_m >= target_depth_m);

-- ---- several target species per trip ------------------------------------
create table if not exists public.trip_targets (
  trip_id     uuid not null,
  species_id  uuid not null,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (trip_id, species_id),
  foreign key (trip_id, user_id)    references public.trips   (id, user_id) on delete cascade,
  foreign key (species_id, user_id) references public.species (id, user_id) on delete cascade
);
create index if not exists trip_targets_species_idx on public.trip_targets (species_id);
alter table public.trip_targets enable row level security;
drop policy if exists "own rows" on public.trip_targets;
create policy "own rows" on public.trip_targets for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Back-fill: the existing single target becomes the first target row.
insert into public.trip_targets (trip_id, species_id, user_id)
select id, target_species_id, user_id from public.trips where target_species_id is not null
on conflict do nothing;

-- ---- catches: actual lure details; may exist without a trip --------------
alter table public.catches
  add column if not exists lure_weight_g numeric(7,1) check (lure_weight_g > 0 and lure_weight_g < 100000),
  add column if not exists lure_color    text check (char_length(lure_color) <= 60);
alter table public.catches alter column trip_id drop not null;

-- Snapshots of a stand-alone catch have no trip.
alter table public.environment_observations alter column trip_id drop not null;
alter table public.environment_observations drop constraint if exists env_obs_owner_present;
alter table public.environment_observations add constraint env_obs_owner_present
  check (trip_id is not null or catch_id is not null);
