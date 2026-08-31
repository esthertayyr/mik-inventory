import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
const validUsername = (value: string) => /^[a-z0-9._-]{3,30}$/.test(value);

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !anonKey) return reply({ error: 'Server setup is incomplete' }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return reply({ error: 'Please sign in again' }, 401);
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return reply({ error: 'Please sign in again' }, 401);
  const { data: owner } = await admin.from('platform_admins').select('user_id').eq('user_id', authData.user.id).maybeSingle();
  if (!owner) return reply({ error: 'Owner access required' }, 403);

  const input = await request.json().catch(() => ({}));
  const action = String(input.action ?? '');
  const shopId = String(input.shopId ?? '');
  const shopName = String(input.shopName ?? '').trim();
  const username = String(input.username ?? '').trim().toLowerCase();
  if (!shopId) return reply({ error: 'Shop profile not found' }, 400);

  const { data: source, error: sourceError } = await admin.from('businesses').select('*').eq('id', shopId).maybeSingle();
  if (sourceError || !source) return reply({ error: 'Shop profile not found' }, 404);

  const findShopUser = async () => {
    const { data: members } = await admin.from('business_memberships').select('user_id').eq('business_id', shopId);
    const memberIds = (members ?? []).map((item) => item.user_id);
    const { data: admins } = memberIds.length ? await admin.from('platform_admins').select('user_id').in('user_id', memberIds) : { data: [] };
    const adminIds = new Set((admins ?? []).map((item) => item.user_id));
    return memberIds.find((id) => !adminIds.has(id));
  };

  if (action === 'change_password') {
    const password = String(input.password ?? '');
    if (password.length < 6) return reply({ error: 'Password must have at least 6 characters' }, 400);
    const shopUserId = await findShopUser();
    if (!shopUserId) return reply({ error: 'Shop login not found' }, 404);
    const { error } = await admin.auth.admin.updateUserById(shopUserId, { password });
    if (error) return reply({ error: error.message }, 400);
    await admin.from('activity_logs').insert({
      business_id: shopId,
      actor_id: authData.user.id,
      actor_name: 'Owner',
      action: 'login_password_changed',
      entity_type: 'shop_login',
      entity_id: shopUserId,
      summary: `Login password changed for ${source.name}`,
    });
    return reply({ shopId, passwordChanged: true });
  }

  if (action === 'reset_passcode') {
    const passcode = String(input.passcode ?? '');
    if (!/^\d{4,8}$/.test(passcode)) return reply({ error: 'Use 4 to 8 numbers' }, 400);
    const userClient = createClient(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { error } = await userClient.rpc('change_shop_passcode', {
      p_business_id: shopId,
      p_current_passcode: '',
      p_new_passcode: passcode,
    });
    if (error) return reply({ error: error.message }, 400);
    await admin.from('activity_logs').insert({
      business_id: shopId,
      actor_id: authData.user.id,
      actor_name: 'Owner',
      action: 'manager_passcode_changed',
      entity_type: 'manager_passcode',
      entity_id: shopId,
      summary: `Sale-correction passcode changed for ${source.name}`,
    });
    return reply({ shopId, passcodeChanged: true });
  }

  if (!shopName || !validUsername(username)) return reply({ error: 'Check the shop name and username' }, 400);
  const { data: sourceLocation } = await admin.from('locations').select('id').eq('business_id', shopId).eq('active', true).order('created_at').limit(1).maybeSingle();
  if (!sourceLocation) return reply({ error: 'Source shop location not found' }, 404);
  const { data: usernameOwner } = await admin.from('businesses').select('id').ilike('login_username', username).maybeSingle();
  if (usernameOwner && (action !== 'update' || usernameOwner.id !== shopId)) return reply({ error: 'This username is already in use' }, 409);

  if (action === 'update') {
    const shopUserId = await findShopUser();
    if (!shopUserId) return reply({ error: 'Shop login not found' }, 404);

    const { data: oldUser } = await admin.auth.admin.getUserById(shopUserId);
    const oldEmail = oldUser.user?.email;
    const newEmail = `${username}@login.mik.app`;
    const { error: authUpdateError } = await admin.auth.admin.updateUserById(shopUserId, {
      email: newEmail,
      email_confirm: true,
      user_metadata: { ...(oldUser.user?.user_metadata ?? {}), username },
    });
    if (authUpdateError) return reply({ error: authUpdateError.message }, 400);

    const { error: businessError } = await admin.from('businesses').update({ name: shopName, login_username: username }).eq('id', shopId);
    const { error: profileError } = await admin.from('profiles').update({ display_name: shopName, username }).eq('id', shopUserId);
    if (businessError || profileError) {
      if (oldEmail) await admin.auth.admin.updateUserById(shopUserId, { email: oldEmail, email_confirm: true });
      await admin.from('businesses').update({ name: source.name, login_username: source.login_username }).eq('id', shopId);
      await admin.from('profiles').update({ display_name: source.name, username: source.login_username }).eq('id', shopUserId);
      return reply({ error: businessError?.message ?? profileError?.message ?? 'Shop profile was not updated' }, 400);
    }
    return reply({ shopId, shopName, username });
  }

  if (action !== 'duplicate') return reply({ error: 'Unknown action' }, 400);
  const password = String(input.password ?? '');
  const copyStock = Boolean(input.copyStock);
  if (password.length < 6) return reply({ error: 'Password must have at least 6 characters' }, 400);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: `${username}@login.mik.app`, password, email_confirm: true, user_metadata: { username },
  });
  if (createError || !created.user) return reply({ error: createError?.message ?? 'Username could not be created' }, 400);

  let newBusinessId: string | null = null;
  try {
    let slug = shopName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shop';
    const { data: sameSlug } = await admin.from('businesses').select('id').eq('slug', slug).maybeSingle();
    if (sameSlug) slug = `${slug}-${crypto.randomUUID().slice(0, 6)}`;
    const { data: business, error: businessError } = await admin.from('businesses').insert({ name: shopName, slug, login_username: username, logo_url: source.logo_url }).select('id').single();
    if (businessError || !business) throw businessError ?? new Error('Shop was not created');
    newBusinessId = business.id;
    const { data: location, error: locationError } = await admin.from('locations').insert({ business_id: newBusinessId, name: 'Main Shop' }).select('id').single();
    if (locationError || !location) throw locationError ?? new Error('Shop location was not created');

    const [{ data: categories }, { data: styles }, { data: products }] = await Promise.all([
      admin.from('categories').select('*').eq('business_id', shopId).eq('active', true).order('sort_order'),
      admin.from('alphabet_styles').select('*').eq('business_id', shopId).eq('active', true),
      admin.from('products').select('*').eq('business_id', shopId).eq('active', true),
    ]);
    const categoryMap = new Map<string, string>();
    for (const category of categories ?? []) {
      const { data: copied, error } = await admin.from('categories').insert({ business_id: newBusinessId, name: category.name, sort_order: category.sort_order }).select('id').single();
      if (error || !copied) throw error ?? new Error('Category was not copied');
      categoryMap.set(category.id, copied.id);
    }
    if (!categoryMap.size) await admin.from('categories').insert({ business_id: newBusinessId, name: 'Other', sort_order: 0 });

    const styleMap = new Map<string, string>();
    for (const style of styles ?? []) {
      const { data: copied, error } = await admin.from('alphabet_styles').insert({ business_id: newBusinessId, name: style.name }).select('id').single();
      if (error || !copied) throw error ?? new Error('Keycap style was not copied');
      styleMap.set(style.id, copied.id);
      const { data: sourceLetters } = await admin.from('alphabet_letter_inventory').select('letter,quantity_on_hand').eq('style_id', style.id).eq('location_id', sourceLocation.id);
      const letters = sourceLetters?.length ? sourceLetters : Array.from({ length: 26 }, (_, i) => ({ letter: String.fromCharCode(65 + i), quantity_on_hand: 0 }));
      await admin.from('alphabet_letter_inventory').insert(letters.map((letter) => ({ style_id: copied.id, location_id: location.id, letter: letter.letter, quantity_on_hand: copyStock ? letter.quantity_on_hand : 0 })));
    }

    const productMap = new Map<string, string>();
    for (const product of products ?? []) {
      const { data: copied, error } = await admin.from('products').insert({
        business_id: newBusinessId, category_id: product.category_id ? categoryMap.get(product.category_id) ?? null : null,
        sku: product.sku, name: product.name, description: product.description, regular_price: product.regular_price,
        sale_price: product.sale_price, cost_price: product.cost_price, low_stock_threshold: product.low_stock_threshold,
        image_url: product.image_url, variant_label: product.variant_label,
        alphabet_style_id: product.alphabet_style_id ? styleMap.get(product.alphabet_style_id) ?? null : null,
        letters_required: product.letters_required,
      }).select('id').single();
      if (error || !copied) throw error ?? new Error('Product was not copied');
      productMap.set(product.id, copied.id);
      const { data: sourceStock } = await admin.from('inventory_levels').select('quantity_on_hand').eq('product_id', product.id).eq('location_id', sourceLocation.id).maybeSingle();
      await admin.from('inventory_levels').insert({ product_id: copied.id, location_id: location.id, quantity_on_hand: copyStock ? sourceStock?.quantity_on_hand ?? 0 : 0, needs_stock_count: !copyStock });
      const { data: variants } = await admin.from('product_variants').select('*').eq('product_id', product.id).eq('active', true);
      for (const variant of variants ?? []) {
        const { data: copiedVariant, error: variantError } = await admin.from('product_variants').insert({ product_id: copied.id, name: variant.name, price_override: variant.price_override }).select('id').single();
        if (variantError || !copiedVariant) throw variantError ?? new Error('Product choice was not copied');
        const { data: sourceVariantStock } = await admin.from('variant_inventory_levels').select('quantity_on_hand').eq('variant_id', variant.id).eq('location_id', sourceLocation.id).maybeSingle();
        await admin.from('variant_inventory_levels').insert({ variant_id: copiedVariant.id, location_id: location.id, quantity_on_hand: copyStock ? sourceVariantStock?.quantity_on_hand ?? 0 : 0 });
      }
    }

    await admin.from('profiles').upsert({ id: created.user.id, display_name: shopName, username });
    await admin.from('business_memberships').insert({ user_id: created.user.id, business_id: newBusinessId, role: 'owner', default_location_id: location.id });
    await admin.from('business_memberships').upsert({ user_id: authData.user.id, business_id: newBusinessId, role: 'owner', default_location_id: location.id });
    return reply({ shopId: newBusinessId, username, copiedProducts: productMap.size, copiedStock: copyStock });
  } catch (error) {
    if (newBusinessId) await admin.from('businesses').delete().eq('id', newBusinessId);
    await admin.auth.admin.deleteUser(created.user.id);
    return reply({ error: error instanceof Error ? error.message : 'Shop profile could not be duplicated' }, 400);
  }
});
