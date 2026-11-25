# Telegram-бот обратной связи для «КРИЛЛИОН»

Этот Cloudflare Worker:
1. Принимает жалобы и предложения из формы на сайте `https://krillion-ru.online` и пересылает их вам в Telegram.
2. Позволяет **ответить игроку прямо в Telegram через Reply («Ответить»)** — ваш ответ сохраняется в Cloudflare KV и автоматически появляется у игрока прямо на сайте при следующем заходе (даже если он не оставлял никаких контактов).

---

## Пошаговый запуск с нуля (5 минут, бесплатно)

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
2. Откройте ваш воркер `krillion-feedback-bot` (или создайте новый в **Compute (Workers) → Workers & Pages → Create**).
3. Нажмите **Edit code**, замените весь код содержимым файла `bot/worker.js` и нажмите **Deploy**.
4. Перейдите в **Settings → Variables and Secrets → Add** и убедитесь, что заданы секреты (тип **Secret**):
   - `BOT_TOKEN` — ваш токен от `@BotFather`
   - `ADMIN_CHAT_ID` — ваш числовой Chat ID
   - `WEBHOOK_SECRET` *(рекомендуется)* — любая случайная строка из букв и цифр (например, `krillion_wh_9f3k2a8x`), чтобы никто посторонний не мог слать запросы на `/webhook`

### Шаг 4. Включите ответы игрокам на сайте (KV + Webhook — 2 минуты)

#### 4.1. Подключите Cloudflare KV (`REPORTS_KV`)
1. В Cloudflare Dashboard слева откройте **Storage & Databases → Workers KV → Create a namespace**.
2. Назовите его, например, `krillion-reports` и нажмите **Add**.
3. Вернитесь в ваш воркер `krillion-feedback-bot` → **Settings → Bindings → Add → KV namespace**:
   - **Variable name:** `REPORTS_KV` *(строго так!)*
   - **KV namespace:** выберите созданный `krillion-reports`
4. Сохраните (**Save / Deploy**).

#### 4.2. Зарегистрируйте Telegram Webhook (одной командой или ссылкой)
Откройте в браузере или выполните в терминале (подставьте свой `BOT_TOKEN`, URL воркера и `WEBHOOK_SECRET`, если задавали его):

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://krillion-feedback-bot.<ваш-логин>.workers.dev/webhook",
    "secret_token": "<WEBHOOK_SECRET>"
  }'
```

*(Если `WEBHOOK_SECRET` не задавали, просто уберите поле `"secret_token"` — можно даже просто открыть в браузере ссылку:
`https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://krillion-feedback-bot.<ваш-логин>.workers.dev/webhook`)*

В ответе должно прийти `{"ok":true,"result":true,"description":"Webhook was set"}`.

**Способ Б — через консоль (`wrangler`):**
```bash
cd bot
npx wrangler login
npx wrangler kv namespace create REPORTS_KV
# вставьте полученный id в bot/wrangler.toml
npx wrangler secret put BOT_TOKEN
npx wrangler secret put ADMIN_CHAT_ID
npx wrangler secret put WEBHOOK_SECRET
npx wrangler deploy
```

---

## Как отвечать игрокам
1. Когда игрок отправляет обращение с сайта, вам в Telegram приходит сообщение с пометкой *«↩ Ответьте (Reply) на это сообщение — игрок увидит ответ прямо на сайте»*.
2. Просто сделайте **Reply («Ответить»)** на это сообщение в Telegram и напишите текст ответа (например: *«Добавили Биру в Криллион! Спасибо за находку!»*).
3. Бот подтвердит: *«✅ Ответ сохранён! Игрок увидит его прямо на сайте при следующем заходе.»*
4. Если вы опечатались и отредактировали свой ответ в Telegram — обновлённый текст автоматически сохранится и на сайте.
5. Обращения и ответы хранятся в KV **90 дней**.

## Проверка работы
- Откройте `https://<ваш-воркер>.workers.dev/health` — должно вернуть `{"ok":true,"service":"krillion-feedback-bot","kv":true}`.
- Напишите боту в Telegram команду `/status` — он подтвердит, что webhook и `REPORTS_KV` работают.
- Отправьте тестовый репорт с сайта, ответьте на него в Telegram через Reply, затем обновите страницу сайта — появится уведомление с вашим ответом.
