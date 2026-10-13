-- Waqfa push notifications (web push).
--
-- push_subs   : one row per browser/phone that enabled the notification, with
--               the spots it wants to hear about. No personal data.
-- push_config : VAPID keys + a shared secret for the scheduler. The values are
--               inserted manually (never committed). Both tables are readable
--               only with the service role (RLS on, no policies).
--
-- A scheduler (pg_cron + pg_net) calls the `push-tick` edge function every
-- 5 minutes; it computes the waqfa windows and sends the pushes. The cron
-- job itself is created outside the repo because it carries the secret.

create table if not exists public.push_subs (
  id         uuid primary key default gen_random_uuid(),
  endpoint   text not null unique check (char_length(endpoint) <= 1000),
  p256dh     text not null check (char_length(p256dh) <= 200),
  auth       text not null check (char_length(auth) <= 100),
  spots      jsonb not null default '[]'::jsonb,
  lang       text not null default 'ar' check (lang in ('ar', 'en')),
  sent       jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_config (
  id            int primary key default 1 check (id = 1),
  vapid_public  text not null,
  vapid_private text not null,
  subject       text not null,
  cron_secret   text not null
);

alter table public.push_subs enable row level security;
alter table public.push_config enable row level security;
revoke all on public.push_subs from anon, authenticated;
revoke all on public.push_config from anon, authenticated;
