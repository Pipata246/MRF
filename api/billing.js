'use strict';

/**
 * Slot: billing — YooKassa Premium checkout + webhook
 * GET  ?action=plans
 * GET  ?action=pending
 * POST ?action=create   { plan: month|year }
 * GET  ?action=status&payment_id= | &local_id=
 * POST ?action=webhook  (YooKassa HTTP notifications)
 */
const crypto = require('crypto');
const { readBody, send, setSessionCookies, withHandler } = require('../lib/http');
const { requireUser, adminClient } = require('../lib/supabase');
const { publicProfile } = require('../lib/auth-utils');
const {
  isBillingReady,
  listPublicPlans,
  getPlan,
  createYooPayment,
  getYooPayment,
  grantPremiumFromPlan,
  PAYMENT_TTL_MS,
  isPaymentTimedOut
} = require('../lib/billing');

function requestOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim();
  if (!host) return 'https://mrf-murex.vercel.app';
  return `${proto}://${host}`;
}

function publicPaymentView(row) {
  if (!row) return null;
  const created = Date.parse(row.created_at || '');
  const expiresAt = Number.isFinite(created) ? created + PAYMENT_TTL_MS : null;
  return {
    id: row.id,
    paymentId: String(row.yookassa_payment_id || '').startsWith('pending_')
      ? null
      : row.yookassa_payment_id,
    plan: row.plan,
    amountRub: Number(row.amount_rub),
    status: row.status,
    createdAt: row.created_at,
    paidAt: row.paid_at || null,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    ttlMs: PAYMENT_TTL_MS
  };
}

/**
 * One-shot: pending → succeeded grants Premium exactly once per payment row.
 * Never re-applies an already-stored payment (even if profile premium was cleared).
 */
async function markPaymentPaid(admin, row, yooPayment) {
  if (row.status === 'succeeded' || row.status === 'canceled' || row.status === 'expired') {
    return { already: true, row };
  }
  if (row.premium_applied_at) {
    return { already: true, row };
  }

  const plan = getPlan(row.plan);
  if (!plan) {
    const err = new Error('Неизвестный тариф');
    err.statusCode = 400;
    throw err;
  }

  const paidAt = yooPayment.captured_at || yooPayment.created_at || new Date().toISOString();
  const appliedAt = new Date().toISOString();

  // Atomic claim: only the first writer may apply premium for this payment.
  const { data: locked, error: lockErr } = await admin
    .from('billing_payments')
    .update({
      status: 'succeeded',
      paid_at: paidAt,
      premium_applied_at: appliedAt,
      raw: yooPayment
    })
    .eq('id', row.id)
    .eq('status', 'pending')
    .is('premium_applied_at', null)
    .select('*')
    .maybeSingle();
  if (lockErr) throw lockErr;
  if (!locked) {
    const { data: again } = await admin
      .from('billing_payments')
      .select('*')
      .eq('id', row.id)
      .maybeSingle();
    return { already: true, row: again || row };
  }

  await grantPremiumFromPlan(admin, row.user_id, plan);

  // Telegram notify (linked accounts only) — never blocks grant
  try {
    const { data: prof } = await admin
      .from('profiles')
      .select('*')
      .eq('id', row.user_id)
      .maybeSingle();
    if (prof?.telegram_id) {
      const { notifyTelegramPayment } = require('../lib/telegram-bot');
      await notifyTelegramPayment(prof, 'succeeded', row.plan);
    }
  } catch (_) {}

  return { already: false, row: locked };
}

async function markPaymentTerminal(admin, row, status, yooPayment) {
  if (row.status !== 'pending') return row;
  const payload = {
    status,
    raw: yooPayment || row.raw || {}
  };
  let { data: updated, error } = await admin
    .from('billing_payments')
    .update(payload)
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();
  // Fallback if `expired` constraint not applied yet on live DB
  if (error && status === 'expired') {
    const retry = await admin
      .from('billing_payments')
      .update({ ...payload, status: 'canceled' })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();
    updated = retry.data;
    error = retry.error;
  }
  if (error) throw error;
  const finalRow = updated || row;
  if (updated && (status === 'canceled' || status === 'expired')) {
    try {
      const { data: prof } = await admin
        .from('profiles')
        .select('*')
        .eq('id', row.user_id)
        .maybeSingle();
      if (prof?.telegram_id) {
        const { notifyTelegramPayment } = require('../lib/telegram-bot');
        await notifyTelegramPayment(prof, status, row.plan);
      }
    } catch (_) {}
  }
  return finalRow;
}

