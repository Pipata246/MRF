'use strict';

const crypto = require('crypto');

const TRIAL_DAYS = 14;
const AUTH_MAX_AGE_SEC = 10 * 60; // Login Widget payload must be fresh
const JWKS_URL = 'https://oauth.telegram.org/.well-known/jwks.json';
const OIDC_ISS = 'https://oauth.telegram.org';

let jwksCache = null;
let jwksFetchedAt = 0;
const JWKS_TTL_MS = 60 * 60 * 1000;

function getTelegramBotToken() {
  return process.env.MRF_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
}

function getTelegramBotUsername() {
  const raw = process.env.MRF_TELEGRAM_BOT_USERNAME || process.env.TELEGRAM_BOT_USERNAME || '';
  return String(raw).trim().replace(/^@+/, '');
}

function getTelegramBotId() {
  const token = getTelegramBotToken();
  const id = String(token.split(':')[0] || '').trim();
  return /^\d+$/.test(id) ? id : '';
}

function b64urlToBuf(s) {
  const str = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str + pad, 'base64');
}

async function getTelegramJwks() {
  const now = Date.now();
  if (jwksCache && now - jwksFetchedAt < JWKS_TTL_MS) return jwksCache;
  const res = await fetch(JWKS_URL, { method: 'GET' });
  if (!res.ok) throw new Error('JWKS unavailable');
  const json = await res.json();
  if (!json || !Array.isArray(json.keys) || !json.keys.length) throw new Error('JWKS empty');
  jwksCache = json;
  jwksFetchedAt = now;
  return jwksCache;
}

/**
 * Verify OIDC id_token from Telegram Login (telegram-login.js).
 * https://core.telegram.org/bots/telegram-login
 */
