'use strict';

const crypto = require('crypto');

const TRIAL_DAYS = 14;
const AUTH_MAX_AGE_SEC = 10 * 60; // Login Widget payload must be fresh

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

/**
 * Verify Telegram Login Widget payload.
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
    if (key === 'hash') continue;
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
  trialEndsAt
};
