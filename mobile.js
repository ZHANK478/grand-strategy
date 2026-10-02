
/* Landscape navigation: one sheet at a time, with a persistent map. */
(() => {
  'use strict';
  const sheets=['left-panel','events-box','changes-box','actions-panel','adv-pop','diplo-pop','relations-panel','economy-panel','history-panel'];
  const panel=document.getElementById('left-panel');
  const more=document.getElementById('mobile-more');
  function closeSheets() {
    sheets.forEach(id=>document.getElementById(id).style.display='none');
    panel.classList.add('hidden');panelOpen=false;more.hidden=true;
    document.querySelectorAll('#mobile-nav button').forEach(b=>b.classList.remove('selected'));
  }
  function mark(name) {
    document.querySelector('#mobile-nav [data-section="'+name+'"]')?.classList.add('selected');
  }
  window.mobileSection=name=>{
    closeSheets();
    mark(['map','actions','diplo','news','more'].includes(name)?name:'more');
    switch(name) {
      case 'country':panel.classList.remove('hidden');panel.style.display='block';panelOpen=true;break;
      case 'actions':openActionsPanel();break;
      case 'diplo':openDiploPanel();break;
      case 'advisor':document.getElementById('adv-pop').style.display='block';break;
      case 'economy':openEconomyPanel();break;
      case 'society':openSocietyScreen();break;
      case 'history':openHistoryPanel();break;
      case 'news':document.getElementById('events-box').style.display='block';document.querySelector('[data-section="news"]').classList.remove('has-news');break;
      case 'changes':document.getElementById('changes-box').style.display='block';break;
      case 'more':more.hidden=false;break;
      case 'pause':openPauseMenu();break;
    }
  };
  togglePanel=()=>window.mobileSection(panelOpen?'map':'country');
  const close=document.createElement('div');
  close.className='mobile-country-close';
  close.innerHTML='<span>Досье страны</span><button class="sheet-close" aria-label="Закрыть" onclick="mobileSection(\'map\')">✕</button>';
  panel.prepend(close);
  const decorate=(name,nav)=>{
    const original=window[name];
    if(typeof original!=='function')return;
    window[name]=function(...args){closeSheets();mark(nav);return original.apply(this,args);};
  };
  [['openCountryRelations','diplo'],['selectCountry','diplo'],['openDiploPanel','diplo'],
   ['openEconomyPanel','more'],['openActionsPanel','actions'],['openHistoryPanel','more'],
   ['openSocietyScreen','more']].forEach(([name,nav])=>decorate(name,nav));
  document.querySelectorAll('.xbtn').forEach(el=>{
    el.role='button';el.tabIndex=0;el.setAttribute('aria-label','Закрыть');
    el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}});
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
  }
  const oldStats=renderPlayerStats;
  renderPlayerStats=function(...args){const result=oldStats(...args);updateHud();return result;};
  const oldTurnEnd=onTurnEnd;
  onTurnEnd=async function(...args){
    const result=await oldTurnEnd(...args);
    document.getElementById('events-box').style.display='none';
    document.getElementById('changes-box').style.display='none';
    document.querySelector('[data-section="news"]').classList.add('has-news');
    return result;
  };
  window.mobileFullscreen=async()=>{
    try {if(!document.fullscreenElement)await document.documentElement.requestFullscreen?.();} catch {}
    try {await screen.orientation?.lock?.('landscape');} catch {}
  };
  refreshCountries();
  window.setInterval(()=>{if(document.body.classList.contains('menu-mode'))refreshCountries();},700);
  const map = document.getElementById('map-svg');
  const wrap = document.getElementById('map-wrap');
  const points = new Map();
  let previous = null, moved = false, suppressUntil = 0, frame = 0;
  function screenPoint(p) {
    const matrix = map.getScreenCTM();
    return matrix ? new DOMPoint(p.x, p.y).matrixTransform(matrix.inverse()) : null;
  }
  function gesture() {
    const p = [...points.values()];
    if (!p.length) return null;
    return p.length === 1 ? { x:p[0].x, y:p[0].y, distance:0 } : {
      x:(p[0].x+p[1].x)/2, y:(p[0].y+p[1].y)/2,
      distance:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)
    };
  }
  function render() {
    map.setAttribute('viewBox', [vb.x,vb.y,vb.w,vb.h].join(' '));
    if (!frame) frame = requestAnimationFrame(() => {
      frame = 0;
      updateLabels();
    });
  }
  function scaleAt(factor, center) {
    const anchor = screenPoint(center);
    if (!anchor) return;
    const nextWidth = Math.max(25, Math.min(1800, vb.w * factor));
    const ratio = nextWidth / vb.w;
    vb.x = anchor.x - (anchor.x - vb.x) * ratio;
    vb.y = anchor.y - (anchor.y - vb.y) * ratio;
    vb.w = nextWidth;
    vb.h *= ratio;
  }
  map.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    if (!points.size) { moved = false; suppressUntil = 0; }
    points.set(e.pointerId, {x:e.clientX, y:e.clientY, startX:e.clientX, startY:e.clientY});
    previous = gesture();
    if (points.size > 1) moved = true;
    // Keep the original target for taps so existing country click handlers work.
    if (points.size > 1) map.setPointerCapture(e.pointerId);
  });
  map.addEventListener('pointermove', e => {
    if (!points.has(e.pointerId)) return;
    const old = points.get(e.pointerId);
    if (Math.hypot(e.clientX-old.startX,e.clientY-old.startY) > 8) moved = true;
    points.set(e.pointerId, {...old,x:e.clientX,y:e.clientY});
    const next = gesture();
    if (previous && moved) {
      const a = screenPoint(previous), b = screenPoint(next);
      if (a && b) { vb.x += a.x-b.x; vb.y += a.y-b.y; }
      if (previous.distance > 0 && next.distance > 0) {
        map.setAttribute('viewBox', [vb.x,vb.y,vb.w,vb.h].join(' '));
        scaleAt(previous.distance/next.distance, next);
      }
      render();
      document.getElementById('tooltip').style.display = 'none';
      suppressUntil = performance.now() + 500;
      if (!map.hasPointerCapture(e.pointerId)) map.setPointerCapture(e.pointerId);
    }
    previous = next;
  });
  function finish(e) {
    if (!points.has(e.pointerId)) return;
    points.delete(e.pointerId);
    if (moved) suppressUntil = performance.now() + 500;
    previous = gesture();
    if (!points.size) dragging = false;
  }
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
  map.addEventListener('lostpointercapture', finish);
  wrap.addEventListener('click', e => {
    if (performance.now() < suppressUntil) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  // Prevent synthetic mouse dragging after a touch gesture.
  wrap.addEventListener('mousedown', e => {
    if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) {
      e.preventDefault(); e.stopImmediatePropagation();
    }
  }, true);
  const zoom = document.createElement('div');
  zoom.id = 'mobile-zoom';
  const controls = [['+', 'Приблизить карту', 0.8], ['−', 'Отдалить карту', 1.25], ['⌂', 'Показать всю карту', null]];
  controls.forEach(([label, title, factor]) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label;
    button.setAttribute('aria-label', title); button.title = title;
    button.addEventListener('click', () => {
      if (factor === null) { vb = {x:0,y:0,w:960,h:560}; }
      else {
        const rect = map.getBoundingClientRect();
        scaleAt(factor, {x:rect.left+rect.width/2,y:rect.top+rect.height/2});
      }
      render();
    });
    zoom.append(button);
  });
  wrap.append(zoom);
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
  [0.8,1.25].forEach(factor=>button(factor<1?'+':'−',factor<1?'Приблизить карту редактора':'Отдалить карту редактора',()=>{
    const x=edVb.x+edVb.w/2,y=edVb.y+edVb.h/2;
    const width=Math.max(25,Math.min(1800,edVb.w*factor));
    const ratio=width/edVb.w;edVb.w=width;edVb.h*=ratio;
    edVb.x=x-edVb.w/2;edVb.y=y-edVb.h/2;
    applyEditorViewBox();buildSnapIndex();
  }));
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
