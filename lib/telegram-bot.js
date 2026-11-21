'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  getTelegramBotToken,
  getTelegramBotUsername,
  getTelegramWebhookSecret,
  parseTelegramLinkToken,
  telegramApi,
  sendTelegramMessage,
  requestPublicOrigin,
  ensureTelegramWebhook
} = require('./telegram-auth');
const { applyTelegramLink, findProfileByTelegramId } = require('./telegram-link');
const { publicProfile, isPremiumActive, authEmailFromUsername } = require('./auth-utils');
const { adminClient, anonClient } = require('./supabase');
const { isBillingReady, getPlan, createYooPayment, listPublicPlans } = require('./billing');

function botChannelUrl() {
  return String(
    process.env.MRF_TELEGRAM_CHANNEL_URL
    || process.env.TELEGRAM_CHANNEL_URL
    || 'https://t.me/cinusVkvadrate'
  ).trim();
}

function botSupportUrl() {
  return String(
    process.env.MRF_TELEGRAM_SUPPORT_URL
    || process.env.TELEGRAM_SUPPORT_URL
    || 'https://t.me/NerdIdk'
  ).trim();
}

function botMenuPhotoUrl(origin) {
  const fromEnv = String(
    process.env.MRF_TELEGRAM_MENU_PHOTO_URL
    || process.env.TELEGRAM_MENU_PHOTO_URL
    || ''
  ).trim();
  if (fromEnv) return fromEnv;
  const base = String(
    origin
    || process.env.MRF_PUBLIC_ORIGIN
    || 'https://mrf-murex.vercel.app'
  ).replace(/\/$/, '');
  return `${base}/img/tg-menu.png`;
}

function readMenuPhotoBuffer() {
  const candidates = [
    path.join(__dirname, 'assets', 'tg-menu.png'),
    path.join(__dirname, '..', 'public', 'img', 'tg-menu.png')
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p);
    } catch (_) {}
  }
  return null;
}

/** Upload photo as multipart — URL sendPhoto often fails on Vercel hosts. */
async function sendMenuPhoto(chatId, caption, reply_markup, origin) {
  const token = getTelegramBotToken();
  if (!token) throw new Error('Telegram не настроен');

  let buf = readMenuPhotoBuffer();
  if (!buf) {
    const url = botMenuPhotoUrl(origin);
    const imgRes = await fetch(url);
    if (!imgRes.ok) throw new Error(`photo fetch ${imgRes.status}`);
    buf = Buffer.from(await imgRes.arrayBuffer());
  }

  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('caption', String(caption || '').slice(0, 1024));
  form.append('reply_markup', JSON.stringify(reply_markup || {}));
  form.append('photo', new Blob([buf], { type: 'image/png' }), 'tg-menu.png');

  const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: 'POST',
    body: form
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) {
    const err = new Error(json.description || 'sendPhoto failed');
    err.statusCode = 502;
    throw err;
  }
  return json.result;
}

function botSticker(kind) {
  const map = {
    welcome: process.env.MRF_TELEGRAM_STICKER_WELCOME || '',
    ok: process.env.MRF_TELEGRAM_STICKER_OK || '',
    fail: process.env.MRF_TELEGRAM_STICKER_FAIL || '',
    pay: process.env.MRF_TELEGRAM_STICKER_PAY || ''
  };
  return String(map[kind] || '').trim();
}

function tmaUrl(origin) {
  const base = String(origin || process.env.MRF_PUBLIC_ORIGIN || '').replace(/\/$/, '');
  if (!base) return '';
  return `${base}/tma.html`;
}

function formatRuDate(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '—';
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(new Date(t));
  } catch (_) {
    return new Date(t).toISOString().slice(0, 10);
  }
}

function daysLeft(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - Date.now()) / (24 * 60 * 60 * 1000));
}

