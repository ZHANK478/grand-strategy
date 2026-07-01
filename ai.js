// ============================================================
// AI.JS v4 — полная память, AI-оценка дипломатии, длинные новости
// ============================================================

// Ключ жёстко очищается от любых непечатаемых/неASCII символов — иначе Bearer-заголовок
// ломается с ошибкой "String contains non ISO-8859-1 code point" (бывает после копипаста
// со скрытыми юникод-символами).
let GEMINI_API_KEY = (localStorage.getItem('openrouter_key') || '').replace(/[^\x20-\x7E]/g, '').trim();
if (!GEMINI_API_KEY) {
  const k = prompt('Введите OpenRouter API ключ:');
  if (k) {
    GEMINI_API_KEY = k.replace(/[^\x20-\x7E]/g, '').trim();
    localStorage.setItem('openrouter_key', GEMINI_API_KEY);
    location.reload();
  }
}
const GEMINI_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'google/gemini-3.1-flash-lite';

// ============================================================
// СОСТОЯНИЕ МИРА
// ============================================================
let worldState = {
  relations: {
    'Испания': 0,
    'Великобритания': 10,
    'Россия': 5,
    'Австрия': -5,
    'Пруссия': 15
  },
  atWarWith: [],
  alliedWith: [],
  pastEvents: [],   // хроника — до 120 событий
  diploLog: [],
  mapObjects: []    // объекты на карте: армии, штабы, дипломаты и т.д.
};

let playerActions = [];

function changeRelations(country, delta) {
  if (worldState.relations[country] === undefined) worldState.relations[country] = 0;
  worldState.relations[country] = Math.max(-100, Math.min(100, worldState.relations[country] + delta));
  if (typeof updateRelationsPanel === 'function') updateRelationsPanel();
}

function getGameState() {
  return {
    date: document.getElementById('date-disp').textContent,
    treasury: document.getElementById('treasury').textContent,
    income: document.getElementById('income').textContent,
    army: document.getElementById('army').textContent,
    stability: document.getElementById('stab').textContent,
    country: (typeof playerCountryDisplayName !== 'undefined') ? playerCountryDisplayName : (typeof playerCountry !== 'undefined' ? playerCountry : 'Франция'),
    ruler: (typeof stateOfPower !== 'undefined') ? stateOfPower.ruler : 'Луи-Наполеон Бонапарт',
    rulerTitle: (typeof stateOfPower !== 'undefined') ? stateOfPower.rulerTitle : 'Президент Французской республики',
    government: (typeof stateOfPower !== 'undefined') ? stateOfPower.government : 'Президентская республика',
    pm: (typeof stateOfPower !== 'undefined') ? stateOfPower.pm : 'Эжен Руэр',
    pmTitle: (typeof stateOfPower !== 'undefined') ? stateOfPower.pmTitle : 'Министр-президент',
    year: 1852
  };
}

function describeWorldState() {
  const relText = Object.entries(worldState.relations)
    .map(([c, v]) => `${c}: ${v > 0 ? '+' : ''}${v} (${v > 30 ? 'дружелюбные' : v < -30 ? 'враждебные' : 'нейтральные'})`)
    .join(', ');
  const warText = worldState.atWarWith.length > 0
    ? `⚔️ ВОЙНА с: ${worldState.atWarWith.join(', ')}.`
    : 'Войн нет.';
  const allyText = worldState.alliedWith.length > 0
    ? `Союзники: ${worldState.alliedWith.join(', ')}.`
    : '';
  const newsText = worldState.pastEvents.length > 0
    ? 'ХРОНИКА ПОСЛЕДНИХ СОБЫТИЙ (от новых к старым):\n' +
      worldState.pastEvents.slice(-40).reverse().map((e, i) => `${i + 1}. ${e}`).join('\n')
    : 'Игра только началась, прошлых событий нет.';

  const pc = (typeof playerCountryDisplayName !== 'undefined') ? playerCountryDisplayName : (typeof playerCountry !== 'undefined' ? playerCountry : 'Франция');
  return `Отношения ${pc} со странами: ${relText}.\n${warText} ${allyText}\n\n${newsText}`;
}

