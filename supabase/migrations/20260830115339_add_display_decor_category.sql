insert into public.categories(business_id,name,sort_order)
select id,'Display & Décor',5 from public.businesses
on conflict (business_id,name) do nothing;

update public.categories set sort_order=6 where name='Other Items';

update public.products p
set category_id=display.id
from public.categories display
where display.business_id=p.business_id
  and display.name='Display & Décor'
  and p.name in (
    'White Skull','Minions','Eiffel Tower','Heart Hand','Welcome Home','Pray & Trust',
    'Jesus Name Plate','Lucas Name Plate Black','Purple Lamp','Homepod Blue Lamp',
    'Red Vase','Small Vortex Vase','Large Vortex Vase','Owl Vase','Multicolor Vase Mode',
    'Candle Holder','Medium Letter Name Lucas Blue','Large Letter Name Arabella',
    'Small Letter Name','Letter Name with Design','1 Color Letter Name'
  );
