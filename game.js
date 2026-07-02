// ============================================================
// GAME.JS — ходы, казна, время, сохранения (слоты), меню
// ============================================================

let turn = 1, month = 0, year = 1852;
const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

let gameStarted = false;
const SAVE_PREFIX = 'gs1852_save_';
let currentSlotId = null;

// Все страны сценария 1852 года
const ALL_COUNTRIES = ['Франция', 'Великобритания', 'Россия', 'Австрия', 'Пруссия', 'Испания'];

// За кого сейчас играет игрок — выбирается в главном меню кликом по стране
let playerCountry = 'Франция'; // ключ для карты/цветов/отношений — не меняется
let playerCountryDisplayName = 'Франция'; // отображаемое название — может меняться через события ИИ (например Пруссия → Германская империя)

// Переименовать любую страну сценария (например Пруссия → "Германская империя" после объединения).
// Подпись на карте обновляется всегда; бейдж в левой панели и playerCountryDisplayName — только
// если переименовывается страна игрока.
function renameCountry(country, newName) {
  if (!country || !newName || !countries[country]) return;
  countries[country].displayName = newName;
  if (country === playerCountry) {
    playerCountryDisplayName = newName;
    const badge = document.getElementById('country-name-badge');
    if (badge) badge.textContent = '🏳️ ' + newName;
  }
  if (typeof updateMapCountryLabel === 'function') updateMapCountryLabel(country, newName);
}

// Владелец каждой территории (по умолчанию каждая страна владеет собой).
// Меняется через аннексии/передачи территорий (EFFECTS.territory_transfer от ИИ).
let territoryOwners = {};

// Владелец каждой ПРОВИНЦИИ сценария (id -> страна), хранит только ОТЛИЧИЯ от исходного
// владельца из scenario_1852.json (аналогично countryColorOverrides) — id провинции,
// у которой нет записи здесь, принадлежит тому, кто указан при создании сценария.
let provinceOwners = {};

