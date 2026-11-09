create table public.viae_generator_projects(
 id uuid primary key default gen_random_uuid(),customer_id uuid not null references public.viae_customer_accounts(id),
 generator_design_id uuid not null references public.viae_design_catalogue(id),
 title text not null check(length(trim(title)) between 1 and 120),
 configuration jsonb not null check(jsonb_typeof(configuration)='object' and octet_length(configuration::text)<=100000),
 created_at timestamptz not null default now()
);
create table public.viae_generator_exports(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.viae_generator_projects(id),
 customer_id uuid not null references public.viae_customer_accounts(id),
 export_mode text not null check(export_mode in('personal_marked','commercial_unmarked')),
 request_id uuid not null,
 status text not null default 'queued' check(status in('queued','processing','ready','failed')),
 private_storage_path text,created_at timestamptz not null default now(),completed_at timestamptz,
 unique(customer_id,request_id),check(status<>'ready' or private_storage_path is not null)
);
alter table public.viae_generator_projects enable row level security;
alter table public.viae_generator_exports enable row level security;
revoke all on public.viae_generator_projects,public.viae_generator_exports from anon,authenticated;
grant select on public.viae_generator_projects,public.viae_generator_exports to authenticated;
grant insert(customer_id,generator_design_id,title,configuration) on public.viae_generator_projects to authenticated;
grant insert(customer_id,project_id,export_mode,request_id) on public.viae_generator_exports to authenticated;
create policy "customers read own creations" on public.viae_generator_projects for select to authenticated using(customer_id=auth.uid() or public.is_business_owner('3fe4c82d-a659-406b-b290-32d8a49f2bdf') or public.is_platform_admin());
create policy "customers save own creations" on public.viae_generator_projects for insert to authenticated with check(customer_id=auth.uid() and exists(select 1 from public.viae_design_catalogue where id=generator_design_id and category='Generator' and source_present and website_status='published'));
-- Published generator lookup is deliberately exposed through an exact-code RPC,
-- while source metadata and generator code stay private.
create policy "customers read own export requests" on public.viae_generator_exports for select to authenticated using(customer_id=auth.uid() or public.is_business_owner('3fe4c82d-a659-406b-b290-32d8a49f2bdf') or public.is_platform_admin());
create policy "customers request entitled exports" on public.viae_generator_exports for insert to authenticated with check(customer_id=auth.uid() and exists(select 1 from public.viae_generator_projects p where p.id=project_id and p.customer_id=auth.uid()) and (export_mode='personal_marked' or exists(select 1 from public.viae_customer_entitlements where customer_id=auth.uid() and licence_scope='all_generators' and status='active')));

create function public.save_viae_generator_project(p_generator_code text,p_title text,p_configuration jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); d uuid; result uuid;
begin
 if u is null or not exists(select 1 from public.viae_customer_accounts where id=u) then raise exception 'Sign in and verify your VIAE customer account to save or download.';end if;
 select id into d from public.viae_design_catalogue where catalogue_code=p_generator_code and category='Generator' and source_present and website_status='published';
 if d is null then raise exception 'This generator is not available for online exports yet.';end if;
 insert into public.viae_generator_projects(customer_id,generator_design_id,title,configuration)values(u,d,trim(p_title),p_configuration)returning id into result;
 return result;
end$$;
revoke all on function public.save_viae_generator_project(text,text,jsonb) from public,anon;
grant execute on function public.save_viae_generator_project(text,text,jsonb) to authenticated;

create function public.request_viae_generator_export(p_project_id uuid,p_mode text,p_request_id uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid; existing public.viae_generator_exports;
begin
 if auth.uid() is null then raise exception 'Sign in to save or download.';end if;
 if p_mode not in('personal_marked','commercial_unmarked') or p_mode is null then raise exception 'Choose a personal or commercial export.';end if;
 if not exists(select 1 from public.viae_generator_projects where id=p_project_id and customer_id=auth.uid()) then raise exception 'This creation does not belong to your account.';end if;
 if p_mode='commercial_unmarked' and not exists(select 1 from public.viae_customer_entitlements where customer_id=auth.uid() and licence_scope='all_generators' and status='active') then raise exception 'A commercial licence is required for an unmarked export.';end if;
 select * into existing from public.viae_generator_exports where customer_id=auth.uid() and request_id=p_request_id;
 if found then if existing.project_id<>p_project_id or existing.export_mode<>p_mode then raise exception 'This export request was already used for another creation or format.';end if;return existing.id;end if;
 insert into public.viae_generator_exports(customer_id,project_id,export_mode,request_id) values(auth.uid(),p_project_id,p_mode,p_request_id) returning id into result;
 return result;
end$$;
revoke all on function public.request_viae_generator_export(uuid,text,uuid) from public,anon;
grant execute on function public.request_viae_generator_export(uuid,text,uuid) to authenticated;
