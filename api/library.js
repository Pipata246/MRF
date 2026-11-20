'use strict';

/**
 * Slot: library — likes / follows / albums / playlists / saved playlists / search / recent / history
 * Routes via ?resource=likes|follows|albums|playlists|savedPlaylists|playlistSearch|playlist|recent|history
 */
const { readBody, send, setSessionCookies, withHandler } = require('../lib/http');
const { requireUser, userClient, anonClient } = require('../lib/supabase');

function isManualPlaylistId(id) {
  return String(id || '').startsWith('pl_');
}

function isOwnedSyncItem(p) {
  if (!p || !p.id) return false;
  if (p.origin === 'saved' || p.readOnly) return false;
  return isManualPlaylistId(p.id);
}

function trackKey(t, i) {
  if (!t) return i != null ? `idx_${i}` : '';
  if (t.id != null && String(t.id)) return String(t.id);
  return `${t.title || ''}__${t.artist || t.artistName || ''}`.toLowerCase() || (i != null ? `idx_${i}` : '');
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

function authorFromProfile(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    username: profile.username || '',
    name: profile.display_name || profile.username || ''
  };
}

async function hydratePlaylist(sb, p, opts) {
  const list = await loadPlaylistTracks(sb, p.id);
  const author = opts?.author || null;
  return {
    id: p.id,
    name: p.name,
    description: p.description || '',
    cover: p.cover || null,
    isPublic: !!p.is_public,
    createdAt: p.created_at ? Date.parse(p.created_at) : Date.now(),
    updatedAt: p.updated_at ? Date.parse(p.updated_at) : Date.now(),
    trackCount: list.length,
    tracks: list,
    ownerId: p.user_id || null,
    author: author
      ? authorFromProfile(author)
      : null,
    origin: opts?.origin || 'owned',
    readOnly: !!opts?.readOnly,
    savedAt: opts?.savedAt || null
  };
}

async function loadOwnedPlaylists(sb, uid) {
  const { data: playlists, error } = await sb
    .from('playlists')
    .select('id, user_id, name, description, cover, is_public, created_at, updated_at')
    .eq('user_id', uid)
    .order('updated_at', { ascending: false });
  if (error) throw Object.assign(new Error(error.message), { statusCode: 400 });

  const out = [];
  for (const p of playlists || []) {
    out.push(await hydratePlaylist(sb, p, { origin: 'owned', readOnly: false }));
  }
  return out;
}

async function loadSavedPlaylists(sb, uid) {
  const { data: rows, error } = await sb
    .from('saved_playlists')
    .select('playlist_id, saved_at')
    .eq('user_id', uid)
    .order('saved_at', { ascending: false });
  if (error) throw Object.assign(new Error(error.message), { statusCode: 400 });
  if (!rows?.length) return [];

  const ids = rows.map((r) => r.playlist_id);
  const { data: playlists, error: pErr } = await sb
    .from('playlists')
    .select('id, user_id, name, description, cover, is_public, created_at, updated_at')
    .in('id', ids)
    .eq('is_public', true);
  if (pErr) throw Object.assign(new Error(pErr.message), { statusCode: 400 });

  const ownerIds = [...new Set((playlists || []).map((p) => p.user_id).filter(Boolean))];
  let authorsById = {};
  if (ownerIds.length) {
    const { data: profiles } = await sb
      .from('profiles')
      .select('id, username, display_name')
      .in('id', ownerIds);
    (profiles || []).forEach((pr) => {
      authorsById[pr.id] = pr;
    });
  }

  const savedAtById = {};
  rows.forEach((r) => {
    savedAtById[r.playlist_id] = r.saved_at ? Date.parse(r.saved_at) : Date.now();
  });

  const out = [];
  for (const p of playlists || []) {
    out.push(
      await hydratePlaylist(sb, p, {
        origin: 'saved',
        readOnly: true,
        author: authorsById[p.user_id] || null,
        savedAt: savedAtById[p.id] || null
      })
    );
  }
  // Keep saved_at order
  out.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  return out;
}

