// ============================================================
// EDITOR.JS — редактор сценариев: ручное рисование провинций
// ============================================================
// Базовый слой (побережья/страны) — тот же мировой атлас, что и в игре, служит только ориентиром.
// Провинции — собственные данные (полигоны, имя, ID, владелец), не завязаны на внешний источник,
// поэтому их можно свободно переприсваивать другим странам/сценариям.

const SCENARIO_KEY = 'gs1852_scenario_provinces';
const editorG = svg.select('#editor-g');

let editorActive = false;
let editorDrawing = false;
let editorPoints = [];       // [[x,y], ...] в координатах SVG (система проекции карты)
let scenarioProvinces = [];  // [{id, name, owner, points}]
let editingProvinceId = null;

function loadScenarioProvinces() {
  try {
    const raw = localStorage.getItem(SCENARIO_KEY);
    scenarioProvinces = raw ? JSON.parse(raw) : [];
  } catch (e) {
    scenarioProvinces = [];
  }
}

function saveScenarioProvinces() {
  localStorage.setItem(SCENARIO_KEY, JSON.stringify(scenarioProvinces));
}

// ---- Открыть / закрыть редактор ----
function openScenarioEditor() {
  loadScenarioProvinces();
  document.getElementById('main-menu').style.display = 'none';
  document.getElementById('editor-panel').style.display = 'flex';
  editorActive = true;
  renderEditorProvinceList();
  renderEditorProvinces();
}

function closeScenarioEditor() {
  cancelDrawingProvince();
  editorActive = false;
  document.getElementById('editor-panel').style.display = 'none';
  document.getElementById('main-menu').style.display = 'flex';
}

// ---- Инструмент рисования ----
function startDrawingProvince() {
  editorDrawing = true;
  editorPoints = [];
  editingProvinceId = null;
  document.getElementById('editor-draw-status').style.display = 'block';
  document.getElementById('editor-point-count').textContent = '0';
  document.getElementById('editor-new-btn').style.display = 'none';
  document.getElementById('editor-finish-btn').style.display = 'block';
  document.getElementById('editor-cancel-btn').style.display = 'block';
  updateDrawPreview();
}

function cancelDrawingProvince() {
  editorDrawing = false;
  editorPoints = [];
  document.getElementById('editor-draw-status').style.display = 'none';
  document.getElementById('editor-new-btn').style.display = 'block';
  document.getElementById('editor-finish-btn').style.display = 'none';
  document.getElementById('editor-cancel-btn').style.display = 'none';
  editorG.select('.draw-preview').remove();
  editorG.selectAll('.draw-vertex').remove();
}

function finishDrawingProvince() {
  if (editorPoints.length < 3) {
    showNotif('⚠️ Нужно минимум 3 точки для провинции');
    return;
  }
  document.getElementById('eform-name').value = '';
  document.getElementById('eform-owner').value = '';
  document.getElementById('editor-save-form').style.display = 'block';
}

function saveDrawnProvince() {
  const name = document.getElementById('eform-name').value.trim();
  const owner = document.getElementById('eform-owner').value.trim() || 'Не определено';
  if (!name) { showNotif('⚠️ Введите название провинции'); return; }

  const id = editingProvinceId || (
    name.toLowerCase().replace(/[^a-zа-я0-9]+/gi, '_').slice(0, 30) + '_' + Date.now().toString(36)
  );

  const existingIdx = scenarioProvinces.findIndex(p => p.id === id);
  const province = { id, name, owner, points: editorPoints.slice() };
  if (existingIdx > -1) scenarioProvinces[existingIdx] = province;
  else scenarioProvinces.push(province);

  saveScenarioProvinces();
  document.getElementById('editor-save-form').style.display = 'none';
  cancelDrawingProvince();
  renderEditorProvinceList();
  renderEditorProvinces();
  showNotif('💾 Провинция сохранена: ' + name);
}

function discardDrawnProvince() {
  document.getElementById('editor-save-form').style.display = 'none';
}

// ---- Обработка кликов по карте (перехват в режиме рисования) ----
function mouseToMapCoords(e) {
  const rect = mapWrap.getBoundingClientRect();
  const scale = vb.w / rect.width;
  const x = vb.x + (e.clientX - rect.left) * scale;
  const y = vb.y + (e.clientY - rect.top) * scale;
  return [x, y];
}

svgEl.addEventListener('click', function(e) {
  if (!editorActive || !editorDrawing) return;
  e.preventDefault();
  e.stopPropagation();
  const xy = mouseToMapCoords(e);
  editorPoints.push(xy);
  document.getElementById('editor-point-count').textContent = editorPoints.length;
  updateDrawPreview();
}, true);

