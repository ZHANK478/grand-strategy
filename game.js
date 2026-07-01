// ============================================================
// GAME.JS — ходы, казна, время, сохранения (слоты), меню
// ============================================================

let turn = 1, month = 0, year = 1852, treasury = 4200, incomePerMonth = 580;
const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

let gameStarted = false;
const SAVE_PREFIX = 'gs1852_save_';
let currentSlotId = null;

// Динамическое состояние власти — может меняться через события ИИ
let stateOfPower = {
  ruler: 'Луи-Наполеон Бонапарт',
  rulerTitle: 'Президент Французской республики',
  government: 'Президентская республика',
  pm: 'Эжен Руэр',
  pmTitle: 'Министр-президент'
};

async function nextTurn() {
  const btn = document.querySelector('.next-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Симуляция...';

  turn++; month++;
  if (month >= 12) { month = 0; year++; }
  treasury += incomePerMonth;

  document.getElementById('treasury').textContent = treasury.toLocaleString('ru') + ' фр.';
  document.getElementById('date-disp').textContent = months[month] + ' ' + year + ' г.';
  document.getElementById('turn-info').textContent = 'Ход ' + turn;

  // Запускаем ИИ-события
  await onTurnEnd();

  saveGame();

  btn.disabled = false;
  btn.textContent = 'Следующий месяц ▶';
}

// Изменить показатели (вызывается из ИИ-триггеров)
function changeGameStat(stat, delta) {
  if (stat === 'treasury') { treasury += delta; document.getElementById('treasury').textContent = treasury.toLocaleString('ru') + ' фр.'; }
  if (stat === 'army') {
    const cur = parseInt(document.getElementById('army').textContent.replace(/\s/g,''));
    document.getElementById('army').textContent = (cur + delta).toLocaleString('ru');
  }
  if (stat === 'stability') {
    const cur = parseInt(document.getElementById('stab').textContent);
    document.getElementById('stab').textContent = Math.max(0, Math.min(100, cur + delta));
  }
  if (stat === 'income') {
    incomePerMonth += delta;
    document.getElementById('income').textContent = (incomePerMonth >= 0 ? '+' : '') + incomePerMonth.toLocaleString('ru') + ' фр.';
  }
}

// Изменить главу государства / форму правления / премьер-министра
function changePowerState(field, value) {
  if (!value) return;
  if (field === 'ruler') {
    stateOfPower.ruler = value;
    const el = document.getElementById('ruler-name');
    if (el) el.textContent = value;
  }
  if (field === 'government') {
    stateOfPower.government = value;
    const badgeEl = document.getElementById('govbadge-text');
    if (badgeEl) badgeEl.textContent = '🏛 ' + value;
  }
  if (field === 'rulerTitle') {
    stateOfPower.rulerTitle = value;
    const el = document.getElementById('ruler-title');
    if (el) el.textContent = value;
  }
  if (field === 'pm') {
    stateOfPower.pm = value;
    const el = document.getElementById('pm-name');
    if (el) el.textContent = value;
  }
  if (field === 'pmTitle') {
    stateOfPower.pmTitle = value;
    const el = document.getElementById('pm-title');
    if (el) el.textContent = value;
  }
}

// ============================================================
// СОХРАНЕНИЯ — несколько слотов, каждый со своей партией
// ============================================================
function listSaves() {
  const saves = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(SAVE_PREFIX)) {
      try {
        const d = JSON.parse(localStorage.getItem(k));
        saves.push({
          id: k.slice(SAVE_PREFIX.length),
          country: 'Франция',
          ruler: d.stateOfPower ? d.stateOfPower.ruler : '',
          turn: d.turn, year: d.year, month: d.month,
          treasury: d.treasury,
          savedAt: d.savedAt || 0
        });
      } catch (e) { /* повреждённый слот — пропускаем */ }
    }
  }
  saves.sort((a, b) => b.savedAt - a.savedAt);
  return saves;
}

function hasSave() {
  return listSaves().length > 0;
}

function saveGame() {
  try {
    if (!currentSlotId) currentSlotId = 'slot_' + Date.now();
    const army = document.getElementById('army').textContent.replace(/\s/g,'');
    const stab = document.getElementById('stab').textContent;
    const data = {
      turn, month, year, treasury, incomePerMonth,
      army: parseInt(army), stability: parseInt(stab),
      stateOfPower,
      worldState,
      playerActions,
      advisorHistory: typeof advisorHistory !== 'undefined' ? advisorHistory : [],
      diplomacyHistories: typeof diplomacyHistories !== 'undefined' ? diplomacyHistories : {},
      savedAt: Date.now()
    };
    localStorage.setItem(SAVE_PREFIX + currentSlotId, JSON.stringify(data));
  } catch (e) {
    console.log('Ошибка сохранения:', e.message);
  }
}

