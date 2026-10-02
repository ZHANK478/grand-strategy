/* Map startup status is independent of authentication and AI. */
(() => {
 'use strict';
 function sync(){
  const state=window.GS_MAP_LOAD;
  const label=document.getElementById('map-load-status');
  const retry=document.getElementById('map-load-retry');
  const fallback=document.getElementById('map-load-default');
  const picker=document.getElementById('mobile-country-picker');
  const start=document.getElementById('mobile-start-btn');
  if(!state)return;
  if(label)label.textContent=state.status==='ready'?state.name+' · '+state.provinces+' провинций':state.name+' · '+state.message;
  if(retry)retry.hidden=state.status!=='error';
  if(fallback)fallback.hidden=state.status!=='error'||state.ref==='builtin-world';
  if(start&&state.status!=='ready')start.disabled=true;
  if(picker&&state.status==='error')picker.replaceChildren(new Option('Карта не загружена',''));
 }
 window.addEventListener('gs:scenario-status',sync);
 window.addEventListener('gs:supabase-ready',()=>{
  if(typeof testResumeAIConnection==='function')testResumeAIConnection();
 });
 sync();
})();
