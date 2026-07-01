// ============================================================
// GAME.JS — ходы, казна, время, сохранения (слоты), меню
// ============================================================

let turn = 1, month = 0, year = 1852, treasury = 4200, incomePerMonth = 580;
const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

let gameStarted = false;
const SAVE_PREFIX = 'gs1852_save_';
let currentSlotId = null;

// Все страны сценария 1852 года
const ALL_COUNTRIES = ['Франция', 'Великобритания', 'Россия', 'Австрия', 'Пруссия', 'Испания'];

// За кого сейчас играет игрок — выбирается в главном меню кликом по стране
let playerCountry = 'Франция';

// Владелец каждой территории (по умолчанию каждая страна владеет собой).
// Меняется через аннексии/передачи территорий (EFFECTS.territory_transfer от ИИ).
let territoryOwners = {};

// Стартовые данные каждой играбельной страны на 1852 год
const COUNTRY_DEFAULTS = {
  'Франция':         { ruler:'Луи-Наполеон Бонапарт', rulerTitle:'Президент Французской республики', government:'Президентская республика', pm:'Эжен Руэр', pmTitle:'Министр-президент', treasury:4200, income:580, army:400000, stability:81 },
  'Великобритания':  { ruler:'Королева Виктория', rulerTitle:'Королева Соединённого Королевства', government:'Конституционная монархия', pm:'Лорд Абердин', pmTitle:'Премьер-министр', treasury:5000, income:650, army:250000, stability:78 },
  'Россия':          { ruler:'Николай I', rulerTitle:'Император Всероссийский', government:'Абсолютная монархия', pm:'Карл Нессельроде', pmTitle:'Государственный канцлер', treasury:3800, income:500, army:900000, stability:70 },
  'Австрия':         { ruler:'Франц Иосиф I', rulerTitle:'Император Австрийский', government:'Абсолютная монархия', pm:'Феликс Шварценберг', pmTitle:'Министр-президент', treasury:2900, income:420, army:400000, stability:65 },
  'Пруссия':         { ruler:'Фридрих Вильгельм IV', rulerTitle:'Король Пруссии', government:'Конституционная монархия', pm:'Отто фон Мантойфель', pmTitle:'Министр-президент', treasury:3200, income:460, army:300000, stability:74 },
  'Испания':         { ruler:'Изабелла II', rulerTitle:'Королева Испании', government:'Конституционная монархия', pm:'Хуан Браво Мурильо', pmTitle:'Председатель совета министров', treasury:1800, income:280, army:150000, stability:60 }
};

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

// Изменить главу государства / форму правления / премьер-министра (название может быть любым)
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

// Передать территорию другому владельцу (вызывается из EFFECTS.territory_transfer)
function transferTerritory(countryName, newOwner) {
  if (!ALL_COUNTRIES.includes(countryName) || !ALL_COUNTRIES.includes(newOwner)) return;
  territoryOwners[countryName] = newOwner;
  if (typeof renderTerritoryColors === 'function') renderTerritoryColors();
}

function territoryOwnerOf(countryName) {
  return territoryOwners[countryName] || countryName;
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
          country: d.playerCountry || 'Франция',
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
      playerCountry,
      territoryOwners,
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
    playerCountry = d.playerCountry || 'Франция';
    territoryOwners = d.territoryOwners || {};
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
    if (typeof renderTerritoryColors === 'function') renderTerritoryColors();
    if (typeof renderCountryList === 'function') renderCountryList();
    return true;
  } catch (e) {
    console.log('Ошибка загрузки:', e.message);
    return false;
  }
}

function deleteSave(id) {
  localStorage.removeItem(SAVE_PREFIX + id);
}

// country — за кого играем (по умолчанию Франция, если не передано)
function resetGame(country) {
  playerCountry = country && COUNTRY_DEFAULTS[country] ? country : 'Франция';
  const d = COUNTRY_DEFAULTS[playerCountry];

  turn = 1; month = 0; year = 1852;
  treasury = d.treasury; incomePerMonth = d.income;
  stateOfPower = { ruler: d.ruler, rulerTitle: d.rulerTitle, government: d.government, pm: d.pm, pmTitle: d.pmTitle };
  territoryOwners = {};

  // Отношения игрока со всеми остальными странами сценария
  const relations = {};
  ALL_COUNTRIES.filter(c => c !== playerCountry).forEach(c => { relations[c] = 0; });
  worldState = {
    relations,
    atWarWith: [], alliedWith: [], pastEvents: [], diploLog: [], mapObjects: []
  };
  playerActions = [];
  if (typeof advisorHistory !== 'undefined') advisorHistory = [];
  if (typeof diplomacyHistories !== 'undefined') Object.keys(diplomacyHistories).forEach(k => delete diplomacyHistories[k]);

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

  document.getElementById('events-box').style.display = 'none';
  document.getElementById('changes-box').style.display = 'none';
  document.getElementById('adv-messages').innerHTML = `<div class="adv-msg advisor">🎭 Ваше Превосходительство, готов отвечать на ваши вопросы о положении ${playerCountry === 'Франция' ? 'Франции' : playerCountry === 'Испания' ? 'Испании' : playerCountry === 'Великобритания' ? 'Великобритании' : playerCountry === 'Россия' ? 'России' : playerCountry === 'Австрия' ? 'Австрии' : 'Пруссии'}.</div>`;

  renderActionsList();
  if (typeof renderMapObjects === 'function') renderMapObjects();
  if (typeof renderTerritoryColors === 'function') renderTerritoryColors();
  if (typeof renderCountryList === 'function') renderCountryList();
}
