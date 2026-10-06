// ============================================================
// ECON.JS — ДЕТЕРМИНИРОВАННОЕ МАКРОЭКОНОМИЧЕСКОЕ ЯДРО (v2).
// Философия гибрида: ВСЕ числа (население, ВВП, секторы, бюджет, долг, законы)
// считает движок — стабильно и честно; ИИ видит эти числа, рассказывает историю
// и двигает их ТОЛЬКО через ограниченные эффекты.
//
// Устройство:
//  - ВВП страны = сумма ВВП её провинций → захват провинции реально переносит
//    экономику и население (война имеет экономический смысл).
//  - Классы общества получают богатство как ДОЛЮ ВВП (а не случайные числа);
//    налоги с классов + пошлины + ресурсы = доходы бюджета.
//  - Рост ВВП — формула: база эпохи + инфраструктура + грамотность + инвестиции
//    − нестабильность − война − инфляция.
//  - ЗАКОНЫ — фиксированные СЛОТЫ (движок помнит навсегда), варианты и их
//    модификаторы задаёт КОНФИГ ЭПОХИ. ИИ может только предлагать смену слота.
//  - Все различия эпох — в конфиге ERAS, а не в коде. Один движок на все эпохи.
// Единицы: деньги — млн франков (для 19 в.; ярлык валюты в конфиге), население — тыс. чел.
// ============================================================

const ECON_V2 = true;

// ------------------------------------------------------------
// КОНФИГИ ЭПОХ. Эпоха выбирается по году сценария.
// ------------------------------------------------------------
const ERAS = [
  {
    id: 'industrial', from: 0, to: 1913, label: 'Индустриальная эпоха (XIX век)',
    currency: 'фр.',
    baseGrowth: 1.3,          // % ВВП в год (база до модификаторов)
    popGrowth: 0.9,           // % населения в год
    armyMaxShare: 0.05,       // максимум армии от населения
    armyUpkeep: 0.00045,      // млн фр./солдат в месяц
    classes: {                // ярлыки и доли ВВП по группам (ключи фиксированы движком)
      noble:   { label: 'Аристократия и землевладельцы', share: 2,  incomeShare: 0.28, tax: 5,  loyalty: 72 },
      burgher: { label: 'Буржуазия и купечество',        share: 12, incomeShare: 0.30, tax: 12, loyalty: 62 },
      commons: { label: 'Рабочие и крестьяне',           share: 86, incomeShare: 0.42, tax: 18, loyalty: 58 }
    },
    sectors: { agriculture: 52, industry: 16, finance: 8, resources: 7, services: 17 },
    sectorDrift: { agriculture: -0.35, industry: 0.25, finance: 0.06, resources: 0.0, services: 0.04 } // %-пунктов в год у растущей экономики
  },
  {
    id: 'imperial', from: 1914, to: 1949, label: 'Эпоха мировых войн',
    currency: 'фр.',
    baseGrowth: 1.8, popGrowth: 1.0, armyMaxShare: 0.08, armyUpkeep: 0.0005,
    classes: {
      noble:   { label: 'Землевладельцы и старая элита', share: 2,  incomeShare: 0.20, tax: 6,  loyalty: 70 },
      burgher: { label: 'Промышленники и буржуазия',     share: 15, incomeShare: 0.35, tax: 14, loyalty: 62 },
      commons: { label: 'Рабочие и крестьяне',           share: 83, incomeShare: 0.45, tax: 16, loyalty: 55 }
    },
    sectors: { agriculture: 40, industry: 26, finance: 9, resources: 8, services: 17 },
    sectorDrift: { agriculture: -0.45, industry: 0.35, finance: 0.05, resources: 0.0, services: 0.05 }
  },
  {
    id: 'modern', from: 1950, to: 9999, label: 'Современная эпоха',
    currency: 'млн $',
    baseGrowth: 2.6, popGrowth: 1.2, armyMaxShare: 0.03, armyUpkeep: 0.0009,
    classes: {
      noble:   { label: 'Корпорации и финансовая элита', share: 3,  incomeShare: 0.30, tax: 15, loyalty: 65 },
      burgher: { label: 'Средний класс',                 share: 40, incomeShare: 0.40, tax: 20, loyalty: 60 },
      commons: { label: 'Рабочие и малообеспеченные',    share: 57, incomeShare: 0.30, tax: 12, loyalty: 55 }
    },
    sectors: { agriculture: 12, industry: 28, finance: 15, resources: 8, services: 37 },
    sectorDrift: { agriculture: -0.15, industry: -0.1, finance: 0.1, resources: 0.0, services: 0.3 }
  }
];

