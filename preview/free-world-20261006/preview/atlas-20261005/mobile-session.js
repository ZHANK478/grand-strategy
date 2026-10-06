
/* Mobile-only guest access. Registration UI is deliberately dormant. */
(() => {
  'use strict';
  let ready=null, guest=true, remaining=10, running=false, errorMessage='';
  window.GS_GUEST_TURN_ID=null;
  const badge=document.getElementById('mobile-turn-balance');
  const note=document.getElementById('mobile-guest-note');
  function render() {
    badge.textContent=guest?'Гость · '+remaining+' ходов':'Ходов: '+(gsProfile?.turns_balance??'…');
    note.textContent=errorMessage||'10 гостевых ходов. Регистрация не нужна.';
    if(errorMessage)badge.textContent='Гость · ИИ недоступен';
  }
  window.renderAccountBar=render;
  window.renderMenuAuth=()=>{document.getElementById('menu-login-btn').hidden=true;};
  window.openLogin=window.showLoginOverlay=()=>{};
  window.openShop=()=>showNotif('Ходы закончились. Партия сохранена.');
  window.turnsLeft=()=>guest?remaining:(gsProfile?.turns_balance??0);
  function accept(session) {
    gsAccessToken=session?.access_token||null;
    gsUser=session?.user?{id:session.user.id,email:session.user.email,isAnonymous:!!session.user.is_anonymous}:null;
    guest=!session?.user||!!session.user.is_anonymous;
    if(!guest)setTimeout(()=>loadProfile().then(render),0);
    render();
  }
  async function guestRequest(body) {
    const token=await authToken();
    if(!token)throw Error('Гостевой ИИ пока недоступен. Регистрация не требуется.');
    const response=await fetch(window.GS_CONFIG.API_BASE+'/guest-ai',{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,
        apikey:window.GS_CONFIG.SUPABASE_ANON_KEY},body:JSON.stringify(body)
    });
    let data;
    try{data=await response.json();}catch{throw Error('Гостевой сервер пока недоступен.');}
    if(!response.ok||data.error) {
      if(data.error==='no_turns'){remaining=0;render();throw Error('10 гостевых ходов закончились. Партия сохранена.');}
      throw Error(data.message||'Гостевой сервер пока недоступен.');
    }
    if(typeof data.guest_turns_remaining==='number'){remaining=data.guest_turns_remaining;render();}
    return data;
  }
  window.initAuth=()=>{
    if(ready)return ready;
    ready=(async()=>{
      if(!backendOn()||!window.supabase)throw Error('Гостевой ИИ пока недоступен.');
      sb=window.supabase.createClient(window.GS_CONFIG.SUPABASE_URL,window.GS_CONFIG.SUPABASE_ANON_KEY,{
        auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}
      });
      sb.auth.onAuthStateChange((event,session)=>accept(session));
      const {data,error}=await sb.auth.getSession();
      if(error)throw error;
      let session=data?.session;
      if(!session){
        const result=await sb.auth.signInAnonymously();
        if(result.error)throw Error('Гостевой ИИ пока недоступен. Регистрация не требуется.');
        session=result.data.session;
      }
      accept(session);
      if(guest)await guestRequest({operation:'status'});
      hideLoginOverlay();
      return true;
    })().catch(error=>{errorMessage=error.message;render();return false;});
    return ready;
  };
  const accountProxy=proxyCall;
  proxyCall=async function(kind,payload) {
    if(!await initAuth())return {error:'guest_unavailable',message:errorMessage};
    if(!guest)return accountProxy(kind,payload);
    if(kind==='image')return {error:'premium_required'};
    try{return await guestRequest({...payload,operation:'generate',turn_id:window.GS_GUEST_TURN_ID});}
    catch(error){return {error:error.message};}
  };
  const originalNextTurn=nextTurn;
  nextTurn=async function(kind) {
    if(running||turnRunning)return;
    running=true;
    const button=document.querySelector('.next-btn');
    button.disabled=true;
    try {
      if(!await initAuth()){showNotif(errorMessage);return;}
      if(guest) {
        if(remaining<=0){showNotif('10 гостевых ходов закончились. Партия сохранена.');return;}
        // Reserve once, before advancing the calendar or applying economic changes.
        const requestId=crypto.randomUUID();
        const data=await guestRequest({operation:'begin_turn',request_id:requestId});
        window.GS_GUEST_TURN_ID=data.turn_id;
      }
      mobileSection('map');
      await originalNextTurn(kind);
    } catch(error){showNotif(error.message);}
    finally {running=false;button.disabled=false;button.textContent='Следующий ход ▶';render();}
  };
  const originalImage=askGeminiImage;
  askGeminiImage=async function(prompt){return guest?null:originalImage(prompt);};
  render();
  initMenu();initSkipSelect();
  initAuth(); // The map and menu never wait for authentication.
})();
