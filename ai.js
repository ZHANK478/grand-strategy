// ============================================================
// AI.JS v2 — состояние мира, разделение власти, фильтр реализма
// ============================================================

const GEMINI_API_KEY = localStorage.getItem('openrouter_key') || '';
if (!GEMINI_API_KEY) { const k = prompt('Введите OpenRouter API ключ:'); if(k) { localStorage.setItem('openrouter_key', k); location.reload(); } }
const GEMINI_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'google/gemini-3.1-flash-lite';

// ============================================================
// СОСТОЯНИЕ МИРА — числа которые ИИ обязан учитывать
// ============================================================
let worldState = {
  relations: {
    'Испания': 0,
    'Великобритания': 10,
    'Россия': 5,
    'Австрия': -5,
    'Пруссия': 15
  },
  atWarWith: [],       // страны с которыми идёт война
  alliedWith: [],       // союзники
  pastEvents: [],       // история последних событий (память мира)
  diploLog: []          // лог всех дипломатических переговоров
};

let playerActions = [];

// ---- Изменить отношения со страной ----
function changeRelations(country, delta) {
  if (worldState.relations[country] === undefined) worldState.relations[country] = 0;
  worldState.relations[country] = Math.max(-100, Math.min(100, worldState.relations[country] + delta));
}

// ---- Получить состояние игры ----
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

// ---- Текстовое описание состояния мира для промта ----
function describeWorldState() {
  const relText = Object.entries(worldState.relations)
    .map(([c, v]) => `${c}: ${v} (${v > 30 ? 'дружелюбные' : v < -30 ? 'враждебные' : 'нейтральные'})`)
    .join(', ');
  const warText = worldState.atWarWith.length > 0
    ? `ВОЙНА с: ${worldState.atWarWith.join(', ')}.`
    : 'Войн нет.';
  const allyText = worldState.alliedWith.length > 0
    ? `Союзники: ${worldState.alliedWith.join(', ')}.`
    : '';
  const memoryText = worldState.pastEvents.length > 0
    ? 'Произошло ранее: ' + worldState.pastEvents.slice(-8).join(' | ')
    : 'Игра только началась, прошлых событий нет.';

  return `Отношения Франции со странами: ${relText}.\n${warText} ${allyText}\n${memoryText}`;
}

// ---- Базовый запрос к ИИ ----
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
// ПРАВИЛА РЕАЛИЗМА — общие для всех промтов
// ============================================================
const REALISM_RULES = `
СТРОГИЕ ПРАВИЛА:
1. Действие происходит ТОЛЬКО в реальной истории 1852 года. Никакой фантастики, никакого современного оружия, никаких анахронизмов (ядерное оружие, инопланетяне, технологии будущего).
2. Игрок управляет ТОЛЬКО Францией. Он не может напрямую убивать, назначать или контролировать правителей других стран — такие "приказы" от игрока считаются его желанием или попыткой влияния, а не свершившимся фактом. Другие страны реагируют исходя из СВОЕЙ логики и интересов, а не подчиняются написанному игроком.
3. Если действие игрока выглядит нереалистичным, абсурдным или невозможным для эпохи — опиши САРКАСТИЧНУЮ или ПРОВАЛЬНУЮ попытку, а не успех.
4. Войны не должны заканчиваться одними переговорами — если отношения очень плохие (ниже -50) и есть провокация, военные действия (бои, потери, захват территорий) должны реально начинаться, а не откладываться бесконечно.
`;

// ============================================================
// 1. СОБЫТИЯ ПОСЛЕ ХОДА
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

