alter table public.issue_reports
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_error text;

drop policy if exists "Shop users can read their reports" on public.issue_reports;
create policy "Shop users can read their reports"
  on public.issue_reports for select to authenticated
  using (
    reported_by = (select auth.uid())
    and public.is_business_member(business_id)
  );
