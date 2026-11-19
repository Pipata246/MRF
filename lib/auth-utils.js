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

function validatePassword(p) {
  const s = String(p || '');
  if (s.length < 8) return 'Пароль: минимум 8 символов';
  if (s.length > 72) return 'Пароль слишком длинный';
  return '';
}

function publicProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: '@' + row.username,
    name: row.display_name || row.username,
    avatar: row.avatar_url || null,
    plan: 'free',
    planLabel: 'Подписка не оформлена',
    joinedAt: row.created_at || null
  };
}

module.exports = {
  AUTH_EMAIL_DOMAIN,
  normalizeUsername,
  authEmailFromUsername,
  validateUsername,
  validatePassword,
  publicProfile
};
