do $$
begin
  if not exists (select 1 from vault.secrets where name = 'viae_google_drive_token_key') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'base64'),
      'viae_google_drive_token_key',
      'Encryption key for VIAE Google Drive refresh tokens'
    );
  end if;
end $$;

create or replace function public.viae_google_drive_encryption_key()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'viae_google_drive_token_key'
  limit 1;
$$;

revoke all on function public.viae_google_drive_encryption_key() from public, anon, authenticated;
grant execute on function public.viae_google_drive_encryption_key() to service_role;
