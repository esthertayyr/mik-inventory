-- Platform administrators can open every shop through the normal audited shop interface.
insert into public.business_memberships(user_id,business_id,role,default_location_id)
select a.user_id,b.id,'owner'::public.user_role,l.id
from public.platform_admins a
cross join public.businesses b
join lateral (
  select id from public.locations where business_id=b.id and active order by created_at limit 1
) l on true
on conflict(user_id,business_id) do update
set role='owner',default_location_id=excluded.default_location_id;
