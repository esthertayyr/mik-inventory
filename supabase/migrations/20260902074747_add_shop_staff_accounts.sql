create table public.shop_staff_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 60),
  login_username text not null,
  permissions jsonb not null default '[]'::jsonb check (jsonb_typeof(permissions)='array'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shop_staff_accounts_business_idx on public.shop_staff_accounts(business_id,active,display_name);
create unique index shop_staff_accounts_login_username_key on public.shop_staff_accounts(lower(login_username));
alter table public.shop_staff_accounts enable row level security;
revoke all on table public.shop_staff_accounts from public,anon,authenticated;
grant select on table public.shop_staff_accounts to authenticated;

create policy "staff read own access" on public.shop_staff_accounts
for select to authenticated using(user_id=(select auth.uid()));

create policy "platform admins read staff access" on public.shop_staff_accounts
for select to authenticated using(public.is_platform_admin());

create or replace function public.has_shop_permission(p_business_id uuid,p_permission text)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_platform_admin()
    or public.is_business_owner(p_business_id)
    or exists(
      select 1 from public.shop_staff_accounts s
      where s.user_id=(select auth.uid()) and s.business_id=p_business_id
        and s.active and s.permissions ? p_permission
    )
$$;

revoke execute on function public.has_shop_permission(uuid,text) from public,anon;
grant execute on function public.has_shop_permission(uuid,text) to authenticated;
