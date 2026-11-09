create table public.viae_tasks (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id),
 title text not null check(length(trim(title)) between 1 and 160),
 description text not null default '' check(length(description)<=5000),
 assignee text not null default '' check(length(assignee)<=160),
 due_date date,
 status text not null default 'Open' check(status in ('Open','In progress','Completed')),
 priority text not null default 'Normal' check(priority in ('Normal','Urgent')),
 created_by uuid not null default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_by uuid default auth.uid() references public.profiles(id),
 updated_at timestamptz not null default now(),
 completed_by uuid references public.profiles(id),
 completed_at timestamptz
);
create index viae_tasks_business_status on public.viae_tasks(business_id,status,created_at desc);
alter table public.viae_tasks enable row level security;
create policy "VIAE members read tasks" on public.viae_tasks for select to authenticated
 using (exists(select 1 from public.businesses b where b.id=business_id and b.slug='astera') and (public.is_business_member(business_id) or public.is_platform_admin()));
create policy "VIAE members create tasks" on public.viae_tasks for insert to authenticated
 with check (created_by=(select auth.uid()) and exists(select 1 from public.businesses b where b.id=business_id and b.slug='astera') and (public.is_business_member(business_id) or public.is_platform_admin()));
create policy "VIAE members edit tasks" on public.viae_tasks for update to authenticated
 using (exists(select 1 from public.businesses b where b.id=business_id and b.slug='astera') and (public.is_business_member(business_id) or public.is_platform_admin()))
 with check (exists(select 1 from public.businesses b where b.id=business_id and b.slug='astera') and (public.is_business_member(business_id) or public.is_platform_admin()));
grant select,insert,update on public.viae_tasks to authenticated;
revoke all on public.viae_tasks from anon;
create function public.stamp_viae_task() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' then
   if new.business_id<>old.business_id then raise exception 'Tasks cannot move between shops'; end if;
   new.created_by:=old.created_by; new.created_at:=old.created_at;
 else new.created_by:=auth.uid(); new.created_at:=now();
 end if;
 new.updated_by:=auth.uid(); new.updated_at:=clock_timestamp();
 if new.status='Completed' then
   if TG_OP='INSERT' then new.completed_at:=now();new.completed_by:=auth.uid();
   elsif old.status<>'Completed' then new.completed_at:=now();new.completed_by:=auth.uid();
   else new.completed_at:=old.completed_at;new.completed_by:=old.completed_by;
   end if;
 else new.completed_at:=null;new.completed_by:=null;
 end if;
 return new;
end $$;
revoke all on function public.stamp_viae_task() from public;
create trigger stamp_viae_task before insert or update on public.viae_tasks for each row execute function public.stamp_viae_task();
