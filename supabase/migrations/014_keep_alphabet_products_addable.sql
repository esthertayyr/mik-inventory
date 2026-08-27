-- The current client still consults products.inventory_levels before adding a
-- configured alphabet product to the cart. Alphabet availability is actually
-- enforced by the selected A-Z component stock in migration 013, so keep this
-- legacy counter non-blocking and hidden behind the existing "stock count needed"
-- presentation until the client is simplified.

update public.inventory_levels il
set quantity_on_hand = greatest(il.quantity_on_hand, 1000),
    needs_stock_count = true,
    updated_at = now()
from public.products p
where p.id = il.product_id
  and p.active
  and p.letters_required > 0
  and p.alphabet_style_id is not null;
