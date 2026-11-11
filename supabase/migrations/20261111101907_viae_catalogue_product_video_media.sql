alter table public.viae_design_catalogue
  add column if not exists media_assets jsonb not null default '[]'::jsonb;

alter table public.viae_design_catalogue
  drop constraint if exists viae_catalogue_media_assets_array;
alter table public.viae_design_catalogue
  add constraint viae_catalogue_media_assets_array
  check (jsonb_typeof(media_assets) = 'array');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'viae-product-media',
  'viae-product-media',
  true,
  52428800,
  array['image/jpeg','image/png','image/webp','video/mp4','video/webm']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "VIAE product media public read" on storage.objects;
create policy "VIAE product media public read"
on storage.objects for select to anon, authenticated
using (bucket_id = 'viae-product-media');

drop policy if exists "VIAE owners upload product media" on storage.objects;
create policy "VIAE owners upload product media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'viae-product-media'
  and (storage.foldername(name))[2] = 'catalogue'
  and public.is_business_owner(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "VIAE owners update product media" on storage.objects;
create policy "VIAE owners update product media"
on storage.objects for update to authenticated
using (
  bucket_id = 'viae-product-media'
  and (storage.foldername(name))[2] = 'catalogue'
  and public.is_business_owner(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'viae-product-media'
  and (storage.foldername(name))[2] = 'catalogue'
  and public.is_business_owner(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "VIAE owners delete product media" on storage.objects;
create policy "VIAE owners delete product media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'viae-product-media'
  and (storage.foldername(name))[2] = 'catalogue'
  and public.is_business_owner(((storage.foldername(name))[1])::uuid)
);

create or replace view public.viae_storefront_catalogue with (security_barrier=true) as
select id,catalogue_code,coalesce(nullif(display_title,''),title) title,category,design_count,preview_url,
digital_enabled,printed_enabled,digital_price_php,printed_price_php,preparation_days,
jsonb_build_object(
'digitalIncludes',delivery_asset_metadata->'customer_details'->>'digitalIncludes',
'printedIncludes',delivery_asset_metadata->'customer_details'->>'printedIncludes',
'includedDesigns',delivery_asset_metadata->'customer_details'->>'includedDesigns',
'fileFormats',delivery_asset_metadata->'customer_details'->>'fileFormats',
'dimensions',delivery_asset_metadata->'customer_details'->>'dimensions',
'printingNotes',delivery_asset_metadata->'customer_details'->>'printingNotes') customer_details,
case
  when jsonb_typeof(media_assets) = 'array' then (
    select coalesce(jsonb_agg(jsonb_build_object(
      'url', asset->>'url',
      'type', case when asset->>'type' = 'video' then 'video' else 'image' end,
      'title', nullif(asset->>'title',''),
      'sort_order', coalesce((asset->>'sort_order')::integer, 0)
    ) order by coalesce((asset->>'sort_order')::integer, 0)), '[]'::jsonb)
    from jsonb_array_elements(media_assets) asset
    where (asset->>'url') ~ '^https://'
      and asset->>'type' in ('image','video')
  )
  else '[]'::jsonb
end media_assets
from public.viae_design_catalogue
where business_id='3fe4c82d-a659-406b-b290-32d8a49f2bdf' and website_status='published' and source_present and not internal_only;

revoke all on public.viae_storefront_catalogue from public;
grant select on public.viae_storefront_catalogue to anon,authenticated;
comment on view public.viae_storefront_catalogue is 'Public storefront projection with published preview media only. Never exposes source metadata, original files, storage paths, paid assets or staff data.';
