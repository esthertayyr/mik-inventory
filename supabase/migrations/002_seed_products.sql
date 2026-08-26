-- Run once for a business and its first location.
-- The second workbook price is stored as editable sale_price.
-- Blank quantities are kept at 0 and flagged for a stock count.

create or replace function public.seed_sebu_products(p_business_id uuid, p_location_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null only while this migration seeds the built-in Sebu3D shop.
  -- Calls made by signed-in app users still require shop-owner access.
  if auth.uid() is not null and not public.is_business_owner(p_business_id) then raise exception 'Only the shop owner can import products'; end if;
  if not exists(select 1 from public.locations where id=p_location_id and business_id=p_business_id) then raise exception 'Location does not belong to business'; end if;
  create temporary table sebu_seed(category_name text, name text, regular_price numeric, sale_price numeric, qty integer) on commit drop;
  insert into public.categories (business_id, name, sort_order) values
    (p_business_id, 'Keyboard Clickers', 1), (p_business_id, 'Fidgets', 2),
    (p_business_id, 'Keychains', 3), (p_business_id, 'Home & Gifts', 4), (p_business_id, 'Other', 5)
  on conflict (business_id, name) do nothing;

  insert into sebu_seed(category_name,name,regular_price,sale_price,qty) values
    ('Keyboard Clickers','Keyboard Clicker 1 Slot',45, null,20),('Keyboard Clickers','Keyboard Clicker 2 Slots',90,null,20),('Keyboard Clickers','Keyboard Clicker 3 Slots',135,null,20),('Keyboard Clickers','Keyboard Clicker 4 Slots',180,179,20),('Keyboard Clickers','Keyboard Clicker 5 Slots',225,null,19),('Keyboard Clickers','Keyboard Clicker 6 Slots',270,null,7),
    ('Keyboard Clickers','Keyboard Clicker Character 1 Slot',139,null,null),('Keyboard Clickers','Keyboard Clicker Character 2 Slots',194,null,null),('Keyboard Clickers','Keyboard Clicker Character 3 Slots',249,null,null),('Keyboard Clickers','Keyboard Clicker Character 4 Slots',304,null,null),('Keyboard Clickers','Keyboard Clicker Character 5 Slots',359,333,null),('Keyboard Clickers','Keyboard Clicker Character 6 Slots',414,null,null),
    ('Fidgets','Big Cone Fidget',149,150,2),('Fidgets','Small Cone Fidget',99,null,2),('Fidgets','Starfish Fidget Small',79,null,9),('Fidgets','Orange Fidget',249,null,2),('Fidgets','Rainbow Dragon',499,500,2),('Home & Gifts','Minions',1200,null,1),('Home & Gifts','Candle Holder',null,null,5),('Home & Gifts','Purple Lamp',1399,null,1),('Home & Gifts','Red Vase',599,null,1),('Home & Gifts','Homepod Blue Lamp',1399,null,1),('Home & Gifts','Small Vortex Vase',179,null,2),
    ('Home & Gifts','Medium Letter Name Lucas Blue',229,null,1),('Home & Gifts','Large Letter Name Arabella',299,null,1),('Home & Gifts','Pen Holder Letter Name',169,189,3),('Home & Gifts','Pickleball Paddle Holder',399,null,1),('Home & Gifts','Multicolor Vase Mode',179,null,11),('Home & Gifts','Crumpled Paper Pen Holder',179,null,3),('Home & Gifts','Large Vortex Vase',599,null,1),('Home & Gifts','Owl Vase',279,null,4),('Home & Gifts','Gorilla Phone Holder',249,null,2),('Home & Gifts','Bear Phone Holder',149,null,5),('Home & Gifts','Jesus Name Plate',null,null,1),('Home & Gifts','Welcome Home',159,null,2),('Home & Gifts','Pray & Trust',229,null,1),('Home & Gifts','Lucas Name Plate Black',79,null,1),('Home & Gifts','Hoodie Pen Holder',249,250,6),('Home & Gifts','Heart Hand',119,null,2),('Home & Gifts','Cable Organizer',129,null,4),('Home & Gifts','Post It Pen Organizer',219,null,3),
    ('Keychains','Leather Keychain + 1 Letter',45,null,null),('Keychains','Leather Keychain + 2 Letters',55,null,null),('Keychains','Leather Keychain + 3 Letters',65,null,null),('Keychains','Leather Keychain + 4 Letters',75,null,null),('Keychains','Leather Keychain + 5 Letters',85,null,null),('Keychains','Leather Keychain + 6 Letters',95,null,null),('Keychains','Leather Keychain + 7 Letters',105,null,null),('Keychains','Crocs Keychain',59,null,31),('Keychains','Nike Keychain',59,null,15),
    ('Keyboard Clickers','Dumpling Clicker',129,125,12),('Keyboard Clickers','Ice Cream Clicker',129,null,10),('Home & Gifts','1 Color Letter Name',59,60,8),('Home & Gifts','Small Letter Name',79,null,6),('Home & Gifts','Letter Name with Design',79,null,1),('Keyboard Clickers','Pickleball Clicker',129,null,13),('Other','Pickleball Paddle',59,null,15),('Other','Pickleball Paddle 2x',109,null,null),('Home & Gifts','Pen Name Topper',59,69,3),
    ('Keychains','Red Dragon Keychain',49,null,null),('Keychains','Glow in the dark Skeleton Keychain',99,100,12),('Other','White Skull',59,null,11),('Fidgets','Flexi Octopus',59,null,11),('Keychains','Knitted Puppy Keychain',79,null,null),('Keychains','Small Teddy Bear Keychain',59,80,6),('Keychains','Polaroid Keychain',59,null,null),('Keychains','Instagram Keychain',59,null,5),('Keychains','Pickleball Ball Keychain',29,null,5),('Keychains','Aqua Flask Keychain',59,null,2),('Keychains','Big Teddy Bear Keychain',149,null,3),('Fidgets','Egg Fidget',129,null,2),('Fidgets','Starfish Fidget Large',199,200,1),('Fidgets','Starfish Fidget Medium',149,null,1),('Home & Gifts','Eiffel Tower',99,null,1),('Fidgets','Gray Dragon',199,null,1),
    ('Keychains','Leather Yellow',40,null,5),('Keychains','Leather Red',40,null,5),('Keychains','Leather White',40,null,5),('Keychains','Leather Silver',40,null,4),('Keychains','Leather Skyblue',40,null,5),('Keychains','Leather Brown',40,null,5),('Keychains','Leather Yellow green',40,null,5),('Keychains','Leather Black',40,null,4),('Keychains','Leather Green',40,null,5),('Keychains','Leather Purple',40,null,2),('Keychains','Leather Pink',40,null,1),('Keychains','Leather Blue',40,null,1),
    ('Keychains','Paracord Black',30,null,3),('Keychains','Paracord White',30,null,3),('Keychains','Paracord Pink',30,null,3),('Keychains','Paracord Purple',30,null,3),('Keychains','Paracord Green',30,null,3),('Keychains','Paracord Blue',30,null,3),('Keychains','Paracord Yellow',30,null,3),('Keychains','Paracord Rose Pink',30,null,3),('Keychains','Bow',10,null,60),('Keychains','Teardrop',10,null,60),('Keychains','Clouds',10,null,60),('Keychains','Hearts',10,null,60)
  ;

  insert into public.products (business_id,category_id,name,regular_price,sale_price)
  select p_business_id,c.id,s.name,s.regular_price,s.sale_price from sebu_seed s
  join public.categories c on c.business_id=p_business_id and c.name=s.category_name
  where not exists(select 1 from public.products p where p.business_id=p_business_id and p.name=s.name);

  insert into public.inventory_levels(product_id,location_id,quantity_on_hand,needs_stock_count)
  select p.id,p_location_id,coalesce(s.qty,0),s.qty is null from sebu_seed s
  join public.products p on p.business_id=p_business_id and p.name=s.name
  on conflict(product_id,location_id) do nothing;

  insert into public.inventory_movements (location_id,product_id,movement_type,quantity_change,note,created_by)
  select p_location_id,p.id,'initial_stock',i.quantity_on_hand,'Imported from SEBU 3D prints.xlsx',(select user_id from public.business_memberships where business_id=p_business_id and role='owner' limit 1)
  from public.products p join public.inventory_levels i on i.product_id=p.id and i.location_id=p_location_id
  where p.business_id=p_business_id and i.quantity_on_hand>0 and not exists(
    select 1 from public.inventory_movements m where m.product_id = p.id and m.movement_type = 'initial_stock'
  );
end;
$$;

-- Example: select public.seed_sebu_products('BUSINESS-UUID','LOCATION-UUID');
grant execute on function public.seed_sebu_products(uuid,uuid) to authenticated;
