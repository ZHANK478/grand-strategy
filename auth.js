// ============================================================
// AUTH.JS — аккаунты, профили, баланс ходов, облачные сейвы (Supabase).
// Шаг 1 монетизации. Работает поверх готовой игры, ничего в ней не ломая:
//  - backend ВЫКЛЮЧЕН (config.js не заполнен) → игра как раньше, без входа;
//  - backend ВКЛЮЧЁН → перед игрой экран входа по email (magic link),
//    профиль с балансом ходов, сейвы уезжают в облако.
// Прокси ключа и оплата подключаются на шаге 2/3 (тут заготовлены крючки).
// ============================================================

let sb = null;                 // supabase client
let gsUser = null;             // текущий пользователь {id, email}
let gsProfile = null;          // {turns_balance, plan, ...}
let gsAccessToken = null;      // кешированный access-token (для прокси; без getSession)

function backendOn() { return !!window.GS_BACKEND_ON; }

// ------------------------------------------------------------
// ИНИЦИАЛИЗАЦИЯ. Вызывается из index.html до старта меню.
// ------------------------------------------------------------
// Видимая диагностика входа (временно). Пишет и в консоль, и в уголок экрана,
// чтобы было видно, где ломается вход. Отключается: localStorage.setItem('gs_nodebug','1').
function authDebug(msg) {
  console.log('[GS-AUTH]', msg);
  if (localStorage.getItem('gs_nodebug') === '1') return;
  try {
    let box = document.getElementById('gs-debug');
    if (!box) {
      box = document.createElement('div');
      box.id = 'gs-debug';
      box.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:99999;max-width:360px;font:11px/1.4 monospace;background:rgba(0,0,0,.82);color:#8f8;padding:6px 8px;border-radius:4px;white-space:pre-wrap;';
      box.onclick = () => box.remove();
      document.body.appendChild(box);
    }
    box.textContent = (box.textContent ? box.textContent + '\n' : 'AUTH (клик — скрыть):\n') + msg;
  } catch (e) {}
}

async function initAuth() {
  // Вход НЕ обязателен: игра всегда стартует сразу. initAuth лишь молча
  // восстанавливает прошлую сессию и показывает кнопку «Войти» в меню.
  if (!backendOn()) { authDebug('backend ВЫКЛ (config.js без ключей)'); return true; }
  if (!window.supabase) { authDebug('Supabase SDK не загрузился'); return true; }
  authDebug('backend ВКЛ, SDK ok');
  authDebug('адрес вернул: ' + (location.search.includes('code=') ? '?code ЕСТЬ ✓' : location.hash.includes('access_token') ? '#token ЕСТЬ ✓' : 'НИ кода, НИ токена ✗'));

  // СТАНДАРТНАЯ заводская настройка Supabase (pkce + detectSessionInUrl):
  // библиотека САМА обменивает ?code=… на сессию при возврате. Никаких ручных
  // обменов и своих ключей хранилища — они и создавали кашу.
  sb = window.supabase.createClient(window.GS_CONFIG.SUPABASE_URL, window.GS_CONFIG.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    }
  });

  sb.auth.onAuthStateChange((ev, session) => {
    gsAccessToken = session ? session.access_token : null;
    authDebug('событие: ' + ev + ' | сессия: ' + (session ? 'ЕСТЬ' : 'нет'));
    if (session && session.user) { gsUser = { id: session.user.id, email: session.user.email }; onSignedIn(session.user); }
    else onSignedOut();
  });

  // Даём библиотеке мгновение обработать ?code=… из адреса, затем читаем сессию.
  await new Promise(r => setTimeout(r, 300));
  const { data, error } = await sb.auth.getSession();
  authDebug('getSession: ' + (data && data.session ? 'ЕСТЬ (' + (data.session.user.email || '') + ')' : 'НЕТ') + (error ? ' | err ' + error.message : ''));
  if (data && data.session) {
    gsAccessToken = data.session.access_token;
    gsUser = { id: data.session.user.id, email: data.session.user.email };
    onSignedIn(data.session.user);
  } else {
    renderMenuAuth();
  }
  return true;
}

async function onSignedIn(user) {
  gsUser = { id: user.id, email: user.email };
  hideLoginOverlay();
  renderAccountBar();
  renderMenuAuth();
  cleanAuthUrl();
  // Профиль читаем ОТДЕЛЬНО от колбэка (через таймаут) — так безопаснее для Supabase
  setTimeout(() => { loadProfile().then(renderAccountBar); }, 0);
}

// Убираем из адресной строки хвост #access_token=... после входа
function cleanAuthUrl() {
  if (location.hash && /access_token|error/.test(location.hash)) {
    history.replaceState(null, '', location.pathname + location.search);
  }
}

function onSignedOut() {
  gsUser = null; gsProfile = null; gsAccessToken = null;
  renderAccountBar();
  renderMenuAuth();
}

// Кнопка «Войти» в главном меню: показываем только когда backend включён
// и игрок ещё не вошёл; после входа его имя видно в плашке аккаунта.
function renderMenuAuth() {
  const btn = document.getElementById('menu-login-btn');
  if (!btn) return;
  btn.style.display = (backendOn() && !gsUser) ? 'block' : 'none';
}

function openLogin() { showLoginOverlay(); }

async function loadProfile() {
  if (!sb || !gsUser) return;
  // Профиль создаётся триггером при регистрации; но подстрахуемся и подождём его
  for (let i = 0; i < 4; i++) {
    const { data } = await sb.from('profiles').select('*').eq('id', gsUser.id).maybeSingle();
    if (data) { gsProfile = data; return; }
    await new Promise(r => setTimeout(r, 400));
  }
}

