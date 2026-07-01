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

let currentMapId = null;       // null = новая несохранённая карта
let currentMapTemplate = null; // 'world' | 'blank'
let mapProvinces = [];         // [{id, name, points}]

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
  renderMapProvinces();
  renderEditorProvinceList();
}

// ============================================================
// Фон-подложка (только контуры, без стран/цветов/игровой логики)
// ============================================================
function renderBackground(template) {
  editorBgG.selectAll('*').remove();
  if (template !== 'world') return;
  d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then(world => {
    const countries = topojson.feature(world, world.objects.countries);
    editorBgG.selectAll('path')
      .data(countries.features)
      .join('path')
      .attr('d', editorPathGen)
      .attr('fill', '#eceee9')
      .attr('stroke', '#aaa')
      .attr('stroke-width', 0.4)
      .attr('pointer-events', 'none');
  });
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

// ---- Координаты мыши → координаты editor-svg (без пана/зума, поэтому точно совпадает с курсором) ----
function editorMouseCoords(e) {
  const rect = editorSvgEl.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (960 / rect.width);
  const y = (e.clientY - rect.top) * (560 / rect.height);
  return [x, y];
}

// Режим "Точки": клик добавляет вершину
editorSvgEl.addEventListener('click', function(e) {
  if (!editorDrawing || drawMode !== 'point') return;
  const xy = editorMouseCoords(e);
  editorPoints.push(xy);
  document.getElementById('editor-point-count').textContent = editorPoints.length;
  updateDrawPreview();
});

editorSvgEl.addEventListener('dblclick', function(e) {
  if (!editorDrawing || drawMode !== 'point') return;
  e.preventDefault();
  finishDrawingProvince();
});

// Режим "Карандаш": зажать и вести мышь — рисуется непрерывная линия
editorSvgEl.addEventListener('mousedown', function(e) {
  if (!editorDrawing || drawMode !== 'pencil') return;
  pencilActive = true;
  const xy = editorMouseCoords(e);
  editorPoints.push(xy);
  document.getElementById('editor-point-count').textContent = editorPoints.length;
  updateDrawPreview();
});
editorSvgEl.addEventListener('mousemove', function(e) {
  if (!editorDrawing || drawMode !== 'pencil' || !pencilActive) return;
  const xy = editorMouseCoords(e);
  const last = editorPoints[editorPoints.length - 1];
  if (last && Math.hypot(xy[0] - last[0], xy[1] - last[1]) < 4) return; // не копим лишние точки
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

  const d = 'M' + editorPoints.map(p => p.join(',')).join('L') + (editorPoints.length > 2 ? 'Z' : '');
  editorDrawG.append('path')
    .attr('class', 'draw-preview')
    .attr('d', d)
    .attr('fill', 'rgba(0,0,0,0.08)')
    .attr('stroke', '#111')
    .attr('stroke-width', 1.4)
    .attr('stroke-dasharray', drawMode === 'point' ? '3,2' : 'none');

  if (drawMode === 'point') {
    editorPoints.forEach(p => {
      editorDrawG.append('circle')
        .attr('class', 'draw-vertex')
        .attr('cx', p[0]).attr('cy', p[1])
        .attr('r', 2.6)
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
    if (!p.points || p.points.length < 3) return;
    const d = 'M' + p.points.map(pt => pt.join(',')).join('L') + 'Z';
    editorDrawG.insert('path', '.draw-preview')
      .attr('class', 'map-prov')
      .attr('d', d)
      .attr('fill', 'rgba(90,120,160,0.25)')
      .attr('stroke', '#2a3a5a')
      .attr('stroke-width', 1);

    const cx = p.points.reduce((s, pt) => s + pt[0], 0) / p.points.length;
    const cy = p.points.reduce((s, pt) => s + pt[1], 0) / p.points.length;
    editorDrawG.insert('text', '.draw-preview')
      .attr('class', 'map-prov')
      .attr('x', cx).attr('y', cy)
      .attr('text-anchor', 'middle')
      .attr('font-size', 8).attr('fill', '#222')
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
