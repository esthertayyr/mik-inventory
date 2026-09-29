-- Product sourcing is available to shop members and to the MIK platform owner.
-- Keep Storage access aligned with the source_products RLS policies so a photo
-- does not fail after the product record has already been saved.
drop policy if exists "shop teams upload product images" on storage.objects;
create policy "shop teams upload product images" on storage.objects
for insert to authenticated with check (
  bucket_id = 'product-images'
  and (
    public.is_business_member(((storage.foldername(name))[1])::uuid)
    or public.is_platform_admin()
  )
);

drop policy if exists "shop teams replace product images" on storage.objects;
create policy "shop teams replace product images" on storage.objects
for update to authenticated using (
  bucket_id = 'product-images'
  and (
    public.is_business_member(((storage.foldername(name))[1])::uuid)
    or public.is_platform_admin()
  )
) with check (
  bucket_id = 'product-images'
  and (
    public.is_business_member(((storage.foldername(name))[1])::uuid)
    or public.is_platform_admin()
  )
);

drop policy if exists "shop teams delete product images" on storage.objects;
create policy "shop teams delete product images" on storage.objects
for delete to authenticated using (
  bucket_id = 'product-images'
  and (
    public.is_business_member(((storage.foldername(name))[1])::uuid)
    or public.is_platform_admin()
  )
);
