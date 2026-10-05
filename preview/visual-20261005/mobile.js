
/* Landscape navigation: one sheet at a time, with a persistent map. */
(() => {
  'use strict';
  const sheets=['mobile-country-card','left-panel','events-box','changes-box','actions-panel','adv-pop','diplo-pop','relations-panel','economy-panel','history-panel','society-screen'];
  const panel=document.getElementById('left-panel');
  const more=document.getElementById('mobile-more');
  const desktopQuery=window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)');
  const isLaptop=()=>desktopQuery.matches;
  function syncLaptop(){
    document.body.classList.toggle('laptop-mode',isLaptop());
    if(typeof gameStarted!=='undefined'&&gameStarted)renderPlayerStats();
  }
  desktopQuery.addEventListener?.('change',syncLaptop);syncLaptop();
  const workingPanels=['left-panel','mobile-country-card','actions-panel','adv-pop','diplo-pop','economy-panel','history-panel','changes-box','society-screen'];
  let panelZ=260,slot=0;
  function focusPanel(id){
    if(!isLaptop())return;
    const el=document.getElementById(id);
    if(id==='left-panel'||id==='mobile-country-card'){
      el.style.removeProperty('--desktop-left');
      el.style.removeProperty('--desktop-top');
      el.style.removeProperty('--desktop-z');
      return;
    }
    if(!el.style.getPropertyValue('--desktop-left')){
      const n=1+slot++%2;
      el.style.setProperty('--desktop-left',n===0?'10px':n===1?'calc(35vw - 5px)':'calc(70vw - 20px)');
      el.style.setProperty('--desktop-top','90px');
    }
    el.style.setProperty('--desktop-z',String(++panelZ));
  }
  function closeCountry(){
    panel.classList.add('hidden');panel.style.display='none';panelOpen=false;
    document.getElementById('mobile-country-card').hidden=true;
    document.getElementById('mobile-country-card').style.display='none';
    document.body.classList.remove('mobile-country-open');
    document.getElementById('mobile-flag-button').setAttribute('aria-expanded','false');
  }
  window.mobileCloseCountry=closeCountry;
  function closeSheets(preserve=false) {
    if(preserve&&isLaptop()){
      document.getElementById('mobile-actions-menu').hidden=true;
      document.getElementById('mobile-actions-button').setAttribute('aria-expanded','false');
      document.getElementById('pause-menu').style.display='none';
      return;
    }
    sheets.forEach(id=>document.getElementById(id).style.display='none');
    panel.classList.add('hidden');panelOpen=false;more.hidden=true;
    document.getElementById('mobile-country-card').hidden=true;
    document.getElementById('pause-menu').style.display='none';
    document.body.classList.remove('mobile-sheet-open','mobile-country-open');
    document.getElementById('mobile-actions-menu').hidden=true;
    document.getElementById('mobile-actions-button').setAttribute('aria-expanded','false');
    document.getElementById('mobile-flag-button').setAttribute('aria-expanded','false');
  }
  function mark() {}
  window.mobileSection=name=>{
    closeSheets(!['map','pause','more','settings'].includes(name));
    if(name==='country')closeCountry();
    mark(['map','actions','diplo','news','more'].includes(name)?name:'more');
    switch(name) {
      case 'country':panel.classList.remove('hidden');panel.style.display='block';panelOpen=true;
        document.body.classList.add('mobile-country-open');
        document.getElementById('mobile-flag-button').setAttribute('aria-expanded','true');break;
      case 'actions':openActionsPanel();break;
      case 'diplo':openDiploPanel();break;
      case 'advisor':document.getElementById('adv-pop').style.display='block';break;
      case 'economy':openEconomyPanel();break;
      case 'society':openSocietyScreen();break;
      case 'history':openHistoryPanel();break;
      case 'news':document.getElementById('events-box').style.display='block';document.getElementById('mobile-news-button').classList.remove('has-news');break;
      case 'changes':document.getElementById('changes-box').style.display='block';break;
      case 'more':case 'pause':openPauseMenu();break;
      case 'settings':openSettings();break;

    }
    const target={country:'left-panel',actions:'actions-panel',advisor:'adv-pop',economy:'economy-panel',society:'society-screen',history:'history-panel',news:'events-box',changes:'changes-box'}[name];
    if(target)focusPanel(target);
    document.body.classList.toggle('mobile-sheet-open',name!=='map'&&name!=='pause'&&name!=='more'&&name!=='country');
  };
  window.mobileCloseActions=()=>{
    document.getElementById('mobile-actions-menu').hidden=true;
    document.getElementById('mobile-actions-button').setAttribute('aria-expanded','false');
  };
  window.mobileOpenActions=()=>{
    const opened=!document.getElementById('mobile-actions-menu').hidden;
    closeSheets(true);
    if(!opened){
      document.getElementById('mobile-actions-menu').hidden=false;
      document.getElementById('mobile-actions-button').setAttribute('aria-expanded','true');
    }
  };
  window.mobileToggleCountry=()=>{if(panelOpen)closeCountry();else window.mobileSection('country');};
  togglePanel=window.mobileToggleCountry;
  const close=document.createElement('div');
  close.className='mobile-country-close';
  close.innerHTML='<span>Моя страна</span><button class="sheet-close" aria-label="Закрыть" onclick="mobileCloseCountry()">✕</button>';
  panel.prepend(close);
  const decorate=(name,nav)=>{
    const original=window[name];
    if(typeof original!=='function')return;
    window[name]=function(...args){
      closeSheets(true);mark(nav);document.body.classList.add('mobile-sheet-open');
      const result=original.apply(this,args);
      const target={selectCountry:'diplo-pop',openEconomyPanel:'economy-panel',openActionsPanel:'actions-panel',openHistoryPanel:'history-panel',openSocietyScreen:'society-screen'}[name];
      if(target)focusPanel(target);
      return result;
    };
  };
  [['openCountryRelations','diplo'],['selectCountry','diplo'],['openDiploPanel','diplo'],
   ['openEconomyPanel','more'],['openActionsPanel','actions'],['openHistoryPanel','more'],
   ['openSocietyScreen','more']].forEach(([name,nav])=>decorate(name,nav));
  document.querySelectorAll('.xbtn').forEach(el=>{
    el.role='button';el.tabIndex=0;el.setAttribute('aria-label','Закрыть');
    el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}});
  });

  window.mobileDismissCard=closeCountry;
  let inspectedCountry=null;
  function renderForeignCountry(name) {
    const c=countries[name];
    if(!c)return;
    document.getElementById('mobile-card-name').textContent=c.displayName||name;
    const flag=document.getElementById('mobile-card-flag');
    const source=c.flagUrl||mobileFlagSource(name,year);
    flag.hidden=!source;flag.alt='Флаг: '+(c.displayName||name);
    if(source)flag.src=source;
    flag.onerror=()=>flag.hidden=true;
    const detail=document.getElementById('mobile-card-details');
    detail.replaceChildren();
    function portrait(source,label,role){
      const block=document.createElement('div');block.className='mobile-person-portrait';
      const img=document.createElement('img');img.alt=label;img.hidden=!source;
      const placeholder=document.createElement('div');placeholder.className='mobile-portrait-placeholder';
      placeholder.textContent=role==='pm'?'🎩':'👑';placeholder.hidden=!!source;
      if(source)img.src=source;
      img.onerror=()=>{img.hidden=true;placeholder.hidden=false;};
      const button=document.createElement('button');button.className='mobile-portrait-generate';
      button.textContent=portraitGenerating?'Генерация…':'Сгенерировать портрет';
      button.disabled=portraitGenerating;
      button.onclick=async()=>{
        if(portraitGenerating)return;
        button.disabled=true;button.textContent='Генерация…';
        try {await generatePersonPortrait(name,role);}
        catch {showNotif('Не удалось создать портрет. Попробуйте ещё раз.');}
        finally {
          if(inspectedCountry===name&&!document.getElementById('mobile-country-card').hidden)renderForeignCountry(name);
        }
      };
      block.append(img,placeholder,button);detail.append(block);
    }
    function row(label,value){
      const block=document.createElement('div');block.className='mobile-country-fact';
      const title=document.createElement('small');title.textContent=label;
      const text=document.createElement('strong');text.textContent=value||'—';
      block.append(title,text);detail.append(block);
    }
    row('Форма правления',c.government);
    portrait(c.portrait,'Правитель','ruler');
    row(c.rulerTitle||'Правитель',c.ruler);
    portrait(c.pmPortrait,'Глава правительства','pm');
    row(c.pmTitle||'Глава правительства',c.pm);
    const rel=worldState.relations[name]||0;
    row('Отношения',(rel>0?'+':'')+rel+(worldState.atWarWith.includes(name)?' · Война':worldState.alliedWith.includes(name)?' · Союз':''));
    row('ВВП',typeof c.gdp==='number'?new Intl.NumberFormat('ru',{maximumFractionDigits:1}).format(c.gdp/1000)+' млрд':c.gdp);
    row('Население',c.pop);
    document.getElementById('mobile-card-primary').onclick=()=>selectCountry(name);
  }
  window.mobileCountryCard=name=>{
    if(name===playerCountry){mobileSection('country');return;}
    if(!countries[name])return;
    closeSheets(true);closeCountry();
    inspectedCountry=name;renderForeignCountry(name);focusPanel('mobile-country-card');
    const card=document.getElementById('mobile-country-card');
    card.style.display='block';card.hidden=false;
    document.body.classList.add('mobile-country-open');
  };
  // Every map/details entry opens the same cabinet, without a second large screen.
  openCountryRelations=window.mobileCountryCard;
  window.mobileBackFromDiplomacy=()=>{
    document.getElementById('diplo-pop').style.display='none';
    const target=selectedCountry||inspectedCountry;
    if(target&&countries[target])window.mobileCountryCard(target);
    else closeSheets();
  };
  backToCountries=window.mobileBackFromDiplomacy;
  openDiploPanel=()=>showNotif('Откройте страну на карте и нажмите «Дипломатия».');
  const originalSelectCountry=selectCountry;
  selectCountry=function(name){
    inspectedCountry=name;
    const result=originalSelectCountry(name);
    document.getElementById('diplo-countries').style.display='none';
    return result;
  };
  const pauseOpen=openPauseMenu;
  openPauseMenu=function(){closeSheets();pauseOpen();};
  document.addEventListener('click',()=>{
    queueMicrotask(()=>{
      const visible=sheets.some(id=>{
        const el=document.getElementById(id);
        return id!=='mobile-country-card'&&id!=='left-panel'&&!el.hidden&&!el.classList.contains('hidden')&&
          (el.style.display==='block'||el.style.display==='flex');
      })||document.getElementById('society-screen').style.display==='flex'||
         document.getElementById('settings-panel').style.display==='flex';
      document.body.classList.toggle('mobile-sheet-open',visible);
    });
  });

  // Laptop panels can coexist, be brought to the front and be moved by their header.
  workingPanels.forEach(id=>{
    const el=document.getElementById(id);
    el.addEventListener('pointerdown',()=>focusPanel(id));
    if(id==='left-panel'||id==='mobile-country-card')return;
    const header=el.querySelector('.actions-hdr,.pop-hdr,.changes-hdr');
    if(!header)return;
    let drag=null;
    header.addEventListener('pointerdown',e=>{
      if(!isLaptop()||e.pointerType!=='mouse'||e.button!==0||e.target.closest('button,.xbtn,input'))return;
      const rect=el.getBoundingClientRect();
      drag={x:e.clientX,y:e.clientY,left:rect.left,top:rect.top};
      header.setPointerCapture(e.pointerId);e.preventDefault();
    });
    header.addEventListener('pointermove',e=>{
      if(!drag)return;
      const rect=el.getBoundingClientRect();
      el.style.setProperty('--desktop-left',Math.max(0,Math.min(window.innerWidth-rect.width,drag.left+e.clientX-drag.x))+'px');
      el.style.setProperty('--desktop-top',Math.max(78,Math.min(window.innerHeight-80,drag.top+e.clientY-drag.y))+'px');
    });
    ['pointerup','pointercancel','lostpointercapture'].forEach(type=>header.addEventListener(type,()=>drag=null));
  });
  const picker=document.getElementById('mobile-country-picker');
  const start=document.getElementById('mobile-start-btn');
  let signature='';
  function refreshCountries() {
    if(!activeScenario)return;
    const names=[...new Set(scenarioProvinces.map(p=>p.owner).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
    const next=activeScenarioRef+'|'+names.join('|');
    if(next===signature)return;signature=next;
    picker.replaceChildren(new Option('Выберите страну',''),...names.map(name=>new Option(name,name)));
    start.disabled=true;
    document.getElementById('menu-hint').textContent=activeScenario.name;
  }
  picker.addEventListener('change',()=>start.disabled=!picker.value);
  window.mobileStartGame=()=>{
    if(!picker.value)return;
    newGame(picker.value);closeSheets();mark('map');updateHud();
  };
  const oldStart=startGame;
  startGame=function(){oldStart();closeSheets();mark('map');updateHud();};
  function updateHud() {
    document.getElementById('mobile-country-name').textContent=
      typeof playerCountryDisplayName==='undefined'?'Страна':playerCountryDisplayName;
    if(typeof playerCountry!=='undefined'){
      const c=countries[playerCountry]||{};
      const flag=document.getElementById('mobile-flag-button');
      const img=document.getElementById('mobile-flag-image');
      const fallback=document.getElementById('mobile-flag-fallback');
      flag.title='Моя страна: '+playerCountryDisplayName;
      const source=c.flagUrl||mobileFlagSource(playerCountry,year);
      if(source){
        if(img.getAttribute('src')!==source)img.setAttribute('src',source);
        img.hidden=false;fallback.hidden=true;
      }else{
        img.hidden=true;fallback.hidden=false;
        fallback.textContent=String(playerCountryDisplayName||playerCountry).slice(0,2).toUpperCase();
      }
      const compact=new Intl.NumberFormat('ru',{notation:'compact',maximumFractionDigits:1});
      const statValues={army:c.army,stab:c.stability,debt:c.debt,infl:c.inflation};
      for(const [id,value] of Object.entries(statValues)){
        const el=document.getElementById(id);
        el.title=id==='infl'?String(value||0)+'%':new Intl.NumberFormat('ru').format(value||0);
        if(!isLaptop()&&typeof value==='number'){
          el.textContent=id==='infl'?new Intl.NumberFormat('ru',{maximumFractionDigits:1}).format(value)+'%':
            id==='debt'&&value<=0?'—':compact.format(value);
        }
      }
      if(!isLaptop()){
        document.getElementById('treasury').textContent=compact.format(c.treasury||0);
        document.getElementById('income').textContent=(c.income>0?'+':'')+compact.format(c.income||0);
      }
      document.getElementById('treasury').title=new Intl.NumberFormat('ru').format(c.treasury||0)+' фр.';
      document.getElementById('income').title=new Intl.NumberFormat('ru').format(c.income||0)+' фр./мес.';
      const gdp=document.getElementById('mobile-gdp');
      // The economic engine stores GDP in millions of internal currency units.
      gdp.textContent=typeof c.gdp==='number'?
        new Intl.NumberFormat('ru',{maximumFractionDigits:1}).format(c.gdp/1000)+' млрд':
        (c.gdp||'—');
    }
  }
  document.getElementById('mobile-flag-image').addEventListener('error',()=>{
    document.getElementById('mobile-flag-image').hidden=true;
    document.getElementById('mobile-flag-fallback').hidden=false;
    document.getElementById('mobile-flag-fallback').textContent=String(playerCountryDisplayName||playerCountry).slice(0,2).toUpperCase();
  });
  const originalGeneratePortrait=generatePersonPortrait;
  generatePersonPortrait=async function(country,role){
    if(portraitGenerating)return null;
    try {return await originalGeneratePortrait(country,role);}
    finally {
      portraitGenerating=false;
      setPortraitLoading(false,role);
      if(inspectedCountry&&!document.getElementById('mobile-country-card').hidden)renderForeignCountry(inspectedCountry);
    }
  };
  const oldStats=renderPlayerStats;
  renderPlayerStats=function(...args){const result=oldStats(...args);updateHud();if(inspectedCountry&&!document.getElementById('mobile-country-card').hidden)renderForeignCountry(inspectedCountry);return result;};
  const oldTurnEnd=onTurnEnd;
  onTurnEnd=async function(...args){
    const result=await oldTurnEnd(...args);
    document.getElementById('events-box').style.display='block';
    document.getElementById('changes-box').style.display='none';
    document.getElementById('mobile-news-button').classList.add('has-news');
    return result;
  };
  function syncFullscreenButton(){
    const standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
    document.getElementById('mobile-fullscreen-button').hidden=!!(document.fullscreenElement||document.webkitFullscreenElement||standalone);
  }
  window.mobileFullscreen=async()=>{
    if(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true){syncFullscreenButton();return;}
    const root=document.documentElement;
    const request=root.requestFullscreen||root.webkitRequestFullscreen;
    if(!(document.fullscreenElement||document.webkitFullscreenElement)){
      if(!request){
        showNotif('Для полноэкранной игры: меню браузера → «На экран Домой». В Safari — «Поделиться» → «На экран Домой».');
        return;
      }
      try {await request.call(root);}
      catch {showNotif('Браузер не включил полный экран. Попробуйте ещё раз или добавьте игру на экран Домой.');return;}
    }
    syncFullscreenButton();
    try {await screen.orientation?.lock?.('landscape');} catch {}
  };
  document.addEventListener('fullscreenchange',syncFullscreenButton);
  document.addEventListener('webkitfullscreenchange',syncFullscreenButton);
  window.matchMedia('(display-mode: standalone)').addEventListener?.('change',syncFullscreenButton);
  syncFullscreenButton();
  refreshCountries();
  window.setInterval(()=>{if(document.body.classList.contains('menu-mode'))refreshCountries();},700);

  /* One camera owns pointer, mouse and wheel input in the mobile edition. */
  const map = document.getElementById('map-svg');
  const wrap = document.getElementById('map-wrap');
  const pointers = new Map();
  const world = {width:960,height:560};
  let baseline=null, moved=false, maxPointers=0, tapTarget=null;
  let suppressUntil=0, labelFrame=0, oldRect=null;
  map.setAttribute('preserveAspectRatio','none');

  function limits(rect) {
    const ratio=rect.width/rect.height;
    return {ratio,maxWidth:Math.min(world.width,world.height*ratio)};
  }
  function bounded(view,rect) {
    const {ratio,maxWidth}=limits(rect);
    const width=Math.max(12,Math.min(maxWidth,view.w));
    const height=width/ratio;
    return {x:((view.x+world.width/2)%world.width+world.width)%world.width-world.width/2,
      y:Math.max(0,Math.min(world.height-height,view.y)),w:width,h:height};
  }
  function render(view) {
    const rect=map.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    vb=bounded(view,rect);
    map.setAttribute('viewBox',[vb.x,vb.y,vb.w,vb.h].join(' '));
    // Keep input responsive even on maps with thousands of labels/objects.
    if(!labelFrame)labelFrame=requestAnimationFrame(()=>{
      labelFrame=0;updateLabels();
    });
  }
  function sample() {
    const p=[...pointers.values()];
    if(!p.length)return null;
    if(p.length===1)return {x:p[0].x,y:p[0].y,distance:0};
    return {x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2,
      distance:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)};
  }
  function rebase() {
    const origin=sample();
    baseline=origin?{origin,view:{...vb},rect:map.getBoundingClientRect()}:null;
  }
  function moveCamera(start,current) {
    const {origin,view,rect}=start;
    const factor=origin.distance>0&&current.distance>0?origin.distance/current.distance:1;
    const {maxWidth,ratio}=limits(rect);
    const width=Math.max(12,Math.min(maxWidth,view.w*factor));
    const height=width/ratio;
    const anchorX=view.x+(origin.x-rect.left)/rect.width*view.w;
    const anchorY=view.y+(origin.y-rect.top)/rect.height*view.h;
    return bounded({x:anchorX-(current.x-rect.left)/rect.width*width,
      y:anchorY-(current.y-rect.top)/rect.height*height,w:width,h:height},rect);
  }
  function zoomAt(factor,point) {
    const rect=map.getBoundingClientRect();
    render(moveCamera({origin:{...point,distance:1},view:{...vb},rect},
      {...point,distance:1/factor}));
    rebase();
  }
  function fitWorld() {
    const rect=map.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    const {ratio,maxWidth}=limits(rect);
    render({x:(world.width-maxWidth)/2,y:(world.height-maxWidth/ratio)/2,
      w:maxWidth,h:maxWidth/ratio});
    oldRect=rect;rebase();
  }
  function resizeCamera() {
    const rect=map.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    if(!oldRect){fitWorld();return;}
    if(Math.abs(rect.width-oldRect.width)<0.5&&Math.abs(rect.height-oldRect.height)<0.5)return;
    const zoom=limits(oldRect).maxWidth/vb.w;
    const width=limits(rect).maxWidth/zoom;
    const height=width/limits(rect).ratio;
    render({x:vb.x+vb.w/2-width/2,y:vb.y+vb.h/2-height/2,w:width,h:height});
    oldRect=rect;rebase();
  }
  map.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    e.preventDefault();
    dragging=false;
    if(!pointers.size){moved=false;maxPointers=0;tapTarget=e.target;}
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY});
    maxPointers=Math.max(maxPointers,pointers.size);
    if(pointers.size>1)moved=true;
    // Capture at gesture start, not partway through a drag.
    map.setPointerCapture(e.pointerId);
    rebase();
    document.getElementById('tooltip').style.display='none';
  },{passive:false});
  map.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;
    e.preventDefault();
    const old=pointers.get(e.pointerId);
    if(Math.hypot(e.clientX-old.startX,e.clientY-old.startY)>4)moved=true;
    pointers.set(e.pointerId,{...old,x:e.clientX,y:e.clientY});
    if(baseline&&moved){render(moveCamera(baseline,sample()));}
  },{passive:false});
  function finish(e) {
    if(!pointers.has(e.pointerId))return;
    // Implicit capture on an SVG province can be released when the root takes
    // capture. That event bubbles; it does not mean that the finger was lifted.
    if(e.type==='lostpointercapture'&&e.target!==map)return;
    const target=tapTarget;
    const tap=e.type==='pointerup'&&!moved&&maxPointers===1;
    pointers.delete(e.pointerId);
    suppressUntil=performance.now()+700;
    if(map.hasPointerCapture(e.pointerId))map.releasePointerCapture(e.pointerId);
    rebase();
    if(!pointers.size){
      dragging=false;tapTarget=null;
      if(tap){
        let hit=target;
        // Copies use the same rendered world; resolve a tap back to its real
        // province so all existing diplomacy/country handlers still work.
        if(!hit?.closest?.('.scenario-province,.map-obj')){
          const rect=map.getBoundingClientRect();
          const x=((vb.x+(e.clientX-rect.left)/rect.width*vb.w)%world.width+world.width)%world.width;
          const y=vb.y+(e.clientY-rect.top)/rect.height*vb.h;
          const point=map.createSVGPoint();point.x=x;point.y=y;
          hit=[...map.querySelectorAll('path.scenario-province')].find(path=>{
            try {const box=path.getBBox();return x>=box.x&&x<=box.x+box.width&&y>=box.y&&y<=box.y+box.height&&path.isPointInFill(point);}
            catch {return false;}
          })||target;
        }
        if(hit?.matches?.('path.scenario-province')&&typeof gameStarted!=='undefined'&&gameStarted){
          const p=hit.__data__;
          const owner=p&&provinceOwnerOf(p.id,p.owner);
          if(owner){window.mobileCountryCard(owner);return;}
        }
        if(hit?.isConnected)hit.dispatchEvent(new MouseEvent('click',{
          bubbles:true,cancelable:true,clientX:e.clientX,clientY:e.clientY,view:window
        }));
      }
    }
  }
  window.addEventListener('pointerup',finish);
  window.addEventListener('pointercancel',finish);
  map.addEventListener('lostpointercapture',finish);
  wrap.addEventListener('click',e=>{
    // The tap above is dispatched once to the original province. Browser
    // compatibility clicks must not select a country after a pan or pinch.
    if(e.isTrusted&&performance.now()<suppressUntil){
      e.preventDefault();e.stopImmediatePropagation();
    }
  },true);
  wrap.addEventListener('mousedown',e=>{
    if(map.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();dragging=false;}
  },true);
  wrap.addEventListener('wheel',e=>{
    if(!map.contains(e.target))return;
    e.preventDefault();e.stopImmediatePropagation();
    const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?map.clientHeight:1);
    zoomAt(Math.exp(Math.max(-0.5,Math.min(0.5,delta*0.002))),
      {x:e.clientX,y:e.clientY});
  },{capture:true,passive:false});
  window.mobileMapOverview=fitWorld;
  fitWorld();
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(resizeCamera).observe(map);
  window.addEventListener('resize',resizeCamera);

})();