svgEl.addEventListener('dblclick', function(e) {
  if (!editorActive || !editorDrawing) return;
  e.preventDefault();
  e.stopPropagation();
  finishDrawingProvince();
}, true);

function updateDrawPreview() {
  editorG.select('.draw-preview').remove();
  editorG.selectAll('.draw-vertex').remove();
  if (editorPoints.length === 0) return;

  const d = 'M' + editorPoints.map(p => p.join(',')).join('L') + (editorPoints.length > 2 ? 'Z' : '');
  editorG.append('path')
    .attr('class', 'draw-preview')
    .attr('d', d)
    .attr('fill', 'rgba(255,80,80,0.25)')
    .attr('stroke', '#c02020')
    .attr('stroke-width', 0.8)
    .attr('stroke-dasharray', '2,1.5');

  const zoom = W / vb.w;
  editorPoints.forEach(p => {
    editorG.append('circle')
      .attr('class', 'draw-vertex')
      .attr('cx', p[0]).attr('cy', p[1])
      .attr('r', 2.5 / zoom)
      .attr('fill', '#c02020');
  });
}

// ---- Отрисовка сохранённых провинций сценария ----
function ownerHash(owner) {
  let h = 0;
  for (let i = 0; i < owner.length; i++) h = (h * 31 + owner.charCodeAt(i)) % 360;
  return h;
}

function renderEditorProvinces() {
  editorG.selectAll('.scenario-prov').remove();
  scenarioProvinces.forEach(p => {
    if (!p.points || p.points.length < 3) return;
    const d = 'M' + p.points.map(pt => pt.join(',')).join('L') + 'Z';
    const hue = ownerHash(p.owner);
    editorG.append('path')
      .attr('class', 'scenario-prov')
      .attr('d', d)
      .attr('fill', `hsla(${hue},60%,55%,0.35)`)
      .attr('stroke', `hsl(${hue},60%,35%)`)
      .attr('stroke-width', 0.6)
      .style('cursor', 'pointer')
      .on('click', () => {
        if (!editorDrawing) selectProvinceForEdit(p.id);
      });

    // Подпись по центроиду (среднее точек — простая аппроксимация)
    const cx = p.points.reduce((s, pt) => s + pt[0], 0) / p.points.length;
    const cy = p.points.reduce((s, pt) => s + pt[1], 0) / p.points.length;
    editorG.append('text')
      .attr('class', 'scenario-prov')
      .attr('x', cx).attr('y', cy)
      .attr('text-anchor', 'middle')
      .attr('font-size', 6).attr('fill', '#222')
      .attr('font-family', 'Georgia,serif')
      .attr('pointer-events', 'none')
      .text(p.name);
  });
}

// ---- Список провинций в панели редактора ----
function renderEditorProvinceList() {
  const list = document.getElementById('editor-province-list');
  if (scenarioProvinces.length === 0) {
    list.innerHTML = '<div class="chg-empty">Провинций пока нет</div>';
    return;
  }
  list.innerHTML = scenarioProvinces.map(p => `
    <div class="eprov-item">
      <div>
        <div class="eprov-name">${p.name}</div>
        <div class="eprov-owner">${p.owner}</div>
      </div>
      <div class="eprov-actions">
        <button onclick="renameProvince('${p.id}')">✏️</button>
        <button onclick="reownProvince('${p.id}')">🏳️</button>
        <button onclick="deleteProvince('${p.id}')">🗑</button>
      </div>
    </div>
  `).join('');
}

function selectProvinceForEdit(id) {
  const p = scenarioProvinces.find(x => x.id === id);
  if (!p) return;
  showNotif(`📍 ${p.name} (${p.owner})`);
}

function renameProvince(id) {
  const p = scenarioProvinces.find(x => x.id === id);
  if (!p) return;
  const name = prompt('Новое название провинции:', p.name);
  if (!name) return;
  p.name = name.trim();
  saveScenarioProvinces();
  renderEditorProvinceList();
  renderEditorProvinces();
}

function reownProvince(id) {
  const p = scenarioProvinces.find(x => x.id === id);
  if (!p) return;
  const owner = prompt('Новая страна-владелец:', p.owner);
  if (!owner) return;
  p.owner = owner.trim();
  saveScenarioProvinces();
  renderEditorProvinceList();
  renderEditorProvinces();
}

function deleteProvince(id) {
  if (!confirm('Удалить эту провинцию?')) return;
  scenarioProvinces = scenarioProvinces.filter(p => p.id !== id);
  saveScenarioProvinces();
  renderEditorProvinceList();
  renderEditorProvinces();
}

loadScenarioProvinces();