async function verifyTelegramIdToken(idToken) {
  const botId = getTelegramBotId();
  if (!botId) {
    return { ok: false, error: 'Telegram не настроен на сервере' };
  }
  const raw = String(idToken || '').trim();
  const parts = raw.split('.');
  if (parts.length !== 3) {
    return { ok: false, error: 'Некорректный токен Telegram' };
  }

  let header;
  let payload;
  try {
    header = JSON.parse(b64urlToBuf(parts[0]).toString('utf8'));
    payload = JSON.parse(b64urlToBuf(parts[1]).toString('utf8'));
  } catch (_) {
    return { ok: false, error: 'Некорректный токен Telegram' };
  }

  if (!header || header.alg !== 'RS256') {
    return { ok: false, error: 'Некорректный токен Telegram' };
  }

  let jwks;
  try {
    jwks = await getTelegramJwks();
  } catch (_) {
    return { ok: false, error: 'Не удалось проверить Telegram' };
  }

  const jwk = (header.kid && jwks.keys.find((k) => k.kid === header.kid)) || jwks.keys[0];
  if (!jwk) return { ok: false, error: 'Не удалось проверить Telegram' };

  let keyObject;
  try {
    keyObject = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  } catch (_) {
    return { ok: false, error: 'Не удалось проверить Telegram' };
  }

  const okSig = crypto
    .createVerify('RSA-SHA256')
    .update(parts[0] + '.' + parts[1])
    .verify(keyObject, b64urlToBuf(parts[2]));
  if (!okSig) {
    return { ok: false, error: 'Подпись Telegram не прошла проверку' };
  }

  if (payload.iss !== OIDC_ISS) {
    return { ok: false, error: 'Подпись Telegram не прошла проверку' };
  }

  const aud = Array.isArray(payload.aud) ? payload.aud.map(String) : [String(payload.aud || '')];
  if (!aud.includes(botId)) {
    return { ok: false, error: 'Подпись Telegram не прошла проверку' };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (Number(payload.exp) && nowSec > Number(payload.exp) + 30) {
    return { ok: false, error: 'Сессия Telegram устарела — попробуй ещё раз' };
  }
  if (Number(payload.iat) && nowSec < Number(payload.iat) - 60) {
    return { ok: false, error: 'Сессия Telegram устарела — попробуй ещё раз' };
  }

  const id = Number(payload.id != null ? payload.id : payload.sub);
  if (!Number.isFinite(id) || id <= 0 || !Number.isSafeInteger(id)) {
    return { ok: false, error: 'Некорректный Telegram ID' };
  }

  const username = String(payload.preferred_username || payload.username || '')
    .trim()
    .replace(/^@+/, '')
    .slice(0, 64);

  const firstName = String(payload.given_name || payload.first_name || payload.name || '')
    .trim()
    .slice(0, 128);

  return {
    ok: true,
    telegram: {
      id,
      username: username || null,
      firstName: firstName || null,
      authDate: Number(payload.auth_date || payload.iat) || nowSec
    }
  };
}

/**
 * Verify Telegram Login Widget payload (legacy HMAC).
 * https://core.telegram.org/widgets/login#checking-authorization
 */
function verifyTelegramLogin(payload, botToken) {
  const token = botToken || getTelegramBotToken();
  if (!token) {
    return { ok: false, error: 'Telegram не настроен на сервере' };
  }
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Нет данных Telegram' };
  }

  const hash = String(payload.hash || '');
  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    return { ok: false, error: 'Некорректная подпись Telegram' };
  }

  const id = Number(payload.id);
  if (!Number.isFinite(id) || id <= 0 || !Number.isSafeInteger(id)) {
    return { ok: false, error: 'Некорректный Telegram ID' };
  }

  const authDate = Number(payload.auth_date);
  if (!Number.isFinite(authDate) || authDate <= 0) {
    return { ok: false, error: 'Некорректная дата авторизации' };
  }
  const age = Math.floor(Date.now() / 1000) - authDate;
  if (age < -60 || age > AUTH_MAX_AGE_SEC) {
    return { ok: false, error: 'Сессия Telegram устарела — попробуй ещё раз' };
  }

  const fields = {};
  for (const key of Object.keys(payload)) {
    if (key === 'hash' || key === 'id_token') continue;
    if (payload[key] == null || payload[key] === '') continue;
    fields[key] = String(payload[key]);
  }
  const checkString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');

  const secret = crypto.createHash('sha256').update(token).digest();
  const hmac = crypto.createHmac('sha256', secret).update(checkString).digest('hex');
  try {
    const a = Buffer.from(hmac, 'hex');
    const b = Buffer.from(hash.toLowerCase(), 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, error: 'Подпись Telegram не прошла проверку' };
    }
  } catch (_) {
    return { ok: false, error: 'Подпись Telegram не прошла проверку' };
  }

  const username = String(payload.username || '')
    .trim()
    .replace(/^@+/, '')
    .slice(0, 64);

  return {
    ok: true,
    telegram: {
      id,
      username: username || null,
      firstName: String(payload.first_name || '').trim().slice(0, 128) || null,
      authDate
    }
  };
}

/** Accept either OIDC id_token or legacy Login Widget fields. */
async function verifyTelegramAuth(payload) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Нет данных Telegram' };
  }
  if (payload.id_token) {
    return verifyTelegramIdToken(payload.id_token);
  }
  return verifyTelegramLogin(payload);
}

