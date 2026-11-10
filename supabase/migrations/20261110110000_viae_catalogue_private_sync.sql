insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('viae-catalogue-files', 'viae-catalogue-files', false, 50000000, array['application/zip','text/html','application/octet-stream']);

create policy "VIAE team can read private catalogue files"
on storage.objects for select to authenticated
using (
  bucket_id = 'viae-catalogue-files'
  and (public.is_business_member('3fe4c82d-a659-406b-b290-32d8a49f2bdf') or public.is_platform_admin())
);

create policy "VIAE owners can add private catalogue files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'viae-catalogue-files'
  and name ~ '^[A-Z]+[0-9]{3,}/download[.](zip|html|3mf|stl)$'
  and (public.is_business_owner('3fe4c82d-a659-406b-b290-32d8a49f2bdf') or public.is_platform_admin())
);

create policy "VIAE owners can replace private catalogue files"
on storage.objects for update to authenticated
using (
  bucket_id = 'viae-catalogue-files'
  and (public.is_business_owner('3fe4c82d-a659-406b-b290-32d8a49f2bdf') or public.is_platform_admin())
)
with check (
  bucket_id = 'viae-catalogue-files'
  and name ~ '^[A-Z]+[0-9]{3,}/download[.](zip|html|3mf|stl)$'
  and (public.is_business_owner('3fe4c82d-a659-406b-b290-32d8a49f2bdf') or public.is_platform_admin())
);

-- Share the existing importer. Only the explicit JSON import reconciles missing rows.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.import_viae_design_catalogue(jsonb)'::regprocedure) into definition;
  definition := replace(definition, '(p_items jsonb)', '(p_items jsonb, p_reconcile_missing boolean)');
  definition := replace(definition, ' update public.viae_design_catalogue set source_present=false', ' if p_reconcile_missing then update public.viae_design_catalogue set source_present=false');
  definition := replace(definition, ' return imported;', ' end if; return imported;');
  execute definition;
end $$;
revoke execute on function public.import_viae_design_catalogue(jsonb,boolean) from public,anon;
grant execute on function public.import_viae_design_catalogue(jsonb,boolean) to authenticated;

create or replace function public.import_viae_design_catalogue(p_items jsonb)
returns integer language sql set search_path='' as $$
  select public.import_viae_design_catalogue(p_items, true);
$$;
