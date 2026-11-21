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

function stripHtmlToPlain(html) {
  return String(html || '')
    .replace(/<tg-emoji[^>]*>/gi, '')
    .replace(/<\/tg-emoji>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

async function sendMenuPhoto(chatId, caption, reply_markup, origin, opts = {}) {
  const token = getTelegramBotToken();
  if (!token) throw new Error('Telegram не настроен');
  const { parseMode = null, entities = null } = opts;

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
  if (parseMode) form.append('parse_mode', parseMode);
  if (entities && entities.length) {
    form.append('caption_entities', JSON.stringify(entities));
  }
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

/**
 * Premium custom emoji ids — MUST stay strings (19-digit ids > Number.MAX_SAFE_INTEGER).
 * Any pack works if bot owner has Telegram Premium (Bot API rule).
 */
function botEmojiId(kind) {
  const headphones = '6019606216798378032';
  const map = {
    mark: process.env.MRF_TELEGRAM_EMOJI_MARK || headphones,
    premium: process.env.MRF_TELEGRAM_EMOJI_PREMIUM || headphones,
    ok: process.env.MRF_TELEGRAM_EMOJI_OK || headphones,
    warn: process.env.MRF_TELEGRAM_EMOJI_WARN || headphones,
    pay: process.env.MRF_TELEGRAM_EMOJI_PAY || headphones,
    help: process.env.MRF_TELEGRAM_EMOJI_HELP || headphones
  };
  return String(map[kind] || '').trim();
}

/**
 * Build text + custom_emoji entities (no parse_mode).
 * parts: string | { kind, fallback }  — fallback MUST be a real emoji (UTF-16 length).
 */
function buildRich(parts) {
  let text = '';
  const entities = [];
  for (const part of parts) {
    if (part == null) continue;
    if (typeof part === 'string') {
      text += part;
      continue;
    }
    const fb = String(part.fallback || '🎧');
    const id = botEmojiId(part.kind);
    if (!id) {
      text += fb;
      continue;
    }
    const offset = text.length; // JS length = UTF-16 code units
    text += fb;
    entities.push({
      type: 'custom_emoji',
      offset,
      length: fb.length,
      custom_emoji_id: String(id)
    });
  }
  return { text, entities };
}

async function sendBotRich(chatId, rich, reply_markup) {
  const payload = {
    chat_id: chatId,
    text: String(rich.text || '').slice(0, 3500),
    reply_markup,
    disable_web_page_preview: true
  };
  if (rich.entities && rich.entities.length) {
    payload.entities = rich.entities;
  }
  try {
    return await telegramApi('sendMessage', payload);
  } catch (_) {
    // Fallback without custom emoji entities
    return telegramApi('sendMessage', {
      chat_id: chatId,
      text: payload.text,
      reply_markup,
      disable_web_page_preview: true
    });
  }
}

/** @deprecated use sendBotRich — kept for call sites that still pass plain/HTML strings */
async function sendBotHtml(chatId, htmlOrText, reply_markup) {
  const plain = stripHtmlToPlain(htmlOrText);
  return sendBotRich(chatId, { text: plain, entities: [] }, reply_markup);
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

function statusRich(profileRow) {
  const p = publicProfile(profileRow);
  const nick = p?.username || 'аккаунт';
  if (!isPremiumActive(profileRow)) {
    return buildRich([
      { kind: 'mark', fallback: '🎧' },
      ` MRF · ${nick}\n\nПодписка: Free\n`,
      { kind: 'premium', fallback: '💎' },
      ' Premium закрыт — оформи, чтобы слушать без ограничений.'
    ]);
  }
  const end = p.premiumEndsAt ? formatRuDate(p.premiumEndsAt) : 'без срока';
  const left = p.premiumEndsAt ? daysLeft(p.premiumEndsAt) : null;
  const leftLine = left == null
    ? ''
    : left <= 0
      ? '\nСрок истёк сегодня'
      : `\nОсталось: ${left} дн.`;
  return buildRich([
    { kind: 'premium', fallback: '🎧' },
    ` MRF Premium · ${nick}\n\n`,
    { kind: 'ok', fallback: '✅' },
    ` Статус: активен\nДо: ${end}${leftLine}`
  ]);
}

function statusText(profileRow) {
  return statusRich(profileRow).text;
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

async function sendMenu(chatId, profileRow, origin) {
  const menuRich = profileRow
    ? (() => {
      const base = statusRich(profileRow);
      return { text: `${base.text}\n\nВыбери действие:`, entities: base.entities };
    })()
    : buildRich([
      { kind: 'mark', fallback: '🎧' },
      ' MRF\n\nTelegram ещё не привязан к аккаунту.\nОткрой сайт → Профиль → Привязать Telegram.\n\nПосле привязки здесь будет статус, оплата и Mini App.'
    ]);

  const reply_markup = mainKeyboard(origin);

  try {
    await sendMenuPhoto(chatId, menuRich.text, reply_markup, origin, {
      entities: menuRich.entities
    });
    return;
  } catch (_) {}

  try {
    await sendMenuPhoto(chatId, menuRich.text, reply_markup, origin, {});
    return;
  } catch (_) {}

  await sendBotRich(chatId, menuRich, reply_markup);
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
    const base = statusRich(profileRow);
    const head = buildRich([
      { kind: 'ok', fallback: '✅' },
      ` Оплата прошла\n\nТариф: ${title}\n`
    ]);
    await sendBotRich(
      chatId,
      {
        text: head.text + base.text,
        entities: [
          ...head.entities,
          ...base.entities.map((e) => ({ ...e, offset: e.offset + head.text.length }))
        ]
      },
      mainKeyboard(process.env.MRF_PUBLIC_ORIGIN || '')
    );
    return;
  }
  await sendStickerSafe(chatId, 'fail');
  await sendBotRich(
    chatId,
    buildRich([
      { kind: 'warn', fallback: '⚠️' },
      status === 'expired'
        ? ' Время на оплату истекло. Открой меню и оформи снова.'
        : ' Оплата не прошла. Можно попробовать ещё раз в меню бота.'
    ])
  );
}

async function handleStart(admin, msg, origin) {
  const chatId = msg.chat?.id || msg.from.id;
  try {
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
  } catch (_) {
    try {
      await telegramApi('sendMessage', {
        chat_id: chatId,
        text: 'MRF · меню временно недоступно. Нажми /start ещё раз.',
        disable_web_page_preview: true
      });
    } catch (__) {}
  }
}

async function handleCallback(admin, cq, origin) {
  const data = String(cq.data || '');
  const chatId = cq.message?.chat?.id || cq.from.id;
  const row = await findProfileByTelegramId(admin, cq.from.id);

  if (data === 'mrf:menu') {
    await answerCallback(cq.id);
    await sendMenu(chatId, row, origin);
    return;
  }

  if (data === 'mrf:status' || data === 'mrf:term') {
    if (!row) {
      await answerCallback(cq.id, 'Сначала привяжи Telegram в профиле MRF', true);
      return;
    }
    await answerCallback(cq.id);
    const base = statusRich(row);
    const extra = data === 'mrf:term' && row.premium_ends_at
      ? `\n\nДата окончания: ${formatRuDate(row.premium_ends_at)}`
      : '';
    await sendBotRich(
      chatId,
      { text: base.text + extra, entities: base.entities },
      mainKeyboard(origin)
    );
    return;
  }

  if (data === 'mrf:help') {
    if (cq.id && cq.id !== '0') await answerCallback(cq.id);
    const plans = listPublicPlans()
      .map((p) => `· ${p.title} — ${p.amountRub} ₽`)
      .join('\n');
    await sendBotRich(
      chatId,
      buildRich([
        { kind: 'help', fallback: 'ℹ️' },
        ' Помощь MRF\n\n',
        { kind: 'premium', fallback: '💎' },
        ' Premium: любой трек, next/prev, shuffle, все акценты.\n\nТарифы:\n',
        plans,
        `\n\nКанал: ${botChannelUrl()}\nПоддержка: ${botSupportUrl()}\n\nПривязка: сайт → Профиль → Привязать Telegram.`
      ]),
      {
        inline_keyboard: [
          [{ text: '📣 Канал', url: botChannelUrl() }],
          [{ text: '« Меню', callback_data: 'mrf:menu' }]
        ]
      }
    );
    return;
  }

  if (data === 'mrf:pay') {
    if (!row) {
      await answerCallback(cq.id, 'Сначала привяжи Telegram в профиле MRF', true);
      return;
    }
    await answerCallback(cq.id);
    await sendStickerSafe(chatId, 'pay');
    await sendBotRich(
      chatId,
      buildRich([{ kind: 'pay', fallback: '💎' }, ' Выбери тариф Premium:']),
      payKeyboard()
    );
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
    await sendBotRich(
      chatId,
      buildRich([
        { kind: 'pay', fallback: '💳' },
        ` Оплата «${checkout.plan.title}» — ${checkout.plan.amountRub} ₽\nПосле оплаты Premium активируется автоматически.`
      ]),
      {
        inline_keyboard: [
          [{ text: '💳 Оплатить', url: checkout.url }],
          [{ text: '« Меню', callback_data: 'mrf:menu' }]
        ]
      }
    );
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
    let rich = null;
    if (left <= 0) {
      rich = buildRich([
        { kind: 'warn', fallback: '⚠️' },
        ` Premium закончился ${formatRuDate(row.premium_ends_at)}.\nОформи снова в боте — кнопка «Оформить».`
      ]);
    } else if (left === 1) {
      rich = buildRich([
        { kind: 'warn', fallback: '⚠️' },
        ` Premium заканчивается завтра (${formatRuDate(row.premium_ends_at)}).`
      ]);
    } else if (left === 3) {
      rich = buildRich([
        { kind: 'premium', fallback: '🎧' },
        ` Premium активен ещё 3 дня — до ${formatRuDate(row.premium_ends_at)}.`
      ]);
    }
    if (!rich) continue;
    try {
      await sendBotRich(row.telegram_id, rich, {
        inline_keyboard: [
          [{ text: '💎 Продлить', callback_data: 'mrf:pay' }],
          [{ text: '⭐ Статус', callback_data: 'mrf:status' }]
        ]
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
    await sendBotRich(msg.chat.id, statusRich(row), mainKeyboard(origin));
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

  // Capture Premium custom emoji ids (webhook blocks getUpdates)
  const ents = []
    .concat(Array.isArray(msg.entities) ? msg.entities : [])
    .concat(Array.isArray(msg.caption_entities) ? msg.caption_entities : []);
  const emojiIds = [];
  for (const e of ents) {
    if (e && e.type === 'custom_emoji' && e.custom_emoji_id) {
      const id = String(e.custom_emoji_id);
      if (!emojiIds.includes(id)) emojiIds.push(id);
    }
  }
  if (emojiIds.length) {
    await sendTelegramMessage(
      msg.chat.id,
      `custom_emoji_id:\n${emojiIds.map((id) => `• ${id}`).join('\n')}\n\nПришли это в чат с ассистентом.`
    );
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