function getEra() {
  const y = (typeof year !== 'undefined') ? year : 1852;
  return ERAS.find(e => y >= e.from && y <= e.to) || ERAS[0];
}

// ------------------------------------------------------------
// ЗАКОНЫ — СЛОТЫ. Категории фиксированы движком, ВАРИАНТЫ и их модификаторы —
// по эпохам. Модификаторы: growth (±% к росту ВВП/год), stab (± стабильность/мес),
// loyal {класс:±/мес}, adminEff (множитель расходов на администрацию),
// taxEff (множитель собираемости налогов).
// ------------------------------------------------------------
const LAW_SLOTS = {
  polity:    { label: 'Политическое устройство' },
  suffrage:  { label: 'Избирательное право' },
  labor:     { label: 'Труд' },
  property:  { label: 'Собственность' },
  women:     { label: 'Права женщин' },
  education: { label: 'Образование' },
  police:    { label: 'Полиция и цензура' },
  religion:  { label: 'Религия и государство' }
};

const LAW_OPTIONS = {
  polity: [
    { id: 'absolute',   label: 'Абсолютная власть',        mods: { growth: -0.2, loyal: { noble: 0.1, commons: -0.08 }, adminEff: 1.05 } },
    { id: 'const_mon',  label: 'Конституционная монархия', mods: { growth: 0.1, loyal: { burgher: 0.08 } } },
    { id: 'republic',   label: 'Республика',               mods: { growth: 0.15, loyal: { burgher: 0.1, noble: -0.08 } } },
    { id: 'one_party',  label: 'Однопартийное государство',mods: { growth: 0.0, stab: 0.05, loyal: { burgher: -0.06, commons: -0.04 }, adminEff: 1.1 } }
  ],
  suffrage: [
    { id: 'none',       label: 'Выборов нет',              mods: { loyal: { commons: -0.06, burgher: -0.05 } } },
    { id: 'census',     label: 'Ценз (имущие)',            mods: { loyal: { burgher: 0.08, commons: -0.04 } } },
    { id: 'male',       label: 'Всеобщее мужское',         mods: { loyal: { commons: 0.06 } } },
    { id: 'universal',  label: 'Всеобщее',                 mods: { loyal: { commons: 0.08 }, growth: 0.05 } }
  ],
  labor: [
    { id: 'unregulated',label: 'Труд не регулируется',     mods: { growth: 0.15, loyal: { commons: -0.1 } } },
    { id: 'basic',      label: 'Базовые ограничения',      mods: { growth: 0.05, loyal: { commons: 0.04 } } },
    { id: 'protected',  label: 'Охрана труда и профсоюзы', mods: { growth: -0.05, loyal: { commons: 0.1, burgher: -0.05 } } }
  ],
  property: [
    { id: 'feudal',     label: 'Сословная/крепостная',     mods: { growth: -0.5, loyal: { noble: 0.1, commons: -0.1 } } },
    { id: 'private',    label: 'Частная собственность',    mods: { growth: 0.2 } },
    { id: 'state',      label: 'Государственная (плановая)',mods: { growth: -0.15, stab: 0.03, loyal: { burgher: -0.12 }, taxEff: 1.15 } }
  ],
  women: [
    { id: 'none',       label: 'Без прав',                 mods: { growth: -0.1 } },
    { id: 'partial',    label: 'Частичные права',          mods: { growth: 0.05 } },
    { id: 'equal',      label: 'Равноправие',              mods: { growth: 0.15, loyal: { noble: -0.04 } } }
  ],
  education: [
    { id: 'church',     label: 'Церковное/частное',        mods: {} },
    { id: 'partial',    label: 'Начальное государственное',mods: { growth: 0.1, adminEff: 1.02 } },
    { id: 'universal',  label: 'Всеобщее обязательное',    mods: { growth: 0.25, adminEff: 1.05 } }
  ],
  police: [
    { id: 'secret',     label: 'Тайная полиция и цензура', mods: { stab: 0.06, growth: -0.15, loyal: { burgher: -0.06 } } },
    { id: 'ordinary',   label: 'Обычная полиция',          mods: {} },
    { id: 'liberal',    label: 'Свобода печати',           mods: { growth: 0.1, stab: -0.03, loyal: { burgher: 0.06 } } }
  ],
  religion: [
    { id: 'state',      label: 'Государственная церковь',  mods: { stab: 0.03, loyal: { commons: 0.03 }, growth: -0.05 } },
    { id: 'tolerant',   label: 'Веротерпимость',           mods: { growth: 0.05 } },
    { id: 'secular',    label: 'Светское государство',     mods: { growth: 0.1, loyal: { commons: -0.03 } } }
  ]
};

