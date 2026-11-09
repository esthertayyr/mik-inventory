-- Default project grants include destructive privileges; keep only UI operations.
revoke all on public.viae_design_catalogue from authenticated,anon;
grant select,insert,update on public.viae_design_catalogue to authenticated;
