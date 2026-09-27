alter table public.source_products
  alter column product_url drop not null,
  add column if not exists category_name text not null default 'Uncategorised',
  add column if not exists idea_stage text not null default 'idea';

alter table public.source_products drop constraint if exists source_products_idea_stage_check;
alter table public.source_products add constraint source_products_idea_stage_check
  check (idea_stage in ('idea','researching','shortlisted','ready_to_order','ordered','not_proceeding'));
