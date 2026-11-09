-- VIAE design catalogue. Keep the supplier ledger and historical sales intact.
create table public.viae_design_catalogue (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id),
 catalogue_code text not null check(catalogue_code ~ '^[A-Z]+[0-9]{3,}$'),
 title text not null check(length(trim(title))>0),
 category text not null,
 design_count integer check(design_count>0),
 preview_url text,
 source_metadata jsonb not null default '{}'::jsonb,
 source_present boolean not null default true,
 digital_enabled boolean not null default true,
 printed_enabled boolean not null default false,
 digital_price_php numeric check(digital_price_php>0),
 printed_price_php numeric check(printed_price_php>0),
 preparation_days integer check(preparation_days between 1 and 90),
 website_status text not null default 'draft' check(website_status in ('draft','published','archived')),
 source_product_id uuid references public.source_products(id),
 synced_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(business_id,catalogue_code),
 constraint viae_catalogue_tenant check(business_id='3fe4c82d-a659-406b-b290-32d8a49f2bdf'),
 constraint viae_publish_ready check(website_status<>'published' or (
 source_present and preview_url ~ '^https://' and (digital_enabled or printed_enabled)
 and (not digital_enabled or digital_price_php is not null)
 and (not printed_enabled or (printed_price_php is not null and preparation_days is not null))
 ))
);
alter table public.viae_design_catalogue enable row level security;
grant select on public.viae_design_catalogue to authenticated;
grant insert,update on public.viae_design_catalogue to authenticated;
revoke all on public.viae_design_catalogue from anon;
create policy "VIAE members read catalogue" on public.viae_design_catalogue for select to authenticated
 using(public.is_business_member(business_id) or public.is_platform_admin());
create policy "VIAE owners add catalogue" on public.viae_design_catalogue for insert to authenticated
 with check(public.is_business_owner(business_id) or public.is_platform_admin());
create policy "VIAE owners edit catalogue" on public.viae_design_catalogue for update to authenticated
 using(public.is_business_owner(business_id) or public.is_platform_admin())
 with check(public.is_business_owner(business_id) or public.is_platform_admin());

create function public.import_viae_design_catalogue(p_items jsonb) returns integer
language plpgsql security invoker set search_path='' as $$
declare b constant uuid:='3fe4c82d-a659-406b-b290-32d8a49f2bdf'; imported integer;
begin
 if auth.uid() is null or not (public.is_business_owner(b) or public.is_platform_admin()) then raise exception 'Only a VIAE owner can import the catalogue.';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>5000 then raise exception 'Select a non-empty catalogue file.';end if;
 if exists(select 1 from jsonb_array_elements(p_items) x where coalesce(x->>'serial','') !~ '^[A-Z]+[0-9]{3,}$' or length(trim(coalesce(x->>'name','')))=0) then raise exception 'Every item needs a valid serial and title.';end if;
 if exists(select 1 from jsonb_array_elements(p_items) x group by x->>'serial' having count(*)>1) then raise exception 'Duplicate catalogue codes. Import cancelled.';end if;
 insert into public.viae_design_catalogue(business_id,catalogue_code,title,category,design_count,source_metadata,digital_enabled,printed_enabled)
 select b,x->>'serial',x->>'name',coalesce(x->>'main','Other'),case when (x->>'count') ~ '^[1-9][0-9]*$' then (x->>'count')::integer end,
 jsonb_build_object('preview',x->>'preview','zip',x->>'zip','generator',x->>'generator','series',x->>'series','note',x->>'note'),
 coalesce(x->>'main','')<>'Generator',false from jsonb_array_elements(p_items) x
 on conflict(business_id,catalogue_code) do update set title=excluded.title,category=excluded.category,design_count=excluded.design_count,source_metadata=excluded.source_metadata,source_present=true,synced_at=now(),updated_at=now();
 get diagnostics imported=row_count;
 update public.viae_design_catalogue set source_present=false,website_status=case when website_status='published' then 'draft' else website_status end,updated_at=now()
 where business_id=b and catalogue_code not in(select x->>'serial' from jsonb_array_elements(p_items)x);
 return imported;
end $$;
revoke all on function public.import_viae_design_catalogue(jsonb) from public,anon;
grant execute on function public.import_viae_design_catalogue(jsonb) to authenticated;
