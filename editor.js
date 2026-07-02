// ============================================================
// EDITOR.JS — редактор сценариев: полностью отдельная песочница
// ============================================================
// Свой собственный <svg id="editor-svg">, не связан с игровой картой — изменения тут
// НИКАК не влияют на игру. Провинции — просто фигуры с именем, без привязки к странам.

// ---- Ленивая загрузка turf.js (нужен только для склейки нескольких кусков границ в одну
// провинцию) — грузим по требованию, с перебором нескольких CDN на случай блокировки. ----
let turfLoadPromise = null;
function ensureTurfLoaded() {
  if (typeof turf !== 'undefined') return Promise.resolve();
  if (turfLoadPromise) return turfLoadPromise;
  const sources = [
    'https://cdn.jsdelivr.net/npm/@turf/turf@6/turf.min.js',
    'https://unpkg.com/@turf/turf@6/turf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/Turf.js/6.5.0/turf.min.js'
  ];
  function tryLoad(i) {
    if (i >= sources.length) return Promise.reject(new Error('Не удалось загрузить turf.js ни с одного источника'));
    return new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = sources[i];
      tag.onload = resolve;
      tag.onerror = reject;
      document.head.appendChild(tag);
    }).catch(() => tryLoad(i + 1));
  }
  turfLoadPromise = tryLoad(0);
  return turfLoadPromise;
}

const editorSvgEl = document.getElementById('editor-svg');
const editorSvg = d3.select('#editor-svg');
const editorBgG = editorSvg.select('#editor-bg-g');
const editorDrawG = editorSvg.select('#editor-draw-g');
const editorProj = d3.geoNaturalEarth1().scale(153).translate([480, 280]);
const editorPathGen = d3.geoPath(editorProj);

const MAPS_INDEX_KEY = 'gs1852_editor_maps_index';

let drawMode = 'point';        // 'point' | 'pencil'
let editorDrawing = false;
let editorPoints = [];         // [[x,y], ...] в координатах editor-svg (0..960 / 0..560)
let pencilActive = false;      // мышь зажата в режиме карандаша

// ---- Зум и панорамирование холста редактора (независимо от игровой карты) ----
let edVb = { x: 0, y: 0, w: 960, h: 560 };
let edPanning = false, edPanStart = { x: 0, y: 0 };
let edDidPan = false; // отличаем настоящий клик от лёгкого сдвига при перетаскивании

function applyEditorViewBox() {
  editorSvgEl.setAttribute('viewBox', `${edVb.x} ${edVb.y} ${edVb.w} ${edVb.h}`);
}

document.getElementById('editor-canvas-wrap').addEventListener('wheel', function(e) {
  e.preventDefault();
  const f = e.deltaY > 0 ? 1.12 : 0.89;
  const nw = Math.max(25, Math.min(1800, edVb.w * f));
  const nh = Math.max(15, Math.min(1100, edVb.h * f));
  const rect = editorSvgEl.getBoundingClientRect();
  const mx = (e.clientX - rect.left) / rect.width;
  const my = (e.clientY - rect.top) / rect.height;
  edVb.x += edVb.w * mx - nw * mx;
  edVb.y += edVb.h * my - nh * my;
  edVb.w = nw; edVb.h = nh;
  applyEditorViewBox();
}, { passive: false });

let currentMapId = null;       // null = новая несохранённая карта
let currentMapTemplate = null; // 'world' | 'blank' | 'provinces'
let mapProvinces = [];         // [{id, name, points}]

let currentBgFeatures = [];    // спроецированные кольца фона (для прилипания границ)
let neAdmin1Cache = null;      // кэш в памяти сессии — Natural Earth грузится один раз за сессию

let strokeWidth = parseFloat(localStorage.getItem('gs1852_editor_stroke')) || 0.6;
function onChangeEditorStroke(val) {
  strokeWidth = parseFloat(val);
  localStorage.setItem('gs1852_editor_stroke', strokeWidth);
  document.getElementById('editor-stroke-val').textContent = strokeWidth.toFixed(1);
  updateDrawPreview();
  renderMapProvinces();
}

let showProvinceLabels = localStorage.getItem('gs1852_editor_show_labels') !== '0';
let provinceLabelScale = parseFloat(localStorage.getItem('gs1852_editor_label_scale')) || 1;
function onToggleProvinceLabels(checked) {
  showProvinceLabels = checked;
  localStorage.setItem('gs1852_editor_show_labels', checked ? '1' : '0');
  renderMapProvinces();
}
function onChangeProvinceLabelScale(val) {
  provinceLabelScale = parseFloat(val);
  localStorage.setItem('gs1852_editor_label_scale', provinceLabelScale);
  document.getElementById('editor-label-scale-val').textContent = provinceLabelScale.toFixed(1) + '×';
  renderMapProvinces();
}

// ---- Прилипание к существующим границам (снап), как в ГИС-редакторах ----
const SNAP_PX = 10; // радиус прилипания в экранных пикселях
let snapSegments = []; // [[[x1,y1],[x2,y2]], ...] — сегменты границ, доступные для прилипания в текущем виде

function buildSnapIndex() {
  snapSegments = [];
  const pad = edVb.w * 0.15;
  const bx0 = edVb.x - pad, bx1 = edVb.x + edVb.w + pad;
  const by0 = edVb.y - pad, by1 = edVb.y + edVb.h + pad;

  function addRing(coordsLatLon) {
    const pts = coordsLatLon.map(c => editorProj(c)).filter(p => p && !isNaN(p[0]));
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (Math.max(a[0], b[0]) < bx0 || Math.min(a[0], b[0]) > bx1) continue;
      if (Math.max(a[1], b[1]) < by0 || Math.min(a[1], b[1]) > by1) continue;
      snapSegments.push([a, b]);
    }
  }

  currentBgFeatures.forEach(f => {
    const geom = f.geometry;
    if (!geom) return;
    if (geom.type === 'Polygon') geom.coordinates.forEach(addRing);
    if (geom.type === 'MultiPolygon') geom.coordinates.forEach(poly => poly.forEach(addRing));
  });

  // Уже нарисованные вручную провинции этой карты — тоже цепляемся к их границам
  mapProvinces.forEach(p => {
    if (p.points && p.points.length >= 2) {
      const ring = p.points.concat([p.points[0]]);
      for (let i = 0; i < ring.length - 1; i++) snapSegments.push([ring[i], ring[i + 1]]);
    }
    if (p.geometry) {
      if (p.geometry.type === 'Polygon') p.geometry.coordinates.forEach(addRing);
      if (p.geometry.type === 'MultiPolygon') p.geometry.coordinates.forEach(poly => poly.forEach(addRing));
    }
  });
}

function closestPointOnSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return a;
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return [a[0] + t * dx, a[1] + t * dy];
}

function snapPoint(xy) {
  if (snapSegments.length === 0) return xy;
  const rect = editorSvgEl.getBoundingClientRect();
  const radiusSvg = SNAP_PX * (edVb.w / rect.width);
  let best = null, bestDist = radiusSvg;
  snapSegments.forEach(seg => {
    const cp = closestPointOnSegment(xy, seg[0], seg[1]);
    const d = Math.hypot(cp[0] - xy[0], cp[1] - xy[1]);
    if (d < bestDist) { bestDist = d; best = cp; }
  });
  return best || xy;
}

