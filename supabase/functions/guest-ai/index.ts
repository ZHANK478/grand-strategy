// Deploy as the separate Supabase Edge Function "guest-ai".
// Disable gateway Verify JWT: this function validates the user itself.
// Uses the existing OPENROUTER_KEY secret. Never expose that key to the browser.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const GUEST_MODELS=['google/gemini-3.1-flash-lite','openai/gpt-6-luna','z-ai/glm-5.3-flashx','z-ai/glm-5.3','anthropic/claude-sonnet-5.5'];
// Configure the exact catalogue-confirmed Sonnet ID during deployment; do not guess it.
const sonnetModel=Deno.env.get('GS_SONNET_MODEL');
if(sonnetModel&&sonnetModel.startsWith('anthropic/')&&/^[a-z0-9._:-]+$/.test(sonnetModel.slice(10)))GUEST_MODELS.push(sonnetModel);
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, content-type, apikey',
 'Access-Control-Allow-Methods':'POST, OPTIONS'};
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});}
async function diagnostics(){
 const key=Deno.env.get('OPENROUTER_KEY');
 let keyValid=false,keyStatus:number|null=null,anonymousEnabled:boolean|null=null;
 let available:string[]=[];
 try{
  const settings=await fetch(Deno.env.get('SUPABASE_URL')+'/auth/v1/settings',{headers:{apikey:Deno.env.get('SUPABASE_ANON_KEY')!}});
  if(settings.ok){const data=await settings.json();anonymousEnabled=!!data.external?.anonymous_users;}
 }catch{}
 if(key)try{
  const check=await fetch('https://openrouter.ai/api/v1/auth/key',{headers:{Authorization:'Bearer '+key}});
  keyStatus=check.status;keyValid=check.ok;
 }catch{}
 try{
  const catalog=await fetch('https://openrouter.ai/api/v1/models');
  if(catalog.ok){
   const data=await catalog.json();const rows=Array.isArray(data.data)?data.data:[];
   const ids=new Set(rows.map((m:{id:string})=>m.id));
   available=GUEST_MODELS.filter(id=>ids.has(id));
  }
 }catch{}
 return {key_configured:!!key,openrouter_key_valid:keyValid,openrouter_key_status:keyStatus,
  anonymous_signins_enabled:anonymousEnabled,guest_models:GUEST_MODELS,
  catalogue_available_models:available};
}

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method==='GET'){
  return json(await diagnostics());
 }
 if(req.method!=='POST')return json({error:'method'},405);
 try {
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'').trim();
  if(!token)return json({error:'no_auth'},401);
  const url=Deno.env.get('SUPABASE_URL')!;
  const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
  const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const client=createClient(url,anon,{global:{headers:{Authorization:'Bearer '+token}}});
  const {data:userData,error:authError}=await client.auth.getUser();
  if(authError||!userData.user?.is_anonymous)return json({error:'guest_required'},401);
  const id=userData.user.id;
  const admin=createClient(url,service);
  const body=await req.json();
  const key=Deno.env.get('OPENROUTER_KEY');
  if(!key)return json({error:'server_no_key'},503);
  const {data:remaining,error:statusError}=await admin.rpc('mobile_guest_status',{p_user:id});
  if(statusError)return json({error:'guest_setup_required'},503);
  if(body.operation==='status')return json({guest_turns_remaining:remaining,guest_models:GUEST_MODELS});
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(body.operation==='begin_turn'){
   if(!uuid.test(body.request_id||''))return json({error:'bad_request_id'},400);
   const {data:left,error}=await admin.rpc('mobile_guest_begin',{p_user:id,p_request:body.request_id});
   if(error)return json({error:'reserve_failed'},503);
   if(left<0)return json({error:'no_turns',guest_turns_remaining:0},402);
   return json({turn_id:body.request_id,guest_turns_remaining:left});
  }
  if(body.operation!=='generate'||!Array.isArray(body.messages)||
    body.messages.length>16||JSON.stringify(body.messages).length>140000||
    typeof body.model!=='string'||body.model.length>120)return json({error:'bad_payload'},400);
  if(!GUEST_MODELS.includes(body.model))return json({error:'model_not_allowed',guest_models:GUEST_MODELS},400);
  const turnId=body.turn_id||null;
  if(turnId!==null&&!uuid.test(turnId))return json({error:'bad_turn_id'},400);
  // Only free profile preparation is allowed before the first reserved turn.
  if(!turnId&&body.cost!==0)return json({error:'turn_required'},409);
  const {data:allowed,error:quotaError}=await admin.rpc('mobile_guest_request',{p_user:id,p_turn:turnId});
  if(quotaError)return json({error:'quota_unavailable'},503);
  if(!allowed)return json({error:'request_limit',message:'Лимит гостевых запросов исчерпан.'},429);
  // Only an explicit server-side allowlist can use the shared key.
  const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{
   method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},
   body:JSON.stringify({model:body.model,messages:body.messages,
    max_tokens:Math.min(12000,Math.max(100,Number(body.max_tokens)||400)),temperature:0.75})
  });
  const result=await response.json();
  if(!response.ok)return json({error:'ai_unavailable',message:'ИИ временно недоступен. Попробуйте позже.'},502);
  return json({...result,guest_turns_remaining:remaining});
 }catch{return json({error:'server_error'},500);}
});
