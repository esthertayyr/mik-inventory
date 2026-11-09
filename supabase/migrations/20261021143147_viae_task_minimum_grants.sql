revoke all on public.viae_tasks,public.viae_task_columns,public.viae_task_history from anon,authenticated;
grant select,insert,update on public.viae_tasks,public.viae_task_columns to authenticated;
grant select on public.viae_task_history to authenticated;
revoke all on function public.stamp_viae_task() from public,anon,authenticated;
