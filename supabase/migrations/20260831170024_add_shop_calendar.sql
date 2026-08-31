create table public.shop_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  event_date date not null,
  start_time time without time zone,
  venue text check (venue is null or char_length(trim(venue)) <= 160),
  notes text check (notes is null or char_length(trim(notes)) <= 1000),
  remind_days_before smallint not null default 1 check (remind_days_before between 0 and 30),
  status text not null default 'planned' check (status in ('planned','completed','cancelled')),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shop_events_location_date_idx
on public.shop_events(location_id, event_date, start_time)
where status = 'planned';

create index shop_events_business_date_idx
on public.shop_events(business_id, event_date desc);

alter table public.shop_events enable row level security;
revoke all on table public.shop_events from anon, authenticated;
grant select, insert, update, delete on table public.shop_events to authenticated;

create policy "members read shop events" on public.shop_events for select to authenticated
using (public.can_access_location(location_id) or public.is_platform_admin());

create policy "members create shop events" on public.shop_events for insert to authenticated
with check (
  (public.can_access_location(location_id) or public.is_platform_admin())
  and exists (
    select 1 from public.locations l
    where l.id = location_id and l.business_id = business_id
  )
);

create policy "members update shop events" on public.shop_events for update to authenticated
using (public.can_access_location(location_id) or public.is_platform_admin())
with check (
  (public.can_access_location(location_id) or public.is_platform_admin())
  and exists (
    select 1 from public.locations l
    where l.id = location_id and l.business_id = business_id
  )
);

create policy "members delete shop events" on public.shop_events for delete to authenticated
using (public.can_access_location(location_id) or public.is_platform_admin());

create or replace function public.update_shop_event_timestamp() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

revoke execute on function public.update_shop_event_timestamp() from public, anon, authenticated;

create trigger shop_events_updated_at before update on public.shop_events
for each row execute function public.update_shop_event_timestamp();

create or replace function public.capture_shop_event_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row public.shop_events;
  v_actor_name text;
  v_action text;
  v_summary text;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  select display_name into v_actor_name from public.profiles where id = auth.uid();
  v_action := case
    when tg_op = 'INSERT' then 'event_created'
    when tg_op = 'DELETE' then 'event_deleted'
    else 'event_updated'
  end;
  v_summary := case
    when tg_op = 'INSERT' then 'Event added: '
    when tg_op = 'DELETE' then 'Event deleted: '
    else 'Event updated: '
  end || v_row.title;

  insert into public.activity_logs(
    business_id, location_id, actor_id, actor_name, action,
    entity_type, entity_id, summary, details
  ) values (
    v_row.business_id, v_row.location_id, auth.uid(), coalesce(v_actor_name, 'Shop user'),
    v_action, 'shop_events', v_row.id::text, v_summary,
    jsonb_build_object('title', v_row.title, 'event_date', v_row.event_date, 'status', v_row.status)
  );
  return coalesce(new, old);
end $$;

revoke execute on function public.capture_shop_event_activity() from public, anon, authenticated;

create trigger shop_events_activity after insert or update or delete on public.shop_events
for each row execute function public.capture_shop_event_activity();