// Стартовые законы: подбираются из формы правления страны (уже известной из
// профиля/дефолтов), остальное — консервативный дефолт эпохи.
function defaultLawSlots(c) {
  const gov = (c.government || '').toLowerCase();
  const polity = /республик/.test(gov) ? 'republic' : /конституц/.test(gov) ? 'const_mon' : 'absolute';
  const y = (typeof year !== 'undefined') ? year : 1852;
  return {
    polity,
    suffrage: polity === 'absolute' ? 'none' : 'census',
    labor: y >= 1900 ? 'basic' : 'unregulated',
    property: 'private',
    women: y >= 1950 ? 'equal' : 'none',
    education: y >= 1900 ? 'partial' : 'church',
    police: polity === 'absolute' ? 'secret' : 'ordinary',
    religion: polity === 'absolute' ? 'state' : 'tolerant'
  };
}

function lawOption(slot, id) {
  return (LAW_OPTIONS[slot] || []).find(o => o.id === id) || null;
}

// Суммарные модификаторы законов страны
function lawMods(c) {
  const m = { growth: 0, stab: 0, adminEff: 1, taxEff: 1, loyal: {} };
  Object.entries(c.lawSlots || {}).forEach(([slot, id]) => {
    const o = lawOption(slot, id);
    if (!o) return;
    const md = o.mods || {};
    m.growth += md.growth || 0;
    m.stab += md.stab || 0;
    m.adminEff *= md.adminEff || 1;
    m.taxEff *= md.taxEff || 1;
    Object.entries(md.loyal || {}).forEach(([k, v]) => { m.loyal[k] = (m.loyal[k] || 0) + v; });
  });
  return m;
}

// Смена закона (игрок через действия/ИИ через EFFECTS). Движок помнит навсегда.
function setLawSlot(country, slot, optionId) {
  const c = countries[country];
  if (!c || !LAW_SLOTS[slot]) return false;
  const opt = lawOption(slot, optionId);
  if (!opt) return false;
  if (!c.lawSlots) c.lawSlots = defaultLawSlots(c);
  const before = lawOption(slot, c.lawSlots[slot]);
  if (c.lawSlots[slot] === optionId) return false;
  c.lawSlots[slot] = optionId;
  // Реформа — не бесплатна: краткий удар по стабильности (перестройка), запись в историю
  c.stability = Math.max(0, c.stability - 3);
  if (typeof worldState !== 'undefined') {
    worldState.pastEvents.push(`⚖️ ${c.displayName || country}: ${LAW_SLOTS[slot].label} — ${before ? '«' + before.label + '» → ' : ''}«${opt.label}».`);
  }
  if (country === playerCountry && typeof renderSocietyScreen === 'function') renderSocietyScreen();
  return true;
}

