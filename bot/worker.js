/**
 * Cloudflare Worker — Telegram-бот обратной связи для игры «КРИЛЛИОН».
 *
 * Возможности:
 *   1. POST /feedback (или /) — принимает обращение с сайта https://krillion-ru.online,
 *      пересылает в Telegram админу (ADMIN_CHAT_ID) и сохраняет связку message_id <-> reportId в REPORTS_KV.
 *   2. POST /webhook — принимает обновления Telegram-бота. Когда админ делает Reply
 *      на сообщение с жалобой/предложением, ответ сохраняется в REPORTS_KV и при следующем
 *      визите показывается игроку прямо на сайте.
 *   3. POST /replies — возвращает игроку ответы разработчика по списку его локальных reportId.
 *   4. GET  /health  — проверка статуса воркера и подключения KV.
 *
 * Секреты (Cloudflare Dashboard -> Settings -> Variables and Secrets, либо `wrangler secret put`):
 *   - BOT_TOKEN      : токен бота от @BotFather
 *   - ADMIN_CHAT_ID  : ваш Telegram Chat ID (число)
 *   - WEBHOOK_SECRET : (необязательно, но рекомендуется) случайная строка для защиты /webhook
 *
 * KV-хранилище (Cloudflare Dashboard -> Settings -> Bindings -> Add -> KV namespace):
 *   - REPORTS_KV     : KV namespace для хранения ответов игрокам (TTL 90 дней)
 */

const ALLOWED_ORIGINS = new Set([
  'https://krillion-ru.online',
  'https://www.krillion-ru.online',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:8080',
]);

// Rate-limit на отправку репортов: не чаще 1 сообщения раз в 20 сек с одного IP
const RATE_LIMIT_MS = 20_000;
const recentByIp = new Map();

// Время хранения обращений и ответов в KV — 90 дней
const REPORT_TTL_SECONDS = 90 * 24 * 60 * 60;
const MAX_REPORT_IDS_PER_QUERY = 20;
const MAX_REPLIES_PER_REPORT = 10;
const REPORT_ID_RE = /^[a-zA-Z0-9_-]{8,48}$/;

const CATEGORY_META = {
  'missing-answer': { emoji: '❓', label: 'Нет ответа в базе' },
  'wrong-tier':     { emoji: '⚖️', label: 'Спорная редкость' },
  'ui-bug':         { emoji: '🐛', label: 'Технический баг' },
  'suggestion':     { emoji: '💡', label: 'Идея / предложение' },
};

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function corsHeaders(origin) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://krillion-ru.online';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(origin),
    },
  });
}

function cleanText(value, maxLen) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function normalizeReportId(rawId) {
  if (typeof rawId === 'string' && REPORT_ID_RE.test(rawId.trim())) {
    return rawId.trim();
  }
  return '';
}

function generateReportId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

function checkRateLimit(ip) {
  if (!ip) return true;
  const now = Date.now();
  const prev = recentByIp.get(ip) || 0;
  if (now - prev < RATE_LIMIT_MS) {
    return false;
  }
  recentByIp.set(ip, now);
  if (recentByIp.size > 500) {
    for (const [k, ts] of recentByIp) {
      if (now - ts > RATE_LIMIT_MS * 3) recentByIp.delete(k);
    }
  }
  return true;
}

async function sendTelegramMessage(env, chatId, htmlText, extra = {}) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: htmlText,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...extra,
    }),
  });
  return resp.json();
}

