create or replace function public.change_shop_passcode(
  p_business_id uuid,
  p_current_passcode text,
  p_new_passcode text
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_hash text;
  v_platform_admin boolean := public.is_platform_admin();
begin
  if not v_platform_admin and not public.is_business_owner(p_business_id) then
    raise exception 'Shop access required';
  end if;
  if p_new_passcode !~ '^[0-9]{4,8}$' then
    raise exception 'Use 4 to 8 numbers';
  end if;
  select manager_passcode_hash
    into v_hash
    from public.businesses
   where id=p_business_id
   for update;
  if not found then raise exception 'Shop profile not found'; end if;
  if not v_platform_admin
     and v_hash is not null
     and extensions.crypt(p_current_passcode,v_hash)<>v_hash then
    raise exception 'Current passcode is incorrect';
  end if;
  update public.businesses
     set manager_passcode_hash=extensions.crypt(p_new_passcode,extensions.gen_salt('bf'))
   where id=p_business_id;
end
$$;

revoke all on function public.change_shop_passcode(uuid,text,text) from public, anon;
grant execute on function public.change_shop_passcode(uuid,text,text) to authenticated;
