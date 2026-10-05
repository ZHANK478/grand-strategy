/* Private player library. Generated images use the separate, server-owned shared cache. */
(() => {
 'use strict';
 let syncing=null;
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
  const key=kind+':'+id,copy=JSON.parse(JSON.stringify(payload)),meta={...metadata};
  const next=(writes.get(key)||Promise.resolve()).catch(()=>{}).then(()=>putCloud(kind,id,name,copy,meta));
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
  if(!account())return false;if(syncing)return syncing;
  const user=gsUser.id;
  syncing=(async()=>{
   mark('Синхронизация…');
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
   for(const saved of saves){
    const raw=localStorage.getItem(SAVE_PREFIX+saved.id),local=raw?JSON.parse(raw):null;
    if(local&&local.savedAt>=saved.savedAt&&(!local._cloudUser||local._cloudUser===user))continue;
    const data=await cloudLoad(saved.id);if(!data)throw Error('Не удалось загрузить партию');
    data._cloudUser=user;
    const slim=JSON.parse(JSON.stringify(data));Object.values(slim.countries||{}).forEach(c=>{c.portrait=null;c.pmPortrait=null;});
    localStorage.setItem(SAVE_PREFIX+saved.id,JSON.stringify(slim));
   }
   localStorage.setItem('gs1852_library_owner',user);
   if(typeof initMenu==='function')initMenu();if(typeof renderSaveList==='function')renderSaveList();
   mark('Библиотека синхронизирована');return true;
  })().catch(error=>{console.warn('Cloud library:',error.message);mark('Локальная копия сохранена · облако недоступно',false);return false;}).finally(()=>{syncing=null;});
  return syncing;
 };
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
  }catch(error){mark('Открыта локальная копия',false);}
  if(data)try{await gsResolveImages(data);}catch{mark('Изображения ожидают подключения',false);}
  return originalLoad(id,data);
 };
 const originalDelete=deleteSave;
 if(typeof originalDelete==='function')deleteSave=function(id){originalDelete(id);if(account())cloudDelete(id).catch(()=>mark('Не удалось удалить из облака',false));};
})();
