// ============================================================
// UI.JS — панели, советник, дипломатия, отношения
// ============================================================

let panelOpen = true;

function togglePanel() {
  panelOpen = !panelOpen;
  const p = document.getElementById('left-panel');
  const t = document.getElementById('toggle-btn');
  const m = document.getElementById('map-wrap');
  if (panelOpen) { p.classList.remove('hidden'); t.style.left='290px'; t.textContent='◀'; m.style.left='290px'; }
  else { p.classList.add('hidden'); t.style.left='0'; t.textContent='▶'; m.style.left='0'; }
}

function toggle(id) {
  const el = document.getElementById(id);
  const btn = el.previousElementSibling;
  el.classList.toggle('open');
  btn.textContent = (el.classList.contains('open') ? '▼ ' : '▶ ') + btn.textContent.slice(2);
}

function togglePop(show, hide) {
  document.getElementById(hide).style.display = 'none';
  document.getElementById('actions-panel').style.display = 'none';
  document.getElementById('relations-panel').style.display = 'none';
  const s = document.getElementById(show);
  s.style.display = s.style.display === 'block' ? 'none' : 'block';
}

function showNotif(msg) {
  const e = document.createElement('div');
  e.className = 'notif'; e.textContent = msg;
  document.body.appendChild(e);
  setTimeout(() => e.remove(), 3300);
}

// ============================================================
// СОВЕТНИК — чат
// ============================================================
async function sendAdvisorMessage() {
  const input = document.getElementById('adv-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';

  appendAdvisorMsg('player', msg);
  appendAdvisorMsg('advisor', '⏳ Советник думает...');

  const response = await askAdvisor(msg);

  const msgs = document.querySelectorAll('.adv-msg');
  msgs[msgs.length - 1].remove();
  appendAdvisorMsg('advisor', response);
}

function appendAdvisorMsg(role, text) {
  const box = document.getElementById('adv-messages');
  const div = document.createElement('div');
  div.className = 'adv-msg ' + role;
  div.textContent = role === 'player' ? '👤 ' + text : '🎭 ' + text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function advisorKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAdvisorMessage(); }
}

// ============================================================
// ДИПЛОМАТИЯ — выбор страны и чат
// ============================================================
let selectedCountry = null;

function openDiploPanel() {
  document.getElementById('diplo-pop').style.display = 'block';
  document.getElementById('adv-pop').style.display = 'none';
  document.getElementById('actions-panel').style.display = 'none';
  document.getElementById('relations-panel').style.display = 'none';
  renderCountryList();
}

function renderCountryList() {
  if (selectedCountry) return;
  const list = document.getElementById('diplo-countries');
  const availableCountries = (typeof ALL_COUNTRIES !== 'undefined')
    ? ALL_COUNTRIES.filter(c => c !== playerCountry)
    : ['Франция', 'Испания', 'Великобритания', 'Россия', 'Австрия', 'Пруссия'].filter(c => c !== playerCountry);
  list.innerHTML = availableCountries.map(c => {
    const rel = (typeof worldState !== 'undefined') ? (worldState.relations[c] || 0) : 0;
    const color = rel > 30 ? '#2a7a2a' : rel < -30 ? '#8a1a1a' : '#7a6a30';
    const war = (typeof worldState !== 'undefined') && worldState.atWarWith.includes(c) ? ' ⚔️' : '';
    return `<button class="country-btn" onclick="selectCountry('${c}')">
      ${c}${war} <span style="color:${color};font-size:11px;margin-left:4px">${rel > 0 ? '+' : ''}${rel}</span>
    </button>`;
  }).join('');
  document.getElementById('diplo-chat').style.display = 'none';
  list.style.display = 'block';
}

function selectCountry(name) {
  selectedCountry = name;
  document.getElementById('diplo-countries').style.display = 'none';
  document.getElementById('diplo-chat').style.display = 'block';
  document.getElementById('diplo-target').textContent = name;
  document.getElementById('diplo-messages').innerHTML = '';
  document.getElementById('diplo-pop').style.display = 'block';
}