async function handleFeedback(request, env, origin) {
  if (!env.BOT_TOKEN || !env.ADMIN_CHAT_ID) {
    return jsonResponse(
      { ok: false, error: 'Бот ещё не настроен на сервере (не заданы BOT_TOKEN / ADMIN_CHAT_ID).' },
      500,
      origin
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Некорректный формат запроса.' }, 400, origin);
  }

  // Honeypot: если скрытое поле заполнено — это спам-бот, тихо возвращаем успех
  if (payload && typeof payload.website === 'string' && payload.website.trim().length > 0) {
    return jsonResponse({ ok: true }, 200, origin);
  }

  const clientIp = request.headers.get('CF-Connecting-IP') || '';
  if (!checkRateLimit(clientIp)) {
    return jsonResponse(
      { ok: false, error: 'Слишком частая отправка. Подождите 20 секунд и попробуйте снова.' },
      429,
      origin
    );
  }

  const category = cleanText(payload?.category, 40);
  const meta = CATEGORY_META[category] || { emoji: '📩', label: 'Обратная связь' };

  const promptText = cleanText(payload?.prompt, 200);
  const answerText = cleanText(payload?.answer, 150);
  const descText   = cleanText(payload?.description, 1000);
  const contact    = cleanText(payload?.contact, 120);
  const modeInfo   = cleanText(payload?.modeInfo, 120);
  const pageUrl    = cleanText(payload?.pageUrl, 200);
  const reportId   = normalizeReportId(payload?.reportId) || generateReportId();

  if (!descText && !promptText && !answerText) {
    return jsonResponse(
      { ok: false, error: 'Заполните хотя бы текст сообщения или вопрос.' },
      400,
      origin
    );
  }

  const lines = [
    `${meta.emoji} <b>КРИЛЛИОН — ${escapeHtml(meta.label)}</b>`,
    '',
  ];

  if (promptText) {
    lines.push(`<b>Вопрос / тема:</b> ${escapeHtml(promptText)}`);
  }
  if (answerText) {
    lines.push(`<b>Ответ игрока:</b> <code>${escapeHtml(answerText)}</code>`);
  }
  if (descText) {
    lines.push(`<b>Сообщение:</b>\n${escapeHtml(descText)}`);
  }
  if (contact) {
    lines.push('');
    lines.push(`<b>Контакт для ответа:</b> ${escapeHtml(contact)}`);
  }

  lines.push('');
  const techParts = [];
  if (modeInfo) techParts.push(escapeHtml(modeInfo));
  if (pageUrl) techParts.push(escapeHtml(pageUrl));
  if (techParts.length) {
    lines.push(`<i>Тех. инфо: ${techParts.join(' · ')}</i>`);
  }
  if (env.REPORTS_KV) {
    lines.push('<i>↩ Ответьте (Reply) на это сообщение — игрок увидит ответ прямо на сайте.</i>');
  }

  const tgResult = await sendTelegramMessage(env, env.ADMIN_CHAT_ID, lines.join('\n'));
  if (!tgResult || !tgResult.ok) {
    return jsonResponse(
      { ok: false, error: 'Не удалось доставить сообщение в Telegram. Попробуйте позже.' },
      502,
      origin
    );
  }

  const tgMsgId = tgResult.result?.message_id;
  if (env.REPORTS_KV && tgMsgId) {
    const record = {
      id: reportId,
      createdAt: Date.now(),
      category: category || 'other',
      prompt: promptText,
      answer: answerText,
      description: descText,
      replies: [],
    };
    const kvOpts = { expirationTtl: REPORT_TTL_SECONDS };
    await Promise.all([
      env.REPORTS_KV.put(`rep:${reportId}`, JSON.stringify(record), kvOpts),
      env.REPORTS_KV.put(`msg:${tgMsgId}`, JSON.stringify({ reportId }), kvOpts),
    ]);
  }

  return jsonResponse(
    {
      ok: true,
      reportId,
      repliesEnabled: Boolean(env.REPORTS_KV),
    },
    200,
    origin
  );
}

async function handleRepliesQuery(request, env, origin) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Некорректный формат запроса.' }, 400, origin);
  }

  const rawIds = Array.isArray(payload?.ids) ? payload.ids : [];
  const uniqueIds = [];
  const seen = new Set();
  for (const id of rawIds) {
    const norm = normalizeReportId(id);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      uniqueIds.push(norm);
      if (uniqueIds.length >= MAX_REPORT_IDS_PER_QUERY) break;
    }
  }

  if (!env.REPORTS_KV || uniqueIds.length === 0) {
    return jsonResponse({ ok: true, items: {} }, 200, origin);
  }

  const records = await Promise.all(
    uniqueIds.map((id) => env.REPORTS_KV.get(`rep:${id}`, { type: 'json' }).catch(() => null))
  );

  const items = {};
  uniqueIds.forEach((id, idx) => {
    const rec = records[idx];
    if (rec && Array.isArray(rec.replies) && rec.replies.length > 0) {
      items[id] = {
        replies: rec.replies.map((r) => ({
          id: String(r.id || ''),
          text: String(r.text || ''),
          at: Number(r.at || 0),
        })),
      };
    }
  });

  return jsonResponse({ ok: true, items }, 200, origin);
}

