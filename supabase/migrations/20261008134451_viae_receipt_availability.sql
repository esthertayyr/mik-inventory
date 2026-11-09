-- Receipt and stock posting share one transaction. Merely ordering or paying
-- never enables checkout. This trigger retains the caller's RLS permissions.
create or replace function public.sync_viae_receipt_availability()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.kind <> 'purchase' or
     (new.received_quantity = old.received_quantity and new.status = old.status) then
    return new;
  end if;
  if new.received_quantity > old.received_quantity or new.status = 'cancelled' then
    update public.source_products p
    set website_availability = case when exists (
      select 1 from public.reseller_stock_summary s
      where s.source_product_id = p.id and s.business_id = new.business_id
        and s.on_hand - s.reserved > 0
    ) then 'in_stock' else 'preparing' end
    where p.id = new.source_product_id and p.business_id = new.business_id
      and p.status = 'active';
  end if;
  return new;
end $$;
revoke all on function public.sync_viae_receipt_availability() from public, anon, authenticated;
create trigger sync_viae_receipt_availability
after update on public.reseller_trade_entries
for each row execute function public.sync_viae_receipt_availability();
