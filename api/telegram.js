'use strict';

/**
 * Slot 6: Telegram bot
 * POST ?action=webhook     — Bot API updates
 * POST ?action=reminders   — cron: premium expiry pings (secret header)
 * POST ?action=set_webhook — re-bind webhook URL
 */
const { readBody, send, withHandler } = require('../lib/http');
const { adminClient } = require('../lib/supabase');
const {
  handleTelegramUpdate,
  runPremiumReminders,
  getTelegramWebhookSecret,
  requestPublicOrigin
} = require('../lib/telegram-bot');

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
    error: 'Unknown action. Use webhook | reminders | set_webhook'
  });
});
