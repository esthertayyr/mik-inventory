drop function if exists public.record_login_activity();

create function public.record_login_activity(p_device_name text default null) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_business_id uuid;
  v_actor_name text;
  v_device_name text:=nullif(left(trim(coalesce(p_device_name,'')),30),'');
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select display_name into v_actor_name from public.profiles where id=auth.uid();
  if not public.is_platform_admin() then
    select business_id into v_business_id from public.business_memberships
    where user_id=auth.uid() order by business_id limit 1;
  end if;
  insert into public.activity_logs(business_id,actor_id,actor_name,action,entity_type,entity_id,summary,details)
  values(v_business_id,auth.uid(),coalesce(v_device_name,v_actor_name,'Shop user'),'login','account',auth.uid()::text,
    case when public.is_platform_admin() then 'Owner signed in' else 'Shop account signed in' end,
    jsonb_strip_nulls(jsonb_build_object('device_user_name',v_device_name)));
end $$;

revoke execute on function public.record_login_activity(text) from public, anon;
grant execute on function public.record_login_activity(text) to authenticated;
