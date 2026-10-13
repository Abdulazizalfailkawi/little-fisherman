-- Names of the gear used on a trip (typed by the user): reel, rod, line, leader.
-- The jig / lure name already lives in trips.lure_type.

alter table public.trips
  add column if not exists gear_rod    text check (char_length(gear_rod) <= 120),
  add column if not exists gear_reel   text check (char_length(gear_reel) <= 120),
  add column if not exists gear_line   text check (char_length(gear_line) <= 120),
  add column if not exists gear_leader text check (char_length(gear_leader) <= 120);
