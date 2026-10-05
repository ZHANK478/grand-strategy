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
import { cachedImage, resolveImages } from '../_shared/images.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
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
    // Anonymous sessions must use the limited guest route, not account credits.
    if (u.user.is_anonymous) return json({ error: 'guest_required' }, 403);
    const userId = u.user.id;
    const body = await req.json();
    if(body.operation==='resolve_images'){const r=await resolveImages(admin,body.paths);return json(r.data,r.status);}
    const kind = body.kind === 'image' ? 'image' : 'text';

    if (body.operation === 'begin_turn') {
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.request_id||''))return json({error:'bad_payload'},400);
      const r=await admin.rpc('account_begin_turn',{p_user:userId,p_request:body.request_id});
      if(r.error)return json({error:'reserve_failed'},503);
      if(r.data<0)return json({error:'no_turns',turns_balance:0},402);
      return json({turn_id:body.request_id,turns_balance:r.data});
    }
    if(kind==='image') {
      const result=await cachedImage(admin,userId,false,body,orKey);
      return json(result.data,result.status);
    }
    if(typeof body.model!=='string'||!Array.isArray(body.messages)||JSON.stringify(body.messages).length>140000)return json({error:'bad_payload'},400);
    let balance: number | undefined;
    if(body.turn_id) {
      const r=await admin.from('account_turns').select('request_id').eq('user_id',userId).eq('request_id',body.turn_id).maybeSingle();
      if(r.error||!r.data)return json({error:'turn_required'},409);
    } else {
      const cost=Number(body.cost??1);
      if(!Number.isInteger(cost)||cost<0||cost>3)return json({error:'bad_payload'},400);
      if(cost>0) {
        const r=await admin.rpc('spend_turn',{p_user:userId,p_cost:cost});
        if(r.error)return json({error:'spend_failed'},500);
        if(r.data<0)return json({error:'no_turns',turns_balance:0},402);
        balance=r.data;
      }
    }

    // Прокидываем запрос в OpenRouter ТВОИМ ключом
    const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orKey}` },
      body: JSON.stringify({
        model: body.model,
        messages: body.messages,
        ...(body.max_tokens ? { max_tokens: body.max_tokens } : {}),
        ...(kind==='text'&&body.response_format?.type==='json_object'?{response_format:{type:'json_object'}}:{}),
        ...(typeof body.temperature === 'number' ? { temperature: body.temperature } : {}),
        ...(body.modalities ? { modalities: body.modalities } : {}),
        ...(kind==='text'&&body.reasoning_effort==='low'&&/^(openai\/gpt-6-|z-ai\/glm-5\.3$)/.test(body.model)?{reasoning:{effort:'low'}}:{}),
      }),
    });
    const orData = await orRes.json();
    return json(balance === undefined ? orData : { ...orData, turns_balance: balance });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});