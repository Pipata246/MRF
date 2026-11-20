'use strict';

/**
 * Slot: me — profile + settings (one domain = one Vercel file)
 * Routes via ?resource=profile|settings  (default: profile)
 * Username is never writable here (immutable in DB).
 */
const { readBody, send, setSessionCookies, withHandler } = require('../lib/http');
const { requireUser, userClient } = require('../lib/supabase');
const { publicProfile } = require('../lib/auth-utils');

const SETTINGS_COLS =
  'theme, accent_dark, accent_light, autoplay, shuffle_on_play, remember_position, crossfade_seconds, show_explicit, settings';

function rowToSettings(row) {
  if (!row) {
    return {
      theme: 'dark',
      accentColorDark: '#EE90B7',
      accentColorLight: '#27ae60',
      accentColor: '#EE90B7',
      autoplay: false,
      shuffleOnPlay: false,
      rememberPosition: true,
      crossfadeSeconds: 0,
      showExplicit: true
    };
  }
  const theme = row.theme === 'light' ? 'light' : 'dark';
  const accentDark = row.accent_dark || '#EE90B7';
  const accentLight = row.accent_light || '#27ae60';
  return {
    theme,
    accentColorDark: accentDark,
    accentColorLight: accentLight,
    accentColor: theme === 'light' ? accentLight : accentDark,
    autoplay: !!row.autoplay,
    shuffleOnPlay: !!row.shuffle_on_play,
    rememberPosition: row.remember_position !== false,
    crossfadeSeconds: Math.max(0, Math.min(12, Number(row.crossfade_seconds) || 0)),
    showExplicit: true
  };
}

function patchToRow(body) {
  const src = body.settings && typeof body.settings === 'object' ? { ...body, ...body.settings } : body;
  const row = { updated_at: new Date().toISOString() };
  if (src.theme === 'dark' || src.theme === 'light') row.theme = src.theme;
  if (src.accentColorDark != null || src.accent_dark != null) {
    row.accent_dark = String(src.accentColorDark || src.accent_dark).slice(0, 16);
  }
  if (src.accentColorLight != null || src.accent_light != null) {
    row.accent_light = String(src.accentColorLight || src.accent_light).slice(0, 16);
  }
  if (src.accentColor != null && row.theme) {
    if (row.theme === 'light') row.accent_light = String(src.accentColor).slice(0, 16);
    else row.accent_dark = String(src.accentColor).slice(0, 16);
  } else if (src.accentColor != null && src.theme === 'light') {
    row.accent_light = String(src.accentColor).slice(0, 16);
  } else if (src.accentColor != null) {
    row.accent_dark = String(src.accentColor).slice(0, 16);
  }
  if (typeof src.autoplay === 'boolean') row.autoplay = src.autoplay;
  if (typeof src.shuffleOnPlay === 'boolean') row.shuffle_on_play = src.shuffleOnPlay;
  if (typeof src.rememberPosition === 'boolean') row.remember_position = src.rememberPosition;
  if (src.crossfadeSeconds != null) {
    row.crossfade_seconds = Math.max(0, Math.min(12, Number(src.crossfadeSeconds) || 0));
  }
  // Explicit always on — ignore client toggles
  row.show_explicit = true;
  return row;
}

module.exports = withHandler(async function me(req, res) {
  const url = new URL(req.url || '/', 'http://local');
  const resource = (url.searchParams.get('resource') || 'profile').toLowerCase();

  const auth = await requireUser(req);
  if (auth.session) setSessionCookies(res, auth.session);
  const sb = userClient(auth.accessToken);
  const uid = auth.user.id;

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
      // Username is immutable — ignore any username field from client
      const patch = { updated_at: new Date().toISOString() };
      if (body.name != null || body.displayName != null) {
        const name = String(body.name || body.displayName || '').trim().slice(0, 64);
        if (!name) return send(res, 400, { ok: false, error: 'Укажи имя' });
        patch.display_name = name;
      }
      // Do not accept raw data-URL avatars here — use ?resource=avatar
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
    if (req.method === 'GET') {
      const { data, error } = await sb.from('user_settings').select(SETTINGS_COLS).eq('user_id', uid).maybeSingle();
      if (error) return send(res, 400, { ok: false, error: error.message });
      return send(res, 200, { ok: true, settings: rowToSettings(data) });
    }
    if (req.method === 'PUT' || req.method === 'PATCH' || req.method === 'POST') {
      const body = await readBody(req);
      const row = patchToRow(body);
      row.user_id = uid;
      const { data, error } = await sb
        .from('user_settings')
        .upsert(row, { onConflict: 'user_id' })
        .select(SETTINGS_COLS)
        .maybeSingle();
      if (error) return send(res, 400, { ok: false, error: error.message });
      return send(res, 200, { ok: true, settings: rowToSettings(data) });
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  send(res, 400, { error: 'Unknown resource. Use profile | settings | avatar' });
});
