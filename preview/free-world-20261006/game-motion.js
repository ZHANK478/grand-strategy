/* Presentation only: no timers, API requests or mutations of game state. */
(() => {
 'use strict';
 const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
 let preference=true;
 try{preference=localStorage.getItem('gs-motion-enabled')!=='0';}catch{}
 const enabled=()=>preference&&!reduce.matches&&!document.hidden;
 const panels=['left-panel','mobile-country-card','actions-panel','adv-pop','diplo-pop','relations-panel','economy-panel','society-screen','history-panel','events-box','changes-box','mobile-actions-menu','gdp-ranking-panel','main-menu','pause-menu','settings-panel','load-menu','model-menu','scenario-menu','test-ai-connection','rotate-screen'];
 const overlays=new Set(['main-menu','pause-menu','settings-panel','load-menu','model-menu','scenario-menu','test-ai-connection','rotate-screen']);
 const seen=new WeakMap(),running=new WeakMap(),animations=new Set(),contentSeen=new Set();
 let frame=0;
 const visible=el=>!!el&&!el.hidden&&el.style.display!=='none'&&!el.classList.contains('hidden')&&getComputedStyle(el).display!=='none'&&el.getClientRects().length>0;
 function play(el,frames,options){
  if(!enabled()||!el?.animate)return;
  running.get(el)?.cancel();
  const animation=el.animate(frames,{duration:200,easing:'cubic-bezier(.2,.75,.25,1)',...options});
  running.set(el,animation);animations.add(animation);
  const done=()=>{animations.delete(animation);if(running.get(el)===animation)running.delete(el);};
  animation.addEventListener('finish',done,{once:true});animation.addEventListener('cancel',done,{once:true});
 }
 function sync(){
  document.body.classList.toggle('gs-motion-on',enabled());
  document.body.classList.toggle('gs-motion-off',!enabled());
  const setting=document.getElementById('setting-motion');
  if(setting){setting.checked=preference&&!reduce.matches;setting.disabled=reduce.matches;}
  const note=document.getElementById('setting-motion-note');
  if(note)note.textContent=reduce.matches?'Анимации отключены настройкой уменьшения движения на устройстве.':'Короткие переходы панелей и плавное движение значков на карте.';
  if(!enabled()){for(const animation of [...animations])animation.cancel();if(typeof renderMapObjects==='function')renderMapObjects();}
 }
 window.GS_MOTION={enabled};
 window.gsSetMotion=value=>{preference=!!value;try{localStorage.setItem('gs-motion-enabled',preference?'1':'0');}catch{}sync();};
 function scan(){
  frame=0;
  for(const id of panels){
   const el=document.getElementById(id);if(!el)continue;
   const now=visible(el),previous=seen.get(el);seen.set(el,now);
   if(!now){running.get(el)?.cancel();continue;}
   if(previous===false){
    if(overlays.has(id)){
     play(el,[{opacity:0},{opacity:1}],{duration:160});
     const box=el.firstElementChild;
     if(box)play(box,[{transform:'translateY(10px)',opacity:.7},{transform:'none',opacity:1}],{duration:230});
    }else{
     const offset=id==='events-box'||id==='changes-box'?14:-14;
     play(el,[{opacity:0,transform:'translateX('+offset+'px)'},{opacity:1,transform:'none'}],{duration:220});
    }
   }
  }
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(scan);}
 function loading(){
  const el=document.getElementById('map-load-status');
  const state=window.GS_MAP_LOAD;
  if(el){const busy=!!state&&state.status!=='ready'&&state.status!=='error';el.dataset.motionBusy=String(busy);el.setAttribute('aria-busy',String(busy));}
 }
 function busy(){
  const button=document.querySelector('.next-btn');if(!button)return;
  const waiting=!!button.disabled;
  button.dataset.motionBusy=String(waiting);
  button.setAttribute('aria-busy',String(waiting));
 }
 function animateContent(records){
  const fresh=[];
  for(const record of records)for(const node of record.addedNodes){
   if(node.nodeType!==1)continue;
   const items=node.matches?.('.newspaper-article,.diplo-msg,.order-card')?[node]:[...node.querySelectorAll?.('.newspaper-article,.diplo-msg,.order-card')||[]];
   for(const el of items){
    const key=el.className+'|'+el.textContent.slice(0,600);
    if(contentSeen.has(key))continue;contentSeen.add(key);
    if(visible(el))fresh.push(el);
   }
  }
  if(contentSeen.size>400){const keep=[...contentSeen].slice(-200);contentSeen.clear();keep.forEach(k=>contentSeen.add(k));}
  fresh.slice(-6).forEach((el,i)=>play(el,[{opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'none'}],{duration:180,delay:i*25}));
 }
 for(const id of panels){const el=document.getElementById(id);if(el){el.dataset.gsMotionPanel='';seen.set(el,visible(el));}}
 if(typeof MutationObserver==='function'){
  const observer=new MutationObserver(schedule);
  for(const id of panels){const el=document.getElementById(id);if(el)observer.observe(el,{attributes:true,attributeFilter:['style','hidden','class']});}
  observer.observe(document.body,{attributes:true,attributeFilter:['class']});
  const contentObserver=new MutationObserver(animateContent);
  for(const id of ['domestic-list','events-list','diplo-messages','actions-list']){const el=document.getElementById(id);if(el){el.querySelectorAll('.newspaper-article,.diplo-msg,.order-card').forEach(n=>contentSeen.add(n.className+'|'+n.textContent.slice(0,600)));contentObserver.observe(el,{childList:true,subtree:true});}}
  const next=document.querySelector('.next-btn');
  if(next)new MutationObserver(busy).observe(next,{attributes:true,attributeFilter:['disabled']});
  for(const id of ['treasury','income','army','mobile-card-name']){
   const el=document.getElementById(id);if(!el)continue;let text=el.textContent;
   new MutationObserver(()=>{if(el.textContent===text)return;text=el.textContent;if(visible(el))play(el,[{opacity:.45},{opacity:1}],{duration:260});}).observe(el,{childList:true,subtree:true,characterData:true});
  }
 }
 document.addEventListener('visibilitychange',sync);
 reduce.addEventListener?.('change',sync);
 window.addEventListener('gs:scenario-status',loading);
 sync();loading();busy();
})();
