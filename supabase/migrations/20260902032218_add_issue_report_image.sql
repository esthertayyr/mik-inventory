alter table public.issue_reports
  add column if not exists image_url text;
