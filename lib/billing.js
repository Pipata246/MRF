'use strict';

const crypto = require('crypto');

/** One-time Premium plans (RUB). Year = ~2 months free vs 12×300. */
const PLANS = {
  month: {
    id: 'month',
    title: '1 месяц',
    amountRub: 300,
    amountValue: '300.00',
    days: 30,
    wasRub: null
  },
  year: {
    id: 'year',
    title: '1 год',
    amountRub: 2990,
    amountValue: '2990.00',
    days: 365,
    wasRub: 3600
  }
};

/** How long a pending checkout stays open before we expire it. */
const PAYMENT_TTL_MS = 15 * 60 * 1000;

function getYooShopId() {
  return String(process.env.MRF_YOOKASSA_SHOP_ID || process.env.YOOKASSA_SHOP_ID || '').trim();
}

function getYooSecretKey() {
  return String(process.env.MRF_YOOKASSA_SECRET_KEY || process.env.YOOKASSA_SECRET_KEY || '').trim();
}

function isBillingReady() {
  return !!(getYooShopId() && getYooSecretKey());
}

function listPublicPlans() {
  return Object.values(PLANS).map((p) => ({
    id: p.id,
    title: p.title,
    amountRub: p.amountRub,
    wasRub: p.wasRub,
    days: p.days,
    perMonthRub: p.id === 'year' ? Math.round(p.amountRub / 12) : p.amountRub
  }));
}

function getPlan(planId) {
  const key = String(planId || '').toLowerCase();
  return PLANS[key] || null;
}

function yooAuthHeader() {
  const raw = `${getYooShopId()}:${getYooSecretKey()}`;
  return `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;
}

async function yooFetch(path, { method = 'GET', body, idempotenceKey } = {}) {
  const headers = {
    Authorization: yooAuthHeader(),
    'Content-Type': 'application/json'
  };
  if (idempotenceKey) headers['Idempotence-Key'] = String(idempotenceKey);
  const res = await fetch(`https://api.yookassa.ru/v3${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.description || json?.message || `YooKassa ${res.status}`);
    err.statusCode = res.status >= 400 && res.status < 600 ? res.status : 502;
    err.payload = json;
    throw err;
  }
  return json;
}

async function createYooPayment({ amountValue, description, returnUrl, metadata, idempotenceKey }) {
  return yooFetch('/payments', {
    method: 'POST',
    idempotenceKey: idempotenceKey || crypto.randomUUID(),
    body: {
      amount: { value: amountValue, currency: 'RUB' },
      capture: true,
      description: String(description || 'NOVALIBER Premium').slice(0, 128),
      confirmation: {
        type: 'redirect',
        return_url: returnUrl
      },
      metadata: metadata || {}
    }
  });
}

async function getYooPayment(paymentId) {
  return yooFetch(`/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' });
}

function addPlanDays(fromDate, days) {
  const base = fromDate instanceof Date ? fromDate.getTime() : Date.parse(fromDate);
  const start = Number.isFinite(base) ? Math.max(base, Date.now()) : Date.now();
  return new Date(start + Number(days) * 24 * 60 * 60 * 1000);
}

function paymentAgeMs(row) {
  const t = Date.parse(row?.created_at || '');
  if (!Number.isFinite(t)) return 0;
  return Date.now() - t;
}

function isPaymentTimedOut(row) {
  return paymentAgeMs(row) >= PAYMENT_TTL_MS;
}

/**
 * Extend Premium for user after successful payment.
 * Stacks from max(now, current premium_ends_at).
 */
async function grantPremiumFromPlan(admin, userId, plan) {
  const { data: mine, error } = await admin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!mine) {
    const err = new Error('Профиль не найден');
    err.statusCode = 404;
    throw err;
  }

  const now = new Date();
  const curEnd = mine.premium_ends_at ? Date.parse(mine.premium_ends_at) : NaN;
  const base = Number.isFinite(curEnd) && curEnd > now.getTime() ? new Date(curEnd) : now;
  const ends = addPlanDays(base, plan.days);

  const patch = {
    is_premium: true,
    premium_started_at: mine.premium_started_at || now.toISOString(),
    premium_ends_at: ends.toISOString(),
    updated_at: now.toISOString()
  };

  const { data: updated, error: upErr } = await admin
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select('*')
    .maybeSingle();
  if (upErr) throw upErr;
  return updated;
}

module.exports = {
  PLANS,
  PAYMENT_TTL_MS,
  getYooShopId,
  getYooSecretKey,
  isBillingReady,
  listPublicPlans,
  getPlan,
  createYooPayment,
  getYooPayment,
  addPlanDays,
  grantPremiumFromPlan,
  paymentAgeMs,
  isPaymentTimedOut
};