// ============================================================
// Индекс сохранённых карт
// ============================================================
function getMapsIndex() {
  try { return JSON.parse(localStorage.getItem(MAPS_INDEX_KEY)) || []; }
  catch (e) { return []; }
}
function saveMapsIndex(idx) {
  localStorage.setItem(MAPS_INDEX_KEY, JSON.stringify(idx));
}
function mapDataKey(id) { return 'gs1852_editor_map_' + id; }

// ============================================================
// Открыть / закрыть редактор
// ============================================================
function openScenarioEditor() {
  document.getElementById('main-menu').style.display = 'none';
  document.getElementById('editor-screen').style.display = 'flex';
  backToMapsList();
}

function closeScenarioEditor() {
  cancelDrawingProvince();
  document.getElementById('editor-screen').style.display = 'none';
  document.getElementById('main-menu').style.display = 'flex';
}

// ============================================================
// Экран списка карт
// ============================================================
function backToMapsList() {
  cancelDrawingProvince();
  currentMapId = null;
  currentMapTemplate = null;
  mapProvinces = [];
  document.getElementById('editor-view-draw').style.display = 'none';
  document.getElementById('editor-view-maps').style.display = 'block';
  renderSavedMapsList();
}

function renderSavedMapsList() {
  const list = document.getElementById('editor-saved-maps-list');
  const idx = getMapsIndex();
  if (idx.length === 0) {
    list.innerHTML = '<div class="chg-empty">Пока нет сохранённых карт</div>';
    return;
  }
  list.innerHTML = idx.map(m => `
    <div class="map-saved-item">
      <div onclick="openSavedMap('${m.id}')" style="flex:1">
        <div class="map-item-name">🗺️ ${m.name}</div>
        <div class="map-item-sub">${m.provinceCount} провинций</div>
      </div>
      <button onclick="event.stopPropagation();deleteSavedMap('${m.id}')" style="border:none;background:#eee;border-radius:3px;padding:5px 8px;cursor:pointer">🗑</button>
    </div>
  `).join('');
}

// ============================================================
// «Взять части из другой карты»: показать сохранённую карту как фон, чтобы кликами
// доимпортировать из неё нужные провинции в текущую (текущие провинции не трогаем).
// ============================================================
function openLoadMapPicker() {
  const list = document.getElementById('editor-loadmap-list');
  const idx = getMapsIndex().filter(m => m.id !== currentMapId); // текущую карту не предлагаем
  if (idx.length === 0) {
    list.innerHTML = '<div class="chg-empty">Нет других сохранённых карт</div>';
  } else {
    list.innerHTML = idx.map(m => `
      <div class="map-saved-item" onclick="loadSavedMapAsBackground('${m.id}')">
        <div><div class="map-item-name">🗺️ ${m.name}</div><div class="map-item-sub">${m.provinceCount} провинций</div></div>
      </div>
    `).join('');
  }
  document.getElementById('editor-loadmap-form').style.display = 'block';
}

function closeLoadMapPicker() {
  document.getElementById('editor-loadmap-form').style.display = 'none';
}

function loadSavedMapAsBackground(id) {
  const raw = localStorage.getItem(mapDataKey(id));
  if (!raw) { showNotif('⚠️ Карта не найдена'); return; }
  let d;
  try { d = JSON.parse(raw); } catch (e) { showNotif('⚠️ Не удалось прочитать карту'); return; }
  const provs = d.provinces || [];
  const feats = provs.map(p => {
    const g = provinceToGeometry(p);
    return g ? { type: 'Feature', geometry: g, properties: { name: p.name } } : null;
  }).filter(Boolean);
  if (!feats.length) { showNotif('⚠️ В этой карте нет провинций с границами'); return; }
  closeLoadMapPicker();
  currentMapTemplate = 'imported-bg'; // чтобы клик-импорт работал (не 'blank')
  drawProvinceFeatures(feats);
  document.getElementById('nuts-level-switcher').style.display = 'none'; // уровни NUTS тут не при чём
  showNotif('📂 Карта показана как фон: ' + feats.length + ' провинций. Кликайте нужные, чтобы добавить их в свою карту.');
}

function deleteSavedMap(id) {
  if (!confirm('Удалить эту карту?')) return;
  localStorage.removeItem(mapDataKey(id));
  saveMapsIndex(getMapsIndex().filter(m => m.id !== id));
  renderSavedMapsList();
}

// ============================================================
// Начать новую карту с шаблона (только фон-подложка для трассировки)
// ============================================================
function newMapFromTemplate(template) {
  currentMapId = null;
  currentMapTemplate = template;
  mapProvinces = [];
  enterDrawView();
  renderBackground(template);
}

function openSavedMap(id) {
  const raw = localStorage.getItem(mapDataKey(id));
  if (!raw) return;
  try {
    const d = JSON.parse(raw);
    currentMapId = id;
    currentMapTemplate = 'blank';
    mapProvinces = d.provinces || [];
  } catch (e) { mapProvinces = []; }
  enterDrawView();
  renderBackground('blank');
  renderMapProvinces();
  renderEditorProvinceList();
}

function enterDrawView() {
  document.getElementById('editor-view-maps').style.display = 'none';
  document.getElementById('editor-view-draw').style.display = 'block';
  cancelDrawingProvince();
  edVb = { x: 0, y: 0, w: 960, h: 560 };
  applyEditorViewBox();
  document.getElementById('editor-stroke-slider').value = strokeWidth;
  document.getElementById('editor-stroke-val').textContent = strokeWidth.toFixed(1);
  document.getElementById('editor-show-labels').checked = showProvinceLabels;
  document.getElementById('editor-label-scale-slider').value = provinceLabelScale;
  document.getElementById('editor-label-scale-val').textContent = provinceLabelScale.toFixed(1) + '×';
  document.getElementById('nuts-level-switcher').style.display = currentMapTemplate === 'nuts-europe' ? 'block' : 'none';
  activeNutsOverrideLevel = null;
  admin1Showing = false;
  selectionMode = false;
  const selCheck = document.getElementById('selection-mode-check');
  if (selCheck) selCheck.checked = false;
  selectedProvinceIds.clear();
  mapHistory = [];
  updateUndoButton();
  updateMergeButtonState();
  renderMapProvinces();
  renderEditorProvinceList();
}

// ============================================================
// Фон-подложка (только контуры для трассировки — цветовая палитра как в основной игре)
// ============================================================
function renderBackground(template) {
  editorBgG.selectAll('*').remove();
  currentBgFeatures = [];
  if (template === 'blank') { buildSnapIndex(); return; }

  if (template === 'world') {
    d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then(world => {
      const countries = topojson.feature(world, world.objects.countries);
      drawProvinceFeatures(countries.features);
    });
  }

  if (template === 'provinces') {
    if (neAdmin1Cache) {
      drawProvinceFeatures(neAdmin1Cache.features);
      return;
    }

    editorBgG.append('text')
      .attr('id', 'editor-loading-txt')
      .attr('x', 480).attr('y', 280)
      .attr('text-anchor', 'middle').attr('font-size', 13)
      .attr('fill', '#fff').attr('font-family', 'Georgia,serif')
      .text('⏳ Загрузка провинций (Natural Earth Admin-1, ~17 МБ)...');

    fetchAdmin1Data();
  }

  if (template === 'nuts-europe') {
    // Карта "Мир по уровням": по умолчанию — крупный уровень (целые страны мира).
    // Дальше игрок сам переключает детализацию кнопками (Средне=NUTS1, Мелко=NUTS2 по Европе).
    switchNutsLevel(1);
  }
}

