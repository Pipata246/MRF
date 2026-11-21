'use strict';

const AUTH_EMAIL_DOMAIN = 'users.mrf.internal';

function normalizeUsername(raw) {
  return String(raw || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24);
}

function authEmailFromUsername(username) {
  const u = normalizeUsername(username);
  return u ? `${u}@${AUTH_EMAIL_DOMAIN}` : '';
}

function validateUsername(u) {
  const n = normalizeUsername(u);
  if (n.length < 3) return 'Никнейм: минимум 3 символа';
  if (n.length > 24) return 'Никнейм: максимум 24 символа';
  if (!/^[a-z0-9_]+$/.test(n)) return 'Только латиница, цифры и _';
  return '';
}

/** Latin letters, digits, common ASCII symbols — no spaces / Cyrillic / emoji */
const PASSWORD_OK = /^[A-Za-z0-9!@#$%^&*()_+\-=.,?]+$/;

function validatePassword(p) {
  const s = String(p || '');
  if (!s) return 'Введи пароль';
  if (s.length < 8) return 'Пароль: минимум 8 символов';
  if (s.length > 72) return 'Пароль слишком длинный';
  if (!PASSWORD_OK.test(s)) {
    return 'Пароль: только латиница, цифры и !@#$%^&*()_+-=.,?';
  }
  return '';
}

/** Active Premium: flag on and not past premium_ends_at (null end = no expiry). */
function isPremiumActive(row) {
  if (!row) return false;
  const flagged = !!row.is_premium || row.premium === true || row.plan === 'premium';
  if (!flagged) return false;
  if (row.premium_ends_at) {
    const end = Date.parse(row.premium_ends_at);
    if (Number.isFinite(end) && end <= Date.now()) return false;
  }
  if (row.premiumEndsAt) {
    const end = Date.parse(row.premiumEndsAt);
    if (Number.isFinite(end) && end <= Date.now()) return false;
  }
  return true;
}

function publicProfile(row) {
  if (!row) return null;
  const premium = isPremiumActive(row);
  return {
    id: row.id,
    username: '@' + String(row.username || '').replace(/^@+/, ''),
    name: row.display_name || row.username,
    bio: row.bio != null ? String(row.bio) : '',
    avatar: row.avatar_url || null,
    premium,
    plan: premium ? 'premium' : 'free',
    planLabel: premium ? 'Премиум' : 'Нет',
    premiumStartedAt: row.premium_started_at || null,
    premiumEndsAt: row.premium_ends_at || null,
    telegramLinked: row.telegram_id != null,
    telegramUsername: row.telegram_username
      ? '@' + String(row.telegram_username).replace(/^@+/, '')
      : null,
    telegramTrialUsed: !!row.telegram_trial_used,
    joinedAt: row.created_at || null
  };
}

/** Free plan accents: brand pink + Spotify-like green */
const FREE_ACCENTS = ['#EE90B7', '#27AE60'];

function normalizeAccentHex(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  if (s[0] !== '#') s = '#' + s;
  s = s.toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(s)) return s;
  if (/^#[0-9A-F]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  return '';
}

function isFreeAccent(hex) {
  const n = normalizeAccentHex(hex);
  return !!n && FREE_ACCENTS.includes(n);
}

function clampAccentForPlan(hex, premium, fallback) {
  const n = normalizeAccentHex(hex);
  if (premium) return n || normalizeAccentHex(fallback) || FREE_ACCENTS[0];
  if (n && FREE_ACCENTS.includes(n)) return n;
  return normalizeAccentHex(fallback) || FREE_ACCENTS[0];
}

module.exports = {
  AUTH_EMAIL_DOMAIN,
  normalizeUsername,
  authEmailFromUsername,
  validateUsername,
  validatePassword,
  isPremiumActive,
  publicProfile,
  FREE_ACCENTS,
  normalizeAccentHex,
  isFreeAccent,
  clampAccentForPlan
};
