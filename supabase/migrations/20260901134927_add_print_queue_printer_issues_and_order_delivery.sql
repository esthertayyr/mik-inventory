-- Manual production tracking for small 3D-printing shops.
alter table public.external_orders
  add column if not exists fulfilment_method text not null default 'collection'
    check (fulfilment_method in ('collection','delivery')),
  add column if not exists fulfilled_at timestamptz;

alter table public.printers
  add column if not exists issue_type text,
  add column if not exists issue_photo_url text,
  add column if not exists issue_reported_at timestamptz;

create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  external_order_id uuid references public.external_orders(id) on delete set null,
  printer_id uuid references public.printers(id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 120),
  quantity integer not null default 1 check (quantity > 0),
  filament_colour text,
  needed_date date,
  notes text,
  status text not null default 'to_print'
    check (status in ('to_print','printing','ready','done')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists print_jobs_location_status_date_idx
  on public.print_jobs(location_id, status, needed_date, created_at desc);

alter table public.print_jobs enable row level security;
revoke all on table public.print_jobs from anon, authenticated;
grant select, insert, update, delete on table public.print_jobs to authenticated;

create policy "members read print jobs" on public.print_jobs for select to authenticated
using (public.can_access_location(location_id) or public.is_platform_admin());
create policy "members create print jobs" on public.print_jobs for insert to authenticated
with check (
  (public.can_access_location(location_id) or public.is_platform_admin())
  and exists (select 1 from public.locations l where l.id=location_id and l.business_id=business_id)
);
create policy "members update print jobs" on public.print_jobs for update to authenticated
using (public.can_access_location(location_id) or public.is_platform_admin())
with check (
  (public.can_access_location(location_id) or public.is_platform_admin())
  and exists (select 1 from public.locations l where l.id=location_id and l.business_id=business_id)
);
create policy "members delete print jobs" on public.print_jobs for delete to authenticated
using (public.can_access_location(location_id) or public.is_platform_admin());

create or replace function public.touch_print_job() returns trigger
language plpgsql set search_path=public as $$
begin
  new.updated_at := now();
  if new.status = 'done' and old.status is distinct from new.status then new.completed_at := now(); end if;
  return new;
end $$;
drop trigger if exists print_jobs_touch on public.print_jobs;
create trigger print_jobs_touch before update on public.print_jobs
for each row execute function public.touch_print_job();