// ------------------------------------------------------------
// ИНИЦИАЛИЗАЦИЯ: население/ВВП страны и их раздача по провинциям.
// Калибровка от прежнего дохода (сохраняет баланс сценариев): доход был
// откалиброван (великая держава 400-700/мес), налоги ≈ 12% ВВП →
// ВВП_год ≈ доход*12/0.125; население ≈ доход*62 тыс. (Франция 1852: 580 → 36 млн).
// ------------------------------------------------------------
function econInitCountry(c, name) {
  if (c.gdp && c.population) return; // уже инициализирована (загрузка сейва)
  const era = getEra();
  const seed = (typeof worldEconSeed === 'function') ? worldEconSeed(name || c.displayName) : null;
  if (seed) {
    // ИСТОРИЧЕСКАЯ КАЛИБРОВКА: реальные данные державы (детерминированно, без рандома).
    c.population = seed.pop;
    c.gdp = seed.gdp;
    c.sectors = Object.assign({}, era.sectors, seed.sectors);
    c.currency = seed.currency || era.currency;
    c.debtDomestic = seed.debtDom || 0;
    c.debtForeign = seed.debtFor || 0;
    c.debt = c.debtDomestic + c.debtForeign;
    c.infrastructure = (typeof seed.infra === 'number') ? seed.infra : Math.round(12 + (c.stability || 50) / 4);
  } else {
    // Неизвестная страна/колония: скромная детерминированная оценка (с потолком,
    // чтобы малые территории НЕ обгоняли исторические державы).
    const r = hashRand((name || c.displayName || '') + 'econ');
    const inc = Math.max(30, Math.min(260, c.income || 70));
    c.population = Math.round(inc * 42 * (0.7 + r * 0.5));         // тыс. чел.
    c.gdp = Math.round(inc * 12 / 0.125 * (0.85 + r * 0.25));      // млн, в год
    c.currency = era.currency;
    c.infrastructure = Math.round(10 + (c.stability || 50) / 5 + r * 12);
    const rich = inc > 230 ? 3 : -4;
    c.sectors = {
      agriculture: Math.max(5, era.sectors.agriculture - rich + Math.round(r * 8 - 4)),
      industry: Math.max(2, era.sectors.industry + rich + Math.round(r * 6 - 3)),
      finance: era.sectors.finance + (r > 0.7 ? 3 : 0),
      resources: era.sectors.resources + (r < 0.25 ? 4 : 0),
      services: era.sectors.services
    };
  }
  c.gdpGrowth = era.baseGrowth;
  econNormalizeSectors(c);
  if (!c.lawSlots) c.lawSlots = defaultLawSlots(c);
  // Классы: ярлыки эпохи; налоговые ставки сохраняем, если уже были выставлены
  const old = c.economy && c.economy.classes;
  c.economy = { classes: {} };
  Object.entries(era.classes).forEach(([k, def]) => {
    c.economy.classes[k] = {
      label: def.label, share: def.share, incomeShare: def.incomeShare,
      tax: old && old[k] ? old[k].tax : def.tax,
      loyalty: old && old[k] ? old[k].loyalty : def.loyalty,
      wealth: 0 // выставится в econSimulateCountry из ВВП
    };
  });
}

function econNormalizeSectors(c) {
  const t = Object.values(c.sectors).reduce((s, v) => s + v, 0) || 1;
  Object.keys(c.sectors).forEach(k => { c.sectors[k] = Math.round(c.sectors[k] / t * 1000) / 10; });
}

