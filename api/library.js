'use strict';

/**
 * Slot: library — likes / follows / albums / playlists / recent / history
 * Routes via ?resource=likes|follows|albums|playlists|recent|history
 */
const { readBody, send, setSessionCookies, withHandler } = require('../lib/http');
const { requireUser, userClient } = require('../lib/supabase');

function trackKey(t, i) {
  if (!t) return i != null ? `idx_${i}` : '';
  if (t.id != null && String(t.id)) return String(t.id);
  return `${t.title || ''}__${t.artist || t.artistName || ''}`.toLowerCase() || (i != null ? `idx_${i}` : '');
}

async function loadPlaylists(sb, uid) {
  const { data: playlists, error } = await sb
    .from('playlists')
    .select('id, name, description, cover, is_public, created_at, updated_at')
    .eq('user_id', uid)
    .order('updated_at', { ascending: false });
  if (error) throw Object.assign(new Error(error.message), { statusCode: 400 });

  const out = [];
  for (const p of (playlists || [])) {
    const { data: tracks } = await sb
      .from('playlist_tracks')
      .select('payload, position, added_at')
      .eq('playlist_id', p.id)
      .order('position', { ascending: true });
    const list = (tracks || []).map((t) => ({
      ...(t.payload || {}),
      addedAt: t.added_at ? Date.parse(t.added_at) : Date.now()
    }));
    out.push({
      id: p.id,
      name: p.name,
      description: p.description || '',
      cover: p.cover || null,
      isPublic: !!p.is_public,
      createdAt: p.created_at ? Date.parse(p.created_at) : Date.now(),
      trackCount: list.length,
      tracks: list
    });
  }
  return out;
}

