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
let playerCountry = 'Франция'; // ключ для карты/цветов/отношений — не меняется
let playerCountryDisplayName = 'Франция'; // отображаемое название — может меняться через события ИИ (например Пруссия → Германская империя)

function renameCountry(newName) {
  if (!newName) return;
  playerCountryDisplayName = newName;
  const badge = document.getElementById('country-name-badge');
  if (badge) badge.textContent = '🏳️ ' + newName;
  if (typeof updateMapCountryLabel === 'function') updateMapCountryLabel(playerCountry, newName);
}

// Владелец каждой территории (по умолчанию каждая страна владеет собой).
// Меняется через аннексии/передачи территорий (EFFECTS.territory_transfer от ИИ).
let territoryOwners = {};

// Стартовые данные каждой играбельной страны на 1852 год
const COUNTRY_DEFAULTS = {
  'Франция':         { ruler:'Луи-Наполеон Бонапарт', rulerTitle:'Президент Французской республики', government:'Президентская республика', pm:'Эжен Руэр', pmTitle:'Министр-президент', treasury:4200, income:580, army:400000, stability:81,
    pop:'35.8 млн', area:'551 000 км²', capital:'Париж', gdp:'~14 млрд фр.', blurb:'Франция в 1852 году переживает переходный период. Луи-Наполеон готовится провозгласить Вторую империю. Экономика растёт, но политическое напряжение высоко.' },
  'Великобритания':  { ruler:'Королева Виктория', rulerTitle:'Королева Соединённого Королевства', government:'Конституционная монархия', pm:'Лорд Абердин', pmTitle:'Премьер-министр', treasury:5000, income:650, army:250000, stability:78,
    pop:'27.5 млн', area:'315 000 км²', capital:'Лондон', gdp:'~20 млрд фр.', blurb:'Великобритания в 1852 году — ведущая промышленная держава мира с крупнейшим флотом и обширными колониями. Парламентская система стабильна, но назревают споры о свободной торговле.' },
  'Россия':          { ruler:'Николай I', rulerTitle:'Император Всероссийский', government:'Абсолютная монархия', pm:'Карл Нессельроде', pmTitle:'Государственный канцлер', treasury:3800, income:500, army:900000, stability:70,
    pop:'68 млн', area:'~18 млн км²', capital:'Санкт-Петербург', gdp:'~11 млрд фр.', blurb:'Российская империя в 1852 году — крупнейшая по территории и армии держава Европы. Крепостное право сдерживает экономику, а внешняя политика Николая I вызывает тревогу соседей.' },
  'Австрия':         { ruler:'Франц Иосиф I', rulerTitle:'Император Австрийский', government:'Абсолютная монархия', pm:'Феликс Шварценберг', pmTitle:'Министр-президент', treasury:2900, income:420, army:400000, stability:65,
    pop:'36 млн', area:'~700 000 км²', capital:'Вена', gdp:'~8 млрд фр.', blurb:'Австрийская империя в 1852 году — многонациональная держава, ещё не оправившаяся от революций 1848 года. Молодой император Франц Иосиф укрепляет власть среди разнородных народов.' },
  'Пруссия':         { ruler:'Фридрих Вильгельм IV', rulerTitle:'Король Пруссии', government:'Конституционная монархия', pm:'Отто фон Мантойфель', pmTitle:'Министр-президент', treasury:3200, income:460, army:300000, stability:74,
    pop:'17 млн', area:'~280 000 км²', capital:'Берлин', gdp:'~7 млрд фр.', blurb:'Пруссия в 1852 году усиливает влияние среди немецких государств через Таможенный союз. Военная реформа и промышленный рост закладывают основу будущего объединения Германии.' },
  'Испания':         { ruler:'Изабелла II', rulerTitle:'Королева Испании', government:'Конституционная монархия', pm:'Хуан Браво Мурильо', pmTitle:'Председатель совета министров', treasury:1800, income:280, army:150000, stability:60,
    pop:'15.5 млн', area:'~500 000 км²', capital:'Мадрид', gdp:'~4 млрд фр.', blurb:'Испания в 1852 году переживает политическую нестабильность после десятилетий гражданских войн. Экономика отстаёт от других держав Европы, а колониальное влияние слабеет.' }
};

// Обновить левую панель (население/площадь/столица/ВВП/описание) под текущую играбельную страну
function updateCountryInfoPanel(country) {
  const d = COUNTRY_DEFAULTS[country];
  if (!d) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('country-pop', d.pop);
  set('country-area', d.area);
  set('country-capital', d.capital);
  set('country-gdp', d.gdp);
  set('country-blurb', d.blurb);
  const badge = document.getElementById('country-name-badge');
  if (badge) badge.textContent = '🏳️ ' + country;
}

// Динамическое состояние власти игрока — может меняться через события ИИ
let stateOfPower = {
  ruler: 'Луи-Наполеон Бонапарт',
  rulerTitle: 'Президент Французской республики',
  government: 'Президентская республика',
  pm: 'Эжен Руэр',
  pmTitle: 'Министр-президент'
};

// Правители ВСЕХ стран сценария (не только игрока) — у ИИ-стран тоже может смениться власть
// (например если игрок захватил территорию, "освободил" её и поставил марионеточного правителя).
let countryRulers = {};

function setForeignRuler(country, fields) {
  if (!countryRulers[country]) countryRulers[country] = {};
  Object.assign(countryRulers[country], fields);
}

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
      countryRulers,
      playerCountry,
      playerCountryDisplayName,
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
    playerCountryDisplayName = d.playerCountryDisplayName || playerCountry;
    territoryOwners = d.territoryOwners || {};
    stateOfPower = d.stateOfPower || stateOfPower;
    if (!stateOfPower.rulerTitle) stateOfPower.rulerTitle = 'Президент Французской республики';
    if (!stateOfPower.pmTitle) stateOfPower.pmTitle = 'Министр-президент';
    countryRulers = d.countryRulers || countryRulers;
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
    updateCountryInfoPanel(playerCountry);
    renameCountry(playerCountryDisplayName);

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
  playerCountryDisplayName = playerCountry;
  const d = COUNTRY_DEFAULTS[playerCountry];

  // Правители всех стран сценария — у игрока источник истины stateOfPower,
  // у остальных (ИИ) — countryRulers, изначально из COUNTRY_DEFAULTS
  countryRulers = {};
  ALL_COUNTRIES.forEach(c => {
    const cd = COUNTRY_DEFAULTS[c];
    countryRulers[c] = { ruler: cd.ruler, rulerTitle: cd.rulerTitle, government: cd.government, pm: cd.pm, pmTitle: cd.pmTitle };
  });

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
  updateCountryInfoPanel(playerCountry);
  renameCountry(playerCountryDisplayName);

  document.getElementById('events-box').style.display = 'none';
  document.getElementById('changes-box').style.display = 'none';
  document.getElementById('adv-messages').innerHTML = `<div class="adv-msg advisor">🎭 Ваше Превосходительство, готов отвечать на ваши вопросы о положении ${playerCountry === 'Франция' ? 'Франции' : playerCountry === 'Испания' ? 'Испании' : playerCountry === 'Великобритания' ? 'Великобритании' : playerCountry === 'Россия' ? 'России' : playerCountry === 'Австрия' ? 'Австрии' : 'Пруссии'}.</div>`;

  renderActionsList();
  if (typeof renderMapObjects === 'function') renderMapObjects();
  if (typeof renderTerritoryColors === 'function') renderTerritoryColors();
  if (typeof renderCountryList === 'function') renderCountryList();
}
