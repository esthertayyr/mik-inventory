-- A resolved report is announced once per shop account, across devices.
alter table public.issue_reports add column resolution_notice_at timestamptz;
drop policy if exists "Shop users can read their reports" on public.issue_reports;
create policy "Shop members can read shop reports" on public.issue_reports
for select to authenticated using (public.is_business_member(business_id));

create table public.issue_resolution_acks (
  issue_id uuid not null references public.issue_reports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  notice_at timestamptz not null,
  seen_at timestamptz not null default now(),
  primary key(issue_id,user_id,notice_at)
);
alter table public.issue_resolution_acks enable row level security;
grant select,insert on public.issue_resolution_acks to authenticated;

create policy "shop user reads own issue acknowledgements" on public.issue_resolution_acks
for select to authenticated using (user_id=(select auth.uid()));
create policy "shop user acknowledges resolved issues" on public.issue_resolution_acks
for insert to authenticated with check (
  user_id=(select auth.uid())
  and exists (
    select 1 from public.issue_reports issue
    where issue.id=issue_id and issue.status='resolved'
      and issue.resolution_notice_at=notice_at
      and public.is_business_member(issue.business_id)
  )
);
