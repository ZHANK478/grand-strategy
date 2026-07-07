// ============================================================
// EDGE FUNCTION «ai» — ПРОКСИ К OpenRouter. Шаг 2 монетизации.
// Твой OpenRouter-ключ живёт ТОЛЬКО здесь (секрет OPENROUTER_KEY), в браузер
// не попадает. Функция: проверяет вход игрока → списывает 1 ход (spend_turn)
// → ходит в OpenRouter твоим ключом → возвращает ответ и новый баланс.
// Картинки (портреты) — только для плана premium.
//
// РАЗВЁРТКА без командной строки: Supabase Dashboard → Edge Functions →
// Create a function → имя «ai» → вставить этот код → Deploy. Отключить «Verify JWT»
// (проверку токена делаем сами внутри). Секрет OPENROUTER_KEY — см. docs/PROXY.md.
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  try {
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!token) return json({ error: 'no_auth' }, 401);

    const url = Deno.env.get('SUPABASE_URL')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const orKey = Deno.env.get('OPENROUTER_KEY');
    if (!orKey) return json({ error: 'server_no_key' }, 500);

    // Кто это? Проверяем токен игрока — токен передаём ЯВНО (на сервере сессии нет).
    const admin = createClient(url, service);
    const { data: u, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !u?.user) return json({ error: 'bad_auth' }, 401);
    const userId = u.user.id;
    const body = await req.json();
    const kind = body.kind === 'image' ? 'image' : 'text';

    let balance: number | undefined;
    if (kind === 'image') {
      // Картинки дорогие → только премиум
      const { data: prof } = await admin.from('profiles').select('plan').eq('id', userId).maybeSingle();
      if (!prof || prof.plan !== 'premium') return json({ error: 'premium_required' }, 403);
    } else {
      // Списываем 1 ход атомарно; если не хватило — стоп
      const { data: remaining, error } = await admin.rpc('spend_turn', { p_user: userId, p_cost: 1 });
      if (error) return json({ error: 'spend_failed' }, 500);
      if (remaining === -1 || remaining === null) return json({ error: 'no_turns', turns_balance: 0 }, 402);
      balance = remaining as number;
    }

    // Прокидываем запрос в OpenRouter ТВОИМ ключом
    const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orKey}` },
      body: JSON.stringify({
        model: body.model,
        messages: body.messages,
        ...(body.max_tokens ? { max_tokens: body.max_tokens } : {}),
        ...(typeof body.temperature === 'number' ? { temperature: body.temperature } : {}),
        ...(body.modalities ? { modalities: body.modalities } : {}),
      }),
    });
    const orData = await orRes.json();
    return json(balance === undefined ? orData : { ...orData, turns_balance: balance });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
