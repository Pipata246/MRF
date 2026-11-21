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

module.exports = {
  TRIAL_DAYS,
  AUTH_MAX_AGE_SEC,
  getTelegramBotToken,
  getTelegramBotUsername,
  getTelegramBotId,
  verifyTelegramLogin,
  verifyTelegramIdToken,
  verifyTelegramAuth,
  trialEndsAt
};
