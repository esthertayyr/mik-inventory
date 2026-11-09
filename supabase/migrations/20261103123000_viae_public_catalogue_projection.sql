create or replace view public.viae_storefront_catalogue with (security_barrier=true) as
select id,catalogue_code,coalesce(nullif(display_title,''),title) title,category,design_count,preview_url,digital_enabled,printed_enabled,digital_price_php,printed_price_php,preparation_days,
jsonb_build_object(
'digitalIncludes',delivery_asset_metadata->'customer_details'->>'digitalIncludes',
'printedIncludes',delivery_asset_metadata->'customer_details'->>'printedIncludes',
'includedDesigns',delivery_asset_metadata->'customer_details'->>'includedDesigns',
'fileFormats',delivery_asset_metadata->'customer_details'->>'fileFormats',
'dimensions',delivery_asset_metadata->'customer_details'->>'dimensions',
'printingNotes',delivery_asset_metadata->'customer_details'->>'printingNotes') customer_details
from public.viae_design_catalogue
where business_id='3fe4c82d-a659-406b-b290-32d8a49f2bdf' and website_status='published' and source_present and not internal_only;
revoke all on public.viae_storefront_catalogue from public;
grant select on public.viae_storefront_catalogue to anon,authenticated;
comment on view public.viae_storefront_catalogue is 'Public storefront projection. Deliberately exposes only published non-internal product fields. No source metadata, file paths, paid assets or staff information.';
alter table public.viae_design_catalogue drop constraint viae_publish_ready;
alter table public.viae_design_catalogue add constraint viae_publish_ready check(website_status<>'published' or (source_present and preview_url ~ '^https://' and (digital_enabled or printed_enabled or category='Generator')));

