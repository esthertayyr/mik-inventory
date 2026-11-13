drop policy if exists "VIAE owners can add private catalogue files" on storage.objects;
drop policy if exists "VIAE owners can replace private catalogue files" on storage.objects;

create policy "VIAE owners can add private catalogue files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'viae-catalogue-files'
  and name ~ '^[A-Z]+[0-9]{3,}/(download[.](html|3mf|stl)|parts/[0-9]+-[^/]+[.](html|3mf|stl))$'
  and (public.is_business_owner('3fe4c82d-a659-406b-b290-32d8a49f2bdf') or public.is_platform_admin())
);

create policy "VIAE owners can replace private catalogue files"
on storage.objects for update to authenticated
using (
  bucket_id = 'viae-catalogue-files'
  and name ~ '^[A-Z]+[0-9]{3,}/(download[.](html|3mf|stl)|parts/[0-9]+-[^/]+[.](html|3mf|stl))$'
  and (public.is_business_owner('3fe4c82d-a659-406b-b290-32d8a49f2bdf') or public.is_platform_admin())
)
with check (
  bucket_id = 'viae-catalogue-files'
  and name ~ '^[A-Z]+[0-9]{3,}/(download[.](html|3mf|stl)|parts/[0-9]+-[^/]+[.](html|3mf|stl))$'
  and (public.is_business_owner('3fe4c82d-a659-406b-b290-32d8a49f2bdf') or public.is_platform_admin())
);