async function askGemini(prompt, maxTokens = 400) {
  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GEMINI_API_KEY
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.75
      })
    });
    const data = await response.json();
    if (data.choices && data.choices[0]) {
      return data.choices[0].message.content;
    }
    return 'ИИ не ответил. Проверьте API ключ.';
  } catch (e) {
    return 'Ошибка соединения с ИИ: ' + e.message;
  }
}

// ============================================================
// ПРАВИЛА РЕАЛИЗМА
// ============================================================
function getRealismRules() {
  const pc = (typeof playerCountryDisplayName !== 'undefined') ? playerCountryDisplayName : (typeof playerCountry !== 'undefined' ? playerCountry : 'Франция');
  return `
СТРОГИЕ ПРАВИЛА:
1. Действие происходит ТОЛЬКО в реальной истории 1852 года. Никакой фантастики, никаких анахронизмов.
2. Игрок управляет ТОЛЬКО страной ${pc}. Другие страны реагируют исходя из СВОЕЙ логики и интересов.
3. Если действие игрока нереалистично — опиши провальную или саркастичную попытку.
4. Войны не откладываются бесконечно: если отношения ниже -50 и есть провокация — бои реально начинаются.
`;
}
const REALISM_RULES_LEGACY = null; // оставлено для совместимости, используйте getRealismRules()

