// ============================================================
// КОНФИГ БЭКЕНДА. Заполни двумя значениями из Supabase:
//   Dashboard → Project Settings → API → Project URL и anon public key.
//
// Пока значения — плейсхолдеры (__...__), игра работает КАК РАНЬШЕ (локальный
// режим без входа и облака). Как только впишешь реальные — включается вход
// по email, профили и облачные сейвы. anon-ключ ПУБЛИЧНЫЙ и безопасен в браузере:
// доступ к данным ограничивают политики RLS в supabase/schema.sql.
// ============================================================
window.GS_CONFIG = {
  SUPABASE_URL: '__SUPABASE_URL__',       // напр. https://abcdxyz.supabase.co
  SUPABASE_ANON_KEY: '__SUPABASE_ANON_KEY__',

  // Сервер-прокси (шаг 2): сюда пойдут вызовы ИИ вместо прямого OpenRouter.
  // Оставь пустым, пока прокси не готов — тогда ИИ работает по старому пути.
  API_BASE: ''
};

// Backend считается настроенным, только если оба значения заменены на реальные.
window.GS_BACKEND_ON = !/^__/.test(window.GS_CONFIG.SUPABASE_URL) &&
                       !/^__/.test(window.GS_CONFIG.SUPABASE_ANON_KEY);

// Адрес серверной функции-прокси выводится автоматически из URL проекта.
// Пусто до тех пор, пока backend не настроен → тогда ИИ работает по старому пути.
if (window.GS_BACKEND_ON && !window.GS_CONFIG.API_BASE) {
  window.GS_CONFIG.API_BASE = window.GS_CONFIG.SUPABASE_URL.replace(/\/+$/, '') + '/functions/v1';
}