async function handleAdminReply(env, message, isEdited) {
  const replyToId = message?.reply_to_message?.message_id;
  if (!replyToId) return;

  const replyText = cleanText(message.text || message.caption || '', 1000);
  if (!replyText) {
    if (!isEdited) {
      await sendTelegramMessage(
        env,
        message.chat.id,
        '⚠️ Пожалуйста, отправьте текстовый ответ — на сайте отображается только текст.',
        { reply_to_message_id: message.message_id }
      );
    }
    return;
  }

  if (!env.REPORTS_KV) {
    if (!isEdited) {
      await sendTelegramMessage(
        env,
        message.chat.id,
        '⚠️ Хранилище <code>REPORTS_KV</code> ещё не подключено в Cloudflare — ответ не сохранился. См. <code>bot/README.md</code>.',
        { reply_to_message_id: message.message_id }
      );
    }
    return;
  }

  const link = await env.REPORTS_KV.get(`msg:${replyToId}`, { type: 'json' }).catch(() => null);
  if (!link || !link.reportId) {
    if (!isEdited) {
      await sendTelegramMessage(
        env,
        message.chat.id,
        '⚠️ Это обращение не найдено в базе (возможно, отправлено до подключения ответов или старше 90 дней).',
        { reply_to_message_id: message.message_id }
      );
    }
    return;
  }

  const record = await env.REPORTS_KV.get(`rep:${link.reportId}`, { type: 'json' }).catch(() => null);
  if (!record) {
    if (!isEdited) {
      await sendTelegramMessage(
        env,
        message.chat.id,
        '⚠️ Срок хранения этого обращения истёк.',
        { reply_to_message_id: message.message_id }
      );
    }
    return;
  }

  if (!Array.isArray(record.replies)) record.replies = [];
  const replyId = String(message.message_id);
  const existingIdx = record.replies.findIndex((r) => String(r.id) === replyId);

  if (existingIdx !== -1) {
    record.replies[existingIdx].text = replyText;
    record.replies[existingIdx].editedAt = Date.now();
  } else {
    record.replies.push({
      id: replyId,
      text: replyText,
      at: Date.now(),
    });
    if (record.replies.length > MAX_REPLIES_PER_REPORT) {
      record.replies = record.replies.slice(-MAX_REPLIES_PER_REPORT);
    }
  }

  const kvOpts = { expirationTtl: REPORT_TTL_SECONDS };
  await Promise.all([
    env.REPORTS_KV.put(`rep:${link.reportId}`, JSON.stringify(record), kvOpts),
    env.REPORTS_KV.put(`msg:${replyToId}`, JSON.stringify({ reportId: link.reportId }), kvOpts),
  ]);

  const targetHint = record.answer
    ? ` по ответу «${escapeHtml(record.answer)}»`
    : '';
  const confirmText = isEdited
    ? `✏️ Обновлённый ответ${targetHint} сохранён для игрока.`
    : `✅ Ответ${targetHint} сохранён! Игрок увидит его прямо на сайте при следующем заходе.`;

  await sendTelegramMessage(env, message.chat.id, confirmText, {
    reply_to_message_id: message.message_id,
  });
}

async function handleTelegramWebhook(request, env) {
  if (env.WEBHOOK_SECRET) {
    const headerSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
    if (headerSecret !== env.WEBHOOK_SECRET) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const isEdited = Boolean(update?.edited_message && !update?.message);
  const message = update?.message || update?.edited_message;
  if (!message?.chat?.id) {
    return new Response('OK', { status: 200 });
  }

  const chatIdStr = String(message.chat.id);
  const isAdmin = Boolean(env.ADMIN_CHAT_ID) && chatIdStr === String(env.ADMIN_CHAT_ID);
  const text = (message.text || '').trim();

  if (!isEdited && (text === '/start' || text.startsWith('/start '))) {
    const adminHint = isAdmin
      ? `\n\nСтатус KV: ${env.REPORTS_KV ? '✅ подключено' : '⚠️ не подключено'}\nЧтобы ответить игроку на сайте, просто сделайте <b>Reply (Ответить)</b> на сообщение с его обращением.`
      : '';
    await sendTelegramMessage(
      env,
      message.chat.id,
      `Привет! Я бот игры <b>КРИЛЛИОН</b>.\nВаш Chat ID: <code>${message.chat.id}</code>${adminHint}`
    );
    return new Response('OK', { status: 200 });
  }

  if (!isEdited && isAdmin && text === '/status') {
    await sendTelegramMessage(
      env,
      message.chat.id,
      `🤖 <b>КРИЛЛИОН Бот</b>\n• Webhook: ✅ работает\n• Хранилище REPORTS_KV: ${env.REPORTS_KV ? '✅ подключено' : '❌ не подключено'}\n• WEBHOOK_SECRET: ${env.WEBHOOK_SECRET ? '✅ задан' : '⚠️ не задан'}`
    );
    return new Response('OK', { status: 200 });
  }

  if (isAdmin && message.reply_to_message?.message_id) {
    await handleAdminReply(env, message, isEdited);
  }

  return new Response('OK', { status: 200 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method === 'POST' && (url.pathname === '/' || url.pathname === '/feedback')) {
      return handleFeedback(request, env, origin);
    }

    if (request.method === 'POST' && url.pathname === '/replies') {
      return handleRepliesQuery(request, env, origin);
    }

    if (request.method === 'POST' && url.pathname === '/webhook') {
      return handleTelegramWebhook(request, env);
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return jsonResponse(
        {
          ok: true,
          service: 'krillion-feedback-bot',
          kv: Boolean(env.REPORTS_KV),
        },
        200,
        origin
      );
    }

    return jsonResponse({ ok: false, error: 'Not Found' }, 404, origin);
  },
};