// ============================================================
// ПАРСИНГ И ПРИМЕНЕНИЕ JSON-ЭФФЕКТОВ ОТ ИИ
// ============================================================
function parseAndApplyEffects(text) {
  const turnChanges = [];
  try {
    // Ищем EFFECTS на одной строке (AI должен писать JSON без переносов)
    const match = text.match(/EFFECTS:\s*(\{[^\n}]*(?:\}[^\n}]*)*\})/);
    console.log('[EFFECTS] raw:', text.slice(-600));
    console.log('[EFFECTS] match:', match ? match[1] : 'НЕ НАЙДЕНО');
    if (!match) { if (typeof renderTurnChanges === 'function') renderTurnChanges(turnChanges); return; }
    const effects = JSON.parse(match[1]);

    if (effects.treasury_delta && effects.treasury_delta !== 0) {
      changeGameStat('treasury', effects.treasury_delta);
      turnChanges.push({ label: '💰 Казна', value: (effects.treasury_delta > 0 ? '+' : '') + effects.treasury_delta + ' фр.', sign: effects.treasury_delta });
    }
    if (effects.income_delta && effects.income_delta !== 0) {
      changeGameStat('income', effects.income_delta);
      turnChanges.push({ label: '📈 Доход/мес', value: (effects.income_delta > 0 ? '+' : '') + effects.income_delta + ' фр.', sign: effects.income_delta });
    }
    if (effects.army_delta && effects.army_delta !== 0) {
      changeGameStat('army', effects.army_delta);
      turnChanges.push({ label: '⚔️ Армия', value: (effects.army_delta > 0 ? '+' : '') + effects.army_delta, sign: effects.army_delta });
    }
    if (effects.stability_delta && effects.stability_delta !== 0) {
      changeGameStat('stability', effects.stability_delta);
      turnChanges.push({ label: '🌾 Стабильность', value: (effects.stability_delta > 0 ? '+' : '') + effects.stability_delta, sign: effects.stability_delta });
    }

    if (effects.relations) {
      Object.entries(effects.relations).forEach(([country, delta]) => {
        if (delta && delta !== 0) {
          changeRelations(country, delta);
          turnChanges.push({ label: '🤝 ' + country, value: (delta > 0 ? '+' : '') + delta, sign: delta });
        }
      });
    }

    if (effects.map_objects && Array.isArray(effects.map_objects) && typeof applyMapObjects === 'function') {
      const objLog = applyMapObjects(effects.map_objects);
      objLog.forEach(msg => turnChanges.push({ label: '🗺️ Карта', value: msg.replace(/^\S+\s/, ''), sign: 0 }));
    }

    if (effects.territory_transfer && Array.isArray(effects.territory_transfer) && typeof transferTerritory === 'function') {
      effects.territory_transfer.forEach(t => {
        if (!t || !t.country || !t.new_owner) return;
        const oldOwner = (typeof territoryOwnerOf === 'function') ? territoryOwnerOf(t.country) : t.country;
        if (oldOwner === t.new_owner) return;
        transferTerritory(t.country, t.new_owner);
        showNotif(`🏳️ ${t.country} теперь под властью: ${t.new_owner}`);
        turnChanges.push({ label: '🏳️ Территория', value: t.country + ' → ' + t.new_owner, sign: t.new_owner === playerCountry ? 1 : (oldOwner === playerCountry ? -1 : 0) });
      });
    }

    if (effects.war_declared && Array.isArray(effects.war_declared)) {
      effects.war_declared.forEach(c => {
        if (!worldState.atWarWith.includes(c)) worldState.atWarWith.push(c);
        changeRelations(c, -50);
        showNotif(`⚔️ Война объявлена: ${c}!`);
        turnChanges.push({ label: '⚔️ Война', value: c, sign: -1 });
      });
    }

    if (effects.peace_made && Array.isArray(effects.peace_made)) {
      effects.peace_made.forEach(c => {
        worldState.atWarWith = worldState.atWarWith.filter(x => x !== c);
        changeRelations(c, 20);
        showNotif(`🕊️ Мир заключён с ${c}`);
        turnChanges.push({ label: '🕊️ Мир', value: c, sign: 1 });
      });
    }

    // Смена названия самой страны (например Пруссия → Германская империя после объединения)
    if (effects.country_name && typeof renameCountry === 'function' && effects.country_name !== playerCountryDisplayName) {
      const old = playerCountryDisplayName;
      renameCountry(effects.country_name);
      showNotif(`🏳️ Страна переименована: ${effects.country_name}`);
      turnChanges.push({ label: '🏳️ Название страны', value: old + ' → ' + effects.country_name, sign: 0 });
    }

    // Смена власти: правитель, его титул, форма правления, премьер-министр и его титул
    if (effects.ruler_name && typeof stateOfPower !== 'undefined' && effects.ruler_name !== stateOfPower.ruler) {
      const old = stateOfPower.ruler;
      changePowerState('ruler', effects.ruler_name);
      showNotif(`👑 Новый глава государства: ${effects.ruler_name}`);
      turnChanges.push({ label: '👑 Смена власти', value: old + ' → ' + effects.ruler_name, sign: 0 });
    }
    if (effects.ruler_title && typeof stateOfPower !== 'undefined' && effects.ruler_title !== stateOfPower.rulerTitle) {
      const old = stateOfPower.rulerTitle;
      changePowerState('rulerTitle', effects.ruler_title);
      turnChanges.push({ label: '👑 Титул главы государства', value: old + ' → ' + effects.ruler_title, sign: 0 });
    }
    if (effects.government && typeof stateOfPower !== 'undefined' && effects.government !== stateOfPower.government) {
      const old = stateOfPower.government;
      changePowerState('government', effects.government);
      showNotif(`🏛 Форма правления изменена: ${effects.government}`);
      turnChanges.push({ label: '🏛 Форма правления', value: old + ' → ' + effects.government, sign: 0 });
    }
    if (effects.pm_name && typeof stateOfPower !== 'undefined' && effects.pm_name !== stateOfPower.pm) {
      const old = stateOfPower.pm;
      changePowerState('pm', effects.pm_name);
      showNotif(`🎩 Новый глава правительства: ${effects.pm_name}`);
      turnChanges.push({ label: '🎩 Глава правительства', value: old + ' → ' + effects.pm_name, sign: 0 });
    }
    if (effects.pm_title && typeof stateOfPower !== 'undefined' && effects.pm_title !== stateOfPower.pmTitle) {
      const old = stateOfPower.pmTitle;
      changePowerState('pmTitle', effects.pm_title);
      turnChanges.push({ label: '🎩 Титул главы правительства', value: old + ' → ' + effects.pm_title, sign: 0 });
    }

    if (typeof updateRelationsPanel === 'function') updateRelationsPanel();
    if (typeof renderTurnChanges === 'function') renderTurnChanges(turnChanges);
  } catch (e) {
    console.log('EFFECTS parse error:', e.message);
    if (typeof renderTurnChanges === 'function') renderTurnChanges(turnChanges);
  }
}

