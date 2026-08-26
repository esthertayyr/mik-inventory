-- Shared shop team accounts can create products. Product photos are kept in one public bucket;
-- only the matching shop can upload or replace files in its folder.

create unique index if not exists products_business_name_key
  on public.products (business_id, lower(name));

-- Product and starting stock are saved together so a half-created item cannot appear.
create or replace function public.create_product_with_stock(
  p_business_id uuid,
  p_location_id uuid,
  p_name text,
  p_category_id uuid,
  p_regular_price numeric,
  p_sale_price numeric,
  p_starting_stock integer
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_product_id uuid;
begin
  if not public.is_business_owner(p_business_id) then raise exception 'Shop access required'; end if;
  if not exists(select 1 from public.locations where id=p_location_id and business_id=p_business_id and active) then raise exception 'Shop location not available'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Enter a product name'; end if;
  if p_starting_stock<0 then raise exception 'Starting stock cannot be negative'; end if;
  if p_regular_price<0 or p_sale_price<0 then raise exception 'Price cannot be negative'; end if;
  if p_category_id is not null and not exists(select 1 from public.categories where id=p_category_id and business_id=p_business_id and active) then raise exception 'Category not available'; end if;

  insert into public.products(business_id,category_id,name,regular_price,sale_price)
  values(p_business_id,p_category_id,trim(p_name),p_regular_price,p_sale_price)
  returning id into v_product_id;
  insert into public.inventory_levels(product_id,location_id,quantity_on_hand,needs_stock_count)
  values(v_product_id,p_location_id,p_starting_stock,false);
  if p_starting_stock>0 then
    insert into public.inventory_movements(location_id,product_id,movement_type,quantity_change,note,created_by)
    values(p_location_id,v_product_id,'stock_in',p_starting_stock,'Starting stock',auth.uid());
  end if;
  return v_product_id;
end $$;

grant execute on function public.create_product_with_stock(uuid,uuid,text,uuid,numeric,numeric,integer) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 10485760, array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "shop teams view product images" on storage.objects;
create policy "shop teams view product images" on storage.objects
for select to authenticated using (bucket_id='product-images');

drop policy if exists "shop teams upload product images" on storage.objects;
create policy "shop teams upload product images" on storage.objects
for insert to authenticated with check (
  bucket_id='product-images'
  and public.is_business_owner(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "shop teams replace product images" on storage.objects;
create policy "shop teams replace product images" on storage.objects
for update to authenticated using (
  bucket_id='product-images'
  and public.is_business_owner(((storage.foldername(name))[1])::uuid)
) with check (
  bucket_id='product-images'
  and public.is_business_owner(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "shop teams delete product images" on storage.objects;
create policy "shop teams delete product images" on storage.objects
for delete to authenticated using (
  bucket_id='product-images'
  and public.is_business_owner(((storage.foldername(name))[1])::uuid)
);
