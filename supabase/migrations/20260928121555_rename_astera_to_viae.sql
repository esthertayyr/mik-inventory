update public.businesses
set name = 'VIAE'
where lower(name) = 'astera'
   or lower(login_username) = 'astera';