async function loadPublicPlaylistById(sb, playlistId, viewerId) {
  const { data: p, error } = await sb
    .from('playlists')
    .select('id, user_id, name, description, cover, is_public, created_at, updated_at')
    .eq('id', String(playlistId))
    .maybeSingle();
  if (error) throw Object.assign(new Error(error.message), { statusCode: 400 });
  if (!p) return null;

  const isOwner = !!(viewerId && p.user_id === viewerId);
  if (!p.is_public && !isOwner) return null;

  let author = null;
  if (p.user_id) {
    const { data: profile } = await sb
      .from('profiles')
      .select('id, username, display_name')
      .eq('id', p.user_id)
      .maybeSingle();
    author = profile || null;
  }

  let savedAt = null;
  if (viewerId && !isOwner && p.is_public) {
    const { data: saved } = await sb
      .from('saved_playlists')
      .select('saved_at')
      .eq('user_id', viewerId)
      .eq('playlist_id', p.id)
      .maybeSingle();
    if (saved?.saved_at) savedAt = Date.parse(saved.saved_at);
  }

  if (isOwner) {
    return hydratePlaylist(sb, p, { origin: 'owned', readOnly: false, author });
  }
  return hydratePlaylist(sb, p, {
    origin: savedAt ? 'saved' : 'public',
    readOnly: true,
    author,
    savedAt
  });
}

async function searchPublicPlaylists(sb, query, limit) {
  const q = String(query || '').trim();
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 40);
  if (q.length < 1) return [];

  let qBuilder = sb
    .from('playlists')
    .select('id, user_id, name, description, cover, is_public, created_at, updated_at')
    .eq('is_public', true)
    .like('id', 'pl\\_%')
    .order('updated_at', { ascending: false })
    .limit(lim);

  const like = `%${q.replace(/[%_]/g, '')}%`;
  if (q.startsWith('@')) {
    const uname = q.slice(1).replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    if (!uname) return [];
    const { data: profiles } = await sb
      .from('profiles')
      .select('id, username, display_name')
      .ilike('username', uname);
    const ids = (profiles || []).map((p) => p.id);
    if (!ids.length) return [];
    const { data: playlists, error } = await sb
      .from('playlists')
      .select('id, user_id, name, description, cover, is_public, created_at, updated_at')
      .eq('is_public', true)
      .like('id', 'pl\\_%')
      .in('user_id', ids)
      .order('updated_at', { ascending: false })
      .limit(lim);
    if (error) throw Object.assign(new Error(error.message), { statusCode: 400 });
    const authorsById = {};
    (profiles || []).forEach((pr) => { authorsById[pr.id] = pr; });
    const out = [];
    for (const p of playlists || []) {
      const item = await hydratePlaylist(sb, p, {
        origin: 'public',
        readOnly: true,
        author: authorsById[p.user_id] || null
      });
      out.push(item);
    }
    return out;
  }

  const { data: playlists, error } = await qBuilder.ilike('name', like);
  if (error) throw Object.assign(new Error(error.message), { statusCode: 400 });

  const ownerIds = [...new Set((playlists || []).map((p) => p.user_id).filter(Boolean))];
  let authorsById = {};
  if (ownerIds.length) {
    const { data: profiles } = await sb
      .from('profiles')
      .select('id, username, display_name')
      .in('id', ownerIds);
    (profiles || []).forEach((pr) => { authorsById[pr.id] = pr; });
  }

  const out = [];
  for (const p of playlists || []) {
    out.push(
      await hydratePlaylist(sb, p, {
        origin: 'public',
        readOnly: true,
        author: authorsById[p.user_id] || null
      })
    );
  }
  return out;
}

