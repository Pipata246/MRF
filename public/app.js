/* =====================================================
   NOVALIBER — Music Streaming
   API:   Deezer JSONP  (каталог / превью) + /api (auth / library / recs)
   Audio: HTML5 Audio   (30-сек превью Deezer)
   DB:    Supabase via /api
   ===================================================== */

const DZ = 'https://api.deezer.com';
const API_BASE = window.location.origin;

// Генерируем простой user_id (можно заменить на реальную авторизацию)
const USER_ID = localStorage.getItem('mrf_user_id') || 'user_' + Math.random().toString(36).substr(2, 9);
if (!localStorage.getItem('mrf_user_id')) localStorage.setItem('mrf_user_id', USER_ID);

/* ══ Audio ══ */
const audio = new Audio();
audio.volume = 0.7;

/* ══ State ══ */
let queue        = [];
let queueIndex   = -1;
let isPlaying    = false;
let isShuffle    = false;
let _originalQueue = []; // оригинальный порядок для восстановления
let isRepeat     = 'off'; // 'off' | 'all' | 'one'
let isMuted      = false;
let volume       = 0.7;
let currentTab   = 'tracks';
let searchTimer  = null;
const _src       = {};
let _cbId        = 0;

let favourites   = Store.getFavs();
let recentTracks = Store.getRecent();

/** Intent to keep playing across full page navigations (pause-on-unload must not clear this) */
let _wantPlaying = false;
/** Playback source key/label for FS «Сейчас играет» subtitle */
let currentSrcKey = '';
let currentSrcLabel = '';
window.currentSrcKey = '';
window.currentSrcLabel = '';
let _persistPosTimer = null;
let _audioBound = false;
let _navHandlersBound = false;
/** Ignore pause UI while swapping track src (pause→load→play) */
let _switchingTrack = false;
/** Bumps on every playNow to ignore stale play/error callbacks */
let _playToken = 0;

/* ══════════════════════════════════
   INIT (multipage-safe)
   Shell (sidebar/player) injects via initShared() on each page.
══════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  bindAudio();
  bindNavPersist();
  // Search inputs live only on search/legacy SPA markup — bind only if present
  bindSearch();
  updateFavBadge();
});

/** Called from initShared() after player DOM is injected */
function bindPlayerUIControls() {
  const progress = el('progress-track');
  if (progress && !progress.dataset.bound) {
    progress.dataset.bound = '1';
    let dragging = false;
    let rect = null;
    const getPct = clientX => Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const applyPct = pct => {
      const fill = el('progress-fill');
      if (!fill) return;
      fill.style.transition = 'none';
      fill.style.width = (pct * 100) + '%';
      const tc = el('time-current');
      if (tc) tc.textContent = fmt((audio.duration || 0) * pct);
    };
    progress.addEventListener('pointerdown', e => {
      dragging = true;
      rect = progress.getBoundingClientRect();
      progress.setPointerCapture(e.pointerId);
      applyPct(getPct(e.clientX));
      e.preventDefault();
    });
    progress.addEventListener('pointermove', e => {
      if (!dragging) return;
      applyPct(getPct(e.clientX));
    });
    progress.addEventListener('pointerup', e => {
      if (!dragging) return;
      dragging = false;
      if (audio.duration) audio.currentTime = audio.duration * getPct(e.clientX);
      requestAnimationFrame(() => {
        const fill = el('progress-fill');
        if (fill) fill.style.transition = '';
      });
    });
    progress.addEventListener('pointercancel', () => { dragging = false; });
  }

  const vol = el('volume-track');
  if (vol && !vol.dataset.bound) {
    vol.dataset.bound = '1';
    let dragging = false;
    let rect = null;
    const getVol = clientX => Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const applyVol = v => {
      volume = v; isMuted = v === 0; audio.volume = v;
      const vf = el('volume-fill');
      if (vf) vf.style.width = (v * 100) + '%';
      updateVolumeIcon();
      Store.setPlayerState({ volume: Math.round(volume * 100), muted: isMuted });
    };
    vol.addEventListener('pointerdown', e => {
      dragging = true;
      rect = vol.getBoundingClientRect();
      vol.setPointerCapture(e.pointerId);
      applyVol(getVol(e.clientX));
      e.preventDefault();
    });
    vol.addEventListener('pointermove', e => {
      if (!dragging) return;
      applyVol(getVol(e.clientX));
    });
    vol.addEventListener('pointerup', () => { dragging = false; });
    vol.addEventListener('pointercancel', () => { dragging = false; });
  }
}
window.bindPlayerUIControls = bindPlayerUIControls;

/* ══════════════════════════════════
   DEEZER JSONP
══════════════════════════════════ */
/* Limit parallel JSONP — too many at once = timeouts / empty pages */
const _dzMaxParallel = 5;
let _dzActive = 0;
const _dzWait = [];
function _dzPump() {
  while (_dzActive < _dzMaxParallel && _dzWait.length) {
    const job = _dzWait.shift();
    _dzActive++;
    job();
  }
}

function dz(path) {
  return new Promise((resolve, reject) => {
    const start = () => {
      const cb  = '__dz' + (++_cbId);
      const tag = document.createElement('script');
      let done = false;
      const finish = (fn, arg) => {
        if (done) return;
        done = true;
        clearTimeout(tid);
        try { delete window[cb]; } catch {}
        try { tag.remove(); } catch {}
        _dzActive = Math.max(0, _dzActive - 1);
        _dzPump();
        fn(arg);
      };
      const tid = setTimeout(() => finish(reject, new Error('timeout')), 10000);
      window[cb] = data => finish(resolve, data);
      tag.onerror = () => finish(reject, new Error('error'));
      const sep = path.includes('?') ? '&' : '?';
      tag.src = `${DZ}${path}${sep}callback=${cb}&output=jsonp`;
      document.head.appendChild(tag);
    };
    _dzWait.push(start);
    _dzPump();
  });
}

/* data[] из ответа */
async function dzArr(path) {
  try { const j = await dz(path); return j.data || []; }
  catch { return []; }
}

/* объект из ответа (артист, альбом) */
async function dzObj(path) {
  try {
    const j = await dz(path);
    if (!j || j.error) return {};
    return j;
  } catch { return {}; }
}

/* ══════════════════════════════════
   NORMALISE Deezer track (+ multi-artist)
══════════════════════════════════ */
function parseFeatNames(title) {
  const m = String(title || '').match(/\((?:feat\.?|ft\.?|featuring|with)\s+([^)]+)\)/i);
  if (!m) return [];
  return m[1]
    .split(/\s*(?:,|&| x | × | and | и )\s*/i)
    .map(s => s.trim())
    .filter(s => s.length > 1);
}

function uniqArtists(list) {
  const out = [];
  const seen = new Set();
  (list || []).forEach(a => {
    if (!a) return;
    const name = String(a.name || '').trim();
    if (!name) return;
    const key = (a.id != null && String(a.id) !== '' && String(a.id) !== '0')
      ? `id:${a.id}`
      : `n:${name.toLowerCase()}`;
    if (seen.has(key)) return;
    // also skip name dup when same person listed with/without id
    const nkey = `n:${name.toLowerCase()}`;
    if (seen.has(nkey) && !String(key).startsWith('id:')) return;
    if (String(key).startsWith('id:')) {
      // drop earlier name-only duplicate
      const idx = out.findIndex(x => !x.id && (x.name || '').toLowerCase() === name.toLowerCase());
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
    // Main first, then Featured / others — stable order
    const mains = t.contributors.filter(c => /main/i.test(c.role || ''));
    const rest = t.contributors.filter(c => !/main/i.test(c.role || ''));
    if (mains.length) raw.push(...mains, ...rest);
    else raw.push(...t.contributors);
  }
  if (t?.artist?.name) raw.push(t.artist);
  parseFeatNames(t?.title || t?.name || '').forEach(name => raw.push({ name, id: null }));
  return uniqArtists(raw);
}

function trackArtists(t) {
  if (!t) return [];
  if (Array.isArray(t.artists) && t.artists.length) return t.artists;
  if (t.artist?.name) return [{ id: t.artist.id || null, name: t.artist.name, picture_medium: t.artist.picture_medium || '', picture_xl: t.artist.picture_xl || '' }];
  if (typeof t.artist === 'string' && t.artist) return [{ id: null, name: t.artist }];
  return [];
}
window.parseFeatNames = parseFeatNames;
window.uniqArtists = uniqArtists;
window.trackArtists = trackArtists;

function formatArtistsText(t) {
  const arts = trackArtists(t);
  if (!arts.length) return '';
  if (arts.length === 1) return arts[0].name;
  if (arts.length === 2) return `${arts[0].name} & ${arts[1].name}`;
  return arts.slice(0, -1).map(a => a.name).join(', ') + ' & ' + arts[arts.length - 1].name;
}
window.formatArtistsText = formatArtistsText;

function artistsLinksHTML(t, cls = 'artist-link') {
  const arts = trackArtists(t);
  if (!arts.length) return '—';
  const escFn = typeof escHtml === 'function' ? escHtml : (s => String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])));
  // Mobile / tablet: plain text only — no navigate-from-name (PC only)
  const mobileUi = (typeof isMobileLayout === 'function')
    ? isMobileLayout()
    : (document.documentElement.getAttribute('data-ui') === 'mobile');
  if (mobileUi) {
    return arts.map((a, i) => {
      let sep = '';
      if (i > 0) sep = (i === arts.length - 1) ? ' <span class="artist-sep">&</span> ' : '<span class="artist-sep">,</span> ';
      return `${sep}<span class="artist-name-plain">${escFn(a.name)}</span>`;
    }).join('');
  }
  const js = typeof jsStr === 'function' ? jsStr : (s => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
  return arts.map((a, i) => {
    let sep = '';
    if (i > 0) sep = (i === arts.length - 1) ? ' <span class="artist-sep">&</span> ' : '<span class="artist-sep">,</span> ';
    const idArg = a.id != null && String(a.id) !== '' ? `'${js(a.id)}'` : 'null';
    return `${sep}<a href="#" class="${cls}" data-artist-id="${escFn(a.id || '')}" data-artist-name="${escFn(a.name)}" onclick="event.preventDefault();event.stopPropagation();openArtist(${idArg},'${js(a.name)}',true)">${escFn(a.name)}</a>`;
  }).join('');
}
window.artistsLinksHTML = artistsLinksHTML;

