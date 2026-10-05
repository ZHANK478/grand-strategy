/* Map startup status is independent of authentication and AI. */
(() => {
 'use strict';
 let hideTimer=0;
 function loadingScreen(state){
  const overlay=document.getElementById('game-loading-screen');if(!overlay||!state)return;
  const fill=document.getElementById('game-loading-fill'),message=document.getElementById('game-loading-message');
  const retry=document.getElementById('game-loading-retry'),fallback=document.getElementById('game-loading-default');
  clearTimeout(hideTimer);
  if(state.status==='ready'){
   overlay.classList.remove('is-loading','is-error');overlay.classList.add('is-ready');
   fill.style.width='100%';message.textContent='Карта готова';overlay.setAttribute('aria-busy','false');
   hideTimer=setTimeout(()=>{if(window.GS_MAP_LOAD?.status==='ready')overlay.hidden=true;},180);
   return;
  }
  overlay.hidden=false;overlay.classList.remove('is-ready');
  overlay.classList.toggle('is-error',state.status==='error');
  overlay.classList.toggle('is-loading',state.status==='loading');
  overlay.setAttribute('aria-busy',String(state.status!=='error'));
  fill.style.width=state.status==='error'?'100%':state.status==='rendering'?'70%':'8%';
  message.textContent=state.status==='error'?'Не удалось загрузить карту: '+state.message:state.status==='rendering'?'Сценарий загружен. Строим карту…':'Подготавливаем сценарий и карту…';
  retry.hidden=state.status!=='error';fallback.hidden=state.status!=='error';
 }
 function sync(){
  const state=window.GS_MAP_LOAD;
  const label=document.getElementById('map-load-status');
  const retry=document.getElementById('map-load-retry');
  const fallback=document.getElementById('map-load-default');
  const picker=document.getElementById('mobile-country-picker');
  const start=document.getElementById('mobile-start-btn');
  if(!state)return;
  loadingScreen(state);
  if(label)label.textContent=state.status==='ready'?state.name+' · '+state.provinces+' провинций':state.name+' · '+state.message;
  if(retry)retry.hidden=state.status!=='error';
  if(fallback)fallback.hidden=state.status!=='error'||state.ref==='builtin-world';
  if(start&&state.status!=='ready')start.disabled=true;
  if(start&&state.status==='ready')queueMicrotask(()=>{if(window.GS_MAP_LOAD?.status==='ready')start.disabled=!picker?.value;});
  if(picker&&state.status==='error')picker.replaceChildren(new Option('Карта не загружена',''));
 }
 window.addEventListener('gs:scenario-status',sync);
 window.addEventListener('gs:supabase-ready',()=>{
  if(typeof testResumeAIConnection==='function')testResumeAIConnection();
 });
 sync();
})();
