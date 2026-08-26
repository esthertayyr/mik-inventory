import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return reply({ error: 'Server setup is incomplete' }, 500);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return reply({ error: 'Please sign in again' }, 401);

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return reply({ error: 'Please sign in again' }, 401);
  const { data: owner } = await admin.from('platform_admins').select('user_id').eq('user_id', authData.user.id).maybeSingle();
  if (!owner) return reply({ error: 'Owner access required' }, 403);

  const input = await request.json().catch(() => ({}));
  const shopName = String(input.shopName ?? '').trim();
  const username = String(input.username ?? '').trim().toLowerCase();
  const password = String(input.password ?? '');
  if (!shopName) return reply({ error: 'Enter a shop name' }, 400);
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) return reply({ error: 'Check the username' }, 400);
  if (password.length < 6) return reply({ error: 'Password must have at least 6 characters' }, 400);

  const email = `${username}@login.mik.app`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (createError || !created.user) return reply({ error: createError?.message ?? 'Username could not be created' }, 400);

  let businessId: string | null = null;
  try {
    let slug = shopName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shop';
    const { data: sameSlug } = await admin.from('businesses').select('id').eq('slug', slug).maybeSingle();
    if (sameSlug) slug = `${slug}-${crypto.randomUUID().slice(0, 6)}`;

    const { data: business, error: businessError } = await admin.from('businesses').insert({ name: shopName, slug, login_username: username }).select('id').single();
    if (businessError || !business) throw businessError ?? new Error('Shop was not created');
    businessId = business.id;

    const { data: location, error: locationError } = await admin.from('locations').insert({ business_id: businessId, name: 'Main Shop' }).select('id').single();
    if (locationError || !location) throw locationError ?? new Error('Shop location was not created');
    const { error: categoryError } = await admin.from('categories').insert({ business_id: businessId, name: 'Other', sort_order: 0 });
    if (categoryError) throw categoryError;
    const { error: profileError } = await admin.from('profiles').upsert({ id: created.user.id, display_name: shopName, username });
    if (profileError) throw profileError;
    const { error: membershipError } = await admin.from('business_memberships').insert({ user_id: created.user.id, business_id: businessId, role: 'owner', default_location_id: location.id });
    if (membershipError) throw membershipError;
    const { error: adminMembershipError } = await admin.from('business_memberships').upsert({
      user_id: authData.user.id,
      business_id: businessId,
      role: 'owner',
      default_location_id: location.id,
    });
    if (adminMembershipError) throw adminMembershipError;

    return reply({ shopId: businessId, username });
  } catch (error) {
    if (businessId) await admin.from('businesses').delete().eq('id', businessId);
    await admin.auth.admin.deleteUser(created.user.id);
    return reply({ error: error instanceof Error ? error.message : 'Shop profile could not be created' }, 400);
  }
});
