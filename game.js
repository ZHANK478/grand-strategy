// ============================================================
// GAME.JS — ходы, страны (динамически из сценария), экономика
// (бюджет/долг/инфляция), провинциальные доходы, возраст
// правителей, парламент, сохранения (слоты), меню
// ============================================================

let turn = 1, month = 0, year = 1852;
const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

let gameStarted = false;
const SAVE_PREFIX = 'gs1852_save_';
let currentSlotId = null;

// Страны текущего сценария — БОЛЬШЕ НЕ ХАРДКОД: список строится из владельцев провинций
// активного сценария (applyScenarioToGame). Сценарий с 100 странами даст 100 стран.
let ALL_COUNTRIES = [];

// За кого сейчас играет игрок — выбирается в главном меню кликом по стране
let playerCountry = 'Франция'; // канонический ключ для карты/цветов/отношений — не меняется
let playerCountryDisplayName = 'Франция'; // отображаемое название — может меняться через события ИИ

// ============================================================
// СЦЕНАРИЙ → СПИСОК СТРАН. Вызывается из map.js после загрузки активного сценария
// (встроенного scenario_1852.json или созданного в редакторе и сохранённого в браузере).
// ============================================================
function applyScenarioToGame(data) {
  ALL_COUNTRIES = [...new Set((data.provinces || []).map(p => p.owner).filter(Boolean))];
  const hint = document.getElementById('menu-hint');
  if (hint && !gameStarted) {
    hint.textContent = `Сценарий: «${data.name || 'Европа 1852'}», ${data.year || 1852} г. — нажмите на страну на карте, чтобы начать за неё игру`;
  }
}

// Переименовать любую страну сценария (например Пруссия → "Германская империя").
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
let territoryOwners = {};

// Владелец каждой ПРОВИНЦИИ сценария (id -> страна), хранит только ОТЛИЧИЯ от исходного
// владельца из активного сценария.
let provinceOwners = {};

// Экономика каждой провинции: id -> { income, dev }. Доход страны складывается из доходов
// её провинций + incomeModifier (торговля/налоги/структурные изменения от ИИ) — потеря или
// захват провинции теперь РЕАЛЬНО двигает доход, а не остаётся картинкой на карте.
let provinceEcon = {};