// ============================================================
// EUROSTAT NUTS — регионы Европы с настраиваемым уровнем детализации ПО КАЖДОЙ СТРАНЕ.
// В отличие от Natural Earth Admin-1 (неполное, случайное покрытие), NUTS покрывает все
// страны ЕС/ЕАСТ равномерно, а уровень (NUTS1/NUTS2) выбирается вручную под реальный размер
// регионов страны — так границы получаются осмысленными, а не "то густо, то пусто".
// ВАЖНО: NUTS не покрывает Россию (не входит в ЕС/ЕАСТ) — для неё нужен другой источник.
const COUNTRY_NUTS_LEVEL = { FR: 1, DE: 1, GB: 1, AT: 2, ES: 2 };
const NUTS_LEVEL_SOURCES = {
  1: [
    'https://cdn.jsdelivr.net/gh/eurostat/Nuts2json@master/pub/v2/2021/4326/20M/1.json',
    'https://raw.githubusercontent.com/eurostat/Nuts2json/master/pub/v2/2021/4326/20M/1.json'
  ],
  2: [
    'https://cdn.jsdelivr.net/gh/eurostat/Nuts2json@master/pub/v2/2021/4326/20M/2.json',
    'https://raw.githubusercontent.com/eurostat/Nuts2json/master/pub/v2/2021/4326/20M/2.json'
  ]
};
let nutsLevelCache = {}; // level -> [features]
let nutsCombinedCache = null;

// Внутри TopoJSON-файла Nuts2json может быть несколько объектов (границы, точки, регионы) —
// а точное имя объекта с полигонами не документировано стабильно, поэтому определяем его
// автоматически по фактическому содержимому, а не гадаем название.
function pickPolygonObjectKey(topo) {
  for (const key in topo.objects) {
    const obj = topo.objects[key];
    if (obj.geometries && obj.geometries.some(g => g.type === 'Polygon' || g.type === 'MultiPolygon')) return key;
  }
  return Object.keys(topo.objects)[0];
}

function fetchNutsLevel(level, sourceIndex) {
  sourceIndex = sourceIndex || 0;
  const sources = NUTS_LEVEL_SOURCES[level];
  if (sourceIndex >= sources.length) return Promise.reject(new Error('Все источники NUTS уровня ' + level + ' недоступны'));

  return d3.json(sources[sourceIndex]).then(topo => {
    if (!topo || !topo.objects) throw new Error('Пустой ответ');
    const key = pickPolygonObjectKey(topo);
    const collection = topojson.feature(topo, topo.objects[key]);
    if (!collection.features || collection.features.length < 20) {
      throw new Error('Получено подозрительно мало регионов (' + (collection.features ? collection.features.length : 0) + ')');
    }
    return collection.features;
  }).catch(err => {
    console.warn('NUTS уровень ' + level + ', источник ' + (sourceIndex + 1) + ' не сработал:', err.message);
    return fetchNutsLevel(level, sourceIndex + 1);
  });
}

async function fetchNutsData() {
  const neededLevels = [...new Set(Object.values(COUNTRY_NUTS_LEVEL))];

  try {
    for (const level of neededLevels) {
      if (!nutsLevelCache[level]) {
        editorBgG.select('#editor-loading-txt').text(`⏳ Загрузка регионов Европы (NUTS${level})...`);
        nutsLevelCache[level] = await fetchNutsLevel(level);
      }
    }
  } catch (err) {
    editorBgG.select('#editor-loading-txt')
      .text('⚠️ Не удалось загрузить (' + err.message + ').')
      .append('tspan').attr('x', 480).attr('dy', 16).text('Нажмите, чтобы попробовать снова.');
    editorBgG.select('#editor-loading-txt').style('cursor', 'pointer').on('click', fetchNutsData);
    return;
  }

  // Для каждой страны берём регионы ТОЛЬКО с её настроенного уровня, чтобы не задваивать
  const combined = [];
  Object.entries(COUNTRY_NUTS_LEVEL).forEach(([countryCode, level]) => {
    const feats = (nutsLevelCache[level] || []).filter(f => {
      const id = f.id || (f.properties && f.properties.id) || '';
      return String(id).slice(0, 2) === countryCode;
    });
    combined.push(...feats);
  });

  if (combined.length === 0) {
    editorBgG.select('#editor-loading-txt').text('⚠️ Не удалось найти нужные регионы в загруженных данных.');
    return;
  }

  nutsCombinedCache = combined;
  drawProvinceFeatures(combined);
}

// Активный уровень детализации для ручного переключения.
let activeNutsOverrideLevel = null;

// Целые страны всего мира (крупный уровень) — грузим один раз за сессию.
let worldCountriesCache = null;
const WORLD_COUNTRIES_SOURCES = [
  'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
  'https://unpkg.com/world-atlas@2/countries-110m.json',
  'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json'
];
function fetchWorldCountries(i) {
  i = i || 0;
  if (i >= WORLD_COUNTRIES_SOURCES.length) return Promise.reject(new Error('Не удалось загрузить контуры стран мира'));
  return d3.json(WORLD_COUNTRIES_SOURCES[i]).then(world => {
    const countries = topojson.feature(world, world.objects.countries);
    if (!countries.features || countries.features.length < 50) throw new Error('Подозрительно мало стран');
    return countries.features;
  }).catch(err => {
    console.warn('Источник стран мира ' + (i + 1) + ' не сработал:', err.message);
    return fetchWorldCountries(i + 1);
  });
}

function showEditorLoadingText(msg) {
  editorBgG.selectAll('*').remove();
  editorBgG.append('text')
    .attr('id', 'editor-loading-txt')
    .attr('x', 480).attr('y', 280)
    .attr('text-anchor', 'middle').attr('font-size', 13)
    .attr('fill', '#fff').attr('font-family', 'Georgia,serif')
    .text(msg);
}

// Переключение уровня детализации ФОНА (доступных для импорта границ):
//   Крупно (1) — целые страны ВСЕГО МИРА, без внутреннего деления (world-atlas)
//   Средне (2) — субрегионы Европы уровня NUTS1 (крупные земли/регионы)
//   Мелко  (3) — субрегионы Европы уровня NUTS2 (более мелкие)
// Уже импортированные провинции (mapProvinces) при переключении не трогаем — можно, например,
// взять целую Россию на «Крупно», а потом переключиться на «Средне» и добрать регионы Франции.
async function switchNutsLevel(level) {
  activeNutsOverrideLevel = level;
  admin1Showing = false;
  const ab = document.getElementById('admin1-toggle-btn');
  if (ab) ab.classList.remove('active');
  ['1', '2', '3'].forEach(l => document.getElementById('nuts-lvl-' + l + '-btn').classList.toggle('active', Number(l) === level));

  // Крупно — весь мир по странам
  if (level === 1) {
    if (worldCountriesCache) { drawProvinceFeatures(worldCountriesCache); return; }
    showEditorLoadingText('⏳ Загрузка контуров стран мира...');
    try { worldCountriesCache = await fetchWorldCountries(); }
    catch (err) { editorBgG.select('#editor-loading-txt').text('⚠️ ' + err.message); return; }
    drawProvinceFeatures(worldCountriesCache);
    return;
  }

  // Средне/Мелко — субрегионы Европы через NUTS (NUTS1 для ур.2, NUTS2 для ур.3).
  // Области/штаты остального мира — отдельным слоем (кнопка «Показать области/штаты мира»).
  const nutsLevel = level === 2 ? 1 : 2;
  if (nutsLevelCache[nutsLevel]) { drawProvinceFeatures(nutsLevelCache[nutsLevel]); return; }
  showEditorLoadingText(`⏳ Загрузка субрегионов Европы (уровень ${level})...`);
  try { nutsLevelCache[nutsLevel] = await fetchNutsLevel(nutsLevel); }
  catch (err) { editorBgG.select('#editor-loading-txt').text('⚠️ Не удалось загрузить: ' + err.message); return; }
  drawProvinceFeatures(nutsLevelCache[nutsLevel]);
}