function trialEndsAt(from = new Date()) {
  return new Date(from.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

/** Stable webhook secret (Bot API secret_token). Override with MRF_TELEGRAM_WEBHOOK_SECRET. */
function getTelegramWebhookSecret() {
  const fromEnv = String(process.env.MRF_TELEGRAM_WEBHOOK_SECRET || '').trim();
  if (/^[A-Za-z0-9_-]{8,256}$/.test(fromEnv)) return fromEnv;
  const token = getTelegramBotToken();
  if (!token) return '';
  return crypto.createHmac('sha256', token).update('mrf-tg-hook-v1').digest('hex').slice(0, 32);
}

/**
 * One-time deep-link token for /start (Telegram allows A-Za-z0-9_- only, ≤64).
 * Format: L{uuid32}{exp36_6}{sig10}
 */
function createTelegramLinkToken(userId) {
  const uid = String(userId || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) {
    return null;
  }
  const exp = Math.floor(Date.now() / 1000) + 15 * 60;
  const id = uid.replace(/-/g, '').toLowerCase();
  const exp36 = exp.toString(36).padStart(6, '0');
  const sig = crypto
    .createHmac('sha256', getTelegramBotToken())
    .update(`mrf_link:${uid.toLowerCase()}:${exp}`)
    .digest('base64url')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 10);
  return `L${id}${exp36}${sig}`;
}

function parseTelegramLinkToken(token) {
  const t = String(token || '').trim();
  if (!/^L[a-f0-9]{32}[a-z0-9]{6}[A-Za-z0-9_-]{10}$/.test(t)) return null;
  const idHex = t.slice(1, 33);
  const exp36 = t.slice(33, 39);
  const sig = t.slice(39);
  const exp = parseInt(exp36, 36);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now() - 30_000) return null;

  const uid = [
    idHex.slice(0, 8),
    idHex.slice(8, 12),
    idHex.slice(12, 16),
    idHex.slice(16, 20),
    idHex.slice(20)
  ].join('-');

  const expect = crypto
    .createHmac('sha256', getTelegramBotToken())
    .update(`mrf_link:${uid}:${exp}`)
    .digest('base64url')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 10);

  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  } catch (_) {
    return null;
  }
  return { userId: uid, exp };
}

function buildTelegramDeepLink(botUsername, startPayload) {
  const user = String(botUsername || '').replace(/^@+/, '');
  const start = String(startPayload || '');
  if (!user || !start) return '';
  return `https://t.me/${user}?start=${encodeURIComponent(start)}`;
}

async function telegramApi(method, body) {
  const token = getTelegramBotToken();
  if (!token) throw new Error('Telegram не настроен');
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) {
    const err = new Error(json.description || `Telegram API ${method} failed`);
    err.statusCode = 502;
    throw err;
  }
  return json.result;
}

async function sendTelegramMessage(chatId, text) {
  return telegramApi('sendMessage', {
    chat_id: chatId,
    text: String(text || '').slice(0, 3500),
    disable_web_page_preview: true
  });
}

/**
 * Point the bot webhook at our /api/me?resource=tg_hook (idempotent).
 * @param {string} publicOrigin e.g. https://mrf-murex.vercel.app
 */
async function ensureTelegramWebhook(publicOrigin) {
  const origin = String(publicOrigin || '').replace(/\/$/, '');
  const secret = getTelegramWebhookSecret();
  if (!origin.startsWith('https://') || !secret) {
    return { ok: false, skipped: true };
  }
  if (/localhost|127\.0\.0\.1/i.test(origin)) {
    return { ok: false, skipped: true };
  }
  const hookUrl = `${origin}/api/me?resource=tg_hook`;
  let info;
  try {
    info = await telegramApi('getWebhookInfo', {});
  } catch (_) {
    info = null;
  }
  if (info && info.url === hookUrl) {
    return { ok: true, url: hookUrl, unchanged: true };
  }
  await telegramApi('setWebhook', {
    url: hookUrl,
    secret_token: secret,
    allowed_updates: ['message'],
    drop_pending_updates: false
  });
  return { ok: true, url: hookUrl, unchanged: false };
}

function requestPublicOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim();
  if (!host) return '';
  return `${proto}://${host}`;
}

module.exports = {
  TRIAL_DAYS,
  AUTH_MAX_AGE_SEC,
  getTelegramBotToken,
  getTelegramBotUsername,
  getTelegramBotId,
  getTelegramWebhookSecret,
  verifyTelegramLogin,
  verifyTelegramIdToken,
  verifyTelegramAuth,
  createTelegramLinkToken,
  parseTelegramLinkToken,
  buildTelegramDeepLink,
  sendTelegramMessage,
  ensureTelegramWebhook,
  requestPublicOrigin,
  telegramApi,
  trialEndsAt
};