function statusText(profileRow) {
  const p = publicProfile(profileRow);
  const nick = p?.username || 'аккаунт';
  if (!isPremiumActive(profileRow)) {
    return [
      `✦ MRF · ${nick}`,
      '',
      'Подписка: Free',
      'Premium закрыт — оформи, чтобы слушать без ограничений.'
    ].join('\n');
  }
  const end = p.premiumEndsAt ? formatRuDate(p.premiumEndsAt) : 'без срока';
  const left = p.premiumEndsAt ? daysLeft(p.premiumEndsAt) : null;
  const leftLine = left == null
    ? ''
    : left <= 0
      ? 'Срок истёк сегодня'
      : `Осталось: ${left} дн.`;
  return [
    `✦ MRF Premium · ${nick}`,
    '',
    'Статус: активен',
    `До: ${end}`,
    leftLine
  ].filter(Boolean).join('\n');
}

function mainKeyboard(origin) {
  const app = tmaUrl(origin);
  const rows = [
    [
      { text: '⭐ Статус', callback_data: 'mrf:status' },
      { text: '💎 Оформить', callback_data: 'mrf:pay' }
    ],
    [
      { text: '📅 Срок', callback_data: 'mrf:term' },
      { text: 'ℹ️ Помощь', callback_data: 'mrf:help' }
    ],
    [{ text: '📣 Канал', url: botChannelUrl() }]
  ];
  if (app) {
    rows.splice(2, 0, [{ text: '🎵 Открыть MRF', web_app: { url: app } }]);
  } else {
    rows.splice(2, 0, [{ text: '🎵 Открыть сайт', url: String(process.env.MRF_PUBLIC_ORIGIN || 'https://mrf-murex.vercel.app') }]);
  }
  return { inline_keyboard: rows };
}

function payKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '1 месяц · 300 ₽', callback_data: 'mrf:pay:month' },
        { text: '1 год · 2990 ₽', callback_data: 'mrf:pay:year' }
      ],
      [{ text: '« Назад', callback_data: 'mrf:menu' }]
    ]
  };
}

async function sendStickerSafe(chatId, kind) {
  const fileId = botSticker(kind);
  if (!fileId) return null;
  try {
    return await telegramApi('sendSticker', { chat_id: chatId, sticker: fileId });
  } catch (_) {
    return null;
  }
}

async function sendMenu(chatId, profileRow, origin, { editMessageId, editInlineId } = {}) {
  const text = profileRow
    ? `${statusText(profileRow)}\n\nВыбери действие:`
    : [
      '✦ MRF',
      '',
      'Telegram ещё не привязан к аккаунту.',
      'Открой сайт → Профиль → Привязать Telegram.',
      '',
      'После привязки здесь будет статус, оплата и Mini App.'
    ].join('\n');
  const reply_markup = mainKeyboard(origin);

  try {
    await sendMenuPhoto(chatId, text, reply_markup, origin);
    return;
  } catch (_) {
    // fall through to text if upload fails
  }

  await telegramApi('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup,
    disable_web_page_preview: true
  });
}

async function answerCallback(id, text, showAlert) {
  try {
    await telegramApi('answerCallbackQuery', {
      callback_query_id: id,
      text: text ? String(text).slice(0, 180) : undefined,
      show_alert: !!showAlert
    });
  } catch (_) {}
}

async function createBotCheckout(admin, profileRow, planId, origin) {
  if (!isBillingReady()) {
    return { ok: false, error: 'Оплата временно недоступна' };
  }
  const plan = getPlan(planId);
  if (!plan) return { ok: false, error: 'Выбери тариф' };

  const localId = crypto.randomUUID();
  const { error: insErr } = await admin.from('billing_payments').insert({
    id: localId,
    user_id: profileRow.id,
    plan: plan.id,
    amount_rub: plan.amountRub,
    currency: 'RUB',
    status: 'pending',
    yookassa_payment_id: `pending_${localId}`
  });
  if (insErr) return { ok: false, error: insErr.message };

  let yoo;
  try {
    yoo = await createYooPayment({
      amountValue: plan.amountValue,
      description: `MRF Premium — ${plan.title}`,
      returnUrl: `${origin}/tma.html?paid=1&pid=${encodeURIComponent(localId)}`,
      idempotenceKey: localId,
      metadata: {
        mrf_payment_id: localId,
        mrf_user_id: profileRow.id,
        mrf_plan: plan.id,
        mrf_source: 'telegram_bot'
      }
    });
  } catch (e) {
    await admin.from('billing_payments').update({ status: 'canceled' }).eq('id', localId);
    return { ok: false, error: e.message || 'Не удалось создать платёж' };
  }

  await admin
    .from('billing_payments')
    .update({
      yookassa_payment_id: yoo.id,
      status: 'pending',
      raw: yoo
    })
    .eq('id', localId);

  const url = yoo?.confirmation?.confirmation_url;
  if (!url) {
    await admin.from('billing_payments').update({ status: 'canceled' }).eq('id', localId);
    return { ok: false, error: 'Нет ссылки на оплату' };
  }
  return { ok: true, url, plan, localId };
}

