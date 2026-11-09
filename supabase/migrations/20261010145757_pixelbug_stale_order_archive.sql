alter table public.external_orders add column if not exists archived_at timestamptz;
alter table public.order_enquiries add column if not exists archived_at timestamptz;
create table public.outside_orders (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id),
 location_id uuid not null references public.locations(id),
 title text not null check(length(trim(title))>0),
 image_url text,
 srp numeric(12,2) not null check(srp>=0),
 cost numeric(12,2) not null check(cost>=0),
 profit numeric(12,2) generated always as (srp-cost) stored,
 quantity integer not null default 1 check(quantity>0),
 remarks text,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index outside_orders_location on public.outside_orders(location_id,created_at desc);
alter table public.outside_orders enable row level security;
revoke all on public.outside_orders from anon,authenticated;
grant select,insert,update,delete on public.outside_orders to authenticated;
create policy outside_orders_read on public.outside_orders for select to authenticated using(public.can_access_location(location_id) or public.is_platform_admin() or public.can_view_platform_shop(business_id));
create policy outside_orders_insert on public.outside_orders for insert to authenticated with check((public.can_access_location(location_id) or public.is_platform_admin()) and created_by=auth.uid() and exists(select 1 from public.locations l where l.id=location_id and l.business_id=outside_orders.business_id));
create policy outside_orders_update on public.outside_orders for update to authenticated using(public.can_access_location(location_id) or public.is_platform_admin()) with check((public.can_access_location(location_id) or public.is_platform_admin()) and exists(select 1 from public.locations l where l.id=location_id and l.business_id=outside_orders.business_id));
create policy outside_orders_delete on public.outside_orders for delete to authenticated using(public.can_access_location(location_id) or public.is_platform_admin());
create trigger outside_orders_updated before update on public.outside_orders for each row execute function public.touch_order_enquiry_updated_at();
create extension if not exists pg_cron;
select cron.schedule('pixelbug-stale-order-archive','0 * * * *',$job$
 update public.external_orders o set archived_at=now()
 where o.business_id in(select id from public.businesses where slug='sebu3d')
 and o.archived_at is null and o.status='new' and coalesce(o.amount_paid,0)=0
 and not coalesce(o.is_past_order,false) and o.updated_at<now()-interval '7 days'
 and not exists(select 1 from public.order_payments p where p.order_id=o.id and p.amount>0);
 update public.order_enquiries e set archived_at=now()
 where e.business_id in(select id from public.businesses where slug='sebu3d')
 and e.archived_at is null and e.status='open' and e.updated_at<now()-interval '7 days';
$job$);
