// ============================================================
// AI.JS v4 — полная память, AI-оценка дипломатии, длинные новости
// ============================================================

const GEMINI_API_KEY = localStorage.getItem('openrouter_key') || '';
if (!GEMINI_API_KEY) { const k = prompt('Введите OpenRouter API ключ:'); if(k) { localStorage.setItem('openrouter_key', k); location.reload(); } }
const GEMINI_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'google/gemini-2.0-flash-001';

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
  diploLog: []
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
    country: 'Франция',
    ruler: 'Луи-Наполеон Бонапарт',
    government: 'Президентская республика',
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

  return `Отношения Франции со странами: ${relText}.\n${warText} ${allyText}\n\n${newsText}`;
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
const REALISM_RULES = `
СТРОГИЕ ПРАВИЛА:
1. Действие происходит ТОЛЬКО в реальной истории 1852 года. Никакой фантастики, никаких анахронизмов.
2. Игрок управляет ТОЛЬКО Францией. Другие страны реагируют исходя из СВОЕЙ логики и интересов.
3. Если действие игрока нереалистично — опиши провальную или саркастичную попытку.
4. Войны не откладываются бесконечно: если отношения ниже -50 и есть провокация — бои реально начинаются.
`;

// ============================================================
// ПАРСИНГ И ПРИМЕНЕНИЕ JSON-ЭФФЕКТОВ ОТ ИИ
// ============================================================
function parseAndApplyEffects(text) {
  try {
    // Ищем EFFECTS на одной строке (AI должен писать JSON без переносов)
    const match = text.match(/EFFECTS:\s*(\{[^\n}]*(?:\}[^\n}]*)*\})/);
    console.log('[EFFECTS] raw:', text.slice(-600));
    console.log('[EFFECTS] match:', match ? match[1] : 'НЕ НАЙДЕНО');
    if (!match) return;
    const effects = JSON.parse(match[1]);

    if (effects.treasury_delta && effects.treasury_delta !== 0)
      changeGameStat('treasury', effects.treasury_delta);
    if (effects.army_delta && effects.army_delta !== 0)
      changeGameStat('army', effects.army_delta);
    if (effects.stability_delta && effects.stability_delta !== 0)
      changeGameStat('stability', effects.stability_delta);

    if (effects.relations) {
      Object.entries(effects.relations).forEach(([country, delta]) => {
        if (delta && delta !== 0) changeRelations(country, delta);
      });
    }

    if (effects.war_declared && Array.isArray(effects.war_declared)) {
      effects.war_declared.forEach(c => {
        if (!worldState.atWarWith.includes(c)) worldState.atWarWith.push(c);
        changeRelations(c, -50);
        showNotif(`⚔️ Война объявлена: ${c}!`);
      });
    }

    if (effects.peace_made && Array.isArray(effects.peace_made)) {
      effects.peace_made.forEach(c => {
        worldState.atWarWith = worldState.atWarWith.filter(x => x !== c);
        changeRelations(c, 20);
        showNotif(`🕊️ Мир заключён с ${c}`);
      });
    }

    if (typeof updateRelationsPanel === 'function') updateRelationsPanel();
  } catch (e) {
    console.log('EFFECTS parse error:', e.message);
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
Страна игрока: ${state.country}. Правитель: ${state.ruler}. Форма правления: ${state.government}.
Казна: ${state.treasury}. Доход: ${state.income}. Армия: ${state.army}. Стабильность: ${state.stability}.

${describeWorldState()}

${REALISM_RULES}

Действия игрока в этом месяце:
${actions}

Напиши РОВНО 7 новостных событий этого месяца. Каждое событие — 2-3 предложения (40-60 слов), содержательно и с деталями. Отражай последствия действий игрока напрямую: если казнил — пиши о реакции армии и народа, если потратил деньги — пиши куда ушли, если оскорблял страну — пиши о дипломатическом кризисе. Каждое событие с новой строки, без нумерации и символов. Пиши на русском языке.

После 7 событий напиши ровно одну строку:
EFFECTS:{"treasury_delta":0,"army_delta":0,"stability_delta":0,"relations":{"Испания":0,"Великобритания":0,"Россия":0,"Австрия":0,"Пруссия":0},"war_declared":[],"peace_made":[]}

КРИТИЧЕСКИ ВАЖНО — заполняй числа исходя из действий игрока, не ставь нули без причины:
- Казнил/убил солдат или людей → army_delta отрицательный (−количество), stability_delta −3 до −8
- Потратил деньги (платье, пир, строительство, взятка) → treasury_delta равный сумме со знаком минус
- Оскорблял, угрожал стране → relations с ней от −10 до −30
- Объявил войну → war_declared содержит страну
- Торговал, заключал союз → relations положительный, treasury_delta положительный
- Беспорядки в новостях → stability_delta отрицательный
- treasury_delta в франках (например −4000), army_delta в солдатах (например −5000)`;

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

  const systemContext = `Ты — главный советник Франции в ${state.date}.
Правитель: ${state.ruler}. Казна: ${state.treasury}. Армия: ${state.army}. Стабильность: ${state.stability}.

${describeWorldState()}

${REALISM_RULES}

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

  diplomacyHistories[targetCountry].push({ role: 'france', text: message });
  const historyText = diplomacyHistories[targetCountry].slice(-8)
    .map(m => `${m.role === 'france' ? 'Франция' : targetCountry}: ${m.text}`).join('\n');

  const relLabel = relation > 30 ? 'дружелюбные' : relation < -30 ? 'враждебные' : 'нейтральные';
  const warLine = isWar ? 'ВЫ СЕЙЧАС В СОСТОЯНИИ ВОЙНЫ С ФРАНЦИЕЙ.' : '';
  const allyLine = isAlly ? 'Вы союзники с Францией.' : '';

  const prompt = `Ты — ${leader} страны ${targetCountry} в ${state.date}.
Текущие отношения с Францией: ${relation} (${relLabel}). ${warLine} ${allyLine}
Ты ведёшь дипломатические переговоры с Францией (правитель: ${state.ruler}).
${recentNews}

${REALISM_RULES}

Отвечай от первого лица, как этот исторический персонаж. Реагируй на тон и содержание послания — если Франция грубит, оскорбляет, угрожает — реагируй с гневом и последствиями. Если предлагает выгодное — рассматривай заинтересованно. 60-100 слов.

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
