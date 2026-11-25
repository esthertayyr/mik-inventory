alter table public.viae_drive_files
  add column if not exists source_last_modified bigint;

comment on column public.viae_drive_files.source_last_modified is
  'Local VIAE source file lastModified timestamp in milliseconds, used to skip unchanged files during Drive sync.';