// Парсинг изменения отношений из дипломатического ответа
function parseDiploEffects(text, targetCountry) {
  try {
    const match = text.match(/DIPLO_EFFECTS:\s*(\{[\s\S]*?\})/);
    if (!match) return;
    const effects = JSON.parse(match[1]);
    if (effects.relations_delta && effects.relations_delta !== 0) {
      changeRelations(targetCountry, effects.relations_delta);
      if (effects.relations_delta <= -20) {
        showNotif(`😠 ${targetCountry} крайне недоволен переговорами`);
      } else if (effects.relations_delta >= 10) {
        showNotif(`🤝 Отношения с ${targetCountry} улучшились`);
      }
    }
    if (effects.war_start) {
      if (!worldState.atWarWith.includes(targetCountry)) {
        worldState.atWarWith.push(targetCountry);
        showNotif(`⚔️ ${targetCountry} объявляет войну Франции!`);
      }
    }
  } catch (e) {
    console.log('DIPLO_EFFECTS parse error:', e.message);
  }
}

// ============================================================
// 1. СОБЫТИЯ ПОСЛЕ ХОДА — 7 длинных новостей + JSON-эффекты
// ============================================================
async function generateEvents() {
  const state = getGameState();
  const actions = playerActions.length > 0
    ? playerActions.join('\n')
    : 'Никаких особых действий не предпринималось.';

  const prompt = `Ты — нарратор исторической стратегической игры. Сейчас ${state.date}.
Страна игрока: ${state.country}. Правитель: ${state.ruler} (${state.rulerTitle}). Форма правления: ${state.government}. Глава правительства: ${state.pm} (${state.pmTitle}).
Казна: ${state.treasury}. Доход: ${state.income}. Армия: ${state.army}. Стабильность: ${state.stability}.

${describeWorldState()}

${getRealismRules()}

Действия игрока в этом месяце:
${actions}

Напиши РОВНО 7 новостных событий этого месяца. Каждое событие — 2-3 предложения (40-60 слов), содержательно и с деталями. Отражай последствия действий игрока напрямую: если казнил — пиши о реакции армии и народа, если потратил деньги — пиши куда ушли, если оскорблял страну — пиши о дипломатическом кризисе, если действия ведут к перевороту или провозглашению империи — опиши это как реальное историческое событие. Каждое событие с новой строки, без нумерации и символов. Пиши на русском языке.

После 7 событий напиши ровно одну строку:
EFFECTS:{"treasury_delta":0,"income_delta":0,"army_delta":0,"stability_delta":0,"relations":{${ALL_COUNTRIES.filter(c => c !== state.country).map(c => `"${c}":0`).join(',')}},"war_declared":[],"peace_made":[],"country_name":null,"ruler_name":null,"ruler_title":null,"government":null,"pm_name":null,"pm_title":null,"map_objects":[],"territory_transfer":[]}

КРИТИЧЕСКИ ВАЖНО — заполняй числа исходя из действий игрока, не ставь нули без причины:
- Казнил/убил солдат или людей → army_delta отрицательный (−количество), stability_delta −3 до −8
- Потратил деньги (платье, пир, строительство, взятка) → treasury_delta равный сумме со знаком минус
- Оскорблял, угрожал стране → relations с ней от −10 до −30
- Объявил войну → war_declared содержит страну
- ВАЖНО про мобилизацию/армии на карте: если игрок формирует армию из УЖЕ ИМЕЮЩИХСЯ солдат (например "собрать корпус в Марселе из 30000 солдат") — это просто перераспределение существующей армии по карте (через map_objects), army_delta ДОЛЖЕН остаться 0 (не увеличивай общую численность армии). army_delta положительный используй ТОЛЬКО если это реальный НАБОР НОВЫХ рекрутов сверх существующей армии (учитывай стоимость призыва в treasury_delta).
- ОГРАНИЧЕНИЕ РЕЗКОСТИ: treasury_delta и income_delta не должны превышать примерно 25-30% от текущей казны/дохода за один ход, ЕСЛИ только это не катастрофическое событие (масштабная война, крах государства, революция). Обычные траты (мобилизация, реформы, содержание) должны быть пропорциональны масштабу события, а не произвольно огромными.
- Торговал, заключал союз → relations положительный, treasury_delta положительный
- income_delta — ИСПОЛЬЗУЙ РЕДКО, только для СТРУКТУРНЫХ изменений экономики: открытие/закрытие фабрик, разрушение инфраструктуры войной, изменение налоговой системы, потеря/приобретение территории. НЕ используй income_delta для разовых трат (наряды, пиры, взятки, разовое строительство) — те идут ТОЛЬКО в treasury_delta.
- Если игрок завёл дорогой постоянный проект (содержание новой армии, масштабная стройка, реформы) — это должно давать ТЕКУЩИЕ расходы через treasury_delta в этом И СЛЕДУЮЩИХ ходах (упоминай в новостях "содержание обходится казне в N франков ежемесячно"), а не через income_delta.
- treasury_delta и income_delta в франках, army_delta в солдатах
- country_name: название САМОЙ СТРАНЫ (не правительства). Указывай ТОЛЬКО если по сюжету происходит объединение/переименование государства (например "Пруссия" → "Германская империя" после объединения немецких земель, провозглашение империи меняет название страны). В обычных условиях оставляй null — название страны не должно меняться просто так.
- ruler_name/ruler_title/government/pm_name/pm_title: указывай значение ТОЛЬКО если в новостях произошёл реальный переворот, провозглашение империи/республики, отречение, введение чрезвычайного/временного правления, отставка премьера и т.п. Иначе оставляй null.
  - government — свободный текст названия формы правления, придумывай подходящее исторической логике (например: "Временное правительство", "Чрезвычайное правительство", "Президентская республика", "Империя", "Конституционная монархия", "Военная диктатура" — любое уместное название, не ограничивайся списком).
  - ruler_title — точный титул главы государства текстом, например "Император французов", "Президент Французской республики", "Председатель временного правительства". Меняй вместе с government, когда меняется форма правления.
  - pm_name/pm_title — глава правительства может сохранять пост, но игрок или события могут переименовать его должность (например, из "Министр-президент" в "Премьер-министр" после провозглашения империи) — учитывай это как pm_title без обязательной смены pm_name.

ТЕРРИТОРИИ (territory_transfer) — если по итогам событий одна страна аннексирует/захватывает/уступает территорию другой (включая ${state.country}), отрази смену владельца:
Формат: {"country":"Испания","new_owner":"${state.country}"}. country — одна из стран сценария (${ALL_COUNTRIES.join(', ')}), new_owner — страна, которая теперь ею владеет. Указывай ТОЛЬКО когда это прямо следует из войны/аннексии/уступки территории по итогам событий, иначе оставляй territory_transfer пустым массивом [].

ОБЪЕКТЫ НА КАРТЕ (map_objects) — если игрок явно упомянул создание армии, штаба, флота, отправку делегации/персоны в другую страну и т.п., отрази это как объекты на карте:
Разрешённые города (используй ТОЛЬКО эти названия для location/to): ${Object.keys(CITY_COORDS).join(', ')}.
Формат элемента массива map_objects:
- Создание: {"action":"create","id":"краткий_id_латиницей","type":"army|hq|naval|diplomat|other","owner":"${state.country}","label":"Парижская армия","troops":50000,"location":"Париж"}
  - type "army" — обязательно указывай troops (число солдат). Сумма всех французских армий на карте не может превышать общую численность армии — если превышает, движок сам обрежет.
  - type "hq"/"naval"/"other" — troops не указывай (0), это здания/штабы, не войска.
  - type "diplomat" — конкретный человек/делегация, без troops.
  - Если событие описывает армию мятежников или иностранного вторжения — owner "Бунтовщики" или название страны (не "${state.country}"), тогда лимит численности не действует, придумай реалистичное число сам.
- Перемещение: {"action":"move","id":"тот_же_id","to":"Лондон"} — используй когда объект (например, делегация или армия) отправляется в путь; движение анимируется на карте.
- Удаление: {"action":"remove","id":"тот_же_id"} — когда армия разбита/расформирована или штаб закрыт.
Создавай map_objects ТОЛЬКО когда это явно следует из действий игрока или сюжета. Не создавай объекты просто так. Если ничего подобного не произошло — оставляй map_objects пустым массивом [].`;

  const result = await askGemini(prompt, 1200);

  const effectsIndex = result.indexOf('EFFECTS:');
  const eventsText = effectsIndex > -1 ? result.slice(0, effectsIndex) : result;
  const events = eventsText.trim().split('\n').filter(l => l.trim().length > 10).slice(0, 7);

  parseAndApplyEffects(result);

  worldState.pastEvents.push(...events);
  if (worldState.pastEvents.length > 120) worldState.pastEvents = worldState.pastEvents.slice(-120);

  return events;
}

