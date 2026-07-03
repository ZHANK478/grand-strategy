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

// Цвет территории страны: переопределение игрока за партию → цвет из сценария (задан в
// редакторе) → автоцвет из названия. Хардкода списка стран больше нет.
// Атласная палитра — приглушённые тона старинной карты, соседи различимы. Пришла на смену
// случайному HSL по хешу имени (давал грязные, сталкивающиеся цвета). Цвет, заданный в
// редакторе (countryColors сценария) или игроком (colorOverride), по-прежнему главнее.
const ATLAS_PALETTE = [
  '#c79ea0','#a6b28f','#d8bf83','#8ea4bd','#c08a6b','#ab9cbb','#8bb0a6','#cbb078',
  '#b98f86','#9aa878','#a8b8c4','#c9a679','#9fb59d','#bfa0ab','#b0a684','#93a9a0'
];
function autoCountryColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return ATLAS_PALETTE[h % ATLAS_PALETTE.length];
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
let showCountryLabels = localStorage.getItem('gs1852_show_labels') !== '0';
let countryLabelScale = parseFloat(localStorage.getItem('gs1852_label_scale')) || 1.2;
let objectScale = parseFloat(localStorage.getItem('gs1852_obj_scale')) || 1.8;

function setShowCountryLabels(v) {
  showCountryLabels = v;
  localStorage.setItem('gs1852_show_labels', v ? '1' : '0');
  labelsG.style('display', v ? null : 'none');
}

function setCountryLabelScale(v) {
  countryLabelScale = v;
  localStorage.setItem('gs1852_label_scale', v);
  updateCountryLabels();
}

function setObjectScale(v) {
  objectScale = v;
  localStorage.setItem('gs1852_obj_scale', v);
  renderMapObjects();
}

// Толщина границ: внутренние (между провинциями одной страны) и внешний контур державы.
let innerBorderWidth = parseFloat(localStorage.getItem('gs1852_inner_border')) || 0.3;
let outerBorderWidth = parseFloat(localStorage.getItem('gs1852_outer_border')) || 1.4;
function setInnerBorderWidth(v) {
  innerBorderWidth = parseFloat(v) || 0.3;
  localStorage.setItem('gs1852_inner_border', innerBorderWidth);
  renderScenarioProvinces();
}
function setOuterBorderWidth(v) {
  outerBorderWidth = parseFloat(v) || 1.4;
  localStorage.setItem('gs1852_outer_border', outerBorderWidth);
  renderScenarioProvinces();
}

// Подпись страны — константный размер на экране независимо от зума карты
function addCountryLabel(name, coordsOrFeature, isFeature) {
  const xy = isFeature ? pathGen.centroid(coordsOrFeature) : proj(coordsOrFeature);
  if (!xy || isNaN(xy[0])) return;
  labelsG.append('text')
    .attr('class', 'country-label')
    .attr('data-country', name)
    .attr('data-cx', xy[0]).attr('data-cy', xy[1])
    .attr('x', xy[0]).attr('y', xy[1])
    .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
    .attr('fill', '#2c2114').attr('font-family', 'Georgia,serif')
    .attr('pointer-events', 'none')
    .attr('paint-order', 'stroke')
    .attr('stroke', '#efe7d1').attr('stroke-width', 2.2)
    .text(name);
}

// Обновить подпись страны на карте под её текущее отображаемое название
// (вызывается из renameCountry в game.js при переименовании страны игрока)
function updateMapCountryLabel(canonicalName, displayName) {
  labelsG.selectAll('.country-label')
    .filter(function() { return d3.select(this).attr('data-country') === canonicalName; })
    .text(displayName);
}

