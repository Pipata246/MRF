'use strict';

const { publicProfile, isPremiumActive } = require('./auth-utils');
const { trialEndsAt, TRIAL_DAYS } = require('./telegram-auth');

/**
 * Bind telegram_id to profile once; grant trial if not already premium.
 */
async function applyTelegramLink(admin, uid, tg) {
  const { data: mine, error: mineErr } = await admin
    .from('profiles')
    .select('*')
    .eq('id', uid)
    .maybeSingle();
  if (mineErr) return { ok: false, status: 400, error: mineErr.message };
  if (!mine) return { ok: false, status: 404, error: 'Профиль не найден' };

  if (mine.telegram_id != null) {
    if (Number(mine.telegram_id) === tg.id) {
      return { ok: true, alreadyLinked: true, trialGranted: false, profile: publicProfile(mine) };
    }
    return { ok: false, status: 409, error: 'Telegram уже привязан к этому аккаунту' };
  }

  if (mine.telegram_trial_used) {
    return { ok: false, status: 409, error: 'Привязка недоступна для этого аккаунта' };
  }

  const { data: taken } = await admin
    .from('profiles')
    .select('id')
    .eq('telegram_id', tg.id)
    .maybeSingle();
  if (taken && taken.id !== uid) {
    return { ok: false, status: 409, error: 'Этот Telegram уже привязан к другому аккаунту' };
  }

  const now = new Date();
  const patch = {
    telegram_id: tg.id,
    telegram_username: tg.username,
    telegram_linked_at: now.toISOString(),
    telegram_trial_used: true,
    updated_at: now.toISOString()
  };

  let trialGranted = false;
  const active = isPremiumActive(mine);
  const trialEnd = trialEndsAt(now);
  if (!active) {
    patch.is_premium = true;
    patch.premium_started_at = mine.premium_started_at || now.toISOString();
    patch.premium_ends_at = trialEnd.toISOString();
    trialGranted = true;
  } else if (mine.premium_ends_at) {
    const curEnd = Date.parse(mine.premium_ends_at);
    if (!Number.isFinite(curEnd) || trialEnd.getTime() > curEnd) {
      patch.premium_ends_at = trialEnd.toISOString();
      trialGranted = true;
    }
  }

  const { data: updated, error: upErr } = await admin
    .from('profiles')
    .update(patch)
    .eq('id', uid)
    .is('telegram_id', null)
    .eq('telegram_trial_used', false)
    .select('*')
    .maybeSingle();

  if (upErr) {
    if (/profiles_telegram_id_uidx|duplicate|unique/i.test(upErr.message || '')) {
      return { ok: false, status: 409, error: 'Этот Telegram уже привязан к другому аккаунту' };
    }
    return { ok: false, status: 400, error: upErr.message };
  }
  if (!updated) {
    return { ok: false, status: 409, error: 'Не удалось привязать — обнови страницу' };
  }

  return {
    ok: true,
    alreadyLinked: false,
    trialGranted,
    trialDays: trialGranted ? TRIAL_DAYS : 0,
    profile: publicProfile(updated)
  };
}

async function findProfileByTelegramId(admin, telegramId) {
  const id = Number(telegramId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const { data } = await admin
    .from('profiles')
    .select('*')
    .eq('telegram_id', id)
    .maybeSingle();
  return data || null;
}

module.exports = {
  applyTelegramLink,
  findProfileByTelegramId
};
