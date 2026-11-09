create table public.viae_task_columns (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id),
 name text not null check(length(trim(name)) between 1 and 50),
 color text not null default '#315FBE' check(color ~ '^#[0-9A-Fa-f]{6}$'),
 position integer not null default 0,
 is_completed boolean not null default false,
 unique(business_id,name), unique(business_id,id)
);
create unique index viae_task_one_completed on public.viae_task_columns(business_id) where is_completed;
alter table public.viae_task_columns enable row level security;
create policy "VIAE team columns" on public.viae_task_columns for all to authenticated
 using (exists(select 1 from public.businesses b where b.id=business_id and b.slug='astera') and (public.is_business_member(business_id) or public.is_platform_admin()))
 with check (exists(select 1 from public.businesses b where b.id=business_id and b.slug='astera') and (public.is_business_member(business_id) or public.is_platform_admin()));
grant select,insert,update on public.viae_task_columns to authenticated;
insert into public.viae_task_columns(business_id,name,color,position,is_completed)
 select b.id,v.name,v.color,v.position,v.done from public.businesses b cross join (values ('Open','#315FBE',0,false),('In progress','#986209',1,false),('Completed','#1B685C',2,true)) v(name,color,position,done) where b.slug='astera';
alter table public.viae_tasks add column proposed_date date, add column column_id uuid;
update public.viae_tasks t set column_id=c.id from public.viae_task_columns c where c.business_id=t.business_id and c.name=t.status;
alter table public.viae_tasks add constraint viae_task_column_tenant foreign key(business_id,column_id) references public.viae_task_columns(business_id,id);
create index viae_tasks_column on public.viae_tasks(business_id,column_id);
create table public.viae_task_history (
 id uuid primary key default gen_random_uuid(), task_id uuid not null references public.viae_tasks(id),
 business_id uuid not null references public.businesses(id), actor_id uuid references public.profiles(id),
 actor_name text not null, changed_at timestamptz not null default now(), before_data jsonb, after_data jsonb not null
);
create index viae_task_history_task on public.viae_task_history(task_id,changed_at desc);
alter table public.viae_task_history enable row level security;
create policy "VIAE team reads history" on public.viae_task_history for select to authenticated
 using (exists(select 1 from public.businesses b where b.id=business_id and b.slug='astera') and (public.is_business_member(business_id) or public.is_platform_admin()));
grant select on public.viae_task_history to authenticated;
create or replace function public.stamp_viae_task() returns trigger language plpgsql set search_path='' as $$
declare c public.viae_task_columns;
begin
 if TG_OP='UPDATE' then
   if new.business_id<>old.business_id then raise exception 'Tasks cannot move between shops'; end if;
   new.created_by:=old.created_by; new.created_at:=old.created_at;
   -- Backward compatibility for already-open clients using the original status buttons.
   if new.status<>old.status and new.column_id is not distinct from old.column_id then
     select * into c from public.viae_task_columns where business_id=new.business_id and
       (case when new.status='Completed' then is_completed else not is_completed end)
       order by case when name=new.status then 0 else 1 end,position,id limit 1;
     new.column_id:=c.id;
   end if;
 else new.created_by:=auth.uid(); new.created_at:=now();
 end if;
 if new.column_id is null then
   select * into c from public.viae_task_columns where business_id=new.business_id and not is_completed order by position,id limit 1;
   new.column_id:=c.id;
 end if;
 select * into c from public.viae_task_columns where id=new.column_id and business_id=new.business_id;
 if not found then raise exception 'Choose a valid VIAE column'; end if;
 new.status:=case when c.is_completed then 'Completed' when c.position=0 then 'Open' else 'In progress' end;
 new.updated_by:=auth.uid(); new.updated_at:=clock_timestamp();
 if c.is_completed then
   if TG_OP='INSERT' then new.completed_at:=now();new.completed_by:=auth.uid();
   elsif old.status<>'Completed' then new.completed_at:=now();new.completed_by:=auth.uid();
   else new.completed_at:=old.completed_at;new.completed_by:=old.completed_by; end if;
 else new.completed_at:=null;new.completed_by:=null; end if;
 return new;
end $$;
create schema if not exists viae_private;
create function viae_private.audit_task() returns trigger language plpgsql security definer set search_path='' as $$
declare before_row jsonb; after_row jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to update tasks'; end if;
 after_row:=jsonb_build_object('title',new.title,'description',new.description,'assignee',new.assignee,'due_date',new.due_date,'proposed_date',new.proposed_date,'priority',new.priority,'column', (select name from public.viae_task_columns where id=new.column_id));
 if TG_OP='UPDATE' then
 before_row:=jsonb_build_object('title',old.title,'description',old.description,'assignee',old.assignee,'due_date',old.due_date,'proposed_date',old.proposed_date,'priority',old.priority,'column',(select name from public.viae_task_columns where id=old.column_id));
 end if;
 if before_row is distinct from after_row then
 insert into public.viae_task_history(task_id,business_id,actor_id,actor_name,before_data,after_data)
 values(new.id,new.business_id,auth.uid(),coalesce((select display_name from public.profiles where id=auth.uid()),'MIK user'),before_row,after_row);
 end if;
 return new;
end $$;
revoke all on function viae_private.audit_task() from public,anon,authenticated;
create trigger audit_viae_task after insert or update on public.viae_tasks for each row execute function viae_private.audit_task();
-- Column removal stays atomic, moves all cards first, and never removes the completion column.
create function public.remove_viae_task_column(b uuid, source_id uuid, target_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not (public.is_business_member(b) or public.is_platform_admin()) or not exists(select 1 from public.businesses where id=b and slug='astera') then raise exception 'VIAE access required'; end if;
 perform 1 from public.viae_task_columns where business_id=b order by id for update;
 if source_id=target_id or not exists(select 1 from public.viae_task_columns where id=source_id and business_id=b and not is_completed) or not exists(select 1 from public.viae_task_columns where id=target_id and business_id=b) then raise exception 'Choose two valid columns. The completion column must stay.'; end if;
 update public.viae_tasks set column_id=target_id where business_id=b and column_id=source_id;
 delete from public.viae_task_columns where id=source_id and business_id=b;
end $$;
revoke all on function public.remove_viae_task_column(uuid,uuid,uuid) from public,anon;
grant execute on function public.remove_viae_task_column(uuid,uuid,uuid) to authenticated;