module.exports = withHandler(async function library(req, res) {
  const url = new URL(req.url || '/', 'http://local');
  const resource = (url.searchParams.get('resource') || '').toLowerCase();
  if (!resource) {
    return send(res, 400, { error: 'resource required: likes|follows|albums|playlists|recent|history' });
  }

  const auth = await requireUser(req);
  if (auth.session) setSessionCookies(res, auth.session);
  const sb = userClient(auth.accessToken);
  const uid = auth.user.id;

  if (resource === 'likes') {
    if (req.method === 'GET') {
      const { data, error } = await sb
        .from('liked_tracks')
        .select('payload, added_at')
        .eq('user_id', uid)
        .order('added_at', { ascending: false });
      if (error) return send(res, 400, { ok: false, error: error.message });
      const items = (data || []).map((r) => ({
        ...(r.payload || {}),
        addedAt: r.added_at ? Date.parse(r.added_at) : Date.now()
      }));
      return send(res, 200, { ok: true, items });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const body = await readBody(req);
      if (Array.isArray(body.items)) {
        await sb.from('liked_tracks').delete().eq('user_id', uid);
        const rows = body.items.map((f) => ({
          user_id: uid,
          track_key: trackKey(f),
          payload: f,
          added_at: f.addedAt ? new Date(f.addedAt).toISOString() : new Date().toISOString()
        })).filter((r) => r.track_key);
        if (rows.length) {
          const { error } = await sb.from('liked_tracks').upsert(rows, { onConflict: 'user_id,track_key' });
          if (error) return send(res, 400, { ok: false, error: error.message });
        }
        return send(res, 200, { ok: true });
      }
      const track = body.track || body;
      const key = trackKey(track);
      if (!key) return send(res, 400, { ok: false, error: 'Invalid track' });
      if (body.remove) {
        const { error } = await sb.from('liked_tracks').delete().eq('user_id', uid).eq('track_key', key);
        if (error) return send(res, 400, { ok: false, error: error.message });
        return send(res, 200, { ok: true, liked: false });
      }
      const { error } = await sb.from('liked_tracks').upsert({
        user_id: uid,
        track_key: key,
        payload: track,
        added_at: new Date().toISOString()
      }, { onConflict: 'user_id,track_key' });
      if (error) return send(res, 400, { ok: false, error: error.message });
      return send(res, 200, { ok: true, liked: true });
    }
    if (req.method === 'DELETE') {
      const body = await readBody(req).catch(() => ({}));
      const key = body.track_key || trackKey(body.track || body);
      if (!key) return send(res, 400, { ok: false, error: 'track_key required' });
      const { error } = await sb.from('liked_tracks').delete().eq('user_id', uid).eq('track_key', key);
      if (error) return send(res, 400, { ok: false, error: error.message });
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  if (resource === 'follows') {
    if (req.method === 'GET') {
      const { data, error } = await sb
        .from('followed_artists')
        .select('payload, added_at')
        .eq('user_id', uid)
        .order('added_at', { ascending: false });
      if (error) return send(res, 400, { ok: false, error: error.message });
      return send(res, 200, { ok: true, items: (data || []).map((r) => r.payload || {}) });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const body = await readBody(req);
      if (!Array.isArray(body.items)) return send(res, 400, { ok: false, error: 'items[] required' });
      await sb.from('followed_artists').delete().eq('user_id', uid);
      const rows = body.items.map((a) => ({
        user_id: uid,
        artist_key: String(a.id || ''),
        payload: a,
        added_at: new Date().toISOString()
      })).filter((r) => r.artist_key);
      if (rows.length) {
        const { error } = await sb.from('followed_artists').upsert(rows, { onConflict: 'user_id,artist_key' });
        if (error) return send(res, 400, { ok: false, error: error.message });
      }
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  if (resource === 'albums') {
    if (req.method === 'GET') {
      const { data, error } = await sb
        .from('saved_albums')
        .select('payload, saved_at')
        .eq('user_id', uid)
        .order('saved_at', { ascending: false });
      if (error) return send(res, 400, { ok: false, error: error.message });
      const items = (data || []).map((r) => ({
        ...(r.payload || {}),
        savedAt: r.saved_at ? Date.parse(r.saved_at) : Date.now()
      }));
      return send(res, 200, { ok: true, items });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const body = await readBody(req);
      if (!Array.isArray(body.items)) return send(res, 400, { ok: false, error: 'items[] required' });
      await sb.from('saved_albums').delete().eq('user_id', uid);
      const rows = body.items.map((a) => ({
        user_id: uid,
        album_key: String(a.id || ''),
        payload: a,
        saved_at: a.savedAt ? new Date(a.savedAt).toISOString() : new Date().toISOString()
      })).filter((r) => r.album_key);
      if (rows.length) {
        const { error } = await sb.from('saved_albums').upsert(rows, { onConflict: 'user_id,album_key' });
        if (error) return send(res, 400, { ok: false, error: error.message });
      }
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  if (resource === 'playlists') {
    if (req.method === 'GET') {
      const items = await loadPlaylists(sb, uid);
      return send(res, 200, { ok: true, items });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const body = await readBody(req);
      if (!Array.isArray(body.items)) {
        return send(res, 400, { ok: false, error: 'items[] required (full playlist sync)' });
      }
      const { data: existing } = await sb.from('playlists').select('id').eq('user_id', uid);
      const keep = new Set(body.items.map((p) => String(p.id)));
      const toDelete = (existing || []).map((r) => r.id).filter((id) => !keep.has(String(id)));
      if (toDelete.length) await sb.from('playlists').delete().in('id', toDelete);

      for (const p of body.items) {
        const { error: pErr } = await sb.from('playlists').upsert({
          id: String(p.id),
          user_id: uid,
          name: p.name || 'Плейлист',
          description: p.description || '',
          cover: p.cover || null,
          is_public: !!p.isPublic,
          created_at: p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        if (pErr) return send(res, 400, { ok: false, error: pErr.message });

        await sb.from('playlist_tracks').delete().eq('playlist_id', String(p.id));
        const tracks = Array.isArray(p.tracks) ? p.tracks : [];
        if (!tracks.length) continue;
        const rows = tracks.map((t, i) => ({
          playlist_id: String(p.id),
          track_key: trackKey(t, i),
          payload: t,
          position: i,
          added_at: t.addedAt ? new Date(t.addedAt).toISOString() : new Date().toISOString()
        }));
        const { error: tErr } = await sb.from('playlist_tracks').insert(rows);
        if (tErr) return send(res, 400, { ok: false, error: tErr.message });
      }
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  if (resource === 'recent') {
    if (req.method === 'GET') {
      const { data, error } = await sb
        .from('recent_plays')
        .select('payload, played_at')
        .eq('user_id', uid)
        .order('played_at', { ascending: false })
        .limit(40);
      if (error) return send(res, 400, { ok: false, error: error.message });
      const items = (data || []).map((r) => ({
        ...(r.payload || {}),
        addedAt: r.played_at ? Date.parse(r.played_at) : Date.now()
      }));
      return send(res, 200, { ok: true, items });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const body = await readBody(req);
      if (Array.isArray(body.items)) {
        await sb.from('recent_plays').delete().eq('user_id', uid);
        const rows = body.items.slice(0, 40).map((f) => ({
          user_id: uid,
          track_key: trackKey(f),
          payload: f,
          played_at: f.addedAt ? new Date(f.addedAt).toISOString() : new Date().toISOString()
        })).filter((r) => r.track_key);
        if (rows.length) {
          const { error } = await sb.from('recent_plays').upsert(rows, { onConflict: 'user_id,track_key' });
          if (error) return send(res, 400, { ok: false, error: error.message });
        }
        return send(res, 200, { ok: true });
      }
      const track = body.track || body;
      const key = trackKey(track);
      if (!key) return send(res, 400, { ok: false, error: 'track required' });
      const { error } = await sb.from('recent_plays').upsert({
        user_id: uid,
        track_key: key,
        payload: track,
        played_at: new Date().toISOString()
      }, { onConflict: 'user_id,track_key' });
      if (error) return send(res, 400, { ok: false, error: error.message });
      return send(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') {
      await sb.from('recent_plays').delete().eq('user_id', uid);
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  if (resource === 'history') {
    if (req.method === 'GET') {
      const { data, error } = await sb
        .from('search_history')
        .select('query, searched_at')
        .eq('user_id', uid)
        .order('searched_at', { ascending: false })
        .limit(20);
      if (error) return send(res, 400, { ok: false, error: error.message });
      const items = (data || []).map((r) => String(r.query || '').trim()).filter(Boolean);
      return send(res, 200, { ok: true, items });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const body = await readBody(req);
      if (Array.isArray(body.items)) {
        await sb.from('search_history').delete().eq('user_id', uid);
        const now = Date.now();
        const rows = body.items.slice(0, 20).map((q, i) => {
          const query = String(q || '').trim();
          if (query.length < 2) return null;
          return {
            user_id: uid,
            query,
            searched_at: new Date(now - i * 1000).toISOString()
          };
        }).filter(Boolean);
        if (rows.length) {
          const { error } = await sb.from('search_history').upsert(rows, { onConflict: 'user_id,query' });
          if (error) return send(res, 400, { ok: false, error: error.message });
        }
        return send(res, 200, { ok: true });
      }
      const query = String(body.query || body.q || '').trim();
      if (query.length < 2) return send(res, 400, { ok: false, error: 'query required' });
      const { error } = await sb.from('search_history').upsert({
        user_id: uid,
        query,
        searched_at: new Date().toISOString()
      }, { onConflict: 'user_id,query' });
      if (error) return send(res, 400, { ok: false, error: error.message });
      return send(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') {
      const body = await readBody(req).catch(() => ({}));
      const query = String(body?.query || url.searchParams.get('query') || '').trim();
      if (query) {
        await sb.from('search_history').delete().eq('user_id', uid).eq('query', query);
      } else {
        await sb.from('search_history').delete().eq('user_id', uid);
      }
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  send(res, 400, { error: 'Unknown resource. Use likes|follows|albums|playlists|recent|history' });
});
