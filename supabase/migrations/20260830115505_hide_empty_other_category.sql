update public.categories c
set active=false
where c.name='Other Items'
  and not exists(select 1 from public.products p where p.category_id=c.id and p.active);