// ============================================================
// ОТДЕЛЬНЫЙ СЛОЙ: области/штаты всего мира (Natural Earth Admin-1). Включается/выключается
// кнопкой независимо от уровней Крупно/Средне/Мелко.
// ============================================================
let admin1Showing = false;

// Promise-обёртка над загрузкой Natural Earth Admin-1 (штаты/области мира) с перебором источников
// и кэшем на сессию. Источник — официальный репозиторий Natural Earth (nvkelso), 50m-версия.
function fetchAdmin1Features(i) {
  i = i || 0;
  if (neAdmin1Cache) return Promise.resolve(neAdmin1Cache.features);
  if (i >= ADMIN1_SOURCES.length) return Promise.reject(new Error('Admin-1 недоступен ни с одного источника'));
  return d3.json(ADMIN1_SOURCES[i]).then(data => {
    if (!data || !Array.isArray(data.features) || data.features.length < 50) {
      throw new Error('Получено мало объектов (' + (data && data.features ? data.features.length : 0) + ')');
    }
    neAdmin1Cache = data;
    return data.features;
  }).catch(err => {
    console.warn('Admin-1 источник ' + (i + 1) + ' не сработал:', err.message);
    return fetchAdmin1Features(i + 1);
  });
}

async function toggleWorldAdmin1() {
  const btn = document.getElementById('admin1-toggle-btn');
  if (admin1Showing) {
    // выключаем — возвращаемся к уровню, который был активен
    admin1Showing = false;
    btn.classList.remove('active');
    switchNutsLevel(activeNutsOverrideLevel || 1);
    return;
  }
  showEditorLoadingText('⏳ Загрузка областей/штатов мира (Natural Earth Admin-1)...');
  let feats;
  try { feats = await fetchAdmin1Features(); }
  catch (err) { editorBgG.select('#editor-loading-txt').text('⚠️ Не удалось загрузить: ' + err.message); return; }
  admin1Showing = true;
  btn.classList.add('active');
  ['1', '2', '3'].forEach(l => document.getElementById('nuts-lvl-' + l + '-btn').classList.remove('active'));
  drawProvinceFeatures(feats);
}

// ============================================================
// ОБЪЕДИНЕНИЕ НЕСКОЛЬКИХ ПРОВИНЦИЙ В ОДНУ (склейка через turf.js)
// Нужно, когда границы из статистики нарезаны "как попало" относительно того, что игроку
// нужно как единая провинция — например, объединить два соседних мелких куска NUTS3 в один
// осмысленный регион, или склеить полосу вдоль границы двух стран в одну историческую область.
// ============================================================
let selectedProvinceIds = new Set();

// Режим выделения кликом прямо по карте — быстрее, чем искать провинцию в списке галочками.
// Включили → клик по провинции на карте добавляет/убирает её из выделения (обычный импорт
// в это время не срабатывает). Выключили → клики снова импортируют/рисуют как обычно.
let selectionMode = false;
function toggleSelectionMode(checked) {
  selectionMode = checked;
  renderMapProvinces();
}

// ============================================================
// ИСТОРИЯ ИЗМЕНЕНИЙ (Undo) — снимок mapProvinces перед каждым изменением,
// чтобы случайный клик/импорт можно было откатить как в редакторах.
// ============================================================
let mapHistory = [];
function pushHistory() {
  mapHistory.push(JSON.stringify(mapProvinces));
  if (mapHistory.length > 30) mapHistory.shift(); // не копим бесконечно
  updateUndoButton();
}
function undoLastChange() {
  if (mapHistory.length === 0) return;
  mapProvinces = JSON.parse(mapHistory.pop());
  selectedProvinceIds.clear();
  updateUndoButton();
  updateMergeButtonState();
  renderMapProvinces();
  renderEditorProvinceList();
  buildSnapIndex();
  showNotif('↩ Отменено');
}
function updateUndoButton() {
  const btn = document.getElementById('undo-btn');
  if (btn) btn.disabled = mapHistory.length === 0;
}

// ============================================================
// ЗАЩИТА ОТ НАЛОЖЕНИЯ: две провинции не должны перекрывать друг друга.
// Определяем пересечение геометрически по центроидам (без turf) — надёжно ловит
// случай «крупная область поверх мелких» и наоборот.
// ============================================================
function geoFeatureOf(p) { return { type: 'Feature', geometry: p.geometry }; }

// Геометрия провинции в географических координатах: у импортированных она уже есть,
// у нарисованных вручную (экранные точки) — переводим обратно через editorProj.invert().
function provinceToGeometry(p) {
  if (p.geometry) return p.geometry;
  if (p.points && p.points.length >= 3) {
    const ring = p.points.map(pt => editorProj.invert(pt)).filter(Boolean);
    if (ring.length < 3) return null;
    ring.push(ring[0]);
    return { type: 'Polygon', coordinates: [ring] };
  }
  return null;
}

// Обрезать геометрию по границам перечисленных провинций (вырезать их из неё) — turf.difference.
// Нужно, чтобы крупная область (Франция) упиралась в уже выбранные мелкие куски, а не ложилась поверх.
function clipGeometryAgainst(geometry, overlapIds) {
  let result = turf.feature(geometry);
  for (const id of overlapIds) {
    const p = mapProvinces.find(x => x.id === id);
    if (!p) continue;
    const pg = provinceToGeometry(p);
    if (!pg) continue;
    try {
      const diff = turf.difference(result, turf.feature(pg));
      result = diff; // может стать null, если область полностью вырезана
    } catch (e) { /* сложная геометрия — пропускаем этот кусок */ }
    if (!result) break;
  }
  return result ? result.geometry : null;
}

function findOverlappingProvinces(feature) {
  const out = [];
  let fCentroid;
  try { fCentroid = d3.geoCentroid(feature); } catch (e) { return out; }
  mapProvinces.forEach(p => {
    if (!p.geometry) return; // нарисованные вручную (экранные точки) не проверяем
    const pf = geoFeatureOf(p);
    let overlap = false;
    try {
      const pC = d3.geoCentroid(pf);
      overlap = d3.geoContains(feature, pC) || d3.geoContains(pf, fCentroid);
    } catch (e) { /* битая геометрия — пропускаем */ }
    if (overlap) out.push(p.id);
  });
  return out;
}

