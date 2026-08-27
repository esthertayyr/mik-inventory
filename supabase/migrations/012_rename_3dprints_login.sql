-- Present the original Sebu3D shop under its generic name and new login.
-- The business slug remains stable because it is an internal identifier used
-- by earlier catalogue and sales-history migrations.
update public.businesses
set name = '3D Prints', login_username = '3dprints'
where slug = 'sebu3d';

update public.profiles p
set display_name = '3D Prints', username = '3dprints'
where exists (
  select 1
  from public.business_memberships m
  join public.businesses b on b.id = m.business_id
  where m.user_id = p.id and b.slug = 'sebu3d'
);
