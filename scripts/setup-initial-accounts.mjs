import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first. Never place the service role key in EXPO_PUBLIC variables.');

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

async function ensureUser(username, password, displayName) {
  const email = `${username.toLowerCase()}@login.mik.app`;
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  let user = listed.users.find((item) => item.email?.toLowerCase() === email);
  if (user) {
    const { data, error } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true, user_metadata: { username } });
    if (error) throw error;
    user = data.user;
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username } });
    if (error || !data.user) throw error ?? new Error(`Could not create ${username}`);
    user = data.user;
  }
  const { error: profileError } = await admin.from('profiles').upsert({ id: user.id, username: username.toLowerCase(), display_name: displayName });
  if (profileError) throw profileError;
  return user;
}

const owner = await ensureUser('owner', '123456', 'Owner');
const sebu = await ensureUser('sebu3d', '123456', 'Sebu3D');

const { error: ownerError } = await admin.from('platform_admins').upsert({ user_id: owner.id });
if (ownerError) throw ownerError;

const { data: shop, error: shopError } = await admin.from('businesses').update({ login_username: 'sebu3d' }).eq('slug', 'sebu3d').select('id').single();
if (shopError || !shop) throw shopError ?? new Error('Sebu3D shop profile was not found. Run migrations 001–004 first.');
const { data: location, error: locationError } = await admin.from('locations').select('id').eq('business_id', shop.id).eq('active', true).order('created_at').limit(1).single();
if (locationError || !location) throw locationError ?? new Error('Sebu3D location was not found.');

const { data: existingMembership } = await admin.from('business_memberships').select('business_id').eq('user_id', sebu.id).maybeSingle();
if (existingMembership && existingMembership.business_id !== shop.id) throw new Error('The sebu3d username already belongs to another shop.');
const { error: membershipError } = await admin.from('business_memberships').upsert({ user_id: sebu.id, business_id: shop.id, role: 'owner', default_location_id: location.id }, { onConflict: 'user_id,business_id' });
if (membershipError) throw membershipError;

console.log('Initial Mik accounts are ready: Owner and sebu3d. Change the starting passwords before a public launch.');