function toggleProvinceSelection(id, checked) {
  if (checked) selectedProvinceIds.add(id); else selectedProvinceIds.delete(id);
  updateMergeButtonState();
  renderMapProvinces(); // подсветить/снять подсветку на самой карте
}

function updateMergeButtonState() {
  const n = selectedProvinceIds.size;
  document.getElementById('merge-selected-count').textContent = n;
  document.getElementById('merge-selected-btn').style.display = n >= 2 ? 'block' : 'none';
  const clr = document.getElementById('clear-sel-btn');
  const del = document.getElementById('delete-sel-btn');
  if (clr) { clr.style.display = n >= 1 ? 'block' : 'none'; document.getElementById('sel-count').textContent = n; }
  if (del) { del.style.display = n >= 1 ? 'block' : 'none'; document.getElementById('del-count').textContent = n; }
}

function clearSelection() {
  selectedProvinceIds.clear();
  updateMergeButtonState();
  renderEditorProvinceList();
  renderMapProvinces();
}

function deleteSelectedProvinces() {
  if (selectedProvinceIds.size === 0) return;
  if (!confirm(`Удалить выбранные провинции (${selectedProvinceIds.size} шт.)?`)) return;
  pushHistory();
  const ids = new Set(selectedProvinceIds);
  mapProvinces = mapProvinces.filter(p => !ids.has(p.id));
  selectedProvinceIds.clear();
  updateMergeButtonState();
  renderEditorProvinceList();
  renderMapProvinces();
  buildSnapIndex();
  showNotif('🗑 Удалено провинций: ' + ids.size);
}

async function mergeSelectedProvinces() {
  const ids = Array.from(selectedProvinceIds);
  if (ids.length < 2) return;
  const provinces = ids.map(id => mapProvinces.find(p => p.id === id)).filter(Boolean);
  if (provinces.length < 2) return;

  const withoutGeometry = provinces.filter(p => !p.geometry && !(p.points && p.points.length >= 3));
  if (withoutGeometry.length) {
    showNotif('⚠️ Не удалось объединить: у некоторых выбранных провинций нет корректных границ');
    return;
  }

  showNotif('⏳ Загружаю инструмент склейки (turf.js)...');
  try {
    await ensureTurfLoaded();
  } catch (err) {
    showNotif('⚠️ ' + err.message);
    return;
  }

  // Провинции, нарисованные вручную (точки в экранных координатах), для turf.js нужно
  // сперва превратить в geo-геометрию (turf работает с географическими координатами,
  // а не с пикселями холста) — переводим через editorProj.invert().
  function toGeoJsonGeometry(p) {
    if (p.geometry) return p.geometry;
    const ring = p.points.map(pt => editorProj.invert(pt)).filter(Boolean);
    ring.push(ring[0]);
    return { type: 'Polygon', coordinates: [ring] };
  }

  let merged;
  try {
    merged = turf.feature(toGeoJsonGeometry(provinces[0]));
    for (let i = 1; i < provinces.length; i++) {
      const next = turf.feature(toGeoJsonGeometry(provinces[i]));
      merged = turf.union(merged, next);
      if (!merged) throw new Error('turf.union вернул пустой результат');
    }
  } catch (err) {
    showNotif('⚠️ Не удалось объединить границы: ' + err.message);
    return;
  }

  const name = prompt('Название объединённой провинции:', provinces[0].name);
  if (!name) return;

  const newId = 'merged_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  pushHistory();
  mapProvinces = mapProvinces.filter(p => !ids.includes(p.id));
  mapProvinces.push({ id: newId, name: name.trim(), geometry: merged.geometry });

  selectedProvinceIds.clear();
  updateMergeButtonState();
  renderMapProvinces();
  renderEditorProvinceList();
  buildSnapIndex();
  showNotif('✅ Объединено провинций: ' + provinces.length + ' → «' + name.trim() + '»');
}

// Источник областей/штатов мира — официальный репозиторий Natural Earth (nvkelso), версия 50m
// (полное покрытие мира: штаты США, области России, провинции и т.д.). Перебор нескольких CDN.
const ADMIN1_SOURCES = [
  'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_admin_1_states_provinces.geojson',
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson',
  'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_10m_admin_1_states_provinces.geojson',
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson'
];

function fetchAdmin1Data(sourceIndex) {
  sourceIndex = sourceIndex || 0;
  if (sourceIndex >= ADMIN1_SOURCES.length) {
    editorBgG.select('#editor-loading-txt')
      .text('⚠️ Не удалось загрузить ни с одного источника.')
      .append('tspan').attr('x', 480).attr('dy', 16).text('Нажмите, чтобы попробовать снова.');
    editorBgG.select('#editor-loading-txt').style('cursor', 'pointer').on('click', () => fetchAdmin1Data(0));
    return;
  }

  editorBgG.select('#editor-loading-txt').text(`⏳ Загрузка провинций (источник ${sourceIndex + 1}/${ADMIN1_SOURCES.length})...`);

  d3.json(ADMIN1_SOURCES[sourceIndex])
    .then(data => {
      // Важно: у этого источника подробное деление есть лишь для ограниченного набора крупных
      // стран (реально около 294 объектов на весь мир, не тысячи) — это не ошибка загрузки,
      // а особенность самого датасета. Порог тут — просто защита от совсем пустого/битого ответа.
      if (!data || !Array.isArray(data.features) || data.features.length < 50) {
        throw new Error('Получено ' + (data && data.features ? data.features.length : 0) + ' объектов — подозрительно мало');
      }
      neAdmin1Cache = data; // кэшируем в памяти на всю сессию — повторно грузить не будем
      editorBgG.select('#editor-loading-txt').remove();
      drawProvinceFeatures(data.features);
    })
    .catch(err => {
      console.warn('Источник ' + (sourceIndex + 1) + ' не сработал:', err.message);
      fetchAdmin1Data(sourceIndex + 1); // пробуем следующий источник
    });
}

// У этого экспортированного файла почти в каждом объекте случайно приклеено лишнее кольцо —
// контур ВСЕЙ проекции мира целиком (артефакт экспорта mapshaper). Оно у всех объектов одинаковое,
// поэтому при наложении тысяч копий друг на друга получается один сплошной "блин" вместо стран.
// Вырезаем такие аномально огромные кольца (шире 700 и выше 400 из полного холста 960×560).
function stripFrameArtifactRings(geometry) {
  if (!geometry) return geometry;
  function ringBBox(ring) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of ring) {
      const p = editorProj(c);
      if (!p) continue;
      if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
    }
    return { w: maxX - minX, h: maxY - minY };
  }
  function ringIsFrameArtifact(ring) {
    const b = ringBBox(ring);
    return b.w > 700 && b.h > 400;
  }
  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates.filter(r => !ringIsFrameArtifact(r));
    return rings.length ? { type: 'Polygon', coordinates: rings } : null;
  }
  if (geometry.type === 'MultiPolygon') {
    const polys = geometry.coordinates
      .map(poly => poly.filter(r => !ringIsFrameArtifact(r)))
      .filter(poly => poly.length > 0);
    if (polys.length === 0) return null;
    return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
  }
  return geometry;
}