// ------------------------------------------------------------
// ЭКРАН ВХОДА (magic link по email + опционально Google).
// ------------------------------------------------------------
function showLoginOverlay() {
  if (document.getElementById('gs-login')) { document.getElementById('gs-login').style.display = 'flex'; return; }
  const el = document.createElement('div');
  el.id = 'gs-login';
  el.innerHTML = `
    <div class="gs-login-card">
      <button class="gs-login-close" onclick="closeLogin()" title="Закрыть">✕</button>
      <div class="gs-login-title">GRAND STRATEGY</div>
      <div class="gs-login-sub">Войдите, чтобы сохранять партии в облаке и получать больше ходов</div>
      <input id="gs-login-email" type="email" placeholder="твоя@почта" autocomplete="email">
      <button id="gs-login-btn" onclick="sendMagicLink()">Получить ссылку для входа</button>
      <button id="gs-google-btn" class="gs-google" onclick="signInGoogle()">Войти через Google</button>
      <div id="gs-login-msg" class="gs-login-msg"></div>
    </div>`;
  document.body.appendChild(el);
}
function hideLoginOverlay() { const el = document.getElementById('gs-login'); if (el) el.style.display = 'none'; }
function closeLogin() { hideLoginOverlay(); }

async function sendMagicLink() {
  const email = (document.getElementById('gs-login-email').value || '').trim();
  const msg = document.getElementById('gs-login-msg');
  if (!email) { msg.textContent = 'Введите почту'; return; }
  const btn = document.getElementById('gs-login-btn');
  btn.disabled = true; btn.textContent = 'Отправляем...';
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split('#')[0] } });
  btn.disabled = false; btn.textContent = 'Получить ссылку для входа';
  msg.textContent = error ? ('Ошибка: ' + error.message) : '📧 Проверьте почту — там ссылка для входа.';
}

async function signInGoogle() {
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href.split('#')[0] } });
  if (error) document.getElementById('gs-login-msg').textContent = 'Google-вход не настроен: ' + error.message;
}

async function signOut() { if (sb) await sb.auth.signOut(); }

// ------------------------------------------------------------
// ПЛАШКА АККАУНТА (почта + баланс ходов) в углу меню/игры.
// ------------------------------------------------------------
function renderAccountBar() {
  let bar = document.getElementById('gs-account');
  if (!backendOn() || !gsUser) { if (bar) bar.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'gs-account'; document.body.appendChild(bar); }
  const turns = gsProfile ? gsProfile.turns_balance : '…';
  const plan = gsProfile && gsProfile.plan === 'premium' ? ' ★' : '';
  bar.innerHTML = `<span class="gs-turns" title="Осталось ходов">🎲 ${turns}</span>` +
    `<span class="gs-email">${gsUser.email}${plan}</span>` +
    `<button onclick="signOut()" title="Выйти">⎋</button>`;
}

function turnsLeft() { return gsProfile ? gsProfile.turns_balance : Infinity; }

// ------------------------------------------------------------
// ОБЛАЧНЫЕ СЕЙВЫ. game.js вызывает эти функции, когда backend включён
// (иначе — старый localStorage). Формат state — тот же объект, что и раньше.
// ------------------------------------------------------------
async function cloudSave(id, meta, state) {
  if (!sb || !gsUser) return false;
  const row = { id, user_id: gsUser.id, state, updated_at: new Date().toISOString(),
    scenario_ref: meta.scenarioRef, scenario_name: meta.scenarioName, country: meta.country,
    ruler: meta.ruler, turn: meta.turn, year: meta.year, month: meta.month, treasury: meta.treasury };
  const { error } = await sb.from('saves').upsert(row);
  if (error) console.warn('cloudSave:', error.message);
  return !error;
}

async function cloudListSaves() {
  if (!sb || !gsUser) return [];
  const { data, error } = await sb.from('saves').select('id,scenario_name,country,ruler,turn,year,month,treasury,updated_at')
    .eq('user_id', gsUser.id).order('updated_at', { ascending: false });
  if (error) { console.warn('cloudListSaves:', error.message); return []; }
  return (data || []).map(s => ({
    id: s.id, country: s.country, ruler: s.ruler, scenarioName: s.scenario_name,
    turn: s.turn, year: s.year, month: s.month, treasury: s.treasury,
    savedAt: s.updated_at ? new Date(s.updated_at).getTime() : 0
  }));
}

async function cloudLoad(id) {
  if (!sb || !gsUser) return null;
  const { data, error } = await sb.from('saves').select('state').eq('user_id', gsUser.id).eq('id', id).maybeSingle();
  if (error || !data) return null;
  return data.state;
}

async function cloudDelete(id) {
  if (!sb || !gsUser) return;
  await sb.from('saves').delete().eq('user_id', gsUser.id).eq('id', id);
}

// ------------------------------------------------------------
// КРЮЧОК ДЛЯ ШАГА 2 (прокси): access-token текущей сессии, которым
// браузер авторизуется на сервере-прокси. Прокси проверит его и спишет ход.
// ------------------------------------------------------------
async function authToken() {
  if (gsAccessToken) return gsAccessToken;      // быстрый путь — кешированный токен
  if (!sb) return null;
  const { data } = await sb.auth.getSession();  // резерв: вдруг колбэк ещё не отработал
  if (data && data.session) { gsAccessToken = data.session.access_token; return gsAccessToken; }
  return null;
}
