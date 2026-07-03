// ============================================================
// GAME.JS — ходы, страны (динамически из сценария), экономика
// (бюджет/долг/инфляция), провинциальные доходы, возраст
// правителей, парламент, сохранения (слоты), меню
// ============================================================

let turn = 1, month = 0, year = 1852, week = 0; // week 0-3 внутри месяца
const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

function dateLabel() {
  return (week > 0 ? `Неделя ${week + 1} · ` : '') + months[month] + ' ' + year + ' г.';
}
function renderDate() {
  document.getElementById('date-disp').textContent = dateLabel();
  document.getElementById('turn-info').textContent = 'Ход ' + turn;
}

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
    religion:{"main":"Католицизм","dist":{"Католицизм":97,"Протестантизм":2,"Иудаизм":1}}, rulerReligion:"Католицизм", pop:'35.8 млн', area:'551 000 км²', capital:'Париж', gdp:'~14 млрд фр.', blurb:'Франция в 1852 году переживает переходный период. Луи-Наполеон готовится провозгласить Вторую империю. Экономика растёт, но политическое напряжение высоко.',
    parliament:{ name:'Законодательный корпус', support:67, factions:[{name:'Бонапартисты',pct:67},{name:'Республиканцы',pct:18},{name:'Монархисты',pct:15}] } },
  'Великобритания':  { ruler:'Королева Виктория', rulerAge:33, rulerTitle:'Королева Соединённого Королевства', government:'Конституционная монархия', pm:'Лорд Абердин', pmTitle:'Премьер-министр', treasury:5000, income:650, army:250000, stability:78,
    religion:{"main":"Англиканство","dist":{"Англиканство":68,"Пресвитерианство":16,"Католицизм":12,"Иудаизм":1,"Прочие":3}}, rulerReligion:"Англиканство", pop:'27.5 млн', area:'315 000 км²', capital:'Лондон', gdp:'~20 млрд фр.', blurb:'Великобритания в 1852 году — ведущая промышленная держава мира с крупнейшим флотом и обширными колониями.',
    parliament:{ name:'Парламент', support:54, factions:[{name:'Виги/Пилиты',pct:52},{name:'Тори',pct:42},{name:'Радикалы',pct:6}] } },
  'Россия':          { ruler:'Николай I', rulerAge:56, rulerTitle:'Император Всероссийский', government:'Абсолютная монархия', pm:'Карл Нессельроде', pmTitle:'Государственный канцлер', treasury:3800, income:500, army:900000, stability:70,
    religion:{"main":"Православие","dist":{"Православие":72,"Ислам":9,"Католицизм":8,"Иудаизм":4,"Протестантизм":3,"Прочие":4}}, rulerReligion:"Православие", pop:'68 млн', area:'~18 млн км²', capital:'Санкт-Петербург', gdp:'~11 млрд фр.', blurb:'Российская империя в 1852 году — крупнейшая по территории и армии держава Европы. Крепостное право сдерживает экономику.',
    parliament:null },
  'Австрия':         { ruler:'Франц Иосиф I', rulerAge:22, rulerTitle:'Император Австрийский', government:'Абсолютная монархия', pm:'Феликс Шварценберг', pmTitle:'Министр-президент', treasury:2900, income:420, army:400000, stability:65,
    religion:{"main":"Католицизм","dist":{"Католицизм":78,"Православие":10,"Протестантизм":7,"Иудаизм":3,"Прочие":2}}, rulerReligion:"Католицизм", pop:'36 млн', area:'~700 000 км²', capital:'Вена', gdp:'~8 млрд фр.', blurb:'Австрийская империя в 1852 году — многонациональная держава, ещё не оправившаяся от революций 1848 года.',
    parliament:null },
  'Пруссия':         { ruler:'Фридрих Вильгельм IV', rulerAge:57, rulerTitle:'Король Пруссии', government:'Конституционная монархия', pm:'Отто фон Мантойфель', pmTitle:'Министр-президент', treasury:3200, income:460, army:300000, stability:74,
    religion:{"main":"Протестантизм","dist":{"Протестантизм":62,"Католицизм":34,"Иудаизм":1,"Прочие":3}}, rulerReligion:"Протестантизм", pop:'17 млн', area:'~280 000 км²', capital:'Берлин', gdp:'~7 млрд фр.', blurb:'Пруссия в 1852 году усиливает влияние среди немецких государств через Таможенный союз.',
    parliament:{ name:'Ландтаг', support:60, factions:[{name:'Консерваторы',pct:55},{name:'Либералы',pct:30},{name:'Католики',pct:15}] } },
  'Испания':         { ruler:'Изабелла II', rulerAge:22, rulerTitle:'Королева Испании', government:'Конституционная монархия', pm:'Хуан Браво Мурильо', pmTitle:'Председатель совета министров', treasury:1800, income:280, army:150000, stability:60,
    religion:{"main":"Католицизм","dist":{"Католицизм":99,"Прочие":1}}, rulerReligion:"Католицизм", pop:'15.5 млн', area:'~500 000 км²', capital:'Мадрид', gdp:'~4 млрд фр.', blurb:'Испания в 1852 году переживает политическую нестабильность после десятилетий гражданских войн.',
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
    religion: null, rulerReligion: null,
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
  if (c.pmPortrait === undefined) c.pmPortrait = null;
  if (c.religion === undefined) c.religion = null;
  if (c.rulerReligion === undefined) c.rulerReligion = null;
  if (c.pendingSuccession === undefined) c.pendingSuccession = false;
  if (c.reputation === undefined) c.reputation = 70;
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
      religion: d.religion ? JSON.parse(JSON.stringify(d.religion)) : null,
      rulerReligion: d.rulerReligion || null,
      agenda: '', profilePending: !!d.profilePending,
      colorOverride: null, portrait: null, pmPortrait: null,
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
// ДОГОВОРЫ И АЛЬЯНСЫ. Официальные договоры двух типов: alliance (военный союз) и
// nonaggression (пакт о ненападении). Хранятся в worldState.treaties, доступны и игроку,
// и ИИ-странам между собой. РАЗРЫВ договора — не бесплатный: предатель теряет стабильность,
// репутацию и отношения СО ВСЕМИ странами (миру видно, кому нельзя верить).
// ============================================================
function findTreaty(type, a, b) {
  return (worldState.treaties || []).find(t =>
    t.type === type && ((t.a === a && t.b === b) || (t.a === b && t.b === a)));
}

function treatiesOf(country) {
  return (worldState.treaties || []).filter(t => t.a === country || t.b === country);
}

function signTreaty(type, a, b) {
  if (!countries[a] || !countries[b] || a === b || findTreaty(type, a, b)) return null;
  if (!worldState.treaties) worldState.treaties = [];
  const t = { type, a, b, since: year };
  worldState.treaties.push(t);
  addRelation(a, b, 15);
  if (type === 'alliance') {
    if (a === playerCountry && !worldState.alliedWith.includes(b)) worldState.alliedWith.push(b);
    if (b === playerCountry && !worldState.alliedWith.includes(a)) worldState.alliedWith.push(a);
  }
  const label = type === 'alliance' ? 'военный союз' : 'пакт о ненападении';
  worldState.pastEvents.push(`📜 ${a} и ${b} официально заключили ${label} (${year} г.).`);
  showNotif(`📜 Договор подписан: ${a} + ${b} (${label})`);
  if (typeof renderTerritoryColors === 'function') renderTerritoryColors(); // карта альянсов
  return t;
}

// breaker — кто разорвал (он и платит цену). За нарушение ОФИЦИАЛЬНОГО договора:
// стабильность −5, репутация −20, отношения с преданным −60, со ВСЕМИ остальными −10.
function breakTreaty(type, breaker, other, silent) {
  const t = findTreaty(type, breaker, other);
  if (!t) return false;
  worldState.treaties = worldState.treaties.filter(x => x !== t);
  const bc = countries[breaker];
  if (bc) {
    bc.stability = Math.max(0, bc.stability - 5);
    bc.reputation = Math.max(0, (bc.reputation ?? 70) - 20);
  }
  addRelation(breaker, other, -60);
  ALL_COUNTRIES.forEach(c => {
    if (c === breaker || c === other || !countries[c] || countries[c].annexed) return;
    addRelation(breaker, c, -10);
  });
  if (type === 'alliance') {
    if (breaker === playerCountry) worldState.alliedWith = worldState.alliedWith.filter(x => x !== other);
    if (other === playerCountry) worldState.alliedWith = worldState.alliedWith.filter(x => x !== breaker);
  }
  const label = type === 'alliance' ? 'военный союз' : 'пакт о ненападении';
  worldState.pastEvents.push(`💔 ${breaker} ВЕРОЛОМНО разорвала ${label} с ${other} — репутация ${breaker} подорвана во всех столицах.`);
  if (!silent) {
    showNotif(`💔 ${breaker} разорвала договор с ${other}!`);
    if ((breaker === playerCountry || other === playerCountry) && typeof showBreakingNews === 'function') {
      showBreakingNews('ДОГОВОР РАЗОРВАН', `${breaker} вероломно разорвала ${label} с ${other}. Дипломатическая репутация ${breaker} подорвана.`);
    }
  }
  if (breaker === playerCountry) renderPlayerStats();
  if (typeof renderTerritoryColors === 'function') renderTerritoryColors();
  return true;
}

// Единый доступ к отношениям ЛЮБОЙ пары (игрок↔ИИ или ИИ↔ИИ)
function getRelation(a, b) {
  if (a === playerCountry) return worldState.relations[b] || 0;
  if (b === playerCountry) return worldState.relations[a] || 0;
  return (worldState.relationsAmong || {})[mutualRelKey(a, b)] || 0;
}
function addRelation(a, b, delta) {
  if (a === playerCountry) { changeRelations(b, delta); return; }
  if (b === playerCountry) { changeRelations(a, delta); return; }
  changeMutualRelations(a, b, delta);
}

// Альянсовые блоки — связные компоненты по договорам alliance (для карты альянсов и
// расчёта эффективной силы: союзники частично складывают армии).
function allianceBlocs() {
  const parent = {};
  const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  ALL_COUNTRIES.forEach(c => { parent[c] = c; });
  (worldState.treaties || []).filter(t => t.type === 'alliance').forEach(t => {
    if (parent[t.a] === undefined || parent[t.b] === undefined) return;
    parent[find(t.a)] = find(t.b);
  });
  const blocs = {};
  ALL_COUNTRIES.forEach(c => {
    if (!countries[c] || countries[c].annexed) return;
    const root = find(c);
    (blocs[root] = blocs[root] || []).push(c);
  });
  return Object.values(blocs);
}

// Блок страны (или null, если она без союзов); лидер блока — сильнейшая армия
function allianceBlocOf(country) {
  const bloc = allianceBlocs().find(b => b.includes(country));
  return bloc && bloc.length > 1 ? bloc : null;
}
function blocLeader(bloc) {
  return bloc.reduce((best, c) => (countries[c].army > countries[best].army ? c : best), bloc[0]);
}

// ============================================================
// ДИПЛОМАТИЧЕСКИЙ ДВИЖОК — «лестница эскалации», которая двигает мир каждый месяц.
// Ключевая идея: поведение ИИ-страны к другой стране определяется ОТНОШЕНИЯМИ и
// СООТНОШЕНИЕМ СИЛ (с учётом союзников). Слабая страна не нападает на сильную
// (Венеция не объявит войну Австрии) — вместо этого она ищет союз против неё.
//
//   отношения > +65  → шанс предложить/заключить союз или пакт
//   −35 … −55        → настороженность: войска к границе, торговые уколы, ноты
//   −55 … −75        → кризис: ультиматумы, разрыв договоров, мобилизация
//   < −75            → если сила (с союзниками) ≥ 0.75 противника — ШАНС ОБЪЯВИТЬ ВОЙНУ;
//                      если слабее — ищет коалицию/покровителя против врага
//
// При объявлении войны движок сразу назначает ЦЕЛЬ ВОЙНЫ (не всегда аннексия!):
// захват 1-3 конкретных провинций / контрибуция / марионетка / аннексия (только при
// подавляющем превосходстве). Цель хранится и передаётся ИИ, чтобы война шла к развязке.
// Движок также давит на мир: разбитая сторона получает директиву заключать мир по цели.
// ============================================================
function rawPower(c) {
  const cc = countries[c];
  return cc ? cc.army * (0.5 + cc.stability / 200) : 0;
}
function effectivePower(c) {
  let p = rawPower(c);
  const bloc = allianceBlocOf(c);
  if (bloc) bloc.forEach(m => { if (m !== c) p += rawPower(m) * 0.5; });
  return Math.max(1, p);
}

function warKey(a, b) { return mutualRelKey(a, b); }
function isAtWar(a, b) {
  if (a === playerCountry) return worldState.atWarWith.includes(b);
  if (b === playerCountry) return worldState.atWarWith.includes(a);
  return (worldState.aiWars || []).some(w => (w[0] === a && w[1] === b) || (w[0] === b && w[1] === a));
}

// Выбрать цель войны атакующего против защитника
function makeWarGoal(attacker, defender) {
  const ratio = effectivePower(attacker) / effectivePower(defender);
  const defProvinces = scenarioProvinces
    .filter(p => (provinceOwners[p.id] || p.owner) === defender)
    .map(p => ({ name: p.name, income: (provinceEcon[p.id] || {}).income || 0 }))
    .sort((x, y) => y.income - x.income);
  let type;
  if (ratio > 2.2 && defProvinces.length <= 4) type = 'annexation';
  else {
    const r = Math.random();
    type = r < 0.55 ? 'provinces' : r < 0.78 ? 'tribute' : 'puppet';
  }
  const wanted = type === 'provinces' ? defProvinces.slice(0, Math.min(3, Math.max(1, Math.round(defProvinces.length * 0.25)))).map(p => p.name) : [];
  return { attacker, defender, type, provinces: wanted, startYear: year, defStartArmy: countries[defender].army };
}

function warGoalLabel(g) {
  if (!g) return '';
  if (g.type === 'annexation') return 'полная аннексия';
  if (g.type === 'provinces') return 'захват провинций: ' + g.provinces.join(', ');
  if (g.type === 'tribute') return 'контрибуция и унижение';
  return 'смена власти / марионеточное правительство';
}

function declareEngineWar(attacker, defender) {
  // Война поверх пакта о ненападении = вероломство со всеми последствиями
  if (findTreaty('nonaggression', attacker, defender)) breakTreaty('nonaggression', attacker, defender, true);
  if (findTreaty('alliance', attacker, defender)) breakTreaty('alliance', attacker, defender, true);
  if (attacker === playerCountry || defender === playerCountry) {
    const other = attacker === playerCountry ? defender : attacker;
    if (!worldState.atWarWith.includes(other)) worldState.atWarWith.push(other);
  } else {
    worldState.aiWars.push([attacker, defender]);
  }
  addRelation(attacker, defender, -40);
  const goal = makeWarGoal(attacker, defender);
  worldState.warGoals[warKey(attacker, defender)] = goal;
  worldState.pastEvents.push(`⚔️ ${attacker} ОБЪЯВИЛА ВОЙНУ ${defender}. Цель войны: ${warGoalLabel(goal)}.`);
  if (defender === playerCountry && typeof showBreakingNews === 'function') {
    showBreakingNews('НАМ ОБЪЯВЛЕНА ВОЙНА', `${attacker} объявила войну! Разведка доносит: цель врага — ${warGoalLabel(goal)}.`);
  } else if (attacker !== playerCountry && defender !== playerCountry) {
    showNotif(`⚔️ ${attacker} объявила войну ${defender}`);
  }
  return goal;
}

// Директивы движка на этот ход — передаются ИИ-нарратору как ОБЯЗАТЕЛЬНЫЕ факты
let pendingDirectives = [];

function runDiplomacyEngine() {
  const live = ALL_COUNTRIES.filter(c => countries[c] && !countries[c].annexed);

  // 1) Дрейф: союзники медленно сближаются; союзники воюющих настораживаются к их врагам
  (worldState.treaties || []).filter(t => t.type === 'alliance').forEach(t => {
    if (getRelation(t.a, t.b) < 80) addRelation(t.a, t.b, 1);
  });
  const hostilePairs = [];
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    if (getRelation(live[i], live[j]) < -50 || isAtWar(live[i], live[j])) hostilePairs.push([live[i], live[j]]);
  }
  hostilePairs.forEach(([a, b]) => {
    (allianceBlocOf(a) || []).forEach(ally => { if (ally !== a && ally !== b && getRelation(ally, b) > -80) addRelation(ally, b, -2); });
    (allianceBlocOf(b) || []).forEach(ally => { if (ally !== b && ally !== a && getRelation(ally, a) > -80) addRelation(ally, a, -2); });
  });

  // 2) Лестница эскалации по каждой паре (ИИ-инициатива; игрок сам решает за себя)
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      if (isAtWar(a, b)) continue;
      const rel = getRelation(a, b);

      // Дружба → официальные договоры (ИИ-страны заключают сами; игроку — предложение)
      if (rel > 65 && !findTreaty('alliance', a, b) && Math.random() < 0.12) {
        if (a !== playerCountry && b !== playerCountry) {
          signTreaty('alliance', a, b);
          pendingDirectives.push(`${a} и ${b} заключили военный союз — опиши это событие в новостях.`);
        } else {
          const ai = a === playerCountry ? b : a;
          pendingDirectives.push(`${ai} готова предложить ${playerCountryDisplayName} военный союз — вплети предложение в новости/дипломатию.`);
        }
        continue;
      }
      if (rel > 40 && rel <= 65 && !findTreaty('nonaggression', a, b) && !findTreaty('alliance', a, b) && Math.random() < 0.08 && a !== playerCountry && b !== playerCountry) {
        signTreaty('nonaggression', a, b);
        pendingDirectives.push(`${a} и ${b} подписали пакт о ненападении — упомяни в новостях.`);
        continue;
      }

      if (rel >= -35) continue;

      // Кто потенциальный агрессор — тот, кто сильнее (с союзниками)
      const attacker = effectivePower(a) >= effectivePower(b) ? a : b;
      const defender = attacker === a ? b : a;
      if (attacker === playerCountry) continue; // за игрока движок войн не объявляет
      const ratio = effectivePower(attacker) / effectivePower(defender);
      const hasNAP = !!findTreaty('nonaggression', attacker, defender);

      if (rel < -75 && ratio >= 0.75 && (!hasNAP || rel < -85)) {
        // ВОЙНА (сквозь пакт — только при лютой ненависти, с ценой вероломства)
        if (Math.random() < 0.18) {
          const goal = declareEngineWar(attacker, defender);
          pendingDirectives.push(`ДВИЖОК ОБЪЯВИЛ: ${attacker} начала войну против ${defender}. Цель: ${warGoalLabel(goal)}. ОБЯЗАТЕЛЬНО опиши вторжение в новостях, создай армии вторжения (map_objects, owner "${attacker}") и укажи первое сражение в battles.`);
        }
      } else if (rel < -75 && ratio < 0.75 && Math.random() < 0.15) {
        // Слабый не нападает — ищет коалицию против сильного
        const candidates = live.filter(c => c !== defender && c !== attacker && getRelation(c, attacker) < -20);
        const partner = candidates[0];
        if (partner) pendingDirectives.push(`${defender} слишком слаба для войны с ${attacker} — она ищет союз с ${partner} против общей угрозы (продвинь их отношения через relations_between, опиши переговоры).`);
      } else if (rel < -55 && Math.random() < 0.25) {
        pendingDirectives.push(`КРИЗИС между ${a} и ${b} (отношения ${rel}): ультиматумы, отзыв послов, мобилизация у границ (map_objects). Опиши обострение — оно должно быть видно на карте.`);
      } else if (rel < -35 && Math.random() < 0.2) {
        pendingDirectives.push(`Напряжённость между ${a} и ${b}: ${a === playerCountry ? b : a} стягивает войска к границе, вводит пошлины или устраивает дипломатический укол. Одна новость об этом.`);
      }
    }
  }

  // 3) Давление к миру: разбитая сторона просит мира согласно цели войны
  Object.entries(worldState.warGoals || {}).forEach(([key, goal]) => {
    if (!goal || !isAtWar(goal.attacker, goal.defender)) { delete worldState.warGoals[key]; return; }
    const d = countries[goal.defender], atk = countries[goal.attacker];
    if (!d || !atk) return;
    const defBroken = d.stability < 25 || d.army < goal.defStartArmy * 0.3;
    const atkExhausted = atk.stability < 25;
    if (defBroken) {
      pendingDirectives.push(`${goal.defender} разбита в войне с ${goal.attacker} — ЗАКЛЮЧИ МИР в этом ходу согласно цели войны (${warGoalLabel(goal)}): используй province_transfer/territory_transfer/new_countries/treasury по смыслу цели, затем peace_made/wars_between end.`);
    } else if (atkExhausted) {
      pendingDirectives.push(`${goal.attacker} истощена войной с ${goal.defender} — пусть предложит белый мир или урезанные требования (peace_made/wars_between end).`);
    } else if (Math.random() < 0.5) {
      pendingDirectives.push(`Война ${goal.attacker} против ${goal.defender} продолжается (цель: ${warGoalLabel(goal)}) — ОБЯЗАТЕЛЬНО battles в этом ходу, фронт должен двигаться.`);
    }
  });

  if (pendingDirectives.length > 12) pendingDirectives = pendingDirectives.slice(0, 12);
}

