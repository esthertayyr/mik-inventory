create table public.sale_receipts (
 record_kind text not null check (record_kind in ('sale','trade_sale','preorder','order')),
 record_id uuid not null,
 location_id uuid not null references public.locations(id),
 storage_path text not null,
 primary key(record_kind,record_id),
 check (storage_path like location_id::text || '/' || record_kind || '/' || record_id::text || '/%')
);
create index sale_receipts_location_idx on public.sale_receipts(location_id);
alter table public.sale_receipts enable row level security;
revoke all on public.sale_receipts from anon;
grant select,insert,update,delete on public.sale_receipts to authenticated;
create policy receipt_team_access on public.sale_receipts for all to authenticated
using (public.can_access_location(location_id) or public.is_platform_admin())
with check (public.can_access_location(location_id) or public.is_platform_admin());
create function public.validate_sale_receipt() returns trigger language plpgsql security invoker set search_path='' as $$
declare parent_location uuid;
begin
 case new.record_kind
 when 'sale' then select location_id into parent_location from public.sales where id=new.record_id;
 when 'trade_sale' then select location_id into parent_location from public.reseller_trade_entries where id=new.record_id and kind='sale';
 when 'preorder' then select location_id into parent_location from public.reseller_preorders where id=new.record_id;
 when 'order' then select location_id into parent_location from public.external_orders where id=new.record_id;
 end case;
 if parent_location is null or parent_location<>new.location_id then raise exception 'Sale not accessible'; end if;
 return new;
end $$;
create trigger validate_sale_receipt before insert or update on public.sale_receipts for each row execute function public.validate_sale_receipt();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('sale-receipts','sale-receipts',false,10485760,array['image/jpeg','image/png','image/webp']);
create policy private_receipt_storage on storage.objects for all to authenticated
using (bucket_id='sale-receipts' and (public.can_access_location((storage.foldername(name))[1]::uuid) or public.is_platform_admin()))
with check (bucket_id='sale-receipts' and (public.can_access_location((storage.foldername(name))[1]::uuid) or public.is_platform_admin()));
