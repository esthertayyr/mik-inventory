alter table public.source_products
  add column if not exists lead_time_text text not null default 'Estimated 1–2 months',
  add column if not exists featured boolean not null default false;

alter table public.source_product_options
  add column if not exists selling_price_php numeric(12,2)
    check (selling_price_php is null or selling_price_php > 0);

-- This view is the deliberately small public boundary between MIK and VIAE.
-- Supplier links, source costs, tax, shipping, margins and internal notes are
-- intentionally not selected here.
create or replace view public.viae_public_catalog
with (security_barrier = true)
as
select
  p.id,
  p.name,
  p.category_name as category,
  p.english_description as description,
  p.selling_price_php as price_php,
  p.lead_time_text,
  p.featured,
  p.updated_at,
  coalesce(images.items, '[]'::jsonb) as images,
  coalesce(options.items, '[]'::jsonb) as variants
from public.source_products p
join public.businesses b on b.id = p.business_id
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'url', image_url,
      'sort_order', sort_order
    ) order by sort_order, created_at
  ) as items
  from public.source_product_images
  where source_product_id = p.id
) images on true
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'id', id,
      'name', option_value,
      'price_php', selling_price_php,
      'sort_order', sort_order
    ) order by sort_order, created_at
  ) as items
  from public.source_product_options
  where source_product_id = p.id
) options on true
where p.status = 'active'
  and b.status = 'active'
  and (
    lower(b.name) = 'viae'
    or lower(coalesce(b.slug, '')) in ('viae', 'astera')
    or lower(coalesce(b.login_username, '')) in ('viae', 'astera')
  );

revoke all on public.viae_public_catalog from public;
grant select on public.viae_public_catalog to anon, authenticated;

comment on view public.viae_public_catalog is
  'Public, sanitized VIAE catalogue. Managed only through authenticated MIK product sourcing screens.';
