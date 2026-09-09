import { createClient } from 'npm:@supabase/supabase-js@2';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json'}});
const validUsername=(value:string)=>/^[a-z0-9._-]{3,30}$/.test(value);
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers});
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)return reply({error:'Server setup is incomplete'},500);
  const admin=createClient(url,key,{auth:{persistSession:false}});
  const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
  const {data:auth}=await admin.auth.getUser(token??'');
  if(!auth.user)return reply({error:'Please sign in again'},401);
  const {data:owner}=await admin.from('platform_admins').select('user_id').eq('user_id',auth.user.id).maybeSingle();
  if(!owner)return reply({error:'Main owner access required'},403);
  const input=await req.json().catch(()=>({})); const action=String(input.action??'list');
  if(action==='rename_owner'){
    const username=String(input.username??'').trim().toLowerCase();
    if(!validUsername(username))return reply({error:'Check the new username'},400);
    const {error}=await admin.auth.admin.updateUserById(auth.user.id,{email:`${username}@login.mik.app`,email_confirm:true,user_metadata:{...(auth.user.user_metadata??{}),username}});
    if(error)return reply({error:error.message},400);
    await admin.from('profiles').update({username,display_name:'Esther'}).eq('id',auth.user.id);
    return reply({username});
  }
  if(action==='list'){
    const {data:members,error}=await admin.from('platform_team_members').select('user_id,display_name,permissions,active,created_at,platform_team_shops(business_id)').order('created_at');
    if(error)return reply({error:error.message},400);
    const users=await admin.auth.admin.listUsers({page:1,perPage:1000});
    return reply({members:(members??[]).map((m:any)=>({...m,username:(users.data.users.find(u=>u.id===m.user_id)?.email??'').replace('@login.mik.app','')}))});
  }
  if(action==='create'){
    const username=String(input.username??'').trim().toLowerCase(),password=String(input.password??''),displayName=String(input.displayName??'').trim();
    const shopIds=Array.isArray(input.shopIds)?input.shopIds.map(String):[]; const permissions=Array.isArray(input.permissions)?input.permissions.map(String):['view_dashboard'];
    if(!validUsername(username)||password.length<6||!displayName)return reply({error:'Enter a name, valid username and password of at least 6 characters'},400);
    const created=await admin.auth.admin.createUser({email:`${username}@login.mik.app`,password,email_confirm:true,user_metadata:{username}});
    if(created.error||!created.data.user)return reply({error:created.error?.message??'Account not created'},400);
    const id=created.data.user.id;
    try{
      await admin.from('profiles').upsert({id,display_name:displayName,username});
      const {error}=await admin.from('platform_team_members').insert({user_id:id,display_name:displayName,permissions,created_by:auth.user.id}); if(error)throw error;
      if(shopIds.length){const {error:e}=await admin.from('platform_team_shops').insert(shopIds.map((business_id:string)=>({user_id:id,business_id})));if(e)throw e;}
      return reply({userId:id,username});
    }catch(error){await admin.auth.admin.deleteUser(id);return reply({error:error instanceof Error?error.message:'Account not created'},400);}
  }
  return reply({error:'Unknown action'},400);
});
