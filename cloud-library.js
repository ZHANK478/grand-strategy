/* Private player library. Generated images use the separate, server-owned shared cache. */
(() => {
 'use strict';
 let syncing=null,syncUser=null,remoteSaves=[];
 const localListSaves=listSaves;
 listSaves=function(){
  const local=localListSaves();
  if(!account())return local;
  let remote=remoteSaves;
  if(!remote.length)try{remote=JSON.parse(localStorage.getItem('gs1852_remote_saves_'+gsUser.id)||'[]');}catch{}
  const merged=new Map(local.map(s=>[s.id,s]));
  for(const s of remote)if(s.user===gsUser.id&&(!merged.has(s.id)||s.savedAt>merged.get(s.id).savedAt))merged.set(s.id,s);
  return [...merged.values()].sort((a,b)=>b.savedAt-a.savedAt);
 };
 const writes=new Map();
 const pendingPrefix='gs1852_cloud_pending_';
 const account=()=>typeof sb!=='undefined'&&sb&&gsUser&&!gsUser.isAnonymous;
 const mark=(message,ok=true)=>{
  window.GS_LIBRARY_STATUS={message,ok};
  const el=document.getElementById('cloud-library-status');if(el){el.textContent=message;el.dataset.state=ok?'saved':'error';}
 };
 const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),v=>v.toString(16).padStart(2,'0')).join('');
 async function putCloud(kind,id,name,payload,metadata={}) {
  if(!account())return false;
  const user=gsUser.id,pendingKey=pendingPrefix+kind+'_'+id;
  localStorage.setItem(pendingKey,JSON.stringify({user,kind,id,name,metadata}));
  const text=JSON.stringify(payload),digest=await hash(text);
  const path=user+'/'+kind+'/'+digest+'.json';
  const old=await sb.from('cloud_library').select('path').eq('user_id',user).eq('kind',kind).eq('id',id).maybeSingle();
  if(old.error)throw Error(old.error.message);
  if(old.data?.path!==path){
   const upload=await sb.storage.from('player-library').upload(path,new Blob([text],{type:'application/json'}),{contentType:'application/json',upsert:true});
   if(upload.error)throw Error(upload.error.message);
  }
  const saved=await sb.from('cloud_library').upsert({user_id:user,kind,id,name,path,metadata,updated_at:new Date().toISOString()});
  if(saved.error)throw Error(saved.error.message);
  if(old.data?.path&&old.data.path!==path){
   const refs=await sb.from('cloud_library').select('id').eq('user_id',user).eq('path',old.data.path);
   if(!refs.error&&!refs.data?.length)await sb.storage.from('player-library').remove([old.data.path]);
  }
  localStorage.removeItem(pendingKey);mark('Сохранено в облаке');return true;
 }
 window.gsCloudPut=function(kind,id,name,payload,metadata={}){
  const key=kind+':'+id,owner=gsUser?.id,copy=JSON.parse(JSON.stringify(payload)),meta={...metadata};
  const next=(writes.get(key)||Promise.resolve()).catch(()=>{}).then(()=>gsUser?.id===owner?putCloud(kind,id,name,copy,meta):false);
  writes.set(key,next);next.finally(()=>{if(writes.get(key)===next)writes.delete(key);}).catch(()=>{});return next;
 };
 window.gsCloudDelete=async function(kind,id){
  if(!account())return;
  localStorage.removeItem(pendingPrefix+kind+'_'+id);
  const result=await sb.from('cloud_library').delete().eq('user_id',gsUser.id).eq('kind',kind).eq('id',id);if(result.error)mark('Не удалось удалить из облака',false);
 };
 async function readItem(row){
  const result=await sb.storage.from('player-library').download(row.path);if(result.error)throw Error(result.error.message);
  return JSON.parse(await result.data.text());
 }
 window.gsSyncLibrary=async function(){
  if(!account())return false;
  if(syncing)return syncUser===gsUser.id?syncing:syncing.then(()=>gsSyncLibrary());
  const user=gsUser.id;syncUser=user;
  syncing=(async()=>{
   mark('Сохраняем ваши партии, карты и сценарии…');
   const indexResult=await sb.from('cloud_library').select('*').eq('user_id',user);
   if(indexResult.error)throw Error(indexResult.error.message);
   const rows=indexResult.data||[],uploaded=new Set();
   const pending=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(pendingPrefix))pending.push(JSON.parse(localStorage.getItem(key)));}
   for(const p of pending){if(p.user!==user)continue;const data=p.kind==='scenario'?await idbGetScenario(scenarioDataKey(p.id)):await getEditorMapData(p.id);
    if(data){await gsCloudPut(p.kind,p.id,p.name,data,p.metadata);uploaded.add(p.kind+':'+p.id);}
   }
   const previousOwner=localStorage.getItem('gs1852_library_owner');
   const mayUpload=!previousOwner||previousOwner===user;
   if(mayUpload){
    for(const m of getMapsIndex()){
     const data=await getEditorMapData(m.id);
     if(data&&!rows.some(r=>r.kind==='map'&&r.id===m.id))await gsCloudPut('map',m.id,m.name,data,m);
    }
    for(const m of getScenariosIndex()){
     const data=await idbGetScenario(scenarioDataKey(m.id));
     if(data&&!rows.some(r=>r.kind==='scenario'&&r.id===m.id))await gsCloudPut('scenario',m.id,m.name,data,m);
    }
    for(const saved of listSaves()){
     const raw=localStorage.getItem(SAVE_PREFIX+saved.id);if(!raw)continue;
     const data=JSON.parse(raw);if(data._cloudUser&&data._cloudUser!==user)continue;
     const remote=await sb.from('saves').select('updated_at').eq('user_id',user).eq('id',saved.id).maybeSingle();
     if(remote.error)throw Error(remote.error.message);
     if(!remote.data||saved.savedAt>new Date(remote.data.updated_at).getTime()){
      const pc=data.countries?.[data.playerCountry]||{};
      const r=await sb.from('saves').upsert({user_id:user,id:saved.id,state:data,scenario_ref:data.scenarioRef,scenario_name:data.scenarioName,country:data.playerCountry,ruler:pc.ruler||'',turn:data.turn,year:data.year,month:data.month,treasury:pc.treasury||0,updated_at:new Date(data.savedAt||Date.now()).toISOString()});
      if(r.error)throw Error(r.error.message);
     }
    }
   }
   // Download scenarios before parties, so custom-map saves also work on a new device.
   for(const row of rows){
    if(gsUser?.id!==user)return false;
    if(uploaded.has(row.kind+':'+row.id))continue;
    const data=await readItem(row);
    if(row.kind==='scenario'){
     await idbPutScenario(scenarioDataKey(row.id),data);
     const idx=getScenariosIndex().filter(m=>m.id!==row.id);idx.push({...row.metadata,id:row.id,name:row.name});localStorage.setItem(SCENARIOS_INDEX_KEY,JSON.stringify(idx));
    }else if(row.kind==='map'){
     await putEditorMapData(row.id,data);
     const idx=getMapsIndex().filter(m=>m.id!==row.id);idx.push({...row.metadata,id:row.id,name:row.name});saveMapsIndex(idx);
    }
   }
   const saves=await cloudListSaves();
   // Cache only the small index. Full parties are fetched when opened, not all
   // copied into the browser's limited localStorage during every sign-in.
   remoteSaves=saves.map(s=>({...s,user}));
   try{localStorage.setItem('gs1852_remote_saves_'+user,JSON.stringify(remoteSaves));}catch(error){console.warn('Save index:',error.message);}
   localStorage.setItem('gs1852_library_owner',user);
   if(typeof initMenu==='function')initMenu();if(typeof renderSaveList==='function')renderSaveList();
   mark('Все партии, карты и сценарии сохранены в аккаунте');return true;
  })().catch(error=>{console.warn('Cloud library:',error.message);mark(error.name==='QuotaExceededError'?'На устройстве не хватает места для копии сохранений.':'Не удалось завершить сохранение в аккаунте. Нажмите «Повторить сохранение».',false);return false;}).finally(()=>{syncing=null;});
  return syncing;
 };
 // Hydrate each campaign from the shared cache without generating anything.
 window.gsHydratePortraits=async function(){
  if(!sb||!gsUser||typeof countries==='undefined'||typeof buildPersonPortraitPrompt!=='function')return;
  const owner=gsUser.id,world=countries,targets=[];
  for(const [country,c] of Object.entries(world))for(const role of ['ruler','pm']){
   const field=role==='pm'?'pmPortrait':'portrait',prompt=buildPersonPortraitPrompt(country,role);
   if(prompt&&!c[field])targets.push({country,c,role,field,prompt,id:String(targets.length)});
  }
  let changed=false;
  try{
   for(let i=0;i<targets.length;i+=100){
    const batch=targets.slice(i,i+100);
    const response=await fetch(GS_CONFIG.API_BASE+'/'+(gsUser.isAnonymous?'guest-ai':'ai'),{
     method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await authToken(),apikey:GS_CONFIG.SUPABASE_ANON_KEY},
     body:JSON.stringify({operation:'lookup_images',requests:batch.map(t=>({id:t.id,model:'google/gemini-3.1-flash-image',messages:[{role:'user',content:t.prompt}]}))})
    });
    if(!response.ok)throw Error('Не удалось загрузить готовые портреты');
    const data=await response.json();
    if(gsUser?.id!==owner||countries!==world)return;
    for(const t of batch)if(data.urls?.[t.id]&&countries[t.country]===t.c&&!t.c[t.field]&&buildPersonPortraitPrompt(t.country,t.role)===t.prompt){t.c[t.field]=data.urls[t.id];changed=true;}
   }
   if(changed){if(typeof renderRulerPortrait==='function')renderRulerPortrait();window.dispatchEvent(new Event('gs-portraits-ready'));if(gameStarted)saveGame();}
  }catch(error){console.warn('Ready portraits:',error.message);}
 };
 const originalStart=startGame;
 startGame=function(...args){const result=originalStart(...args);gsHydratePortraits();return result;};
 window.addEventListener('online',()=>gsHydratePortraits());
 const imagePath=url=>{
  try{const u=new URL(url);if(u.origin!==new URL(GS_CONFIG.SUPABASE_URL).origin)return null;
   const match=/\/storage\/v1\/object\/sign\/generated-images\/([a-f0-9]{64}\.(?:png|jpeg|webp))$/.exec(u.pathname);return match?.[1]||null;
  }catch{return null;}
 };
 async function resolvePaths(paths){
  if(!sb||!gsUser||!paths.length)return {};
  const response=await fetch(GS_CONFIG.API_BASE+'/'+(gsUser.isAnonymous?'guest-ai':'ai'),{
   method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await authToken(),apikey:GS_CONFIG.SUPABASE_ANON_KEY},body:JSON.stringify({operation:'resolve_images',paths})
  });
  const data=await response.json();if(!response.ok)throw Error('Не удалось загрузить изображения из библиотеки');return data.urls||{};
 }
 window.gsResolveImages=async function(state){
  const targets=[];
  function visit(value){if(!value||typeof value!=='object')return;for(const [key,item] of Object.entries(value)){
   if(typeof item==='string'){const path=imagePath(item);if(path)targets.push({value,key,path});}
   else if(item&&typeof item==='object')visit(item);
  }}
  visit(state);const paths=[...new Set(targets.map(t=>t.path))];
  for(let i=0;i<paths.length;i+=100){const urls=await resolvePaths(paths.slice(i,i+100));for(const t of targets)if(urls[t.path])t.value[t.key]=urls[t.path];}
  return state;
 };
 const refreshing=new Map();
 document.addEventListener('error',async event=>{
  const el=event.target;if(!(el instanceof HTMLImageElement)||el.dataset.cloudRetry==='1')return;
  const path=imagePath(el.src);if(!path)return;
  el.dataset.cloudRetry='1';
  try{
   if(!refreshing.has(path))refreshing.set(path,resolvePaths([path]).finally(()=>refreshing.delete(path)));
   const urls=await refreshing.get(path);if(urls[path])el.src=urls[path];
  }catch{}finally{setTimeout(()=>delete el.dataset.cloudRetry,60000);}
 },true);
 window.addEventListener('online',()=>{if(account())gsSyncLibrary();});
 const originalLoad=loadGameSlot;
 loadGameSlot=async function(id){
  let data=JSON.parse(localStorage.getItem(SAVE_PREFIX+id)||'null');
  if(account())try{
   await gsSyncLibrary();
   const cloud=await cloudLoad(id);if(cloud&&(!data||cloud.savedAt>=data.savedAt))data=cloud;
  }catch(error){mark('Не удалось загрузить партию из аккаунта. Открыта копия с этого устройства.',false);}
  if(data)try{await gsResolveImages(data);}catch{mark('Изображения ожидают подключения',false);}
  return originalLoad(id,data);
 };
 const originalDelete=deleteSave;
 if(typeof originalDelete==='function')deleteSave=function(id){originalDelete(id);if(account())cloudDelete(id).then(()=>{remoteSaves=remoteSaves.filter(s=>s.id!==id);try{localStorage.removeItem('gs1852_remote_saves_'+gsUser.id);}catch{}if(typeof renderSaveList==='function')renderSaveList();}).catch(()=>mark('Не удалось удалить из аккаунта',false));};
})();