// Раздача населения/ВВП страны по её провинциям (веса устойчивы по id).
// Вызывается ВМЕСТО initProvinceEconomy (game.js делегирует сюда).
function econInitProvinces() {
  provinceEcon = {};
  if (typeof scenarioProvinces === 'undefined') return;
  const byOwner = {};
  scenarioProvinces.forEach(p => {
    const key = p.owner || '__neutral';
    (byOwner[key] = byOwner[key] || []).push(p);
  });
  ALL_COUNTRIES.forEach(cn => {
    const c = countries[cn];
    econInitCountry(c, cn);
    const provs = byOwner[cn] || [];
    const weights = provs.map(p => 0.3 + hashRand(p.id) * (p.id === 'cap' ? 2 : 1));
    const tw = weights.reduce((s, w) => s + w, 0) || 1;
    provs.forEach((p, i) => {
      const shareW = weights[i] / tw;
      provinceEcon[p.id] = {
        pop: Math.round(c.population * shareW),
        gdp: Math.round(c.gdp * shareW * 10) / 10,
        dev: 1 + Math.round(hashRand(p.id + 'd') * 4),
        income: Math.max(1, Math.round(c.gdp * shareW / 12 * 0.125)) // для отображения/ИИ
      };
    });
  });
  (byOwner['__neutral'] || []).forEach(p => {
    provinceEcon[p.id] = { pop: 150 + Math.round(hashRand(p.id) * 800), gdp: 20 + Math.round(hashRand(p.id) * 160), dev: 1 + Math.round(hashRand(p.id + 'd') * 3), income: 4 + Math.round(hashRand(p.id) * 20) };
  });
}

// Пересчёт населения/ВВП стран из провинций (после аннексий/передач).
// Вызывается ВМЕСТО recomputeIncomes.
function econRecompute() {
  if (typeof scenarioProvinces === 'undefined') return;
  const gdpSum = {}, popSum = {};
  scenarioProvinces.forEach(p => {
    const owner = provinceOwners[p.id] || p.owner;
    if (!owner || !countries[owner]) return;
    const e = provinceEcon[p.id];
    if (!e) return;
    gdpSum[owner] = (gdpSum[owner] || 0) + (e.gdp || 0);
    popSum[owner] = (popSum[owner] || 0) + (e.pop || 0);
  });
  ALL_COUNTRIES.forEach(cn => {
    const c = countries[cn];
    if (!c || c.annexed) return;
    econInitCountry(c, cn);
    if (gdpSum[cn]) { c.gdp = Math.round(gdpSum[cn]); c.population = Math.max(50, popSum[cn] || c.population); }
    c.income = econMonthlyRevenue(c).gross; // доход для верхней панели/ИИ
  });
}

// ------------------------------------------------------------
// ДОХОДЫ БЮДЖЕТА: налоги с классов (богатство = доля ВВП) + пошлины + ресурсы.
// ------------------------------------------------------------
function econMonthlyRevenue(c) {
  const m = lawMods(c);
  const monthly = c.gdp / 12;
  const cls = c.economy.classes;
  let taxes = 0;
  const perClass = {};
  Object.entries(cls).forEach(([k, kl]) => {
    // Богатство класса — его месячная доля ВВП (финансовый сектор кормит буржуазию,
    // аграрный — землевладельцев: структура экономики видна в карманах классов)
    let shareAdj = kl.incomeShare;
    if (k === 'burgher') shareAdj += (c.sectors.finance - 8) / 400 + (c.sectors.industry - 16) / 500;
    if (k === 'noble') shareAdj += (c.sectors.agriculture - 40) / 600;
    kl.wealth = Math.max(10, Math.round(monthly * shareAdj));
    const t = Math.round(kl.wealth * kl.tax / 100 * m.taxEff);
    perClass[k] = t; taxes += t;
  });
  const tariffs = Math.round(monthly * 0.021);                       // пошлины и торговля
  const resources = Math.round(monthly * (c.sectors.resources / 100) * 0.25); // госдоля в сырье
  return { gross: taxes + tariffs + resources, taxes, perClass, tariffs, resources };
}

