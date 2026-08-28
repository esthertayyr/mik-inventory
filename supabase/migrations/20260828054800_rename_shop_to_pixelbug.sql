-- Pixelbug is the public shop name and login username. The internal slug and
-- Supabase Auth identity remain unchanged so all existing products and sales
-- continue to belong to the same account.
update public.businesses
set name = 'Pixelbug',
    login_username = 'pixelbug'
where slug = 'sebu3d';

update public.profiles as p
set display_name = 'Pixelbug',
    username = 'pixelbug'
where exists (
  select 1
  from public.business_memberships as m
  join public.businesses as b on b.id = m.business_id
  where m.user_id = p.id
    and b.slug = 'sebu3d'
)
and lower(p.username) in ('sebu3d', '3dprints');

update public.locations as l
set name = 'Pixelbug'
where exists (
  select 1
  from public.businesses as b
  where b.id = l.business_id
    and b.slug = 'sebu3d'
)
and lower(l.name) like '%sebu%';
