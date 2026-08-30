create table public.printers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 60),
  model text not null check (char_length(trim(model)) between 1 and 80),
  status text not null default 'working'
    check (status in ('working','needs_attention','under_repair','retired')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name)
);

create index printers_business_status_idx on public.printers(business_id, status, name);

alter table public.printers enable row level security;
revoke all on table public.printers from anon, authenticated;
grant select, insert, update, delete on table public.printers to authenticated;

create policy "members read printers" on public.printers for select to authenticated
using (public.is_business_member(business_id) or public.is_platform_admin());

create policy "members create printers" on public.printers for insert to authenticated
with check (
  (public.is_business_member(business_id) or public.is_platform_admin())
  and (location_id is null or exists (
    select 1 from public.locations l where l.id=location_id and l.business_id=business_id
  ))
);

create policy "members update printers" on public.printers for update to authenticated
using (public.is_business_member(business_id) or public.is_platform_admin())
with check (
  (public.is_business_member(business_id) or public.is_platform_admin())
  and (location_id is null or exists (
    select 1 from public.locations l where l.id=location_id and l.business_id=business_id
  ))
);

create policy "members delete printers" on public.printers for delete to authenticated
using (public.is_business_member(business_id) or public.is_platform_admin());