function drawProvinceFeatures(rawFeatures) {
  editorBgG.select('#editor-loading-txt').remove(); // убираем текст загрузки, когда данные пришли
  const features = rawFeatures
    .map(f => ({ ...f, geometry: stripFrameArtifactRings(f.geometry) }))
    .filter(f => f.geometry);
  console.log('[DEBUG] после вырезания рамки-артефакта осталось объектов =', features.length, '(было', rawFeatures.length, ')');

  // Отбрасываем объекты с геометрией, которую движок не может отрисовать (пустой/битый path) —
  // иначе они молча пропадают с карты без предупреждения, из-за чего казалось, что "куски карты" исчезли.
  const valid = features.filter(f => {
    const d = editorPathGen(f);
    return d && d.length > 0;
  });
  const skipped = features.length - valid.length;
  currentBgFeatures = valid;
  console.log('[DEBUG] валидных объектов после фильтра =', valid.length, ', пропущено =', skipped);

  editorBgG.selectAll('path').remove();
  editorBgG.selectAll('path')
    .data(valid)
    .join('path')
    .attr('d', editorPathGen)
    .attr('fill', '#e8e4dc')
    .attr('stroke', '#999')
    .attr('stroke-width', 0.2)
    .attr('pointer-events', 'none');

  console.log('[DEBUG] реально нарисовано <path> элементов =', editorBgG.selectAll('path').size());

  // Найдём объект с САМЫМ большим "экранным" контуром среди оставшихся — если после чистки
  // рамки блин всё ещё виден, значит есть ЕЩЁ такой же по смыслу артефакт, просто чуть меньше порога.
  let biggest = null, biggestArea = -1;
  valid.forEach(f => {
    const b = editorPathGen.bounds(f);
    if (!b) return;
    const area = (b[1][0] - b[0][0]) * (b[1][1] - b[0][1]);
    if (area > biggestArea) { biggestArea = area; biggest = f; }
  });
  if (biggest) {
    const b = editorPathGen.bounds(biggest);
    console.log('[DEBUG] САМЫЙ большой объект на карте:', (biggest.properties && biggest.properties.name), 'bbox ширина/высота =', (b[1][0]-b[0][0]).toFixed(0), (b[1][1]-b[0][1]).toFixed(0));
  }

  buildSnapIndex();
  showNotif(`🗺️ Загружено регионов: ${valid.length}` + (skipped ? ` (пропущено битых: ${skipped})` : ''));
}

// ============================================================
// Режим рисования: точки / карандаш
// ============================================================
function setDrawMode(mode) {
  drawMode = mode;
  document.getElementById('mode-point-btn').classList.toggle('active', mode === 'point');
  document.getElementById('mode-pencil-btn').classList.toggle('active', mode === 'pencil');
}

function startDrawingProvince() {
  editorDrawing = true;
  editorPoints = [];
  buildSnapIndex();
  document.getElementById('editor-draw-status').style.display = 'block';
  document.getElementById('editor-point-count').textContent = '0';
  document.getElementById('editor-new-btn').style.display = 'none';
  document.getElementById('editor-finish-btn').style.display = 'block';
  document.getElementById('editor-cancel-btn').style.display = 'block';
  updateDrawPreview();
}

function cancelDrawingProvince() {
  editorDrawing = false;
  pencilActive = false;
  editorPoints = [];
  const statusEl = document.getElementById('editor-draw-status');
  if (statusEl) statusEl.style.display = 'none';
  const newBtn = document.getElementById('editor-new-btn');
  if (newBtn) newBtn.style.display = 'block';
  const finishBtn = document.getElementById('editor-finish-btn');
  if (finishBtn) finishBtn.style.display = 'none';
  const cancelBtn = document.getElementById('editor-cancel-btn');
  if (cancelBtn) cancelBtn.style.display = 'none';
  editorDrawG.select('.draw-preview').remove();
  editorDrawG.selectAll('.draw-vertex').remove();
}

function finishDrawingProvince() {
  if (editorPoints.length < 3) {
    showNotif('⚠️ Нужно минимум 3 точки для провинции');
    return;
  }
  document.getElementById('eform-name').value = '';
  document.getElementById('editor-save-form').style.display = 'block';
}

function saveDrawnProvince() {
  const name = document.getElementById('eform-name').value.trim();
  if (!name) { showNotif('⚠️ Введите название провинции'); return; }

  const id = 'prov_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  pushHistory();
  mapProvinces.push({ id, name, points: editorPoints.slice() });

  document.getElementById('editor-save-form').style.display = 'none';
  cancelDrawingProvince();
  renderEditorProvinceList();
  renderMapProvinces();
  showNotif('✅ Провинция добавлена: ' + name);
}

function discardDrawnProvince() {
  document.getElementById('editor-save-form').style.display = 'none';
}

// ---- Координаты мыши → координаты editor-svg (учитывает текущий зум/пан холста) ----
function editorMouseCoords(e) {
  const rect = editorSvgEl.getBoundingClientRect();
  const scale = edVb.w / rect.width;
  const x = edVb.x + (e.clientX - rect.left) * scale;
  const y = edVb.y + (e.clientY - rect.top) * scale;
  return [x, y];
}

// Режим "Точки": клик добавляет вершину (с прилипанием к соседним границам)
editorSvgEl.addEventListener('click', function(e) {
  if (!editorDrawing || drawMode !== 'point') return;
  const xy = snapPoint(editorMouseCoords(e));
  editorPoints.push(xy);
  document.getElementById('editor-point-count').textContent = editorPoints.length;
  updateDrawPreview();
});

editorSvgEl.addEventListener('dblclick', function(e) {
  if (!editorDrawing || drawMode !== 'point') return;
  e.preventDefault();
  finishDrawingProvince();
});

// Панорамирование холста (перетаскивание) — только когда НЕ идёт рисование
editorSvgEl.addEventListener('mousedown', function(e) {
  if (editorDrawing) return; // во время рисования перетаскивание отключено, чтобы не мешать карандашу/точкам
  edPanning = true;
  edDidPan = false;
  edPanStart = { x: e.clientX, y: e.clientY };
});
window.addEventListener('mousemove', function(e) {
  if (!edPanning) return;
  if (Math.hypot(e.clientX - edPanStart.x, e.clientY - edPanStart.y) > 3) edDidPan = true;
  const rect = editorSvgEl.getBoundingClientRect();
  const scale = edVb.w / rect.width;
  edVb.x -= (e.clientX - edPanStart.x) * scale;
  edVb.y -= (e.clientY - edPanStart.y) * scale;
  edPanStart = { x: e.clientX, y: e.clientY };
  applyEditorViewBox();
});
window.addEventListener('mouseup', function() {
  edPanning = false;
});

// ============================================================
// ИМПОРТ ГОТОВЫХ ГРАНИЦ КАК РЕАЛЬНЫХ ПРОВИНЦИЙ
// Границы, которые видно на фоне (страны/Natural Earth), — не рисунок, а реальные фигуры.
// Клик по такой области (вне режима рисования) сразу превращает её в провинцию со своими границами.
// ============================================================

function featureId(f) {
  const p = f.properties || {};
  // p.na/f.id — формат NUTS (Eurostat), остальное — формат Natural Earth
  return 'imp_' + (p.adm1_code || p.iso_3166_2 || f.id || p.id || ((p.name || p.na || 'x') + '_' + (p.adm0_a3 || '')));
}
function featureName(f) {
  const p = f.properties || {};
  return p.name || p.NAME || p.name_en || p.admin || p.na || 'Без названия';
}

