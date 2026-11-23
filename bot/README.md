# Telegram-бот обратной связи для «КРИЛЛИОН»

Этот Cloudflare Worker принимает жалобы и предложения из формы на сайте `https://krillion-ru.online` и пересылает их вам в личные сообщения Telegram. Токен бота хранится в секретах Cloudflare и никогда не попадает в код сайта.

---

## Пошаговый запуск (5 минут, бесплатно)

### Шаг 1. Создайте бота в Telegram
1. Откройте [@BotFather](https://t.me/BotFather) в Telegram и отправьте `/newbot`.
2. Придумайте имя (например, `Криллион Бот`) и username (например, `krillion_ru_bot`).
3. Скопируйте выданный **токен** (вида `123456789:AAH...`).
4. **Важно:** откройте своего нового бота и нажмите **Start** (`/start`), иначе бот не сможет писать вам первым.

### Шаг 2. Узнайте свой Telegram Chat ID
1. Напишите боту [@userinfobot](https://t.me/userinfobot) — он сразу пришлёт ваш числовой `Id` (например, `445629054`).
2. Это и есть ваш `ADMIN_CHAT_ID`.

### Шаг 3. Задеплойте Worker на Cloudflare

**Способ А — через браузер (самый быстрый, без установки CLI):**
1. Зайдите на [dash.cloudflare.com](https://dash.cloudflare.com) (бесплатный аккаунт).
2. В меню слева выберите **Compute (Workers) → Workers & Pages → Create → Create Worker**.
3. Назовите его, например, `krillion-feedback-bot` и нажмите **Deploy**.
4. Нажмите **Edit code**, замените весь код содержимым файла `bot/worker.js` и нажмите **Deploy**.
5. Перейдите в **Settings → Variables and Secrets → Add** и добавьте два секрета (тип **Secret**):
   - `BOT_TOKEN` — ваш токен от `@BotFather`
   - `ADMIN_CHAT_ID` — ваш числовой Chat ID
6. Скопируйте URL вашего воркера (например, `https://krillion-feedback-bot.<ваш-логин>.workers.dev`).

**Способ Б — через консоль (`wrangler`):**
```bash
cd bot
npx wrangler login
npx wrangler secret put BOT_TOKEN
npx wrangler secret put ADMIN_CHAT_ID
npx wrangler deploy
```

### Шаг 4. Подключите URL к сайту
Откройте `app.js` в корне репозитория, найдите константу `FEEDBACK_ENDPOINT` и вставьте туда URL вашего воркера:

```js
const FEEDBACK_ENDPOINT = 'https://krillion-feedback-bot.<ваш-логин>.workers.dev/feedback';
```

Закоммитьте и запушьте изменения в GitHub — после обновления GitHub Pages форма начнёт отправлять сообщения прямо вам в Telegram.

---

## Проверка работы
- Откройте `https://<ваш-воркер>.workers.dev/health` — должно вернуть `{"ok":true,"service":"krillion-feedback-bot"}`.
- На сайте откройте меню → **«Сообщить об ошибке»**, выберите тип, напишите тестовое сообщение и нажмите **«ОТПРАВИТЬ В TELEGRAM ✈»**.