// ------------------------------------------------------------
// МЕСЯЧНЫЙ ТИК СТРАНЫ: рост ВВП/населения, бюджет, долг, инфляция, законы.
// Замещает simulateCountryEconomy (game.js делегирует сюда). Формат lastBudget
// сохранён — вся вкладка «Экономика» и ИИ-экономист работают без изменений.
// ------------------------------------------------------------
function econSimulateCountry(c) {
  const era = getEra();
  econInitCountry(c, c.displayName);
  if (!c.society) {
    initSociety(c);
    const seed = (typeof SOCIETY_SEEDS !== 'undefined') && SOCIETY_SEEDS[c.displayName];
    if (seed) Object.assign(c.society, seed);
  }
  if (c.society.spending.infrastructure === undefined) {
    c.society.spending.infrastructure = Math.max(5, Math.round((c.income || 100) * 0.04)); // старые сейвы
  }
  const m = lawMods(c);
  const atWar = (typeof worldState !== 'undefined') &&
    (worldState.atWarWith.length && c.displayName === (typeof playerCountryDisplayName !== 'undefined' ? playerCountryDisplayName : '') ||
     (worldState.aiWars || []).some(w => w[0] === c.displayName || w[1] === c.displayName) ||
     worldState.atWarWith.includes(c.displayName));

  // ---- РОСТ ВВП (годовой %, применяется помесячно) ----
  const infraSpend = (c.society.spending.infrastructure || 0);
  const invShare = infraSpend / Math.max(1, c.income || 1);
  let g = era.baseGrowth
    + (c.infrastructure / 100) * 1.4
    + ((c.society.literacy || 30) / 100) * 1.0
    + Math.min(1.2, invShare * 8)
    + m.growth
    - ((100 - c.stability) / 100) * 1.8
    - (atWar ? 4.5 : 0)
    - (c.inflation > 10 ? (c.inflation - 10) * 0.12 : 0);
  g = Math.max(-12, Math.min(9, g));
  c.gdpGrowth = Math.round(g * 10) / 10;
  c.gdp = Math.max(50, Math.round(c.gdp * (1 + g / 1200) * 10) / 10);

  // ---- НАСЕЛЕНИЕ ----
  let pg = era.popGrowth - (atWar ? 0.8 : 0) - (c.society.poverty > 75 ? 0.3 : 0);
  c.population = Math.max(50, Math.round(c.population * (1 + pg / 1200)));

  // ---- СТРУКТУРНЫЙ ДРЕЙФ СЕКТОРОВ (только у растущих экономик) ----
  if (g > 1.5) {
    const speed = Math.min(1, (g - 1.5) / 4) / 12;
    Object.entries(era.sectorDrift).forEach(([k, d]) => { c.sectors[k] = Math.max(2, c.sectors[k] + d * speed); });
    econNormalizeSectors(c);
  }

  // ---- ИНФРАСТРУКТУРА: строится из бюджета, ветшает сама ----
  c.infrastructure = Math.max(0, Math.min(100, c.infrastructure + invShare * 4 - 0.06));

  // ---- ДОХОДЫ ----
  const rev = econMonthlyRevenue(c);
  c.income = rev.gross;
  const gross = rev.gross;

  // ---- РАСХОДЫ ----
  const upkeep = Math.round(c.army * era.armyUpkeep * (atWar ? 1.35 : 1));
  const admin = Math.round(gross * 0.08 / m.adminEff);
  const isMonarchy = /монарх|импер|королев|царств/i.test(c.government || '');
  const court = Math.round(gross * (isMonarchy ? 0.04 : 0.02));
  const churchCost = (c.church && c.church.exists && c.church.influence > 50) ? Math.round(gross * 0.02) : 0;
  const social = societySpendingTotal(c) + infraSpend;
  // Проценты: внутренний долг дешевле; внешний дорожает с плохой репутацией/стабильностью
  const riskPremium = Math.max(0, (70 - (c.reputation ?? 70)) + (50 - c.stability)) / 12000;
  const interest = Math.round((c.debtDomestic || 0) * 0.004 + (c.debtForeign || 0) * (0.006 + riskPremium));

  const net = gross - upkeep - interest - admin - court - churchCost - social;
  c.treasury += net;

  // ---- ЗАЙМЫ / ПЕЧАТНЫЙ СТАНОК ----
  let borrowed = 0, borrowedFrom = null, printed = 0;
  if (c.treasury < 0) {
    const need = -c.treasury; c.treasury = 0;
    const burgher = c.economy.classes.burgher;
    const domesticCap = Math.max(0, burgher.wealth * 8 - (c.debtDomestic || 0)); // ёмкость внутреннего рынка
    const dom = Math.min(need, domesticCap);
    if (dom > 0) {
      c.debtDomestic = (c.debtDomestic || 0) + dom;
      burgher.loyalty = Math.max(0, burgher.loyalty - 0.5);
      borrowedFrom = 'внутренний (буржуазия)'; borrowed += dom;
    }
    let rest = need - dom;
    if (rest > 0) {
      // Иностранные банки дают, пока внешний долг < 2.5 годовых ВВП-доходов; дальше — печатаем
      const foreignCap = Math.max(0, gross * 30 - (c.debtForeign || 0));
      const frn = Math.min(rest, foreignCap);
      if (frn > 0) { c.debtForeign = (c.debtForeign || 0) + frn; borrowedFrom = borrowedFrom ? 'смешанный' : 'внешний (иностранные банки)'; borrowed += frn; }
      rest -= frn;
      if (rest > 0) printed = rest; // необеспеченная эмиссия → инфляция
    }
    c.debt = (c.debtDomestic || 0) + (c.debtForeign || 0);
  }
  // Погашение при богатой казне
  if (c.debt > 0 && c.treasury > gross * 3) {
    const repay = Math.min(c.debt, Math.round(gross * 0.1));
    const fromDom = Math.min(c.debtDomestic || 0, repay);
    c.debtDomestic = (c.debtDomestic || 0) - fromDom;
    c.debtForeign = Math.max(0, (c.debtForeign || 0) - (repay - fromDom));
    c.debt = c.debtDomestic + c.debtForeign;
    c.treasury -= repay;
  }

  // ---- ИНФЛЯЦИЯ ----
  const debtRatio = c.debt / Math.max(1, gross * 12);
  const pressure = debtRatio * 5 + (net < 0 ? 1.2 : 0) + (printed > 0 ? 6 + printed / Math.max(1, gross) * 10 : 0);
  c.inflation = Math.max(0, Math.min(80, Math.round((c.inflation + (pressure - c.inflation) * 0.15) * 10) / 10));

  // ---- СТАБИЛЬНОСТЬ И ЛОЯЛЬНОСТЬ ОТ ЗАКОНОВ/ЭКОНОМИКИ ----
  if (m.stab) c.stability = Math.max(0, Math.min(100, c.stability + m.stab));
  Object.entries(m.loyal).forEach(([k, v]) => {
    const kl = c.economy.classes[k];
    if (kl) kl.loyalty = Math.max(0, Math.min(100, Math.round((kl.loyalty + v) * 10) / 10));
  });
  if (c.inflation > 12) c.stability = Math.max(0, c.stability - 1);
  if (debtRatio > 1.5) c.stability = Math.max(0, c.stability - 1);
  if (g < -3) c.stability = Math.max(0, c.stability - 1); // экономика падает — страна кипит
  if (c.parliament && typeof c.parliament.support === 'number' && c.parliament.support < 35) {
    c.stability = Math.max(0, c.stability - 1);
  }

  c.stability = Math.round(c.stability * 10) / 10; // без хвостов плавающей точки

  // ---- АРМИЯ ОГРАНИЧЕНА НАСЕЛЕНИЕМ ----
  const armyCap = Math.round(c.population * 1000 * era.armyMaxShare);
  if (c.army > armyCap) c.army = armyCap;

  // ---- lastBudget (формат прежний — вкладка «Экономика» и ИИ работают как раньше) ----
  const cls = c.economy.classes;
  c.lastBudget = {
    gross, upkeep, interest, net, borrowed, borrowedFrom, printed,
    lines: {
      income: [
        ...Object.entries(rev.perClass).map(([k, v]) => ({ name: 'Налог: ' + cls[k].label, value: v })),
        { name: 'Пошлины и торговля', value: rev.tariffs },
        ...(rev.resources ? [{ name: 'Сырьё и госпредприятия', value: rev.resources }] : [])
      ],
      expense: [
        { name: 'Содержание армии', value: upkeep },
        { name: 'Администрация и чиновники', value: admin },
        { name: isMonarchy ? 'Двор и церемонии' : 'Государственный аппарат', value: court },
        ...(churchCost ? [{ name: 'Содержание церкви', value: churchCost }] : []),
        ...(c.society ? [
          { name: 'Образование', value: c.society.spending.education },
          { name: 'Призрение бедных', value: c.society.spending.welfare },
          ...(infraSpend ? [{ name: 'Инфраструктура', value: infraSpend }] : [])
        ] : []),
        { name: 'Проценты по долгу', value: interest }
      ]
    }
  };
  return c.lastBudget;
}

