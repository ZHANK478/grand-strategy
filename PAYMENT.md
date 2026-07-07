# Шаг 3 — оплата через Lemon Squeezy (глобальный рынок)

Lemon Squeezy сам принимает карты всего мира, платит налоги (Merchant of Record)
и переводит тебе выручку на Wise/Payoneer/банк. Для ИП из Казахстана — подходит.

## Часть 1. Магазин и товары

1. Регистрация: https://lemonsqueezy.com → создай аккаунт и **Store** (магазин).
2. Заполни выплаты: Settings → Payout (Wise/Payoneer/банк) — можно позже, до первых продаж.
3. Создай товары (Products → New Product), тип **Single payment**:
   - «500 ходов» — цена $9.99
   - «1500 ходов» — цена $24.99
   - (необязательно) «Premium» — тип **Subscription**, $7.99/мес
4. У каждого товара открой **Variants** и запиши **Variant ID** (число).
5. Узнай **поддомен магазина**: если ссылка вида `https://grandstrategy.lemonsqueezy.com`,
   то твой STORE = `grandstrategy`.

## Часть 2. Заполнить shop.js

Открой `shop.js`, впиши STORE и variant-ы:
```js
STORE: 'grandstrategy',
PACKS: [
  { variant: '111111', turns: 500,  label: '500 ходов',  price: '$9.99'  },
  { variant: '222222', turns: 1500, label: '1500 ходов', price: '$24.99' }
],
PREMIUM: { variant: '333333', label: 'Premium / мес', price: '$7.99' }
```
Залей `shop.js` в GitHub.

## Часть 3. Вебхук (начисление ходов после оплаты)

1. Supabase → Edge Functions → **Create function** → имя **`lemon-webhook`** →
   вставь код из `supabase/functions/lemon-webhook/index.ts` → **Verify JWT = OFF** → Deploy.
2. Впиши те же variant-ы в код функции (таблица `TURNS_BY_VARIANT` и `PREMIUM_VARIANTS`),
   числа ходов — как в shop.js. Deploy ещё раз.
3. Адрес функции: `https://pebnjhbofduhzkduaaxt.supabase.co/functions/v1/lemon-webhook`.
4. Lemon Squeezy → Settings → **Webhooks → Add webhook**:
   - URL — адрес из п.3.
   - Events — отметь **order_created** (и **subscription_created**, если есть Premium).
   - Придумай **Signing secret** (любая длинная строка) и сохрани его.
5. Supabase → Edge Functions → **Secrets** → добавь `LEMON_WEBHOOK_SECRET` = тот самый
   Signing secret из п.4.

## Часть 4. Проверка

1. Обнови игру. В углу у баланса появится зелёная кнопка **＋**, а когда ходы кончатся —
   магазин откроется сам.
2. Купи самый дешёвый пакет в **тестовом режиме** Lemon Squeezy (Test mode) картой-тестом.
3. Через ~минуту баланс 🎲 должен вырасти. Если нет — Supabase → Edge Functions →
   lemon-webhook → **Logs**: там видно, дошло ли событие и почему не начислилось
   (`no mapping` — не совпал variant; `bad signature` — не тот секрет).

## Про цены и себестоимость (важно)

Один ход стоит тебе ~**$0.02–0.03** (движок делает ~7 запросов к ИИ за ход:
события мира + профили стран). Поэтому:
- пакет 500 ходов ≈ $10–15 твоих затрат → цена $9.99 почти без маржи;
- **сначала стоит удешевить токены** (урезать промпты — отдельный шаг), тогда ход
  будет стоить ~$0.008 и маржа станет здоровой.

Рекомендация: подключи оплату в **тестовом режиме**, а перед реальным запуском сделаем
оптимизацию токенов — иначе продажи будут почти без прибыли.