function backToCountries() {
  selectedCountry = null;
  renderCountryList();
}

async function sendDiploMessage() {
  const input = document.getElementById('diplo-input');
  const msg = input.value.trim();
  if (!msg || !selectedCountry) return;
  input.value = '';

  appendDiploMsg('france', msg);
  appendDiploMsg('ai', '⏳ Ожидаем ответа...');

  const response = await sendDiplomacy(selectedCountry, msg);

  const msgs = document.querySelectorAll('.diplo-msg');
  msgs[msgs.length - 1].remove();
  appendDiploMsg('ai', response);

  // Обновить индикатор отношений в списке стран если он открыт
  const relPanel = document.getElementById('relations-panel');
  if (relPanel.style.display === 'block') updateRelationsPanel();
}

function appendDiploMsg(role, text) {
  const box = document.getElementById('diplo-messages');
  const div = document.createElement('div');
  div.className = 'diplo-msg ' + role;
  div.textContent = role === 'france' ? '🇫🇷 ' + text : '🌍 ' + text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function diploKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDiploMessage(); }
}

// ============================================================
// ПАНЕЛЬ ОТНОШЕНИЙ — открывается кликом на страну на карте
// ============================================================
function openCountryRelations(countryName) {
  const rel = (typeof worldState !== 'undefined') ? (worldState.relations[countryName] || 0) : 0;
  const isWar = (typeof worldState !== 'undefined') && worldState.atWarWith.includes(countryName);
  const isAlly = (typeof worldState !== 'undefined') && worldState.alliedWith.includes(countryName);

  // Страна — единый объект countries[] (game.js), меняется через setCountryLeader/changeCountryStat
  // и для игрока, и для ИИ-стран одинаково — здесь показываем её текущий срез целиком.
  const c = (typeof countries !== 'undefined') ? countries[countryName] : null;
  const age = c && typeof c.rulerAge === 'number' ? `, ${c.rulerAge} лет` : '';
  const leaderText = c ? `${c.ruler} (${c.rulerTitle}${age})` : '';

  document.getElementById('rel-country-name').textContent = (c && c.displayName) || countryName;
  document.getElementById('rel-leader').textContent = leaderText;

  const annexedEl = document.getElementById('rel-annexed');
  if (c && c.annexed) {
    annexedEl.textContent = `🏳️ Аннексирована: ${c.annexedBy}`;
    annexedEl.style.display = 'block';
  } else {
    annexedEl.style.display = 'none';
  }
  // Казну/армию/стабильность чужой страны игрок НЕ видит — только форму правления
  // (публичный факт). Остальное он узнаёт из новостей, слухов и дипломатии.
  document.getElementById('rel-government').textContent = c ? c.government : '—';

  // Полоска отношений: от -100 до +100, центр = 50%
  const pct = (rel + 100) / 2;
  const bar = document.getElementById('rel-bar');
  bar.style.width = pct + '%';
  bar.style.background = rel > 30 ? '#2a7a2a' : rel < -30 ? '#8a1a1a' : '#8a7a20';

  document.getElementById('rel-value').textContent = (rel > 0 ? '+' : '') + rel;

  const statusEl = document.getElementById('rel-status');
  if (isWar) {
    statusEl.textContent = '⚔️ СОСТОЯНИЕ ВОЙНЫ';
    statusEl.style.color = '#c00';
  } else if (isAlly) {
    statusEl.textContent = '🤝 Союзник';
    statusEl.style.color = '#2a7a2a';
  } else if (rel > 60) {
    statusEl.textContent = '😊 Дружественные';
    statusEl.style.color = '#2a7a2a';
  } else if (rel > 30) {
    statusEl.textContent = '🙂 Хорошие';
    statusEl.style.color = '#4a9a4a';
  } else if (rel > -30) {
    statusEl.textContent = '😐 Нейтральные';
    statusEl.style.color = '#7a6a20';
  } else if (rel > -60) {
    statusEl.textContent = '😠 Напряжённые';
    statusEl.style.color = '#c06020';
  } else {
    statusEl.textContent = '😡 Враждебные';
    statusEl.style.color = '#c00';
  }

  // Кнопка "Открыть переговоры"
  document.getElementById('rel-diplo-btn').onclick = () => {
    closeRelationsPanel();
    selectCountry(countryName);
  };

  // Показать панель, скрыть остальное
  document.getElementById('relations-panel').style.display = 'block';
  document.getElementById('adv-pop').style.display = 'none';
  document.getElementById('diplo-pop').style.display = 'none';
  document.getElementById('actions-panel').style.display = 'none';
}

