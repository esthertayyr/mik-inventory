drop policy if exists "VIAE team can read private catalogue files" on storage.objects;

create policy "VIAE team can read private catalogue files"
on storage.objects for select to authenticated
using (
  bucket_id = 'viae-catalogue-files'
  and (
    public.is_business_member('3fe4c82d-a659-406b-b290-32d8a49f2bdf')
    or public.is_platform_admin()
    or exists (
      select 1 from public.shop_staff_accounts s
      where s.user_id = (select auth.uid())
        and s.business_id = '3fe4c82d-a659-406b-b290-32d8a49f2bdf'
        and s.active
    )
  )
);
