// ============================================================
// SHOP.JS — настройки магазина (Lemon Squeezy). Заполняется ОДИН раз.
// Отдельный файл, чтобы не трогать config.js с ключами входа.
//
// Как получить значения — см. docs/PAYMENT.md:
//  STORE   — поддомен магазина: если магазин на grandstrategy.lemonsqueezy.com,
//            то STORE = 'grandstrategy'.
//  variant — ID варианта товара (Lemon Squeezy → Products → товар → Variants → ID).
// Пока STORE пустой — кнопки покупки просто не показываются, игра работает как есть.
// ============================================================
window.GS_SHOP = {
  STORE: 'narrevshistory',

  // Пакеты ходов. turns — сколько ходов начислить (это же число впиши в вебхук!).
  // variant — UUID из ссылки Share (для checkout). turns — сколько начислить.
  PACKS: [
    { variant: 'f90679e5-1258-4d54-ae1f-8314276a314d', turns: 500,  label: '500 ходов',  price: '$9.99'  },
    { variant: '5dd135df-23dc-4649-8fe2-54cfe04e56d6', turns: 1500, label: '1500 ходов', price: '$24.99' }
  ],

  // Подписка Premium (портреты правителей, иллюстрации, безлимит текста). Необязательно.
  PREMIUM: { variant: '', label: 'Premium / мес', price: '$7.99' }
};

window.GS_SHOP_ON = !!window.GS_SHOP.STORE;