/** Re-check YooKassa + apply grant / cancel / expire. Grant only on first pending→succeeded. */
async function syncPaymentRow(admin, row) {
  if (!row) return row;
  // Already finished — history only, never re-grant
  if (
    row.status === 'succeeded'
    || row.status === 'canceled'
    || row.status === 'expired'
    || row.premium_applied_at
  ) {
    return row;
  }

  const yooId = String(row.yookassa_payment_id || '');
  const hasYooId = yooId && !yooId.startsWith('pending_');

  if (hasYooId && isBillingReady()) {
    try {
      const yoo = await getYooPayment(yooId);
      if (yoo.status === 'succeeded') {
        const res = await markPaymentPaid(admin, row, yoo);
        return res.row;
      }
      if (yoo.status === 'canceled') {
        return markPaymentTerminal(admin, row, 'canceled', yoo);
      }
    } catch (_) {
      // fall through to timeout
    }
  }

  if (isPaymentTimedOut(row)) {
    return markPaymentTerminal(admin, row, 'expired', row.raw || {});
  }

  return row;
}

async function handleWebhook(req, res) {
  if (!isBillingReady()) return send(res, 503, { ok: false });
  const body = await readBody(req);
  const event = String(body.event || '');
  const object = body.object;
  if (!object || !object.id) return send(res, 200, { ok: true });

  if (
    event !== 'payment.succeeded'
    && event !== 'payment.canceled'
    && String(object.status || '') !== 'succeeded'
    && String(object.status || '') !== 'canceled'
  ) {
    return send(res, 200, { ok: true });
  }

  let payment;
  try {
    payment = await getYooPayment(object.id);
  } catch (_) {
    return send(res, 200, { ok: true });
  }

  let admin;
  try {
    admin = adminClient();
  } catch (_) {
    return send(res, 200, { ok: true });
  }

  let row = null;
  const byYoo = await admin
    .from('billing_payments')
    .select('*')
    .eq('yookassa_payment_id', payment.id)
    .maybeSingle();
  row = byYoo.data;

  if (!row && payment.metadata?.mrf_payment_id) {
    const byMeta = await admin
      .from('billing_payments')
      .select('*')
      .eq('id', String(payment.metadata.mrf_payment_id))
      .maybeSingle();
    row = byMeta.data;
    if (row && String(row.yookassa_payment_id || '').startsWith('pending_')) {
      await admin
        .from('billing_payments')
        .update({ yookassa_payment_id: payment.id })
        .eq('id', row.id);
      row = { ...row, yookassa_payment_id: payment.id };
    }
  }

  if (!row) return send(res, 200, { ok: true });

  try {
    if (payment.status === 'succeeded') await markPaymentPaid(admin, row, payment);
    else if (payment.status === 'canceled') await markPaymentTerminal(admin, row, 'canceled', payment);
  } catch (_) {}
  return send(res, 200, { ok: true });
}

