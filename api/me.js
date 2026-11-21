'use strict';

/**
 * Slot: me — profile + settings + public accounts
 * Routes via ?resource=profile|settings|avatar|account|accounts
 * Username is never writable here (immutable in DB).
 */
const { readBody, send, setSessionCookies, withHandler } = require('../lib/http');
const { requireUser, userClient, anonClient, adminClient } = require('../lib/supabase');
const {
  publicProfile,
  normalizeUsername,
  clampAccentForPlan,
  isPremiumActive
} = require('../lib/auth-utils');
const {
  getTelegramBotUsername,
  getTelegramBotToken,
  getTelegramBotId,
  getTelegramWebhookSecret,
  verifyTelegramAuth,
  createTelegramLinkToken,
  parseTelegramLinkToken,
  buildTelegramDeepLink,
  sendTelegramMessage,
  ensureTelegramWebhook,
  requestPublicOrigin,
  trialEndsAt,
  TRIAL_DAYS
} = require('../lib/telegram-auth');

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

async function handleTelegramWebhook(req, res) {
  if (req.method !== 'POST') {
    return send(res, 405, { error: 'Method not allowed' }, { Allow: 'POST' });
  }
  const expected = getTelegramWebhookSecret();
  const got = String(req.headers['x-telegram-bot-api-secret-token'] || '');
  if (!expected || got !== expected) {
    return send(res, 401, { ok: false, error: 'Unauthorized' });
  }

  const body = await readBody(req);
  const msg = body.message || body.edited_message;
  if (!msg || !msg.from || msg.from.is_bot) {
    return send(res, 200, { ok: true });
  }

  const text = String(msg.text || '').trim();
  const startMatch = text.match(/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+(.+))?$/i);
  if (!startMatch) {
    return send(res, 200, { ok: true });
  }

  const payload = String(startMatch[1] || '').trim();
  const chatId = msg.chat?.id || msg.from.id;
  const parsed = parseTelegramLinkToken(payload);
  if (!parsed) {
    try {
      await sendTelegramMessage(chatId, 'Открой MRF → Профиль → Привязать Telegram.');
    } catch (_) {}
    return send(res, 200, { ok: true });
  }

  let admin;
  try {
    admin = adminClient();
  } catch (_) {
    return send(res, 200, { ok: true });
  }

  const tg = {
    id: Number(msg.from.id),
    username: msg.from.username
      ? String(msg.from.username).replace(/^@+/, '').slice(0, 64)
      : null,
    firstName: msg.from.first_name ? String(msg.from.first_name).slice(0, 128) : null
  };
  if (!Number.isFinite(tg.id) || tg.id <= 0) {
    return send(res, 200, { ok: true });
  }

  const result = await applyTelegramLink(admin, parsed.userId, tg);
  try {
    if (result.ok) {
      await sendTelegramMessage(
        chatId,
        result.trialGranted
          ? 'Готово. Telegram привязан — Premium на 14 дней.'
          : 'Готово. Telegram привязан.'
      );
    } else {
      await sendTelegramMessage(chatId, result.error || 'Не удалось привязать.');
    }
  } catch (_) {}

  return send(res, 200, { ok: true });
}

const SETTINGS_COLS =
  'theme, accent_dark, accent_light, autoplay, shuffle_on_play, remember_position, crossfade_seconds, show_explicit, settings';

function rowToSettings(row, premium = false) {
  if (!row) {
    return {
      theme: 'dark',
      accentColorDark: '#EE90B7',
      accentColorLight: '#27AE60',
      accentColor: '#EE90B7',
      autoplay: false,
      shuffleOnPlay: false,
      rememberPosition: true,
      crossfadeSeconds: 0,
      showExplicit: true
    };
  }
  const theme = row.theme === 'light' ? 'light' : 'dark';
  const accentDark = clampAccentForPlan(row.accent_dark || '#EE90B7', premium, '#EE90B7');
  const accentLight = clampAccentForPlan(row.accent_light || '#27AE60', premium, '#27AE60');
  return {
    theme,
    accentColorDark: accentDark,
    accentColorLight: accentLight,
    accentColor: theme === 'light' ? accentLight : accentDark,
    autoplay: !!row.autoplay,
    shuffleOnPlay: premium ? !!row.shuffle_on_play : false,
    rememberPosition: row.remember_position !== false,
    crossfadeSeconds: Math.max(0, Math.min(12, Number(row.crossfade_seconds) || 0)),
    showExplicit: true
  };
}

