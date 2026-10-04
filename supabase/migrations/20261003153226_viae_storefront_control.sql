create table public.storefront_drafts (
 business_id uuid primary key references public.businesses(id),
 content jsonb not null default '{}'::jsonb check (jsonb_typeof(content)='object'),
 updated_at timestamptz not null default now()
);
create table public.storefront_pages (
 business_id uuid primary key references public.businesses(id),
 site_key text not null unique,
 content jsonb not null default '{}'::jsonb check (jsonb_typeof(content)='object'),
 updated_at timestamptz not null default now()
);
alter table public.storefront_drafts enable row level security;
alter table public.storefront_pages enable row level security;
revoke all on public.storefront_drafts, public.storefront_pages from anon, authenticated;
grant select, update on public.storefront_drafts to authenticated;
grant select on public.storefront_pages to anon, authenticated;
grant update on public.storefront_pages to authenticated;
create policy "Website draft owners" on public.storefront_drafts for select to authenticated using
(public.is_platform_admin() or exists(select 1 from public.business_memberships m where m.business_id=storefront_drafts.business_id and m.user_id=auth.uid() and m.role='owner'));
create policy "Website draft owner updates" on public.storefront_drafts for update to authenticated using
(public.is_platform_admin() or exists(select 1 from public.business_memberships m where m.business_id=storefront_drafts.business_id and m.user_id=auth.uid() and m.role='owner'))
with check (public.is_platform_admin() or exists(select 1 from public.business_memberships m where m.business_id=storefront_drafts.business_id and m.user_id=auth.uid() and m.role='owner'));
create policy "Published website read" on public.storefront_pages for select to anon,authenticated using (site_key='viae');
create policy "Website publication owners" on public.storefront_pages for update to authenticated using
(public.is_platform_admin() or exists(select 1 from public.business_memberships m where m.business_id=storefront_pages.business_id and m.user_id=auth.uid() and m.role='owner'))
with check (site_key='viae' and (public.is_platform_admin() or exists(select 1 from public.business_memberships m where m.business_id=storefront_pages.business_id and m.user_id=auth.uid() and m.role='owner')));
-- Only content can be edited: the business and site identity cannot be reassigned.
revoke update on public.storefront_drafts, public.storefront_pages from authenticated;
grant update(content,updated_at) on public.storefront_drafts, public.storefront_pages to authenticated;
insert into public.storefront_drafts(business_id) values ('3fe4c82d-a659-406b-b290-32d8a49f2bdf');
insert into public.storefront_pages(business_id,site_key) values ('3fe4c82d-a659-406b-b290-32d8a49f2bdf','viae');
