'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const envPath = path.join(__dirname, '..', '.env');
const raw = fs.readFileSync(envPath, 'utf8');
const env = {};
raw.split(/\r?\n/).forEach((line) => {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!m) return;
  let v = m[2];
  if (
    (v.startsWith('"') && v.endsWith('"'))
    || (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  env[m[1]] = v;
});

const token = env.MRF_TELEGRAM_BOT_TOKEN || '';
if (!token) {
  console.error('No MRF_TELEGRAM_BOT_TOKEN in .env');
  process.exit(1);
}

const secret = crypto
  .createHmac('sha256', token)
  .update('mrf-tg-hook-v1')
  .digest('hex')
  .slice(0, 32);

const hook = 'https://mrf-murex.vercel.app/api/telegram?action=webhook';
const url =
  `https://api.telegram.org/bot${token}/setWebhook`
  + `?url=${encodeURIComponent(hook)}`
  + `&secret_token=${encodeURIComponent(secret)}`
  + `&allowed_updates=${encodeURIComponent(JSON.stringify(['message', 'callback_query']))}`;

const out = path.join(__dirname, '..', '.tmp-set-webhook-url.txt');
fs.writeFileSync(out, url, 'utf8');
console.log('secret_token=' + secret);
console.log('saved=' + out);
console.log('open the file .tmp-set-webhook-url.txt and paste that ONE line into the browser');