// ------------------------------------------------------------
// РОСТ ПРОВИНЦИЙ: ВВП провинций растёт вместе со страной (раздача прироста
// пропорционально весам). Вызывается ВМЕСТО growProvinces.
// ------------------------------------------------------------
function econGrowProvinces() {
  if (typeof scenarioProvinces === 'undefined') return;
  scenarioProvinces.forEach(p => {
    const owner = provinceOwners[p.id] || p.owner;
    if (!owner || !countries[owner] || countries[owner].annexed) return;
    const e = provinceEcon[p.id];
    if (!e) return;
    const g = (countries[owner].gdpGrowth || 0) / 1200;
    e.gdp = Math.max(1, Math.round(e.gdp * (1 + g) * 10) / 10);
    e.pop = Math.max(10, Math.round(e.pop * (1 + (getEra().popGrowth) / 1200)));
    e.income = Math.max(1, Math.round(e.gdp / 12 * 0.125));
  });
}

// ------------------------------------------------------------
// ОПИСАНИЯ ДЛЯ ИИ: макро-сводка страны и законы (подмешиваются в промпты).
// ------------------------------------------------------------
function econDescribeMacro(c) {
  if (!c || !c.gdp) return '';
  const era = getEra();
  const cur = c.currency || era.currency;
  const s = c.sectors || {};
  return `МАКРОЭКОНОМИКА: население ${(c.population / 1000).toFixed(1)} млн, ВВП ${Math.round(c.gdp).toLocaleString('ru')} ${cur}/год, темп роста ${c.gdpGrowth > 0 ? '+' : ''}${c.gdpGrowth}%/год, инфраструктура ${Math.round(c.infrastructure)}/100. Структура ВВП: сельское хозяйство ${s.agriculture}%, промышленность ${s.industry}%, финансы ${s.finance}%, сырьё ${s.resources}%, услуги ${s.services}%.`;
}

function econDescribeLaws(c) {
  if (!c || !c.lawSlots) return '';
  return 'ЗАКОНЫ (слоты движка, менять ТОЛЬКО через law_slots): ' +
    Object.entries(c.lawSlots).map(([slot, id]) => {
      const o = lawOption(slot, id);
      return `${LAW_SLOTS[slot].label}: ${o ? o.label : id}`;
    }).join('; ') + '.';
}

// Спецификация вариантов законов для промпта (чтобы ИИ знал допустимые id)
function econLawSpecForPrompt() {
  return Object.entries(LAW_OPTIONS).map(([slot, opts]) =>
    `${slot} (${LAW_SLOTS[slot].label}): ${opts.map(o => `"${o.id}"=${o.label}`).join(', ')}`
  ).join('\n');
}
