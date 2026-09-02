create table if not exists public.issue_reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  reported_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null check (category in ('Sales','Stock','Orders','Account','Something else')),
  message text not null check (char_length(trim(message)) between 5 and 1000),
  status text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists issue_reports_status_created_idx
  on public.issue_reports(status, created_at desc);

create index if not exists issue_reports_business_created_idx
  on public.issue_reports(business_id, created_at desc);

alter table public.issue_reports enable row level security;

drop policy if exists "Shop users can send reports" on public.issue_reports;
create policy "Shop users can send reports"
  on public.issue_reports for insert to authenticated
  with check (
    reported_by = auth.uid()
    and (public.is_business_member(business_id) or public.is_platform_admin())
  );

drop policy if exists "Platform admin can read reports" on public.issue_reports;
create policy "Platform admin can read reports"
  on public.issue_reports for select to authenticated
  using (public.is_platform_admin());

drop policy if exists "Platform admin can update reports" on public.issue_reports;
create policy "Platform admin can update reports"
  on public.issue_reports for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

revoke all on table public.issue_reports from anon;
grant insert on table public.issue_reports to authenticated;
grant select, update on table public.issue_reports to authenticated;