function closeRelationsPanel() {
  document.getElementById('relations-panel').style.display = 'none';
}

// Обновить панель отношений если она открыта (вызывается из ai.js после изменений)
function updateRelationsPanel() {
  const panel = document.getElementById('relations-panel');
  if (panel.style.display !== 'block') return;
  const name = document.getElementById('rel-country-name').textContent;
  if (name) openCountryRelations(name);
}

// ============================================================
// ИЗМЕНЕНИЯ ЗА ХОД — сводка после каждого хода (вызывается из ai.js)
// ============================================================
function renderTurnChanges(changes) {
  const box = document.getElementById('changes-box');
  const list = document.getElementById('changes-list');
  if (!changes || changes.length === 0) {
    list.innerHTML = '<div class="chg-empty">Заметных изменений не произошло</div>';
  } else {
    list.innerHTML = changes.map(c => {
      const cls = c.sign > 0 ? 'pos' : c.sign < 0 ? 'neg' : 'neutral';
      return `<div class="chg-item"><span class="chg-label">${c.label}</span><span class="chg-val ${cls}">${c.value}</span></div>`;
    }).join('');
  }
  box.style.display = 'block';
}

// ============================================================
// ГЛАВНОЕ МЕНЮ / ПАУЗА / СОХРАНЕНИЯ
// ============================================================
function initMenu() {
  document.getElementById('continue-btn').style.display = hasSave() ? 'block' : 'none';
}

function startGame() {
  gameStarted = true;
  document.body.classList.remove('menu-mode');
  document.getElementById('main-menu').style.display = 'none';
}

// Клик по стране на карте главного меню — сразу новая игра за эту страну
function newGame(country) {
  currentSlotId = 'slot_' + Date.now();
  resetGame(country);
  saveGame();
  startGame();
  showNotif('🏳️ Новая игра началась: ' + playerCountry);
}

// "Продолжить" в главном меню — грузит последнюю по времени партию
async function continueGame() {
  const saves = listSaves();
  if (!saves.length) return;
  await loadGameSlot(saves[0].id); // сначала сценарий партии, потом её состояние
  startGame();
  showNotif('▶ Игра продолжена');
}

// ---- Экран "Загрузить игру" ----
function openLoadMenu() {
  renderSaveList();
  document.getElementById('load-menu').style.display = 'flex';
}

function closeLoadMenu() {
  document.getElementById('load-menu').style.display = 'none';
}

function renderSaveList() {
  const list = document.getElementById('save-list');
  const saves = listSaves();
  if (saves.length === 0) {
    list.innerHTML = '<div class="chg-empty">Нет сохранённых партий</div>';
    return;
  }
  list.innerHTML = saves.map(s => {
    const date = months[s.month] + ' ' + s.year + ' г.';
    return `<div class="save-item">
      <div class="save-info">
        <div class="save-title">🏳️ ${s.country} — ${s.ruler || ''}</div>
        <div class="save-sub">${s.scenarioName || ''} · Ход ${s.turn} · ${date} · ${(s.treasury || 0).toLocaleString('ru')} фр.</div>
      </div>
      <div class="save-actions">
        <button class="save-play-btn" onclick="loadSaveAndPlay('${s.id}')">▶</button>
        <button class="save-del-btn" onclick="deleteSaveAndRefresh('${s.id}')">🗑</button>
      </div>
    </div>`;
  }).join('');
}