// Как и основная карта игры (map.js), храним у импортированных провинций ПОЛНУЮ geo-геометрию
// (в градусах, как в исходном GeoJSON) и рисуем её через editorPathGen — d3 сам корректно
// рисует "разрывные" фигуры (Россия, Аляска — из нескольких кусков через 180° долготы),
// без ручной склейки в одну линию, которая раньше ломала контур.
function importFeatureAsProvince(f) {
  const fid = featureId(f);
  if (mapProvinces.some(p => p.id === fid)) return 'dup';
  if (!f.geometry) return 'small';
  mapProvinces.push({ id: fid, name: featureName(f), geometry: f.geometry });
  return 'ok';
}

// Ищем объект под курсором через реальную отрисованную геометрию SVG (isPointInFill) —
// надёжнее, чем обратное проецирование координат, которое сильно врёт возле полюсов
// (поэтому Канада/Россия/северные страны не находились кликом).
function findFeatureAt(xy) {
  const paths = editorBgG.selectAll('path').nodes();
  if (!paths.length) return null;
  const pt = editorSvgEl.createSVGPoint();
  pt.x = xy[0]; pt.y = xy[1];
  for (let i = 0; i < paths.length; i++) {
    try {
      if (paths[i].isPointInFill(pt)) return currentBgFeatures[i];
    } catch (e) { /* браузер без поддержки isPointInFill для этого узла — пропускаем */ }
  }
  return null;
}

function afterImportRefresh(name) {
  renderMapProvinces();
  renderEditorProvinceList();
  buildSnapIndex();
  showNotif('✅ Импортировано: ' + name);
}

async function tryImportFeatureAt(xy) {
  if (!currentBgFeatures.length) return;
  const feature = findFeatureAt(xy);
  if (!feature) { showNotif('⚠️ Здесь нет готовой границы для импорта'); return; }

  if (mapProvinces.some(p => p.id === featureId(feature))) {
    showNotif('ℹ️ Эта провинция уже импортирована — редактируйте её в списке слева'); return;
  }
  if (!feature.geometry) { showNotif('⚠️ Не удалось получить границы этой области'); return; }

  const name = featureName(feature);
  const overlaps = findOverlappingProvinces(feature);

  // Нет пересечений — просто добавляем.
  if (!overlaps.length) {
    pushHistory();
    mapProvinces.push({ id: featureId(feature), name, geometry: feature.geometry });
    afterImportRefresh(name);
    return;
  }

  // Есть пересечение — предлагаем три варианта:
  //   OK на 1-м окне  → ОБРЕЗАТЬ новую область по границам мелких (мелкие остаются)
  //   OK на 2-м окне  → ЗАМЕНИТЬ мелкие целиком этой крупной областью
  //   Отмена оба раза → ничего не делать
  const clip = confirm(`Эта область пересекается с уже добавленными провинциями (${overlaps.length} шт.).\n\nOK — ОБРЕЗАТЬ новую область по их границам (мелкие останутся на месте, крупная упрётся в них).\nОтмена — другой вариант...`);
  if (clip) {
    showNotif('⏳ Обрезаю границы (turf.js)...');
    let geom;
    try {
      await ensureTurfLoaded();
      geom = clipGeometryAgainst(feature.geometry, overlaps);
    } catch (err) { showNotif('⚠️ ' + err.message); return; }
    if (!geom) { showNotif('⚠️ После обрезки от области ничего не осталось (она целиком внутри других провинций)'); return; }
    pushHistory();
    mapProvinces.push({ id: featureId(feature), name, geometry: geom });
    afterImportRefresh(name);
    return;
  }

  const replace = confirm(`Заменить эти ${overlaps.length} провинций новой областью целиком?\n\nOK — заменить (мелкие удалятся).\nОтмена — ничего не делать.`);
  if (!replace) return;
  pushHistory();
  mapProvinces = mapProvinces.filter(p => !overlaps.includes(p.id));
  mapProvinces.push({ id: featureId(feature), name, geometry: feature.geometry });
  afterImportRefresh(name);
}

// Клик по фону вне режима рисования — импортировать область под курсором как провинцию
editorSvgEl.addEventListener('click', function(e) {
  if (editorDrawing) return;
  if (edDidPan) { edDidPan = false; return; } // это было перетаскивание карты, а не клик
  if (currentMapTemplate === 'blank') return;
  tryImportFeatureAt(editorMouseCoords(e));
});

// Импортировать разом все области, попадающие в текущий видимый кусок карты
function importVisibleFeatures() {
  if (!currentBgFeatures.length) { showNotif('⚠️ Нет фоновой карты для импорта'); return; }
  const checkOverlap = mapProvinces.length > 0; // на пустой карте проверять нечего
  let count = 0, skippedOverlap = 0;
  pushHistory();
  currentBgFeatures.forEach(f => {
    if (mapProvinces.some(p => p.id === featureId(f))) return;
    const bounds = d3.geoBounds(f);
    const c1 = editorProj(bounds[0]), c2 = editorProj(bounds[1]);
    if (!c1 || !c2) return;
    const fx0 = Math.min(c1[0], c2[0]), fx1 = Math.max(c1[0], c2[0]);
    const fy0 = Math.min(c1[1], c2[1]), fy1 = Math.max(c1[1], c2[1]);
    if (fx1 < edVb.x || fx0 > edVb.x + edVb.w || fy1 < edVb.y || fy0 > edVb.y + edVb.h) return;
    if (checkOverlap && findOverlappingProvinces(f).length) { skippedOverlap++; return; }
    const r = importFeatureAsProvince(f);
    if (r === 'ok') count++;
  });
  if (count === 0) mapHistory.pop(); // ничего не добавили — незачем засорять историю
  updateUndoButton();
  renderMapProvinces();
  renderEditorProvinceList();
  buildSnapIndex();
  showNotif(count > 0 ? `✅ Импортировано провинций: ${count}${skippedOverlap ? ' (пропущено пересекающихся: ' + skippedOverlap + ')' : ''}` : 'ℹ️ Нечего импортировать (или всё пересекается с уже добавленным)');
}

// Форкнуть карту целиком: скопировать ВСЕ регионы источника (не только видимые) в текущую карту.
// Подходит для рабочего процесса «взял готовую карту → правлю прямо в ней → сохраняю как новую версию».
function importWholeMapFork() {
  if (!currentBgFeatures.length) { showNotif('⚠️ Нет фоновой карты для импорта'); return; }
  if (!confirm(`Импортировать все ${currentBgFeatures.length} регионов источника как провинции? Это может занять время.`)) return;
  const checkOverlap = mapProvinces.length > 0;
  let count = 0, skippedOverlap = 0;
  pushHistory();
  currentBgFeatures.forEach(f => {
    if (checkOverlap && findOverlappingProvinces(f).length) { skippedOverlap++; return; }
    const r = importFeatureAsProvince(f);
    if (r === 'ok') count++;
  });
  if (count === 0) mapHistory.pop();
  updateUndoButton();
  renderMapProvinces();
  renderEditorProvinceList();
  buildSnapIndex();
  showNotif(`✅ Карта форкнута: ${count} провинций${skippedOverlap ? ', пропущено пересекающихся: ' + skippedOverlap : ''}`);
}

