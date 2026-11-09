alter table public.outside_orders add column cost_source text not null default 'manual' check(cost_source in ('manual','sale','date_range'));
alter table public.outside_orders add column linked_sale_id uuid references public.sales(id);
alter table public.outside_orders add column cost_start date;
alter table public.outside_orders add column cost_end date;
-- Retain the legacy generated column for old clients, but no longer display it.
create function public.set_outside_order_cost() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.cost_source='sale' then
 select total into new.cost from public.sales where id=new.linked_sale_id and business_id=new.business_id and location_id=new.location_id and status='completed';
 if new.cost is null then raise exception 'Select a completed sale from this shop'; end if;
 new.cost_start=null; new.cost_end=null;
 elsif new.cost_source='date_range' then
 if new.cost_start is null or new.cost_end is null or new.cost_end<new.cost_start then raise exception 'Enter a valid date range'; end if;
 select coalesce(sum(total),0) into new.cost from public.sales where business_id=new.business_id and location_id=new.location_id and status='completed' and created_at >= (new.cost_start::timestamp at time zone 'Asia/Manila') and created_at < ((new.cost_end+1)::timestamp at time zone 'Asia/Manila');
 new.linked_sale_id=null;
 else new.linked_sale_id=null;new.cost_start=null;new.cost_end=null;
 end if;
 return new;
end $$;
revoke all on function public.set_outside_order_cost() from public;
create trigger outside_orders_cost before insert or update on public.outside_orders for each row execute function public.set_outside_order_cost();