module.exports = withHandler(async function library(req, res) {
  const url = new URL(req.url || '/', 'http://local');
  const resource = (url.searchParams.get('resource') || '').toLowerCase();
  if (!resource) {
    return send(res, 400, {
      error: 'resource required: likes|follows|albums|playlists|savedPlaylists|playlistSearch|playlist|recent|history'
    });
  }

  const publicGet =
    req.method === 'GET' && (resource === 'playlistsearch' || resource === 'playlist');

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
      const items = await loadOwnedPlaylists(sb, uid);
      return send(res, 200, { ok: true, items });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const body = await readBody(req);
      if (!Array.isArray(body.items)) {
        return send(res, 400, { ok: false, error: 'items[] required (full playlist sync)' });
      }
      const ownedItems = body.items.filter(isOwnedSyncItem);
      const { data: existing } = await sb.from('playlists').select('id').eq('user_id', uid);
      const keep = new Set(ownedItems.map((p) => String(p.id)));
      const toDelete = (existing || []).map((r) => r.id).filter((id) => !keep.has(String(id)));
      if (toDelete.length) await sb.from('playlists').delete().in('id', toDelete);

      for (const p of ownedItems) {
        const isPublic = p.isPublic !== false;
        const { error: pErr } = await sb.from('playlists').upsert({
          id: String(p.id),
          user_id: uid,
          name: p.name || 'Плейлист',
          description: p.description || '',
          cover: p.cover || null,
          is_public: isPublic,
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

  if (resource === 'savedplaylists') {
    if (req.method === 'GET') {
      const items = await loadSavedPlaylists(sb, uid);
      return send(res, 200, { ok: true, items });
    }
    if (req.method === 'POST' || req.method === 'PUT') {
      const body = await readBody(req);
      const playlistId = String(body.playlistId || body.id || '').trim();
      if (!playlistId || !isManualPlaylistId(playlistId)) {
        return send(res, 400, { ok: false, error: 'playlistId required' });
      }
      const { data: p, error: pErr } = await sb
        .from('playlists')
        .select('id, user_id, is_public')
        .eq('id', playlistId)
        .maybeSingle();
      if (pErr) return send(res, 400, { ok: false, error: pErr.message });
      if (!p || !p.is_public) return send(res, 404, { ok: false, error: 'Плейлист не найден' });
      if (p.user_id === uid) return send(res, 400, { ok: false, error: 'Это ваш плейлист' });

      const { error } = await sb.from('saved_playlists').upsert({
        user_id: uid,
        playlist_id: playlistId,
        saved_at: new Date().toISOString()
      }, { onConflict: 'user_id,playlist_id' });
      if (error) return send(res, 400, { ok: false, error: error.message });

      const item = await loadPublicPlaylistById(sb, playlistId, uid);
      return send(res, 200, { ok: true, saved: true, item });
    }
    if (req.method === 'DELETE') {
      const body = await readBody(req).catch(() => ({}));
      const playlistId = String(body.playlistId || body.id || url.searchParams.get('id') || '').trim();
      if (!playlistId) return send(res, 400, { ok: false, error: 'playlistId required' });
      const { error } = await sb
        .from('saved_playlists')
        .delete()
        .eq('user_id', uid)
        .eq('playlist_id', playlistId);
      if (error) return send(res, 400, { ok: false, error: error.message });
      return send(res, 200, { ok: true, saved: false });
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  if (resource === 'playlistsearch') {
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
    const q = url.searchParams.get('q') || url.searchParams.get('query') || '';
    const limit = url.searchParams.get('limit') || 20;
    const items = await searchPublicPlaylists(sb, q, limit);
    return send(res, 200, { ok: true, items });
  }

  if (resource === 'playlist') {
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
    const id = url.searchParams.get('id') || '';
    if (!id) return send(res, 400, { ok: false, error: 'id required' });
    const item = await loadPublicPlaylistById(sb, id, uid);
    if (!item) return send(res, 404, { ok: false, error: 'Плейлист не найден' });
    return send(res, 200, { ok: true, item });
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

  send(res, 400, {
    error: 'Unknown resource. Use likes|follows|albums|playlists|savedPlaylists|playlistSearch|playlist|recent|history'
  });
});
