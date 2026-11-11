-- VIAE promotion assets are internal marketing material, separate from product media.
create table public.viae_social_folders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (business_id, name),
  unique (id, business_id)
);

create table public.viae_social_prompts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  folder_id uuid,
  title text not null check (length(trim(title)) between 1 and 100),
  prompt_text text not null check (length(trim(prompt_text)) between 1 and 5000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (folder_id, business_id) references public.viae_social_folders(id, business_id)
);

alter table public.shop_social_images
  add column folder_id uuid,
  add column prompt_text text,
  add constraint shop_social_images_folder_business_fkey
    foreign key (folder_id, business_id) references public.viae_social_folders(id, business_id);

insert into public.viae_social_folders (business_id, name)
select distinct business_id, 'Unsorted'
from public.shop_social_images
on conflict (business_id, name) do nothing;

update public.shop_social_images image
set folder_id = folder.id
from public.viae_social_folders folder
where folder.business_id = image.business_id
  and folder.name = 'Unsorted'
  and image.folder_id is null;

create index viae_social_folders_business_idx on public.viae_social_folders(business_id, name);
create index viae_social_prompts_business_idx on public.viae_social_prompts(business_id, created_at desc);

alter table public.viae_social_folders enable row level security;
alter table public.viae_social_prompts enable row level security;

grant select, insert, update, delete on public.viae_social_folders to authenticated;
grant select, insert, update, delete on public.viae_social_prompts to authenticated;
grant update on public.shop_social_images to authenticated;

create policy "VIAE team reads social folders" on public.viae_social_folders
  for select to authenticated using (public.is_business_member(business_id) or public.is_platform_admin());
create policy "VIAE owners manage social folders" on public.viae_social_folders
  for all to authenticated
  using (public.is_business_owner(business_id) or public.is_platform_admin())
  with check (public.is_business_owner(business_id) or public.is_platform_admin());

create policy "VIAE team reads social prompts" on public.viae_social_prompts
  for select to authenticated using (public.is_business_member(business_id) or public.is_platform_admin());
create policy "VIAE owners add social prompts" on public.viae_social_prompts
  for insert to authenticated with check (
    (public.is_business_owner(business_id) or public.is_platform_admin())
    and created_by = (select auth.uid())
  );
create policy "VIAE owners edit social prompts" on public.viae_social_prompts
  for update to authenticated
  using (public.is_business_owner(business_id) or public.is_platform_admin())
  with check (public.is_business_owner(business_id) or public.is_platform_admin());
create policy "VIAE owners delete social prompts" on public.viae_social_prompts
  for delete to authenticated using (public.is_business_owner(business_id) or public.is_platform_admin());

create policy "VIAE owners edit social image details" on public.shop_social_images
  for update to authenticated
  using (public.is_business_owner(business_id) or public.is_platform_admin())
  with check (public.is_business_owner(business_id) or public.is_platform_admin());

-- Marketing artwork is only accessed from MIK via authenticated signed URLs.
update storage.buckets set public = false, file_size_limit = 20971520 where id = 'social-posters';
