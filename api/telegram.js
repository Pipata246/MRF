'use strict';

/**
 * Slot 6: Telegram bot + Mini App
 * POST ?action=webhook     — Bot API updates
 * POST ?action=tma_login   — { initData } → session cookies for linked TG
 * GET  ?action=tma_config  — public Mini App config
 * POST ?action=reminders   — cron: premium expiry pings (secret header)
 */
const { readBody, send, setSessionCookies, withHandler } = require('../lib/http');
const { adminClient } = require('../lib/supabase');
const {
  handleTelegramUpdate,
  verifyWebAppInitData,
  createSessionForTelegramUser,
  runPremiumReminders,
  getTelegramWebhookSecret,
  requestPublicOrigin,
  botChannelUrl,
  tmaUrl,
  ensureTelegramWebhook,
  getTelegramBotUsername
} = require('../lib/telegram-bot');
const {
  getTelegramBotToken,
  getTelegramBotId
} = require('../lib/telegram-auth');

function cronSecretOk(req) {
  const expected = String(
    process.env.MRF_CRON_SECRET
    || process.env.CRON_SECRET
    || getTelegramWebhookSecret()
    || ''
  ).trim();
  if (!expected) return false;
  const got = String(
    req.headers['x-mrf-cron-secret']
    || req.headers['authorization']?.replace(/^Bearer\s+/i, '')
    || ''
  ).trim();
  return got && got === expected;
}

async function handleWebhook(req, res) {
  if (req.method !== 'POST') {
    return send(res, 405, { error: 'Method not allowed' }, { Allow: 'POST' });
  }
  const expected = getTelegramWebhookSecret();
  const got = String(req.headers['x-telegram-bot-api-secret-token'] || '');
  if (!expected || got !== expected) {
    return send(res, 401, { ok: false, error: 'Unauthorized' });
  }

  const body = await readBody(req);
  const origin = requestPublicOrigin(req) || process.env.MRF_PUBLIC_ORIGIN || '';
  try {
    await handleTelegramUpdate(body, origin.replace(/\/$/, ''));
  } catch (_) {}
  return send(res, 200, { ok: true });
}

module.exports = withHandler(async function telegram(req, res) {
  const url = new URL(req.url || '/', 'http://local');
  const action = (url.searchParams.get('action') || '').toLowerCase();

  if (action === 'webhook' || (!action && req.method === 'POST' && req.headers['x-telegram-bot-api-secret-token'])) {
    return handleWebhook(req, res);
  }

  if (req.method === 'GET' && (action === 'tma_config' || action === 'config')) {
    const origin = requestPublicOrigin(req) || process.env.MRF_PUBLIC_ORIGIN || '';
    const botUsername = getTelegramBotUsername();
    const botId = getTelegramBotId();
    const botReady = !!(botUsername && getTelegramBotToken() && botId);
    return send(res, 200, {
      ok: true,
      botUsername: botReady ? botUsername : '',
      botId: botReady ? botId : '',
      botReady,
      channelUrl: botChannelUrl(),
      tmaUrl: tmaUrl(origin.replace(/\/$/, '')),
      fullscreen: true
    });
  }

  if (req.method === 'POST' && action === 'tma_login') {
    const body = await readBody(req);
    const verified = verifyWebAppInitData(body.initData || body.init_data || '');
    if (!verified.ok) {
      return send(res, 401, { ok: false, error: verified.error || 'Unauthorized' });
    }

    let admin;
    try {
      admin = adminClient();
    } catch (_) {
      return send(res, 503, { ok: false, error: 'Сервер не настроен' });
    }

    const result = await createSessionForTelegramUser(admin, verified.user);
    if (!result.ok) {
      return send(res, result.status || 400, { ok: false, error: result.error });
    }

    setSessionCookies(res, result.session);
    return send(res, 200, {
      ok: true,
      user: {
        id: result.user.id,
        email: result.user.email
      },
      profile: result.profile,
      session: {
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
        expires_in: result.session.expires_in
      }
    });
  }

  if ((req.method === 'POST' || req.method === 'GET') && action === 'reminders') {
    // Vercel Cron = GET + Authorization: Bearer CRON_SECRET
    if (!cronSecretOk(req)) return send(res, 401, { ok: false });
    let admin;
    try {
      admin = adminClient();
    } catch (_) {
      return send(res, 503, { ok: false });
    }
    const out = await runPremiumReminders(admin);
    return send(res, 200, out);
  }

  if (req.method === 'POST' && action === 'set_webhook') {
    if (!cronSecretOk(req)) return send(res, 401, { ok: false });
    const origin = requestPublicOrigin(req) || process.env.MRF_PUBLIC_ORIGIN || '';
    // Point webhook at this slot
    const { telegramApi } = require('../lib/telegram-auth');
    const secret = getTelegramWebhookSecret();
    const hookUrl = `${String(origin).replace(/\/$/, '')}/api/telegram?action=webhook`;
    await telegramApi('setWebhook', {
      url: hookUrl,
      secret_token: secret,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false
    });
    return send(res, 200, { ok: true, url: hookUrl });
  }

  return send(res, 400, {
    error: 'Unknown action. Use webhook | tma_login | tma_config | reminders'
  });
});
