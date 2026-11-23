/**
 * Cloudflare Worker — Telegram-бот обратной связи для игры «КРИЛЛИОН».
 *
 * Принимает POST /feedback с сайта https://krillion-ru.online
 * и пересылает жалобы/предложения в личные сообщения админу (ADMIN_CHAT_ID).
 *
 * Секреты (задаются в Cloudflare Dashboard -> Settings -> Variables and Secrets,
 * либо через `wrangler secret put`):
 *   - BOT_TOKEN     : токен бота от @BotFather
 *   - ADMIN_CHAT_ID : ваш Telegram Chat ID (число)
 */

const ALLOWED_ORIGINS = new Set([
  'https://krillion-ru.online',
  'https://www.krillion-ru.online',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:8080',
]);

// Простой in-memory rate-limit на инстанс воркера: не чаще 1 сообщения раз в 20 сек с одного IP
const RATE_LIMIT_MS = 20_000;
const recentByIp = new Map();

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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function checkRateLimit(ip) {
  if (!ip) return true;
  const now = Date.now();
  const prev = recentByIp.get(ip) || 0;
  if (now - prev < RATE_LIMIT_MS) {
    return false;
  }
  recentByIp.set(ip, now);
  // Периодическая очистка, чтобы Map не рос бесконечно
  if (recentByIp.size > 500) {
    for (const [k, ts] of recentByIp) {
      if (now - ts > RATE_LIMIT_MS * 3) recentByIp.delete(k);
    }
  }
  return true;
}

async function sendTelegramMessage(env, chatId, htmlText) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: htmlText,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
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

  const tgResult = await sendTelegramMessage(env, env.ADMIN_CHAT_ID, lines.join('\n'));
  if (!tgResult || !tgResult.ok) {
    return jsonResponse(
      { ok: false, error: 'Не удалось доставить сообщение в Telegram. Попробуйте позже.' },
      502,
      origin
    );
  }

  return jsonResponse({ ok: true }, 200, origin);
}

/**
 * Заготовка под будущий Telegram Webhook (POST /webhook),
 * когда вы захотите добавить команды боту (/start, /stats и т.д.).
 */
async function handleTelegramWebhook(request, env) {
  let update;
  try {
    update = await request.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const message = update?.message;
  if (message?.chat?.id && message?.text === '/start') {
    await sendTelegramMessage(
      env,
      message.chat.id,
      `Привет! Я бот игры <b>КРИЛЛИОН</b>.\nВаш Chat ID: <code>${message.chat.id}</code>`
    );
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

    if (request.method === 'POST' && url.pathname === '/webhook') {
      return handleTelegramWebhook(request, env);
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return jsonResponse({ ok: true, service: 'krillion-feedback-bot' }, 200, origin);
    }

    return jsonResponse({ ok: false, error: 'Not Found' }, 404, origin);
  },
};