/**
 * Notify linked Telegram about payment outcome (one-shot from billing).
 */
async function notifyTelegramPayment(profileRow, status, planId) {
  const chatId = profileRow?.telegram_id;
  if (!chatId) return;
  const plan = getPlan(planId);
  const title = plan?.title || 'Premium';
  if (status === 'succeeded') {
    await sendStickerSafe(chatId, 'ok');
    const text = [
      '✦ Оплата прошла',
      '',
      `Тариф: ${title}`,
      statusText(profileRow)
    ].join('\n');
    await telegramApi('sendMessage', {
      chat_id: chatId,
      text,
      reply_markup: mainKeyboard(process.env.MRF_PUBLIC_ORIGIN || ''),
      disable_web_page_preview: true
    });
    return;
  }
  await sendStickerSafe(chatId, 'fail');
  await sendTelegramMessage(
    chatId,
    status === 'expired'
      ? 'Время на оплату истекло. Открой меню и оформи снова.'
      : 'Оплата не прошла. Можно попробовать ещё раз в меню бота.'
  );
}

async function handleStart(admin, msg, origin) {
  const chatId = msg.chat?.id || msg.from.id;
  const text = String(msg.text || '').trim();
  const startMatch = text.match(/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+(.+))?$/i);
  const payload = startMatch ? String(startMatch[1] || '').trim() : '';

  // Link token from site
  if (payload) {
    const parsed = parseTelegramLinkToken(payload);
    if (parsed) {
      const tg = {
        id: Number(msg.from.id),
        username: msg.from.username
          ? String(msg.from.username).replace(/^@+/, '').slice(0, 64)
          : null,
        firstName: msg.from.first_name ? String(msg.from.first_name).slice(0, 128) : null
      };
      const result = await applyTelegramLink(admin, parsed.userId, tg);
      await sendStickerSafe(chatId, result.ok ? 'ok' : 'fail');
      if (result.ok) {
        await sendTelegramMessage(
          chatId,
          result.trialGranted
            ? 'Готово. Telegram привязан — Premium на 14 дней.'
            : 'Готово. Telegram привязан.'
        );
        const row = await findProfileByTelegramId(admin, tg.id);
        await sendMenu(chatId, row, origin);
      } else {
        await sendTelegramMessage(chatId, result.error || 'Не удалось привязать.');
      }
      return;
    }
  }

  await sendStickerSafe(chatId, 'welcome');
  const row = await findProfileByTelegramId(admin, msg.from.id);
  await sendMenu(chatId, row, origin);
}