// Режим "Карандаш": зажать и вести мышь — рисуется непрерывная линия (тоже липнет к границам)
editorSvgEl.addEventListener('mousedown', function(e) {
  if (!editorDrawing || drawMode !== 'pencil') return;
  pencilActive = true;
  const xy = snapPoint(editorMouseCoords(e));
  editorPoints.push(xy);
  document.getElementById('editor-point-count').textContent = editorPoints.length;
  updateDrawPreview();
});
editorSvgEl.addEventListener('mousemove', function(e) {
  if (!editorDrawing || drawMode !== 'pencil' || !pencilActive) return;
  const raw = editorMouseCoords(e);
  const last = editorPoints[editorPoints.length - 1];
  if (last && Math.hypot(raw[0] - last[0], raw[1] - last[1]) < 4) return; // не копим лишние точки
  const xy = snapPoint(raw);
  editorPoints.push(xy);
  document.getElementById('editor-point-count').textContent = editorPoints.length;
  updateDrawPreview();
});
window.addEventListener('mouseup', function() {
  if (drawMode === 'pencil') pencilActive = false;
});

function updateDrawPreview() {
  editorDrawG.select('.draw-preview').remove();
  editorDrawG.selectAll('.draw-vertex').remove();
  if (editorPoints.length === 0) return;

  const zoom = 960 / edVb.w; // компенсация зума — толщина линии и точки одинаковы на экране на любом приближении
  const d = 'M' + editorPoints.map(p => p.join(',')).join('L') + (editorPoints.length > 2 ? 'Z' : '');
  editorDrawG.append('path')
    .attr('class', 'draw-preview')
    .attr('d', d)
    .attr('fill', 'rgba(0,0,0,0.08)')
    .attr('stroke', '#111')
    .attr('stroke-width', strokeWidth / zoom)
    .attr('stroke-dasharray', drawMode === 'point' ? (3 / zoom) + ',' + (2 / zoom) : 'none');

  if (drawMode === 'point') {
    editorPoints.forEach(p => {
      editorDrawG.append('circle')
        .attr('class', 'draw-vertex')
        .attr('cx', p[0]).attr('cy', p[1])
        .attr('r', (strokeWidth + 1.6) / zoom)
        .attr('fill', '#111');
    });
  }
}

// ============================================================
// Отрисовка провинций текущей карты (белая карта — все провинции одинаковые, без стран)
// ============================================================
function renderMapProvinces() {
  editorDrawG.selectAll('.map-prov').remove();
  mapProvinces.forEach(p => {
    let d, cx, cy;

    if (p.geometry) {
      // Импортированная провинция — полная geo-геометрия, рисуем через d3 (корректно обрабатывает
      // многочастные фигуры вроде России/Аляски, разорванные через 180° долготы)
      const feature = { type: 'Feature', geometry: p.geometry };
      d = editorPathGen(feature);
      if (!d) return;
      const c = editorPathGen.centroid(feature);
      cx = c[0]; cy = c[1];
    } else if (p.points && p.points.length >= 3) {
      // Нарисованная вручную провинция — простой многоугольник в экранных координатах
      d = 'M' + p.points.map(pt => pt.join(',')).join('L') + 'Z';
      cx = p.points.reduce((s, pt) => s + pt[0], 0) / p.points.length;
      cy = p.points.reduce((s, pt) => s + pt[1], 0) / p.points.length;
    } else {
      return;
    }

    const isSelected = selectedProvinceIds.has(p.id);
    editorDrawG.insert('path', '.draw-preview')
      .attr('class', 'map-prov')
      .attr('data-prov-id', p.id)
      .attr('d', d)
      .attr('fill', isSelected ? 'rgba(200,40,40,0.45)' : '#e8e4dc')
      .attr('stroke', isSelected ? '#c02020' : '#555')
      .attr('stroke-width', isSelected ? strokeWidth + 1 : strokeWidth)
      .style('cursor', selectionMode ? 'pointer' : 'default')
      .on('click', function(e) {
        if (!selectionMode) return;
        e.stopPropagation();
        toggleProvinceSelection(p.id, !selectedProvinceIds.has(p.id));
        renderMapProvinces();
        renderEditorProvinceList();
      });

    if (!showProvinceLabels) return;
    editorDrawG.insert('text', '.draw-preview')
      .attr('class', 'map-prov')
      .attr('x', cx).attr('y', cy)
      .attr('text-anchor', 'middle')
      .attr('font-size', 8 * provinceLabelScale).attr('fill', '#222')
      .attr('font-family', 'Georgia,serif')
      .attr('pointer-events', 'none')
      .text(p.name);
  });
}

// ============================================================
// Список провинций текущей карты (только имя — переименовать/удалить)
// ============================================================
function renderEditorProvinceList() {
  const list = document.getElementById('editor-province-list');
  if (mapProvinces.length === 0) {
    list.innerHTML = '<div class="chg-empty">Провинций пока нет</div>';
    return;
  }
  list.innerHTML = mapProvinces.map(p => `
    <div class="eprov-item">
      <label style="display:flex;align-items:center;gap:5px;flex:1;cursor:pointer">
        <input type="checkbox" ${selectedProvinceIds.has(p.id) ? 'checked' : ''} onchange="toggleProvinceSelection('${p.id}', this.checked)">
        <span class="eprov-name">${p.name}</span>
      </label>
      <div class="eprov-actions">
        <button onclick="renameMapProvince('${p.id}')">✏️</button>
        <button onclick="deleteMapProvince('${p.id}')">🗑</button>
      </div>
    </div>
  `).join('');
}

function renameMapProvince(id) {
  const p = mapProvinces.find(x => x.id === id);
  if (!p) return;
  const name = prompt('Новое название провинции:', p.name);
  if (!name) return;
  pushHistory();
  p.name = name.trim();
  renderEditorProvinceList();
  renderMapProvinces();
}

function deleteMapProvince(id) {
  if (!confirm('Удалить эту провинцию?')) return;
  pushHistory();
  mapProvinces = mapProvinces.filter(p => p.id !== id);
  selectedProvinceIds.delete(id);
  updateMergeButtonState();
  renderEditorProvinceList();
  renderMapProvinces();
  buildSnapIndex();
}

// ============================================================
// Сохранение карты (создаёт новую запись в списке карт редактора)
// ============================================================
function promptSaveMap() {
  document.getElementById('emap-name').value = currentMapId
    ? (getMapsIndex().find(m => m.id === currentMapId) || {}).name || ''
    : '';
  document.getElementById('editor-map-name-form').style.display = 'block';
}

function confirmSaveMap() {
  const name = document.getElementById('emap-name').value.trim();
  if (!name) { showNotif('⚠️ Введите название карты'); return; }

  if (!currentMapId) currentMapId = 'map_' + Date.now().toString(36);

  localStorage.setItem(mapDataKey(currentMapId), JSON.stringify({ provinces: mapProvinces }));

  const idx = getMapsIndex();
  const existing = idx.find(m => m.id === currentMapId);
  if (existing) {
    existing.name = name;
    existing.provinceCount = mapProvinces.length;
  } else {
    idx.push({ id: currentMapId, name, provinceCount: mapProvinces.length });
  }
  saveMapsIndex(idx);

  document.getElementById('editor-map-name-form').style.display = 'none';
  showNotif('💾 Карта сохранена: ' + name);
}
