
/* Three authored visual treatments over the same game and the same geography. */
(() => {
 'use strict';
 const themes={atlas:{cartouche:'АТЛАС ДЕРЖАВ',light:.87,saturation:.20}};
 let theme='atlas';
 let physical=null,edgesFor=null,edges=[],ownership='',initialized=false,frame=0;
 const root=document.documentElement,ns='http://www.w3.org/2000/svg';
 function node(tag,attrs,parent){const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs||{}))n.setAttribute(k,v);if(parent)parent.append(n);return n;}
 function palette(key){return getComputedStyle(root).getPropertyValue(key).trim();}
 const oldFill=politicalFill;
 politicalFill=function(color){
  try{const c=d3.hsl(color),t=themes[theme];c.s=Math.min(.48,Math.max(.16,c.s*.65+t.saturation*.2));c.l=t.light+(c.l-.5)*.05;return c.formatHex();}
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
  if(!g.querySelector('#atlas-tinted-borders'))node('g',{id:'atlas-tinted-borders'},g);
  if(!g.querySelector('#vl-inner-borders'))node('path',{id:'vl-inner-borders',fill:'none','vector-effect':'non-scaling-stroke'},g);
  if(!g.querySelector('#vl-country-borders'))node('path',{id:'vl-country-borders',fill:'none','vector-effect':'non-scaling-stroke'},g);
  if(!g.querySelector('#vl-coast'))node('path',{id:'vl-coast',fill:'none','vector-effect':'non-scaling-stroke'},g);
  let paper=document.getElementById('vl-map-paper');
  if(!paper){paper=node('rect',{id:'vl-map-paper',width:960,height:560,fill:'url(#vl-paper-lines)','pointer-events':'none'},null);world.insertBefore(paper,document.getElementById('world-g'));}
  document.querySelectorAll('#world-g image').forEach(n=>n.style.display='none');
 }

 function paintTintedEdges(){
  const grouped=new Map(),owners=new Map(scenarioProvinces.map(p=>[p.id,provinceOwnerOf(p.id,p.owner)]));
  for(const e of edges){const a=owners.get(e.provinces[0]),b=owners.get(e.provinces[1]);if(a===b&&e.provinces.length>1)continue;
   for(const owner of [a,b])if(owner){if(!grouped.has(owner))grouped.set(owner,[]);grouped.get(owner).push(e);}
  }
  d3.select('#atlas-tinted-borders').selectAll('path').data([...grouped]).join('path').attr('d',d=>borderGeometry(d[1])).attr('fill','none').attr('stroke',d=>{const c=d3.hsl(displayColorFor(d[0]));c.s=Math.min(.40,c.s*.65);c.l=.55;return c.formatHex();}).attr('stroke-width',3.4).attr('stroke-opacity',.48).attr('vector-effect','non-scaling-stroke');
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
  edges=[...indexed.values()];paintPhysical();paintTintedEdges();window.AtlasView.edgeCount=edges.length;
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
   document.getElementById('vl-coast').setAttribute('d',borderGeometry(coast));paintTintedEdges();
   window.AtlasView.borderCounts={outer:outer.length,inner:inner.length,coast:coast.length};
  }
  paintMap();
 }
 function paintPhysical(){
  if(!physical||!initialized)return;
  for(const[k,cls]of [['mountains','vl-mountain-region'],['rivers','vl-river']]){
   const g=document.getElementById('vl-'+k);if(!g)continue;
   d3.select(g).selectAll('path').data(k==='mountains'?[physical[k]]:physical[k].features).join('path').attr('class',cls).attr('d',pathGen).attr('pointer-events','none').attr('vector-effect','non-scaling-stroke');
  }
  window.AtlasView.physicalCount={mountains:physical.mountains.features.length,rivers:physical.rivers.features.length};
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
  if(coast){coast.setAttribute('stroke',palette('--vl-coast'));coast.setAttribute('stroke-width',.6);}
  if(country){country.setAttribute('stroke',palette('--vl-border'));country.setAttribute('stroke-width',.7);}
  if(inner){inner.setAttribute('stroke',palette('--vl-inner'));inner.setAttribute('stroke-width',Math.min(.8,innerBorderWidth*scale));inner.style.opacity=innerBorderWidth===0?'0':String(Math.min(.35,Math.max(.07,scale/14)));}
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
 function ready(){
  if(window.GS_MAP_LOAD?.status!=='ready')return;
  if(!initialized){initialized=true;proj.precision(.08);for(const p of scenarioProvinces)labelGeometryCache.delete(p.geometry);countryLabelOwnersSignature='';_provincesBuiltFor=null;createLayers();renderScenarioProvinces();}
  else{edgesFor=null;renderScenarioProvinces();}
  refreshBorders();window.AtlasView.ready=true;
 }
 root.dataset.atlas='189';
 window.AtlasView={ready:false,refresh:refreshBorders,physicalCount:null};
 
 window.addEventListener('gs:scenario-status',ready);
 ready();
 fetch('atlas-physical.json').then(r=>{if(!r.ok)throw Error('Physical geography unavailable');return r.json();}).then(data=>{physical=data;paintPhysical();}).catch(()=>{window.AtlasView.physicalUnavailable=true;});
})();