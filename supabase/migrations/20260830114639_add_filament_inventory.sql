create table public.filaments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  brand text not null check (char_length(trim(brand)) between 1 and 80),
  material text not null check (char_length(trim(material)) between 1 and 60),
  color text not null check (char_length(trim(color)) between 1 and 80),
  finish text not null default 'Standard' check (char_length(trim(finish)) between 1 and 60),
  spool_count integer not null default 1 check (spool_count >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index filaments_business_material_idx on public.filaments(business_id, material, color);
alter table public.filaments enable row level security;
revoke all on table public.filaments from anon, authenticated;
grant select, insert, update, delete on table public.filaments to authenticated;

create policy "members read filaments" on public.filaments for select to authenticated
using (public.is_business_member(business_id) or public.is_platform_admin());
create policy "members create filaments" on public.filaments for insert to authenticated
with check ((public.is_business_member(business_id) or public.is_platform_admin()) and
  (location_id is null or exists(select 1 from public.locations l where l.id=location_id and l.business_id=business_id)));
create policy "members update filaments" on public.filaments for update to authenticated
using (public.is_business_member(business_id) or public.is_platform_admin())
with check ((public.is_business_member(business_id) or public.is_platform_admin()) and
  (location_id is null or exists(select 1 from public.locations l where l.id=location_id and l.business_id=business_id)));
create policy "members delete filaments" on public.filaments for delete to authenticated
using (public.is_business_member(business_id) or public.is_platform_admin());
