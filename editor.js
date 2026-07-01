// ============================================================
// EDITOR.JS — редактор сценариев: полностью отдельная песочница
// ============================================================
// Свой собственный <svg id="editor-svg">, не связан с игровой картой — изменения тут
// НИКАК не влияют на игру. Провинции — просто фигуры с именем, без привязки к странам.

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
}

// Основной источник — файл, лежащий прямо в репозитории игры (10m, полное покрытие стран,
// упрощённый через mapshaper). Никаких внешних зеркал — грузится с того же сайта, что и игра.
// Внешние источники оставлены запасным вариантом на случай, если локальный файл вдруг уберут.
const ADMIN1_SOURCES = [
  'admin1.geojson.json',
  'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_admin_1_states_provinces.geojson',
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson'
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

function drawProvinceFeatures(features) {
  // Отбрасываем объекты с геометрией, которую движок не может отрисовать (пустой/битый path) —
  // иначе они молча пропадают с карты без предупреждения, из-за чего казалось, что "куски карты" исчезли.
  const valid = features.filter(f => {
    const d = editorPathGen(f);
    return d && d.length > 0;
  });
  const skipped = features.length - valid.length;
  currentBgFeatures = valid;

  editorBgG.selectAll('path').remove();
  editorBgG.selectAll('path')
    .data(valid)
    .join('path')
    .attr('d', editorPathGen)
    .attr('fill', '#e8e4dc')
    .attr('stroke', '#999')
    .attr('stroke-width', 0.2)
    .attr('pointer-events', 'none');

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
  return 'imp_' + (p.adm1_code || p.iso_3166_2 || ((p.name || 'x') + '_' + (p.adm0_a3 || '')));
}
function featureName(f) {
  const p = f.properties || {};
  return p.name || p.NAME || p.name_en || p.admin || 'Без названия';
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

function tryImportFeatureAt(xy) {
  if (!currentBgFeatures.length) return;
  const feature = findFeatureAt(xy);
  if (!feature) { showNotif('⚠️ Здесь нет готовой границы для импорта'); return; }
  const result = importFeatureAsProvince(feature);
  if (result === 'dup') { showNotif('ℹ️ Эта провинция уже импортирована — редактируйте её в списке слева'); return; }
  if (result === 'dateline') { showNotif('⚠️ Область пересекает 180° долготы — контур повреждён, импорт пропущен'); return; }
  if (result === 'small') { showNotif('⚠️ Не удалось получить границы этой области'); return; }
  renderMapProvinces();
  renderEditorProvinceList();
  showNotif('✅ Импортировано: ' + featureName(feature));
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
  let count = 0, skipped = 0;
  currentBgFeatures.forEach(f => {
    if (mapProvinces.some(p => p.id === featureId(f))) return;
    const bounds = d3.geoBounds(f);
    const c1 = editorProj(bounds[0]), c2 = editorProj(bounds[1]);
    if (!c1 || !c2) return;
    const fx0 = Math.min(c1[0], c2[0]), fx1 = Math.max(c1[0], c2[0]);
    const fy0 = Math.min(c1[1], c2[1]), fy1 = Math.max(c1[1], c2[1]);
    if (fx1 < edVb.x || fx0 > edVb.x + edVb.w || fy1 < edVb.y || fy0 > edVb.y + edVb.h) return;
    const r = importFeatureAsProvince(f);
    if (r === 'ok') count++; else if (r === 'dateline') skipped++;
  });
  renderMapProvinces();
  renderEditorProvinceList();
  showNotif(count > 0 ? `✅ Импортировано провинций: ${count}${skipped ? ' (пропущено с разрывом: ' + skipped + ')' : ''}` : 'ℹ️ Нечего импортировать в этой области');
}

// Форкнуть карту целиком: скопировать ВСЕ регионы источника (не только видимые) в текущую карту.
// Подходит для рабочего процесса «взял готовую карту → правлю прямо в ней → сохраняю как новую версию».
function importWholeMapFork() {
  if (!currentBgFeatures.length) { showNotif('⚠️ Нет фоновой карты для импорта'); return; }
  if (!confirm(`Импортировать все ${currentBgFeatures.length} регионов источника как провинции? Это может занять время.`)) return;
  let count = 0, skipped = 0;
  currentBgFeatures.forEach(f => {
    const r = importFeatureAsProvince(f);
    if (r === 'ok') count++; else if (r === 'dateline') skipped++;
  });
  renderMapProvinces();
  renderEditorProvinceList();
  showNotif(`✅ Карта форкнута: ${count} провинций${skipped ? ', пропущено с разрывом: ' + skipped : ''}`);
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

    editorDrawG.insert('path', '.draw-preview')
      .attr('class', 'map-prov')
      .attr('d', d)
      .attr('fill', '#e8e4dc')
      .attr('stroke', '#555')
      .attr('stroke-width', strokeWidth);

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
      <div class="eprov-name">${p.name}</div>
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
  p.name = name.trim();
  renderEditorProvinceList();
  renderMapProvinces();
}

function deleteMapProvince(id) {
  if (!confirm('Удалить эту провинцию?')) return;
  mapProvinces = mapProvinces.filter(p => p.id !== id);
  renderEditorProvinceList();
  renderMapProvinces();
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
