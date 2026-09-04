import { createClient } from 'npm:@supabase/supabase-js@2';

const headers={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json'}});
const allowed=new Set(['sell','sales','orders','stock','products','reports','production','calendar','settings']);
const cleanPermissions=(value:unknown)=>Array.isArray(value)?[...new Set(value.map(String).filter(x=>allowed.has(x)))]:[];

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers});
  if(req.method!=='POST') return reply({error:'Method not allowed'},405);
  const url=Deno.env.get('SUPABASE_URL'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!serviceKey) return reply({error:'Server setup is incomplete'},500);
  const admin=createClient(url,serviceKey,{auth:{persistSession:false}});
  const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
  if(!token) return reply({error:'Please sign in again'},401);
  const {data:auth}=await admin.auth.getUser(token);
  if(!auth.user) return reply({error:'Please sign in again'},401);
  const input=await req.json().catch(()=>({}));
  const action=String(input.action??'list');
  const shopId=String(input.shopId??'');
  const {data:platform}=await admin.from('platform_admins').select('user_id').eq('user_id',auth.user.id).maybeSingle();

  if(action==='list_all'){
    if(!platform) return reply({error:'MIK owner access required'},403);
    const [{data:memberships,error:membershipError},{data:businesses},{data:profiles},{data:staffRows},{data:platformRows}]=await Promise.all([
      admin.from('business_memberships').select('user_id,business_id,role'),
      admin.from('businesses').select('id,name,status'),
      admin.from('profiles').select('id,display_name,username'),
      admin.from('shop_staff_accounts').select('user_id,business_id,display_name,login_username,permissions,active'),
      admin.from('platform_admins').select('user_id'),
    ]);
    if(membershipError) return reply({error:membershipError.message},400);
    const shopMap=new Map((businesses??[]).map(item=>[item.id,item]));
    const profileMap=new Map((profiles??[]).map(item=>[item.id,item]));
    const staffMap=new Map((staffRows??[]).map(item=>[`${item.business_id}:${item.user_id}`,item]));
    const platformIds=new Set((platformRows??[]).map(item=>item.user_id));
    const accounts=[];
    const addedPlatform=new Set<string>();
    for(const membership of memberships??[]){
      if(platformIds.has(membership.user_id)){
        if(addedPlatform.has(membership.user_id)) continue;
        addedPlatform.add(membership.user_id);
      }
      const profile=profileMap.get(membership.user_id);
      const staff=staffMap.get(`${membership.business_id}:${membership.user_id}`);
      const shop=shopMap.get(membership.business_id);
      const {data:userResult}=await admin.auth.admin.getUserById(membership.user_id);
      const user=userResult.user;
      const banned=Boolean(user?.banned_until&&new Date(user.banned_until).getTime()>Date.now());
      accounts.push({
        user_id:membership.user_id,
        shop_id:platformIds.has(membership.user_id)?null:membership.business_id,
        shop_name:platformIds.has(membership.user_id)?'All shops':shop?.name??'Unknown shop',
        display_name:staff?.display_name??profile?.display_name??'Shop user',
        login_username:staff?.login_username??profile?.username??user?.email?.replace(/@login\.mik\.app$/,'')??'No username',
        role:platformIds.has(membership.user_id)?'platform_owner':membership.role==='owner'?'shop_owner':'staff',
        permissions:staff?.permissions??[],
        active:!banned&&(staff?staff.active:shop?.status==='active'),
        created_at:user?.created_at??null,
        last_login:user?.last_sign_in_at??null,
      });
    }
    return reply({accounts});
  }

  if(!shopId) return reply({error:'Choose a shop'},400);
  const {data:shop}=await admin.from('businesses').select('id,name,login_username').eq('id',shopId).maybeSingle();
  if(!shop) return reply({error:'Shop not found'},404);
  const {data:shopOwner}=await admin.from('business_memberships').select('user_id').eq('user_id',auth.user.id).eq('business_id',shopId).eq('role','owner').maybeSingle();
  if(!platform&&!shopOwner) return reply({error:'Shop owner access required'},403);

  if(action==='list'){
    const {data:staff,error}=await admin.from('shop_staff_accounts').select('user_id,display_name,login_username,permissions,active,created_at').eq('business_id',shopId).order('display_name');
    if(error) return reply({error:error.message},400);
    const rows=[];
    for(const person of staff??[]){
      const {data:user}=await admin.auth.admin.getUserById(person.user_id);
      rows.push({...person,last_login:user.user?.last_sign_in_at??null});
    }
    return reply({staff:rows});
  }

  if(action==='create'){
    const name=String(input.displayName??'').trim();
    const short=String(input.username??'').trim().toLowerCase();
    const password=String(input.password??'');
    const permissions=cleanPermissions(input.permissions);
    if(!name) return reply({error:'Enter the staff name'},400);
    if(!/^[a-z0-9._-]{3,24}$/.test(short)) return reply({error:'Staff username must use 3–24 letters, numbers, dots, dashes or underscores'},400);
    if(password.length<6) return reply({error:'Password must have at least 6 characters'},400);
    if(!permissions.length) return reply({error:'Choose at least one function'},400);
    const login=`${shop.login_username??shop.id.slice(0,6)}.${short}`.toLowerCase();
    const {data:exists}=await admin.from('profiles').select('id').ilike('username',login).maybeSingle();
    if(exists) return reply({error:'This staff username is already in use'},409);
    const {data:created,error:createError}=await admin.auth.admin.createUser({email:`${login}@login.mik.app`,password,email_confirm:true,user_metadata:{username:login}});
    if(createError||!created.user) return reply({error:createError?.message??'Staff account was not created'},400);
    const {data:location}=await admin.from('locations').select('id').eq('business_id',shopId).eq('active',true).order('created_at').limit(1).maybeSingle();
    try{
      await admin.from('profiles').upsert({id:created.user.id,display_name:name,username:login});
      const {error:membershipError}=await admin.from('business_memberships').insert({user_id:created.user.id,business_id:shopId,role:'staff',default_location_id:location?.id??null});
      if(membershipError) throw membershipError;
      const {error:staffError}=await admin.from('shop_staff_accounts').insert({user_id:created.user.id,business_id:shopId,display_name:name,login_username:login,permissions});
      if(staffError) throw staffError;
      await admin.from('activity_logs').insert({business_id:shopId,actor_id:auth.user.id,actor_name:'Owner',action:'staff_created',entity_type:'staff',entity_id:created.user.id,summary:`Staff account created: ${name}`});
      return reply({userId:created.user.id,loginUsername:login});
    }catch(error){
      await admin.auth.admin.deleteUser(created.user.id);
      return reply({error:error instanceof Error?error.message:'Staff account was not created'},400);
    }
  }

  const userId=String(input.userId??'');
  const {data:person}=await admin.from('shop_staff_accounts').select('*').eq('user_id',userId).eq('business_id',shopId).maybeSingle();
  if(!person) return reply({error:'Staff account not found'},404);
  if(action==='permissions'){
    const permissions=cleanPermissions(input.permissions);
    if(!permissions.length) return reply({error:'Choose at least one function'},400);
    const {error}=await admin.from('shop_staff_accounts').update({permissions,updated_at:new Date().toISOString()}).eq('user_id',userId);
    if(error) return reply({error:error.message},400);
    return reply({updated:true});
  }
  if(action==='password'){
    const password=String(input.password??'');
    if(password.length<6) return reply({error:'Password must have at least 6 characters'},400);
    const {error}=await admin.auth.admin.updateUserById(userId,{password});
    if(error) return reply({error:error.message},400);
    return reply({updated:true});
  }
  if(action==='status'){
    const active=Boolean(input.active);
    const {error}=await admin.auth.admin.updateUserById(userId,{ban_duration:active?'none':'876000h'});
    if(error) return reply({error:error.message},400);
    await admin.from('shop_staff_accounts').update({active,updated_at:new Date().toISOString()}).eq('user_id',userId);
    return reply({updated:true});
  }
  return reply({error:'Unknown action'},400);
});
