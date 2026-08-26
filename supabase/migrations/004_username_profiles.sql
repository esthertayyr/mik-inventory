-- User-facing logins use a simple username. Supabase's internal email remains hidden.
alter table public.profiles add column if not exists username text;
alter table public.businesses add column if not exists login_username text;

create unique index if not exists profiles_username_key
  on public.profiles (lower(username)) where username is not null;
create unique index if not exists businesses_login_username_key
  on public.businesses (lower(login_username)) where login_username is not null;

alter table public.profiles add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9._-]{3,30}$') not valid;
alter table public.profiles validate constraint profiles_username_format;

update public.businesses set login_username='sebu3d'
where slug='sebu3d' and login_username is null;