async function loadSaveAndPlay(id) {
  await loadGameSlot(id);
  closeLoadMenu();
  startGame();
  showNotif('▶ Игра загружена');
}

function deleteSaveAndRefresh(id) {
  if (!confirm('Удалить это сохранение?')) return;
  deleteSave(id);
  renderSaveList();
  initMenu();
}

// ---- Меню паузы (внутри игры) ----
function openPauseMenu() {
  document.getElementById('pause-menu').style.display = 'flex';
}

function closePauseMenu() {
  document.getElementById('pause-menu').style.display = 'none';
}

function pauseRestart() {
  if (!confirm('Начать заново? Текущий прогресс этой партии будет потерян.')) return;
  resetGame(playerCountry);
  saveGame();
  closePauseMenu();
  showNotif('🔄 Игра начата заново');
}

function pauseExitToMenu() {
  saveGame();
  gameStarted = false;
  closePauseMenu();
  closeSettings();
  document.getElementById('adv-pop').style.display = 'none';
  document.getElementById('diplo-pop').style.display = 'none';
  document.getElementById('actions-panel').style.display = 'none';
  document.getElementById('relations-panel').style.display = 'none';
  document.getElementById('events-box').style.display = 'none';
  document.getElementById('changes-box').style.display = 'none';
  document.body.classList.add('menu-mode');
  document.getElementById('main-menu').style.display = 'flex';
  initMenu();
}

// ============================================================
// НАСТРОЙКИ ОТОБРАЖЕНИЯ (внутриигровое меню → ⚙ Настройки)
// ============================================================
function openSettings() {
  document.getElementById('settings-panel').style.display = 'flex';
  document.getElementById('setting-show-countries').checked = showCountryLabels;
  document.getElementById('setting-label-scale').value = countryLabelScale;
  document.getElementById('setting-label-scale-val').textContent = countryLabelScale.toFixed(1) + '×';
  document.getElementById('setting-obj-scale').value = objectScale;
  document.getElementById('setting-obj-scale-val').textContent = objectScale.toFixed(1) + '×';
  const ap = document.getElementById('setting-auto-portraits');
  if (ap && typeof autoPortraitsEnabled === 'function') ap.checked = autoPortraitsEnabled();
}

function closeSettings() {
  document.getElementById('settings-panel').style.display = 'none';
}

function onToggleShowCountries(checked) {
  setShowCountryLabels(checked);
}

function onChangeLabelScale(val) {
  const v = parseFloat(val);
  document.getElementById('setting-label-scale-val').textContent = v.toFixed(1) + '×';
  setCountryLabelScale(v);
}

function onChangeObjectScale(val) {
  const v = parseFloat(val);
  document.getElementById('setting-obj-scale-val').textContent = v.toFixed(1) + '×';
  setObjectScale(v);
}

function onToggleAutoPortraits(checked) {
  localStorage.setItem('gs1852_auto_portraits', checked ? '1' : '0');
  if (checked && typeof maybeAutoPortrait === 'function' && gameStarted) maybeAutoPortrait(playerCountry);
}

// ============================================================
// ПАРЛАМЕНТ — динамическая панель (фракции и поддержка из объекта страны, не из хардкода)
// ============================================================
function renderParliamentPanel() {
  const box = document.getElementById('parliament-box');
  if (!box || typeof countries === 'undefined' || !countries[playerCountry]) return;
  const parl = countries[playerCountry].parliament;
  if (!parl || !parl.factions || !parl.factions.length) {
    box.innerHTML = '<div class="chg-empty" style="padding:4px 0">Представительный орган в стране отсутствует</div>';
    return;
  }
  const supColor = parl.support >= 60 ? '#1a7a1a' : parl.support >= 40 ? '#8a7a20' : '#b02020';
  box.innerHTML =
    `<div class="irow"><span class="k">Орган</span><span>${parl.name || 'Парламент'}</span></div>
     <div class="irow"><span class="k">Поддержка правительства</span><span style="color:${supColor};font-weight:bold">${parl.support}%</span></div>` +
    parl.factions.map(f => `<div class="irow"><span class="k">${f.name}</span><span>${f.pct}%</span></div>`).join('') +
    `<div style="font-size:10px;color:#999;margin-top:6px;line-height:1.5">Поддержка ниже 35% подтачивает стабильность каждый ход. Законы, победы и скандалы двигают её через события.</div>`;
}

