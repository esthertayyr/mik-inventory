create table if not exists public.viae_drive_connections (
  business_id uuid primary key,
  google_email text not null,
  drive_folder_id text not null,
  encrypted_refresh_token text not null,
  connected_by uuid not null references auth.users(id) on delete restrict,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.viae_drive_oauth_states (
  state text primary key,
  code_verifier text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  return_to text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.viae_drive_files (
  business_id uuid not null,
  relative_path text not null,
  drive_file_id text not null,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (business_id, relative_path)
);

alter table public.viae_drive_connections enable row level security;
alter table public.viae_drive_oauth_states enable row level security;
alter table public.viae_drive_files enable row level security;

revoke all on public.viae_drive_connections, public.viae_drive_oauth_states, public.viae_drive_files from anon, authenticated;
grant all on public.viae_drive_connections, public.viae_drive_oauth_states, public.viae_drive_files to service_role;

create index if not exists viae_drive_files_drive_id_idx on public.viae_drive_files (drive_file_id);
create index if not exists viae_drive_oauth_states_created_at_idx on public.viae_drive_oauth_states (created_at);

comment on table public.viae_drive_connections is 'Private Google Drive OAuth connection for VIAE. Refresh token is encrypted by the Edge Function and never readable by app clients.';
comment on table public.viae_drive_files is 'Private mapping between VIAE catalogue relative paths and files in the connected Google Drive folder.';