// ============================================================
// БОЕВАЯ МАТЕМАТИКА. Сражения объявляет ИИ (эффект battles), но ПОТЕРИ считает движок:
// задействованная часть армии зависит от масштаба боя, сила — от численности, стабильности
// и случайности. Проигравший теряет намного больше; в решающем сражении можно потерять
// практически всю задействованную армию. Результат идёт в сводку, хронику и обратно в ИИ.
// ============================================================
const BATTLE_SCALES = { skirmish: 0.06, battle: 0.22, decisive: 0.55 };

function resolveBattle(aName, bName, scale, location) {
  const A = countries[aName], B = countries[bName];
  if (!A || !B || A.annexed || B.annexed) return null;
  const f = BATTLE_SCALES[scale] || BATTLE_SCALES.battle;
  const engA = Math.max(500, Math.round(A.army * f));
  const engB = Math.max(500, Math.round(B.army * f));
  const strA = engA * (0.8 + Math.random() * 0.4) * (0.85 + A.stability / 500);
  const strB = engB * (0.8 + Math.random() * 0.4) * (0.85 + B.stability / 500);
  const aWins = strA >= strB;
  const winner = aWins ? aName : bName, loser = aWins ? bName : aName;
  const engW = aWins ? engA : engB, engL = aWins ? engB : engA;
  const loserLosses = Math.min(countries[loser].army, Math.round(engL * (0.45 + Math.random() * 0.45)));
  const winnerLosses = Math.min(countries[winner].army, Math.round(engW * (0.15 + Math.random() * 0.25)));
  changeCountryStat(loser, 'army', -loserLosses);
  changeCountryStat(winner, 'army', -winnerLosses);
  const stabHit = scale === 'decisive' ? 8 : scale === 'battle' ? 4 : 1;
  changeCountryStat(loser, 'stability', -stabHit);
  changeCountryStat(winner, 'stability', Math.ceil(stabHit / 3));
  const summary = `Сражение${location ? ' при ' + location : ''}: ${winner} одержала верх над ${loser}. Потери: ${loser} −${loserLosses.toLocaleString('ru')}, ${winner} −${winnerLosses.toLocaleString('ru')}.`;
  worldState.pastEvents.push('⚔️ ' + summary);
  return { winner, loser, loserLosses, winnerLosses, summary };
}

