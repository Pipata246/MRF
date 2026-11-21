'use strict';

/**
 * Slot: auth — register / login / logout / session / health
 * Keep health here so it does not burn a separate Vercel file.
 */
const { readBody, send, setSessionCookies, clearSessionCookies, withHandler } = require('../lib/http');
const { anonClient, adminClient, requireUser, userClient, getUrl, getAnon } = require('../lib/supabase');
const {
  normalizeUsername,
  authEmailFromUsername,
  validateUsername,
  validatePassword,
  publicProfile
} = require('../lib/auth-utils');
const {
  getTelegramBotUsername,
  getTelegramBotToken,
  TRIAL_DAYS
} = require('../lib/telegram-auth');

async function loadProfile(sb, userId) {
  const { data } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
  return publicProfile(data);
}

function telegramPublicConfig() {
  const botUsername = getTelegramBotUsername();
  const botReady = !!(botUsername && getTelegramBotToken());
  return {
    botUsername: botReady ? botUsername : '',
    botReady,
    trialDays: TRIAL_DAYS
  };
}

module.exports = withHandler(async function auth(req, res) {
  const url = new URL(req.url || '/', 'http://local');
  const action = (url.searchParams.get('action') || '').toLowerCase();

  // GET /api/auth?action=health
  if (req.method === 'GET' && action === 'health') {
    const tg = telegramPublicConfig();
    return send(res, 200, {
      ok: true,
      service: 'mrf-api',
      supabaseConfigured: !!(getUrl() && getAnon()),
      apiSlotsUsed: 4,
      apiSlotsMax: 12,
      telegramBotUsername: tg.botUsername,
      telegramBotReady: tg.botReady,
      telegramTrialDays: tg.trialDays
    });
  }

  // GET /api/auth?action=session  (default GET = session)
  if (req.method === 'GET') {
    if (action && action !== 'session') {
      send(res, 400, { error: 'Unknown action' });
      return;
    }
    try {
      const { user, session, accessToken } = await requireUser(req);
      if (session) setSessionCookies(res, session);
      const sb = userClient(accessToken);
      const profile = await loadProfile(sb, user.id);
      send(res, 200, { ok: true, user: { id: user.id }, profile });
    } catch (_) {
      clearSessionCookies(res);
      send(res, 200, { ok: true, user: null, profile: null });
    }
    return;
  }

  if (req.method !== 'POST') {
    send(res, 405, { error: 'Method not allowed' }, { Allow: 'GET, POST' });
    return;
  }

  const body = await readBody(req);
  const act = String(body.action || action || '').toLowerCase();

  if (act === 'logout') {
    clearSessionCookies(res);
    send(res, 200, { ok: true });
    return;
  }

  if (act === 'delete-account' || act === 'delete') {
    if (!(process.env.MRF_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
      return send(res, 503, { ok: false, error: 'Удаление аккаунта временно недоступно' });
    }
    let user;
    try {
      const auth = await requireUser(req);
      user = auth.user;
      if (auth.session) setSessionCookies(res, auth.session);
    } catch (_) {
      return send(res, 401, { ok: false, error: 'Нужен вход в аккаунт' });
    }

    // Re-auth with password before destructive delete
    const password = String(body.password || '');
    if (!password) return send(res, 400, { ok: false, error: 'Введи пароль для подтверждения' });

    const metaUser = (user.user_metadata && user.user_metadata.username) || '';
    const uname = normalizeUsername(body.username || metaUser);
    const email = user.email || (uname ? authEmailFromUsername(uname) : '');
    if (!email) return send(res, 400, { ok: false, error: 'Не удалось подтвердить аккаунт' });

    const anon = anonClient();
    const check = await anon.auth.signInWithPassword({ email, password });
    if (check.error || !check.data?.user || check.data.user.id !== user.id) {
      return send(res, 401, { ok: false, error: 'Неверный пароль' });
    }

    const admin = adminClient();
    const deleted = await admin.auth.admin.deleteUser(user.id);
    if (deleted.error) {
      return send(res, 400, { ok: false, error: deleted.error.message || 'Не удалось удалить аккаунт' });
    }
    clearSessionCookies(res);
    return send(res, 200, { ok: true });
  }

  if (act === 'register') {
    const uname = normalizeUsername(body.username);
    const uErr = validateUsername(uname);
    if (uErr) return send(res, 400, { ok: false, error: uErr });
    const pErr = validatePassword(body.password);
    if (pErr) return send(res, 400, { ok: false, error: pErr });

    const anon = anonClient();
    const { data: available, error: avErr } = await anon.rpc('username_available', { u: uname });
    if (avErr) return send(res, 400, { ok: false, error: avErr.message });
    if (available === false) return send(res, 409, { ok: false, error: 'Этот @ник уже занят' });

    const email = authEmailFromUsername(uname);
    const displayName = String(body.displayName || uname).trim().slice(0, 64) || uname;

    let session = null;
    let user = null;
    if (process.env.MRF_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const admin = adminClient();
      const created = await admin.auth.admin.createUser({
        email,
        password: String(body.password),
        email_confirm: true,
        user_metadata: { username: uname, display_name: displayName }
      });
      if (created.error) return send(res, 400, { ok: false, error: created.error.message });
      user = created.data.user;
      const signed = await anon.auth.signInWithPassword({ email, password: String(body.password) });
      if (signed.error) return send(res, 400, { ok: false, error: signed.error.message });
      session = signed.data.session;
    } else {
      const signedUp = await anon.auth.signUp({
        email,
        password: String(body.password),
        options: { data: { username: uname, display_name: displayName } }
      });
      if (signedUp.error) return send(res, 400, { ok: false, error: signedUp.error.message });
      session = signedUp.data.session;
      user = signedUp.data.user;
      if (!session) {
        const signed = await anon.auth.signInWithPassword({ email, password: String(body.password) });
        if (signed.error) {
          return send(res, 400, {
            ok: false,
            error: 'Аккаунт создан. Выключи Confirm email в Supabase Auth или задай SERVICE_ROLE на сервере.'
          });
        }
        session = signed.data.session;
        user = signed.data.user;
      }
    }

    setSessionCookies(res, session);
    const sb = userClient(session.access_token);
    const profile = await loadProfile(sb, user.id);
    send(res, 200, { ok: true, user: { id: user.id }, profile });
    return;
  }

  if (act === 'login') {
    const uname = normalizeUsername(body.username);
    const uErr = validateUsername(uname);
    if (uErr) return send(res, 400, { ok: false, error: uErr });
    const pErr = validatePassword(body.password);
    if (pErr) return send(res, 400, { ok: false, error: pErr });

    const anon = anonClient();
    const { data, error } = await anon.auth.signInWithPassword({
      email: authEmailFromUsername(uname),
      password: String(body.password)
    });
    if (error || !data.session) return send(res, 401, { ok: false, error: 'Неверный логин или пароль' });

    setSessionCookies(res, data.session);
    const sb = userClient(data.session.access_token);
    const profile = await loadProfile(sb, data.user.id);
    send(res, 200, { ok: true, user: { id: data.user.id }, profile });
    return;
  }

  send(res, 400, { error: 'Unknown action. Use register | login | logout | delete-account | session | health' });
});