function setCountryColor(country, hexColor) {
  if (!country || !countries[country] || !/^#[0-9a-fA-F]{6}$/.test(hexColor || '')) return;
  countries[country].colorOverride = hexColor;
  if (typeof renderTerritoryColors === 'function') renderTerritoryColors();
}

// ============================================================
// СТАРТОВЫЕ ДАННЫЕ известных стран встроенного сценария 1852 года. Это НЕ ограничение
// списка стран, а исторические данные для точности: любая страна сценария, которой здесь
// нет, получает профиль от ИИ (generateCountryProfiles в ai.js) под год сценария.
// ============================================================
const COUNTRY_DEFAULTS = {
  'Франция':         { ruler:'Луи-Наполеон Бонапарт', rulerAge:44, rulerTitle:'Президент Французской республики', government:'Президентская республика', pm:'Эжен Руэр', pmTitle:'Министр-президент', treasury:4200, income:580, army:400000, stability:81,
    pop:'35.8 млн', area:'551 000 км²', capital:'Париж', gdp:'~14 млрд фр.', blurb:'Франция в 1852 году переживает переходный период. Луи-Наполеон готовится провозгласить Вторую империю. Экономика растёт, но политическое напряжение высоко.',
    parliament:{ name:'Законодательный корпус', support:67, factions:[{name:'Бонапартисты',pct:67},{name:'Республиканцы',pct:18},{name:'Монархисты',pct:15}] } },
  'Великобритания':  { ruler:'Королева Виктория', rulerAge:33, rulerTitle:'Королева Соединённого Королевства', government:'Конституционная монархия', pm:'Лорд Абердин', pmTitle:'Премьер-министр', treasury:5000, income:650, army:250000, stability:78,
    pop:'27.5 млн', area:'315 000 км²', capital:'Лондон', gdp:'~20 млрд фр.', blurb:'Великобритания в 1852 году — ведущая промышленная держава мира с крупнейшим флотом и обширными колониями.',
    parliament:{ name:'Парламент', support:54, factions:[{name:'Виги/Пилиты',pct:52},{name:'Тори',pct:42},{name:'Радикалы',pct:6}] } },
  'Россия':          { ruler:'Николай I', rulerAge:56, rulerTitle:'Император Всероссийский', government:'Абсолютная монархия', pm:'Карл Нессельроде', pmTitle:'Государственный канцлер', treasury:3800, income:500, army:900000, stability:70,
    pop:'68 млн', area:'~18 млн км²', capital:'Санкт-Петербург', gdp:'~11 млрд фр.', blurb:'Российская империя в 1852 году — крупнейшая по территории и армии держава Европы. Крепостное право сдерживает экономику.',
    parliament:null },
  'Австрия':         { ruler:'Франц Иосиф I', rulerAge:22, rulerTitle:'Император Австрийский', government:'Абсолютная монархия', pm:'Феликс Шварценберг', pmTitle:'Министр-президент', treasury:2900, income:420, army:400000, stability:65,
    pop:'36 млн', area:'~700 000 км²', capital:'Вена', gdp:'~8 млрд фр.', blurb:'Австрийская империя в 1852 году — многонациональная держава, ещё не оправившаяся от революций 1848 года.',
    parliament:null },
  'Пруссия':         { ruler:'Фридрих Вильгельм IV', rulerAge:57, rulerTitle:'Король Пруссии', government:'Конституционная монархия', pm:'Отто фон Мантойфель', pmTitle:'Министр-президент', treasury:3200, income:460, army:300000, stability:74,
    pop:'17 млн', area:'~280 000 км²', capital:'Берлин', gdp:'~7 млрд фр.', blurb:'Пруссия в 1852 году усиливает влияние среди немецких государств через Таможенный союз.',
    parliament:{ name:'Ландтаг', support:60, factions:[{name:'Консерваторы',pct:55},{name:'Либералы',pct:30},{name:'Католики',pct:15}] } },
  'Испания':         { ruler:'Изабелла II', rulerAge:22, rulerTitle:'Королева Испании', government:'Конституционная монархия', pm:'Хуан Браво Мурильо', pmTitle:'Председатель совета министров', treasury:1800, income:280, army:150000, stability:60,
    pop:'15.5 млн', area:'~500 000 км²', capital:'Мадрид', gdp:'~4 млрд фр.', blurb:'Испания в 1852 году переживает политическую нестабильность после десятилетий гражданских войн.',
    parliament:{ name:'Кортесы', support:48, factions:[{name:'Модерадос',pct:58},{name:'Прогрессисты',pct:32},{name:'Карлисты',pct:10}] } }
};

// Обновить левую панель (население/площадь/столица/ВВП/описание) под текущую страну игрока —
// данные берутся из объекта страны (сид или профиль от ИИ), не из хардкода.
function updateCountryInfoPanel(country) {
  const d = countries[country];
  if (!d) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
  set('country-pop', d.pop);
  set('country-area', d.area);
  set('country-capital', d.capital);
  set('country-gdp', d.gdp);
  set('country-blurb', d.blurb);
  const badge = document.getElementById('country-name-badge');
  if (badge) badge.textContent = '🏳️ ' + (d.displayName || country);
}

// ============================================================
// СТРАНЫ — единый реестр состояния ВСЕХ стран сценария (игрока и ИИ).
// ============================================================
let countries = {};

// Детерминированный псевдослучайный [0..1) из строки — чтобы экономика провинций
// была одинаковой при каждой загрузке одного и того же сценария.
function hashRand(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

// Заготовка страны, о которой у нас нет исторических данных: правдоподобные средние числа,
// пока ИИ не пришлёт полноценный профиль (правителя, возраст, интересы, парламент).
function placeholderCountry(name) {
  const r = hashRand(name);
  return {
    ruler: 'Правительство ' + name, rulerAge: null, rulerTitle: 'Глава государства',
    government: 'Монархия', pm: '—', pmTitle: 'Глава правительства',
    treasury: 1200 + Math.round(r * 2500), income: 180 + Math.round(r * 300),
    army: 40000 + Math.round(r * 160000), stability: 55 + Math.round(r * 20),
    pop: '', area: '', capital: '', gdp: '', blurb: 'Сведения об этой стране собираются...',
    parliament: null, profilePending: true
  };
}

function normalizeCountry(c) {
  if (c.debt === undefined) c.debt = 0;
  if (c.inflation === undefined) c.inflation = 0;
  if (c.incomeModifier === undefined) c.incomeModifier = null; // выставится в initProvinceEconomy/recomputeIncomes
  if (c.agenda === undefined) c.agenda = '';
  if (c.rulerAge === undefined) c.rulerAge = null;
  if (c.rulerSince === undefined) c.rulerSince = null;
  if (c.parliament === undefined) c.parliament = null;
  if (c.portrait === undefined) c.portrait = null;
  if (c.pendingSuccession === undefined) c.pendingSuccession = false;
  return c;
}

function buildCountriesFromScenario() {
  countries = {};
  ALL_COUNTRIES.forEach(c => {
    const d = COUNTRY_DEFAULTS[c] || placeholderCountry(c);
    countries[c] = normalizeCountry({
      displayName: c,
      ruler: d.ruler, rulerAge: d.rulerAge, rulerSince: year, rulerTitle: d.rulerTitle,
      government: d.government, pm: d.pm, pmTitle: d.pmTitle,
      treasury: d.treasury, income: d.income, army: d.army, stability: d.stability,
      pop: d.pop, area: d.area, capital: d.capital, gdp: d.gdp, blurb: d.blurb,
      parliament: d.parliament ? JSON.parse(JSON.stringify(d.parliament)) : null,
      agenda: '', profilePending: !!d.profilePending,
      colorOverride: null, portrait: null,
      annexed: false, annexedBy: null
    });
  });
}

// ============================================================
// ЭКОНОМИКА ПРОВИНЦИЙ: доход страны = incomeModifier + Σ доходов её провинций.
// ============================================================
function initProvinceEconomy() {
  provinceEcon = {};
  if (typeof scenarioProvinces === 'undefined') return;
  const byOwner = {};
  scenarioProvinces.forEach(p => {
    const key = p.owner || '__neutral';
    (byOwner[key] = byOwner[key] || []).push(p);
  });
  ALL_COUNTRIES.forEach(c => {
    const provs = byOwner[c] || [];
    const base = countries[c].income;
    const share = Math.round(base * 0.65); // 65% дохода — с земли, остальное торговля/пошлины
    const weights = provs.map(p => 0.35 + hashRand(p.id));
    const tw = weights.reduce((s, w) => s + w, 0) || 1;
    let sum = 0;
    provs.forEach((p, i) => {
      const inc = Math.max(4, Math.round(share * weights[i] / tw));
      provinceEcon[p.id] = { income: inc, dev: 1 + Math.round(hashRand(p.id + 'd') * 4) };
      sum += inc;
    });
    countries[c].incomeModifier = base - sum;
  });
  (byOwner['__neutral'] || []).forEach(p => {
    provinceEcon[p.id] = { income: 6 + Math.round(hashRand(p.id) * 35), dev: 1 + Math.round(hashRand(p.id + 'd') * 3) };
  });
}

// Пересчитать доход всех стран из провинций (после аннексий/передач/роста провинций)
function recomputeIncomes() {
  if (typeof scenarioProvinces === 'undefined') return;
  const sums = {};
  scenarioProvinces.forEach(p => {
    const owner = provinceOwners[p.id] || p.owner;
    if (!owner || !countries[owner]) return;
    const e = provinceEcon[p.id];
    if (e) sums[owner] = (sums[owner] || 0) + e.income;
  });
  ALL_COUNTRIES.forEach(c => {
    const cc = countries[c];
    if (!cc || cc.annexed) return;
    if (cc.incomeModifier === null || cc.incomeModifier === undefined) cc.incomeModifier = Math.round(cc.income * 0.35);
    cc.income = cc.incomeModifier + (sums[c] || 0);
  });
}

// ============================================================
// БЮДЖЕТ / ДОЛГ / ИНФЛЯЦИЯ — детерминированная симуляция каждый ход для ВСЕХ стран.
// Содержание армии и проценты по долгу — реальные строки расходов; дефицит автоматически
// покрывается займами, долг раскручивает инфляцию, инфляция и долг бьют по стабильности.
// Благодаря этому ИИ-нарратор получает НАСТОЯЩИЕ числа и не выдумывает "долги и инфляцию"
// при профицитном бюджете.
// ============================================================
const ARMY_UPKEEP_RATE = 0.00045;  // фр./солдат в месяц
const DEBT_INTEREST_RATE = 0.005;  // 0.5% в месяц (~6% годовых)

function simulateCountryEconomy(c) {
  const upkeep = Math.round(c.army * ARMY_UPKEEP_RATE);
  const interest = Math.round(c.debt * DEBT_INTEREST_RATE);
  const gross = c.income;
  const net = gross - upkeep - interest;
  c.treasury += net;
  let borrowed = 0;
  if (c.treasury < 0) { borrowed = -c.treasury; c.debt += borrowed; c.treasury = 0; }
  // Профицит понемногу гасит долг сам (обслуживание), если казна крепкая
  if (c.debt > 0 && c.treasury > gross * 3) {
    const repay = Math.min(c.debt, Math.round(gross * 0.1));
    c.debt -= repay; c.treasury -= repay;
  }
  const debtRatio = c.debt / Math.max(1, gross * 12); // долг в годовых доходах
  const pressure = debtRatio * 6 + (net < 0 ? 1.5 : 0);
  c.inflation = Math.max(0, Math.min(60, Math.round((c.inflation + (pressure - c.inflation) * 0.15) * 10) / 10));
  if (c.inflation > 12) c.stability = Math.max(0, c.stability - 1);
  if (debtRatio > 1.5) c.stability = Math.max(0, c.stability - 1);
  // Парламент: правительство без поддержки постепенно теряет стабильность
  if (c.parliament && typeof c.parliament.support === 'number' && c.parliament.support < 35) {
    c.stability = Math.max(0, c.stability - 1);
  }
  c.lastBudget = { gross, upkeep, interest, net, borrowed };
  return c.lastBudget;
}

// Медленный органический рост провинций стабильных стран (раз в ход, крохотный)
function growProvinces() {
  if (typeof scenarioProvinces === 'undefined') return;
  scenarioProvinces.forEach(p => {
    const owner = provinceOwners[p.id] || p.owner;
    if (!owner || !countries[owner] || countries[owner].annexed) return;
    const e = provinceEcon[p.id];
    if (!e) return;
    const st = countries[owner].stability;
    if (st > 70 && hashRand(p.id + turn) < 0.25) e.income += 1;
    else if (st < 30 && hashRand(p.id + turn) < 0.2 && e.income > 4) e.income -= 1;
  });
}

function simulateWorldEconomy() {
  growProvinces();
  recomputeIncomes();
  const changes = [];
  ALL_COUNTRIES.forEach(c => {
    const cc = countries[c];
    if (!cc || cc.annexed) return;
    const b = simulateCountryEconomy(cc);
    if (c === playerCountry) {
      changes.push({ label: '💰 Бюджет месяца', value: (b.net >= 0 ? '+' : '') + b.net.toLocaleString('ru') + ' фр.', sign: b.net });
      if (b.upkeep) changes.push({ label: '⚔️ Содержание армии', value: '-' + b.upkeep.toLocaleString('ru') + ' фр.', sign: 0 });
      if (b.interest) changes.push({ label: '🏦 Проценты по долгу', value: '-' + b.interest.toLocaleString('ru') + ' фр.', sign: -1 });
      if (b.borrowed) changes.push({ label: '🏦 Новый заём', value: '+' + b.borrowed.toLocaleString('ru') + ' фр. долга', sign: -1 });
    }
  });
  return changes;
}

// ============================================================
// ВОЗРАСТ И СМЕРТЬ ПРАВИТЕЛЕЙ. Возраст растёт каждый январь; с возрастом растёт месячный
// шанс естественной смерти. Смерть — факт движка: ИИ обязан описать её и назначить преемника
// (с возрастом), иначе движок ставит регентство сам.
// ============================================================
function checkRulerDeaths() {
  const deaths = [];
  ALL_COUNTRIES.forEach(c => {
    const cc = countries[c];
    if (!cc || cc.annexed || typeof cc.rulerAge !== 'number') return;
    if (month === 0) cc.rulerAge += 1;
    let p = Math.max(0, (cc.rulerAge - 62) * 0.0035);
    if (cc.rulerAge > 85) p += 0.04;
    if (Math.random() < p) {
      deaths.push({ country: c, ruler: cc.ruler, age: cc.rulerAge, title: cc.rulerTitle });
      cc.pendingSuccession = true;
      removeRulerFromMap(c, cc.ruler);
    }
  });
  return deaths;
}

// «Статус на карте» умершего: убрать связанные с персоной объекты (делегации/персоны)
function removeRulerFromMap(country, rulerName) {
  if (typeof worldState === 'undefined' || !worldState.mapObjects || !rulerName) return;
  const before = worldState.mapObjects.length;
  worldState.mapObjects = worldState.mapObjects.filter(o =>
    !(o.type === 'diplomat' && o.label && o.label.includes(rulerName)));
  if (before !== worldState.mapObjects.length && typeof renderMapObjects === 'function') renderMapObjects();
}

// Если ИИ не назначил преемника умершему правителю — движок ставит регентство,
// чтобы страна не осталась с "живым мертвецом" во главе.
function resolvePendingSuccessions() {
  ALL_COUNTRIES.forEach(c => {
    const cc = countries[c];
    if (!cc || !cc.pendingSuccession) return;
    cc.ruler = 'Регентский совет';
    cc.rulerTitle = 'Временное регентство';
    cc.rulerAge = null;
    cc.rulerSince = year;
    cc.portrait = null;
    cc.pendingSuccession = false;
    if (c === playerCountry) renderPlayerPowerPanel();
  });
}

// ============================================================
// Изменение показателей и власти
// ============================================================
function changeCountryStat(country, stat, delta) {
  const c = countries[country];
  if (!c || !delta) return;
  if (stat === 'treasury') c.treasury += delta;
  if (stat === 'income') c.incomeModifier = (c.incomeModifier || 0) + delta; // структурные изменения — в модификатор, чтобы не спорить с провинциями
  if (stat === 'debt') c.debt = Math.max(0, c.debt + delta);
  if (stat === 'army') c.army = Math.max(0, c.army + delta);
  if (stat === 'stability') c.stability = Math.max(0, Math.min(100, c.stability + delta));
  if (stat === 'income') recomputeIncomes();
  if (country === playerCountry) renderPlayerStats();
}

// Обновить верхнюю панель (казна/доход/армия/стабильность/долг/инфляция) страны игрока
function renderPlayerStats() {
  const c = countries[playerCountry];
  if (!c) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('treasury', c.treasury.toLocaleString('ru') + ' фр.');
  set('income', (c.income >= 0 ? '+' : '') + c.income.toLocaleString('ru') + ' фр.');
  set('army', c.army.toLocaleString('ru'));
  set('stab', String(c.stability));
  set('debt', c.debt > 0 ? c.debt.toLocaleString('ru') + ' фр.' : '—');
  set('infl', c.inflation > 0 ? c.inflation.toFixed(1) + '%' : '0%');
}

// Сменить главу государства/форму правления/премьера ЛЮБОЙ страны сценария.
function setCountryLeader(country, fields) {
  const c = countries[country];
  if (!c || !fields) return;
  const rulerChanged = fields.ruler && fields.ruler !== c.ruler;
  Object.assign(c, fields);
  if (rulerChanged) {
    c.pendingSuccession = false;
    c.rulerSince = year;
    c.portrait = null;
    // Новому правителю ИИ должен дать возраст (ruler_age); если не дал — назначаем сами
    if (fields.rulerAge === undefined || typeof c.rulerAge !== 'number') {
      c.rulerAge = 35 + Math.round(Math.random() * 30);
    }
    if (country === playerCountry && typeof maybeAutoPortrait === 'function') maybeAutoPortrait(country);
  }
  if (country === playerCountry) renderPlayerPowerPanel();
}

// Обновить левую панель власти (правитель/возраст/титул/форма правления/премьер/парламент)
function renderPlayerPowerPanel() {
  const c = countries[playerCountry];
  if (!c) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('ruler-name', c.ruler);
  set('ruler-title', c.rulerTitle);
  set('pm-name', c.pm);
  set('pm-title', c.pmTitle);
  set('ph-age', typeof c.rulerAge === 'number' ? c.rulerAge + ' лет' : '—');
  set('ph-since', c.rulerSince ? c.rulerSince + ' г.' : '—');
  set('ph-gov', c.government);
  const govbadge = document.getElementById('govbadge-text');
  if (govbadge) govbadge.textContent = '🏛 ' + c.government;
  if (typeof renderRulerPortrait === 'function') renderRulerPortrait();
  if (typeof renderParliamentPanel === 'function') renderParliamentPanel();
}

async function nextTurn() {
  const btn = document.querySelector('.next-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Симуляция...';

  turn++; month++;
  if (month >= 12) { month = 0; year++; }

  const econChanges = simulateWorldEconomy();
  const deaths = checkRulerDeaths();
  renderPlayerStats();

  document.getElementById('date-disp').textContent = months[month] + ' ' + year + ' г.';
  document.getElementById('turn-info').textContent = 'Ход ' + turn;

  // Смерть правителя — крупное событие: показываем сразу, ИИ обязан отработать преемника
  deaths.forEach(d => {
    worldState.pastEvents.push(`${months[month]} ${year}: скончался ${d.title} ${d.ruler} (${d.country}) в возрасте ${d.age} лет.`);
    if (typeof showBreakingNews === 'function') {
      showBreakingNews('УМЕР ' + (d.title || 'ПРАВИТЕЛЬ').toUpperCase(),
        `${d.ruler} (${d.country}) скончался в возрасте ${d.age} лет. Страна ждёт преемника.`);
    }
  });

  // Запускаем ИИ-события (получают экономику и смерти этого хода)
  await onTurnEnd(econChanges, deaths);

  resolvePendingSuccessions();
  renderPlayerStats();
  saveGame();

  btn.disabled = false;
  btn.textContent = 'Следующий месяц ▶';
}

// Передать территорию (страну целиком) другому владельцу
function transferTerritory(countryName, newOwner) {
  if (!ALL_COUNTRIES.includes(countryName) || !ALL_COUNTRIES.includes(newOwner)) return;
  territoryOwners[countryName] = newOwner;
  if (countries[countryName]) { countries[countryName].annexed = true; countries[countryName].annexedBy = newOwner; }
  if (typeof scenarioProvinces !== 'undefined') {
    scenarioProvinces.forEach(p => {
      const currentOwner = provinceOwners[p.id] || p.owner;
      if (currentOwner === countryName) provinceOwners[p.id] = newOwner;
    });
  }
  recomputeIncomes();
  if (typeof renderTerritoryColors === 'function') renderTerritoryColors();
}

function territoryOwnerOf(countryName) {
  return territoryOwners[countryName] || countryName;
}

// Передать ОДНУ провинцию другому владельцу
function transferProvince(provinceKey, newOwner) {
  if (typeof scenarioProvinces === 'undefined' || !ALL_COUNTRIES.includes(newOwner)) return null;
  const p = scenarioProvinces.find(x => x.id === provinceKey) ||
            scenarioProvinces.find(x => x.name.toLowerCase() === String(provinceKey).toLowerCase());
  if (!p) return null;
  const oldOwner = provinceOwners[p.id] || p.owner;
  if (oldOwner === newOwner) return null;
  provinceOwners[p.id] = newOwner;
  recomputeIncomes();
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
          : (d.stateOfPower ? d.stateOfPower.ruler : '');
        const treasury = d.countries && d.countries[savedPlayerCountry] ? d.countries[savedPlayerCountry].treasury : d.treasury;
        saves.push({
          id: k.slice(SAVE_PREFIX.length),
          country: savedPlayerCountry,
          ruler,
          scenarioName: d.scenarioName || 'Европа 1852',
          turn: d.turn, year: d.year, month: d.month,
          treasury: treasury || 0,
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

// Портреты (base64) в localStorage не влезают при нескольких слотах — при переполнении
// пересохраняем без них (они регенерируются кнопкой/автоматически).
function saveGame() {
  try {
    if (!currentSlotId) currentSlotId = 'slot_' + Date.now();
    const data = {
      version: 3,
      turn, month, year,
      scenarioRef: (typeof activeScenarioRef !== 'undefined') ? activeScenarioRef : 'builtin',
      scenarioName: (typeof activeScenario !== 'undefined' && activeScenario) ? activeScenario.name : 'Европа 1852',
      countries,
      playerCountry,
      playerCountryDisplayName,
      territoryOwners,
      provinceOwners,
      provinceEcon,
      worldState,
      playerActions,
      advisorHistory: typeof advisorHistory !== 'undefined' ? advisorHistory : [],
      diplomacyHistories: typeof diplomacyHistories !== 'undefined' ? diplomacyHistories : {},
      savedAt: Date.now()
    };
    try {
      localStorage.setItem(SAVE_PREFIX + currentSlotId, JSON.stringify(data));
    } catch (quotaErr) {
      const slim = JSON.parse(JSON.stringify(data));
      Object.values(slim.countries).forEach(c => { c.portrait = null; });
      localStorage.setItem(SAVE_PREFIX + currentSlotId, JSON.stringify(slim));
    }
  } catch (e) {
    console.log('Ошибка сохранения:', e.message);
  }
}

// Сборка countries из СТАРОГО формата сейва (до единого реестра стран)
function migrateLegacySaveToCountries(d) {
  buildCountriesFromScenario();
  const pc = d.playerCountry || 'Франция';
  if (!countries[pc]) countries[pc] = normalizeCountry(placeholderCountry(pc));
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

async function loadGameSlot(id) {
  const raw = localStorage.getItem(SAVE_PREFIX + id);
  if (!raw) return false;
  try {
    const d = JSON.parse(raw);

    // Сначала подгружаем сценарий этой партии (карта, список стран), потом состояние
    const ref = d.scenarioRef || 'builtin';
    if (typeof switchActiveScenario === 'function' && (typeof activeScenarioRef === 'undefined' || activeScenarioRef !== ref)) {
      try { await switchActiveScenario(ref); }
      catch (e) { console.log('Сценарий сейва недоступен, остаёмся на текущем:', e.message); }
    }

    currentSlotId = id;
    turn = d.turn; month = d.month; year = d.year;
    playerCountry = d.playerCountry || 'Франция';
    playerCountryDisplayName = d.playerCountryDisplayName || playerCountry;
    territoryOwners = d.territoryOwners || {};
    provinceOwners = d.provinceOwners || {};
    provinceEcon = d.provinceEcon || {};

    if (d.countries) {
      countries = d.countries;
      ALL_COUNTRIES.forEach(c => { if (!countries[c]) countries[c] = normalizeCountry({ ...(COUNTRY_DEFAULTS[c] || placeholderCountry(c)), displayName: c, colorOverride: null, annexed: false, annexedBy: null }); });
      Object.values(countries).forEach(normalizeCountry);
    } else {
      migrateLegacySaveToCountries(d); // сейв в старом формате
    }
    if (!countries[playerCountry]) countries[playerCountry] = normalizeCountry(placeholderCountry(playerCountry));
    if (!countries[playerCountry].rulerTitle) countries[playerCountry].rulerTitle = 'Глава государства';
    if (!countries[playerCountry].pmTitle) countries[playerCountry].pmTitle = 'Глава правительства';

    if (Object.keys(provinceEcon).length === 0) initProvinceEconomy(); // старый сейв без экономики провинций
    recomputeIncomes();

    if (typeof updateMapCountryLabel === 'function') {
      ALL_COUNTRIES.forEach(c => { if (countries[c]) updateMapCountryLabel(c, countries[c].displayName); });
    }
    if (typeof renderTerritoryColors === 'function') renderTerritoryColors();

    worldState = d.worldState || worldState;
    if (!worldState.mapObjects) worldState.mapObjects = [];
    if (!worldState.relationsAmong) worldState.relationsAmong = {};
    if (!worldState.aiWars) worldState.aiWars = [];
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
    if (typeof queueMissingProfiles === 'function') queueMissingProfiles();
    return true;
  } catch (e) {
    console.log('Ошибка загрузки:', e.message);
    return false;
  }
}

function deleteSave(id) {
  localStorage.removeItem(SAVE_PREFIX + id);
}

// country — за кого играем; страны и год берутся из АКТИВНОГО СЦЕНАРИЯ
function resetGame(country) {
  if (!ALL_COUNTRIES.length && typeof activeScenario !== 'undefined' && activeScenario) applyScenarioToGame(activeScenario);
  playerCountry = ALL_COUNTRIES.includes(country) ? country : (ALL_COUNTRIES[0] || 'Франция');
  playerCountryDisplayName = playerCountry;

  turn = 1; month = 0;
  year = (typeof activeScenario !== 'undefined' && activeScenario && activeScenario.year) ? activeScenario.year : 1852;
  territoryOwners = {};
  provinceOwners = {};

  buildCountriesFromScenario();
  initProvinceEconomy();
  recomputeIncomes();

  if (typeof updateMapCountryLabel === 'function') {
    ALL_COUNTRIES.forEach(c => updateMapCountryLabel(c, c));
  }
  if (typeof renderTerritoryColors === 'function') renderTerritoryColors();

  // Отношения игрока со всеми, плюс СКРЫТЫЕ отношения ИИ-стран между собой
  const relations = {};
  ALL_COUNTRIES.filter(c => c !== playerCountry).forEach(c => { relations[c] = 0; });
  const relationsAmong = {};
  const others = ALL_COUNTRIES.filter(c => c !== playerCountry);
  for (let i = 0; i < others.length; i++) {
    for (let j = i + 1; j < others.length; j++) {
      relationsAmong[others[i] + '␟' + others[j]] = 0;
    }
  }
  worldState = {
    relations,
    relationsAmong,
    aiWars: [],
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
  document.getElementById('adv-messages').innerHTML = `<div class="adv-msg advisor">🎭 Ваше Превосходительство, готов отвечать на ваши вопросы о положении страны ${playerCountry}.</div>`;

  renderActionsList();
  if (typeof renderMapObjects === 'function') renderMapObjects();
  if (typeof renderTerritoryColors === 'function') renderTerritoryColors();
  if (typeof renderCountryList === 'function') renderCountryList();

  // ИИ заполняет профили стран без исторических данных + интересы (agenda) всех стран
  if (typeof queueMissingProfiles === 'function') queueMissingProfiles();
  if (typeof maybeAutoPortrait === 'function') maybeAutoPortrait(playerCountry);
}

// Скрытые отношения двух ИИ-стран между собой
function mutualRelKey(a, b) { return a < b ? a + '␟' + b : b + '␟' + a; }
function changeMutualRelations(a, b, delta) {
  if (!worldState.relationsAmong) worldState.relationsAmong = {};
  const k = mutualRelKey(a, b);
  const v = worldState.relationsAmong[k] || 0;
  worldState.relationsAmong[k] = Math.max(-100, Math.min(100, v + delta));
}

// Если карта была загружена ДО game.js (микрозадача из localStorage) — применяем сценарий сейчас
if (typeof activeScenario !== 'undefined' && activeScenario) applyScenarioToGame(activeScenario);