// ============================================================
// 2. СОВЕТНИК — видит всю хронику
// ============================================================
let advisorHistory = [];

async function askAdvisor(userMessage) {
  const state = getGameState();

  const systemContext = `Ты — главный советник страны ${state.country} в ${state.date}.
Правитель: ${state.ruler}. Казна: ${state.treasury}. Армия: ${state.army}. Стабильность: ${state.stability}.

${describeWorldState()}

${getRealismRules()}

Отвечай кратко, по делу, от лица советника эпохи 1852 года. ОБЯЗАТЕЛЬНО упомяни 1-2 конкретных события из хроники в своём ответе если они есть — покажи что ты в курсе. Максимум 120 слов.`;

  advisorHistory.push({ role: 'user', text: userMessage });
  const historyText = advisorHistory.slice(-10).map(m =>
    `${m.role === 'user' ? 'Игрок' : 'Советник'}: ${m.text}`
  ).join('\n');

  const prompt = `${systemContext}\n\nИстория разговора:\n${historyText}\n\nОтвет советника:`;
  const response = await askGemini(prompt, 350);
  advisorHistory.push({ role: 'advisor', text: response });
  return response;
}

// ============================================================
// 3. ДИПЛОМАТИЯ — ИИ сам оценивает тон и меняет отношения
// ============================================================
const diplomacyHistories = {};
const leaders = {
  'Франция': 'президент Луи-Наполеон Бонапарт',
  'Испания': 'королева Изабелла II',
  'Великобритания': 'премьер-министр лорд Абердин',
  'Россия': 'царь Николай I',
  'Австрия': 'император Франц Иосиф I',
  'Пруссия': 'король Фридрих Вильгельм IV',
};

