alter table public.businesses
add column if not exists logo_url text;

drop policy if exists "shop owners update own business" on public.businesses;
create policy "shop owners update own business" on public.businesses
for update to authenticated
using (public.is_business_owner(id))
with check (public.is_business_owner(id));
