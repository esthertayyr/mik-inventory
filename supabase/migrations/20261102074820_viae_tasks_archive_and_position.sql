alter table public.viae_tasks add column archived_at timestamptz, add column position double precision not null default 0;
