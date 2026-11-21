'use strict';

/**
 * Slot: billing — YooKassa Premium checkout + webhook
 * GET  ?action=plans
 * POST ?action=create   { plan: month|year }
 * GET  ?action=status&payment_id=
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
  grantPremiumFromPlan
} = require('../lib/billing');

function requestOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim();
  if (!host) return 'https://mrf-murex.vercel.app';
  return `${proto}://${host}`;
}

async function markPaymentPaid(admin, row, yooPayment) {
  if (row.status === 'succeeded') {
    return { already: true, row };
  }
  const plan = getPlan(row.plan);
  if (!plan) {
    const err = new Error('Неизвестный тариф');
    err.statusCode = 400;
    throw err;
  }

  const paidAt = yooPayment.captured_at || yooPayment.created_at || new Date().toISOString();
  const { data: locked, error: lockErr } = await admin
    .from('billing_payments')
    .update({
      status: 'succeeded',
      paid_at: paidAt,
      raw: yooPayment
    })
    .eq('id', row.id)
    .eq('status', 'pending')
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
  return { already: false, row: locked };
}

async function handleWebhook(req, res) {
  if (!isBillingReady()) return send(res, 503, { ok: false });
  const body = await readBody(req);
  const event = String(body.event || '');
  const object = body.object;
  if (!object || !object.id) return send(res, 200, { ok: true });

  // Always ack quickly; process after verify with YooKassa
  if (event !== 'payment.succeeded' && String(object.status || '') !== 'succeeded') {
    return send(res, 200, { ok: true });
  }

  let payment;
  try {
    payment = await getYooPayment(object.id);
  } catch (_) {
    return send(res, 200, { ok: true });
  }
  if (payment.status !== 'succeeded') return send(res, 200, { ok: true });

  let admin;
  try {
    admin = adminClient();
  } catch (_) {
    return send(res, 200, { ok: true });
  }

  const { data: row } = await admin
    .from('billing_payments')
    .select('*')
    .eq('yookassa_payment_id', payment.id)
    .maybeSingle();
  if (!row) return send(res, 200, { ok: true });

  try {
    await markPaymentPaid(admin, row, payment);
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
      plans: listPublicPlans()
    });
  }

  const { user, session, accessToken } = await requireUser(req);
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

    const origin = requestOrigin(req);
    const returnUrl = `${origin}/premium.html?paid=1`;
    const localId = crypto.randomUUID();

    const { data: inserted, error: insErr } = await admin
      .from('billing_payments')
      .insert({
        id: localId,
        user_id: uid,
        plan: plan.id,
        amount_rub: plan.amountRub,
        currency: 'RUB',
        status: 'pending',
        yookassa_payment_id: `pending_${localId}`
      })
      .select('*')
      .maybeSingle();
    if (insErr) return send(res, 400, { ok: false, error: insErr.message });

    let yoo;
    try {
      yoo = await createYooPayment({
        amountValue: plan.amountValue,
        description: `MRF Premium — ${plan.title}`,
        returnUrl,
        idempotenceKey: localId,
        metadata: {
          mrf_payment_id: localId,
          mrf_user_id: uid,
          mrf_plan: plan.id
        }
      });
    } catch (e) {
      await admin.from('billing_payments').update({ status: 'canceled' }).eq('id', localId);
      return send(res, e.statusCode || 502, { ok: false, error: e.message || 'Не удалось создать платёж' });
    }

    const confirmUrl = yoo?.confirmation?.confirmation_url || '';
    const { error: upErr } = await admin
      .from('billing_payments')
      .update({
        yookassa_payment_id: yoo.id,
        status: yoo.status === 'succeeded' ? 'pending' : (yoo.status || 'pending'),
        raw: yoo
      })
      .eq('id', localId);
    if (upErr) return send(res, 400, { ok: false, error: upErr.message });

    if (!confirmUrl) {
      return send(res, 502, { ok: false, error: 'Нет ссылки на оплату' });
    }

    return send(res, 200, {
      ok: true,
      paymentId: yoo.id,
      localId,
      confirmationUrl: confirmUrl
    });
  }

  if (req.method === 'GET' && action === 'status') {
    const paymentId = url.searchParams.get('payment_id') || '';
    if (!paymentId) return send(res, 400, { ok: false, error: 'Нет payment_id' });

    let admin;
    try {
      admin = adminClient();
    } catch (_) {
      return send(res, 503, { ok: false, error: 'Сервер не настроен' });
    }

    const { data: row } = await admin
      .from('billing_payments')
      .select('*')
      .eq('yookassa_payment_id', paymentId)
      .eq('user_id', uid)
      .maybeSingle();
    if (!row) return send(res, 404, { ok: false, error: 'Платёж не найден' });

    if (row.status !== 'succeeded' && isBillingReady()) {
      try {
        const yoo = await getYooPayment(paymentId);
        if (yoo.status === 'succeeded') {
          await markPaymentPaid(admin, row, yoo);
        } else if (yoo.status === 'canceled') {
          await admin.from('billing_payments').update({ status: 'canceled', raw: yoo }).eq('id', row.id);
        }
      } catch (_) {}
    }

    const { data: fresh } = await admin
      .from('billing_payments')
      .select('*')
      .eq('id', row.id)
      .maybeSingle();
    const { data: profile } = await admin.from('profiles').select('*').eq('id', uid).maybeSingle();

    return send(res, 200, {
      ok: true,
      status: fresh?.status || row.status,
      plan: fresh?.plan || row.plan,
      profile: publicProfile(profile)
    });
  }

  return send(res, 400, { error: 'Unknown action. Use plans | create | status | webhook' });
});
