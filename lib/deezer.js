'use strict';

const DZ_BASE = 'https://api.deezer.com';
const FETCH_TIMEOUT_MS = 10000;
const MAX_PARALLEL = 10;
/** Cap memory cache so warm serverless instances stay snappy */
const CACHE_MAX = 400;

let active = 0;
const waitQueue = [];
/** @type {Map<string, { exp: number, data: any }>} */
const memCache = new Map();
/** @type {Map<string, Promise<any>>} */
const inflight = new Map();

function pump() {
  while (active < MAX_PARALLEL && waitQueue.length) {
    const job = waitQueue.shift();
    active++;
    job();
  }
}

function runLimited(fn) {
  return new Promise((resolve, reject) => {
    const start = () => {
      Promise.resolve()
        .then(fn)
        .then(
          (v) => {
            active = Math.max(0, active - 1);
            pump();
            resolve(v);
          },
          (e) => {
            active = Math.max(0, active - 1);
            pump();
            reject(e);
          }
        );
    };
    waitQueue.push(start);
    pump();
  });
}

function cacheKey(pathWithQuery) {
  return String(pathWithQuery || '').trim();
}

function ttlMsFor(pathWithQuery) {
  const pathOnly = String(pathWithQuery || '').split('?')[0];
  if (pathOnly.startsWith('/chart/')) return 15 * 60 * 1000;
  if (/^\/(artist|album)\//.test(pathOnly)) return 10 * 60 * 1000;
  if (pathOnly.startsWith('/track/')) return 5 * 60 * 1000;
  if (pathOnly.startsWith('/radio/')) return 3 * 60 * 1000;
  if (pathOnly.startsWith('/search/')) return 90 * 1000;
  if (pathOnly === '/genre') return 60 * 60 * 1000;
  return 2 * 60 * 1000;
}

function isDzErrorPayload(data) {
  return !!(data && data.error && data.id == null && !Array.isArray(data.data));
}

function cacheGet(pathWithQuery) {
  const key = cacheKey(pathWithQuery);
  const hit = memCache.get(key);
  if (!hit) return null;
  if (hit.exp <= Date.now() || isDzErrorPayload(hit.data)) {
    memCache.delete(key);
    return null;
  }
  // LRU touch
  memCache.delete(key);
  memCache.set(key, hit);
  return hit.data;
}

function cacheSet(pathWithQuery, data) {
  if (isDzErrorPayload(data)) return; // never cache Deezer error bodies (quota etc.)
  const key = cacheKey(pathWithQuery);
  if (memCache.size >= CACHE_MAX) {
    const oldest = memCache.keys().next().value;
    if (oldest != null) memCache.delete(oldest);
  }
  memCache.set(key, { exp: Date.now() + ttlMsFor(pathWithQuery), data });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Only allow known Deezer read paths (no open proxy). */
function assertAllowedPath(rawPath) {
  const pathOnly = String(rawPath || '').split('?')[0];
  const ok =
    /^\/search\/(track|artist|album)$/.test(pathOnly) ||
    /^\/chart\/0\/(tracks|albums|artists)$/.test(pathOnly) ||
    /^\/track\/\d+$/.test(pathOnly) ||
    /^\/track\/\d+\/related$/.test(pathOnly) ||
    /^\/artist\/\d+$/.test(pathOnly) ||
    /^\/artist\/\d+\/(top|albums|related|radio)$/.test(pathOnly) ||
    /^\/album\/\d+$/.test(pathOnly) ||
    /^\/album\/\d+\/tracks$/.test(pathOnly) ||
    /^\/radio\/track\/\d+$/.test(pathOnly) ||
    pathOnly === '/genre';
  if (!ok) {
    const err = new Error('Path not allowed');
    err.statusCode = 400;
    throw err;
  }
  return pathOnly;
}

function queryInt(pathWithQuery, key, fallback) {
  try {
    const q = String(pathWithQuery || '').split('?')[1] || '';
    const n = Number(new URLSearchParams(q).get(key));
    if (Number.isFinite(n) && n >= 0) return n;
  } catch (_) {}
  return fallback;
}

function dedupeTrackRows(rows) {
  const out = [];
  const seen = new Set();
  for (const t of rows || []) {
    if (!t || t.id == null) continue;
    const k = String(t.id);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/**
 * Deezer `/artist/:id/top` often returns 1 row from some networks/IPs.
 * Fill from radio + search so artist pages / mixes stay usable.
 */
async function enrichArtistTopIfNeeded(pathWithQuery, data) {
  const m = String(pathWithQuery || '').match(/^\/artist\/(\d+)\/top(?:\?|$)/);
  if (!m) return data;
  const limit = Math.min(100, Math.max(1, queryInt(pathWithQuery, 'limit', 50)));
  const index = Math.max(0, queryInt(pathWithQuery, 'index', 0));
  const rows = Array.isArray(data?.data) ? data.data : [];
  if (rows.length >= Math.min(limit, 10)) return data;

  const aid = m[1];
  let merged = rows.slice();

  try {
    const radio = await fetchDzRaw(`/artist/${aid}/radio`);
    merged = dedupeTrackRows([...merged, ...(radio?.data || [])]);
  } catch (_) {}

  if (merged.length < Math.min(limit, 12)) {
    try {
      const art = await fetchDzRaw(`/artist/${aid}`);
      const name = String(art?.name || '').trim();
      if (name) {
        const [s1, s2] = await Promise.all([
          fetchDzRaw(`/search/track?q=${encodeURIComponent(name)}&limit=25`),
          fetchDzRaw(`/search/track?q=${encodeURIComponent(name)}&limit=25&index=25`)
        ]);
        const searched = [...(s1?.data || []), ...(s2?.data || [])];
        const own = searched.filter((t) => {
          if (String(t?.artist?.id) === String(aid)) return true;
          return String(t?.artist?.name || '').toLowerCase() === name.toLowerCase();
        });
        merged = dedupeTrackRows([...merged, ...own, ...searched]);
      }
    } catch (_) {}
  }

  const page = merged.slice(index, index + limit);
  return {
    data: page,
    total: Math.max(Number(data?.total) || 0, merged.length)
  };
}

function buildUrl(pathWithQuery) {
  const raw = String(pathWithQuery || '');
  if (!raw.startsWith('/')) {
    const err = new Error('Invalid path');
    err.statusCode = 400;
    throw err;
  }
  const qIdx = raw.indexOf('?');
  const pathOnly = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
  const query = qIdx >= 0 ? raw.slice(qIdx + 1) : '';
  assertAllowedPath(pathOnly);
  const url = new URL(DZ_BASE + pathOnly);
  if (query) {
    new URLSearchParams(query).forEach((v, k) => {
      if (k === 'output' || k === 'callback') return;
      url.searchParams.set(k, v);
    });
  }
  return url.toString();
}

async function fetchDzOnce(pathWithQuery) {
  const url = buildUrl(pathWithQuery);
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; MRF/1.0)'
      },
      signal: ctrl.signal
    });
    if (!res.ok) {
      const err = new Error(`Deezer ${res.status}`);
      err.statusCode = 502;
      throw err;
    }
    const data = await res.json();
    if (isDzErrorPayload(data)) {
      const code = data.error?.code;
      const msg = data.error?.message || data.error?.type || 'Deezer error';
      const err = new Error(String(msg));
      err.statusCode = code === 4 ? 429 : 502;
      err.deezerCode = code;
      throw err;
    }
    return data;
  } catch (e) {
    if (e.name === 'AbortError') {
      const err = new Error('timeout');
      err.statusCode = 504;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(tid);
  }
}