// ============================================================
// ПОРТРЕТ ПРАВИТЕЛЯ — сгенерированный ИИ или эмодзи-заглушка
// ============================================================
function renderRulerPortrait() {
  const img = document.getElementById('ruler-portrait');
  const emoji = document.getElementById('ruler-portrait-emoji');
  if (!img || typeof countries === 'undefined' || !countries[playerCountry]) return;
  const c = countries[playerCountry];
  if (c.portrait) {
    img.src = c.portrait;
    img.style.display = 'block';
    emoji.style.display = 'none';
  } else {
    img.style.display = 'none';
    emoji.style.display = 'flex';
  }
}

function setPortraitLoading(loading) {
  const btn = document.getElementById('portrait-gen-btn');
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? '⏳ ИИ рисует портрет...' : '🎨 Сгенерировать портрет (ИИ)';
}

function onGeneratePortraitClick() {
  if (typeof generateRulerPortrait !== 'function') return;
  countries[playerCountry].portrait = null;
  generateRulerPortrait(playerCountry);
}

// ============================================================
// BREAKING NEWS — большой экран для катастрофических/эпохальных событий
// ============================================================
function showBreakingNews(title, text) {
  const box = document.getElementById('breaking-news');
  if (!box) return;
  document.getElementById('breaking-title').textContent = title || 'СРОЧНАЯ НОВОСТЬ';
  document.getElementById('breaking-text').textContent = text || '';
  document.getElementById('breaking-date').textContent = document.getElementById('date-disp').textContent;
  box.style.display = 'flex';
}

function closeBreakingNews() {
  document.getElementById('breaking-news').style.display = 'none';
}

// ============================================================
// ВЫБОР СЦЕНАРИЯ в главном меню (встроенный + созданные в редакторе)
// ============================================================
function openScenarioMenu() {
  const list = document.getElementById('scenario-menu-list');
  const saved = (typeof getScenariosIndex === 'function') ? getScenariosIndex() : [];
  const items = [{ ref: 'builtin', name: 'Европа 1852 (встроенный)', year: 1852, countries: 6 }]
    .concat(saved.map(s => ({ ref: s.id, name: s.name, year: s.year, countries: s.countryCount })));
  list.innerHTML = items.map(s => {
    const active = (typeof activeScenarioRef !== 'undefined' && activeScenarioRef === s.ref) ? ' ✅' : '';
    return `<div class="save-item" style="cursor:pointer" onclick="chooseScenario('${s.ref}')">
      <div class="save-info">
        <div class="save-title">🎲 ${s.name}${active}</div>
        <div class="save-sub">${s.year} г.${s.countries ? ' · стран: ' + s.countries : ''}</div>
      </div>
    </div>`;
  }).join('');
  document.getElementById('scenario-menu').style.display = 'flex';
}

function closeScenarioMenu() {
  document.getElementById('scenario-menu').style.display = 'none';
}

function chooseScenario(ref) {
  if (typeof switchActiveScenario !== 'function') return;
  switchActiveScenario(ref).then(data => {
    closeScenarioMenu();
    showNotif('🎲 Сценарий: ' + data.name + ' (' + data.year + ' г.). Кликните страну на карте.');
  }).catch(() => showNotif('⚠️ Не удалось загрузить сценарий'));
}
