-- Existing zero-price orders remain visible so their real price can be corrected.
-- Any new or edited order must have a proper price.
alter table public.external_orders
  add constraint external_orders_total_price_above_zero
  check (total_price > 0) not valid;

create table if not exists public.device_actor_context (
  user_id uuid primary key references auth.users(id) on delete cascade,
  actor_name text not null check (char_length(actor_name) between 1 and 30),
  updated_at timestamptz not null default now()
);

alter table public.device_actor_context enable row level security;
revoke all on table public.device_actor_context from public, anon, authenticated;

create or replace function public.use_device_actor_name() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  v_name text;
begin
  if new.actor_id is null then return new; end if;
  select actor_name into v_name
  from public.device_actor_context
  where user_id=new.actor_id;
  if v_name is not null then new.actor_name:=v_name; end if;
  return new;
end $$;

revoke execute on function public.use_device_actor_name() from public, anon, authenticated;

drop trigger if exists activity_logs_device_actor on public.activity_logs;
create trigger activity_logs_device_actor
before insert on public.activity_logs
for each row execute function public.use_device_actor_name();

drop function if exists public.record_login_activity(text);
create function public.record_login_activity(p_device_name text default null) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_business_id uuid;
  v_actor_name text;
  v_device_name text:=nullif(left(trim(coalesce(p_device_name,'')),30),'');
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select display_name into v_actor_name from public.profiles where id=auth.uid();
  if v_device_name is not null then
    insert into public.device_actor_context(user_id,actor_name,updated_at)
    values(auth.uid(),v_device_name,now())
    on conflict(user_id) do update set actor_name=excluded.actor_name,updated_at=excluded.updated_at;
  end if;
  if not public.is_platform_admin() then
    select business_id into v_business_id from public.business_memberships
    where user_id=auth.uid() order by business_id limit 1;
  end if;
  insert into public.activity_logs(business_id,actor_id,actor_name,action,entity_type,entity_id,summary,details)
  values(v_business_id,auth.uid(),coalesce(v_device_name,v_actor_name,'Shop user'),'login','account',auth.uid()::text,
    case when public.is_platform_admin() then 'Owner signed in' else 'Shop account signed in' end,
    jsonb_strip_nulls(jsonb_build_object('device_user_name',v_device_name)));
end $$;

revoke execute on function public.record_login_activity(text) from public, anon;
grant execute on function public.record_login_activity(text) to authenticated;
