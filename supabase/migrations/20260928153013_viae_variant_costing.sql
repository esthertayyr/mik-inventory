alter table public.source_products
  add column if not exists source_currency text not null default 'SGD',
  add column if not exists source_price numeric(12,2) not null default 0,
  add column if not exists tax_percent numeric(5,2) not null default 3,
  add column if not exists shipping_type text not null default 'free',
  add column if not exists shipping_amount numeric(12,2) not null default 0,
  add column if not exists currency_to_php_rate numeric(12,4) not null default 45;

alter table public.source_products
  drop constraint if exists source_products_source_currency_check,
  drop constraint if exists source_products_source_price_check,
  drop constraint if exists source_products_tax_percent_check,
  drop constraint if exists source_products_shipping_type_check,
  drop constraint if exists source_products_shipping_amount_check,
  drop constraint if exists source_products_currency_to_php_rate_check;

alter table public.source_products
  add constraint source_products_source_currency_check check (source_currency in ('RMB','SGD')),
  add constraint source_products_source_price_check check (source_price >= 0),
  add constraint source_products_tax_percent_check check (tax_percent >= 0 and tax_percent <= 100),
  add constraint source_products_shipping_type_check check (shipping_type in ('free','paid')),
  add constraint source_products_shipping_amount_check check (shipping_amount >= 0),
  add constraint source_products_currency_to_php_rate_check check (currency_to_php_rate > 0);

update public.source_products
set source_currency = 'SGD',
    source_price = final_cost_sgd,
    tax_percent = 3,
    shipping_type = 'free',
    shipping_amount = 0,
    currency_to_php_rate = exchange_rate_sgd_php
where source_price = 0 and final_cost_sgd > 0;

alter table public.source_product_options
  add column if not exists source_price numeric(12,2),
  add constraint source_product_options_source_price_check check (source_price is null or source_price >= 0);

update public.source_product_options
set source_price = price_sgd
where source_price is null and price_sgd is not null;

alter table public.reseller_package_items
  add column if not exists source_product_option_id uuid references public.source_product_options(id) on delete restrict;

alter table public.reseller_package_items
  drop constraint if exists reseller_package_items_package_id_source_product_id_key;

create unique index if not exists reseller_package_items_package_product_option_key
  on public.reseller_package_items(package_id, source_product_id, coalesce(source_product_option_id, '00000000-0000-0000-0000-000000000000'::uuid));
