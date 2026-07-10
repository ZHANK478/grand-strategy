// ============================================================
// ECON_DATA.JS — ИСТОРИЧЕСКИЙ ЭКОНОМИЧЕСКИЙ СИД (эпоха ~1912).
// Реальные (относительные) данные держав: население, ВВП, структура экономики,
// валюта, госдолг. Движок берёт ИХ вместо случайных чисел → Франция сильнее
// Люксембурга, у каждой страны своя валюта, население масштабируется исторически.
//
//  pop      — население, тыс. чел.
//  gdp      — ВВП, млн (внутренние единицы движка; доход ≈ gdp/12 × ~13%)
//  sectors  — структура ВВП, % (сумма ~100): сельское хоз-во/промышленность/финансы/сырьё/услуги
//  currency — ярлык валюты страны
//  debtDom/debtFor — внутренний/внешний госдолг, млн
//  infra    — инфраструктура 0..100 (развитость)
//
// Ключи ДОЛЖНЫ совпадать с названиями стран сценария (owner провинций).
// Кого нет в таблице (колонии, мелкие страны) — движок оценит скромно (fallback).
// ============================================================
const WORLD_ECON = {
  // ---------- ВЕЛИКИЕ ДЕРЖАВЫ ----------
  'США':                { pop: 95000,  gdp: 92000, infra: 62, currency: '$',        debtDom: 1500, debtFor: 800,
    sectors: { agriculture: 30, industry: 30, finance: 12, resources: 8,  services: 20 } },
  'Германская империя': { pop: 66000,  gdp: 76000, infra: 68, currency: 'марок',    debtDom: 4000, debtFor: 1500,
    sectors: { agriculture: 28, industry: 42, finance: 8,  resources: 6,  services: 16 } },
  'Великобритания':     { pop: 46000,  gdp: 74000, infra: 70, currency: 'ф.ст.',    debtDom: 6000, debtFor: 500,
    sectors: { agriculture: 7,  industry: 34, finance: 20, resources: 3,  services: 36 } },
  'Франция':            { pop: 39500,  gdp: 62000, infra: 60, currency: 'фр.',       debtDom: 7000, debtFor: 2000,
    sectors: { agriculture: 40, industry: 24, finance: 18, resources: 4,  services: 14 } },
  'Российская империя': { pop: 165000, gdp: 57000, infra: 32, currency: 'руб.',      debtDom: 4000, debtFor: 6000,
    sectors: { agriculture: 70, industry: 15, finance: 3,  resources: 8,  services: 4  } },
  'Империя Цин':        { pop: 430000, gdp: 46000, infra: 20, currency: 'таэлей',    debtDom: 1000, debtFor: 2500,
    sectors: { agriculture: 82, industry: 6,  finance: 2,  resources: 6,  services: 4  } },
  'Австро-Венгрия':     { pop: 51000,  gdp: 42000, infra: 52, currency: 'крон',      debtDom: 4500, debtFor: 1500,
    sectors: { agriculture: 55, industry: 25, finance: 6,  resources: 6,  services: 8  } },
  'Италия':             { pop: 35000,  gdp: 31000, infra: 44, currency: 'лир',       debtDom: 4000, debtFor: 1200,
    sectors: { agriculture: 55, industry: 22, finance: 7,  resources: 4,  services: 12 } },
  'Японская империя':   { pop: 52000,  gdp: 28000, infra: 46, currency: 'иен',       debtDom: 1800, debtFor: 900,
    sectors: { agriculture: 55, industry: 23, finance: 6,  resources: 5,  services: 11 } },
  'Османская империя':  { pop: 24000,  gdp: 20000, infra: 26, currency: 'лир',       debtDom: 1500, debtFor: 3500,
    sectors: { agriculture: 70, industry: 10, finance: 3,  resources: 8,  services: 9  } },
  'Испания':            { pop: 20000,  gdp: 19000, infra: 38, currency: 'песет',     debtDom: 2500, debtFor: 700,
    sectors: { agriculture: 58, industry: 18, finance: 6,  resources: 6,  services: 12 } },

  // ---------- СРЕДНИЕ И МАЛЫЕ ГОСУДАРСТВА ----------
  'Бельгия':            { pop: 7500,  gdp: 19000, infra: 72, currency: 'фр.',    debtDom: 1200, debtFor: 300,
    sectors: { agriculture: 18, industry: 46, finance: 10, resources: 5, services: 21 } },
  'Нидерланды':         { pop: 6100,  gdp: 15000, infra: 66, currency: 'гульд.', debtDom: 1000, debtFor: 200,
    sectors: { agriculture: 28, industry: 24, finance: 14, resources: 4, services: 30 } },
  'Швейцария':          { pop: 3800,  gdp: 12000, infra: 70, currency: 'фр.',    debtDom: 300,  debtFor: 100,
    sectors: { agriculture: 25, industry: 34, finance: 16, resources: 2, services: 23 } },
  'Швеция':             { pop: 5600,  gdp: 11000, infra: 54, currency: 'крон',   debtDom: 600,  debtFor: 200,
    sectors: { agriculture: 45, industry: 28, finance: 6,  resources: 10, services: 11 } },
  'Аргентина':          { pop: 7200,  gdp: 16000, infra: 48, currency: 'песо',   debtDom: 800,  debtFor: 1500,
    sectors: { agriculture: 55, industry: 16, finance: 8,  resources: 6, services: 15 } },
  'Бразилия':           { pop: 24000, gdp: 15000, infra: 30, currency: 'рейсов', debtDom: 700,  debtFor: 1600,
    sectors: { agriculture: 68, industry: 12, finance: 4,  resources: 8, services: 8  } },
  'Мексика':            { pop: 15000, gdp: 10000, infra: 28, currency: 'песо',   debtDom: 500,  debtFor: 1000,
    sectors: { agriculture: 68, industry: 12, finance: 4,  resources: 9, services: 7  } },
  'Португалия':         { pop: 6000,  gdp: 8000,  infra: 34, currency: 'эскудо', debtDom: 1200, debtFor: 600,
    sectors: { agriculture: 60, industry: 18, finance: 5,  resources: 5, services: 12 } },
  'Румыния':            { pop: 7500,  gdp: 11000, infra: 32, currency: 'лей',    debtDom: 700,  debtFor: 700,
    sectors: { agriculture: 75, industry: 12, finance: 3,  resources: 6, services: 4  } },
  'Дания':              { pop: 2800,  gdp: 8000,  infra: 64, currency: 'крон',   debtDom: 300,  debtFor: 100,
    sectors: { agriculture: 40, industry: 26, finance: 8,  resources: 3, services: 23 } },
  'Норвегия':           { pop: 2400,  gdp: 5500,  infra: 52, currency: 'крон',   debtDom: 250,  debtFor: 150,
    sectors: { agriculture: 42, industry: 26, finance: 6,  resources: 12, services: 14 } },
  'Сербия':             { pop: 4500,  gdp: 4000,  infra: 24, currency: 'динаров', debtDom: 200, debtFor: 400,
    sectors: { agriculture: 82, industry: 8,  finance: 2,  resources: 4, services: 4  } },
  'Болгария':           { pop: 4300,  gdp: 4000,  infra: 24, currency: 'левов',  debtDom: 200,  debtFor: 400,
    sectors: { agriculture: 80, industry: 9,  finance: 2,  resources: 5, services: 4  } },
  'Греция':             { pop: 2700,  gdp: 3000,  infra: 28, currency: 'драхм',  debtDom: 300,  debtFor: 500,
    sectors: { agriculture: 70, industry: 12, finance: 4,  resources: 4, services: 10 } },
  'Черногория':         { pop: 250,   gdp: 400,   infra: 16, currency: 'перперов', debtDom: 20, debtFor: 60,
    sectors: { agriculture: 85, industry: 5,  finance: 1,  resources: 5, services: 4  } },
  'Персия':             { pop: 12000, gdp: 5500,  infra: 18, currency: 'туманов', debtDom: 200, debtFor: 900,
    sectors: { agriculture: 78, industry: 7,  finance: 2,  resources: 9, services: 4  } },
  'Сиам':               { pop: 8000,  gdp: 5500,  infra: 22, currency: 'батов',  debtDom: 150,  debtFor: 300,
    sectors: { agriculture: 80, industry: 8,  finance: 2,  resources: 6, services: 4  } },
  'Афганистан':         { pop: 6000,  gdp: 2500,  infra: 12, currency: 'афгани', debtDom: 50,   debtFor: 100,
    sectors: { agriculture: 85, industry: 4,  finance: 1,  resources: 6, services: 4  } },
  'Люксембург':         { pop: 260,   gdp: 1300,  infra: 66, currency: 'фр.',    debtDom: 40,   debtFor: 20,
    sectors: { agriculture: 25, industry: 48, finance: 8,  resources: 6, services: 13 } }
};

// Возвращает исторический сид страны по названию (или null).
function worldEconSeed(name) {
  if (!name) return null;
  return WORLD_ECON[name] || null;
}
