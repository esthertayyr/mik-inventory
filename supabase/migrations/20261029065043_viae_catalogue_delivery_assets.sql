-- Delivery references are separate from generated catalogue metadata so reimports
-- cannot restore an obsolete download package or overwrite a shop display name.
alter table public.viae_design_catalogue add column display_title text,
 add column delivery_asset_metadata jsonb not null default '{}'::jsonb;
