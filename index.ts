// ============================================================
// EDGE FUNCTION «lemon-webhook» — приём оплат Lemon Squeezy. Шаг 3.
// После успешной оплаты Lemon Squeezy шлёт сюда событие order_created.
// Функция проверяет подпись, определяет пакет по variant_id и начисляет ходы
// через add_turns. Начисление количества — ТОЛЬКО на сервере (по таблице ниже),
// чтобы покупатель не мог подделать сумму.
//
// Развёртка: Supabase → Edge Functions → Create function → имя «lemon-webhook» →
// вставить код → Verify JWT = OFF (Lemon Squeezy не шлёт JWT; проверяем подпись).
// Секрет: LEMON_WEBHOOK_SECRET (Signing secret из настроек вебхука Lemon Squeezy).
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// variant_id → сколько ходов начислить. ВПИШИ свои ID (Lemon Squeezy → Products →
// вариант → его ID). Значения ходов ДОЛЖНЫ совпадать с shop.js.
const TURNS_BY_VARIANT: Record<string, number> = {
  // '111111': 500,
  // '222222': 1500,
};
// variant_id подписки Premium → ставим план 'premium' (и немного ходов в подарок).
const PREMIUM_VARIANTS: string[] = [
  // '333333',
];

async function validSignature(raw: string, signature: string, secret: string): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
  // сравнение без утечки времени
  if (hex.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  try {
    const raw = await req.text();
    const secret = Deno.env.get('LEMON_WEBHOOK_SECRET');
    const signature = req.headers.get('X-Signature') || '';
    if (!secret || !(await validSignature(raw, signature, secret))) {
      return new Response('bad signature', { status: 401 });
    }

    const body = JSON.parse(raw);
    const event = body?.meta?.event_name;
    // Начисляем на успешной оплате заказа
    if (event !== 'order_created') return new Response('ignored', { status: 200 });

    const status = body?.data?.attributes?.status; // 'paid'
    if (status && status !== 'paid') return new Response('not paid', { status: 200 });

    const userId = body?.meta?.custom_data?.user_id;
    const variant = String(body?.data?.attributes?.first_order_item?.variant_id ?? '');
    if (!userId) return new Response('no user', { status: 200 });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    if (PREMIUM_VARIANTS.includes(variant)) {
      await admin.from('profiles').update({ plan: 'premium' }).eq('id', userId);
      await admin.rpc('add_turns', { p_user: userId, p_amount: 1000 }); // ходы в подарок к подписке
      return new Response('premium ok', { status: 200 });
    }

    const turns = TURNS_BY_VARIANT[variant] || 0;
    if (!turns) return new Response('no mapping', { status: 200 });
    await admin.rpc('add_turns', { p_user: userId, p_amount: turns });
    return new Response('ok', { status: 200 });
  } catch (e) {
    return new Response('error: ' + String(e), { status: 500 });
  }
});