async function handleCallback(admin, cq, origin) {
  const data = String(cq.data || '');
  const chatId = cq.message?.chat?.id || cq.from.id;
  const messageId = cq.message?.message_id;
  const row = await findProfileByTelegramId(admin, cq.from.id);

  if (data === 'mrf:menu') {
    await answerCallback(cq.id);
    await sendMenu(chatId, row, origin, { editMessageId: messageId });
    return;
  }

  if (data === 'mrf:status' || data === 'mrf:term') {
    if (!row) {
      await answerCallback(cq.id, 'Сначала привяжи Telegram в профиле MRF', true);
      return;
    }
    await answerCallback(cq.id);
    const extra = data === 'mrf:term' && row.premium_ends_at
      ? `\n\nДата окончания: ${formatRuDate(row.premium_ends_at)}`
      : '';
    await telegramApi('sendMessage', {
      chat_id: chatId,
      text: statusText(row) + extra,
      reply_markup: mainKeyboard(origin),
      disable_web_page_preview: true
    });
    return;
  }

  if (data === 'mrf:help') {
    if (cq.id && cq.id !== '0') await answerCallback(cq.id);
    const plans = listPublicPlans()
      .map((p) => `· ${p.title} — ${p.amountRub} ₽`)
      .join('\n');
    await telegramApi('sendMessage', {
      chat_id: chatId,
      text: [
        '✦ Помощь MRF',
        '',
        'Premium: любой трек, next/prev, shuffle, все акценты.',
        '',
        'Тарифы:',
        plans,
        '',
        `Канал: ${botChannelUrl()}`,
        `Поддержка: ${botSupportUrl()}`,
        '',
        'Привязка: сайт → Профиль → Привязать Telegram.'
      ].join('\n'),
      reply_markup: {
        inline_keyboard: [
          [{ text: '📣 Канал', url: botChannelUrl() }],
          [{ text: '« Меню', callback_data: 'mrf:menu' }]
        ]
      },
      disable_web_page_preview: true
    });
    return;
  }

  if (data === 'mrf:pay') {
    if (!row) {
      await answerCallback(cq.id, 'Сначала привяжи Telegram в профиле MRF', true);
      return;
    }
    await answerCallback(cq.id);
    await sendStickerSafe(chatId, 'pay');
    await telegramApi('sendMessage', {
      chat_id: chatId,
      text: 'Выбери тариф Premium:',
      reply_markup: payKeyboard()
    });
    return;
  }

  const payMatch = data.match(/^mrf:pay:(month|year)$/);
  if (payMatch) {
    if (!row) {
      await answerCallback(cq.id, 'Сначала привяжи Telegram', true);
      return;
    }
    const checkout = await createBotCheckout(admin, row, payMatch[1], origin);
    if (!checkout.ok) {
      await answerCallback(cq.id, checkout.error || 'Ошибка', true);
      return;
    }
    await answerCallback(cq.id, 'Ссылка на оплату');
    await telegramApi('sendMessage', {
      chat_id: chatId,
      text: `Оплата «${checkout.plan.title}» — ${checkout.plan.amountRub} ₽\nПосле оплаты Premium активируется автоматически.`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '💳 Оплатить', url: checkout.url }],
          [{ text: '« Меню', callback_data: 'mrf:menu' }]
        ]
      }
    });
    return;
  }

  await answerCallback(cq.id);
}

/**
 * Verify Telegram Mini App initData (HMAC-SHA256).
 * @returns {{ ok: true, user: object } | { ok: false, error: string }}
 */
function verifyWebAppInitData(initData) {
  const token = getTelegramBotToken();
  if (!token) return { ok: false, error: 'Telegram не настроен' };
  const raw = String(initData || '');
  if (!raw || raw.length > 4096) return { ok: false, error: 'Нет данных Telegram' };

  const params = new URLSearchParams(raw);
  const hash = params.get('hash');
  if (!hash) return { ok: false, error: 'Нет подписи Telegram' };
  params.delete('hash');

  const entries = [];
  for (const [k, v] of params.entries()) entries.push(`${k}=${v}`);
  entries.sort();
  const dataCheckString = entries.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const calc = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (calc !== hash) return { ok: false, error: 'Подпись Telegram не прошла' };

  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Math.abs(Date.now() / 1000 - authDate) > 86400) {
    return { ok: false, error: 'Сессия Telegram устарела' };
  }

  let user = null;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch (_) {
    return { ok: false, error: 'Некорректный пользователь Telegram' };
  }
  if (!user || !user.id) return { ok: false, error: 'Некорректный пользователь Telegram' };
  return { ok: true, user, authDate };
}

/**
 * Create Supabase session for linked Telegram user (TMA auto-login).
 */
