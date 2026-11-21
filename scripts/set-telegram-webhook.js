'use strict';

/**
 * Point bot webhook at production /api/telegram?action=webhook
 * Usage: node scripts/set-telegram-webhook.js [https://mrf-murex.vercel.app]
 */
const path = require('path');
const fs = require('fs');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) return;
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = val;
  });
}

loadEnv();

const {
  ensureTelegramWebhook,
  getTelegramBotUsername,
  getTelegramWebhookSecret
} = require('../lib/telegram-auth');

async function main() {
  const origin = (process.argv[2] || 'https://mrf-murex.vercel.app').replace(/\/$/, '');
  const bot = getTelegramBotUsername();
  const secret = getTelegramWebhookSecret();
  if (!bot || !secret) {
    console.error('Missing MRF_TELEGRAM_BOT_TOKEN / USERNAME');
    process.exit(1);
  }
  const result = await ensureTelegramWebhook(origin);
  console.log(JSON.stringify({ bot, origin, ...result }, null, 2));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
