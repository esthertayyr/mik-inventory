alter table public.external_orders
  add constraint external_orders_payment_status_matches_amount
  check (
    (amount_paid = 0 and payment_status = 'unpaid')
    or (amount_paid > 0 and amount_paid < total_price and payment_status = 'partial')
    or (total_price > 0 and amount_paid = total_price and payment_status = 'paid')
  ) not valid;

alter table public.external_orders
  add constraint external_orders_paid_channel_required
  check (amount_paid = 0 or char_length(trim(coalesce(payment_channel, ''))) > 0) not valid;

alter table public.external_orders validate constraint external_orders_payment_status_matches_amount;
alter table public.external_orders validate constraint external_orders_paid_channel_required;