/* Kill leftover track-name artist links on mobile (already rendered HTML) */
document.addEventListener('click', (e) => {
  const mobileUi = (typeof isMobileLayout === 'function')
    ? isMobileLayout()
    : (document.documentElement.getAttribute('data-ui') === 'mobile');
  if (!mobileUi) return;
  const link = e.target.closest?.('a.artist-link, a.track-artist-link, a.player-artist-link');
  if (!link) return;
  // Allow only if it's not a track-row / search-result name link
  if (link.closest('.track-item, .track-row, .track-artist, .search-result, .search-flyout-track, .liked-track, .np-meta, .queue-item')) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);

async function enrichTrackArtists(t) {
  if (!t || t._artistsEnriched) return t;
  const deezerId = t.deezerId || String(t.id || '').replace(/^dz_/i, '');
  let fromApi = [];
  if (deezerId && /^\d+$/.test(String(deezerId))) {
    try {
      const full = await dzObj(`/track/${deezerId}`);
      if (full && !full.error) {
        if (Array.isArray(full.contributors) && full.contributors.length) fromApi = full.contributors;
        else if (full.artist) fromApi = [full.artist];
        if (full.title && !t.title) t.title = full.title;
        // Keep preview fresh — saved library/recent URLs often expire
        if (full.preview) t.preview = full.preview;
      }
    } catch (_) {}
  }
  const merged = uniqArtists([
    ...fromApi,
    ...(t.artists || []),
    t.artist,
    ...parseFeatNames(t.title || '').map(name => ({ name, id: null }))
  ]);
  // Resolve missing ids for feat. names (best-effort, limit 4)
  const need = merged.filter(a => !a.id).slice(0, 4);
  await Promise.all(need.map(async a => {
    try {
      const found = await dzArr(`/search/artist?q=${encodeURIComponent(a.name)}&limit=5`);
      const exact = found.find(x => (x.name || '').toLowerCase() === a.name.toLowerCase()) || found[0];
      if (exact?.id) {
        a.id = exact.id;
        a.picture_medium = a.picture_medium || exact.picture_medium || '';
        a.picture_xl = a.picture_xl || exact.picture_xl || '';
      }
    } catch (_) {}
  }));
  t.artists = uniqArtists(merged);
  if (t.artists[0]) {
    t.artist = {
      id: t.artists[0].id,
      name: t.artists[0].name,
      picture_medium: t.artists[0].picture_medium || t.artist?.picture_medium || '',
      picture_xl: t.artists[0].picture_xl || t.artist?.picture_xl || ''
    };
  }
  t._artistsEnriched = true;
  return t;
}
window.enrichTrackArtists = enrichTrackArtists;

/** Drop audiobooks / podcasts / spoken chapters from music feeds. */
function isSpokenOrNonMusic(t) {
  if (!t) return true;
  const title = String(t.title || t.name || '').trim();
  const artist = String(t.artist?.name || t.artistName || (typeof t.artist === 'string' ? t.artist : '') || '').trim();
  const album = String(t.album?.title || '').trim();
  const blob = `${title} ${artist} ${album}`.toLowerCase();
  if (!title) return true;
  // «Часть 102 — …», «Глава 3», «Part 12», «Episode 5»
  if (/^(часть|глава|chapter|part|episode|эпизод|выпуск)\s*[\d№#]/i.test(title)) return true;
  if (/\b(часть|глава|chapter|part|episode|эпизод)\s*[\d№#]+\b/i.test(title) && title.length > 28) return true;
  if (/\b(аудиокниг|audiobook|podcast|подкаст|spoken[\s-]?word|лекци[яи]|рассказ\b|отрывок|ветеринарн)\b/i.test(blob)) return true;
  if (/\b(meditation guidance|guided meditation|sleep story|bedtime story)\b/i.test(blob)) return true;
  // Very long lecture-style titles with «Про …»
  if (/^про\s+/i.test(title) && title.length > 48) return true;
  if (title.length > 90 && /\b(врач|здоровье|книг|рассказ|истори[яи])\b/i.test(title)) return true;
  return false;
}
window.isSpokenOrNonMusic = isSpokenOrNonMusic;

function normDZ(t) {
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
    id:        `dz_${t.id}`,
    deezerId:  t.id,
    title:     t.title || t.name || '',
    artist:    {
      id:             primary.id,
      name:           primary.name || '',
      picture_medium: primary.picture_medium || t.artist?.picture_medium || '',
      picture_xl:     primary.picture_xl || t.artist?.picture_xl || ''
    },
    artists,
    album: {
      id:           t.album?.id,
      title:        t.album?.title || '',
      cover_small:  t.album?.cover_small  || '',
      cover_medium: t.album?.cover_medium || '',
      cover_big:    t.album?.cover_big    || '',
      cover_xl:     t.album?.cover_xl     || '',
      cover:        t.album?.cover_xl || t.album?.cover_big || t.album?.cover_medium || t.album?.cover || ''
    },
    duration:  t.duration || 0,
    preview:   t.preview  || null,
    fullTrack: false,
    source:    'deezer'
  };
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
  const aa = String(a.artistName || a.artist?.name || a.artist || '').trim().toLowerCase();
  const ba = String(b.artistName || b.artist?.name || b.artist || '').trim().toLowerCase();
  return !!aa && aa === ba;
}

function deezerIdOf(t) {
  if (!t) return '';
  if (t.deezerId != null && String(t.deezerId)) return String(t.deezerId).replace(/^dz_/i, '');
  const id = String(t.id || '');
  if (/^dz_\d+$/i.test(id)) return id.replace(/^dz_/i, '');
  if (/^\d+$/.test(id)) return id;
  return '';
}

/** Persist a freshly resolved preview into recent / likes / playlists so next play works. */
function patchStoredPreview(t) {
  if (!t?.preview || typeof Store === 'undefined') return;
  const dzId = deezerIdOf(t) || t.deezerId || null;
  const patchOne = (x) => {
    if (!samePlayableTrack(x, t)) return { item: x, changed: false };
    if (x.preview === t.preview && String(x.deezerId || '') === String(dzId || '')) {
      return { item: x, changed: false };
    }
    return {
      item: { ...x, preview: t.preview, deezerId: dzId || x.deezerId || null },
      changed: true
    };
  };
  try {
    if (typeof Store.getRecent === 'function' && typeof Store.setRecent === 'function') {
      let changed = false;
      const next = Store.getRecent().map((x) => {
        const r = patchOne(x);
        if (r.changed) changed = true;
        return r.item;
      });
      if (changed) Store.setRecent(next);
    }
    if (typeof Store.getFavs === 'function' && typeof Store.setFavs === 'function') {
      let changed = false;
      const next = Store.getFavs().map((x) => {
        const r = patchOne(x);
        if (r.changed) changed = true;
        return r.item;
      });
      if (changed) Store.setFavs(next);
    }
    if (typeof Store.getPlaylists === 'function' && typeof Store.setPlaylists === 'function') {
      const pls = Store.getPlaylists();
      let changed = false;
      const next = pls.map((pl) => {
        if (!Array.isArray(pl.tracks) || !pl.tracks.length) return pl;
        let plChanged = false;
        const tracks = pl.tracks.map((x) => {
          const r = patchOne(x);
          if (r.changed) plChanged = true;
          return r.item;
        });
        if (!plChanged) return pl;
        changed = true;
        return { ...pl, tracks };
      });
      if (changed) Store.setPlaylists(next);
    }
  } catch (_) {}
}

function _applyDzTrackFields(t, raw) {
  if (!t || !raw) return t;
  if (raw.preview) t.preview = raw.preview;
  if (raw.id != null) {
    t.deezerId = raw.id;
    if (!t.id || String(t.id) === String(raw.id) || /^\d+$/.test(String(t.id))) {
      t.id = `dz_${raw.id}`;
    }
  }
  if (raw.title) t.title = t.title || raw.title;
  if (raw.album) {
    t.album = t.album && typeof t.album === 'object'
      ? {
          ...t.album,
          id: raw.album.id || t.album.id,
          title: raw.album.title || t.album.title,
          cover_small: raw.album.cover_small || t.album.cover_small,
          cover_medium: raw.album.cover_medium || t.album.cover_medium,
          cover_big: raw.album.cover_big || t.album.cover_big,
          cover_xl: raw.album.cover_xl || t.album.cover_xl,
          cover: raw.album.cover_xl || raw.album.cover_big || raw.album.cover_medium || t.album.cover
        }
      : raw.album;
    t.cover = t.cover || raw.album.cover_medium || raw.album.cover || '';
  }
  if (raw.artist) {
    t.artist = t.artist && typeof t.artist === 'object'
      ? { ...t.artist, id: raw.artist.id || t.artist.id, name: raw.artist.name || t.artist.name }
      : { id: raw.artist.id, name: raw.artist.name || '' };
    t.artistName = t.artistName || raw.artist.name || '';
  }
  if (raw.duration) t.duration = t.duration || raw.duration;
  return t;
}

/**
 * Resolve a working Deezer preview for library/recent/queue tracks.
 * Search results are fresh; saved copies often lose preview — refetch by id or title.
 * force: bypass client/server cache and prefer a different CDN url when possible.
 */
async function ensureTrackPreview(t, opts) {
  if (!t) return null;
  const force = !!(opts && opts.force);
  const oldPreview = t.preview || '';
  // Saved library/recent previews expire — never trust them blindly when force=true
  if (t.preview && !force) return t;

  // Reuse a fresh preview from another in-memory rail (skip when forcing refresh)
  if (!force) {
    try {
      if (typeof _src === 'object' && _src) {
        for (const key of Object.keys(_src)) {
          const hit = (_src[key] || []).find((x) => samePlayableTrack(x, t) && x.preview);
          if (hit?.preview) {
            t.preview = hit.preview;
            if (hit.deezerId) t.deezerId = hit.deezerId;
            return t;
          }
        }
      }
    } catch (_) {}
  }

  const dzId = deezerIdOf(t);
  if (dzId && /^\d+$/.test(dzId)) {
    try {
      const raw = await dzObj(`/track/${dzId}`);
      // Apply preview directly — do not run spoken filter (normDZ) on library resolves
      if (raw && !raw.error && raw.preview) {
        _applyDzTrackFields(t, raw);
        // Same CDN url as the dead one → keep looking via search
        if (!force || !oldPreview || t.preview !== oldPreview) return t;
      }
    } catch (_) {}
  }

  const artist = t.artistName || t.artist?.name || (typeof t.artist === 'string' ? t.artist : '') || '';
  const q = `${t.title || ''} ${artist}`.trim();
  if (!q) return t.preview ? t : null;
  try {
    const found = (await dzArr(`/search/track?q=${encodeURIComponent(q)}&limit=10`))
      .map(normDZ)
      .filter(Boolean);
    const preferAlt = force && !!oldPreview;
    const hit = (preferAlt
        ? found.find((x) => x.preview && x.preview !== oldPreview && samePlayableTrack(x, t))
        : null)
      || found.find((x) => samePlayableTrack(x, t) && x.preview)
      || (preferAlt ? found.find((x) => x.preview && x.preview !== oldPreview) : null)
      || found.find((x) => {
        const xt = String(x.title || '').trim().toLowerCase();
        const tt = String(t.title || '').trim().toLowerCase();
        return xt && tt && xt === tt && x.preview;
      })
      || found.find((x) => x.preview)
      || found[0];
    if (hit?.preview) {
      t.preview = hit.preview;
      t.deezerId = hit.deezerId || t.deezerId || null;
      if (!t.id || String(t.id).startsWith('local') || /^\d+$/.test(String(t.id))) t.id = hit.id;
      if (hit.album) t.album = hit.album;
      if (hit.cover || hit.album?.cover_medium) {
        t.cover = hit.cover || hit.album?.cover_medium || t.cover;
      }
      if (hit.artist) {
        t.artist = hit.artist;
        t.artistName = hit.artist.name || t.artistName;
      }
      return t;
    }
  } catch (_) {}

  return t.preview ? t : null;
}
window.ensureTrackPreview = ensureTrackPreview;

/* ══════════════════════════════════
   AUDIO
══════════════════════════════════ */
function bindAudio() {
  if (_audioBound) return;
  _audioBound = true;

  audio.addEventListener('play', () => {
    isPlaying = true;
    _wantPlaying = true;
    _switchingTrack = false;
    setPlayIcon(true);
    startProgress();
    persistPlayer();
    syncPlayingRows();
  });
  audio.addEventListener('pause', () => {
    isPlaying = false;
    // Track swap always pauses first — don't flip icon / clear intent
    if (_switchingTrack) {
      syncPlayingRows();
      return;
    }
    stopProgress();
    // Unload/navigation also fires pause — keep _wantPlaying so next page can resume
    if (document.visibilityState === 'hidden') {
      persistPlayer(true);
      syncPlayingRows();
      return;
    }
    _wantPlaying = false;
    setPlayIcon(false);
    persistPlayer();
    syncPlayingRows();
  });
  audio.addEventListener('ended', () => {
    stopProgress();
    if (isRepeat === 'one') {
      _wantPlaying = true;
      audio.currentTime = 0;
      audio.play().catch(() => {
        showNotification('Трек недоступен');
        stopPlaybackUi();
      });
      return;
    }
    // off: stop after last track. all: wrap. Never use settings.autoplay for this.
    nextTrack({ auto: true });
  });
  audio.addEventListener('error', () => {
    if (!_wantPlaying && !_switchingTrack) return;
    const token = _playToken;
    setTimeout(() => {
      if (token !== _playToken) return;
      void retryPreviewOrSkip(token);
    }, 0);
  });
  audio.addEventListener('timeupdate', () => {
    tickProgress();
    if (!_persistPosTimer && !audio.paused) {
      _persistPosTimer = setTimeout(() => {
        _persistPosTimer = null;
        persistPlayer(true);
      }, 1500);
    }
  });
  audio.addEventListener('loadedmetadata', () => {
    const tt = el('time-total');
    if (tt) tt.textContent = fmt(audio.duration);
  });
}

/** Persist right before leaving a page so resume has fresh position + playing flag */
function bindNavPersist() {
  if (_navHandlersBound) return;
  _navHandlersBound = true;

  const flush = () => persistPlayer(true);
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  // Sidebar / in-app links: save state before hard navigation
  document.addEventListener('click', e => {
    const a = e.target.closest?.('a[href]');
    if (!a) return;
    try {
      const u = new URL(a.href, location.href);
      if (u.origin !== location.origin) return;
      if (a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      flush();
    } catch {}
  }, true);
}

/* ══════════════════════════════════
   SEARCH
══════════════════════════════════ */
function goSearchPage(q) {
  const query = (q || '').trim();
  if (query && typeof Store?.addHistory === 'function') {
    try { Store.addHistory(query); } catch (_) {}
  }
  // already on search page with page script — use doSearch / reset home
  if (/search(\.html)?$/i.test(location.pathname)) {
    if (query && typeof doSearch === 'function') doSearch(query, { save: true });
    else if (typeof resetSearchHome === 'function') resetSearchHome();
    else if (typeof showSearchInitial === 'function') showSearchInitial();
    return;
  }
  const url = typeof mrfUrl === 'function'
    ? mrfUrl('search', query ? { q: query } : null)
    : (query ? `search.html?q=${encodeURIComponent(query)}` : 'search.html');
  (typeof mrfGo === 'function' ? mrfGo : (u) => { location.href = u; })(url);
}

function bindSearch() {
  // Topbar live search is handled by bindTopbarSearchFlyout in shared.js.
  // On the Search tab, only the in-page #search-input drives results.
  if (typeof updateSearchModeUI === 'function') updateSearchModeUI();
  if (typeof bindTopbarSearchFlyout === 'function') bindTopbarSearchFlyout();
}

function clearSearch() {
  const top = el('main-search-input');
  const big = el('big-search-input');
  if (top) top.value = '';
  if (big) big.value = '';
  const clearBtn = el('search-clear');
  if (clearBtn) clearBtn.classList.add('hidden');
  if (typeof showSearchInitial === 'function') showSearchInitial();
  else if (document.getElementById('page-search')) showSearchEmpty();
}

function showSearchEmpty() {
  const tabs = el('search-tabs');
  const box = el('search-results');
  if (tabs) tabs.classList.add('hidden');
  if (!box) return;
  box.innerHTML = `
    <div class="search-empty">
      <svg viewBox="0 0 24 24" fill="none" width="64" height="64">
        <circle cx="11" cy="11" r="7" stroke="#EE90B7" stroke-width="1.5"/>
        <path d="M20 20L16.5 16.5" stroke="#EE90B7" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <p>Начни вводить название трека или артиста</p>
    </div>`;
}

async function runSearch(q) {
  // multipage redirect
  if (!document.getElementById('page-search') && typeof pageRunSearch !== 'function') {
    goSearchPage(q);
    return;
  }
  if (typeof pageRunSearch === 'function') {
    pageRunSearch(q);
    return;
  }
  showPage('search', qs('[data-page=search]'));
  const results = el('search-results');
  const tabs = el('search-tabs');
  if (results) results.innerHTML = loaderHTML('Ищем…');
  if (tabs) tabs.classList.remove('hidden');
  currentTab = 'tracks';
  setActiveTab('tracks');

  const [rawTracks, rawArtists, rawAlbums] = await Promise.all([
    dzArr(`/search/track?q=${enc(q)}&limit=50`),
    dzArr(`/search/artist?q=${enc(q)}&limit=20`),
    dzArr(`/search/album?q=${enc(q)}&limit=20`)
  ]);

  const tracks = rawTracks.map(normDZ);

  _src['s-tracks']  = tracks;
  _src['s-artists'] = rawArtists;
  _src['s-albums']  = rawAlbums;

  if (results) renderTrackList(tracks, 's-tracks', results);
}

function switchTab(tab) {
  currentTab = tab;
  setActiveTab(tab);
  const box = el('search-results');
  if (tab==='tracks')  renderTrackList(_src['s-tracks']  || [], 's-tracks', box);
  if (tab==='artists') renderArtists  (_src['s-artists'] || [], box);
  if (tab==='albums')  renderAlbums   (_src['s-albums']  || [], box);
}

function setActiveTab(tab) {
  qsAll('.tab-btn').forEach((b,i) =>
    b.classList.toggle('active', ['tracks','artists','albums'][i]===tab));
}

/* ══════════════════════════════════
   RENDER TRACKS
══════════════════════════════════ */
function renderTrackList(tracks, key, container) {
  if (!tracks?.length) {
    container.innerHTML = `<div class="search-empty"><p>Ничего не найдено</p></div>`;
    return;
  }
  _src[key] = tracks;
  container.innerHTML = `<div class="track-list">${
    tracks.map((t,i) => rowHTML(t,i,key)).join('')
  }</div>`;
}

function eqBarsHTML() {
  return `<span class="eq-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>`;
}

function syncPlayingRows() {
  const cur = queue[queueIndex];
  const id = cur?.id != null ? String(cur.id) : '';
  const live = !!(id && isPlaying && audio && !audio.paused && !audio.ended);
  // Equalizer only on list rows (.track-item), never on cover/recent cards
  document.querySelectorAll('.track-item').forEach(row => {
    const on = !!(id && row.dataset.trackId === id);
    row.classList.toggle('playing', on);
    row.classList.toggle('is-paused', on && !live);
  });
  document.querySelectorAll('.cover-card.playing, .recent-card.playing, .recent-card.is-current, .cover-card.is-current').forEach(el => {
    el.classList.remove('playing', 'is-paused', 'is-current');
  });
}
window.syncPlayingRows = syncPlayingRows;

function rowHTML(t, i, key) {
  const title   = esc(t.title || '');
  const artistHtml = typeof artistsLinksHTML === 'function' ? artistsLinksHTML(t, 'artist-link track-artist-link') : esc(formatArtistsText(t) || t.artist?.name || '');
  const cover   = t.album?.cover_medium || t.album?.cover || '';
  const dur     = t.duration ? fmt(t.duration) : '';
  const fav     = Store.isFav(t);
  const tid     = t.id != null ? String(t.id) : '';
  const primaryArtist = t.artist?.name || '';
  const playing = queueIndex>=0 && queue[queueIndex]?.id===t.id;
  const live    = playing && isPlaying && audio && !audio.paused;

  const badge = t.preview
    ? `<span class="src-badge preview">30 сек</span>`
    : `<span class="src-badge none">нет превью</span>`;

  const playIco = `<svg class="play-hover" viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M8 5v14l11-7z"/></svg>`;
  return `
  <div class="track-item${playing?' playing':''}${playing && !live?' is-paused':''}" data-track-id="${esc(tid)}" data-track-idx="${i}" data-track-key="${esc(key)}" data-fav-title="${esc(t.title||'')}" data-fav-artist="${esc(primaryArtist)}" onclick="playFromSrc('${esc(key)}',${i})" oncontextmenu="showTrackMenu(event,${i},'${esc(key)}');return false">
    <div class="track-num">
      <span class="num-text">${i + 1}</span>
      ${eqBarsHTML()}
      ${playIco}
    </div>
    ${cover
      ? `<img class="track-cover" src="${cover}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : `<div class="track-cover-placeholder">${noteSVG()}</div>`}
    <div class="track-info">
      <div class="track-title">${title}</div>
      <div class="track-artist">${artistHtml} ${badge}</div>
    </div>
    <div class="track-duration">${dur}</div>
    <button type="button" class="track-like-btn${fav?' liked':''}"
      data-fav-id="${esc(tid)}" data-fav-title="${esc(t.title||'')}" data-fav-artist="${esc(primaryArtist)}"
      onclick="event.stopPropagation();toggleFavByIdx(${i},'${esc(key)}',this)"
      title="${fav?'Убрать':'В избранное'}">
      <svg viewBox="0 0 24 24" fill="${fav?'currentColor':'none'}">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke="currentColor" stroke-width="1.8"/>
      </svg>
    </button>
    <button type="button" class="track-menu-btn" onclick="event.stopPropagation();showTrackMenu(event,${i},'${esc(key)}')" title="Ещё">
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>
    </button>
  </div>`;
}

/* ══════════════════════════════════
   RENDER ARTISTS
══════════════════════════════════ */
function renderArtists(list, container) {
  if (!list?.length) {
    container.innerHTML = `<div class="search-empty"><p>Артисты не найдены</p></div>`;
    return;
  }
  container.innerHTML = `<div class="artists-grid">${list.map(a => `
    <div class="artist-card" onclick="openArtist(${a.id},'${ejson(a.name)}')">
      ${a.picture_medium
        ? `<img class="artist-img" src="${a.picture_medium}" alt="" loading="lazy">`
        : `<div class="artist-img-placeholder">${(a.name||'?')[0]}</div>`}
      <div class="artist-name">${esc(a.name)}</div>
      <div class="artist-listeners">${a.nb_fan ? (+a.nb_fan).toLocaleString('ru')+' фанатов' : ''}</div>
    </div>`).join('')}</div>`;
}

/* ══════════════════════════════════
   RENDER ALBUMS
══════════════════════════════════ */
function renderAlbums(list, container) {
  if (!list?.length) {
    container.innerHTML = `<div class="search-empty"><p>Альбомы не найдены</p></div>`;
    return;
  }
  container.innerHTML = `<div class="albums-grid">${list.map(a => `
    <div class="album-card" onclick="openAlbum(${a.id},'${ejson(a.title)}','${ejson(a.artist?.name||'')}')">
      ${a.cover_medium
        ? `<img class="album-cover" src="${a.cover_medium}" alt="" loading="lazy">`
        : `<div class="album-cover-placeholder">${noteSVG()}</div>`}
      <div class="album-body">
        <div class="album-title">${esc(a.title)}</div>
        <div class="album-artist">${esc(a.artist?.name||'')}</div>
      </div>
    </div>`).join('')}</div>`;
}

/* ══════════════════════════════════
   ARTIST PAGE
   Загружаем все треки через пагинацию
══════════════════════════════════ */
function normalizeDeezerId(id) {
  if (id == null || id === '') return null;
  let s = String(id).trim();
  if (!s || s === 'undefined' || s === 'null' || s === '0') return null;
  if (/^dz_/i.test(s)) s = s.replace(/^dz_/i, '');
  return s || null;
}
window.normalizeDeezerId = normalizeDeezerId;

function openSavedAlbum(id, title, artist) {
  const aid = normalizeDeezerId(id);
  const url = typeof mrfUrl === 'function'
    ? mrfUrl('album', { id: aid || '', title: title || '', artist: artist || '' })
    : `album.html?id=${encodeURIComponent(aid || '')}&title=${encodeURIComponent(title || '')}&artist=${encodeURIComponent(artist || '')}`;
  if (typeof mrfGo === 'function') mrfGo(url);
  else location.href = url;
}
window.openSavedAlbum = openSavedAlbum;

async function openArtist(id, name, fromTrackName) {
  // Block "open artist from track name" on mobile/tablet — PC only
  if (fromTrackName && (typeof isMobileLayout === 'function' ? isMobileLayout() : document.documentElement.getAttribute('data-ui') === 'mobile')) {
    return;
  }
  const aid = normalizeDeezerId(id);
  const aname = name || '';
  // Always use dedicated artist page in multipage build
  if (!document.getElementById('page-search')) {
    const go = typeof mrfGo === 'function' ? mrfGo : (u) => { location.href = u; };
    if (!aid && !aname) { showNotif?.('Артист не найден'); return; }
    try {
      sessionStorage.setItem('mrf_route_artist', JSON.stringify({ id: aid || '', name: aname || '' }));
    } catch (_) {}
    go(typeof mrfUrl === 'function'
      ? mrfUrl('artist', aid ? { id: aid, name: aname } : { name: aname })
      : (aid
        ? `artist.html?id=${encodeURIComponent(aid)}&name=${encodeURIComponent(aname)}`
        : `artist.html?name=${encodeURIComponent(aname)}`));
    return;
  }
  // legacy SPA fallback (if old markup present)
  if (!aid) return;
  showPage('search', qs('[data-page=search]'));
  const tabs = el('search-tabs');
  const box = el('search-results');
  if (tabs) tabs.classList.add('hidden');
  if (box) box.innerHTML = loaderHTML('Загружаем артиста…');

  const [artInfo, firstBatch] = await Promise.all([
    dzObj(`/artist/${aid}`),
    dzArr(`/artist/${aid}/top?limit=50`)
  ]);

  const img       = artInfo.picture_xl || artInfo.picture_medium || '';
  const totalFans = artInfo.nb_fan ? (+artInfo.nb_fan).toLocaleString('ru')+' фанатов' : '';
  const key       = `art_${aid}`;
  let   tracks    = firstBatch.map(normDZ);
  _src[key]       = tracks;

  renderArtistPage(aid, name, img, totalFans, tracks, key, firstBatch.length===50);
}

function renderArtistPage(id, name, img, fans, tracks, key, hasMore) {
  el('search-results').innerHTML = `
    <div style="display:flex;gap:28px;align-items:flex-start;margin-bottom:32px;flex-wrap:wrap">
      ${img
        ? `<img src="${img}" style="width:160px;height:160px;border-radius:50%;object-fit:cover;flex-shrink:0" alt="">`
        : `<div style="width:160px;height:160px;border-radius:50%;background:var(--bg-3);display:flex;align-items:center;justify-content:center;font-size:56px;font-weight:800;color:var(--accent);flex-shrink:0">${(name||'?')[0]}</div>`}
      <div style="display:flex;flex-direction:column;justify-content:center;gap:8px">
        <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:2px">Артист</div>
        <h2 style="font-size:40px;font-weight:800">${esc(name)}</h2>
        <div style="color:var(--text-3);font-size:13px">${fans}</div>
        <div style="display:flex;gap:10px;margin-top:8px">
          <button class="btn-primary" onclick="playFromSrc('${esc(key)}',0)" style="padding:10px 20px;font-size:13px">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="5,3 19,12 5,21"/></svg>
            Слушать всё
          </button>
          <button class="btn-secondary" onclick="loadArtistAlbums(${id},'${ejson(name)}')" style="padding:10px 18px;font-size:13px">
            Альбомы →
          </button>
        </div>
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <h3 style="font-size:18px;font-weight:700">Популярные треки <span id="art-count" style="font-size:13px;color:var(--text-3);font-weight:400">(${tracks.length})</span></h3>
      ${hasMore ? `<button class="section-link" id="load-more-btn" onclick="loadMoreArtistTracks(${id},'${ejson(name)}','${esc(key)}')">Загрузить ещё →</button>` : ''}
    </div>
    <div class="track-list" id="artist-track-list">
      ${tracks.map((t,i) => rowHTML(t,i,key)).join('')}
    </div>`;
}

async function loadMoreArtistTracks(id, name, key) {
  const btn = el('load-more-btn');
  if (btn) { btn.textContent='Загружаем…'; btn.disabled=true; }

  const existing = _src[key] || [];
  const offset   = existing.length;

  /* Deezer /top ограничен ~50, поэтому берём треки через /tracks */
  const more = await dzArr(`/artist/${id}/top?limit=50&index=${offset}`);
  if (!more.length) {
    if (btn) btn.remove();
    return;
  }

  const normMore = more.map(normDZ);
  _src[key]      = [...existing, ...normMore];

  /* Добавляем строки в список */
  const list = el('artist-track-list');
  if (list) {
    list.insertAdjacentHTML('beforeend',
      normMore.map((t,i) => rowHTML(t, existing.length+i, key)).join(''));
  }

  const countEl = el('art-count');
  if (countEl) countEl.textContent = `(${_src[key].length})`;

  if (btn) {
    if (more.length < 50) btn.remove();
    else { btn.textContent='Загрузить ещё →'; btn.disabled=false; }
  }
}

async function loadArtistAlbums(id, name) {
  const box = el('search-results');
  /* Вставляем секцию альбомов ниже */
  const existing = box.innerHTML;
  box.insertAdjacentHTML('beforeend',
    `<div style="margin-top:32px"><h3 style="font-size:18px;font-weight:700;margin-bottom:14px">Альбомы</h3>
     <div id="artist-albums-box">${loaderHTML('Загружаем альбомы…')}</div></div>`);

  const albums = await dzArr(`/artist/${id}/albums?limit=50`);
  const abox   = el('artist-albums-box');
  if (!abox) return;
  if (!albums.length) { abox.innerHTML = '<p style="color:var(--text-3)">Альбомы не найдены</p>'; return; }
  abox.innerHTML = `<div class="albums-grid">${albums.map(a => `
    <div class="album-card" onclick="openAlbum(${a.id},'${ejson(a.title)}','${ejson(name)}')">
      ${a.cover_medium ? `<img class="album-cover" src="${a.cover_medium}" alt="" loading="lazy">` : `<div class="album-cover-placeholder">${noteSVG()}</div>`}
      <div class="album-body">
        <div class="album-title">${esc(a.title)}</div>
        <div class="album-artist">${a.release_date||''}</div>
      </div>
    </div>`).join('')}</div>`;
}

/* ══════════════════════════════════
   ALBUM PAGE
══════════════════════════════════ */
async function openAlbum(id, albumName, artistName) {
  // Multipage: always soft-nav to album.html (search page has #search-results — never use SPA path)
  if (typeof openSavedAlbum === 'function') {
    openSavedAlbum(id, albumName, artistName);
    return;
  }
  const go = typeof mrfGo === 'function' ? mrfGo : (u) => { location.href = u; };
  go(typeof mrfUrl === 'function'
    ? mrfUrl('album', { id: id || '', title: albumName || '', artist: artistName || '' })
    : `album.html?id=${encodeURIComponent(id || '')}&title=${encodeURIComponent(albumName || '')}&artist=${encodeURIComponent(artistName || '')}`);
}
window.openAlbum = openAlbum;

/* ══════════════════════════════════
   CHARTS
══════════════════════════════════ */
async function loadHomeCharts() {
  const dzTracks = await dzArr('/chart/0/tracks?limit=20');
  const home     = dzTracks.map(normDZ);
  _src['home']   = home;
  el('home-charts-list').innerHTML = home.length
    ? `<div class="track-list">${home.map((t,i) => rowHTML(t,i,'home')).join('')}</div>`
    : `<p style="color:var(--text-3)">Не удалось загрузить</p>`;
}

async function loadChartsPage() {
  const dzTracks  = await dzArr('/chart/0/tracks?limit=100');
  const all       = dzTracks.map(normDZ);
  _src['charts']  = all;
  el('charts-list').innerHTML = all.length
    ? `<div class="track-list">${all.map((t,i) => {
        const topClass = i===0 ? ' top-1' : i===1 ? ' top-2' : i===2 ? ' top-3' : '';
        return rowHTMLCharts(t, i, 'charts', topClass);
      }).join('')}</div>`
    : `<p style="color:var(--text-3)">Не удалось загрузить</p>`;
}

function rowHTMLCharts(t, i, key, extraClass='') {
  const title  = esc(t.title || '');
  const artistHtml = typeof artistsLinksHTML === 'function' ? artistsLinksHTML(t, 'artist-link track-artist-link') : esc(formatArtistsText(t) || t.artist?.name || '');
  const cover  = t.album?.cover_medium || t.album?.cover || '';
  const dur    = t.duration ? fmt(t.duration) : '';
  const fav    = Store.isFav(t);
  const tid    = t.id != null ? String(t.id) : '';
  const primaryArtist = t.artist?.name || '';
  const playing= queueIndex>=0 && queue[queueIndex]?.id===t.id;
  const live   = playing && isPlaying && audio && !audio.paused;
  const topCls = i===0?' top-1':i===1?' top-2':i===2?' top-3':'';
  const playIco = `<svg class="play-hover" viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M8 5v14l11-7z"/></svg>`;

  return `
  <div class="track-item${playing?' playing':''}${playing && !live?' is-paused':''}${extraClass}${topCls}" data-track-id="${esc(tid)}" onclick="playFromSrc('${esc(key)}',${i})">
    <div class="track-num">
      <span class="num-text">${i + 1}</span>
      ${eqBarsHTML()}
      ${playIco}
    </div>
    ${cover
      ? `<img class="track-cover" src="${cover}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : `<div class="track-cover-placeholder">${noteSVG()}</div>`}
    <div class="track-info">
      <div class="track-title">${title}</div>
      <div class="track-artist">${artistHtml}</div>
    </div>
    <div class="track-duration">${dur}</div>
    <button type="button" class="track-like-btn${fav?' liked':''}"
      data-fav-id="${esc(tid)}" data-fav-title="${esc(t.title||'')}" data-fav-artist="${esc(primaryArtist)}"
      onclick="event.stopPropagation();toggleFavByIdx(${i},'${esc(key)}',this)"
      title="${fav?'Убрать':'В избранное'}">
      <svg viewBox="0 0 24 24" fill="${fav?'currentColor':'none'}">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke="currentColor" stroke-width="1.8"/>
      </svg>
    </button>
  </div>`;
}

/* ══════════════════════════════════
   GENRE
══════════════════════════════════ */
async function searchByTag(tag) {
  showPage('search', qs('[data-page=search]'));
  el('main-search-input').value = el('big-search-input').value = tag;
  el('search-tabs').classList.add('hidden');
  el('search-results').innerHTML = loaderHTML('Загружаем жанр…');
  const tracks = (await dzArr(`/search/track?q=${enc(tag)}&limit=50`)).map(normDZ);
  const key    = `tag_${tag}`;
  _src[key]    = tracks;
  el('search-results').innerHTML = tracks.length
    ? `<div class="track-list">${tracks.map((t,i) => rowHTML(t,i,key)).join('')}</div>`
    : `<div class="search-empty"><p>Ничего не найдено</p></div>`;
}

/* ══════════════════════════════════
   PLAYBACK
══════════════════════════════════ */
function resolvePlaybackSourceLabel(key) {
  const k = String(key || '');
  if (!k) return '';
  if (k === 'liked' || k === 'favs') return 'Любимые треки';
  if (k === 'charts' || k === 'charts_world' || k === 'rising') return 'Чарты';
  if (k === 'home') return 'Главная';
  if (k === 'recent') return 'Недавние';
  if (k === 's-tracks' || k === 'mobile_flyout_tracks' || k === 'flyout_tracks' || k === 'search_trend') {
    let q = '';
    try {
      q = String(window.__mrfLastSearchQ || new URLSearchParams(location.search).get('q') || '').trim();
    } catch (_) {}
    return q ? `Поиск: «${q}»` : 'Поиск';
  }
  if (k.startsWith('pl_') || k.startsWith('playlist')) {
    const rawId = k.replace(/^playlist_?/, '').replace(/^pl_/, '');
    try {
      if (typeof Store !== 'undefined' && Store.getPlaylist) {
        const pl = Store.getPlaylist(rawId) || Store.getPlaylist(String(rawId).replace(/^rec_/, ''));
        if (pl?.name) return pl.name;
      }
      if (String(rawId).startsWith('rec_')) {
        const v = JSON.parse(sessionStorage.getItem('mrf_virtual_playlist') || 'null');
        if (v && String(v.id) === String(rawId) && v.name) return v.name;
        if (v?.kind === 'mood') return v.name || 'Настроение';
      }
    } catch (_) {}
    if (String(rawId).includes('playlist_of_the_day')) {
      return typeof mrfDayPlaylistTitle === 'function' ? mrfDayPlaylistTitle() : 'Плейлист дня';
    }
    if (String(rawId).includes('mood_')) return 'Настроение';
    if (String(rawId).includes('artist_mix') || String(rawId).startsWith('rec_')) return 'Микс';
    return 'Плейлист';
  }
  if (k.startsWith('mfy_')) {
    try {
      const pl = window.__mrfRecMixes && window.__mrfRecMixes[k];
      if (pl?.name) return pl.name;
      if (pl?.kind === 'day') {
        return typeof mrfDayPlaylistTitle === 'function' ? mrfDayPlaylistTitle(pl.localDay) : 'Плейлист дня';
      }
    } catch (_) {}
    return 'Микс';
  }
  if (k.startsWith('album') || k.includes('album')) return 'Альбом';
  if (k.includes('artist') || k.startsWith('rp_artist')) return 'Исполнитель';
  if (k === 'track_page' || k === 'mock_single') return 'Трек';
  return 'Очередь';
}
window.resolvePlaybackSourceLabel = resolvePlaybackSourceLabel;

function setPlaybackSource(key) {
  currentSrcKey = String(key || '');
  currentSrcLabel = resolvePlaybackSourceLabel(currentSrcKey);
  window.currentSrcKey = currentSrcKey;
  window.currentSrcLabel = currentSrcLabel;
  try {
    Store.setPlayerState({ srcKey: currentSrcKey, srcLabel: currentSrcLabel });
  } catch (_) {}
  if (typeof syncFsPlayerContext === 'function') syncFsPlayerContext();
}
window.setPlaybackSource = setPlaybackSource;

/** Home shows 5 chart rows; playback always uses the full world charts queue. */
let _chartsExpandPromise = null;
async function ensureFullChartsList() {
  if (_src['charts_world']?.length) return _src['charts_world'];
  if (!_chartsExpandPromise) {
    _chartsExpandPromise = dzArr('/chart/0/tracks?limit=100')
      .then((rows) => (rows || []).map(normDZ))
      .then((all) => {
        if (all.length) {
          _src['charts_world'] = all;
          // Seed charts page cache only when empty / unfiltered
          if (!_src['charts']?.length) _src['charts'] = all;
        }
        return all;
      })
      .finally(() => { _chartsExpandPromise = null; });
  }
  return _chartsExpandPromise;
}

async function playHomeChartsExpanded(index) {
  const homeList = _src['home'] || [];
  const prefer = homeList[Math.max(0, Number(index) || 0)] || homeList[0] || null;
  try {
    const all = await ensureFullChartsList();
    if (all?.length) {
      let idx = 0;
      if (prefer) {
        const found = all.findIndex((t) =>
          (prefer.id != null && String(t.id) === String(prefer.id))
          || (prefer.deezerId != null && String(t.deezerId || '') === String(prefer.deezerId))
        );
        idx = found >= 0 ? found : Math.min(Math.max(0, Number(index) || 0), all.length - 1);
      }
      playFromSrc('charts_world', idx);
      return;
    }
  } catch (_) {}
  if (homeList.length) {
    // fallback only if full chart fetch failed
    const idx = Math.min(Math.max(0, Number(index) || 0), homeList.length - 1);
    playFromSrc('__home_raw', idx);
  }
}
window.playHomeChartsExpanded = playHomeChartsExpanded;
window.ensureFullChartsList = ensureFullChartsList;

function playFromSrc(key, index) {
  // Home preview → full world charts queue (same as charts.html)
  if (key === 'home') {
    void playHomeChartsExpanded(index);
    return;
  }
  const srcKey = key === '__home_raw' ? 'home' : key;
  const list = _src[srcKey];
  if (!list?.length) return;
  const idx = Math.max(0, Number(index) || 0);
  const prem = typeof mrfUserHasPremium === 'function' ? mrfUserHasPremium() : false;
  if (!prem) {
    const cur = queueIndex >= 0 ? queue[queueIndex] : null;
    const next = list[idx];
    const sameTrack = !!(cur && next && cur.id != null && String(cur.id) === String(next.id));
    // Free: only start from the first track (or replay the current one)
    if (idx !== 0 && !sameTrack) {
      if (typeof mrfRequirePremium === 'function') mrfRequirePremium('pick');
      return;
    }
    if (isShuffle) {
      isShuffle = false;
      if (typeof syncShuffleRepeatUi === 'function') syncShuffleRepeatUi();
    }
  }
  _trackFlowDir = 1;
  window._trackFlowDir = 1;
  setPlaybackSource(srcKey);
  // «Перемешивание при запуске» — только Premium
  try {
    if (prem && typeof Store !== 'undefined' && Store.getSettings().shuffleOnPlay && !isShuffle) {
      isShuffle = true;
      if (typeof syncShuffleRepeatUi === 'function') syncShuffleRepeatUi();
      else el('btn-shuffle')?.classList.toggle('active-btn', true);
    }
  } catch {}
  _originalQueue = list.map(t => ({ ...t }));
  if (isShuffle && prem) {
    // перемешиваем, выбранный трек ставим первым
    const current = _originalQueue[idx];
    const rest = _originalQueue.filter((_, i) => i !== idx);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    queue = [current, ...rest];
    queueIndex = 0;
  } else {
    queue = _originalQueue.map(t => ({ ...t }));
    queueIndex = idx;
  }
  if (typeof notifyQueueChanged === 'function') notifyQueueChanged();
  playNow();
}

function stopPlaybackUi() {
  _switchingTrack = false;
  _wantPlaying = false;
  isPlaying = false;
  setPlayIcon(false);
  stopProgress();
  try { audio.pause(); } catch (_) {}
  persistPlayer(true);
  syncPlayingRows();
}

/** Pause on the last track at the end (repeat off). */
function stopAtEndOfQueue() {
  _switchingTrack = false;
  _wantPlaying = false;
  isPlaying = false;
  setPlayIcon(false);
  stopProgress();
  try {
    if (audio.duration && isFinite(audio.duration)) audio.currentTime = audio.duration;
  } catch (_) {}
  persistPlayer(true);
  syncPlayingRows();
  if (typeof renderFsNextTrack === 'function') renderFsNextTrack();
}

/**
 * After an unavailable track: notify already shown by caller.
 * Skip forward and let playNow resolve previews (library/recent often need refetch).
 */
function advancePastUnavailable() {
  const n = queue.length;
  if (!n || queueIndex < 0) {
    stopPlaybackUi();
    return;
  }
  if (isRepeat === 'one') {
    stopPlaybackUi();
    return;
  }
  const wrap = isRepeat === 'all';
  const start = queueIndex;
  for (let step = 1; step <= n; step++) {
    let i = start + step;
    if (i >= n) {
      if (!wrap) {
        queueIndex = n - 1;
        const last = queue[queueIndex];
        if (last) updatePlayerUI(last);
        stopAtEndOfQueue();
        return;
      }
      i = i % n;
    }
    if (i === start) {
      showNotification('Нет доступных треков');
      stopPlaybackUi();
      return;
    }
    queueIndex = i;
    _trackFlowDir = 1;
    window._trackFlowDir = 1;
    playNow();
    return;
  }
  stopPlaybackUi();
}

function startAudioForCurrent(token) {
  const t = queue[queueIndex];
  if (!t?.preview) {
    showNotification('Трек недоступен');
    advancePastUnavailable();
    return;
  }
  _switchingTrack = true;
  _wantPlaying = true;
  try { audio.pause(); } catch (_) {}
  audio.src = t.preview;
  audio.volume = isMuted ? 0 : volume;
  audio.load();
  audio.play()
    .then(() => {
      if (token !== _playToken) return;
      _switchingTrack = false;
      _wantPlaying = true;
      isPlaying = true;
      setPlayIcon(true);
      startProgress();
      syncPlayingRows();
    })
    .catch(() => {
      if (token !== _playToken) return;
      _switchingTrack = false;
      void retryPreviewOrSkip(token);
    });
}

async function retryPreviewOrSkip(token) {
  if (token !== _playToken) return;
  const cur = queue[queueIndex];
  if (cur && !cur._previewRetried) {
    cur._previewRetried = true;
    const oldPreview = cur.preview || '';
    try {
      // Prefer a different search hit — /track/:id sometimes returns a dead CDN url
      const artist = cur.artistName || cur.artist?.name || (typeof cur.artist === 'string' ? cur.artist : '') || '';
      const q = `${cur.title || ''} ${artist}`.trim();
      if (q) {
        const found = (await dzArr(`/search/track?q=${encodeURIComponent(q)}&limit=10`))
          .map(normDZ)
          .filter(Boolean);
        const hit = found.find((x) => x.preview && x.preview !== oldPreview && samePlayableTrack(x, cur))
          || found.find((x) => x.preview && x.preview !== oldPreview)
          || found.find((x) => x.preview && samePlayableTrack(x, cur));
        if (hit?.preview) {
          if (token !== _playToken) return;
          Object.assign(cur, {
            preview: hit.preview,
            deezerId: hit.deezerId || cur.deezerId,
            id: hit.id || cur.id,
            album: hit.album || cur.album,
            cover: hit.cover || hit.album?.cover_medium || cur.cover,
            artist: hit.artist || cur.artist,
            artistName: hit.artist?.name || cur.artistName
          });
          patchStoredPreview(cur);
          updatePlayerUI(cur);
          startAudioForCurrent(token);
          return;
        }
      }
      const again = await ensureTrackPreview(cur, { force: true });
      if (token !== _playToken) return;
      if (again?.preview && again.preview !== oldPreview) {
        Object.assign(cur, again);
        patchStoredPreview(cur);
        updatePlayerUI(cur);
        startAudioForCurrent(token);
        return;
      }
    } catch (_) {}
  }
  showNotification('Трек недоступен');
  advancePastUnavailable();
}

function playNow() {
  if (queueIndex < 0 || queueIndex >= queue.length) return;
  const token = ++_playToken;
  const t = queue[queueIndex];
  if (t) t._previewRetried = false;
  updatePlayerUI(t);
  addToRecent(t);
  renderQueuePanel();
  updateFavBtn();
  syncPlayingRows();
  _wantPlaying = true;
  persistPlayer();
  // Load full contributor list (Deezer search often returns only 1 artist)
  const playId = t.id;
  enrichTrackArtists(t).then(enriched => {
    if (token !== _playToken) return;
    if (queue[queueIndex]?.id !== playId && deezerIdOf(queue[queueIndex]) !== deezerIdOf({ id: playId })) return;
    Object.assign(queue[queueIndex], enriched);
    updatePlayerUI(queue[queueIndex]);
    if (typeof syncRightPanel === 'function') syncRightPanel();
  }).catch(() => {});

  void (async () => {
    try {
      // Always refresh preview from Deezer — library/recent URLs go stale while search is fresh
      const ensured = await ensureTrackPreview(queue[queueIndex], { force: true });
      if (token !== _playToken) return;
      const cur = queue[queueIndex];
      if (!cur) return;
      if (ensured?.preview) {
        Object.assign(cur, ensured);
        patchStoredPreview(cur);
        updatePlayerUI(cur);
      }
      if (!cur.preview) {
        showNotification('Трек недоступен');
        advancePastUnavailable();
        return;
      }
      startAudioForCurrent(token);
    } catch (_) {
      if (token !== _playToken) return;
      showNotification('Трек недоступен');
      advancePastUnavailable();
    }
  })();
}

function persistPlayer(forcePos) {
  try {
    Store.setQueue(queue, queueIndex);
    const remember = Store.getSettings().rememberPosition !== false;
    const livePos = (forcePos || !audio.paused || _wantPlaying)
      ? (audio.currentTime || 0)
      : (Store.getPlayerState()?.position || 0);
    Store.setPlayerState({
      volume: Math.round((volume || 0) * 100),
      muted: !!isMuted,
      shuffle: !!isShuffle,
      repeat: isRepeat || 'off',
      position: remember ? livePos : 0,
      playing: !!_wantPlaying && !audio.ended,
      srcKey: currentSrcKey || Store.getPlayerState()?.srcKey || '',
      srcLabel: currentSrcLabel || Store.getPlayerState()?.srcLabel || ''
    });
  } catch {}
}
window.persistPlayer = persistPlayer;

function togglePlay() {
  if (!queue[queueIndex]) return;
  if (!audio.src || audio.readyState === 0) { playNow(); return; }
  // Trust the element — isPlaying can desync after failed/unavailable tracks
  const playing = !audio.paused && !audio.ended;
  if (playing) {
    _wantPlaying = false;
    _switchingTrack = false;
    audio.pause();
  } else {
    _wantPlaying = true;
    audio.play()
      .then(() => { setPlayIcon(true); })
      .catch(() => {
        _wantPlaying = false;
        setPlayIcon(false);
        showNotification('Трек недоступен');
      });
  }
}
let _trackFlowDir = 0; // 1 = next (swipe left), -1 = prev (swipe right)
window._trackFlowDir = 0;

/**
 * @param {{ auto?: boolean }} [opts]
 * auto=true — from track end: wrap only if repeat=all; stop at end if repeat=off
 * manual (default) — always advance; wrap to start for convenience
 */
function nextTrack(opts) {
  if (!queue.length) return;
  const auto = !!(opts && opts.auto);
  // Free prison: only auto-advance; manual skip is Premium
  if (!auto && typeof mrfRequirePremium === 'function' && !mrfRequirePremium('skip')) return;
  _trackFlowDir = 1;
  window._trackFlowDir = 1;

  if (auto) {
    if (queueIndex >= queue.length - 1) {
      if (isRepeat === 'all') {
        queueIndex = 0;
        playNow();
      } else {
        stopAtEndOfQueue();
      }
      return;
    }
    queueIndex += 1;
    playNow();
    return;
  }

  queueIndex = (queueIndex + 1) % queue.length;
  playNow();
}
window.nextTrack = nextTrack;
function prevTrack() {
  if (!queue.length) return;
  // Free: restart current track only; jumping back is Premium
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  if (typeof mrfRequirePremium === 'function' && !mrfRequirePremium('skip')) return;
  _trackFlowDir = -1;
  window._trackFlowDir = -1;
  queueIndex = (queueIndex - 1 + queue.length) % queue.length;
  playNow();
}
window.prevTrack = prevTrack;
function syncShuffleRepeatUi() {
  const on = !!isShuffle;
  el('btn-shuffle')?.classList.toggle('active-btn', on);
  el('fs-btn-shuffle')?.classList.toggle('active-btn', on);
  document.getElementById('fs-q-shuffle')?.classList.toggle('is-on', on);
  const repOn = isRepeat !== 'off';
  const applyRep = (btn) => {
    if (!btn) return;
    btn.classList.toggle('active-btn', repOn);
    btn.classList.toggle('is-on', repOn);
    const badge = btn.querySelector('.repeat-one-badge');
    if (badge) badge.remove();
    if (isRepeat === 'one') {
      const b = document.createElement('span');
      b.className = 'repeat-one-badge';
      b.textContent = '1';
      btn.appendChild(b);
    }
  };
  applyRep(el('btn-repeat'));
  applyRep(el('fs-btn-repeat'));
  document.getElementById('fs-q-repeat')?.classList.toggle('is-on', repOn);
}
window.syncShuffleRepeatUi = syncShuffleRepeatUi;

function toggleShuffle() {
  if (typeof mrfRequirePremium === 'function' && !mrfRequirePremium('shuffle')) {
    if (isShuffle) {
      isShuffle = false;
      syncShuffleRepeatUi();
    }
    return;
  }
  isShuffle = !isShuffle;
  syncShuffleRepeatUi();

  if (queue.length) {
    const currentTrack = queue[queueIndex];
    if (isShuffle) {
      if (!_originalQueue.length) _originalQueue = queue.map(t => ({ ...t }));
      const rest = queue.filter((_, i) => i !== queueIndex);
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      queue = [currentTrack, ...rest];
      queueIndex = 0;
    } else {
      if (_originalQueue.length) {
        queue = _originalQueue.map(t => ({ ...t }));
        queueIndex = queue.findIndex(t => t.id === currentTrack.id);
        if (queueIndex === -1) queueIndex = 0;
      }
    }
    persistPlayer();
    if (typeof notifyQueueChanged === 'function') notifyQueueChanged();
    else renderQueuePanel();
    if (typeof renderFsQueueSheet === 'function' && !document.getElementById('fs-queue-sheet')?.classList.contains('hidden')) {
      renderFsQueueSheet();
    }
  }
}
function toggleRepeat() {
  if (isRepeat === 'off')      isRepeat = 'all';
  else if (isRepeat === 'all') isRepeat = 'one';
  else                         isRepeat = 'off';
  updateRepeatBtn();
  persistPlayer();
}
function updateRepeatBtn() {
  syncShuffleRepeatUi();
}

/* ── Player UI ── */
function upgradeCoverUrl(url, size = 1000) {
  if (!url) return '';
  return String(url).replace(/\/(\d{2,4})x(\d{2,4})-/g, `/${size}x${size}-`);
}
window.upgradeCoverUrl = upgradeCoverUrl;

function bestCoverUrl(t, size = 1000) {
  if (!t) return '';
  const raw = t.album?.cover_xl || t.album?.cover_big || t.album?.cover_medium
    || t.album?.cover || t.cover_xl || t.cover_big || t.cover || '';
  return upgradeCoverUrl(raw, size);
}
window.bestCoverUrl = bestCoverUrl;

function setPlayIcon(on) {
  // Crisp stroke-based icons (no soft evenodd rings)
  const pauseSvg = '<svg viewBox="0 0 24 24" width="52" height="52" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="12" cy="12" r="9.15" stroke="currentColor" stroke-width="1.7"/><rect x="8.4" y="7.6" width="2.5" height="8.8" rx="0.7" fill="currentColor"/><rect x="13.1" y="7.6" width="2.5" height="8.8" rx="0.7" fill="currentColor"/></svg>';
  const playSvg = '<svg viewBox="0 0 24 24" width="52" height="52" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="12" cy="12" r="9.15" stroke="currentColor" stroke-width="1.7"/><path d="M10 8.15v7.7L16.6 12 10 8.15z" fill="currentColor"/></svg>';
  const html = on ? pauseSvg : playSvg;
  const btn = el('btn-play');
  if (btn) btn.innerHTML = html;
  const fsBtn = el('fs-btn-play');
  if (fsBtn) fsBtn.innerHTML = html;
}

function runTrackFlowAnim(dir) {
  if (!dir || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // Never animate FS cover — leftover translateX breaks layout on some tracks
  if (document.body.classList.contains('fs-player-open')) return;
  const targets = [];
  const cover = document.getElementById('player-cover');
  const info = document.querySelector('#player .player-track-info');
  if (cover) targets.push(cover);
  if (info) targets.push(info);
  if (!targets.length) return;
  const cls = dir > 0 ? 'track-flow-next' : 'track-flow-prev';
  targets.forEach((node) => node.classList.remove('track-flow-next', 'track-flow-prev'));
  void targets[0].offsetWidth;
  targets.forEach((node) => {
    node.classList.add(cls);
    const done = () => {
      node.classList.remove(cls);
      node.style.transform = '';
      node.style.willChange = '';
      node.removeEventListener('animationend', done);
    };
    node.addEventListener('animationend', done, { once: true });
    setTimeout(done, 420);
  });
}
window.runTrackFlowAnim = runTrackFlowAnim;

function syncActiveTrackClass(track) {
  const t = track || (queueIndex >= 0 ? queue[queueIndex] : null);
  const on = !!(t && (t.title || t.id || t.preview));
  document.body.classList.toggle('has-active-track', on);
}
window.syncActiveTrackClass = syncActiveTrackClass;

function updatePlayerUI(t) {
  const flowDir = _trackFlowDir || window._trackFlowDir || 0;
  _trackFlowDir = 0;
  window._trackFlowDir = 0;
  if (flowDir) runTrackFlowAnim(flowDir);

  syncActiveTrackClass(t);

  const titleEl = el('player-title');
  const artistEl = el('player-artist');
  if (titleEl) titleEl.textContent = t.title || '—';
  if (artistEl) {
    const mobileUi = (typeof isMobileLayout === 'function')
      ? isMobileLayout()
      : (document.documentElement.getAttribute('data-ui') === 'mobile'
        || window.matchMedia('(max-width: 900px)').matches);
    if (mobileUi) {
      // Mobile mini-player: plain text only
      artistEl.textContent = (typeof formatArtistsText === 'function'
        ? formatArtistsText(t)
        : (t.artist?.name || t.artist || '')) || '—';
    } else if (typeof artistsLinksHTML === 'function') {
      // PC: clickable artists like in track lists
      artistEl.innerHTML = artistsLinksHTML(t, 'artist-link player-artist-link');
    } else {
      artistEl.textContent = (typeof formatArtistsText === 'function'
        ? formatArtistsText(t)
        : (t.artist?.name || t.artist || '')) || '—';
    }
  }
  const c = el('player-cover');
  const cover = bestCoverUrl(t, 500);
  if (c) {
    c.style.backgroundImage = cover ? `url("${cover}")` : '';
    c.style.backgroundSize = 'cover';
  c.style.backgroundPosition = 'center';
    c.style.backgroundColor = cover ? 'transparent' : 'var(--bg-3)';
    c.classList.toggle('is-empty', !cover);
  }
  const tt = el('time-total');
  const tc = el('time-current');
  const pf = el('progress-fill');
  if (tt) tt.textContent = t.duration ? fmt(t.duration) : '0:30';
  if (tc) tc.textContent = '0:00';
  if (pf) pf.style.width = '0%';
  el('player-like-btn')?.classList.add('visible');
  updateNowPlayingPanel(t);
  if (typeof syncFsPlayer === 'function') syncFsPlayer(t);
  if (typeof syncRightPanel === 'function') syncRightPanel();
  else if (typeof window.syncRightPanel === 'function') window.syncRightPanel();
}

/* ── Progress ── */
let _pt = null;
function startProgress() { stopProgress(); _pt = setInterval(tickProgress, 250); }
function stopProgress()  { clearInterval(_pt); }
function tickProgress() {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration * 100);
  const pf = el('progress-fill');
  const tc = el('time-current');
  const tt = el('time-total');
  if (pf) pf.style.width = pct + '%';
  if (tc) tc.textContent = fmt(audio.currentTime);
  if (tt) tt.textContent = fmt(audio.duration);
  const fsFill = el('fs-progress-fill');
  const fsCur = el('fs-time-current');
  const fsTot = el('fs-time-total');
  if (fsFill) fsFill.style.width = pct + '%';
  if (fsCur) fsCur.textContent = fmt(audio.currentTime);
  if (fsTot) fsTot.textContent = fmt(audio.duration);
}
function seekTo(e) {
  if (!audio.duration) return;
  const r = el('progress-track').getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  audio.currentTime = audio.duration * pct;
  const fill = el('progress-fill');
  fill.style.transition = 'none';
  fill.style.width = (pct * 100) + '%';
  requestAnimationFrame(() => { fill.style.transition = ''; });
}
function setVolume(e) {
  const r = el('volume-track').getBoundingClientRect();
  volume = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  audio.volume = volume;
  isMuted = volume === 0;
  el('volume-fill').style.width = (volume * 100) + '%';
  updateVolumeIcon();
}
function toggleMute() {
  isMuted = !isMuted;
  audio.volume = isMuted ? 0 : volume;
  const vf = el('volume-fill');
  if (vf) vf.style.width = (isMuted ? 0 : volume * 100) + '%';
  updateVolumeIcon();
  Store.setPlayerState({ volume: Math.round(volume * 100), muted: isMuted });
}
function updateVolumeIcon() {
  const btn = el('btn-vol');
  if (!btn) return;
  if (isMuted || volume === 0) {
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" width="17" height="17"><path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><line x1="22" y1="9" x2="16" y2="15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="16" y1="9" x2="22" y2="15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  } else {
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" width="17" height="17"><path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  }
}

/* Progress/volume drag: see bindPlayerUIControls() — runs after injectPlayer */

/* ══════════════════════════════════
   FAVOURITES (LOCAL + SUPABASE SYNC)
══════════════════════════════════ */
function isFav(title, artist) {
  if (title && typeof title === 'object') return Store.isFav(title);
  favourites = Store.getFavs();
  return Store.isFav(title, artist);
}

function applyLikeBtnState(btn, liked) {
  if (!btn) return;
  btn.classList.toggle('liked', !!liked);
  btn.title = liked ? 'Убрать' : 'В избранное';
  const path = btn.querySelector('path');
  if (path) {
    path.setAttribute('fill', liked ? 'currentColor' : 'none');
    path.style.fill = liked ? 'currentColor' : 'none';
  }
  const svg = btn.querySelector('svg');
  if (svg) svg.style.fill = liked ? 'var(--accent)' : 'none';
}

function toggleFavByIdx(idx, key, btn) {
  const t = _src[key]?.[idx]; if (!t) return;
  const added = Store.toggleFav({
    id: t.id,
    deezerId: deezerIdOf(t) || t.deezerId || null,
    title: t.title,
    artistName: t.artist?.name || '',
    artist: t.artist,
    cover: t.album?.cover_medium || '',
    album: t.album,
    duration: t.duration || 0,
    preview: t.preview || null
  });
  favourites = Store.getFavs();
  applyLikeBtnState(btn, added);
  updateFavBadge();
  syncFavIcons();
  if (typeof notifyLibraryChanged === 'function') notifyLibraryChanged();
  else {
    if (key === 'favs' || key === 'liked') {
      if (typeof renderLib === 'function') renderLib(typeof _pageLibTab !== 'undefined' ? _pageLibTab : 'tracks');
      if (typeof renderLikedPage === 'function') renderLikedPage();
    }
  }
}

function toggleFavPlayer() {
  const t=queue[queueIndex]; if (!t) return;
  const btn=el('player-like-btn');
  const added = Store.toggleFav({
    id: t.id,
    deezerId: deezerIdOf(t) || t.deezerId || null,
    title: t.title,
    artistName: t.artist?.name || t.artist || '',
    artist: t.artist,
    cover: t.album?.cover_medium || '',
    album: t.album,
    duration: t.duration || 0,
    preview: t.preview || null
  });
  favourites = Store.getFavs();
  applyLikeBtnState(btn, added);
  applyLikeBtnState(el('fs-like-btn'), added);
  updateFavBadge();
  syncFavIcons();
  if (typeof notifyLibraryChanged === 'function') notifyLibraryChanged();
}

function updateFavBtn() {
  const t=queue[queueIndex]; if (!t) return;
  const f = Store.isFav(t);
  applyLikeBtnState(el('player-like-btn'), f);
  applyLikeBtnState(el('fs-like-btn'), f);
}

function updateFavBadge() {
  const count = Store.getFavs().length;
  const badge = el('fav-count');
  if (badge) badge.textContent = count;
  favourites = Store.getFavs();
}

/* ══════════════════════════════════
   RESTORE PLAYER STATE
══════════════════════════════════ */
function restorePlayerState() {
  // BACKEND TODO: Синхронизация состояния плеера
  const saved = Store.getQueue();
  const pState = Store.getPlayerState() || {};
  if (saved?.queue?.length && saved.index >= 0) {
    queue      = saved.queue;
    queueIndex = saved.index;
    const t    = queue[queueIndex];
    if (t) {
      updatePlayerUI(t);
      updateFavBtn();
      renderQueuePanel();
      syncPlayingRows();
    } else {
      syncActiveTrackClass(null);
    }
  } else {
    syncActiveTrackClass(null);
  }
  const defVol = (typeof Store !== 'undefined' && Store.getSettings().defaultVolume != null)
    ? Store.getSettings().defaultVolume
    : 70;
  volume = (pState.volume ?? defVol) / 100;
    isMuted = pState.muted || false;
  isShuffle = !!pState.shuffle;
  isRepeat = pState.repeat || 'off';
    audio.volume = isMuted ? 0 : volume;
    const vfill = el('volume-fill');
    if (vfill) vfill.style.width = (volume * 100) + '%';
  if (typeof syncShuffleRepeatUi === 'function') syncShuffleRepeatUi();
  else {
    el('btn-shuffle')?.classList.toggle('active-btn', isShuffle);
    updateRepeatBtn();
  }
  updateVolumeIcon();

  // Restore source label for FS header
  currentSrcKey = String(pState.srcKey || '');
  currentSrcLabel = String(pState.srcLabel || '') || resolvePlaybackSourceLabel(currentSrcKey);
  window.currentSrcKey = currentSrcKey;
  window.currentSrcLabel = currentSrcLabel;
  if (typeof syncFsPlayerContext === 'function') syncFsPlayerContext();

  const t = queue[queueIndex];
  // Hard refresh: always start paused (soft-nav keeps the live audio element)
  _wantPlaying = false;
  try { Store.setPlayerState({ playing: false }); } catch (_) {}
  if (!t?.preview) {
    setPlayIcon(false);
    syncPlayingRows();
    return;
  }

  audio.src = t.preview;
  audio.volume = isMuted ? 0 : volume;

  const remember = typeof Store !== 'undefined' && Store.getSettings().rememberPosition !== false;
  const seekTo = remember ? Math.max(0, Number(pState.position) || 0) : 0;
  const applySeek = () => {
    if (seekTo > 0.25 && isFinite(audio.duration) && seekTo < audio.duration) {
      try { audio.currentTime = seekTo; } catch {}
    }
  };

  const finishPaused = () => {
    applySeek();
    try { audio.pause(); } catch (_) {}
    setPlayIcon(false);
    syncPlayingRows();
  };

  if (audio.readyState >= 1) finishPaused();
  else audio.addEventListener('loadedmetadata', finishPaused, { once: true });
  audio.load();
}
function syncFavIcons() {
  favourites = Store.getFavs();
  document.querySelectorAll('.track-like-btn').forEach(btn => {
    const item = btn.closest('.track-item');
    const tid = btn.dataset.favId || item?.dataset?.trackId || '';
    const title = btn.dataset.favTitle
      || item?.querySelector('.track-title')?.textContent?.trim()
      || '';
    let artist = btn.dataset.favArtist || '';
    if (!artist) {
      const artistEl = item?.querySelector('.track-artist');
      if (artistEl) {
        // Prefer link labels (multi-artist rows), strip preview badge
        const links = [...artistEl.querySelectorAll('.artist-link')].map(a => a.textContent.trim()).filter(Boolean);
        artist = links.length
          ? links[0]
          : artistEl.textContent.replace(/\s*(30 сек|нет превью)\s*/gi, ' ').trim();
      }
    }
    const fav = tid
      ? Store.isFav({ id: tid, title, artist })
      : Store.isFav(title, artist);
    applyLikeBtnState(btn, fav);
  });
  updateFavBtn();
}
window.syncFavIcons = syncFavIcons;
window.applyLikeBtnState = applyLikeBtnState;

function showFavourites() { showPage('library', qs('[data-page=library]')); renderLibrary('all'); }

function renderFavList() {
  const box=el('fav-list');
  if (!favourites.length) {
    box.innerHTML=`<div class="search-empty" style="padding:40px 0">
      <p style="color:var(--text-3)">Ты ещё не добавил ни одного трека.<br/>Найди музыку и нажми ♥</p></div>`;
    return;
  }
  const fake=favourites.map(f=>({
    id:f.id||0, title:f.title, artist:{name:f.artist},
    album:{cover_medium:f.cover,cover:f.cover},
    duration:f.duration||0, preview:f.preview||null, fullTrack:f.fullTrack||false
  }));
  _src['favs']=fake;
  box.innerHTML=`<div class="track-list">${fake.map((t,i)=>rowHTML(t,i,'favs')).join('')}</div>`;
}

/* Синхронизация с Supabase */
async function syncFavToSupabase() {
  try {
    // Отправляем избранное на сервер для сохранения в Supabase
    // (реализуется при наличии API эндпоинта)
  } catch (err) {
    console.error('Sync error:', err);
  }
}

/* ══════════════════════════════════
   RECENT
══════════════════════════════════ */
function addToRecent(t) {
  Store.addRecent(t);
  recentTracks = Store.getRecent();
  if (typeof renderHomeRecent === 'function') renderHomeRecent();
  else if (typeof window.renderHomeRecent === 'function') window.renderHomeRecent();
}

/* ══════════════════════════════════
   QUEUE
══════════════════════════════════ */
function toggleQueue() {
  const queuePanel = el('queue-panel');
  const npPanel    = el('now-playing-panel');
  const queueOpen  = !queuePanel.classList.contains('hidden');

  if (queueOpen) {
    // закрываем очередь
    queuePanel.classList.add('hidden');
    document.body.style.setProperty('--np-w', '0px');
  } else {
    // закрываем карточку если открыта, открываем очередь
    npPanel.classList.add('hidden');
    queuePanel.classList.remove('hidden');
    document.body.style.setProperty('--np-w', '308px');
    renderQueuePanel();
  }
}
function renderQueuePanel() {
  const box = el('queue-list');
  if (!queue.length) {
    box.innerHTML = `<div style="padding:24px;color:var(--text-3);font-size:13px;text-align:center">Очередь пуста</div>`;
    return;
  }

  const current = queue[queueIndex];
  const next    = queue.slice(queueIndex + 1);

  const trackHTML = (t, i, isNext) => `
    <div class="queue-item${!isNext ? ' current' : ''}" onclick="queueIndex=${i};playNow()">
      ${t.album?.cover_medium
        ? `<img class="queue-item-cover" src="${esc(t.album.cover_medium)}" alt="" loading="lazy">`
        : `<div class="queue-item-cover" style="display:flex;align-items:center;justify-content:center;color:var(--accent)">♪</div>`}
      <div class="queue-item-info">
        <div class="queue-item-title">${esc(t.title)}</div>
        <div class="queue-item-artist">${esc(t.artist?.name || '')}</div>
      </div>
      ${!isNext ? `<div class="queue-item-num" style="color:var(--accent)">▶</div>` : ``}
    </div>`;

  box.innerHTML = `
    <div class="queue-section-title">Сейчас играет</div>
    ${trackHTML(current, queueIndex, false)}
    ${next.length ? `
      <div class="queue-section-title" style="margin-top:8px">Далее</div>
      ${next.map((t, i) => trackHTML(t, queueIndex + 1 + i, true)).join('')}
    ` : ''}
  `;
}

/* ══════════════════════════════════
   NAVIGATION
══════════════════════════════════ */
/* ══════════════════════════════════
   NAVIGATION — SPA History Stack
══════════════════════════════════ */
const _navStack = [];   // [{pageId, navEl, label}]
let   _navPos   = -1;  // текущая позиция в стеке

function showPage(pageId, navEl, pushHistory = true) {
  qsAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById('page-' + pageId)?.classList.remove('hidden');
  qsAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (navEl) navEl.classList.add('active');
  if (pageId === 'library') renderLibrary('all');

  if (pushHistory) {
    // обрезаем «будущее» если мы не в конце стека
    if (_navPos < _navStack.length - 1) {
      _navStack.splice(_navPos + 1);
    }
    _navStack.push({ pageId, label: pageId });
    _navPos = _navStack.length - 1;
  }

  updateNavBtns();
}

function historyBack() {
  if (_navPos <= 0) return;
  _navPos--;
  const { pageId } = _navStack[_navPos];
  // найдём nav-элемент для этой страницы
  const navEl = qs(`[data-page="${pageId}"]`);
  showPage(pageId, navEl, false);
}

function historyFwd() {
  if (_navPos >= _navStack.length - 1) return;
  _navPos++;
  const { pageId } = _navStack[_navPos];
  const navEl = qs(`[data-page="${pageId}"]`);
  showPage(pageId, navEl, false);
}

function updateNavBtns() {
  // Prefer soft-nav chrome updater (real in-app history)
  if (typeof updateChromeNavButtons === 'function') {
    updateChromeNavButtons();
    return;
  }
  const btnBack = el('btn-nav-back');
  const btnFwd  = el('btn-nav-fwd');
  const canBack = _navPos > 0;
  const canFwd = _navPos < _navStack.length - 1;
  if (btnBack) {
    btnBack.style.opacity = canBack ? '1' : '0.4';
    btnBack.classList.toggle('is-disabled', !canBack);
  }
  if (btnFwd) {
    btnFwd.style.opacity = canFwd ? '1' : '0.4';
    btnFwd.classList.toggle('is-disabled', !canFwd);
  }
}

/* ══════════════════════════════════
   NOTIFICATION — alias to shared showNotif (one toast style)
══════════════════════════════════ */
function showNotification(msg){
  if (typeof showNotif === 'function') return showNotif(msg, 1400);
  console.log('[NOVALIBER]', msg);
}

/* ══════════════════════════════════
   HELPERS
   el / qs already defined in shared.js — do not redeclare
══════════════════════════════════ */
function qsAll(sel) { return document.querySelectorAll(sel); }
const enc   = s   => encodeURIComponent(s);
const clean = s   => String(s).toLowerCase().replace(/[^a-zа-я0-9]/gi,'').trim();

function fmt(sec){
  if(!sec||!isFinite(sec))return'0:00';
  return`${Math.floor(sec/60)}:${String(Math.floor(sec%60)).padStart(2,'0')}`;
}
function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function ejson(s){
  return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/[\n\r]/g,'');
}
function noteSVG(){
  return`<svg viewBox="0 0 24 24" fill="none" width="22" height="22" style="color:var(--text-3)">
    <path d="M9 18V6l12-3v12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="1.8"/>
    <circle cx="18" cy="15" r="3" stroke="currentColor" stroke-width="1.8"/>
  </svg>`;
}
function loaderHTML(msg){
  if (typeof loaderHTMLShared === 'function') return loaderHTMLShared(msg);
  const spin = typeof mrfBallSpinHTML === 'function'
    ? mrfBallSpinHTML()
    : '<span class="mrf-ball-spin" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>';
  return `<div class="loading-placeholder">${spin}${msg ? `<span>${msg}</span>` : ''}</div>`;
}

/* ══════════════════════════════════
   SIDEBAR RESIZE + COLLAPSE
══════════════════════════════════ */
/* ══════════════════════════════════
   SIDEBAR COLLAPSE
══════════════════════════════════ */
(function() {
  const DEFAULT_W = 240, COLLAPSED_W = 60;

  const isCollapsed = localStorage.getItem('mrf_sidebar_collapsed') === '1';

  function setWidth(w) {
    document.body.style.setProperty('--sidebar-w', w + 'px');
  }

  if (isCollapsed) {
    document.body.classList.add('sidebar-collapsed');
    setWidth(COLLAPSED_W);
  } else {
    setWidth(DEFAULT_W);
  }
})();

function toggleSidebar() {
  const COLLAPSED_W = 60, DEFAULT_W = 240;
  const collapsed = document.body.classList.toggle('sidebar-collapsed');
  document.body.style.setProperty('--sidebar-w', collapsed ? COLLAPSED_W + 'px' : DEFAULT_W + 'px');
  localStorage.setItem('mrf_sidebar_collapsed', collapsed ? '1' : '0');
}
function toggleNowPlaying() {
  const panel = el('now-playing-panel');
  if (!queue[queueIndex]) return;
  const isOpen = !panel.classList.contains('hidden');
  if (isOpen) closeNowPlaying();
  else openNowPlaying();
}

function openNowPlaying() {
  el('queue-panel').classList.add('hidden');
  el('now-playing-panel').classList.remove('hidden');
  document.body.style.setProperty('--np-w', '328px');
}

function closeNowPlaying() {
  el('now-playing-panel').classList.add('hidden');
  document.body.style.setProperty('--np-w', '0px');
  stopLrcSync();
}

function updateNowPlayingPanel(track) {
  const panel = el('now-playing-panel');
  if (!panel) return;
  const t = track || queue[queueIndex];
  if (!t) return;

  const cover = t.album?.cover_medium || t.album?.cover || t.cover || '';
  const npCover = el('np-cover');
  if (npCover) npCover.style.background = cover ? `url("${cover}") center/cover` : 'var(--bg-3)';

  const npTitle = el('np-title');
  if (npTitle) npTitle.textContent = t.title || '—';

  const npArtistName = el('np-artist-name');
  if (npArtistName) {
    npArtistName.innerHTML = typeof artistsLinksHTML === 'function'
      ? artistsLinksHTML(t, 'artist-link')
      : esc(formatArtistsText(t) || t.artist?.name || t.artist || '—');
  }

  const npArtistNameBig = el('np-artist-name-big');
  if (npArtistNameBig) {
    npArtistNameBig.innerHTML = typeof artistsLinksHTML === 'function'
      ? artistsLinksHTML(t, 'artist-link')
      : esc(formatArtistsText(t) || t.artist?.name || t.artist || '—');
  }

  const npArtistBtn = el('np-artist-btn');
  if (npArtistBtn) {
    npArtistBtn.onclick = () => { closeNowPlaying(); goToNpArtist(); };
  }

  const artistCover = el('np-artist-cover');
  if (artistCover) {
    const artistPic = t.artist?.picture_medium || '';
    artistCover.style.background = artistPic ? `url("${artistPic}") center top/cover` : 'var(--bg-3)';
    if (!artistPic && t.artist?.id) {
      dzObj(`/artist/${t.artist.id}`).then(info => {
        if (queue[queueIndex]?.id !== t.id) return;
        const pic = info.picture_medium || info.picture_xl || '';
        if (pic) artistCover.style.background = `url("${pic}") center top/cover`;
      }).catch(() => {});
    }
  }

  const npArtistWrap = el('np-artist-cover-wrap');
  if (npArtistWrap) {
    npArtistWrap.onclick = () => { closeNowPlaying(); goToNpArtist(); };
  }

  // загружаем текст
  loadLyrics(t.title || '', t.artist?.name || t.artist || '', t.duration || 0);
}

function goToNpArtist() {
  const t = queue[queueIndex]; if (!t) return;
  const id = t.artist?.id || t.artistId || null;
  const name = t.artist?.name || (typeof t.artist === 'string' ? t.artist : '') || '';
  if (id || name) {
    closeNowPlaying();
    openArtist(id, name);
  } else {
    showNotif?.('Артист не найден');
  }
}

/* ══════════════════════════════════
   LYRICS — LRCLIB
══════════════════════════════════ */
let _lrcLines  = [];   // [{time, text}]
let _lrcTimer  = null;
let _lrcActive = -1;
let _lrcFullDuration = 0; // полная длина трека для масштабирования

async function loadLyrics(title, artist, duration) {
  const box = el('np-lyrics');
  if (!box) return;

  _lrcLines  = [];
  _lrcActive = -1;
  stopLrcSync();

  box.innerHTML = '<div class="np-lyrics-loading"><div class="spinner" style="width:14px;height:14px"></div> Загружаем текст…</div>';

  try {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    if (duration) params.set('duration', Math.round(duration));

    const res  = await fetch(`https://lrclib.net/api/get?${params}`);
    if (!res.ok) throw new Error('not found');
    const data = await res.json();

    const lyrics = data.plainLyrics || (data.syncedLyrics ? stripLrcTimecodes(data.syncedLyrics) : null);

    if (lyrics) {
      box.innerHTML = lyrics
        .split('\n')
        .filter(l => l.trim())
        .map(l => `<div class="np-lyrics-line">${esc(l)}</div>`)
        .join('');
    } else {
      box.innerHTML = '<div class="np-lyrics-empty">Текст не найден</div>';
    }
  } catch {
    box.innerHTML = '<div class="np-lyrics-empty">Текст не найден</div>';
  }
}

function stripLrcTimecodes(lrc) {
  return lrc
    .split('\n')
    .map(l => l.replace(/\[\d{2}:\d{2}\.\d+\]/g, '').trim())
    .filter(l => l)
    .join('\n');
}

function parseLrc(lrc) { return []; } // не используется

function renderLrcLines(box) {}
function startLrcSync() {}
function stopLrcSync() { clearInterval(_lrcTimer); }
function syncLrc() {}
function getLrcOffset() { return 0; }

/* ══════════════════════════════════
   HOME SECTIONS
══════════════════════════════════ */
function renderHomeSections() {
  renderRecentGrid();
  renderMoodGrid();
  renderRecommendations();
}

function renderRecentGrid() {
  const box = el('recent-grid'); if (!box) return;
  const items = recentTracks.length ? recentTracks : MOCK.recentlyPlayed;
  if (!items.length) { box.innerHTML = '<p style="color:var(--text-3);font-size:13px">Пока ничего нет</p>'; return; }
  box.innerHTML = items.slice(0, 6).map(t => `
    <div class="quick-item" onclick="playFromRecent('${esc(t.title||'')}','${esc(t.artist?.name||t.artist||'')}')">
      ${t.cover || t.album?.cover_medium
        ? `<img src="${t.cover || t.album?.cover_medium}" class="quick-cover" alt="" loading="lazy" onerror="this.style.display='none'">`
        : `<div class="quick-cover" style="display:flex;align-items:center;justify-content:center;color:var(--accent)">${noteSVG()}</div>`}
      <div class="quick-item-info">
        <div class="quick-item-title">${esc(t.title||'')}</div>
        <div class="quick-item-sub">${esc(t.artist?.name||t.artist||'')}</div>
      </div>
    </div>`).join('');
}

function renderMoodGrid() {
  const box = el('mood-grid'); if (!box) return;
  box.className = 'mood-rail';
  box.innerHTML = MOCK.moods.map(m => `
    <button type="button" class="mood-card" data-explore-kind="mood" data-explore-id="${esc(m.id)}" data-explore-name="${esc(m.name)}" data-explore-tag="${esc(m.tag)}" data-explore-color="${esc(m.color || '')}" data-explore-cover="${esc(m.image || '')}">
      <span class="mood-card-media" style="background-image:url('${m.image || ''}');background-color:${m.color || '#222'}"></span>
      <span class="mood-card-shade"></span>
      <span class="mood-card-copy">
        <span class="mood-card-name">${esc(m.name)}</span>
        <span class="mood-card-hint">${esc(m.hint || '')}</span>
      </span>
    </button>`).join('');
  if (box.dataset.exploreBound !== '1') {
    box.dataset.exploreBound = '1';
    box.addEventListener('click', (e) => {
      const btn = e.target.closest?.('[data-explore-kind]');
      if (!btn) return;
      const spec = {
        kind: btn.getAttribute('data-explore-kind'),
        id: btn.getAttribute('data-explore-id'),
        name: btn.getAttribute('data-explore-name'),
        tag: btn.getAttribute('data-explore-tag'),
        color: btn.getAttribute('data-explore-color'),
        cover: btn.getAttribute('data-explore-cover')
      };
      if (typeof openExploreMix === 'function') openExploreMix(spec);
      else if (typeof searchByTag === 'function') searchByTag(spec.tag || '');
    });
  }
}

function renderRecommendations() {
  const box = el('recommendations-row'); if (!box) return;
  // BACKEND TODO: Получение персональных рекомендаций
  box.innerHTML = MOCK.recommendations.map((t, i) => `
    <div class="horiz-card" onclick="searchByTag('${esc(t.artist.name)}')">
      ${t.album?.cover_medium
        ? `<img src="${t.album.cover_medium}" class="horiz-card-cover" alt="" loading="lazy">`
        : `<div class="horiz-card-cover-placeholder">${noteSVG()}</div>`}
      <div class="horiz-card-title">${esc(t.title)}</div>
      <div class="horiz-card-sub">${esc(t.artist.name)}</div>
    </div>`).join('');
}

function playFromRecent(title, artist) {
  // ищем трек в кэше
  for (const key in _src) {
    const idx = _src[key]?.findIndex(t =>
      (t.title||'').toLowerCase() === title.toLowerCase() &&
      (t.artist?.name||'').toLowerCase() === artist.toLowerCase()
    );
    if (idx >= 0) { playFromSrc(key, idx); return; }
  }
  // если не нашли — ищем через Deezer
  runSearch(title + ' ' + artist);
}

/* Sidebar playlists: implemented in shared.js (do not shadow renderSidebarPlaylists here) */

/* ══════════════════════════════════
   LIBRARY
══════════════════════════════════ */
let _libView = 'grid';
let _libTab  = 'all';

function setLibView(view) {
  _libView = view;
  el('lib-view-grid')?.classList.toggle('active', view === 'grid');
  el('lib-view-list')?.classList.toggle('active', view === 'list');
  renderLibrary(_libTab);
}

function switchLibTab(tab, btn) {
  _libTab = tab;
  qsAll('.lib-filter').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderLibrary(tab);
}

function renderLibrary(tab) {
  const box = el('library-content'); if (!box) return;
  _libTab = tab || _libTab;
  let html = '';

  if (tab === 'all' || tab === 'playlists') {
    html += renderLibPlaylists();
  }
  if (tab === 'all' || tab === 'tracks') {
    html += renderLibFavTracks();
  }
  if (tab === 'all' || tab === 'artists') {
    html += renderLibArtists();
  }
  if (tab === 'all' || tab === 'albums') {
    html += renderLibAlbums();
  }

  box.innerHTML = html || '<div class="search-empty" style="padding:40px 0"><p style="color:var(--text-3)">Здесь пока ничего нет</p></div>';
}

function renderLibPlaylists() {
  const pls = MOCK.playlists;
  if (!pls.length) return '';

  if (_libView === 'grid') {
    return `
      <div class="section" style="margin-bottom:32px">
        <div class="section-header"><h3 class="section-title" style="font-size:16px">Плейлисты</h3></div>
        <div class="lib-grid">
          ${pls.map(pl => `
            <div class="lib-card" onclick="openPlaylistPage('${pl.id}')">
              ${pl.cover
                ? `<img src="${pl.cover}" class="lib-card-cover" alt="" loading="lazy">`
                : `<div class="lib-card-cover-placeholder">${noteSVG()}</div>`}
              <div class="lib-card-body">
                <div class="lib-card-title">${esc(pl.name)}</div>
                <div class="lib-card-sub">${pl.trackCount} треков</div>
              </div>
              <div class="lib-card-actions">
                <button class="lib-card-btn" onclick="event.stopPropagation();confirmDeletePlaylist('${pl.id}')" title="Удалить">
                  <svg viewBox="0 0 24 24" fill="none" width="13" height="13"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                </button>
              </div>
            </div>`).join('')}
          <div class="lib-card" style="border-style:dashed;cursor:pointer" onclick="showCreatePlaylist()">
            <div class="lib-card-cover-placeholder">
              <svg viewBox="0 0 24 24" fill="none" width="32" height="32" style="color:var(--text-3)"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </div>
            <div class="lib-card-body">
              <div class="lib-card-title" style="color:var(--text-3)">Создать плейлист</div>
            </div>
          </div>
        </div>
      </div>`;
  } else {
    return `
      <div class="section" style="margin-bottom:32px">
        <div class="section-header"><h3 class="section-title" style="font-size:16px">Плейлисты</h3></div>
        <div class="lib-list">
          ${pls.map(pl => `
            <div class="lib-list-item" onclick="openPlaylistPage('${pl.id}')">
              ${pl.cover
                ? `<img src="${pl.cover}" class="lib-list-cover" alt="" loading="lazy">`
                : `<div class="lib-list-cover" style="display:flex;align-items:center;justify-content:center;border-radius:6px;background:var(--bg-3)">${noteSVG()}</div>`}
              <div class="lib-list-info">
                <div class="lib-list-title">${esc(pl.name)}</div>
                <div class="lib-list-sub">Плейлист · ${pl.trackCount} треков</div>
              </div>
              <div class="lib-list-actions">
                <button class="lib-card-btn" onclick="event.stopPropagation();confirmDeletePlaylist('${pl.id}')" title="Удалить">
                  <svg viewBox="0 0 24 24" fill="none" width="13" height="13"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                </button>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  }
}

function renderLibFavTracks() {
  if (!favourites.length) return `
    <div class="section" style="margin-bottom:32px">
      <div class="section-header"><h3 class="section-title" style="font-size:16px">Любимые треки</h3></div>
      <div class="search-empty" style="padding:30px 0"><p style="color:var(--text-3)">Нажми ♥ на любом треке, чтобы добавить его сюда</p></div>
    </div>`;

  const fake = favourites.map(f => ({
    id: f.id||0, title: f.title,
    artist: { name: f.artist },
    album: { cover_medium: f.cover, cover: f.cover },
    duration: f.duration||0, preview: f.preview||null, fullTrack: f.fullTrack||false
  }));
  _src['favs'] = fake;

  return `
    <div class="section" style="margin-bottom:32px">
      <div class="section-header">
        <h3 class="section-title" style="font-size:16px">Любимые треки <span style="font-size:12px;color:var(--text-3);font-weight:400">${favourites.length}</span></h3>
        <button class="btn-primary" style="padding:7px 14px;font-size:12px" onclick="playFromSrc('favs',0)">
          <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><polygon points="5,3 19,12 5,21"/></svg>
          Слушать всё
        </button>
      </div>
      <div id="fav-list" class="track-list">${fake.map((t,i) => rowHTML(t,i,'favs')).join('')}</div>
    </div>`;
}

function renderLibArtists() {
  const artists = MOCK.followedArtists;
  if (!artists.length) return '';
  return `
    <div class="section" style="margin-bottom:32px">
      <div class="section-header"><h3 class="section-title" style="font-size:16px">Исполнители</h3></div>
      <div class="artists-grid">
        ${artists.map(a => `
          <div class="artist-card" onclick="openArtist(${a.id},'${ejson(a.name)}')">
            ${a.picture_medium
              ? `<img class="artist-img" src="${a.picture_medium}" alt="" loading="lazy">`
              : `<div class="artist-img-placeholder">${(a.name||'?')[0]}</div>`}
            <div class="artist-name">${esc(a.name)}</div>
            <div class="artist-listeners">${a.nb_fan ? (+a.nb_fan).toLocaleString('ru') + ' фанатов' : ''}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

function renderLibAlbums() {
  // BACKEND TODO: Получение сохранённых альбомов пользователя
  return '';
}

/* ══════════════════════════════════
   PLAYLIST PAGE
══════════════════════════════════ */
function openPlaylistPage(id) {
  const pl = Store.getPlaylist(id) || MOCK.playlists.find(p => String(p.id) === String(id));
  if (!pl) { showNotif?.('Плейлист не найден'); return; }
  const url = typeof mrfUrl === 'function' ? mrfUrl('playlist', { id: pl.id }) : `playlist.html?id=${encodeURIComponent(pl.id)}`;
  if (typeof mrfGo === 'function') mrfGo(url);
  else location.href = url;
}

/* ══════════════════════════════════
   MODALS — реализованы в shared.js
══════════════════════════════════ */
function confirmDeletePlaylist(id) {
  if (!confirm('Удалить плейлист?')) return;
  mockDeletePlaylist(id);
  if (typeof renderLibrary === 'function' && typeof _libTab !== 'undefined') renderLibrary(_libTab);
  if (typeof renderSidebarPlaylists === 'function') renderSidebarPlaylists();
  showNotification('Плейлист удалён');
}

/* ══════════════════════════════════
   CONTEXT MENU
══════════════════════════════════ */
let _ctxMenu = null;

/** «Удалить из плейлиста» — только свои плейлисты (не микс / не день / не readOnly) */
function isOwnedPlaylistSrcKey(key) {
  const k = String(key || '');
  if (!k.startsWith('pl_')) return false;
  const id = k.slice(3);
  if (!id || id.startsWith('rec_')) return false;
  const pl = (typeof Store !== 'undefined' && Store.getPlaylist) ? Store.getPlaylist(id) : null;
  if (!pl || pl.readOnly) return false;
  return true;
}
window.isOwnedPlaylistSrcKey = isOwnedPlaylistSrcKey;

function showTrackMenu(e, idx, key) {
  e.preventDefault();
  e.stopPropagation();
  hideTrackMenu(true);
  const t = _src[key]?.[idx];
  if (!t) return;

  const fav = Store.isFav(t);
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.addEventListener('click', ev => ev.stopPropagation());

  let x = e.clientX;
  let y = e.clientY;
  const btn = e.currentTarget?.closest?.('.track-menu-btn') || e.target?.closest?.('.track-menu-btn');
  if (btn) {
    const br = btn.getBoundingClientRect();
    x = br.right;
    y = br.bottom + 6;
  }

  const artistId = t.artist?.id || trackArtists(t)[0]?.id || null;
  const artistName = t.artist?.name || trackArtists(t)[0]?.name || '';
  const albumId = t.album?.id || null;
  const albumTitle = t.album?.title || '';
  const trackId = t.deezerId || String(t.id || '').replace(/^dz_/i, '') || t.id;
  const canRemoveFromPl = isOwnedPlaylistSrcKey(key);

  const item = (action, icon, label, danger) =>
    `<button type="button" class="ctx-item${danger ? ' ctx-item-danger' : ''}" data-ctx="${action}">${icon}${label}</button>`;

  const icoPlay = `<svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><polygon points="5,3 19,12 5,21"/></svg>`;
  const icoQueue = `<svg viewBox="0 0 24 24" fill="none" width="15" height="15"><path d="M3 6h18M3 12h12M3 18h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  const icoNext = `<svg viewBox="0 0 24 24" fill="none" width="15" height="15"><path d="M5 4l10 8-10 8V4zM19 4v16" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  const icoHeart = `<svg viewBox="0 0 24 24" fill="${fav ? 'currentColor' : 'none'}" width="15" height="15"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke="currentColor" stroke-width="1.8"/></svg>`;
  const icoPlus = `<svg viewBox="0 0 24 24" fill="none" width="15" height="15"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

  menu.innerHTML = `
    ${item('play', icoPlay, 'Воспроизвести')}
    ${item('queue', icoQueue, 'Добавить в очередь')}
    ${item('next', icoNext, 'Воспроизвести следующим')}
    <div class="ctx-divider"></div>
    ${item('fav', icoHeart, fav ? 'Удалить из избранного' : 'Добавить в избранное')}
    ${item('playlist', icoPlus, 'Добавить в плейлист')}
    ${canRemoveFromPl ? item('rm-pl', '', 'Удалить из плейлиста', true) : ''}
    <div class="ctx-divider"></div>
    ${albumId ? item('album', '', 'К альбому') : ''}
    ${artistName || artistId ? item('artist', '', 'К исполнителю') : ''}
    ${item('track', '', 'Страница трека')}
    ${item('share', '', 'Поделиться')}
    ${key === 'favs' || key === 'liked' ? `<div class="ctx-divider"></div>${item('rm-lib', '', 'Удалить из библиотеки', true)}` : ''}
  `;

  menu.addEventListener('click', ev => {
    const elBtn = ev.target.closest?.('[data-ctx]');
    if (!elBtn) return;
    const act = elBtn.getAttribute('data-ctx');
    hideTrackMenu();
    const go = (url) => {
      if (typeof mrfGo === 'function') mrfGo(url);
      else location.href = url;
    };
    if (act === 'play') playFromSrc(key, idx);
    else if (act === 'queue') addToQueue(t);
    else if (act === 'next') playNext(t);
    else if (act === 'fav' || act === 'rm-lib') {
      toggleFavFromMenu(idx, key);
      if (act === 'rm-lib') {
        if (typeof renderLib === 'function') renderLib(typeof _pageLibTab !== 'undefined' ? _pageLibTab : 'tracks');
        if (typeof renderLikedPage === 'function') renderLikedPage();
      }
    }
    else if (act === 'playlist') showAddToPlaylist(t);
    else if (act === 'rm-pl' && typeof removeTrackFromPlaylistCtx === 'function') removeTrackFromPlaylistCtx(key, idx);
    else if (act === 'album' && albumId) {
      if (typeof openSavedAlbum === 'function') openSavedAlbum(albumId, albumTitle, artistName);
      else go(mrfUrl('album', { id: albumId, title: albumTitle, artist: artistName }));
    }
    else if (act === 'artist') openArtist(artistId || null, artistName);
    else if (act === 'track') {
      go(typeof mrfUrl === 'function' ? mrfUrl('track', { id: trackId }) : `track.html?id=${encodeURIComponent(trackId)}`);
    }
    else if (act === 'share') {
      if (typeof shareTrack === 'function') shareTrack(t);
      else {
        const url = `${location.origin}${location.pathname.replace(/[^/]+$/, '')}track.html?id=${encodeURIComponent(trackId)}`;
        navigator.clipboard?.writeText?.(url)?.then?.(() => showNotif?.('Ссылка скопирована'));
      }
    }
  });

  // Mount off-screen measure, then place + open smoothly (no jump)
  menu.style.position = 'fixed';
  menu.style.left = '-9999px';
  menu.style.top = '0';
  menu.style.zIndex = '4000';
  document.body.appendChild(menu);
  _ctxMenu = menu;
  const r = menu.getBoundingClientRect();
  let left = x - r.width;
  let top = y;
  if (left < 8) left = Math.min(x, innerWidth - r.width - 8);
  if (left < 8) left = 8;
  if (top + r.height > innerHeight - 8) top = Math.max(8, y - r.height - 8);
  if (top < 8) top = 8;
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => menu.classList.add('is-open'));
  });
  setTimeout(() => document.addEventListener('click', hideTrackMenu, { once: true }), 0);
}
window.showTrackMenu = showTrackMenu;
window.__bindCtxMenu = function (el) { _ctxMenu = el; };

function hideTrackMenu(instant) {
  if (!_ctxMenu) return;
  const menu = _ctxMenu;
  _ctxMenu = null;
  if (instant) {
    menu.remove();
    return;
  }
  menu.classList.remove('is-open');
  menu.classList.add('is-closing');
  const done = () => menu.remove();
  menu.addEventListener('transitionend', done, { once: true });
  setTimeout(done, 220);
}
window.hideTrackMenu = hideTrackMenu;

function toggleFavFromMenu(idx, key) {
  const t = _src[key]?.[idx]; if (!t) return;
  const added = Store.toggleFav({
    id: t.id,
    deezerId: deezerIdOf(t) || t.deezerId || null,
    title: t.title,
    artistName: t.artist?.name || '',
    artist: t.artist,
    cover: t.album?.cover_medium || '',
    album: t.album,
    duration: t.duration || 0,
    preview: t.preview || null
  });
  favourites = Store.getFavs();
  updateFavBadge();
  syncFavIcons();
  if (typeof notifyLibraryChanged === 'function') notifyLibraryChanged();
}
window.toggleFavFromMenu = toggleFavFromMenu;

function removeFromQueue(idx, key) {
  if (key === 'charts' || key === 'home' || key.startsWith('s-') || key.startsWith('art_') || key.startsWith('alb_')) return;
  // убираем из плейлиста
  const plId = key.replace('pl_', '');
  mockRemoveFromPlaylist(plId, _src[key]?.[idx]?.id);
  renderLibrary(_libTab);
}