// ============================================================
// ДИНАМИЧЕСКОЕ СОЗДАНИЕ СТРАН во время партии: мятежные режимы, гражданские войны,
// марионеточные правительства на своих/захваченных землях — доступно и игроку (через
// действия), и ИИ-странам (через эффект new_countries). Новая страна становится
// полноценной: со своим ИИ-профилем, отношениями, экономикой провинций.
// ============================================================
function createDynamicCountry(spec) {
  if (!spec || !spec.name || countries[spec.name] || typeof scenarioProvinces === 'undefined') return null;
  const name = spec.name;
  ALL_COUNTRIES.push(name);
  const base = placeholderCountry(name);
  countries[name] = normalizeCountry({
    displayName: name,
    ruler: spec.ruler || base.ruler,
    rulerAge: typeof spec.ruler_age === 'number' ? spec.ruler_age : null,
    rulerSince: year,
    rulerTitle: spec.ruler_title || 'Глава государства',
    government: spec.government || 'Временное правительство',
    pm: spec.pm || '—', pmTitle: spec.pm_title || 'Глава правительства',
    treasury: typeof spec.treasury === 'number' ? spec.treasury : Math.round(base.treasury * 0.4),
    income: typeof spec.income === 'number' ? spec.income : 0, // пересчитается из провинций
    army: typeof spec.army === 'number' ? spec.army : 25000,
    stability: typeof spec.stability === 'number' ? spec.stability : 40,
    pop: '', area: '', capital: spec.capital || '', gdp: '',
    blurb: spec.blurb || 'Новообразованное государство.',
    religion: spec.religion_main ? { main: spec.religion_main, dist: { [spec.religion_main]: 85, 'Прочие': 15 } } : null,
    rulerReligion: spec.ruler_religion || spec.religion_main || null,
    agenda: spec.agenda || '',
    parliament: null,
    profilePending: !spec.agenda, // если ИИ не дал интересы — дозаполнит генератор профилей
    colorOverride: (spec.color && /^#[0-9a-fA-F]{6}$/.test(spec.color)) ? spec.color : null,
    portrait: null, pmPortrait: null,
    annexed: false, annexedBy: null
  });

  // Передаём провинции новой стране (по названиям), считаем её экономику
  let got = 0;
  (spec.provinces || []).forEach(pn => {
    const p = scenarioProvinces.find(x => x.name.toLowerCase() === String(pn).toLowerCase() || x.id === pn);
    if (!p) return;
    provinceOwners[p.id] = name;
    if (!provinceEcon[p.id]) provinceEcon[p.id] = { income: 20, dev: 2 };
    got++;
  });
  countries[name].incomeModifier = typeof spec.income === 'number' ? Math.round(spec.income * 0.35) : 30;
  recomputeIncomes();

  // Отношения: со всеми 0; патрон дружелюбен, метрополия враждебна (мятеж = война)
  const from = spec.from ? (typeof normalizeCountryName === 'function' ? normalizeCountryName(spec.from) : spec.from) : null;
  const patron = spec.patron ? (typeof normalizeCountryName === 'function' ? normalizeCountryName(spec.patron) : spec.patron) : null;
  if (name !== playerCountry) {
    worldState.relations[name] = patron === playerCountry ? 50 : (from === playerCountry && spec.type === 'rebel' ? -80 : 0);
    ALL_COUNTRIES.filter(c => c !== name && c !== playerCountry).forEach(c => {
      let v = 0;
      if (c === patron) v = 60;
      if (c === from && spec.type === 'rebel') v = -80;
      worldState.relationsAmong[mutualRelKey(name, c)] = v;
    });
    if (from === playerCountry && spec.type === 'rebel' && !worldState.atWarWith.includes(name)) {
      worldState.atWarWith.push(name);
    }
    if (from && from !== playerCountry && spec.type === 'rebel') {
      worldState.aiWars.push([name, from]);
    }
  }

  if (typeof renderTerritoryColors === 'function') renderTerritoryColors();
  if (typeof addCountryLabelsFromProvinces === 'function') addCountryLabelsFromProvinces();
  if (typeof renderCountryList === 'function') renderCountryList();
  worldState.pastEvents.push(`🏳️ Провозглашено новое государство: ${name}${from ? ' (на землях ' + from + ')' : ''}, провинций: ${got}.`);
  return { name, provinces: got, from };
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
  set('ph-faith', c.rulerReligion || '—');
  const govbadge = document.getElementById('govbadge-text');
  if (govbadge) govbadge.textContent = '🏛 ' + c.government;
  if (typeof renderRulerPortrait === 'function') renderRulerPortrait();
  if (typeof renderParliamentPanel === 'function') renderParliamentPanel();
  if (typeof renderReligionPanel === 'function') renderReligionPanel();
}

// ============================================================
// МАШИНА ВРЕМЕНИ. Варианты хода: неделя (лёгкий: новостей вдвое меньше), месяц
// (стандарт), период 3/6/12/60 месяцев (экономика и смерти считаются помесячно,
// ИИ пишет один дайджест ключевых событий периода). Плюс авторежим в ui.js.
// ============================================================
const SKIP_OPTIONS = {
  week:  { label: 'Неделя',    months: 0 },
  m1:    { label: 'Месяц',     months: 1 },
  m3:    { label: '3 месяца',  months: 3 },
  m6:    { label: '6 месяцев', months: 6 },
  m12:   { label: 'Год',       months: 12 },
  m60:   { label: '5 лет',     months: 60 }
};

// Прожить один календарный месяц в движке (экономика + возраст/смерти). Без ИИ.
function stepOneMonth() {
  month++;
  if (month >= 12) { month = 0; year++; }
  const econ = simulateWorldEconomy();
  const deaths = checkRulerDeaths();
  runDiplomacyEngine();
  return { econ, deaths };
}

function announceDeaths(deaths) {
  deaths.forEach(d => {
    worldState.pastEvents.push(`${months[month]} ${year}: скончался ${d.title} ${d.ruler} (${d.country}) в возрасте ${d.age} лет.`);
    if (typeof showBreakingNews === 'function') {
      showBreakingNews('УМЕР ' + (d.title || 'ПРАВИТЕЛЬ').toUpperCase(),
        `${d.ruler} (${d.country}) скончался в возрасте ${d.age} лет. Страна ждёт преемника.`);
    }
  });
}

let turnRunning = false;
async function nextTurn(kind) {
  if (turnRunning) return;
  kind = kind || (typeof getSelectedSkip === 'function' ? getSelectedSkip() : 'm1');
  const opt = SKIP_OPTIONS[kind] || SKIP_OPTIONS.m1;
  turnRunning = true;
  const btn = document.querySelector('.next-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Симуляция...';

  try {
    turn++;
    let econChanges = [], deaths = [], periodLabel = null;

    if (kind === 'week') {
      // Неделя: календарь двигается на неделю, экономика/смерти — только на границе месяца
      week++;
      if (week >= 4) { week = 0; const r = stepOneMonth(); econChanges = r.econ; deaths = r.deaths; }
    } else if (opt.months === 1) {
      week = 0;
      const r = stepOneMonth(); econChanges = r.econ; deaths = r.deaths;
    } else {
      // Период: помесячная симуляция движка, один дайджест ИИ за весь срок
      week = 0;
      const startLabel = months[month] + ' ' + year;
      let netSum = 0, borrowedSum = 0;
      for (let i = 0; i < opt.months; i++) {
        const r = stepOneMonth();
        deaths.push(...r.deaths);
        const b = countries[playerCountry].lastBudget;
        if (b) { netSum += b.net; borrowedSum += b.borrowed || 0; }
      }
      periodLabel = `${startLabel} — ${months[month]} ${year}`;
      econChanges = [{ label: '💰 Бюджет за период', value: (netSum >= 0 ? '+' : '') + netSum.toLocaleString('ru') + ' фр.', sign: netSum }];
      if (borrowedSum) econChanges.push({ label: '🏦 Займы за период', value: '+' + borrowedSum.toLocaleString('ru') + ' фр. долга', sign: -1 });
    }

    renderPlayerStats();
    renderDate();
    announceDeaths(deaths);

    // ИИ-события: неделя — лёгкий выпуск, период — дайджест, месяц — стандарт
    await onTurnEnd(econChanges, deaths, {
      newsCount: kind === 'week' ? 5 : 10,
      domesticCount: kind === 'week' ? 2 : 3,
      periodLabel
    });

    resolvePendingSuccessions();
    renderPlayerStats();
    saveGame();
  } finally {
    turnRunning = false;
    btn.disabled = false;
    btn.textContent = 'Следующий ход ▶';
    if (typeof onTurnFinished === 'function') onTurnFinished(); // авторежим (ui.js)
  }
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
      turn, month, year, week,
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
    turn = d.turn; month = d.month; year = d.year; week = d.week || 0;
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
    if (!worldState.treaties) worldState.treaties = [];
    if (!worldState.warGoals) worldState.warGoals = {};
    pendingDirectives = [];
    playerActions = d.playerActions || [];
    if (typeof advisorHistory !== 'undefined') advisorHistory = d.advisorHistory || [];
    if (typeof diplomacyHistories !== 'undefined') {
      Object.keys(diplomacyHistories).forEach(k => delete diplomacyHistories[k]);
      Object.assign(diplomacyHistories, d.diplomacyHistories || {});
    }

    renderDate();

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

  turn = 1; month = 0; week = 0;
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
    treaties: [],
    warGoals: {},
    atWarWith: [], alliedWith: [], pastEvents: [], diploLog: [], mapObjects: []
  };
  pendingDirectives = [];
  playerActions = [];
  if (typeof advisorHistory !== 'undefined') advisorHistory = [];
  if (typeof diplomacyHistories !== 'undefined') Object.keys(diplomacyHistories).forEach(k => delete diplomacyHistories[k]);

  renderDate();

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

// ============================================================
// РЕЛИГИЯ. У страны — распределение верующих в процентах (главная religion.main +
// второстепенные числами), у правителя — своя вера. ИИ может сдвигать проценты
// (обращения, миграции, реформы) и менять веру правителя.
// ============================================================
function shiftReligion(country, shifts, newRulerReligion) {
  const c = countries[country];
  if (!c) return;
  if (!c.religion) c.religion = { main: '', dist: {} };
  if (shifts && typeof shifts === 'object') {
    Object.entries(shifts).forEach(([rel, delta]) => {
      if (typeof delta !== 'number' || !delta) return;
      c.religion.dist[rel] = Math.max(0, Math.min(100, (c.religion.dist[rel] || 0) + delta));
      if (c.religion.dist[rel] === 0) delete c.religion.dist[rel];
    });
    // Нормализуем к 100% и пересчитываем главную религию
    const total = Object.values(c.religion.dist).reduce((s, v) => s + v, 0);
    if (total > 0) {
      Object.keys(c.religion.dist).forEach(k => {
        c.religion.dist[k] = Math.round(c.religion.dist[k] / total * 1000) / 10;
      });
    }
    let main = '', best = -1;
    Object.entries(c.religion.dist).forEach(([k, v]) => { if (k !== 'Прочие' && v > best) { best = v; main = k; } });
    if (main) c.religion.main = main;
  }
  if (newRulerReligion) c.rulerReligion = newRulerReligion;
  if (country === playerCountry && typeof updateCountryInfoPanel === 'function') updateCountryInfoPanel(playerCountry);
  if (country === playerCountry && typeof renderPlayerPowerPanel === 'function') renderPlayerPowerPanel();
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
