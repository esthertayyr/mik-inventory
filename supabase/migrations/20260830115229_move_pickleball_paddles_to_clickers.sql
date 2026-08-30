update public.products p
set category_id = target.id
from public.categories target
where target.business_id=p.business_id
  and target.name='Clickers & Keycaps'
  and p.name in ('Pickleball Paddle','Pickleball Paddle 2x');

update public.categories set name='Other Items' where name='Sports & Other';
