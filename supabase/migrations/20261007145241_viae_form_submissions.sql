create table if not exists public.viae_form_submissions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  form_type text not null check (form_type in ('contact', 'print_service')),
  name text not null check (char_length(trim(name)) between 1 and 120),
  email text not null default '',
  phone text not null default '',
  business_name text not null default '',
  subject text not null default '',
  message text not null default '',
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved')),
  internal_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint viae_submission_contact_required check (email <> '' or phone <> '')
);

create index if not exists viae_form_submissions_business_created_idx
  on public.viae_form_submissions (business_id, created_at desc);

alter table public.viae_form_submissions enable row level security;
revoke all on public.viae_form_submissions from anon, authenticated;
grant insert on public.viae_form_submissions to anon;
grant select on public.viae_form_submissions to authenticated;
grant update (status, internal_note, updated_at) on public.viae_form_submissions to authenticated;

create policy "Public VIAE form submissions only"
  on public.viae_form_submissions for insert to anon
  with check (
    business_id = '3fe4c82d-a659-406b-b290-32d8a49f2bdf'::uuid
    and status = 'new'
    and internal_note = ''
  );

create policy "VIAE owners can read submissions"
  on public.viae_form_submissions for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.business_memberships m
      where m.business_id = viae_form_submissions.business_id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
    )
  );

create policy "VIAE owners can update submission status"
  on public.viae_form_submissions for update to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.business_memberships m
      where m.business_id = viae_form_submissions.business_id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
    )
  )
  with check (
    business_id = '3fe4c82d-a659-406b-b290-32d8a49f2bdf'::uuid
    and (
      public.is_platform_admin()
      or exists (
        select 1 from public.business_memberships m
        where m.business_id = viae_form_submissions.business_id
          and m.user_id = (select auth.uid())
          and m.role = 'owner'
      )
    )
  );
create table if not exists public.viae_form_submissions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  form_type text not null check (form_type in ('contact', 'print_service')),
  name text not null check (char_length(trim(name)) between 1 and 120),
  email text not null default '',
  phone text not null default '',
  business_name text not null default '',
  subject text not null default '',
  message text not null default '',
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved')),
  internal_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint viae_submission_contact_required check (email <> '' or phone <> '')
);

create index if not exists viae_form_submissions_business_created_idx
  on public.viae_form_submissions (business_id, created_at desc);

alter table public.viae_form_submissions enable row level security;
revoke all on public.viae_form_submissions from anon, authenticated;
grant insert on public.viae_form_submissions to anon;
grant select on public.viae_form_submissions to authenticated;
grant update (status, internal_note, updated_at) on public.viae_form_submissions to authenticated;

create policy "Public VIAE form submissions only"
  on public.viae_form_submissions for insert to anon
  with check (
    business_id = '3fe4c82d-a659-406b-b290-32d8a49f2bdf'::uuid
    and status = 'new'
    and internal_note = ''
  );

create policy "VIAE owners can read submissions"
  on public.viae_form_submissions for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.business_memberships m
      where m.business_id = viae_form_submissions.business_id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
    )
  );

create policy "VIAE owners can update submission status"
  on public.viae_form_submissions for update to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.business_memberships m
      where m.business_id = viae_form_submissions.business_id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
    )
  )
  with check (
    business_id = '3fe4c82d-a659-406b-b290-32d8a49f2bdf'::uuid
    and (
      public.is_platform_admin()
      or exists (
        select 1 from public.business_memberships m
        where m.business_id = viae_form_submissions.business_id
          and m.user_id = (select auth.uid())
          and m.role = 'owner'
      )
    )
  );