// Цвет территории — переопределяется только В РАМКАХ ТЕКУЩЕЙ ПАРТИИ (сбрасывается на новую игру,
// сохраняется/загружается вместе с сохранением, как поле countries[country].colorOverride).
// Игрок может попросить ИИ перекрасить свою страну.
function setCountryColor(country, hexColor) {
  if (!country || !countries[country] || !/^#[0-9a-fA-F]{6}$/.test(hexColor || '')) return;
  countries[country].colorOverride = hexColor;
  if (typeof renderTerritoryColors === 'function') renderTerritoryColors();
}

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

// ============================================================
// СТРАНЫ — единый реестр состояния ВСЕХ 6 стран сценария (игрока и ИИ).
// Раньше игрок и ИИ-страны жили в разных, несовместимых структурах (stateOfPower для игрока,
// countryRulers только с именами правителей для ИИ, без казны/армии/стабильности вовсе) — из-за
// этого независимые события ИИ-стран были чистой декорацией и никак не влияли на их показатели.
// Теперь страна — полноценный объект с тем же набором полей для игрока и ИИ, как и провинция.
// ============================================================
let countries = {};

function buildCountriesFromDefaults() {
  countries = {};
  ALL_COUNTRIES.forEach(c => {
    const d = COUNTRY_DEFAULTS[c];
    countries[c] = {
      displayName: c,
      ruler: d.ruler, rulerTitle: d.rulerTitle, government: d.government, pm: d.pm, pmTitle: d.pmTitle,
      treasury: d.treasury, income: d.income, army: d.army, stability: d.stability,
      colorOverride: null,
      annexed: false, annexedBy: null
    };
  });
}

// Изменить числовой показатель ЛЮБОЙ страны сценария (казна/доход/армия/стабильность).
// Заменяет старый changeGameStat, который умел работать только со страной игрока через DOM.
function changeCountryStat(country, stat, delta) {
  const c = countries[country];
  if (!c || !delta) return;
  if (stat === 'treasury') c.treasury += delta;
  if (stat === 'income') c.income += delta;
  if (stat === 'army') c.army = Math.max(0, c.army + delta);
  if (stat === 'stability') c.stability = Math.max(0, Math.min(100, c.stability + delta));
  if (country === playerCountry) renderPlayerStats();
}

// Обновить верхнюю панель (казна/доход/армия/стабильность) из countries[playerCountry]
function renderPlayerStats() {
  const c = countries[playerCountry];
  if (!c) return;
  document.getElementById('treasury').textContent = c.treasury.toLocaleString('ru') + ' фр.';
  document.getElementById('income').textContent = (c.income >= 0 ? '+' : '') + c.income.toLocaleString('ru') + ' фр.';
  document.getElementById('army').textContent = c.army.toLocaleString('ru');
  document.getElementById('stab').textContent = c.stability;
}

// Сменить главу государства/форму правления/премьер-министра ЛЮБОЙ страны сценария.
// Заменяет старую пару changePowerState (только игрок) + setForeignRuler (только ИИ, без стат).
function setCountryLeader(country, fields) {
  const c = countries[country];
  if (!c || !fields) return;
  Object.assign(c, fields);
  if (country === playerCountry) renderPlayerPowerPanel();
}

// Обновить левую панель власти (правитель/титул/форма правления/премьер) для страны игрока
function renderPlayerPowerPanel() {
  const c = countries[playerCountry];
  if (!c) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('ruler-name', c.ruler);
  set('ruler-title', c.rulerTitle);
  set('pm-name', c.pm);
  set('pm-title', c.pmTitle);
  const govbadge = document.getElementById('govbadge-text');
  if (govbadge) govbadge.textContent = '🏛 ' + c.government;
}

async function nextTurn() {
  const btn = document.querySelector('.next-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Симуляция...';

  turn++; month++;
  if (month >= 12) { month = 0; year++; }
  countries[playerCountry].treasury += countries[playerCountry].income;
  renderPlayerStats();

  document.getElementById('date-disp').textContent = months[month] + ' ' + year + ' г.';
  document.getElementById('turn-info').textContent = 'Ход ' + turn;

  // Запускаем ИИ-события
  await onTurnEnd();

  saveGame();

  btn.disabled = false;
  btn.textContent = 'Следующий месяц ▶';
}

// Передать территорию другому владельцу (вызывается из EFFECTS.territory_transfer). Страна не
// удаляется из реестра countries — помечается как аннексированная, чтобы ИИ и панели переставали
// считать её самостоятельным игроком, но история/подписи на карте оставались доступны.
function transferTerritory(countryName, newOwner) {
  if (!ALL_COUNTRIES.includes(countryName) || !ALL_COUNTRIES.includes(newOwner)) return;
  territoryOwners[countryName] = newOwner;
  if (countries[countryName]) { countries[countryName].annexed = true; countries[countryName].annexedBy = newOwner; }
  // Страна аннексирована целиком — переносим ВСЕ её провинции на нового владельца тоже,
  // иначе карта провинций разойдётся с таблицей владения странами.
  if (typeof scenarioProvinces !== 'undefined') {
    scenarioProvinces.forEach(p => {
      const currentOwner = provinceOwners[p.id] || p.owner;
      if (currentOwner === countryName) provinceOwners[p.id] = newOwner;
    });
  }
  if (typeof renderTerritoryColors === 'function') renderTerritoryColors();
}

function territoryOwnerOf(countryName) {
  return territoryOwners[countryName] || countryName;
}

// Передать ОДНУ провинцию другому владельцу (вызывается из EFFECTS.province_transfer).
// provinceKey ищется сначала по id (точное совпадение), потом по названию (без учёта регистра) —
// ИИ обычно ссылается на провинцию по имени, а не по служебному id.
function transferProvince(provinceKey, newOwner) {
  if (typeof scenarioProvinces === 'undefined' || !ALL_COUNTRIES.includes(newOwner)) return null;
  const p = scenarioProvinces.find(x => x.id === provinceKey) ||
            scenarioProvinces.find(x => x.name.toLowerCase() === String(provinceKey).toLowerCase());
  if (!p) return null;
  const oldOwner = provinceOwners[p.id] || p.owner;
  if (oldOwner === newOwner) return null;
  provinceOwners[p.id] = newOwner;
  if (typeof renderTerritoryColors === 'function') renderTerritoryColors();
  return { name: p.name, oldOwner };
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
        const savedPlayerCountry = d.playerCountry || 'Франция';
        const ruler = d.countries && d.countries[savedPlayerCountry] ? d.countries[savedPlayerCountry].ruler
          : (d.stateOfPower ? d.stateOfPower.ruler : ''); // старый формат сейва (до countries)
        const treasury = d.countries && d.countries[savedPlayerCountry] ? d.countries[savedPlayerCountry].treasury : d.treasury;
        saves.push({
          id: k.slice(SAVE_PREFIX.length),
          country: savedPlayerCountry,
          ruler,
          turn: d.turn, year: d.year, month: d.month,
          treasury,
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
    const data = {
      turn, month, year,
      countries,
      playerCountry,
      playerCountryDisplayName,
      territoryOwners,
      provinceOwners,
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

// Сборка countries из СТАРОГО формата сейва (до появления единого реестра стран) — тогда у игрока
// были stateOfPower+DOM-числа, а у ИИ-стран только countryRulers без казны/армии/стабильности,
// так что для ИИ эти числа берём из COUNTRY_DEFAULTS (других данных о них никогда не сохранялось).
function migrateLegacySaveToCountries(d) {
  buildCountriesFromDefaults();
  const pc = d.playerCountry || 'Франция';
  if (d.stateOfPower) {
    Object.assign(countries[pc], d.stateOfPower, {
      treasury: d.treasury, income: d.incomePerMonth, army: d.army, stability: d.stability
    });
  }
  if (d.playerCountryDisplayName) countries[pc].displayName = d.playerCountryDisplayName;
  if (d.countryRulers) {
    Object.entries(d.countryRulers).forEach(([c, fields]) => {
      if (countries[c] && c !== pc) Object.assign(countries[c], fields);
    });
  }
  if (d.countryColorOverrides) {
    Object.entries(d.countryColorOverrides).forEach(([c, color]) => {
      if (countries[c]) countries[c].colorOverride = color;
    });
  }
  if (d.territoryOwners) {
    Object.entries(d.territoryOwners).forEach(([c, newOwner]) => {
      if (countries[c]) { countries[c].annexed = true; countries[c].annexedBy = newOwner; }
    });
  }
}

function loadGameSlot(id) {
  const raw = localStorage.getItem(SAVE_PREFIX + id);
  if (!raw) return false;
  try {
    const d = JSON.parse(raw);
    currentSlotId = id;
    turn = d.turn; month = d.month; year = d.year;
    playerCountry = d.playerCountry || 'Франция';
    playerCountryDisplayName = d.playerCountryDisplayName || playerCountry;
    territoryOwners = d.territoryOwners || {};
    provinceOwners = d.provinceOwners || {};

    if (d.countries) {
      countries = d.countries;
      ALL_COUNTRIES.forEach(c => { if (!countries[c]) countries[c] = { ...COUNTRY_DEFAULTS[c], displayName: c, colorOverride: null, annexed: false, annexedBy: null }; });
    } else {
      migrateLegacySaveToCountries(d); // сейв в старом формате (stateOfPower/countryRulers)
    }
    if (!countries[playerCountry].rulerTitle) countries[playerCountry].rulerTitle = COUNTRY_DEFAULTS[playerCountry].rulerTitle;
    if (!countries[playerCountry].pmTitle) countries[playerCountry].pmTitle = COUNTRY_DEFAULTS[playerCountry].pmTitle;

    if (typeof updateMapCountryLabel === 'function') {
      ALL_COUNTRIES.forEach(c => updateMapCountryLabel(c, countries[c].displayName));
    }
    if (typeof renderTerritoryColors === 'function') renderTerritoryColors();

    worldState = d.worldState || worldState;
    if (!worldState.mapObjects) worldState.mapObjects = [];
    playerActions = d.playerActions || [];
    if (typeof advisorHistory !== 'undefined') advisorHistory = d.advisorHistory || [];
    if (typeof diplomacyHistories !== 'undefined') {
      Object.keys(diplomacyHistories).forEach(k => delete diplomacyHistories[k]);
      Object.assign(diplomacyHistories, d.diplomacyHistories || {});
    }

    document.getElementById('date-disp').textContent = months[month] + ' ' + year + ' г.';
    document.getElementById('turn-info').textContent = 'Ход ' + turn;

    renderPlayerStats();
    renderPlayerPowerPanel();
    updateCountryInfoPanel(playerCountry);
    renameCountry(playerCountry, countries[playerCountry].displayName);

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

  // Все 6 стран сценария (игрок и ИИ) заводятся одинаково — единый реестр countries.
  buildCountriesFromDefaults();

  turn = 1; month = 0; year = 1852;
  territoryOwners = {};
  provinceOwners = {};

  // Сбрасываем подписи стран на карте к каноническим названиям — иначе переименование
  // из ПРЕДЫДУЩЕЙ партии (например Пруссия → "Германская империя") оставалось видно и в новой игре
  if (typeof updateMapCountryLabel === 'function') {
    ALL_COUNTRIES.forEach(c => updateMapCountryLabel(c, c));
  }
  if (typeof renderTerritoryColors === 'function') renderTerritoryColors();

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

  document.getElementById('date-disp').textContent = months[month] + ' ' + year + ' г.';
  document.getElementById('turn-info').textContent = 'Ход ' + turn;

  renderPlayerStats();
  renderPlayerPowerPanel();
  updateCountryInfoPanel(playerCountry);
  renameCountry(playerCountry, playerCountryDisplayName);

  document.getElementById('events-box').style.display = 'none';
  document.getElementById('changes-box').style.display = 'none';
  document.getElementById('adv-messages').innerHTML = `<div class="adv-msg advisor">🎭 Ваше Превосходительство, готов отвечать на ваши вопросы о положении ${playerCountry === 'Франция' ? 'Франции' : playerCountry === 'Испания' ? 'Испании' : playerCountry === 'Великобритания' ? 'Великобритании' : playerCountry === 'Россия' ? 'России' : playerCountry === 'Австрия' ? 'Австрии' : 'Пруссии'}.</div>`;

  renderActionsList();
  if (typeof renderMapObjects === 'function') renderMapObjects();
  if (typeof renderTerritoryColors === 'function') renderTerritoryColors();
  if (typeof renderCountryList === 'function') renderCountryList();
}