module.exports = withHandler(async function billing(req, res) {
  const url = new URL(req.url || '/', 'http://local');
  const action = (url.searchParams.get('action') || '').toLowerCase();

  if (action === 'webhook') {
    return handleWebhook(req, res);
  }

  if (req.method === 'GET' && (action === 'plans' || !action)) {
    return send(res, 200, {
      ok: true,
      ready: isBillingReady(),
      currency: 'RUB',
      ttlMs: PAYMENT_TTL_MS,
      plans: listPublicPlans()
    });
  }

  const { user, session } = await requireUser(req);
  if (session) setSessionCookies(res, session);
  const uid = user.id;

  if (req.method === 'POST' && action === 'create') {
    if (!isBillingReady()) {
      return send(res, 503, { ok: false, error: 'Оплата временно недоступна' });
    }
    const body = await readBody(req);
    const plan = getPlan(body.plan);
    if (!plan) return send(res, 400, { ok: false, error: 'Выбери тариф' });

    let admin;
    try {
      admin = adminClient();
    } catch (_) {
      return send(res, 503, { ok: false, error: 'Сервер не настроен' });
    }

    // Close timed-out checkouts only. Never sync Yoo→grant here —
    // that would re-apply an old paid payment when user clicks «Оформить».
    const { data: stale } = await admin
      .from('billing_payments')
      .select('*')
      .eq('user_id', uid)
      .eq('status', 'pending');
    for (const s of stale || []) {
      if (!isPaymentTimedOut(s)) continue;
      try {
        await markPaymentTerminal(admin, s, 'expired', s.raw || {});
      } catch (_) {}
    }

    const origin = requestOrigin(req);
    const localId = crypto.randomUUID();

    const { error: insErr } = await admin
      .from('billing_payments')
      .insert({
        id: localId,
        user_id: uid,
        plan: plan.id,
        amount_rub: plan.amountRub,
        currency: 'RUB',
        status: 'pending',
        yookassa_payment_id: `pending_${localId}`
      });
    if (insErr) return send(res, 400, { ok: false, error: insErr.message });

    let yoo;
    try {
      yoo = await createYooPayment({
        amountValue: plan.amountValue,
        description: `MRF Premium — ${plan.title}`,
        returnUrl: `${origin}/premium.html?paid=1&pid=${encodeURIComponent(localId)}`,
        idempotenceKey: localId,
        metadata: {
          mrf_payment_id: localId,
          mrf_user_id: uid,
          mrf_plan: plan.id
        }
      });
    } catch (e) {
      await admin.from('billing_payments').update({ status: 'canceled' }).eq('id', localId);
      return send(res, e.statusCode || 502, {
        ok: false,
        error: e.message || 'Не удалось создать платёж'
      });
    }

    // Keep DB status as pending until we confirm success via poll/webhook.
    // Never copy YooKassa's intermediate status into our row.
    const { data: updated, error: upErr } = await admin
      .from('billing_payments')
      .update({
        yookassa_payment_id: yoo.id,
        status: 'pending',
        raw: yoo
      })
      .eq('id', localId)
      .select('*')
      .maybeSingle();
    if (upErr) return send(res, 400, { ok: false, error: upErr.message });

    const confirmUrl = yoo?.confirmation?.confirmation_url || null;
    if (!confirmUrl) {
      await admin.from('billing_payments').update({ status: 'canceled' }).eq('id', localId);
      return send(res, 502, { ok: false, error: 'Нет ссылки на оплату' });
    }

    return send(res, 200, {
      ok: true,
      confirmationUrl: confirmUrl,
      payment: publicPaymentView(updated),
      paymentId: yoo.id,
      localId
    });
  }

  if (req.method === 'GET' && action === 'pending') {
    let admin;
    try {
      admin = adminClient();
    } catch (_) {
      return send(res, 503, { ok: false, error: 'Сервер не настроен' });
    }

    const { data: rows } = await admin
      .from('billing_payments')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(8);

    let result = null;
    for (const row of rows || []) {
      const synced = await syncPaymentRow(admin, row);
      if (synced.status === 'pending') {
        result = synced;
        break;
      }
      // After refresh: surface a very recent terminal payment so UI can finish
      const stamp = Date.parse(synced.paid_at || synced.created_at || '');
      const age = Number.isFinite(stamp) ? Date.now() - stamp : Infinity;
      if (age < 3 * 60 * 1000) {
        result = synced;
        break;
      }
    }

    const { data: profile } = await admin.from('profiles').select('*').eq('id', uid).maybeSingle();
    return send(res, 200, {
      ok: true,
      payment: publicPaymentView(result),
      profile: publicProfile(profile)
    });
  }

  if (req.method === 'GET' && action === 'status') {
    const paymentId = url.searchParams.get('payment_id') || '';
    const localId = url.searchParams.get('local_id') || '';
    if (!paymentId && !localId) return send(res, 400, { ok: false, error: 'Нет payment_id' });

    let admin;
    try {
      admin = adminClient();
    } catch (_) {
      return send(res, 503, { ok: false, error: 'Сервер не настроен' });
    }

    let query = admin.from('billing_payments').select('*').eq('user_id', uid);
    if (localId) query = query.eq('id', localId);
    else query = query.eq('yookassa_payment_id', paymentId);

    const { data: row } = await query.maybeSingle();
    if (!row) return send(res, 404, { ok: false, error: 'Платёж не найден' });

    const synced = await syncPaymentRow(admin, row);
    const { data: profile } = await admin.from('profiles').select('*').eq('id', uid).maybeSingle();

    return send(res, 200, {
      ok: true,
      payment: publicPaymentView(synced),
      status: synced.status,
      plan: synced.plan,
      profile: publicProfile(profile)
    });
  }

  return send(res, 400, { error: 'Unknown action. Use plans | create | status | pending | webhook' });
});