async function loadIsPremium(sb, uid) {
  const { data } = await sb
    .from('profiles')
    .select('is_premium, premium_ends_at')
    .eq('id', uid)
    .maybeSingle();
  return isPremiumActive(data);
}

function patchToRow(body, premium = false) {
  const src = body.settings && typeof body.settings === 'object' ? { ...body, ...body.settings } : body;
  const row = { updated_at: new Date().toISOString() };
  if (src.theme === 'dark' || src.theme === 'light') row.theme = src.theme;
  if (src.accentColorDark != null || src.accent_dark != null) {
    row.accent_dark = clampAccentForPlan(src.accentColorDark || src.accent_dark, premium, '#EE90B7');
  }
  if (src.accentColorLight != null || src.accent_light != null) {
    row.accent_light = clampAccentForPlan(src.accentColorLight || src.accent_light, premium, '#27AE60');
  }
  if (src.accentColor != null) {
    const hex = clampAccentForPlan(src.accentColor, premium, row.theme === 'light' ? '#27AE60' : '#EE90B7');
    if ((row.theme || src.theme) === 'light') row.accent_light = hex;
    else row.accent_dark = hex;
  }
  if (typeof src.autoplay === 'boolean') row.autoplay = src.autoplay;
  if (typeof src.shuffleOnPlay === 'boolean') {
    row.shuffle_on_play = premium ? !!src.shuffleOnPlay : false;
  }
  if (typeof src.rememberPosition === 'boolean') row.remember_position = src.rememberPosition;
  if (src.crossfadeSeconds != null) {
    row.crossfade_seconds = Math.max(0, Math.min(12, Number(src.crossfadeSeconds) || 0));
  }
  row.show_explicit = true;
  return row;
}

async function loadPlaylistTracks(sb, playlistId) {
  const { data: tracks } = await sb
    .from('playlist_tracks')
    .select('payload, position, added_at')
    .eq('playlist_id', playlistId)
    .order('position', { ascending: true });
  return (tracks || []).map((t) => ({
    ...(t.payload || {}),
    addedAt: t.added_at ? Date.parse(t.added_at) : Date.now()
  }));
}

async function searchAccounts(sb, query, limit) {
  const uname = normalizeUsername(query);
  if (uname.length < 1) return [];
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 40);
  const { data, error } = await sb
    .from('profiles')
    .select('id, username, display_name, bio, avatar_url, is_premium, created_at')
    .ilike('username', `%${uname}%`)
    .order('username', { ascending: true })
    .limit(lim);
  if (error) throw Object.assign(new Error(error.message), { statusCode: 400 });
  return (data || []).map((row) => publicProfile(row));
}

async function loadPublicAccount(sb, username) {
  const uname = normalizeUsername(username);
  if (uname.length < 3) return null;

  const { data: profile, error } = await sb
    .from('profiles')
    .select('id, username, display_name, bio, avatar_url, is_premium, created_at')
    .eq('username', uname)
    .maybeSingle();
  if (error) throw Object.assign(new Error(error.message), { statusCode: 400 });
  if (!profile) return null;

  const uid = profile.id;

  const [albumsRes, followsRes, playlistsRes] = await Promise.all([
    sb
      .from('saved_albums')
      .select('payload, saved_at')
      .eq('user_id', uid)
      .order('saved_at', { ascending: false })
      .limit(80),
    sb
      .from('followed_artists')
      .select('payload, added_at')
      .eq('user_id', uid)
      .order('added_at', { ascending: false })
      .limit(80),
    sb
      .from('playlists')
      .select('id, user_id, name, description, cover, is_public, created_at, updated_at')
      .eq('user_id', uid)
      .eq('is_public', true)
      .like('id', 'pl\\_%')
      .order('updated_at', { ascending: false })
      .limit(40)
  ]);

  if (albumsRes.error) throw Object.assign(new Error(albumsRes.error.message), { statusCode: 400 });
  if (followsRes.error) throw Object.assign(new Error(followsRes.error.message), { statusCode: 400 });
  if (playlistsRes.error) throw Object.assign(new Error(playlistsRes.error.message), { statusCode: 400 });

  const albums = (albumsRes.data || []).map((r) => ({
    ...(r.payload || {}),
    savedAt: r.saved_at ? Date.parse(r.saved_at) : Date.now()
  })).filter((a) => a && (a.id || a.title));

  const artists = (followsRes.data || []).map((r) => r.payload || {}).filter((a) => a && (a.id || a.name));

  const author = {
    id: profile.id,
    username: profile.username || '',
    name: profile.display_name || profile.username || ''
  };

  const playlists = [];
  for (const p of playlistsRes.data || []) {
    const tracks = await loadPlaylistTracks(sb, p.id);
    playlists.push({
      id: p.id,
      name: p.name,
      description: p.description || '',
      cover: p.cover || null,
      isPublic: true,
      createdAt: p.created_at ? Date.parse(p.created_at) : Date.now(),
      updatedAt: p.updated_at ? Date.parse(p.updated_at) : Date.now(),
      trackCount: tracks.length,
      tracks,
      ownerId: p.user_id,
      author,
      origin: 'public',
      readOnly: true
    });
  }

  return {
    profile: publicProfile(profile),
    albums,
    artists,
    playlists,
    counts: {
      albums: albums.length,
      artists: artists.length,
      playlists: playlists.length
    }
  };
}

