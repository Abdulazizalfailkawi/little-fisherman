-- «إحداثياتي»: coordinates the user saved by pressing "mark here" while out fishing.
-- Separate from `locations` (the spots used for trips/catches) on purpose.

create table if not exists public.marks (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 100),
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  depth_m     numeric(8,2) check (depth_m >= 0 and depth_m <= 11000),
  notes       text check (char_length(notes) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists marks_user_created_idx on public.marks (user_id, created_at desc);

alter table public.marks enable row level security;
drop policy if exists "own rows" on public.marks;
create policy "own rows" on public.marks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop trigger if exists marks_updated_at on public.marks;
create trigger marks_updated_at before update on public.marks
  for each row execute function public.set_updated_at();
