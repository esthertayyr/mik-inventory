alter table public.viae_form_submissions
  add column if not exists email_notification_claimed_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'viae-enquiry-attachments',
  'viae-enquiry-attachments',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Public can upload VIAE enquiry images"
  on storage.objects for insert to anon
  with check (
    bucket_id = 'viae-enquiry-attachments'
    and (storage.foldername(name))[1] = '3fe4c82d-a659-406b-b290-32d8a49f2bdf'
    and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  );

create policy "VIAE owners can read enquiry images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'viae-enquiry-attachments'
    and (storage.foldername(name))[1] = '3fe4c82d-a659-406b-b290-32d8a49f2bdf'
    and (
      public.is_platform_admin()
      or exists (
        select 1 from public.business_memberships m
        where m.business_id = '3fe4c82d-a659-406b-b290-32d8a49f2bdf'::uuid
          and m.user_id = (select auth.uid())
          and m.role = 'owner'
      )
    )
  );
