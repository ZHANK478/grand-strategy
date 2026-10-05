
/* Three authored visual treatments over the same game and the same geography. */
(() => {
 'use strict';
 const themes={
  atlas:{name:'Исторический атлас',short:'Атлас',caption:'Бумага, чернила, гравированная карта',cartouche:'АТЛАС ДЕРЖАВ',light:.81,saturation:.26},
  political:{name:'Политическая карта',short:'Политическая',caption:'Чёткие территории и спокойный интерфейс',cartouche:'ПОЛИТИЧЕСКИЙ ОБЗОР',light:.73,saturation:.34},
  cabinet:{name:'Кабинет правителя',short:'Кабинет',caption:'Зелёное сукно, тёмные чернила, светлые документы',cartouche:'КАРТА КАБИНЕТА',light:.70,saturation:.27}
 };
 const query=new URL(location.href),stored=localStorage.getItem('gs_visual_lab_theme');
 let theme=themes[query.searchParams.get('theme')]?query.searchParams.get('theme'):themes[stored]?stored:'atlas';
 let physical=null,edgesFor=null,edges=[],ownership='',initialized=false,frame=0;
 const root=document.documentElement,ns='http://www.w3.org/2000/svg';
 function node(tag,attrs,parent){const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs||{}))n.setAttribute(k,v);if(parent)parent.append(n);return n;}
 function palette(key){return getComputedStyle(root).getPropertyValue(key).trim();}
 function updateSwitch(){
  document.querySelectorAll('[data-vl-theme]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.vlTheme===theme));b.classList.toggle('is-active',b.dataset.vlTheme===theme);});
  const select=document.getElementById('vl-theme-select');if(select)select.value=theme;
  const cart=document.getElementById('vl-cartouche-title');if(cart)cart.textContent=themes[theme].cartouche;
  const caption=document.getElementById('vl-caption');if(caption)caption.textContent=themes[theme].caption;
 }
 function setTheme(value){
  if(!themes[value])return;
  theme=value;root.dataset.visualTheme=theme;localStorage.setItem('gs_visual_lab_theme',theme);
  const url=new URL(location.href);url.searchParams.set('theme',theme);history.replaceState(null,'',url);
  updateSwitch();if(initialized){recolorProvinces();paintMap();}window.dispatchEvent(new CustomEvent('gs:visual-theme',{detail:{theme}}));
 }
 function toolbar(){
  const bar=document.createElement('aside');bar.id='visual-lab-switch';bar.setAttribute('aria-label','Оформление игры');
  const label=document.createElement('span');label.className='vl-switch-label';label.textContent='Оформление';bar.append(label);
  const group=document.createElement('div');group.className='vl-theme-buttons';group.setAttribute('role','group');group.setAttribute('aria-label','Выберите визуальный стиль');
  for(const[id,t]of Object.entries(themes)){const b=document.createElement('button');b.type='button';b.textContent=t.short;b.dataset.vlTheme=id;b.title=t.name+' · '+t.caption;b.addEventListener('click',()=>setTheme(id));group.append(b);}
  bar.append(group);
  const select=document.createElement('select');select.id='vl-theme-select';select.setAttribute('aria-label','Визуальный стиль');
  for(const[id,t]of Object.entries(themes)){const o=document.createElement('option');o.value=id;o.textContent=t.name;select.append(o);}select.addEventListener('change',()=>setTheme(select.value));bar.append(select);
  const info=document.createElement('button');info.id='vl-info-button';info.type='button';info.textContent='i';info.setAttribute('aria-label','Об оформлении');info.setAttribute('aria-expanded','false');
  const pop=document.createElement('div');pop.id='vl-style-info';pop.hidden=true;
  const title=document.createElement('strong');title.textContent='Три взгляда на одну игру';
  const p=document.createElement('p');p.id='vl-caption';
  const sources=document.createElement('a');sources.href='visual-gallery.html';sources.textContent='Сравнить экраны и посмотреть источники';
  pop.append(title,p,sources);info.addEventListener('click',()=>{pop.hidden=!pop.hidden;info.setAttribute('aria-expanded',String(!pop.hidden));});bar.append(info,pop);document.body.append(bar);
  const cart=document.createElement('div');cart.id='vl-cartouche';cart.setAttribute('aria-hidden','true');
  cart.innerHTML='<strong id="vl-cartouche-title"></strong><span>Grand Strategy</span><small>Государства и владения</small><svg viewBox="0 0 60 60" width="36" height="36" aria-hidden="true"><circle cx="30" cy="30" r="21" fill="none" stroke="currentColor" stroke-width=".5"/><path d="M30 3L34 26L57 30L34 34L30 57L26 34L3 30L26 26Z" fill="none" stroke="currentColor" stroke-width=".8"/><path d="M30 3L30 30L34 26Z M3 30L30 30L26 34Z M30 57L30 30L34 34Z M57 30L30 30L34 26Z" fill="currentColor"/><text x="30" y="2" text-anchor="middle" font-size="5">С</text></svg>';
  document.getElementById('map-wrap').append(cart);updateSwitch();
 }
 const oldFill=politicalFill;
 politicalFill=function(color){
  try{const c=d3.hsl(color),t=themes[theme];c.s=Math.min(.48,Math.max(.16,c.s*.65+t.saturation*.2));c.l=t.light+(c.l-.5)*.13;return c.formatHex();}
  catch{return oldFill(color);}
 };
 function createLayers(){
  const world=document.getElementById('mobile-world-content');
  let defs=document.querySelector('#map-svg defs');if(!defs)defs=node('defs',{},document.getElementById('map-svg'));
  if(!document.getElementById('vl-relief-hatch')){
   const p=node('pattern',{id:'vl-relief-hatch',patternUnits:'userSpaceOnUse',width:3,height:3},defs);
   node('path',{d:'M-1 1 L1 -1 M0 3 L3 0 M2 4 L4 2',fill:'none',stroke:'#5b5445','stroke-width':.25},p);
  }
  if(!document.getElementById('vl-paper-lines')){
   const p=node('pattern',{id:'vl-paper-lines',patternUnits:'userSpaceOnUse',width:3.2,height:3.2},defs);
   node('path',{d:'M0 0h3.2 M0 1.7h3.2',stroke:'#716047','stroke-width':.018,opacity:.2},p);
  }
  let g=document.getElementById('visual-cartography-g');if(!g){g=node('g',{id:'visual-cartography-g','pointer-events':'none'},null);world.insertBefore(g,document.getElementById('labels-g'));}
  if(!g.querySelector('#vl-mountains'))node('g',{id:'vl-mountains'},g);
  if(!g.querySelector('#vl-rivers'))node('g',{id:'vl-rivers'},g);
  if(!g.querySelector('#vl-inner-borders'))node('path',{id:'vl-inner-borders',fill:'none','vector-effect':'non-scaling-stroke'},g);
  if(!g.querySelector('#vl-country-borders'))node('path',{id:'vl-country-borders',fill:'none','vector-effect':'non-scaling-stroke'},g);
  if(!g.querySelector('#vl-coast'))node('path',{id:'vl-coast',fill:'none','vector-effect':'non-scaling-stroke'},g);
  let paper=document.getElementById('vl-map-paper');
  if(!paper){paper=node('rect',{id:'vl-map-paper',width:960,height:560,fill:'url(#vl-paper-lines)','pointer-events':'none'},null);world.insertBefore(paper,document.getElementById('world-g'));}
  document.querySelectorAll('#world-g image').forEach(n=>n.style.display='none');
 }
 function buildEdges(){
  if(edgesFor===scenarioProvinces)return;
  edgesFor=scenarioProvinces;ownership='';
  const indexed=new Map();
  for(const p of scenarioProvinces){
   const polygons=p.geometry.type==='Polygon'?[p.geometry.coordinates]:p.geometry.type==='MultiPolygon'?p.geometry.coordinates:[];
   for(const polygon of polygons)for(const ring of polygon)for(let i=1;i<ring.length;i++){
    const a=ring[i-1],b=ring[i],ka=a.join(','),kb=b.join(','),key=ka<kb?ka+'|'+kb:kb+'|'+ka;
    let edge=indexed.get(key);if(!edge){edge={points:[a,b],provinces:[]};indexed.set(key,edge);}
    if(!edge.provinces.includes(p.id))edge.provinces.push(p.id);
   }
  }
  edges=[...indexed.values()];paintPhysical();window.VisualLab.edgeCount=edges.length;
 }
 function borderGeometry(rows){return pathGen({type:'MultiLineString',coordinates:rows.map(e=>e.points)})||'';}
 function refreshBorders(){
  if(!initialized||!scenarioProvinces.length)return;
  createLayers();buildEdges();
  const owners=new Map(scenarioProvinces.map(p=>[p.id,provinceOwnerOf(p.id,p.owner)])),signature=JSON.stringify([...owners]);
  if(signature!==ownership){
   ownership=signature;
   const outer=[],inner=[],coast=[];
   for(const e of edges){
    if(e.provinces.length===1)coast.push(e);
    else if(owners.get(e.provinces[0])!==owners.get(e.provinces[1]))outer.push(e);
    else inner.push(e);
   }
   document.getElementById('vl-country-borders').setAttribute('d',borderGeometry(outer));
   document.getElementById('vl-inner-borders').setAttribute('d',borderGeometry(inner));
   document.getElementById('vl-coast').setAttribute('d',borderGeometry(coast));
   window.VisualLab.borderCounts={outer:outer.length,inner:inner.length,coast:coast.length};
  }
  paintMap();
 }
 function paintPhysical(){
  if(!physical||!initialized)return;
  for(const[k,cls]of [['mountains','vl-mountain-region'],['rivers','vl-river']]){
   const g=document.getElementById('vl-'+k);if(!g)continue;
   d3.select(g).selectAll('path').data(physical[k].features).join('path').attr('class',cls).attr('d',pathGen).attr('pointer-events','none').attr('vector-effect','non-scaling-stroke');
  }
  window.VisualLab.physicalCount={mountains:physical.mountains.features.length,rivers:physical.rivers.features.length};
 }
 function declutterLabels(){
  const scale=svgEl.getBoundingClientRect().width/Math.max(1,vb.w),placed=[];
  const labels=[...document.querySelectorAll('#labels-g .country-label')].map(el=>{const box=el.getBBox();return {el,box,font:Number(el.getAttribute('font-size'))*scale,area:Number(el.getAttribute('data-region-width'))*Number(el.getAttribute('data-region-height'))};}).sort((a,b)=>b.area-a.area);
  const gap=2.5/Math.max(.1,scale);
  for(const entry of labels){const {el,box,font}=entry;
   const onScreen=box.x+box.width>vb.x&&box.x<vb.x+vb.w&&box.y+box.height>vb.y&&box.y<vb.y+vb.h;
   const collision=placed.some(b=>box.x<b.x+b.width+gap&&box.x+box.width+gap>b.x&&box.y<b.y+b.height+gap&&box.y+box.height+gap>b.y);
   const visible=font>=7&&!collision;
   el.style.visibility=visible?'visible':'hidden';if(visible&&onScreen)placed.push(box);
  }
 }
 function paintMap(){
  if(!initialized)return;
  const bounds=svgEl.getBoundingClientRect(),scale=bounds.width/Math.max(1,vb.w);
  const coast=document.getElementById('vl-coast'),country=document.getElementById('vl-country-borders'),inner=document.getElementById('vl-inner-borders');
  if(coast){coast.setAttribute('stroke',palette('--vl-coast'));coast.setAttribute('stroke-width',theme==='political'?.75:.6);}
  if(country){country.setAttribute('stroke',palette('--vl-border'));country.setAttribute('stroke-width',theme==='political'?1.25:.9);}
  if(inner){inner.setAttribute('stroke',palette('--vl-inner'));inner.setAttribute('stroke-width',Math.min(.8,innerBorderWidth*scale));inner.style.opacity=innerBorderWidth===0?'0':String(Math.min(.55,Math.max(.1,scale/10)));}
  const hatch=document.getElementById('vl-relief-hatch');if(hatch){const size=4/Math.max(.5,scale);hatch.setAttribute('width',size);hatch.setAttribute('height',size);hatch.firstElementChild.setAttribute('transform','scale('+size/3+')');}
  document.querySelectorAll('#labels-g text').forEach(t=>{t.style.fill=palette('--vl-map-label');t.style.stroke=palette('--vl-map-halo');});
  declutterLabels();
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;refreshBorders();});}
 const oldRecolor=recolorProvinces;
 recolorProvinces=function(...args){const result=oldRecolor(...args);schedule();return result;};
 const oldCountryFont=countryLabelFontSize;
 countryLabelFontSize=function(multiplier,width,height,units,zoom,scale,rows=1){
  const screenWidth=svgEl.getBoundingClientRect().width||960;
  const target=screenWidth<1000?10.5:12;
  return oldCountryFont(multiplier,width,height,units,zoom,scale*target*960/(6.5*screenWidth),rows);
 };
 const oldLabels=updateLabels;
 updateLabels=function(...args){const result=oldLabels(...args);if(initialized)paintMap();return result;};
 const oldBorder=setInnerBorderWidth;
 setInnerBorderWidth=function(...args){const result=oldBorder(...args);schedule();return result;};
 function cleanControlMarks(){
  const selector='.mobile-action-grid button,.cbtn,.abtn,.load-close-btn,.map-mode-btn,.pause-box button,.mobile-start button,.settings-box h3,.govbadge,.actions-hdr>span:first-child,.changes-hdr>span:first-child';
  for(const el of document.querySelectorAll(selector)){
   for(const child of [...el.childNodes])if(child.nodeType===Node.TEXT_NODE){
    const value=child.nodeValue.replace(/^[\s\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]+/u,'');
    if(value&&value!==child.nodeValue)child.nodeValue=value;
   }
  }
  for(const el of document.querySelectorAll('.mobile-portrait-placeholder,#pm-portrait-emoji')){
   const text=el.textContent.trim();
   if(/^[\p{Extended_Pictographic}\s\uFE0F]+$/u.test(text)){el.textContent='';el.classList.add('vl-unpainted-portrait');el.setAttribute('aria-label','Портрет пока не добавлен');}
  }
 }
 function ready(){
  if(window.GS_MAP_LOAD?.status!=='ready')return;
  if(!initialized){initialized=true;proj.precision(.08);for(const p of scenarioProvinces)labelGeometryCache.delete(p.geometry);countryLabelOwnersSignature='';_provincesBuiltFor=null;createLayers();renderScenarioProvinces();}
  else{edgesFor=null;renderScenarioProvinces();}
  refreshBorders();cleanControlMarks();window.VisualLab.ready=true;
 }
 root.dataset.visualTheme=theme;
 window.VisualLab={themes,setTheme,ready:false,refresh:refreshBorders,physicalCount:null};
 toolbar();
 window.addEventListener('gs:scenario-status',ready);
 ready();
 fetch('visual-physical.json').then(r=>{if(!r.ok)throw Error('Physical geography unavailable');return r.json();}).then(data=>{physical=data;paintPhysical();}).catch(()=>{window.VisualLab.physicalUnavailable=true;});
 const mutation=new MutationObserver(()=>{if(!window.__vlTextFrame)window.__vlTextFrame=requestAnimationFrame(()=>{window.__vlTextFrame=0;cleanControlMarks();});});
 mutation.observe(document.body,{childList:true,subtree:true});
})();
