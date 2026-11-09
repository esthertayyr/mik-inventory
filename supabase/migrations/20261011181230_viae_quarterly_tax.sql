create table public.viae_tax_filings (
 business_id uuid not null references public.businesses(id),
 tax_year integer not null check(tax_year between 2020 and 2100),
 quarter integer not null check(quarter between 1 and 4),
 gross_adjustment_php numeric(14,2) not null default 0,
 adjustment_note text not null default '',
 filed boolean not null default false,
 paid_php numeric(14,2) not null default 0 check(paid_php>=0),
 paid_date date,
 reference text not null default '',
 due_override date,
 primary key(business_id,tax_year,quarter),
 check(paid_php=0 or paid_date is not null),
 check(gross_adjustment_php=0 or length(trim(adjustment_note))>0)
);
alter table public.viae_tax_filings enable row level security;
revoke all on public.viae_tax_filings from anon;
grant select,insert,update,delete on public.viae_tax_filings to authenticated;
create policy viae_tax_owner on public.viae_tax_filings for all to authenticated
using (exists(select 1 from public.businesses b where b.id=business_id and b.slug='astera') and (public.is_business_owner(business_id) or public.is_platform_admin()))
with check (exists(select 1 from public.businesses b where b.id=business_id and b.slug='astera') and (public.is_business_owner(business_id) or public.is_platform_admin()));

-- Full sale value once, not deposits plus final payments. Fulfilment dates are
-- an estimate of invoice timing; review adjustments against BIR invoices.
create function public.viae_tax_summary(b uuid,y integer)
returns table(quarter integer,gross_php numeric,sales_count bigint,missing_date_count bigint)
language sql stable security invoker set search_path='' as $$
 with entries as (
  select t.entry_date as day,t.amount_php as amount,false as missing
  from public.reseller_trade_entries t join public.businesses bs on bs.id=t.business_id
  where t.business_id=b and bs.slug='astera' and t.kind='sale' and t.status='completed'
  union all
  select coalesce(o.shipped_at,o.delivered_at,(o.created_at at time zone 'Asia/Manila')::date),
   o.total_price_php+o.delivery_fee_php, o.shipped_at is null and o.delivered_at is null
  from public.reseller_preorders o join public.businesses bs on bs.id=o.business_id
  where o.business_id=b and bs.slug='astera' and o.fulfilment_status in ('shipped','delivered')
 )
 select q,coalesce(sum(e.amount),0),count(e.day),count(e.day) filter(where e.missing)
 from generate_series(1,4) q left join entries e on extract(year from e.day)=y and extract(quarter from e.day)=q
 group by q order by q;
$$;
revoke all on function public.viae_tax_summary(uuid,integer) from public,anon;
grant execute on function public.viae_tax_summary(uuid,integer) to authenticated;
