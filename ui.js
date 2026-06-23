// ============================================================
// UI.JS — панели, советник-чат, дипломатия
// ============================================================

let panelOpen = true;

function togglePanel() {
  panelOpen = !panelOpen;
  const p = document.getElementById('left-panel'); 
  const t = document.getElementById('toggle-btn');
  const m = document.getElementById('map-wrap');
  if (panelOpen) { p.classList.remove('hidden'); t.style.left='290px'; t.textContent='◀'; m.style.left='290px'; }
  else { p.classList.add('hidden'); t.style.left='0'; t.textContent='▶'; m.style.left='0'; }
}

function toggle(id) {
  const el = document.getElementById(id);
  const btn = el.previousElementSibling;
  el.classList.toggle('open');
  btn.textContent = (el.classList.contains('open') ? '▼ ' : '▶ ') + btn.textContent.slice(2);
}

function togglePop(show, hide) {
  document.getElementById(hide).style.display = 'none';
  document.getElementById('actions-panel').style.display = 'none';
  const s = document.getElementById(show);
  s.style.display = s.style.display === 'block' ? 'none' : 'block';
}

function showNotif(msg) {
  const e = document.createElement('div');
  e.className = 'notif'; e.textContent = msg;
  document.body.appendChild(e);
  setTimeout(() => e.remove(), 3300);
}

// ============================================================
// СОВЕТНИК — чат
// ============================================================
async function sendAdvisorMessage() {
  const input = document.getElementById('adv-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';

  appendAdvisorMsg('player', msg);
  appendAdvisorMsg('advisor', '⏳ Советник думает...');

  const response = await askAdvisor(msg);

  // Убираем "думает..." и добавляем ответ
  const msgs = document.querySelectorAll('.adv-msg');
  msgs[msgs.length - 1].remove();
  appendAdvisorMsg('advisor', response);
}

function appendAdvisorMsg(role, text) {
  const box = document.getElementById('adv-messages');
  const div = document.createElement('div');
  div.className = 'adv-msg ' + role;
  div.textContent = role === 'player' ? '👤 ' + text : '🎭 ' + text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function advisorKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAdvisorMessage(); }
}

// ============================================================
// ДИПЛОМАТИЯ — выбор страны и чат
// ============================================================
const availableCountries = ['Испания', 'Великобритания', 'Россия', 'Австрия', 'Пруссия'];
let selectedCountry = null;

function openDiploPanel() {
  document.getElementById('diplo-pop').style.display = 'block';
  document.getElementById('adv-pop').style.display = 'none';
  document.getElementById('actions-panel').style.display = 'none';
  renderCountryList();
}

function renderCountryList() {
  if (selectedCountry) return;
  const list = document.getElementById('diplo-countries');
  list.innerHTML = availableCountries.map(c =>
    `<button class="country-btn" onclick="selectCountry('${c}')">${c}</button>`
  ).join('');
  document.getElementById('diplo-chat').style.display = 'none';
  list.style.display = 'block';
}

function selectCountry(name) {
  selectedCountry = name;
  document.getElementById('diplo-countries').style.display = 'none';
  document.getElementById('diplo-chat').style.display = 'block';
  document.getElementById('diplo-target').textContent = name;
  document.getElementById('diplo-messages').innerHTML = '';
}

function backToCountries() {
  selectedCountry = null;
  renderCountryList();
}

async function sendDiploMessage() {
  const input = document.getElementById('diplo-input');
  const msg = input.value.trim();
  if (!msg || !selectedCountry) return;
  input.value = '';

  appendDiploMsg('france', msg);
  appendDiploMsg('ai', '⏳ Ожидаем ответа...');

  const response = await sendDiplomacy(selectedCountry, msg);

  const msgs = document.querySelectorAll('.diplo-msg');
  msgs[msgs.length - 1].remove();
  appendDiploMsg('ai', response);
}

function appendDiploMsg(role, text) {
  const box = document.getElementById('diplo-messages');
  const div = document.createElement('div');
  div.className = 'diplo-msg ' + role;
  div.textContent = role === 'france' ? '🇫🇷 ' + text : '🌍 ' + text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function diploKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDiploMessage(); }
}

function sendMsg() {
  const t = document.getElementById('diplo-txt');
  if (t && t.value.trim()) {
    showNotif('📜 Послание отправлено');
    t.value = '';
  }
}

