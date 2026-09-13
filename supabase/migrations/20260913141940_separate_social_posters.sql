-- Finished social posters are separate from product and order photos.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('social-posters','social-posters',true,5242880,array['image/jpeg'])
on conflict (id) do nothing;

create policy "shop owners upload social posters" on storage.objects
for insert to authenticated with check (
  bucket_id='social-posters'
  and (storage.foldername(name))[2]='social'
  and (public.is_business_owner(((storage.foldername(name))[1])::uuid)
    or public.is_platform_admin())
);

create policy "shop owners remove social posters" on storage.objects
for delete to authenticated using (
  bucket_id='social-posters'
  and (storage.foldername(name))[2]='social'
  and (public.is_business_owner(((storage.foldername(name))[1])::uuid)
    or public.is_platform_admin())
);

create policy "shop members list social posters" on storage.objects
for select to authenticated using (
  bucket_id='social-posters'
  and (storage.foldername(name))[2]='social'
  and (public.is_business_member(((storage.foldername(name))[1])::uuid)
    or public.is_platform_admin())
);