/* Editor: touch drawing, box selection, navigation and explicit finish button. */
(() => {
  const canvas = document.getElementById('editor-svg');
  const wrap = document.getElementById('editor-canvas-wrap');
  const screen = document.getElementById('editor-screen');
  const pointers = new Map();
  let prev = null, target = null, moved = false, pinched = false;
  let strokeStart = 0, panMode = false, suppressUntil = 0;
  editorMouseCoords = e => {
    const matrix = canvas.getScreenCTM();
    if (!matrix) return [0,0];
    const p = new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());
    return [p.x,p.y];
  };
  function state() {
    const p = [...pointers.values()];
    if (!p.length) return null;
    if (p.length === 1) return {x:p[0].x,y:p[0].y,distance:0};
    return {x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2,
      distance:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)};
  }
  function mouse(type, e, node=canvas) {
    node.dispatchEvent(new MouseEvent(type, {
      bubbles:true,clientX:e.clientX,clientY:e.clientY,button:0,
      buttons:type==='mouseup'||type==='click'?0:1
    }));
  }
  // Browser-generated compatibility events would repeat taps and strokes.
  ['mousedown','mousemove','mouseup','click','dblclick'].forEach(type => {
    canvas.addEventListener(type, e => {
      if (e.isTrusted && ((e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) ||
          performance.now()<suppressUntil)) {
        e.preventDefault(); e.stopImmediatePropagation();
      }
    },true);
  });
  function navigate(a,b) {
    const p = editorMouseCoords({clientX:a.x,clientY:a.y});
    const q = editorMouseCoords({clientX:b.x,clientY:b.y});
    edVb.x += p[0]-q[0]; edVb.y += p[1]-q[1];
    if (a.distance && b.distance) {
      applyEditorViewBox();
      const center=editorMouseCoords({clientX:b.x,clientY:b.y});
      const width=Math.max(25,Math.min(1800,edVb.w*a.distance/b.distance));
      const ratio=width/edVb.w;
      edVb.x=center[0]-(center[0]-edVb.x)*ratio;
      edVb.y=center[1]-(center[1]-edVb.y)*ratio;
      edVb.w=width;edVb.h*=ratio;
    }
    applyEditorViewBox();
  }
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType==='mouse') return;
    e.preventDefault();
    suppressUntil=performance.now()+800;
    if (!pointers.size) {
      target=e.target;moved=false;pinched=false;
      strokeStart=editorPoints.length;
      edDidPan=false;
    }
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY});
    canvas.setPointerCapture(e.pointerId);
    if (pointers.size===1 && !panMode && (selectionMode || (editorDrawing && drawMode==='pencil'))) mouse('mousedown',e);
    if (pointers.size>1) {
      pinched=true;moved=true;
      pencilActive=false;edBoxSelecting=false;edBoxStart=null;edPanning=false;
      document.getElementById('editor-selbox').style.display='none';
      if (editorDrawing && drawMode==='pencil' && editorPoints.length>strokeStart) {
        editorPoints.length=strokeStart;
        document.getElementById('editor-point-count').textContent=editorPoints.length;
        updateDrawPreview();
      }
    }
    prev=state();
  });
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    const old=pointers.get(e.pointerId);
    if (Math.hypot(e.clientX-old.startX,e.clientY-old.startY)>8) moved=true;
    pointers.set(e.pointerId,{...old,x:e.clientX,y:e.clientY});
    const next=state();
    suppressUntil=performance.now()+800;
    if (pointers.size>1 || panMode || (!editorDrawing && !selectionMode)) {
      if (prev && moved) navigate(prev,next);
    } else if (!pinched && moved) mouse('mousemove',e);
    prev=next;
  });
  function end(e) {
    if (!pointers.has(e.pointerId)) return;
    if (e.type==='lostpointercapture' && e.target!==canvas) return;
    const cancelled=e.type==='pointercancel'||e.type==='lostpointercapture';
    if (pointers.size===1) {
      if (!pinched && !panMode && !cancelled) {
        mouse('mouseup',e,window);
        if (!moved && target && target.isConnected) mouse('click',e,target);
      }
      pencilActive=false;edBoxSelecting=false;edBoxStart=null;edPanning=false;
      document.getElementById('editor-selbox').style.display='none';
      if (moved) buildSnapIndex();
    }
    pointers.delete(e.pointerId);
    prev=state();
    suppressUntil=performance.now()+800;
  }
  window.addEventListener('pointerup',end);
  window.addEventListener('pointercancel',end);
  canvas.addEventListener('lostpointercapture',end);
  const tools=document.createElement('div');
  tools.id='mobile-editor-tools';
  function button(label,title,action) {
    const el=document.createElement('button');
    el.type='button';el.textContent=label;el.setAttribute('aria-label',title);
    el.addEventListener('click',()=>action(el));tools.append(el);return el;
  }
  button('Панель','Показать или скрыть инструменты редактора',()=>{
    screen.classList.toggle('mobile-editor-map-only');
  });
  button('✋','Переключить перемещение карты одним пальцем',el=>{
    panMode=!panMode;el.setAttribute('aria-pressed',String(panMode));
    el.style.background=panMode?'#d8b66a':'';
  }).setAttribute('aria-pressed','false');
  button('Готово','Завершить рисование провинции',()=>{
    if (editorDrawing) finishDrawingProvince();
    else showNotif('Сначала начните рисовать новую провинцию');
  });
  wrap.append(tools);
  document.querySelectorAll('#editor-screen .editor-hint').forEach(el=>{
    el.textContent=el.textContent
      .replace(/клики?|кликайте/gi,'касания')
      .replace(/вести мышь/g,'вести палец')
      .replace(/протянуть мышью/g,'протянуть пальцем')
      .replace(/зажать/g,'коснуться');
  });
})();

(() => {
  function updateViewport() {
    document.documentElement.style.setProperty('--mobile-height',
      (window.visualViewport ? window.visualViewport.height : window.innerHeight) + 'px');
  }
  updateViewport();
  window.addEventListener('resize', updateViewport);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', updateViewport);
})();
