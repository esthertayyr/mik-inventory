alter table public.sales add column viae_receipt_number bigint unique;
with numbered as (
  select id, row_number() over (order by created_at, receipt_number) as number
  from public.sales
  where business_id='3fe4c82d-a659-406b-b290-32d8a49f2bdf' and archived_at is null and status='completed'
)
update public.sales s set viae_receipt_number=n.number from numbered n where s.id=n.id;

create sequence public.viae_sale_receipt_seq;
revoke all on sequence public.viae_sale_receipt_seq from public, anon, authenticated;
select setval('public.viae_sale_receipt_seq', coalesce(max(viae_receipt_number),0)+1,false) from public.sales;

create function public.assign_viae_sale_receipt() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  new.viae_receipt_number := case when new.business_id='3fe4c82d-a659-406b-b290-32d8a49f2bdf'
    then nextval('public.viae_sale_receipt_seq'::regclass) end;
  return new;
end;
$$;
revoke execute on function public.assign_viae_sale_receipt() from public, anon, authenticated;
create trigger assign_viae_sale_receipt before insert on public.sales
for each row execute function public.assign_viae_sale_receipt();