function loadGameSlot(id) {
  const raw = localStorage.getItem(SAVE_PREFIX + id);
  if (!raw) return false;
  try {
    const d = JSON.parse(raw);
    currentSlotId = id;
    turn = d.turn; month = d.month; year = d.year;
    treasury = d.treasury; incomePerMonth = d.incomePerMonth;
    stateOfPower = d.stateOfPower || stateOfPower;
    if (!stateOfPower.rulerTitle) stateOfPower.rulerTitle = 'Президент Французской республики';
    if (!stateOfPower.pmTitle) stateOfPower.pmTitle = 'Министр-президент';
    worldState = d.worldState || worldState;
    if (!worldState.mapObjects) worldState.mapObjects = [];
    playerActions = d.playerActions || [];
    if (typeof advisorHistory !== 'undefined') advisorHistory = d.advisorHistory || [];
    if (typeof diplomacyHistories !== 'undefined') {
      Object.keys(diplomacyHistories).forEach(k => delete diplomacyHistories[k]);
      Object.assign(diplomacyHistories, d.diplomacyHistories || {});
    }

    document.getElementById('treasury').textContent = treasury.toLocaleString('ru') + ' фр.';
    document.getElementById('income').textContent = (incomePerMonth >= 0 ? '+' : '') + incomePerMonth.toLocaleString('ru') + ' фр.';
    document.getElementById('army').textContent = d.army.toLocaleString('ru');
    document.getElementById('stab').textContent = d.stability;
    document.getElementById('date-disp').textContent = months[month] + ' ' + year + ' г.';
    document.getElementById('turn-info').textContent = 'Ход ' + turn;

    changePowerState('ruler', stateOfPower.ruler);
    changePowerState('rulerTitle', stateOfPower.rulerTitle);
    changePowerState('government', stateOfPower.government);
    changePowerState('pm', stateOfPower.pm);
    changePowerState('pmTitle', stateOfPower.pmTitle);

    renderActionsList();
    if (typeof renderMapObjects === 'function') renderMapObjects();
    return true;
  } catch (e) {
    console.log('Ошибка загрузки:', e.message);
    return false;
  }
}

function deleteSave(id) {
  localStorage.removeItem(SAVE_PREFIX + id);
}

function resetGame() {
  turn = 1; month = 0; year = 1852; treasury = 4200; incomePerMonth = 580;
  stateOfPower = { ruler: 'Луи-Наполеон Бонапарт', rulerTitle: 'Президент Французской республики', government: 'Президентская республика', pm: 'Эжен Руэр', pmTitle: 'Министр-президент' };
  worldState = {
    relations: { 'Испания': 0, 'Великобритания': 10, 'Россия': 5, 'Австрия': -5, 'Пруссия': 15 },
    atWarWith: [], alliedWith: [], pastEvents: [], diploLog: [], mapObjects: []
  };
  playerActions = [];
  if (typeof advisorHistory !== 'undefined') advisorHistory = [];
  if (typeof diplomacyHistories !== 'undefined') Object.keys(diplomacyHistories).forEach(k => delete diplomacyHistories[k]);

  document.getElementById('treasury').textContent = treasury.toLocaleString('ru') + ' фр.';
  document.getElementById('income').textContent = '+' + incomePerMonth.toLocaleString('ru') + ' фр.';
  document.getElementById('army').textContent = (400000).toLocaleString('ru');
  document.getElementById('stab').textContent = 81;
  document.getElementById('date-disp').textContent = months[month] + ' ' + year + ' г.';
  document.getElementById('turn-info').textContent = 'Ход ' + turn;

  changePowerState('ruler', stateOfPower.ruler);
  changePowerState('rulerTitle', stateOfPower.rulerTitle);
  changePowerState('government', stateOfPower.government);
  changePowerState('pm', stateOfPower.pm);
  changePowerState('pmTitle', stateOfPower.pmTitle);

  document.getElementById('events-box').style.display = 'none';
  document.getElementById('changes-box').style.display = 'none';
  document.getElementById('adv-messages').innerHTML = '<div class="adv-msg advisor">🎭 Ваше Превосходительство, готов отвечать на ваши вопросы о положении Франции.</div>';

  renderActionsList();
  if (typeof renderMapObjects === 'function') renderMapObjects();
}
