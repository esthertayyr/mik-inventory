-- Reuse Pixelbug's recoverable archive rule for VIAE. Keep paid/active orders.
select cron.schedule('viae-stale-order-archive','0 * * * *',$job$
 update public.external_orders o set archived_at=now()
 where o.business_id in(select id from public.businesses where slug='astera')
 and o.archived_at is null and o.status='new' and coalesce(o.amount_paid,0)=0
 and not coalesce(o.is_past_order,false) and o.updated_at<now()-interval '7 days'
 and not exists(select 1 from public.order_payments p where p.order_id=o.id and p.amount>0);
 update public.order_enquiries e set archived_at=now()
 where e.business_id in(select id from public.businesses where slug='astera')
 and e.archived_at is null and e.status='open' and e.updated_at<now()-interval '7 days';
$job$);