async function createSessionForTelegramUser(admin, telegramUser) {
  const row = await findProfileByTelegramId(admin, telegramUser.id);
  if (!row) {
    return { ok: false, status: 404, error: 'Telegram не привязан к аккаунту MRF' };
  }
  const email = authEmailFromUsername(row.username);
  if (!email) return { ok: false, status: 400, error: 'Профиль повреждён' };

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email
  });
  if (linkErr || !linkData) {
    return { ok: false, status: 502, error: linkErr?.message || 'Не удалось войти' };
  }

  const hashed = linkData.properties?.hashed_token
    || linkData.hashed_token
    || null;
  if (!hashed) {
    return { ok: false, status: 502, error: 'Не удалось войти' };
  }

  const anon = anonClient();
  const { data: otpData, error: otpErr } = await anon.auth.verifyOtp({
    type: 'email',
    token_hash: hashed
  });
  if (otpErr || !otpData?.session) {
    return { ok: false, status: 502, error: otpErr?.message || 'Не удалось войти' };
  }

  return {
    ok: true,
    session: otpData.session,
    profile: publicProfile(row),
    user: otpData.user || otpData.session.user
  };
}

/**
 * Daily reminders: 3 days / 1 day / expired.
 */
async function runPremiumReminders(admin) {
  const now = Date.now();
  const in3 = new Date(now + 3 * 86400000).toISOString();
  const in1 = new Date(now + 1 * 86400000).toISOString();
  const dayAgo = new Date(now - 86400000).toISOString();

  const { data: rows } = await admin
    .from('profiles')
    .select('*')
    .not('telegram_id', 'is', null)
    .not('premium_ends_at', 'is', null)
    .gte('premium_ends_at', dayAgo)
    .lte('premium_ends_at', in3)
    .limit(200);

  let sent = 0;
  for (const row of rows || []) {
    const end = Date.parse(row.premium_ends_at);
    if (!Number.isFinite(end)) continue;
    const left = Math.ceil((end - now) / 86400000);
    let text = null;
    if (left <= 0) {
      text = `✦ Premium закончился ${formatRuDate(row.premium_ends_at)}.\nОформи снова в боте — кнопка «Оформить».`;
    } else if (left === 1) {
      text = `✦ Premium заканчивается завтра (${formatRuDate(row.premium_ends_at)}).`;
    } else if (left === 3) {
      text = `✦ Premium активен ещё 3 дня — до ${formatRuDate(row.premium_ends_at)}.`;
    }
    if (!text) continue;
    try {
      await telegramApi('sendMessage', {
        chat_id: row.telegram_id,
        text,
        reply_markup: {
          inline_keyboard: [
            [{ text: '💎 Продлить', callback_data: 'mrf:pay' }],
            [{ text: '⭐ Статус', callback_data: 'mrf:status' }]
          ]
        }
      });
      sent += 1;
    } catch (_) {}
  }
  return { ok: true, sent };
}

async function handleTelegramUpdate(update, origin) {
  let admin;
  try {
    admin = adminClient();
  } catch (_) {
    return;
  }

  if (update.callback_query) {
    await handleCallback(admin, update.callback_query, origin);
    return;
  }

  const msg = update.message || update.edited_message;
  if (!msg || !msg.from || msg.from.is_bot) return;

  const text = String(msg.text || '').trim();
  if (/^\/start/i.test(text) || /^\/menu/i.test(text) || text === 'Меню') {
    await handleStart(admin, msg, origin);
    return;
  }
  if (/^\/status/i.test(text) || /^\/premium/i.test(text)) {
    const row = await findProfileByTelegramId(admin, msg.from.id);
    if (!row) {
      await sendTelegramMessage(msg.chat.id, 'Сначала привяжи Telegram в профиле MRF.');
      return;
    }
    await telegramApi('sendMessage', {
      chat_id: msg.chat.id,
      text: statusText(row),
      reply_markup: mainKeyboard(origin),
      disable_web_page_preview: true
    });
    return;
  }
  if (/^\/help/i.test(text)) {
    await handleCallback(admin, {
      id: '0',
      data: 'mrf:help',
      from: msg.from,
      message: msg
    }, origin);
    return;
  }

  // Default: open menu
  const row = await findProfileByTelegramId(admin, msg.from.id);
  await sendMenu(msg.chat.id, row, origin);
}

module.exports = {
  handleTelegramUpdate,
  notifyTelegramPayment,
  verifyWebAppInitData,
  createSessionForTelegramUser,
  runPremiumReminders,
  statusText,
  mainKeyboard,
  tmaUrl,
  botChannelUrl,
  ensureTelegramWebhook,
  getTelegramWebhookSecret,
  requestPublicOrigin,
  getTelegramBotUsername
};
