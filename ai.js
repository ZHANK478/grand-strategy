// ============================================================
// AI.JS — Gemini интеграция: события, советник, дипломатия
// ============================================================

const GEMINI_API_KEY = localStorage.getItem('openrouter_key') || '';
if (!GEMINI_API_KEY) { const k = prompt('Введите OpenRouter API ключ:'); if(k) { localStorage.setItem('openrouter_key', k); location.reload(); } }
const GEMINI_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'google/gemini-3.1-flash-lite';
// Текущие действия игрока за ход
let playerActions = [];

// ---- Получить состояние игры для отправки в ИИ ----
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

// ---- Базовый запрос к Gemini ----
async function askGemini(prompt, maxTokens = 400) {
  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.8 }
      })
    });
    const data = await response.json();
    if (data.candidates && data.candidates[0]) {
      return data.candidates[0].content.parts[0].text;
    }
    return 'ИИ не ответил. Проверьте API ключ.';
  } catch (e) {
    return 'Ошибка соединения с ИИ: ' + e.message;
  }
}

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

Действия игрока в этом месяце:
${actions}

Напиши РОВНО 6 коротких новостных событий которые произошли в этом месяце в мире.
Каждое событие — одно предложение, максимум 20 слов.
Формат — просто список, каждое событие с новой строки, без нумерации и лишних символов.
Пиши на русском языке. Учитывай реальную историческую обстановку 1852 года.`;

  const result = await askGemini(prompt, 350);
  return result.trim().split('\n').filter(l => l.trim().length > 0).slice(0, 6);
}

// ============================================================
// 2. СОВЕТНИК — чат
// ============================================================
let advisorHistory = [];

async function askAdvisor(userMessage) {
  const state = getGameState();

  const systemContext = `Ты — главный советник Франции в ${state.date}.
Правитель: ${state.ruler}. Казна: ${state.treasury}. Армия: ${state.army}. Стабильность: ${state.stability}.
Отвечай кратко, по делу, от лица советника эпохи 1852 года. Максимум 80 слов.`;

  advisorHistory.push({ role: 'user', text: userMessage });
  const historyText = advisorHistory.slice(-4).map(m => `${m.role === 'user' ? 'Игрок' : 'Советник'}: ${m.text}`).join('\n');

  const prompt = `${systemContext}\n\nИстория разговора:\n${historyText}\n\nОтвет советника:`;
  const response = await askGemini(prompt, 200);
  advisorHistory.push({ role: 'advisor', text: response });
  return response;
}

// ============================================================
// 3. ДИПЛОМАТИЯ — чат со страной
// ============================================================
const diplomacyHistories = {};

async function sendDiplomacy(targetCountry, message) {
  const state = getGameState();
  if (!diplomacyHistories[targetCountry]) diplomacyHistories[targetCountry] = [];

  const leaders = {
    'Испания': 'королева Изабелла II',
    'Великобритания': 'премьер-министр лорд Абердин',
    'Россия': 'царь Николай I',
    'Австрия': 'император Франц Иосиф I',
    'Пруссия': 'король Фридрих Вильгельм IV',
  };
  const leader = leaders[targetCountry] || 'правитель ' + targetCountry;

  diplomacyHistories[targetCountry].push({ role: 'france', text: message });
  const historyText = diplomacyHistories[targetCountry].slice(-4)
    .map(m => `${m.role === 'france' ? 'Франция' : targetCountry}: ${m.text}`).join('\n');

  const prompt = `Ты — ${leader} страны ${targetCountry} в ${state.date}.
Ты ведёшь дипломатические переговоры с Францией (правитель: ${state.ruler}).
Отвечай от первого лица, как этот исторический персонаж. Кратко, 60 слов максимум.
Учитывай реальные интересы ${targetCountry} в 1852 году.

История переговоров:
${historyText}

Ответ ${targetCountry}:`;

  const response = await askGemini(prompt, 180);
  diplomacyHistories[targetCountry].push({ role: targetCountry, text: response });
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
// Интеграция с nextTurn — вызывается из game.js
// ============================================================
async function onTurnEnd() {
  const eventsBox = document.getElementById('events-box');
  const eventsList = document.getElementById('events-list');

  eventsBox.style.display = 'block';
  eventsList.innerHTML = '<div class="ev-loading">⏳ ИИ симулирует мир...</div>';

  const events = await generateEvents();
  eventsList.innerHTML = events.map(e =>
    `<div class="ev-item">📰 ${e}</div>`
  ).join('');

  // Сбрасываем действия после хода
  playerActions = [];
  renderActionsList();
  document.getElementById('actions-panel').style.display = 'none';
}
