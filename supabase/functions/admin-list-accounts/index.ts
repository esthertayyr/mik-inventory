import { createClient } from 'npm:@supabase/supabase-js@2';

const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json'}});

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers});
  if(req.method!=='POST')return reply({error:'Method not allowed'},405);
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)return reply({error:'Server setup is incomplete'},500);
  const admin=createClient(url,key,{auth:{persistSession:false}});
  const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
  if(!token)return reply({error:'Please sign in again'},401);
  const {data:auth}=await admin.auth.getUser(token);
  if(!auth.user)return reply({error:'Please sign in again'},401);
  const {data:owner}=await admin.from('platform_admins').select('user_id').eq('user_id',auth.user.id).maybeSingle();
  if(!owner)return reply({error:'MIK owner access required'},403);
  const [{data:memberships,error},{data:businesses},{data:profiles},{data:staffRows},{data:platformRows}]=await Promise.all([
    admin.from('business_memberships').select('user_id,business_id,role'),
    admin.from('businesses').select('id,name,status'),
    admin.from('profiles').select('id,display_name,username'),
    admin.from('shop_staff_accounts').select('user_id,business_id,display_name,login_username,permissions,active'),
    admin.from('platform_admins').select('user_id'),
  ]);
  if(error)return reply({error:error.message},400);
  const shopMap=new Map((businesses??[]).map(x=>[x.id,x]));
  const profileMap=new Map((profiles??[]).map(x=>[x.id,x]));
  const staffMap=new Map((staffRows??[]).map(x=>[`${x.business_id}:${x.user_id}`,x]));
  const platformIds=new Set((platformRows??[]).map(x=>x.user_id));
  const accounts=[];const addedPlatform=new Set<string>();
  for(const member of memberships??[]){
    const isPlatform=platformIds.has(member.user_id);
    if(isPlatform){if(addedPlatform.has(member.user_id))continue;addedPlatform.add(member.user_id);}
    const profile=profileMap.get(member.user_id),staff=staffMap.get(`${member.business_id}:${member.user_id}`),shop=shopMap.get(member.business_id);
    const {data:authUser}=await admin.auth.admin.getUserById(member.user_id);const user=authUser.user;
    const banned=Boolean(user?.banned_until&&new Date(user.banned_until).getTime()>Date.now());
    accounts.push({user_id:member.user_id,shop_id:isPlatform?null:member.business_id,shop_name:isPlatform?'All shops':shop?.name??'Unknown shop',display_name:staff?.display_name??profile?.display_name??'Shop user',login_username:staff?.login_username??profile?.username??user?.email?.replace(/@login\.mik\.app$/,'')??'No username',role:isPlatform?'platform_owner':member.role==='owner'?'shop_owner':'staff',permissions:staff?.permissions??[],active:!banned&&(isPlatform?true:staff?staff.active:shop?.status==='active'),created_at:user?.created_at??null,last_login:user?.last_sign_in_at??null});
  }
  accounts.sort((a,b)=>a.shop_name.localeCompare(b.shop_name)||a.role.localeCompare(b.role)||a.display_name.localeCompare(b.display_name));
  return reply({accounts});
});