Напиши РОВНО 6 коротких новостных событий которые произошли в этом месяце в мире, с учётом текущих отношений и состояния войны/мира.
Каждое событие — одно предложение, максимум 20 слов.
Формат — просто список, каждое событие с новой строки, без нумерации и лишних символов.
Пиши на русском языке.`;

  const result = await askGemini(prompt, 400);
  const events = result.trim().split('\n').filter(l => l.trim().length > 0).slice(0, 6);

  // Сохраняем в память мира
  worldState.pastEvents.push(...events);
  if (worldState.pastEvents.length > 20) worldState.pastEvents = worldState.pastEvents.slice(-20);

  return events;
}

// ============================================================
// 2. СОВЕТНИК — чат
// ============================================================
let advisorHistory = [];

async function askAdvisor(userMessage) {
  const state = getGameState();

  const systemContext = `Ты — главный советник Франции в ${state.date}.
Правитель: ${state.ruler}. Казна: ${state.treasury}. Армия: ${state.army}. Стабильность: ${state.stability}.

${describeWorldState()}

${REALISM_RULES}

Отвечай кратко, по делу, от лица советника эпохи 1852 года. Максимум 80 слов.`;

  advisorHistory.push({ role: 'user', text: userMessage });
  const historyText = advisorHistory.slice(-6).map(m => `${m.role === 'user' ? 'Игрок' : 'Советник'}: ${m.text}`).join('\n');

  const prompt = `${systemContext}\n\nИстория разговора:\n${historyText}\n\nОтвет советника:`;
  const response = await askGemini(prompt, 220);
  advisorHistory.push({ role: 'advisor', text: response });
  return response;
}

// ============================================================
// 3. ДИПЛОМАТИЯ — чат со страной, влияет на отношения и попадает в события
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

  diplomacyHistories[targetCountry].push({ role: 'france', text: message });
  const historyText = diplomacyHistories[targetCountry].slice(-6)
    .map(m => `${m.role === 'france' ? 'Франция' : targetCountry}: ${m.text}`).join('\n');

  const prompt = `Ты — ${leader} страны ${targetCountry} в ${state.date}.
Текущие отношения с Францией: ${relation} (от -100 враждебно до +100 дружелюбно). ${isWar ? 'ВЫ СЕЙЧАС В СОСТОЯНИИ ВОЙНЫ.' : ''}
Ты ведёшь дипломатические переговоры с Францией (правитель: ${state.ruler}).

${REALISM_RULES}

Отвечай от первого лица, как этот исторический персонаж, исходя из текущих отношений. Если игрок угрожает или объявляет войну — реагируй соответственно серьёзно, не игнорируй угрозу. Кратко, 60 слов максимум.

История переговоров:
${historyText}

Ответ ${targetCountry}:`;

  const response = await askGemini(prompt, 200);
  diplomacyHistories[targetCountry].push({ role: targetCountry, text: response });

  // Простая эвристика — если игрок написал "война" или похожее, понижаем отношения и помечаем войну
  const lower = message.toLowerCase();
  if (lower.includes('войн') || lower.includes('атак') || lower.includes('напад')) {
    changeRelations(targetCountry, -40);
    if (!worldState.atWarWith.includes(targetCountry)) worldState.atWarWith.push(targetCountry);
  }

  // Записываем переговоры в общий лог чтобы события месяца их учитывали
  worldState.diploLog.push(`Переговоры Франции с ${targetCountry}: игрок сказал "${message}", ответ — "${response.slice(0, 80)}..."`);
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
// Интеграция с nextTurn — теперь включает лог дипломатии в события
// ============================================================
async function onTurnEnd() {
  const eventsBox = document.getElementById('events-box');
  const eventsList = document.getElementById('events-list');

  eventsBox.style.display = 'block';
  eventsList.innerHTML = '<div class="ev-loading">⏳ ИИ симулирует мир...</div>';

  // Если были дипломатические переговоры — добавляем их в действия игрока
  if (worldState.diploLog.length > 0) {
    playerActions.push('Дипломатические события: ' + worldState.diploLog.join('; '));
  }

  const events = await generateEvents();
  eventsList.innerHTML = events.map(e =>
    `<div class="ev-item">📰 ${e}</div>`
  ).join('');

  // Сброс на новый ход
  playerActions = [];
  worldState.diploLog = [];
  renderActionsList();
  document.getElementById('actions-panel').style.display = 'none';
}