function updateCountryLabels() {
  const zoom = W / vb.w;
  labelsG.selectAll('.country-label')
    .attr('font-size', d => (9 * countryLabelScale) / zoom)
    .attr('stroke-width', 2.2 / zoom);
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

// Парижский маркер — масштабируется с зумом
let parisXY = null;
function updateParis() {
  if (!parisXY) return;
  const zoom = W / vb.w;
  const r  = 2 / zoom;
  const fs = 7 / zoom;
  const show = zoom > 3;

  svg.select('#paris-dot')
    .attr('r', r)
    .attr('visibility', show ? 'visible' : 'hidden');
  svg.select('#paris-label')
    .attr('font-size', fs)
    .attr('x', parisXY[0] + r + 0.5/zoom)
    .attr('y', parisXY[1] + 0.5/zoom)
    .attr('visibility', show ? 'visible' : 'hidden');
}
// ============================================================
// РЕЕСТР СЦЕНАРИЕВ. Карта целиком строится из активного сценария: встроенного
// (scenario_1852.json) или любого созданного в редакторе и сохранённого в браузере.
// Смена сценария полностью меняет карту, список стран и год старта.
// ============================================================
const SCENARIOS_INDEX_KEY = 'gs1852_scenarios_index';
const ACTIVE_SCENARIO_KEY = 'gs1852_active_scenario';
let activeScenarioRef = localStorage.getItem(ACTIVE_SCENARIO_KEY) || 'builtin-world';
// Одноразовая миграция: старый дефолт 'builtin' → новый основной 'builtin-world'
// (сохранения не трогаем — каждый сейв помнит и грузит СВОЙ сценарий).
if (activeScenarioRef === 'builtin' && !localStorage.getItem('gs1852_default_migrated')) {
  activeScenarioRef = 'builtin-world';
  localStorage.setItem('gs1852_default_migrated', '1');
  localStorage.setItem(ACTIVE_SCENARIO_KEY, 'builtin-world');
}
let activeScenario = null; // {ref, name, year, countryColors, provinces}

function getScenariosIndex() {
  try { return JSON.parse(localStorage.getItem(SCENARIOS_INDEX_KEY)) || []; }
  catch (e) { return []; }
}
function scenarioDataKey(id) { return 'gs1852_scenario_' + id; }

// Встроенные сценарии, зашитые файлами в репозиторий. 'builtin-world' — основной
// (Мир 1852, ~48 стран); 'builtin' — старый компактный (Европа 1852, 6 стран).
const BUILTIN_SCENARIOS = {
  'builtin-world': { file: 'scenario_mr4rhxpc.json', name: 'Мир 1852', year: 1852 },
  'builtin':       { file: 'scenario_1852.json', name: 'Европа 1852 (компактный)', year: 1852 }
};

function loadScenarioData(ref) {
  if (BUILTIN_SCENARIOS[ref]) {
    const b = BUILTIN_SCENARIOS[ref];
    return d3.json(b.file).then(d => ({
      ref, name: d.name || b.name, year: d.year || b.year,
      countryColors: d.countryColors || {}, provinces: d.provinces || []
    }));
  }
  const raw = localStorage.getItem(scenarioDataKey(ref));
  if (!raw) return Promise.reject(new Error('Сценарий не найден: ' + ref));
  try {
    const d = JSON.parse(raw);
    return Promise.resolve({
      ref, name: d.name || 'Свой сценарий', year: d.year || 1852,
      countryColors: d.countryColors || {}, provinces: d.provinces || []
    });
  } catch (e) { return Promise.reject(e); }
}

function switchActiveScenario(ref) {
  return loadScenarioData(ref).then(data => {
    activeScenario = data;
    activeScenarioRef = ref;
    localStorage.setItem(ACTIVE_SCENARIO_KEY, ref);
    scenarioProvinces = (data.provinces || []).filter(p => p.geometry);
    if (typeof applyScenarioToGame === 'function') applyScenarioToGame(data);
    renderScenarioProvinces();
    addCountryLabelsFromProvinces();
    return data;
  }).catch(err => {
    console.error('Не удалось загрузить сценарий:', err.message);
    if (ref !== 'builtin') return switchActiveScenario('builtin'); // откат на встроенный
    svg.append('text').attr('x', W/2).attr('y', H/2)
      .attr('text-anchor', 'middle').attr('font-size', '13')
      .attr('fill', '#888').text('Ошибка загрузки карты сценария');
    throw err;
  });
}

function drawMap() {
  // Маркер Парижа — масштабируемый (остаётся как декоративная метка столицы игрока по умолчанию)
  parisXY = proj([2.3488, 48.8534]);
  franceG.append('circle')
    .attr('id','paris-dot')
    .attr('cx', parisXY[0]).attr('cy', parisXY[1])
    .attr('r', 2.5)
    .attr('fill','#f0c040').attr('stroke','#805000').attr('stroke-width','0.8')
    .attr('pointer-events','none')
    .attr('visibility','hidden');
  franceG.append('text')
    .attr('id','paris-label')
    .attr('x', parisXY[0]+4).attr('y', parisXY[1]-2)
    .attr('font-size','8').attr('fill','#f0c040')
    .attr('font-family','Georgia,serif')
    .attr('pointer-events','none')
    .attr('visibility','hidden')
    .text('★ Париж');

  labelsG.style('display', showCountryLabels ? null : 'none');
  updateLabels();
  renderMapObjects();
}

function updateLabels() {
  updateParis();
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
function addCountryLabelsFromProvinces() {
  const biggestByCountry = {};
  scenarioProvinces.forEach(p => {
    if (!p.owner) return;
    const feature = { type: 'Feature', geometry: p.geometry };
    let area = 0;
    try { area = Math.abs(d3.geoArea(feature)); } catch (e) { /* битая геометрия — пропускаем */ }
    if (!biggestByCountry[p.owner] || area > biggestByCountry[p.owner].area) {
      biggestByCountry[p.owner] = { area, feature };
    }
  });
  labelsG.selectAll('.country-label').remove();
  Object.keys(biggestByCountry).forEach(c => {
    const display = (typeof countries !== 'undefined' && countries[c] && countries[c].displayName) || c;
    addCountryLabel(c, biggestByCountry[c].feature, true);
    if (display !== c) updateMapCountryLabel(c, display);
  });
  updateCountryLabels();
}

function renderScenarioProvinces() {
  provincesG.selectAll('path.scenario-province')
    .data(scenarioProvinces, d => d.id)
    .join('path')
    .attr('class', 'scenario-province')
    .attr('data-province-id', d => d.id)
    .attr('d', d => pathGen({ type: 'Feature', geometry: d.geometry }))
    .attr('fill', d => {
      const owner = provinceOwnerOf(d.id, d.owner);
      return owner ? displayColorFor(owner) : '#e8e4dc';
    })
    .attr('stroke', '#8a7a5e')
    .attr('stroke-width', innerBorderWidth)
    .style('cursor', d => provinceOwnerOf(d.id, d.owner) ? 'pointer' : 'default')
    .on('mouseover', function(e, d) {
      d3.select(this).style('opacity', 0.8);
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
    .on('mouseleave', function() {
      d3.select(this).style('opacity', 1);
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

  renderNationalBorders();
}

// Иерархия границ: тонкая внутренняя (штрих самих провинций выше) + ЖИРНЫЙ тёмный контур
// державы поверх — границы между разными владельцами и побережья. Контур считается через
// topojson (загружен в index.html). Топология строится ОДИН раз на сценарий и кэшируется;
// на перекраске пересчитывается только меш границ (дёшево). Если топология не строится —
// отдельного контура просто нет, тонкие границы остаются, ничего не ломается.
let _topoCache = null, _topoSrcRef = null;
function ensureScenarioTopo() {
  if (_topoCache && _topoSrcRef === scenarioProvinces) return _topoCache;
  if (typeof topojson === 'undefined' || !scenarioProvinces.length) return null;
  try {
    const fc = { type: 'FeatureCollection', features: scenarioProvinces.map(p => ({
      type: 'Feature', properties: { id: p.id }, geometry: p.geometry
    })) };
    _topoCache = topojson.topology({ prov: fc }, 1e5);
    _topoSrcRef = scenarioProvinces;
  } catch (e) { _topoCache = null; _topoSrcRef = null; }
  return _topoCache;
}
function renderNationalBorders() {
  provincesG.select('path.national-border').remove();
  const topo = ensureScenarioTopo();
  if (!topo) return;
  const ownerById = {};
  scenarioProvinces.forEach(p => { ownerById[p.id] = provinceOwnerOf(p.id, p.owner); });
  let mesh;
  try {
    mesh = topojson.mesh(topo, topo.objects.prov, (a, b) =>
      a === b || ownerById[a.properties.id] !== ownerById[b.properties.id]);
  } catch (e) { return; }
  provincesG.append('path')
    .attr('class', 'national-border')
    .attr('d', pathGen(mesh))
    .attr('fill', 'none')
    .attr('stroke', '#2c2114')
    .attr('stroke-width', outerBorderWidth)
    .attr('stroke-linejoin', 'round')
    .attr('stroke-linecap', 'round')
    .attr('pointer-events', 'none');
}

switchActiveScenario(activeScenarioRef);

// ============================================================
// ОБЪЕКТЫ НА КАРТЕ — армии, штабы, передвижения (создаются через EFFECTS от ИИ)
// ============================================================
const TYPE_ICONS = { army: '⚔️', hq: '🏛', naval: '⚓', diplomat: '🕊️', other: '📍' };
const OWNER_COLORS = { rebel: '#7a1a1a', foreign: '#8a1a1a' };

// Гравюрные символы объектов (SVG-пути в «единицах маркера» ~±3) — пришли на смену эмодзи,
// которые выбивались из эпохи и по-разному рисовались на разных ОС.
const MAP_SYMBOLS = {
  army:     'M-2.6,-2.6 L2.6,2.6 M2.6,-2.6 L-2.6,2.6',            // скрещённые сабли
  naval:    'M0,-3 L0,2.4 M-2,0.4 A2,2 0 0 0 2,0.4 M-1.5,-2.2 L1.5,-2.2', // якорь
  hq:       'M-2.4,-2.4 h4.8 v4.8 h-4.8 Z',                       // ставка (флаг/квадрат)
  diplomat: 'M0,-3 L2.6,0 L0,3 L-2.6,0 Z',                        // делегация (ромб)
  other:    'M0,-1.6 A1.6,1.6 0 1 1 -0.01,-1.6 Z'                 // прочее (точка)
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
  if (!Array.isArray(list) || typeof worldState === 'undefined') return [];
  if (!worldState.mapObjects) worldState.mapObjects = [];
  const changeLog = [];

  list.forEach(item => {
    if (!item || !item.action) return;

    if (item.action === 'create') {
      const loc = resolveLocationLonLat(item.location);
      if (!loc) return; // неизвестный город — пропускаем
      let troops = item.troops || 0;
      const rawOwner = item.owner || playerCountry;
      const owner = (typeof normalizeCountryName === 'function') ? normalizeCountryName(rawOwner) : rawOwner;
      const type = item.type || 'other';

      if (owner === playerCountry && type === 'army') {
        const currentArmy = parseInt(document.getElementById('army').textContent.replace(/\s/g,'')) || 0;
        const already = totalFrenchTroopsOnMap(null);
        const room = Math.max(0, currentArmy - already);
        troops = Math.min(troops, room);
        if (troops <= 0) { changeLog.push(`⚠️ Недостаточно свободных солдат для «${item.label}»`); return; }
      }

      const obj = {
        id: item.id || ('obj_' + Date.now() + Math.random().toString(36).slice(2,6)),
        type, owner, label: item.label || 'Объект',
        troops: type === 'army' ? troops : 0,
        location: item.location,
        createdTurn: (typeof turn !== 'undefined') ? turn : 0
      };
      worldState.mapObjects.push(obj);
      changeLog.push(`${TYPE_ICONS[type] || '📍'} Создано: ${obj.label}${obj.troops ? ' (' + obj.troops.toLocaleString('ru') + ')' : ''}`);
    }

    if (item.action === 'remove') {
      const idx = worldState.mapObjects.findIndex(o => o.id === item.id || o.label === item.label);
      if (idx > -1) {
        changeLog.push(`✖ Убрано с карты: ${worldState.mapObjects[idx].label}`);
        worldState.mapObjects.splice(idx, 1);
      }
    }

    // Изменить численность/название уже существующего объекта (расформирование части, пополнение,
    // переименование) — без этого объекты навсегда "застревали" на карте с исходным числом солдат.
    if (item.action === 'update') {
      const obj = worldState.mapObjects.find(o => o.id === item.id || o.label === item.label);
      if (obj) {
        const before = obj.troops || 0;
        if (typeof item.troops === 'number') obj.troops = Math.max(0, item.troops);
        if (item.label) obj.label = item.label;
        if (obj.troops === 0 && obj.type === 'army') {
          changeLog.push(`✖ Расформировано: ${obj.label}`);
          worldState.mapObjects = worldState.mapObjects.filter(o => o !== obj);
        } else {
          changeLog.push(`✏️ Обновлено: ${obj.label}${typeof item.troops === 'number' ? ' (' + before.toLocaleString('ru') + ' → ' + obj.troops.toLocaleString('ru') + ')' : ''}`);
        }
      }
    }

    if (item.action === 'move') {
      const obj = worldState.mapObjects.find(o => o.id === item.id || o.label === item.label);
      const toLoc = resolveLocationLonLat(item.to);
      if (obj && toLoc) {
        animateMove(obj, item.to);
        changeLog.push(`➡️ ${obj.label} направляется: ${obj.location} → ${item.to}`);
        obj.location = item.to;
      }
    }
  });

  renderMapObjects();
  return changeLog;
}

function renderMapObjects() {
  if (typeof worldState === 'undefined' || !worldState.mapObjects) return;
  const zoom = W / vb.w;
  const sel = objectsG.selectAll('g.map-obj')
    .data(worldState.mapObjects, d => d.id);

  sel.exit().remove();

  const enter = sel.enter().append('g')
    .attr('class', 'map-obj')
    .attr('id', d => 'mo-' + d.id);

  enter.append('circle').attr('class', 'mo-dot');
  enter.append('path').attr('class', 'mo-sym').attr('pointer-events', 'none');
  enter.append('text').attr('class', 'mo-label').attr('text-anchor', 'middle').attr('pointer-events', 'none');

  const merged = enter.merge(sel);
  merged.each(function(d) {
    const loc = resolveLocationLonLat(d.location);
    if (!loc) return;
    const xy = proj(loc);
    const k = objectScale / zoom; // единицы маркера → экранные
    const g = d3.select(this);
    g.select('.mo-dot')
      .attr('cx', xy[0]).attr('cy', xy[1])
      .attr('r', 4 * k)
      .attr('fill', ownerColor(d.owner))
      .attr('stroke', '#2c2114').attr('stroke-width', 0.8 * k);
    g.select('.mo-sym')
      .attr('transform', `translate(${xy[0]},${xy[1]}) scale(${k})`)
      .attr('d', MAP_SYMBOLS[d.type] || MAP_SYMBOLS.other)
      .attr('fill', d.type === 'hq' ? '#2c2114' : 'none')
      .attr('stroke', '#241a0e').attr('stroke-width', 0.9)
      .attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
    g.select('.mo-label')
      .attr('x', xy[0]).attr('y', xy[1] + (9 * objectScale) / zoom)
      .attr('font-size', 5.5 * objectScale / zoom)
      .attr('fill', '#2c2114')
      .attr('font-family', 'Georgia,serif')
      .attr('paint-order', 'stroke')
      .attr('stroke', '#efe7d1').attr('stroke-width', 1.4 / zoom)
      .text(d.label + (d.troops ? ' «' + d.troops.toLocaleString('ru') + '»' : ''));
    g.style('cursor', 'default')
      .on('mouseover', () => {
        tooltip.style.display = 'block';
        document.getElementById('t-name').textContent = d.label;
        document.getElementById('t-info').textContent = (d.troops ? '👥 ' + d.troops.toLocaleString('ru') + ' чел. · ' : '') + d.location;
      })
      .on('mousemove', e => positionTooltip(e))
      .on('mouseleave', () => { tooltip.style.display = 'none'; });
  });
}

function updateObjectScale() {
  renderMapObjects();
}

// Анимация передвижения объекта между городами (~3 секунды)
function animateMove(obj, toCityName) {
  const fromLoc = resolveLocationLonLat(obj.location);
  const toLoc = resolveLocationLonLat(toCityName);
  if (!fromLoc || !toLoc) return;
  const from = proj(fromLoc), to = proj(toLoc);

  const line = objectsG.append('line')
    .attr('class', 'mo-travel-line')
    .attr('x1', from[0]).attr('y1', from[1])
    .attr('x2', from[0]).attr('y2', from[1])
    .attr('stroke', ownerColor(obj.owner))
    .attr('stroke-width', 0.6)
    .attr('stroke-dasharray', '2,2')
    .attr('opacity', 0.8);

  const dot = objectsG.append('circle')
    .attr('class', 'mo-travel-dot')
    .attr('cx', from[0]).attr('cy', from[1])
    .attr('r', 2.2)
    .attr('fill', ownerColor(obj.owner));

  line.transition().duration(3000).attr('x2', to[0]).attr('y2', to[1]);
  dot.transition().duration(3000)
    .attr('cx', to[0]).attr('cy', to[1])
    .on('end', () => {
      line.remove();
      dot.remove();
      renderMapObjects();
    });

  if (typeof showNotif === 'function') showNotif(`➡️ ${obj.label}: ${obj.location} → ${toCityName}`);
}