/** Raw Deezer GET with retries (quota / transient). */
async function fetchDzRaw(pathWithQuery) {
  return runLimited(async () => {
    let lastErr;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        if (attempt) await sleep(400 * attempt * attempt);
        return await fetchDzOnce(pathWithQuery);
      } catch (e) {
        lastErr = e;
        // retry quota / timeout / 5xx
        const retryable =
          e.statusCode === 429 ||
          e.statusCode === 504 ||
          e.statusCode === 502 ||
          e.deezerCode === 4;
        if (!retryable || attempt === 3) throw e;
      }
    }
    throw lastErr;
  });
}

/**
 * Cached + coalesced Deezer GET (shared by recommendations + music proxy).
 * opts.bypassCache — for preview refresh (library URLs go stale).
 */
async function fetchDz(pathWithQuery, opts) {
  const bypass = !!(opts && opts.bypassCache);
  const key = cacheKey(pathWithQuery);
  if (!bypass) {
    const cached = cacheGet(key);
    if (cached != null) return cached;
    const pending = inflight.get(key);
    if (pending) return pending;
  }
  const job = fetchDzRaw(pathWithQuery)
    .then((data) => enrichArtistTopIfNeeded(pathWithQuery, data))
    .then((data) => {
      cacheSet(key, data);
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });
  if (!bypass) inflight.set(key, job);
  return job;
}

