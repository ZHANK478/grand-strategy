// ============================================================
// AI.JS v3 — состояние мира, JSON-эффекты, полная память
// ============================================================

const GEMINI_API_KEY = localStorage.getItem('openrouter_key') || '';
if (!GEMINI_API_KEY) { const k = prompt('Введите OpenRouter API ключ:'); if(k) { localStorage.setItem('openrouter_key', k); location.reload(); } }
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
  pastEvents: [],   // вся хроника новостей — видят советник, дипломаты, генератор
  diploLog: []      // лог переговоров этого хода
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

// Полное описание мира — общее для всех ИИ-каналов
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
    ? 'ПОСЛЕДНИЕ НОВОСТИ:\n' + worldState.pastEvents.slice(-10).map((e, i) => `${i + 1}. ${e}`).join('\n')
    : 'Игра только началась, прошлых событий нет.';

  return `Отношения Франции со странами: ${relText}.\n${warText} ${allyText}\n\n${newsText}`;
}

// Базовый запрос к ИИ
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
    const match = text.match(/EFFECTS:\s*(\{[\s\S]*?\})/);
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

// ============================================================
// 1. СОБЫТИЯ ПОСЛЕ ХОДА — 7 новостей + JSON-эффекты
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

Напиши РОВНО 7 коротких новостных событий, которые произошли в этом месяце. Учитывай текущие отношения, войны, дипломатические переговоры и действия игрока. Торговля с Испанией должна отражаться в новостях. Войны — в потерях и захватах.
Каждое событие — одно предложение, максимум 25 слов. Каждое с новой строки, без нумерации и символов.
Пиши на русском языке.

После 7 событий напиши ровно одну строку в таком формате (JSON, без переносов):
EFFECTS:{"treasury_delta":0,"army_delta":0,"stability_delta":0,"relations":{"Испания":0,"Великобритания":0,"Россия":0,"Австрия":0,"Пруссия":0},"war_declared":[],"peace_made":[]}

Заполни числами только те поля, которые логически следуют из событий:
- treasury_delta: торговля, налоги, расходы на войну (в франках, например +500 или -1000)
- army_delta: потери или пополнение армии (в солдатах, например -2000 или +5000)
- stability_delta: восстания, реформы (от -5 до +5)
- relations: изменение отношений со странами (от -20 до +20 за ход)
- war_declared: список стран, с которыми началась война (пустой массив если войны нет)
- peace_made: список стран, с которыми заключён мир`;

  const result = await askGemini(prompt, 700);

  // Отделяем события от EFFECTS
  const effectsIndex = result.indexOf('EFFECTS:');
  const eventsText = effectsIndex > -1 ? result.slice(0, effectsIndex) : result;
  const events = eventsText.trim().split('\n').filter(l => l.trim().length > 2).slice(0, 7);

  // Применяем числовые эффекты
  parseAndApplyEffects(result);

  // Сохраняем в хронику мира
  worldState.pastEvents.push(...events);
  if (worldState.pastEvents.length > 30) worldState.pastEvents = worldState.pastEvents.slice(-30);

  return events;
}

// ============================================================
// 2. СОВЕТНИК — видит все новости и историю мира
// ============================================================
let advisorHistory = [];

async function askAdvisor(userMessage) {
  const state = getGameState();

  const systemContext = `Ты — главный советник Франции в ${state.date}.
Правитель: ${state.ruler}. Казна: ${state.treasury}. Армия: ${state.army}. Стабильность: ${state.stability}.

${describeWorldState()}

${REALISM_RULES}

Отвечай кратко, по делу, от лица советника эпохи 1852 года. Ты знаешь все последние новости и события. Максимум 100 слов.`;

  advisorHistory.push({ role: 'user', text: userMessage });
  const historyText = advisorHistory.slice(-6).map(m =>
    `${m.role === 'user' ? 'Игрок' : 'Советник'}: ${m.text}`
  ).join('\n');

  const prompt = `${systemContext}\n\nИстория разговора:\n${historyText}\n\nОтвет советника:`;
  const response = await askGemini(prompt, 280);
  advisorHistory.push({ role: 'advisor', text: response });
  return response;
}

// ============================================================
// 3. ДИПЛОМАТИЯ — страна видит новости и переговоры
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

  // Последние новости — дипломат знает о них
  const recentNews = worldState.pastEvents.length > 0
    ? 'Последние известия в мире: ' + worldState.pastEvents.slice(-5).join(' | ')
    : '';

  diplomacyHistories[targetCountry].push({ role: 'france', text: message });
  const historyText = diplomacyHistories[targetCountry].slice(-6)
    .map(m => `${m.role === 'france' ? 'Франция' : targetCountry}: ${m.text}`).join('\n');

  const relLabel = relation > 30 ? 'дружелюбные' : relation < -30 ? 'враждебные' : 'нейтральные';
  const warLine = isWar ? 'ВЫ СЕЙЧАС В СОСТОЯНИИ ВОЙНЫ С ФРАНЦИЕЙ.' : '';
  const allyLine = isAlly ? 'Вы союзники с Францией.' : '';

  const prompt = `Ты — ${leader} страны ${targetCountry} в ${state.date}.
Текущие отношения с Францией: ${relation} (${relLabel}). ${warLine} ${allyLine}
Ты ведёшь дипломатические переговоры с Францией (правитель: ${state.ruler}).
${recentNews}

${REALISM_RULES}

Отвечай от первого лица, как этот исторический персонаж. Реагируй на содержание послания серьёзно. Если Франция угрожает — отвечай твёрдо. Если предлагает выгодную торговлю — рассматривай заинтересованно. Кратко, 80 слов максимум.

История переговоров:
${historyText}

Ответ ${targetCountry}:`;

  const response = await askGemini(prompt, 230);
  diplomacyHistories[targetCountry].push({ role: targetCountry, text: response });

  // Реакция на ключевые слова
  const lower = message.toLowerCase();
  if (lower.includes('войн') || lower.includes('атак') || lower.includes('напад') || lower.includes('ультиматум')) {
    changeRelations(targetCountry, -40);
    if (!worldState.atWarWith.includes(targetCountry)) worldState.atWarWith.push(targetCountry);
    showNotif(`⚔️ Отношения с ${targetCountry} резко ухудшились!`);
  } else if (lower.includes('торговл') || lower.includes('союз') || lower.includes('мир') || lower.includes('договор')) {
    changeRelations(targetCountry, 5);
  }

  // Записываем в лог хода
  worldState.diploLog.push(`Переговоры с ${targetCountry}: "${message.slice(0, 60)}" → "${response.slice(0, 80)}"`);
  if (worldState.diploLog.length > 10) worldState.diploLog = worldState.diploLog.slice(-10);

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
// Конец хода — включает дипломатический лог в события
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