module.exports = withHandler(async function me(req, res) {
  const url = new URL(req.url || '/', 'http://local');
  const resource = (url.searchParams.get('resource') || 'profile').toLowerCase();

  // Telegram bot webhook — no user session (verified via secret_token header)
  if (resource === 'tg_hook') {
    return handleTelegramWebhook(req, res);
  }

  const publicGet =
    req.method === 'GET' && (resource === 'account' || resource === 'accounts');

  let auth = null;
  let sb;
  let uid = null;

  if (publicGet) {
    try {
      auth = await requireUser(req);
      if (auth.session) setSessionCookies(res, auth.session);
      sb = userClient(auth.accessToken);
      uid = auth.user.id;
    } catch (_) {
      sb = anonClient();
    }
  } else {
    auth = await requireUser(req);
    if (auth.session) setSessionCookies(res, auth.session);
    sb = userClient(auth.accessToken);
    uid = auth.user.id;
  }

  if (resource === 'accounts') {
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
    const q = url.searchParams.get('q') || url.searchParams.get('query') || '';
    const limit = url.searchParams.get('limit') || 20;
    const items = await searchAccounts(sb, q, limit);
    return send(res, 200, { ok: true, items });
  }

  if (resource === 'account') {
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
    const u = url.searchParams.get('u') || url.searchParams.get('username') || '';
    const data = await loadPublicAccount(sb, u);
    if (!data) return send(res, 404, { ok: false, error: 'Аккаунт не найден' });
    return send(res, 200, {
      ok: true,
      ...data,
      isSelf: !!(uid && data.profile && data.profile.id === uid)
    });
  }

  if (resource === 'avatar') {
    if (req.method !== 'POST' && req.method !== 'PUT') {
      return send(res, 405, { error: 'Method not allowed' }, { Allow: 'POST, PUT' });
    }
    const body = await readBody(req);
    const raw = String(body.image || body.dataUrl || '');
    const m = raw.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/);
    if (!m) return send(res, 400, { ok: false, error: 'Нужно изображение JPEG/PNG/WebP' });
    const mime = m[1];
    const buf = Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
    if (!buf.length || buf.length > 2 * 1024 * 1024) {
      return send(res, 400, { ok: false, error: 'Файл слишком большой (макс. 2 МБ)' });
    }
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const path = `${uid}/avatar.${ext}`;
    const up = await sb.storage.from('avatars').upload(path, buf, {
      contentType: mime,
      upsert: true,
      cacheControl: '3600'
    });
    if (up.error) return send(res, 400, { ok: false, error: up.error.message || 'Не удалось загрузить фото' });
    const pub = sb.storage.from('avatars').getPublicUrl(path);
    const avatarUrl = `${pub?.data?.publicUrl || ''}?v=${Date.now()}`;
    const { data, error } = await sb
      .from('profiles')
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq('id', uid)
      .select('*')
      .maybeSingle();
    if (error) return send(res, 400, { ok: false, error: error.message });
    return send(res, 200, { ok: true, profile: publicProfile(data) });
  }

  if (resource === 'profile') {
    if (req.method === 'GET') {
      const { data, error } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
      if (error) return send(res, 400, { ok: false, error: error.message });
      return send(res, 200, { ok: true, profile: publicProfile(data) });
    }
    if (req.method === 'PATCH' || req.method === 'PUT' || req.method === 'POST') {
      const body = await readBody(req);
      const patch = { updated_at: new Date().toISOString() };
      if (body.name != null || body.displayName != null) {
        const name = String(body.name || body.displayName || '').trim().slice(0, 64);
        if (!name) return send(res, 400, { ok: false, error: 'Укажи имя' });
        patch.display_name = name;
      }
      if (body.bio != null || body.description != null) {
        patch.bio = String(body.bio != null ? body.bio : body.description || '')
          .replace(/\r\n/g, '\n')
          .trim()
          .slice(0, 160);
      }
      if (body.avatar_url != null && typeof body.avatar_url === 'string' && body.avatar_url.startsWith('http')) {
        patch.avatar_url = body.avatar_url.slice(0, 500);
      }
      if (Object.keys(patch).length <= 1) {
        return send(res, 400, { ok: false, error: 'Нечего обновлять' });
      }
      const { data, error } = await sb.from('profiles').update(patch).eq('id', uid).select('*').maybeSingle();
      if (error) return send(res, 400, { ok: false, error: error.message });
      return send(res, 200, { ok: true, profile: publicProfile(data) });
    }
    return send(res, 405, { error: 'Method not allowed' }, { Allow: 'GET, PATCH, PUT, POST' });
  }

  if (resource === 'settings') {
    const premium = await loadIsPremium(sb, uid);
    if (req.method === 'GET') {
      const { data, error } = await sb.from('user_settings').select(SETTINGS_COLS).eq('user_id', uid).maybeSingle();
      if (error) return send(res, 400, { ok: false, error: error.message });
      return send(res, 200, { ok: true, settings: rowToSettings(data, premium) });
    }
    if (req.method === 'PUT' || req.method === 'PATCH' || req.method === 'POST') {
      const body = await readBody(req);
      const row = patchToRow(body, premium);
      row.user_id = uid;
      const { data, error } = await sb
        .from('user_settings')
        .upsert(row, { onConflict: 'user_id' })
        .select(SETTINGS_COLS)
        .maybeSingle();
      if (error) return send(res, 400, { ok: false, error: error.message });
      return send(res, 200, { ok: true, settings: rowToSettings(data, premium) });
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  if (resource === 'telegram') {
    const botUsername = getTelegramBotUsername();
    const botId = getTelegramBotId();
    const botReady = !!(botUsername && getTelegramBotToken() && botId);

    if (req.method === 'GET') {
      const { data, error } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
      if (error) return send(res, 400, { ok: false, error: error.message });
      const linked = data?.telegram_id != null;
      return send(res, 200, {
        ok: true,
        botUsername: botReady ? botUsername : '',
        botId: botReady ? botId : '',
        botReady,
        linked,
        telegramUsername: data?.telegram_username
          ? '@' + String(data.telegram_username).replace(/^@+/, '')
          : null,
        trialUsed: !!data?.telegram_trial_used,
        trialDays: TRIAL_DAYS,
        trialAvailable: !linked && !data?.telegram_trial_used,
        profile: publicProfile(data)
      });
    }

    if (req.method === 'POST') {
      if (!botReady) {
        return send(res, 503, { ok: false, error: 'Привязка Telegram временно недоступна' });
      }
      const body = await readBody(req);
      const action = String(body.action || '').toLowerCase();

      // Deep-link bind: open bot in Telegram app → /start TOKEN (no Login Widget / SMS code)
      if (action === 'start_link') {
        const token = createTelegramLinkToken(uid);
        if (!token) return send(res, 400, { ok: false, error: 'Не удалось создать ссылку' });
        const deepLink = buildTelegramDeepLink(botUsername, token);
        if (!deepLink) return send(res, 503, { ok: false, error: 'Бот не настроен' });
        const origin = requestPublicOrigin(req);
        try {
          await ensureTelegramWebhook(origin);
        } catch (_) {
          // Link still works once webhook is set; client can retry
        }
        return send(res, 200, {
          ok: true,
          mode: 'bot_start',
          deepLink,
          botUsername,
          expiresIn: 15 * 60
        });
      }

      // Legacy Login Widget / OIDC payload (optional fallback)
      const verified = await verifyTelegramAuth(body);
      if (!verified.ok) return send(res, 400, { ok: false, error: verified.error });

      let admin;
      try {
        admin = adminClient();
      } catch (e) {
        return send(res, 503, { ok: false, error: 'Сервер не настроен' });
      }

      const result = await applyTelegramLink(admin, uid, verified.telegram);
      if (!result.ok) return send(res, result.status || 400, { ok: false, error: result.error });
      return send(res, 200, {
        ok: true,
        alreadyLinked: !!result.alreadyLinked,
        trialGranted: !!result.trialGranted,
        trialDays: result.trialDays || 0,
        profile: result.profile
      });
    }

    return send(res, 405, { error: 'Method not allowed' }, { Allow: 'GET, POST' });
  }

  send(res, 400, { error: 'Unknown resource. Use profile | settings | avatar | account | accounts | telegram' });
});