async function sendDiplomacy(targetCountry, message) {
  const state = getGameState();
  if (!diplomacyHistories[targetCountry]) diplomacyHistories[targetCountry] = [];

  const leader = leaders[targetCountry] || 'правитель ' + targetCountry;
  const relation = worldState.relations[targetCountry] || 0;
  const isWar = worldState.atWarWith.includes(targetCountry);
  const isAlly = worldState.alliedWith.includes(targetCountry);

  const recentNews = worldState.pastEvents.length > 0
    ? 'Последние известия в мире:\n' + worldState.pastEvents.slice(-8).reverse().map((e,i) => `${i+1}. ${e}`).join('\n')
    : '';

  diplomacyHistories[targetCountry].push({ role: 'player', text: message });
  const historyText = diplomacyHistories[targetCountry].slice(-8)
    .map(m => `${m.role === 'player' ? state.country : targetCountry}: ${m.text}`).join('\n');

  const relLabel = relation > 30 ? 'дружелюбные' : relation < -30 ? 'враждебные' : 'нейтральные';
  const warLine = isWar ? `ВЫ СЕЙЧАС В СОСТОЯНИИ ВОЙНЫ С ${state.country.toUpperCase()}.` : '';
  const allyLine = isAlly ? `Вы союзники с ${state.country}.` : '';

  const prompt = `Ты — ${leader} страны ${targetCountry} в ${state.date}.
Текущие отношения с ${state.country}: ${relation} (${relLabel}). ${warLine} ${allyLine}
Ты ведёшь дипломатические переговоры с ${state.country} (правитель: ${state.ruler}).
${recentNews}

${getRealismRules()}

Отвечай от первого лица, как этот исторический персонаж. Реагируй на тон и содержание послания — если собеседник грубит, оскорбляет, угрожает — реагируй с гневом и последствиями. Если предлагает выгодное — рассматривай заинтересованно. 60-100 слов.

История переговоров:
${historyText}

Ответ ${targetCountry}:

После ответа напиши одну строку — твоя оценка этого обмена:
DIPLO_EFFECTS:{"relations_delta":0,"war_start":false}
relations_delta: от -40 до +20 (отрицательный если Франция грубила/угрожала, положительный если предлагала выгоду/дружбу, 0 если нейтрально). war_start: true только если ситуация дошла до реального разрыва.`;

  const rawResponse = await askGemini(prompt, 350);

  // Отделяем текст ответа от DIPLO_EFFECTS
  const diploIdx = rawResponse.indexOf('DIPLO_EFFECTS:');
  const response = diploIdx > -1 ? rawResponse.slice(0, diploIdx).trim() : rawResponse;

  diplomacyHistories[targetCountry].push({ role: targetCountry, text: response });

  // ИИ сам оценил тон — применяем
  parseDiploEffects(rawResponse, targetCountry);

  worldState.diploLog.push(`Переговоры с ${targetCountry}: "${message.slice(0, 60)}" → "${response.slice(0, 80)}"`);
  if (worldState.diploLog.length > 15) worldState.diploLog = worldState.diploLog.slice(-15);

  return response;
}

