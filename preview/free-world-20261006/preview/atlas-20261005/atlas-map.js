// MAP.JS v6 — карта + объекты на карте (армии, штабы, передвижения)
const W = 960, H = 560;

const proj = d3.geoNaturalEarth1().scale(153).translate([W/2, H/2]);
const pathGen = d3.geoPath(proj);
const svgEl   = document.getElementById('map-svg');
const mapWrap = document.getElementById('map-wrap');
const tooltip = document.getElementById('tooltip');
const svg     = d3.select('#map-svg');
const franceG = svg.select('#france-g');
const labelsG = svg.select('#labels-g');
const objectsG = svg.select('#objects-g');

// ---- РЕЛЬЕФНАЯ ПОДЛОЖКА ----
// Спутниковый рельеф Земли (NASA Blue Marble, public domain), заранее спроецированный
// в ту же проекцию d3.geoNaturalEarth1 (scale 153, translate 480/280) — политическая
// заливка стран лежит ПОЛУПРОЗРАЧНЫМ слоем поверх гор/пустынь/глубин океана,
// как в современных стратегиях, вместо плоских залитых фигур на плоском фоне.
// Atlas experiment uses sharp vector cartography; no raster relief.

// Цвет территории страны: переопределение игрока за партию → цвет из сценария (задан в
// редакторе) → автоцвет из названия. Хардкода списка стран больше нет.
function autoCountryColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, ${38 + (h >> 9) % 25}%, ${42 + (h >> 5) % 18}%)`;
}

function getCountryColor(name) {
  if (typeof countries !== 'undefined' && countries[name] && countries[name].colorOverride) return countries[name].colorOverride;
  if (activeScenario && activeScenario.countryColors && activeScenario.countryColors[name]) return activeScenario.countryColors[name];
  return autoCountryColor(name);
}

// ---- РЕЖИМЫ КАРТЫ: 'political' (обычная) | 'alliance' (карта альянсов) ----
// На карте альянсов весь блок союзников красится цветом лидера блока (сильнейшая армия),
// страны без союзов — нейтральным серым. Так видно, какие силы противостоят друг другу.
let mapMode = 'political';

function setMapMode(mode) {
  mapMode = mode === 'alliance' ? 'alliance' : 'political';
  ['political', 'alliance'].forEach(m => {
    const btn = document.getElementById('map-mode-' + m);
    if (btn) btn.classList.toggle('active', m === mapMode);
  });
  renderScenarioProvinces();
}

function displayColorFor(owner) {
  if (mapMode === 'alliance' && typeof allianceBlocOf === 'function' && typeof countries !== 'undefined' && countries[owner]) {
    const bloc = allianceBlocOf(owner);
    if (bloc) return getCountryColor(blocLeader(bloc));
    return '#b8b2a4'; // без союзов — нейтральный серый
  }
  return getCountryColor(owner);
}

// ---- НАСТРОЙКИ ОТОБРАЖЕНИЯ (сохраняются в localStorage) ----
// showCountryLabels — показывать ли подписи с названиями стран (сами страны/границы видны всегда, иначе по ним нельзя будет кликать)
let showCountryLabels = localStorage.getItem('gs_atlas189_show_labels') !== '0';
// Upgrade only the old defaults; retain settings the player already changed.
if(!localStorage.getItem('gs_atlas189_label_defaults_v2')){
  if(localStorage.getItem('gs_atlas189_label_scale')==='1.2')localStorage.removeItem('gs_atlas189_label_scale');
  if(localStorage.getItem('gs_atlas189_inner_border')==='0.12')localStorage.removeItem('gs_atlas189_inner_border');
  localStorage.setItem('gs_atlas189_label_defaults_v2','1');
}
let countryLabelScale = parseFloat(localStorage.getItem('gs_atlas189_label_scale')) || 1;
if(!localStorage.getItem('gs_atlas189_label_defaults_v3')){
  if(localStorage.getItem('gs_atlas189_label_opacity')==='0.7')localStorage.removeItem('gs_atlas189_label_opacity');
  localStorage.setItem('gs_atlas189_label_defaults_v3','1');
}
let countryLabelOpacity = parseFloat(localStorage.getItem('gs_atlas189_label_opacity'));
if(!Number.isFinite(countryLabelOpacity))countryLabelOpacity=1;
countryLabelOpacity=Math.max(0,Math.min(1,countryLabelOpacity));
function setCountryLabelOpacity(v){
  const n=Number(v);
  countryLabelOpacity=Number.isFinite(n)?Math.max(0,Math.min(1,n)):1;
  localStorage.setItem('gs_atlas189_label_opacity',countryLabelOpacity);
  labelsG.selectAll('.country-label').attr('opacity',countryLabelOpacity);
}
let objectScale = parseFloat(localStorage.getItem('gs_atlas189_obj_scale')) || 1.8;

function setShowCountryLabels(v) {
  showCountryLabels = v;
  localStorage.setItem('gs_atlas189_show_labels', v ? '1' : '0');
  labelsG.style('display', v ? null : 'none');
}

function setCountryLabelScale(v) {
  countryLabelScale = v;
  localStorage.setItem('gs_atlas189_label_scale', v);
  updateCountryLabels();
}

function setObjectScale(v) {
  objectScale = v;
  localStorage.setItem('gs_atlas189_obj_scale', v);
  renderMapObjects();
}

// Толщина границ провинций — ЕДИНСТВЕННЫЙ слой границ (никаких отдельных «контуров держав»
// через topojson: они давали фризы и двойные/фантомные линии на наложенных провинциях).
let innerBorderWidth = parseFloat(localStorage.getItem('gs_atlas189_inner_border'));
if (isNaN(innerBorderWidth)) innerBorderWidth = 0.05;

function setInnerBorderWidth(v) {
  innerBorderWidth = parseFloat(v); if (isNaN(innerBorderWidth)) innerBorderWidth = 0.05;
  localStorage.setItem('gs_atlas189_inner_border', innerBorderWidth);
  provincesG.selectAll('path.scenario-province').attr('stroke-width', innerBorderWidth);
}

// Подпись страны — размер не зависит от зума карты, но масштабируется величиной страны
// (szMul из addCountryLabelsFromProvinces: империя — крупно, княжество — мелко).
// mode: true — feature (центроид посчитаем), 'xy' — готовые экранные координаты, иначе lon/lat.
function addCountryLabel(name, coordsOrFeature, isFeature, szMul, region) {
  const xy = isFeature === 'xy' ? coordsOrFeature
    : isFeature ? pathGen.centroid(coordsOrFeature) : proj(coordsOrFeature);
  if (!xy || isNaN(xy[0])) return;
  const label=labelsG.append('text')
    .attr('class', 'country-label')
    .attr('data-country', name)
    .attr('data-szmul', szMul || 1)
    .attr('data-region-width',region?region.width:0)
    .attr('data-region-height',region?region.height:0)
    .attr('opacity',countryLabelOpacity)
    .attr('data-cx', xy[0]).attr('data-cy', xy[1])
    .attr('x', xy[0]).attr('y', xy[1])
    .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
    .attr('fill', '#f5f2e8').attr('font-family', 'Georgia,serif')
    .attr('letter-spacing', '0.06em')
    .attr('pointer-events', 'none')
    .attr('paint-order', 'stroke')
    .attr('stroke', 'rgba(12,16,26,0.82)').attr('stroke-width', 2.2)
    .text(name.toUpperCase());
  measureCountryLabel(label.node());
}

// Обновить подпись страны на карте под её текущее отображаемое название
// (вызывается из renameCountry в game.js при переименовании страны игрока)
function updateMapCountryLabel(canonicalName, displayName) {
  labelsG.selectAll('.country-label')
    .filter(function() { return d3.select(this).attr('data-country') === canonicalName; })
    .text((displayName || '').toUpperCase())
    .each(function(){measureCountryLabel(this);});
  updateCountryLabels();
}

// The same typography rules apply to every country, including custom scenarios.
function countryLabelMultiplier(area){
  return Math.max(1,Math.min(1.8,Math.sqrt(Math.max(0,area))/45));
}
function countryLabelLines(text,count){
  let rest=Array.from(text.replace(/\(/g,' (').replace(/\s+/g,' ').trim()),lines=[];
  for(let n=count;n>1&&rest.length>1;n--){
    const target=Math.ceil(rest.length/n);
    const spaces=rest.map((c,i)=>c===' '?i:-1).filter(i=>i>0&&i>=target*0.65&&i<=target*1.35);
    let split=spaces.length?spaces.reduce((a,b)=>Math.abs(a-target)<Math.abs(b-target)?a:b):target;
    if(!spaces.length){
      const vowels=/[AEIOUYАЕЁИОУЫЭЮЯ]/i;
      const breaks=rest.map((_,i)=>i>0&&i>=target*0.75&&i<=target*1.25&&vowels.test(rest[i-1])&&!vowels.test(rest[i])?i:-1).filter(i=>i>0);
      if(breaks.length)split=breaks.reduce((a,b)=>Math.abs(a-target)<Math.abs(b-target)?a:b);
    }
    const atSpace=rest[split]===' ';
    const line=rest.slice(0,split).join('').trim();
    lines.push(line+(!atSpace&&rest[split-1]!==' '?'‐':''));
    rest=rest.slice(split+(atSpace?1:0));
  }
  if(rest.length)lines.push(rest.join('').trim());
  return lines.filter(Boolean);
}
let countryLabelMeasureContext=null;
function measureCountryLabel(node){
  const text=node.textContent.trim();
  node.setAttribute('data-label-text',text);
  if(!countryLabelMeasureContext){
    try{countryLabelMeasureContext=document.createElement('canvas').getContext('2d');}catch{}
  }
  if(countryLabelMeasureContext)countryLabelMeasureContext.font='10px Georgia,serif';
  node.__labelLayouts=[];
  const words=text.replace(/\(/g,' (').trim().split(/\s+/).length;
  const maxRows=words===1?(Array.from(text).length>10?2:1):Math.min(3,words);
  for(let rows=1;rows<=maxRows;rows++){
    const lines=countryLabelLines(text,rows);
    const units=Math.max(...lines.map(line=>{
      const length=Array.from(line).length;
      const width=countryLabelMeasureContext?.measureText(line).width;
      return Number.isFinite(width)&&width>0?width/10+Math.max(0,length-1)*0.06:Math.max(1,length*0.72);
    }));
    node.__labelLayouts.push({lines,units});
  }
  node.__activeLabelLayout=null;
}
function countryLabelFontSize(multiplier,width,height,textUnits,zoom,scale,rows=1){
  const preferred=6.5*Math.max(1,multiplier)*scale/zoom;
  // A short multi-line label may use a modest margin beyond the land's box.
  const fitWidth=width>0?width*(rows>1?1.35:1.05)/Math.max(1,textUnits):Infinity;
  const fitHeight=height>0?height*0.85/(rows*1.12):Infinity;
  return Math.max(0.05,Math.min(preferred,fitWidth,fitHeight));
}
function chooseCountryLabelLayout(layouts,multiplier,width,height,zoom,scale){
  let best=null;
  layouts.forEach(layout=>{
    const font=countryLabelFontSize(multiplier,width,height,layout.units,zoom,scale,layout.lines.length);
    const score=font/(1+0.12*(layout.lines.length-1));
    if(!best||score>best.score)best={layout,font,score};
  });
  return best;
}
function updateCountryLabels() {
  const zoom=W/vb.w;
  labelsG.selectAll('.country-label').each(function(){
    const label=d3.select(this);
    if(!this.__labelLayouts)measureCountryLabel(this);
    const best=chooseCountryLabelLayout(this.__labelLayouts,+this.getAttribute('data-szmul')||1,
      +this.getAttribute('data-region-width'),+this.getAttribute('data-region-height'),zoom,countryLabelScale);
    if(!best)return;
    if(this.__activeLabelLayout!==best.layout){
      label.text('');
      best.layout.lines.forEach(line=>label.append('tspan').text(line));
      this.__activeLabelLayout=best.layout;
    }
    const cx=+this.getAttribute('data-cx'),cy=+this.getAttribute('data-cy');
    label.attr('font-size',best.font).attr('opacity',countryLabelOpacity)
      .attr('data-text-units',best.layout.units).attr('data-label-lines',best.layout.lines.length)
      .attr('stroke-width',Math.min(1.2/zoom,best.font*0.16));
    label.selectAll('tspan').attr('x',cx).attr('y',(_,i)=>cy+(i-(best.layout.lines.length-1)/2)*best.font*1.12);
  });
}

// Известные города — координаты [lon, lat] для размещения объектов на карте.
// ИИ ссылается на эти названия в EFFECTS.map_objects.
const CITY_COORDS = {
  'Париж': [2.3488, 48.8534],
  'Марсель': [5.3698, 43.2965],
  'Лион': [4.8357, 45.7640],
  'Тулуза': [1.4442, 43.6047],
  'Бордо': [-0.5792, 44.8378],
  'Страсбург': [7.7521, 48.5734],
  'Брест': [-4.4861, 48.3904],
  'Тулон': [5.9280, 43.1242],
  'Лондон': [-0.1278, 51.5074],
  'Мадрид': [-3.7038, 40.4168],
  'Барселона': [2.1734, 41.3851],
  'Берлин': [13.4050, 52.5200],
  'Вена': [16.3738, 48.2082],
  'Санкт-Петербург': [30.3351, 59.9343],
  'Москва': [37.6173, 55.7558],
  'Рим': [12.4964, 41.9028]
};

function lighten(hex) {
  const n = parseInt(hex.slice(1),16);
  const r = Math.min(255,((n>>16)&0xff)+35);
  const g = Math.min(255,((n>>8) &0xff)+35);
  const b = Math.min(255,( n     &0xff)+35);
  return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
}

function positionTooltip(e) {
  const r = mapWrap.getBoundingClientRect();
  tooltip.style.left = (e.clientX - r.left + 14)+'px';
  tooltip.style.top  = (e.clientY - r.top  - 58)+'px';
}

// ============================================================
// РЕЕСТР СЦЕНАРИЕВ. Карта целиком строится из активного сценария: встроенного
// (scenario_1852.json) или любого созданного в редакторе и сохранённого в браузере.
// Смена сценария полностью меняет карту, список стран и год старта.
// ============================================================
const SCENARIOS_INDEX_KEY = 'gs_atlas189_scenarios_index';
const ACTIVE_SCENARIO_KEY = 'gs_atlas189_active_scenario';
let activeScenarioRef = localStorage.getItem(ACTIVE_SCENARIO_KEY) || 'builtin-world';
// Одноразовая миграция: старый дефолт 'builtin' → новый основной 'builtin-world'
// (сохранения не трогаем — каждый сейв помнит и грузит СВОЙ сценарий).
if (activeScenarioRef === 'builtin' && !localStorage.getItem('gs_atlas189_default_migrated')) {
  activeScenarioRef = 'builtin-world';
  localStorage.setItem('gs_atlas189_default_migrated', '1');
  localStorage.setItem(ACTIVE_SCENARIO_KEY, 'builtin-world');
}
let activeScenario = null; // {ref, name, year, countryColors, provinces}

function getScenariosIndex() {
  try { return JSON.parse(localStorage.getItem(SCENARIOS_INDEX_KEY)) || []; }
  catch (e) { return []; }
}
function scenarioDataKey(id) { return 'gs_atlas189_scenario_' + id; }

// Встроенные сценарии, зашитые файлами в репозиторий. 'builtin-world' — основной
// (Мир 1852, ~48 стран); 'builtin' — старый компактный (Европа 1852, 6 стран).
const BUILTIN_SCENARIOS = {
  'builtin-world': { file: 'scenario_orders1852.json', name: 'Мир 1852 — приказы', year: 1852 },
  'builtin-1914':  { file: 'scenario_1914.json', name: 'Мир 1912', year: 1912 },
  'builtin-2016':  { file: 'scenario_2016.json', name: 'Наше время (2016)', year: 2016 },
  'builtin':       { file: 'scenario_1852.json', name: 'Европа 1852 (компактный)', year: 1852 }
};

// ---- ХРАНИЛИЩЕ СЦЕНАРИЕВ: IndexedDB (сотни МБ) вместо localStorage (~5 МБ) ----
// Раньше сценарии писались в localStorage и большие карты не влезали по квоте — кнопка
// «Сохранить в игру» падала. Теперь ДАННЫЕ сценариев лежат в IndexedDB, а маленький
// индекс (список названий) — в localStorage.
const IDB_NAME = 'gs1852', IDB_STORE = 'scenarios';
function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function idbPutScenario(key, val) {
  return idbOpen().then(db => new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(val, key);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  }));
}
function idbGetScenario(key) {
  return idbOpen().then(db => new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const rq = tx.objectStore(IDB_STORE).get(key);
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  }));
}
function idbDeleteScenario(key) {
  return idbOpen().then(db => new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  }));
}

let scenarioLoadSequence=0;
function publishScenarioStatus(status,ref,message,data){
  window.GS_MAP_LOAD={status,ref,message,name:data?.name||BUILTIN_SCENARIOS[ref]?.name||'Свой сценарий',
    provinces:data?.provinces?.length||0};
  window.dispatchEvent(new CustomEvent('gs:scenario-status',{detail:window.GS_MAP_LOAD}));
}
function loadScenarioData(ref) {
  const controller=new AbortController();
  const b=BUILTIN_SCENARIOS[ref];
  const norm=d=>{
    if(!d||!Array.isArray(d.provinces)||!d.provinces.length)throw Error('В сценарии нет провинций');
    return {ref,name:d.name||b?.name||'Свой сценарий',year:d.year||b?.year||1852,
      countryColors:d.countryColors||{},provinces:d.provinces,countryProfiles:d.countryProfiles||{},rules:d.rules||{},month:d.month||0,day:d.day||1,maritime:d.maritime||null,dataNotes:d.dataNotes||''};
  };
  const embedded=ref==='builtin-world'?document.getElementById('gs-builtin-world-data'):null;
  // The default world travels with the page, so starting it never waits for a second download.
  const request=embedded?Promise.resolve().then(()=>norm(JSON.parse(embedded.textContent))):
    b?d3.json(b.file,{signal:controller.signal}).then(norm):
    idbGetScenario(scenarioDataKey(ref)).then(obj=>{
      if(obj)return norm(obj);
      const raw=localStorage.getItem(scenarioDataKey(ref));
      if(!raw)throw Error('Сценарий не найден');
      return norm(JSON.parse(raw));
    });
  let timeout;
  const expired=new Promise((resolve,reject)=>{timeout=setTimeout(()=>{
    reject(Error('Загрузка сценария не ответила за 15 секунд'));controller.abort();
  },15000);});
  return Promise.race([request,expired]).finally(()=>clearTimeout(timeout));
}
async function switchActiveScenario(ref) {
  const sequence=++scenarioLoadSequence;
  publishScenarioStatus('loading',ref,'Загружаем сценарий…');
  try{
    const data=await loadScenarioData(ref);
    if(sequence!==scenarioLoadSequence)throw Error('Загрузка сценария отменена');
    publishScenarioStatus('rendering',ref,'Строим карту…',data);
    await new Promise(resolve=>setTimeout(resolve,0));
    if(sequence!==scenarioLoadSequence)throw Error('Загрузка сценария отменена');
    const provinces=data.provinces.filter(p=>p.geometry);
    if(!provinces.length)throw Error('В сценарии нет геометрии карты');
    activeScenario=data;activeScenarioRef=ref;scenarioProvinces=provinces;
    if(typeof applyScenarioToGame==='function')applyScenarioToGame(data);
    renderScenarioProvinces();
    if(typeof window.prepareMaritimeGeography==='function')window.prepareMaritimeGeography();
    try{localStorage.setItem(ACTIVE_SCENARIO_KEY,ref);}catch{}
    publishScenarioStatus('ready',ref,'Карта готова',data);
    return data;
  }catch(error){
    if(sequence===scenarioLoadSequence){
      publishScenarioStatus('error',ref,error.message);
      console.error('Не удалось загрузить сценарий:',error.message);
    }
    throw error;
  }
}
window.retryScenarioLoad=()=>switchActiveScenario(activeScenarioRef).catch(()=>{});
window.loadDefaultWorld=()=>switchActiveScenario('builtin-world').catch(()=>{});

function drawMap() {
  labelsG.style('display', showCountryLabels ? null : 'none');
  updateLabels();
  renderMapObjects();
}

function updateLabels() {
  updateCountryLabels();
  updateObjectScale();
}

// Перекрасить все территории по текущим владельцам (вызывается после аннексий/передач).
// Владение теперь считается по провинциям — см. renderScenarioProvinces() ниже.
function renderTerritoryColors() {
  if (typeof renderScenarioProvinces === 'function') renderScenarioProvinces();
}

// Выбор играбельной страны кликом по карте в главном меню
function selectPlayableCountry(name) {
  if (typeof newGame === 'function') newGame(name);
}

// ---- ЗУМ и перетаскивание ----
let dragging = false, ds = {x:0,y:0};
let vb = {x:0, y:0, w:960, h:560};

mapWrap.addEventListener('mousedown', e=>{ dragging=true; ds={x:e.clientX,y:e.clientY}; });
window.addEventListener('mousemove', e=>{
  if (!dragging) return;
  const scale = vb.w / mapWrap.offsetWidth;
  vb.x -= (e.clientX-ds.x)*scale;
  vb.y -= (e.clientY-ds.y)*scale;
  vb.x = Math.max(-600, Math.min(800, vb.x));
  vb.y = Math.max(-400, Math.min(600, vb.y));
  svgEl.setAttribute('viewBox',`${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  ds = {x:e.clientX, y:e.clientY};
  updateLabels();
});
window.addEventListener('mouseup', ()=>dragging=false);

