-- Admin dashboard statistics. Only the admin account may call it: the check
-- is done inside the function from the caller's verified JWT, so it holds
-- even if someone calls the endpoint directly.

create or replace function public.admin_stats()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v jsonb;
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> 'alfailkaw33@gmail.com' then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'users', (select count(*) from auth.users),
    'new_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'trips', (select count(*) from public.trips),
    'catches', (select count(*) from public.catches),
    'list', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select
          u.id,
          case when u.email is null then null
               else left(u.email, 1) || '***' || substr(u.email, position('@' in u.email)) end as email,
          u.created_at,
          u.last_sign_in_at,
          (select count(*) from public.trips t where t.user_id = u.id) as trips,
          (select count(*) from public.catches c where c.user_id = u.id) as catches
        from auth.users u
        order by u.created_at desc
        limit 200
      ) x
    ), '[]'::jsonb)
  ) into v;

  return v;
end;
$$;

revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
