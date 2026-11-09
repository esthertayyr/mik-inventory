create function viae_private.guard_task_column() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' and (new.business_id<>old.business_id or new.id<>old.id or new.is_completed<>old.is_completed) then raise exception 'Only the column name, colour and order can be changed'; end if;
 if TG_OP='INSERT' and new.is_completed then raise exception 'Use the existing completion column'; end if;
 return new;
end $$;
revoke all on function viae_private.guard_task_column() from public,anon,authenticated;
create trigger guard_viae_task_column before insert or update on public.viae_task_columns for each row execute function viae_private.guard_task_column();
create or replace function public.remove_viae_task_column(b uuid, source_id uuid, target_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not (public.is_business_member(b) or public.is_platform_admin()) or not exists(select 1 from public.businesses where id=b and slug='astera') then raise exception 'VIAE access required'; end if;
 perform 1 from public.viae_task_columns where business_id=b order by id for update;
 if source_id=target_id or not exists(select 1 from public.viae_task_columns where id=source_id and business_id=b and not is_completed) or not exists(select 1 from public.viae_task_columns where id=target_id and business_id=b) then raise exception 'Choose two valid columns. The completion column must stay.'; end if;
 if (select count(*) from public.viae_task_columns where business_id=b and not is_completed)<2 then raise exception 'Keep at least one column for unfinished work'; end if;
 update public.viae_tasks set column_id=target_id where business_id=b and column_id=source_id;
 delete from public.viae_task_columns where id=source_id and business_id=b;
end $$;