mapWrap.addEventListener('wheel', e=>{
  e.preventDefault();
  const f  = e.deltaY>0 ? 1.12 : 0.89;
  const nw = Math.max(25, Math.min(1800, vb.w*f));
  const nh = Math.max(15, Math.min(1100, vb.h*f));
  const rect = mapWrap.getBoundingClientRect();
  const mx = (e.clientX-rect.left)/rect.width;
  const my = (e.clientY-rect.top) /rect.height;
  vb.x += vb.w*mx - nw*mx;
  vb.y += vb.h*my - nh*my;
  vb.w=nw; vb.h=nh;
  svgEl.setAttribute('viewBox',`${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  updateLabels();
},{passive:false});

drawMap();

// ============================================================
// ПРОВИНЦИИ ИЗ СЦЕНАРИЯ (созданы в редакторе сценариев) — реальные границы вместо одной
// закрашенной кляксы на страну. Рисуются ПОВЕРХ существующих слоёв стран, ничего не заменяя:
// если для какого-то участка страны провинции нет, под ней по-прежнему виден старый фон-блоб.
// Казна/армия/ИИ/дипломатия не меняются — меняется только слой отображения территории.
// ============================================================
const provincesG = svg.select('#provinces-g');
let scenarioProvinces = []; // [{id,name,geometry,owner}] — owner тут ИСХОДНЫЙ (из сценария)

// Текущий (с учётом аннексий) владелец провинции: провинция передана, если есть запись
// в provinceOwners (game.js) — иначе действует владелец, назначенный при создании сценария.
function provinceOwnerOf(id, scenarioOwner) {
  if (typeof provinceOwners !== 'undefined' && provinceOwners[id]) return provinceOwners[id];
  return scenarioOwner;
}

// Подпись каждой страны ставим на её САМУЮ БОЛЬШУЮ провинцию (по площади) — надёжнее, чем
// центроид всех кусков сразу, который может уехать в море при многочастной территории.
// Страны берутся из фактических владельцев провинций сценария — без хардкода.
// Geometry is projected once; annexations only change which owner groups it.
const labelGeometryCache=new WeakMap();
let countryLabelOwnersSignature='';
function currentCountryLabelOwners(){return scenarioProvinces.map(p=>p.id+'='+provinceOwnerOf(p.id,p.owner)).join('\u0000');}
function countryLabelParts(geometry){
  if(labelGeometryCache.has(geometry))return labelGeometryCache.get(geometry);
  const polygons=geometry.type==='MultiPolygon'?geometry.coordinates:
    geometry.type==='Polygon'?[geometry.coordinates]:[];
  const parts=[];
  polygons.forEach(coordinates=>{
    const feature={type:'Feature',geometry:{type:'Polygon',coordinates}};
    try {
      const bounds=pathGen.bounds(feature),area=pathGen.area(feature),xy=pathGen.centroid(feature);
      if(!(area>0)||!bounds.flat().every(Number.isFinite)||!xy.every(Number.isFinite))return;
      parts.push({area,x:xy[0],y:xy[1],bounds});
    }catch {}
  });
  labelGeometryCache.set(geometry,parts);
  return parts;
}
function countryLabelRegions(parts){
  const parent=parts.map((_,i)=>i);
  function root(i){while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;}
  // Nearby islands belong to one regional label; distant possessions do not.
  for(let i=0;i<parts.length;i++)for(let k=i+1;k<parts.length;k++){
    const a=parts[i].bounds,b=parts[k].bounds;
    const dx=Math.max(0,a[0][0]-b[1][0],b[0][0]-a[1][0]);
    const dy=Math.max(0,a[0][1]-b[1][1],b[0][1]-a[1][1]);
    if(Math.hypot(dx,dy)<=4)parent[root(k)]=root(i);
  }
  const groups=new Map();
  parts.forEach((p,i)=>{
    const key=root(i);
    if(!groups.has(key))groups.set(key,{area:0,sx:0,sy:0,left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity,parts:[]});
    const g=groups.get(key);g.area+=p.area;g.sx+=p.x*p.area;g.sy+=p.y*p.area;
    g.left=Math.min(g.left,p.bounds[0][0]);g.right=Math.max(g.right,p.bounds[1][0]);
    g.top=Math.min(g.top,p.bounds[0][1]);g.bottom=Math.max(g.bottom,p.bounds[1][1]);g.parts.push(p);
  });
  return [...groups.values()].map(g=>{
    let x=g.sx/g.area,y=g.sy/g.area;
    // Do not leave an archipelago label in a large empty gap.
    if(!g.parts.some(p=>x>=p.bounds[0][0]&&x<=p.bounds[1][0]&&y>=p.bounds[0][1]&&y<=p.bounds[1][1])){
      const biggest=g.parts.reduce((a,b)=>a.area>b.area?a:b);x=biggest.x;y=biggest.y;
    }
    return {area:g.area,x,y,width:g.right-g.left,height:g.bottom-g.top};
  }).sort((a,b)=>b.area-a.area);
}
function addCountryLabelsFromProvinces() {
  countryLabelOwnersSignature=currentCountryLabelOwners();
  const byCountry=new Map();
  scenarioProvinces.forEach(p=>{
    const owner=provinceOwnerOf(p.id,p.owner);
    if(!owner||!p.geometry)return;
    if(!byCountry.has(owner))byCountry.set(owner,[]);
    byCountry.get(owner).push(...countryLabelParts(p.geometry));
  });
  labelsG.selectAll('.country-label').remove();
  byCountry.forEach((parts,c)=>{
    const display=(typeof countries!=='undefined'&&countries[c]&&countries[c].displayName)||c;
    const regions=countryLabelRegions(parts);
    regions.forEach((region,i)=>{
      // Tiny offshore rocks do not need another overlapping copy of the name.
      if(i>0&&region.area<0.5)return;
      const multiplier=countryLabelMultiplier(region.area);
      addCountryLabel(c,[region.x,region.y],'xy',multiplier,region);
    });
    if(display!==c)updateMapCountryLabel(c,display);
  });
  updateCountryLabels();
}

// Приглушение цвета страны под полупрозрачный политический слой: цвета сценария бывают
// кислотными (#c5d11f и т.п.) — мягчим насыщенность и уводим светлоту в средний тон,
// чтобы поверх рельефа они смотрелись как тонирование карты, а не как заливка краской.
function politicalFill(color) {
  try {
    const c = d3.hsl(color);
    if (isNaN(c.h)) c.h = 0;
    c.s = Math.min(c.s * 0.72, 0.52);
    c.l = Math.min(Math.max(c.l, 0.45), 0.70);
    return c.formatHex();
  } catch (e) { return color; }
}

// ОПТИМИЗАЦИЯ: геометрия 699 провинций (сотни тысяч точек) строится ОДИН раз на сценарий
// (buildProvincePaths), а перекраска владений на каждом ходу трогает только fill
// (recolorProvinces). Раньше каждый вызов пересчитывал все SVG-пути заново — отсюда фризы.
let _provincesBuiltFor = null;

function buildProvincePaths() {
  _provincesBuiltFor = scenarioProvinces;
  provincesG.selectAll('path.scenario-province')
    .data(scenarioProvinces, d => d.id)
    .join('path')
    .attr('class', 'scenario-province')
    .attr('data-province-id', d => d.id)
    .attr('d', d => pathGen({ type: 'Feature', geometry: d.geometry }))
    .attr('stroke', 'rgba(28,20,10,0.55)')
    .attr('stroke-width', innerBorderWidth)
    .on('mouseover', function(e, d) {
      d3.select(this).attr('fill-opacity', 0.78);
      tooltip.style.display = 'block';
      const owner = provinceOwnerOf(d.id, d.owner);
      if (!owner) {
        document.getElementById('t-name').textContent = d.name;
        document.getElementById('t-info').textContent = 'Нейтральная территория';
        return;
      }
      const rel = (typeof worldState !== 'undefined') ? (worldState.relations[owner] || 0) : 0;
      const war = (typeof worldState !== 'undefined') && worldState.atWarWith.includes(owner) ? ' ⚔️ ВОЙНА' : '';
      document.getElementById('t-name').textContent = d.name + ' (' + owner + ')' + war;
      if (mapMode === 'alliance' && typeof allianceBlocOf === 'function') {
        const bloc = allianceBlocOf(owner);
        document.getElementById('t-info').textContent = bloc ? 'Блок: ' + bloc.join(' + ') : 'Вне альянсов';
      } else {
        document.getElementById('t-info').textContent = 'Отношения: ' + (rel > 0 ? '+' : '') + rel;
      }
    })
    .on('mousemove', e => positionTooltip(e))
    .on('mouseleave', function(e, d) {
      const owner = provinceOwnerOf(d.id, d.owner);
      d3.select(this).attr('fill-opacity', owner ? 0.62 : 0.10);
      tooltip.style.display = 'none';
    })
    .on('click', function(e, d) {
      const owner = provinceOwnerOf(d.id, d.owner);
      if (!owner) return; // нейтральная земля — кликать пока не на что
      if (typeof gameStarted !== 'undefined' && !gameStarted) {
        if (typeof selectPlayableCountry === 'function') selectPlayableCountry(owner);
        return;
      }
      // Клик по СВОЕЙ стране — не переговоры с самим собой, а вкладка Экономика
      if (typeof playerCountry !== 'undefined' && owner === playerCountry) {
        if (typeof openEconomyPanel === 'function') openEconomyPanel();
        return;
      }
      if (typeof openCountryRelations === 'function') openCountryRelations(owner);
    });
}

// Дешёвая перекраска: только цвет и прозрачность, геометрия не пересчитывается.
// Нейтральная земля почти не тонируется — сквозь неё виден чистый рельеф.
function recolorProvinces() {
  provincesG.selectAll('path.scenario-province')
    .attr('fill', d => {
      const owner = provinceOwnerOf(d.id, d.owner);
      return owner ? politicalFill(displayColorFor(owner)) : '#b8b4a4';
    })
    .attr('fill-opacity', d => provinceOwnerOf(d.id, d.owner) ? 0.62 : 0.10)
    .style('cursor', d => provinceOwnerOf(d.id, d.owner) ? 'pointer' : 'default');
}

// Совместимость: все существующие вызовы (смена владений, режим карты, загрузка сейва)
// идут через эту функцию — она строит геометрию лишь при смене сценария.
function renderScenarioProvinces() {
  if (_provincesBuiltFor !== scenarioProvinces) buildProvincePaths();
  recolorProvinces();
  if(countryLabelOwnersSignature!==currentCountryLabelOwners())addCountryLabelsFromProvinces();
}

publishScenarioStatus('loading',activeScenarioRef,'Подготавливаем карту…');
function startInitialScenario(){switchActiveScenario(activeScenarioRef).catch(()=>{});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startInitialScenario,{once:true});
else startInitialScenario();

// ============================================================
// ОБЪЕКТЫ НА КАРТЕ — армии, штабы, передвижения (создаются через EFFECTS от ИИ)
// ============================================================
const TYPE_ICONS = { army: '⚔️', hq: '🏛', naval: '⚓', diplomat: '🕊️', other: '📍' };
const OWNER_COLORS = { rebel: '#7a1a1a', foreign: '#8a1a1a' };

// Гравюрные символы объектов (SVG-пути в координатах ~±3) вместо эмодзи: сабли — армия,
// якорь — флот, штандарт — ставка, ромб — делегация. Эмодзи выбивались из стиля карты
// и по-разному выглядели на разных ОС.
const MAP_SYMBOLS = {
  army:     'M-2.6,-2.6 L2.6,2.6 M2.6,-2.6 L-2.6,2.6',
  port:     'M0,-2.7 A.6,.6 0 1 1 -.01,-2.7 M0,-2 V2.5 M-1.3,-.8 H1.3 M-2.2,.4 Q-2,2.5 0,2.5 Q2,2.5 2.2,.4 M-2.2,.4 L-1.5,.9 M2.2,.4 L1.5,.9',
  naval:    'M0,-3 L0,2.4 M-2,0.4 A2,2 0 0 0 2,0.4 M-1.5,-2.2 L1.5,-2.2',
  hq:       'M-2.4,-2.4 h4.8 v4.8 h-4.8 Z',
  diplomat: 'M0,-3 L2.6,0 L0,3 L-2.6,0 Z',
  other:    'M0,-1.6 A1.6,1.6 0 1 1 -0.01,-1.6 Z'
};

function ownerColor(owner) {
  const pc = (typeof playerCountry !== 'undefined') ? playerCountry : 'Франция';
  if (owner === pc) return getCountryColor(pc);
  if (owner === 'Бунтовщики' || owner === 'Мятежники') return OWNER_COLORS.rebel;
  return getCountryColor(owner) || OWNER_COLORS.foreign;
}

// Суммарные войска игрока, уже размещённые на карте (для проверки лимита общей армии)
function totalFrenchTroopsOnMap(excludeId) {
  if (typeof worldState === 'undefined' || !worldState.mapObjects) return 0;
  const pc = (typeof playerCountry !== 'undefined') ? playerCountry : 'Франция';
  return worldState.mapObjects
    .filter(o => o.owner === pc && o.type === 'army' && o.id !== excludeId)
    .reduce((sum, o) => sum + (o.troops || 0), 0);
}

// Применить массив действий над объектами карты (вызывается из ai.js после EFFECTS)
// Координаты места для объекта на карте (армия/штаб/etc): либо известный город (CITY_COORDS),
// либо — теперь — НАЗВАНИЕ ПРОВИНЦИИ сценария (ищем по имени без учёта регистра, берём её
// географический центр). Раньше ИИ мог ссылаться только на фиксированный список городов из
// старой карты, из-за чего многие места (например Зальцбург) не находились вовсе.
function resolveLocationLonLat(name) {
  if (!name) return null;
  if (CITY_COORDS[name]) return CITY_COORDS[name];
  if (typeof scenarioProvinces !== 'undefined') {
    const p = scenarioProvinces.find(x => x.name.toLowerCase() === String(name).toLowerCase());
    if (p) {
      try { return d3.geoCentroid({ type: 'Feature', geometry: p.geometry }); } catch (e) { return null; }
    }
  }
  return null;
}

function applyMapObjects(list) {
  if(!Array.isArray(list))throw Error('Некорректные объекты карты');
  if(!worldState.mapObjects)worldState.mapObjects=[];
  const changeLog=[];
  const ownerOf=n=>normalizeCountryName(n);
  const used=(owner,except)=>worldState.mapObjects.filter(o=>o.type==='army'&&o.owner===owner&&o.id!==except).reduce((n,o)=>n+(o.troops||0),0);
  const room=(owner,except)=>Math.max(0,(countries[owner]?.army||0)-used(owner,except));
  list.forEach(item=>{
    if(item.action==='create'){
      const owner=ownerOf(item.owner||playerCountry);
      if(!countries[owner]||!resolveLocationLonLat(item.location))throw Error('Неизвестный владелец или место объекта');
      if(!item.id||worldState.mapObjects.some(o=>o.id===item.id))throw Error('ID объекта должен быть уникальным');
      const troops=item.type==='army'?(item.troops||0):0;
      if(item.type==='army'&&(troops<=0||troops>room(owner,null)))throw Error('Недостаточно свободных солдат для '+item.label);
      worldState.mapObjects.push({id:item.id,type:item.type,owner,label:item.label||'Объект',troops,location:item.location,createdTurn:turn,...(item.expires_in_months!=null?{expiresAtMonth:year*12+month+item.expires_in_months}:{})});
      changeLog.push('Создано: '+(item.label||'Объект')+(troops?' ('+troops+')':''));
    }else{
      const obj=worldState.mapObjects.find(o=>o.id===item.id);
      if(!obj)throw Error('Объект не найден: '+item.id);
      if(item.expires_in_months!=null&&item.action!=='remove')obj.expiresAtMonth=year*12+month+item.expires_in_months;
      if(item.action==='update'){
        if(item.troops!=null){
          if(obj.type!=='army')throw Error('Численность задаётся только армии');
          if(item.troops<0||!Number.isInteger(item.troops)||item.troops>room(obj.owner,obj.id))throw Error('Численность превышает свободную армию');
          obj.troops=item.troops;
        }
        if(item.label)obj.label=item.label;
        if(obj.type==='army'&&obj.troops===0)worldState.mapObjects=worldState.mapObjects.filter(o=>o!==obj);
        changeLog.push('Обновлено: '+obj.label);
      }else if(item.action==='remove'){
        worldState.mapObjects=worldState.mapObjects.filter(o=>o!==obj);changeLog.push('Убрано: '+obj.label);
      }else if(item.action==='move'){
        if(!resolveLocationLonLat(item.to))throw Error('Неизвестная цель передвижения');
        obj.location=item.to;changeLog.push('Перемещено: '+obj.label+' → '+item.to);
      }else throw Error('Неизвестное действие с объектом');
    }
  });
  renderMapObjects();return changeLog;
}

function expireMapObjects(){
 const due=year*12+month,expired=(worldState.mapObjects||[]).filter(o=>Number.isFinite(o.expiresAtMonth)&&o.expiresAtMonth<=due);
 if(!expired.length)return;
 const ids=new Set(expired.map(o=>o.id));
 worldState.mapObjects=worldState.mapObjects.filter(o=>!ids.has(o.id));
 expired.forEach(o=>{if(typeof recordWorldEvent==='function')recordWorldEvent(o.owner===playerCountry?'domestic':'foreign',
  'Завершилось временное присутствие','Истёк заданный срок пребывания: «'+o.label+'» ('+o.location+').',[o.owner]);});
}
function renderMapObjects() {
  if(typeof maritimeRenderRoutes==='function')maritimeRenderRoutes();
  if (typeof worldState === 'undefined' || !worldState.mapObjects) return;
  const zoom = W / vb.w;
  const motion = !!window.GS_MOTION?.enabled();
  const sel = objectsG.selectAll('g.map-obj').data(worldState.mapObjects, d => d.id);
  const leaving = sel.exit().interrupt('map-position').style('pointer-events', 'none');
  leaving.each(function(){this.__gsLeaving=true;this.__gsMoving=false;});
  if (motion) leaving.transition('map-appearance').duration(130).attr('opacity', 0).remove();
  else leaving.remove();
  const enter = sel.enter().append('g').attr('class', 'map-obj').attr('id', d => 'mo-' + d.id);
  enter.append('circle').attr('class', 'mo-dot');
  enter.append('path').attr('class', 'mo-sym').attr('pointer-events', 'none');
  enter.append('text').attr('class', 'mo-label').attr('text-anchor', 'middle').attr('pointer-events', 'none');
  if (motion) enter.attr('opacity', 0).transition('map-appearance').duration(180).attr('opacity', 1);
  const merged = enter.merge(sel);
  merged.each(function(d) {
    const loc = d.mapCoordinates || resolveLocationLonLat(d.location);
    if (!loc) return;
    const xy = proj(loc);
    if (!xy || !xy.every(Number.isFinite)) return;
    const quiet = d.type==='port'||d.maritimeMarker;
    const portScale = window.matchMedia('(min-width: 1100px) and (pointer: fine)').matches ? 1.44 : .48;
    const k = quiet ? (d.type==='port'?portScale:.7)/zoom : objectScale / zoom;
    const node = this, g = d3.select(node);
    if(node.__gsLeaving){g.interrupt('map-appearance').attr('opacity',1);node.__gsLeaving=false;}
    const changed = node.__gsLocation != null && node.__gsLocation !== d.location;
    const previous = node.__gsXY;
    node.__gsLocation = d.location;
    g.style('pointer-events', null);
    if (!motion) {
      g.interrupt('map-position').interrupt('map-appearance').attr('opacity', 1);
      node.__gsMoving = false;node.__gsXY = xy.slice();g.attr('transform', 'translate(' + xy.join(',') + ')');
    } else if (changed && previous && Math.hypot(xy[0]-previous[0],xy[1]-previous[1]) < W*.45) {
      g.interrupt('map-position');
      node.__gsMoving = true;
      const from = previous.slice();
      g.transition('map-position').duration(620).ease(d3.easeCubicInOut)
        .attrTween('transform', () => t => {
          const point = [from[0]+(xy[0]-from[0])*t,from[1]+(xy[1]-from[1])*t];
          node.__gsXY = point;return 'translate(' + point.join(',') + ')';
        }).on('end', () => {node.__gsMoving=false;node.__gsXY=xy.slice();});
    } else if (changed || !node.__gsMoving) {
      // A seam crossing or a new scenario must not fly across the whole world.
      g.interrupt('map-position');node.__gsMoving=false;
      node.__gsXY=xy.slice();g.attr('transform','translate('+xy.join(',')+')');
    }
    g.select('.mo-dot').attr('cx', 0).attr('cy', 0).attr('r', 4*k)
      .attr('fill', ownerColor(d.owner)).attr('stroke','rgba(10,14,22,0.85)').attr('stroke-width',.8*k)
      .attr('display',d.type==='port'?'none':null);
    g.select('.mo-sym').attr('transform','scale('+k+')')
      .attr('d', MAP_SYMBOLS[d.type]||MAP_SYMBOLS.other)
      .attr('fill',d.type==='hq'?'#f5f2e8':'none').attr('stroke',d.type==='port'?'#ddd2b9':'#f5f2e8').attr('stroke-width',d.type==='port'?1.3:.9)
      .attr('stroke-linejoin','round').attr('stroke-linecap','round');
    g.select('.mo-label').attr('x',0).attr('y',9*objectScale/zoom)
      .attr('font-size',5.5*objectScale/zoom).attr('fill','#f5f2e8')
      .attr('font-family','Georgia,serif').attr('paint-order','stroke')
      .attr('stroke','rgba(12,16,26,0.85)').attr('stroke-width',1.4/zoom)
      .attr('display',quiet?'none':null)
      .text(d.label+(d.troops?' «'+d.troops.toLocaleString('ru')+'»':''));
    g.style('cursor','default')
      .on('mouseover',()=>{tooltip.style.display='block';document.getElementById('t-name').textContent=d.label;document.getElementById('t-info').textContent=(d.troops?'👥 '+d.troops.toLocaleString('ru')+' чел. · ':'')+d.location;})
      .on('mousemove',e=>positionTooltip(e))
      .on('mouseleave',()=>{tooltip.style.display='none';});
  });
}

function updateObjectScale() {
  renderMapObjects();
}

// Анимация передвижения объекта между городами (~3 секунды)
function animateMove(obj,toCityName) {
  if(typeof showNotif==='function')showNotif(obj.label+': '+obj.location+' → '+toCityName);
}
