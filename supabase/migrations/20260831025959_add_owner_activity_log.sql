create table public.activity_logs (
  id bigint generated always as identity primary key,
  business_id uuid references public.businesses(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null default 'System',
  action text not null,
  entity_type text not null,
  entity_id text,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_logs_created_idx on public.activity_logs(created_at desc);
create index activity_logs_business_created_idx on public.activity_logs(business_id,created_at desc);
create index activity_logs_action_created_idx on public.activity_logs(action,created_at desc);

alter table public.activity_logs enable row level security;
revoke all on table public.activity_logs from anon, authenticated;
grant select on table public.activity_logs to authenticated;

create policy "platform admins read activity logs"
on public.activity_logs for select to authenticated
using (public.is_platform_admin());

create or replace function public.capture_shop_activity() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  v_business_id uuid;
  v_location_id uuid;
  v_actor_id uuid:=auth.uid();
  v_actor_name text;
  v_action text;
  v_entity_type text:=tg_table_name;
  v_entity_id text;
  v_summary text;
  v_details jsonb:='{}'::jsonb;
  v_product_name text;
begin
  select display_name into v_actor_name from public.profiles where id=v_actor_id;
  v_actor_name:=coalesce(v_actor_name,'System');

  if tg_table_name='products' then
    v_business_id:=new.business_id;
    v_entity_id:=new.id::text;
    if tg_op='INSERT' then
      v_action:='product_created';
      v_summary:='Product created: '||new.name;
    elsif old.active and not new.active then
      v_action:='product_deleted';
      v_summary:='Product deleted: '||old.name;
    else
      v_action:='product_updated';
      v_summary:='Product updated: '||new.name;
    end if;
    v_details:=jsonb_build_object(
      'before',case when tg_op='UPDATE' then jsonb_build_object('name',old.name,'regular_price',old.regular_price,'sale_price',old.sale_price,'category_id',old.category_id,'active',old.active) else null end,
      'after',jsonb_build_object('name',new.name,'regular_price',new.regular_price,'sale_price',new.sale_price,'category_id',new.category_id,'active',new.active)
    );
  elsif tg_table_name='sales' then
    v_business_id:=new.business_id;
    v_location_id:=new.location_id;
    v_entity_id:=new.id::text;
    if tg_op='INSERT' then
      v_action:='sale_completed';
      v_summary:='Sale completed: SALE-'||new.receipt_number||' · ₱'||trim(to_char(new.total,'FM999999990.00'));
    elsif old.status is distinct from new.status and new.status='voided' then
      v_action:='sale_removed';
      v_summary:='Sale removed: SALE-'||new.receipt_number;
    else
      v_action:='sale_updated';
      v_summary:='Sale updated: SALE-'||new.receipt_number;
    end if;
    v_details:=jsonb_build_object('total',new.total,'payment_method',new.payment_method,'status',new.status);
  elsif tg_table_name='external_orders' then
    v_business_id:=new.business_id;
    v_location_id:=new.location_id;
    v_entity_id:=new.id::text;
    if tg_op='INSERT' then
      v_action:='order_created';
      v_summary:='Order created: ORD-'||new.order_number||' · '||new.title;
    elsif old.status is distinct from new.status then
      v_action:='order_status_changed';
      v_summary:='Order status changed: ORD-'||new.order_number||' · '||old.status||' to '||new.status;
    else
      v_action:='order_updated';
      v_summary:='Order updated: ORD-'||new.order_number||' · '||new.title;
    end if;
    v_details:=jsonb_build_object('title',new.title,'status',new.status,'total_price',new.total_price,'amount_paid',new.amount_paid);
  elsif tg_table_name='inventory_movements' then
    if new.sale_id is not null then return new; end if;
    select p.business_id,p.name into v_business_id,v_product_name from public.products p where p.id=new.product_id;
    v_location_id:=new.location_id;
    v_entity_id:=new.id::text;
    v_action:='stock_changed';
    v_summary:='Stock changed: '||coalesce(v_product_name,'Product')||' · '||case when new.quantity_change>0 then '+' else '' end||new.quantity_change;
    v_details:=jsonb_build_object('movement_type',new.movement_type,'quantity_change',new.quantity_change,'note',new.note,'product_id',new.product_id);
  elsif tg_table_name='businesses' then
    v_business_id:=new.id;
    v_entity_id:=new.id::text;
    v_action:=case when tg_op='INSERT' then 'shop_created' else 'shop_updated' end;
    v_summary:=case when tg_op='INSERT' then 'Shop account created: ' else 'Shop updated: ' end||new.name;
    v_details:=jsonb_build_object('name',new.name,'status',new.status,'login_username',new.login_username);
  end if;

  if v_summary is not null then
    insert into public.activity_logs(business_id,location_id,actor_id,actor_name,action,entity_type,entity_id,summary,details)
    values(v_business_id,v_location_id,v_actor_id,v_actor_name,v_action,v_entity_type,v_entity_id,v_summary,v_details);
  end if;
  return new;
end $$;

revoke execute on function public.capture_shop_activity() from public, anon, authenticated;

create trigger products_activity after insert or update on public.products
for each row execute function public.capture_shop_activity();
create trigger sales_activity after insert or update on public.sales
for each row execute function public.capture_shop_activity();
create trigger external_orders_activity after insert or update on public.external_orders
for each row execute function public.capture_shop_activity();
create trigger inventory_movements_activity after insert on public.inventory_movements
for each row execute function public.capture_shop_activity();
create trigger businesses_activity after insert or update on public.businesses
for each row execute function public.capture_shop_activity();

create or replace function public.record_login_activity() returns void
language plpgsql security definer set search_path=public as $$
declare
  v_business_id uuid;
  v_actor_name text;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select display_name into v_actor_name from public.profiles where id=auth.uid();
  if not public.is_platform_admin() then
    select business_id into v_business_id
    from public.business_memberships
    where user_id=auth.uid()
    order by business_id
    limit 1;
  end if;
  insert into public.activity_logs(business_id,actor_id,actor_name,action,entity_type,entity_id,summary)
  values(v_business_id,auth.uid(),coalesce(v_actor_name,'Shop user'),'login','account',auth.uid()::text,
    case when public.is_platform_admin() then 'Owner signed in' else 'Shop account signed in' end);
end $$;

revoke execute on function public.record_login_activity() from public, anon;
grant execute on function public.record_login_activity() to authenticated;

-- Build a useful starting history from records MIK already has. Login history
-- begins with this release because earlier app sign-ins were not stored here.
insert into public.activity_logs(business_id,actor_id,actor_name,action,entity_type,entity_id,summary,details,created_at)
select p.business_id,null,'System','product_created','products',p.id::text,
  'Product created: '||p.name,
  jsonb_build_object('name',p.name,'regular_price',p.regular_price,'sale_price',p.sale_price,'active',p.active),p.created_at
from public.products p;

insert into public.activity_logs(business_id,location_id,actor_id,actor_name,action,entity_type,entity_id,summary,details,created_at)
select s.business_id,s.location_id,s.created_by,coalesce(pr.display_name,'System'),'sale_completed','sales',s.id::text,
  'Sale completed: SALE-'||s.receipt_number||' · ₱'||trim(to_char(s.total,'FM999999990.00')),
  jsonb_build_object('total',s.total,'payment_method',s.payment_method,'status',s.status),s.created_at
from public.sales s left join public.profiles pr on pr.id=s.created_by;

insert into public.activity_logs(business_id,location_id,actor_id,actor_name,action,entity_type,entity_id,summary,details,created_at)
select s.business_id,s.location_id,s.voided_by,coalesce(pr.display_name,'System'),'sale_removed','sales',s.id::text,
  'Sale removed: SALE-'||s.receipt_number,jsonb_build_object('total',s.total),s.voided_at
from public.sales s left join public.profiles pr on pr.id=s.voided_by
where s.voided_at is not null;

insert into public.activity_logs(business_id,location_id,actor_id,actor_name,action,entity_type,entity_id,summary,details,created_at)
select o.business_id,o.location_id,o.created_by,coalesce(pr.display_name,'System'),'order_created','external_orders',o.id::text,
  'Order created: ORD-'||o.order_number||' · '||o.title,
  jsonb_build_object('title',o.title,'status',o.status,'total_price',o.total_price,'amount_paid',o.amount_paid),o.created_at
from public.external_orders o left join public.profiles pr on pr.id=o.created_by;

insert into public.activity_logs(business_id,location_id,actor_id,actor_name,action,entity_type,entity_id,summary,details,created_at)
select o.business_id,o.location_id,h.changed_by,coalesce(pr.display_name,'System'),'order_status_changed','external_orders',o.id::text,
  'Order status changed: ORD-'||o.order_number||' · '||coalesce(h.from_status,'new')||' to '||h.to_status,
  jsonb_build_object('from_status',h.from_status,'to_status',h.to_status),h.changed_at
from public.external_order_status_history h
join public.external_orders o on o.id=h.order_id
left join public.profiles pr on pr.id=h.changed_by;

insert into public.activity_logs(business_id,location_id,actor_id,actor_name,action,entity_type,entity_id,summary,details,created_at)
select p.business_id,m.location_id,m.created_by,coalesce(pr.display_name,'System'),'stock_changed','inventory_movements',m.id::text,
  'Stock changed: '||p.name||' · '||case when m.quantity_change>0 then '+' else '' end||m.quantity_change,
  jsonb_build_object('movement_type',m.movement_type,'quantity_change',m.quantity_change,'note',m.note,'product_id',m.product_id),m.created_at
from public.inventory_movements m
join public.products p on p.id=m.product_id
left join public.profiles pr on pr.id=m.created_by
where m.sale_id is null and m.movement_type not in ('initial_stock');