// ============================================================
// UI — Окно действий
// ============================================================
function openActionsPanel() {
  document.getElementById('actions-panel').style.display = 'block';
  document.getElementById('diplo-pop').style.display = 'none';
  document.getElementById('adv-pop').style.display = 'none';
  document.getElementById('relations-panel').style.display = 'none';
  renderActionsList();
}

function addAction() {
  const input = document.getElementById('action-input');
  const text = input.value.trim();
  if (!text) return;
  playerActions.push(text);
  input.value = '';
  renderActionsList();
  showNotif('✅ Действие добавлено');
}

function removeAction(i) {
  playerActions.splice(i, 1);
  renderActionsList();
}

function renderActionsList() {
  const list = document.getElementById('actions-list');
  if (playerActions.length === 0) {
    list.innerHTML = '<div style="color:#888;font-size:11px;font-style:italic">Нет действий на этот ход</div>';
    return;
  }
  list.innerHTML = playerActions.map((a, i) =>
    `<div class="action-item">
      <span>${a}</span>
      <button onclick="removeAction(${i})" class="rm-btn">✕</button>
    </div>`
  ).join('');
}

// ============================================================
// Конец хода
// ============================================================
async function onTurnEnd() {
  const eventsBox = document.getElementById('events-box');
  const eventsList = document.getElementById('events-list');

  eventsBox.style.display = 'block';
  eventsList.innerHTML = '<div class="ev-loading">⏳ ИИ симулирует мир...</div>';

  if (worldState.diploLog.length > 0) {
    playerActions.push('Дипломатические события этого хода: ' + worldState.diploLog.join('; '));
  }

  const events = await generateEvents();
  eventsList.innerHTML = events.map(e =>
    `<div class="ev-item">📰 ${e}</div>`
  ).join('');

  playerActions = [];
  worldState.diploLog = [];
  renderActionsList();
  document.getElementById('actions-panel').style.display = 'none';
}
