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
const availableCountries = ['Испания', 'Великобритания', 'Россия', 'Австрия', 'Пруссия'];
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
const leaderNames = {
  'Испания': 'Королева Изабелла II',
  'Великобритания': 'Премьер-министр лорд Абердин',
  'Россия': 'Царь Николай I',
  'Австрия': 'Император Франц Иосиф I',
  'Пруссия': 'Король Фридрих Вильгельм IV',
};

function openCountryRelations(countryName) {
  const rel = (typeof worldState !== 'undefined') ? (worldState.relations[countryName] || 0) : 0;
  const isWar = (typeof worldState !== 'undefined') && worldState.atWarWith.includes(countryName);
  const isAlly = (typeof worldState !== 'undefined') && worldState.alliedWith.includes(countryName);

  document.getElementById('rel-country-name').textContent = countryName;
  document.getElementById('rel-leader').textContent = leaderNames[countryName] || '';

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

function newGame() {
  if (hasSave() && !confirm('Начать новую игру? Текущее сохранение будет затёрто.')) return;
  resetGame();
  startGame();
  showNotif('🇫🇷 Новая игра началась');
}

function continueGame() {
  if (!hasSave()) return;
  loadGame();
  startGame();
  showNotif('▶ Игра продолжена');
}

function openPauseMenu() {
  document.getElementById('pause-menu').style.display = 'flex';
}

function closePauseMenu() {
  document.getElementById('pause-menu').style.display = 'none';
}

function pauseRestart() {
  if (!confirm('Начать заново? Текущий прогресс будет потерян.')) return;
  resetGame();
  closePauseMenu();
  showNotif('🔄 Игра начата заново');
}

function pauseExitToMenu() {
  saveGame();
  gameStarted = false;
  closePauseMenu();
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
