create table if not exists public.order_enquiries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  customer_name text,
  customer_contact text,
  source text not null default 'Social media',
  estimated_value numeric(12,2) check (estimated_value is null or estimated_value > 0),
  follow_up_date date,
  notes text,
  status text not null default 'open' check (status in ('open','converted','lost')),
  converted_order_id uuid references public.external_orders(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_enquiries_location_status_created_idx
  on public.order_enquiries(location_id,status,created_at desc);

alter table public.order_enquiries enable row level security;
revoke all on table public.order_enquiries from anon, authenticated;
grant select, insert, update on table public.order_enquiries to authenticated;

create policy "shop team reads enquiries" on public.order_enquiries for select to authenticated
using (public.can_access_location(location_id) or public.is_platform_admin() or public.can_view_platform_shop(business_id));
create policy "shop team creates enquiries" on public.order_enquiries for insert to authenticated
with check ((public.can_access_location(location_id) or public.is_platform_admin()) and created_by=auth.uid());
create policy "shop team updates enquiries" on public.order_enquiries for update to authenticated
using (public.can_access_location(location_id) or public.is_platform_admin())
with check (public.can_access_location(location_id) or public.is_platform_admin());

create or replace function public.touch_order_enquiry_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end $$;
drop trigger if exists order_enquiries_touch_updated_at on public.order_enquiries;
create trigger order_enquiries_touch_updated_at before update on public.order_enquiries
for each row execute function public.touch_order_enquiry_updated_at();

