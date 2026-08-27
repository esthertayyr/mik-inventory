-- Ensure any explicitly counted zero stock starts at 1 instead.
-- Positive stock is preserved. This covers products, variants, and alphabet letters.

update public.inventory_levels
set quantity_on_hand = 1,
    needs_stock_count = false,
    updated_at = now()
where quantity_on_hand = 0;

update public.variant_inventory_levels
set quantity_on_hand = 1,
    updated_at = now()
where quantity_on_hand = 0;

update public.alphabet_letter_inventory
set quantity_on_hand = 1,
    needs_stock_count = false,
    updated_at = now()
where quantity_on_hand = 0;
