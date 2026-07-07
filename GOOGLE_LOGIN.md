# Вход через Google — настройка (безопасно)

Вход через Google не требует писем на почту: игрок жмёт кнопку прямо в браузере ноутбука
и попадает в игру. Твой сайт при этом не видит и не хранит пароли — всё делает Google + Supabase.
Ниже — по шагам.

## Часть A. Создать OAuth-ключи в Google

1. Открой **https://console.cloud.google.com** (войди своим Google-аккаунтом).
2. Вверху создай новый проект: **Select a project → New Project** → имя `grand-strategy` → **Create**.
3. Слева меню (☰) → **APIs & Services → OAuth consent screen**:
   - **User Type: External** → **Create**.
   - App name: `Grand Strategy`. User support email: своя почта. Developer contact: своя почта.
   - Дальше жми **Save and Continue** до конца (Scopes и Test users можно пропустить).
   - На экране **Publishing status** нажми **Publish app** (иначе входить смогут только «тестовые» аккаунты).
4. Слева → **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - **Application type: Web application**.
   - **Name:** `grand-strategy-web`.
   - **Authorized redirect URIs → Add URI** — сюда вставь адрес из Supabase (см. Часть B, п.1):
     он выглядит как `https://ТВОЙ-ПРОЕКТ.supabase.co/auth/v1/callback`.
   - **Create**.
5. Google покажет **Client ID** и **Client Secret** — скопируй оба в блокнот.

## Часть B. Включить Google в Supabase

1. В Supabase: **Authentication → Providers → Google**.
   - Вверху этого экрана Supabase показывает **Callback URL** (`https://...supabase.co/auth/v1/callback`) —
     именно его нужно было вставить в Google в п.4 выше. Если не вставил — вернись и добавь.
2. Включи тумблер **Enable**.
3. Вставь **Client ID** и **Client Secret** из Части A → **Save**.

## Часть C. Проверить

1. Открой игру → **Войти** → кнопка **«Войти через Google»**.
2. Выбираешь свой Google-аккаунт → соглашаешься → возвращаешься в игру уже залогиненным.

Готово. Теперь есть два способа входа: письмо на почту **или** Google в один клик.

## Про безопасность (коротко)

- Пароли Google живут только у Google. Твоя игра и Supabase их не видят.
- **Client Secret** ты вставляешь в Supabase (на сервере), а НЕ в `config.js` браузера — это правильно.
- `config.js` в браузере держит только публичные значения (URL проекта и anon-ключ) — их видеть посторонним не опасно, доступ к данным ограничивают политики RLS.