async function dzArr(pathWithQuery) {
  try {
    const j = await fetchDz(pathWithQuery);
    return Array.isArray(j?.data) ? j.data : [];
  } catch {
    return [];
  }
}

async function dzObj(pathWithQuery) {
  try {
    const j = await fetchDz(pathWithQuery);
    if (!j || j.error) return {};
    return j;
  } catch {
    return {};
  }
}

function parseFeatNames(title) {
  const m = String(title || '').match(/\((?:feat\.?|ft\.?|featuring|with)\s+([^)]+)\)/i);
  if (!m) return [];
  return m[1]
    .split(/\s*(?:,|&| x | × | and | и )\s*/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

function uniqArtists(list) {
  const out = [];
  const seen = new Set();
  (list || []).forEach((a) => {
    if (!a) return;
    const name = String(a.name || '').trim();
    if (!name) return;
    const key =
      a.id != null && String(a.id) !== '' && String(a.id) !== '0'
        ? `id:${a.id}`
        : `n:${name.toLowerCase()}`;
    if (seen.has(key)) return;
    const nkey = `n:${name.toLowerCase()}`;
    if (seen.has(nkey) && !String(key).startsWith('id:')) return;
    if (String(key).startsWith('id:')) {
      const idx = out.findIndex((x) => !x.id && (x.name || '').toLowerCase() === name.toLowerCase());
      if (idx >= 0) out.splice(idx, 1);
    }
    seen.add(key);
    seen.add(nkey);
    out.push({
      id: a.id != null && String(a.id) !== '0' ? a.id : null,
      name,
      picture_medium: a.picture_medium || '',
      picture_xl: a.picture_xl || '',
      role: a.role || ''
    });
  });
  return out;
}

function collectArtistsFromDZ(t) {
  const raw = [];
  if (Array.isArray(t?.contributors) && t.contributors.length) {
    const mains = t.contributors.filter((c) => /main/i.test(c.role || ''));
    const rest = t.contributors.filter((c) => !/main/i.test(c.role || ''));
    if (mains.length) raw.push(...mains, ...rest);
    else raw.push(...t.contributors);
  }
  if (t?.artist?.name) raw.push(t.artist);
  parseFeatNames(t?.title || t?.name || '').forEach((name) => raw.push({ name, id: null }));
  return uniqArtists(raw);
}

/** Drop audiobooks / podcasts / spoken chapters from music feeds. */
function isSpokenOrNonMusic(t) {
  if (!t) return true;
  const title = String(t.title || t.name || '').trim();
  const artist = String(
    t.artist?.name || t.artistName || (typeof t.artist === 'string' ? t.artist : '') || ''
  ).trim();
  const album = String(t.album?.title || '').trim();
  const blob = `${title} ${artist} ${album}`.toLowerCase();
  if (!title) return true;
  if (/^(часть|глава|chapter|part|episode|эпизод|выпуск)\s*[\d№#]/i.test(title)) return true;
  if (/\b(часть|глава|chapter|part|episode|эпизод)\s*[\d№#]+\b/i.test(title) && title.length > 28) {
    return true;
  }
  if (
    /\b(аудиокниг|audiobook|podcast|подкаст|spoken[\s-]?word|лекци[яи]|рассказ\b|отрывок|ветеринарн)\b/i.test(
      blob
    )
  ) {
    return true;
  }
  if (/\b(meditation guidance|guided meditation|sleep story|bedtime story)\b/i.test(blob)) {
    return true;
  }
  if (/^про\s+/i.test(title) && title.length > 48) return true;
  if (title.length > 90 && /\b(врач|здоровье|книг|рассказ|истори[яи])\b/i.test(title)) return true;
  return false;
}

function normTrack(t) {
  if (!t || t.id == null) return null;
  if (isSpokenOrNonMusic(t)) return null;
  const artists = collectArtistsFromDZ(t);
  const primary = artists[0] || {
    id: t.artist?.id,
    name: t.artist?.name || '',
    picture_medium: t.artist?.picture_medium || '',
    picture_xl: t.artist?.picture_xl || ''
  };
  return {
    id: `dz_${t.id}`,
    deezerId: t.id,
    title: t.title || t.name || '',
    artist: {
      id: primary.id,
      name: primary.name || '',
      picture_medium: primary.picture_medium || t.artist?.picture_medium || '',
      picture_xl: primary.picture_xl || t.artist?.picture_xl || ''
    },
    artists,
    album: {
      id: t.album?.id,
      title: t.album?.title || '',
      cover_small: t.album?.cover_small || '',
      cover_medium: t.album?.cover_medium || '',
      cover_big: t.album?.cover_big || '',
      cover_xl: t.album?.cover_xl || '',
      cover: t.album?.cover_xl || t.album?.cover_big || t.album?.cover_medium || t.album?.cover || ''
    },
    duration: t.duration || 0,
    preview: t.preview || null,
    fullTrack: false,
    source: 'deezer'
  };
}

function deezerIdOf(t) {
  if (!t) return '';
  if (t.deezerId != null && String(t.deezerId)) return String(t.deezerId).replace(/^dz_/i, '');
  const id = String(t.id || '');
  if (/^dz_\d+$/i.test(id)) return id.replace(/^dz_/i, '');
  if (/^\d+$/.test(id)) return id;
  return '';
}

function samePlayableTrack(a, b) {
  if (!a || !b) return false;
  if (a.id != null && b.id != null && String(a.id) === String(b.id)) return true;
  const ad = a.deezerId || String(a.id || '').replace(/^dz_/i, '');
  const bd = b.deezerId || String(b.id || '').replace(/^dz_/i, '');
  if (ad && bd && String(ad) === String(bd)) return true;
  const at = String(a.title || '').trim().toLowerCase();
  const bt = String(b.title || '').trim().toLowerCase();
  if (!at || at !== bt) return false;
  const aa = String(a.artistName || a.artist?.name || a.artist || '')
    .trim()
    .toLowerCase();
  const ba = String(b.artistName || b.artist?.name || b.artist || '')
    .trim()
    .toLowerCase();
  return !!aa && aa === ba;
}

/** Resolve a working preview for a saved track payload. */
async function resolvePreview(t) {
  if (!t) return null;
  const out = { ...t };
  const oldPreview = out.preview || '';
  const dzId = deezerIdOf(out);
  if (dzId && /^\d+$/.test(dzId)) {
    const raw = await fetchDz(`/track/${dzId}`, { bypassCache: true });
    if (raw && !raw.error && raw.preview) {
      out.preview = raw.preview;
      out.deezerId = raw.id || out.deezerId;
      if (!out.id || String(out.id) === String(dzId) || /^\d+$/.test(String(out.id))) {
        out.id = `dz_${raw.id}`;
      }
      if (raw.album) {
        out.album = out.album || raw.album;
        out.cover = raw.album.cover_medium || raw.album.cover || out.cover;
      }
      if (raw.title) out.title = out.title || raw.title;
      if (raw.artist) {
        out.artist =
          out.artist && typeof out.artist === 'object'
            ? { ...out.artist, ...raw.artist }
            : raw.artist;
        out.artistName = out.artistName || raw.artist.name;
      }
      if (!oldPreview || out.preview !== oldPreview) return out;
    }
  }
  const artist =
    out.artistName ||
    out.artist?.name ||
    (typeof out.artist === 'string' ? out.artist : '') ||
    '';
  const q = `${out.title || ''} ${artist}`.trim();
  if (!q) return out.preview ? out : null;
  const found = (await dzArr(`/search/track?q=${encodeURIComponent(q)}&limit=10`))
    .map(normTrack)
    .filter(Boolean);
  const hit =
    (oldPreview
      ? found.find((x) => x.preview && x.preview !== oldPreview && samePlayableTrack(x, out))
      : null) ||
    found.find((x) => samePlayableTrack(x, out) && x.preview) ||
    (oldPreview ? found.find((x) => x.preview && x.preview !== oldPreview) : null) ||
    found.find((x) => {
      const xt = String(x.title || '')
        .trim()
        .toLowerCase();
      const tt = String(out.title || '')
        .trim()
        .toLowerCase();
      return xt && tt && xt === tt && x.preview;
    }) ||
    found.find((x) => x.preview);
  if (hit) {
    out.preview = hit.preview;
    out.deezerId = hit.deezerId || out.deezerId;
    if (!out.id) out.id = hit.id;
    if (hit.album) out.album = out.album || hit.album;
    return out;
  }
  return out.preview ? out : null;
}

module.exports = {
  fetchDz,
  dzArr,
  dzObj,
  normTrack,
  isSpokenOrNonMusic,
  deezerIdOf,
  samePlayableTrack,
  resolvePreview,
  assertAllowedPath
};
