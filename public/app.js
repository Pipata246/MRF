/* =====================================================
   MRF — Music Streaming
   API:   Deezer JSONP  (быстро, фото, обложки, много треков)
   Audio: HTML5 Audio   (30-сек превью Deezer)
   DB:    Supabase      (избранное, история)
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
let _persistPosTimer = null;
let _audioBound = false;
let _navHandlersBound = false;

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
function dz(path) {
  return new Promise((resolve, reject) => {
    const cb  = '__dz' + (++_cbId);
    const tag = document.createElement('script');
    const tid = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, 10000);
    window[cb] = data => { cleanup(); resolve(data); };
    function cleanup() { clearTimeout(tid); delete window[cb]; tag.remove(); }
    const sep = path.includes('?') ? '&' : '?';
    tag.src   = `${DZ}${path}${sep}callback=${cb}&output=jsonp`;
    tag.onerror = () => { cleanup(); reject(new Error('error')); };
    document.head.appendChild(tag);
  });
}

/* data[] из ответа */
async function dzArr(path) {
  try { const j = await dz(path); return j.data || []; }
  catch { return []; }
}

/* объект из ответа (артист, альбом) */
async function dzObj(path) {
  try { return await dz(path); }
  catch { return {}; }
}

/* ══════════════════════════════════
   NORMALISE Deezer track
══════════════════════════════════ */
function normDZ(t) {
  return {
    id:        `dz_${t.id}`,
    deezerId:  t.id,
    title:     t.title || t.name || '',
    artist:    {
      id:             t.artist?.id,
      name:           t.artist?.name || '',
      picture_medium: t.artist?.picture_medium || '',
      picture_xl:     t.artist?.picture_xl     || ''
    },
    album: {
      id:           t.album?.id,
      title:        t.album?.title || '',
      cover_medium: t.album?.cover_medium || '',
      cover:        t.album?.cover        || ''
    },
    duration:  t.duration || 0,
    preview:   t.preview  || null,
    fullTrack: false,
    source:    'deezer'
  };
}

/* ══════════════════════════════════
   AUDIO
══════════════════════════════════ */
function bindAudio() {
  if (_audioBound) return;
  _audioBound = true;

  audio.addEventListener('play', () => {
    isPlaying = true;
    _wantPlaying = true;
    setPlayIcon(true);
    startProgress();
    persistPlayer();
  });
  audio.addEventListener('pause', () => {
    isPlaying = false;
    setPlayIcon(false);
    stopProgress();
    // Unload/navigation also fires pause — keep _wantPlaying so next page can resume
    if (document.visibilityState === 'hidden') {
      persistPlayer(true);
      return;
    }
    _wantPlaying = false;
    persistPlayer();
  });
  audio.addEventListener('ended', () => {
    stopProgress();
    if (isRepeat === 'one') { audio.currentTime = 0; audio.play(); }
    else { nextTrack(); }
  });
  audio.addEventListener('error', () => {
    isPlaying = false;
    _wantPlaying = false;
    setPlayIcon(false);
    showNotification('Ошибка воспроизведения');
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
  // already on search page with page script — use doSearch
  if (/search(\.html)?$/i.test(location.pathname)) {
    if (typeof doSearch === 'function' && query) doSearch(query);
    else if (!query && typeof showSearchInitial === 'function') showSearchInitial();
    return;
  }
  const url = typeof mrfUrl === 'function'
    ? mrfUrl('search', query ? { q: query } : null)
    : (query ? `search?q=${encodeURIComponent(query)}` : 'search.html');
  (typeof mrfGo === 'function' ? mrfGo : (u) => { location.href = u; })(url);
}

function bindSearch() {
  const top = el('main-search-input');
  const big = el('big-search-input');
  [top, big].filter(Boolean).forEach(inp => {
    if (inp.dataset.boundSearch === '1') return;
    inp.dataset.boundSearch = '1';
    inp.addEventListener('input', () => {
      const q = inp.value.trim();
      if (top && inp !== top) top.value = q;
      if (big && inp !== big) big.value = q;
      const clearBtn = el('search-clear');
      if (clearBtn) clearBtn.classList.toggle('hidden', !q);
      clearTimeout(searchTimer);
      // multipage: only auto-search when search page handlers exist
      if (typeof pageRunSearch === 'function') {
        if (!q) { showSearchInitial?.(); return; }
        searchTimer = setTimeout(() => pageRunSearch(q), 380);
        return;
      }
      // legacy SPA markup only
      if (document.getElementById('page-search')) {
        if (q.length < 2) { showSearchEmpty(); return; }
        searchTimer = setTimeout(() => runSearch(q), 380);
      }
    });
    inp.addEventListener('focus', () => {
      if (document.getElementById('page-search')) {
        showPage('search', qs('[data-page=search]'));
      }
    });
    inp.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const q = inp.value.trim();
      if (q.length < 1) return;
      if (typeof doSearch === 'function' || typeof pageRunSearch === 'function') {
        goSearchPage(q);
      } else if (document.getElementById('page-search')) {
        runSearch(q);
      } else {
        goSearchPage(q);
      }
    });
  });
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

function rowHTML(t, i, key) {
  const title   = esc(t.title || '');
  const artist  = esc(t.artist?.name || '');
  const cover   = t.album?.cover_medium || t.album?.cover || '';
  const dur     = t.duration ? fmt(t.duration) : '';
  const fav     = isFav(t.title||'', t.artist?.name||'');
  const playing = queueIndex>=0 && queue[queueIndex]?.id===t.id;

  const badge = t.preview
    ? `<span class="src-badge preview">30 сек</span>`
    : `<span class="src-badge none">нет превью</span>`;

  const playIco = `<svg class="play-hover" viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M8 5v14l11-7z"/></svg>`;
  return `
  <div class="track-item${playing?' playing':''}" data-track-idx="${i}" data-track-key="${esc(key)}" onclick="playFromSrc('${esc(key)}',${i})" oncontextmenu="showTrackMenu(event,${i},'${esc(key)}');return false">
    <div class="track-num">
      <span class="num-text">${playing ? '' : (i + 1)}</span>
      ${playIco}
    </div>
    ${cover
      ? `<img class="track-cover" src="${cover}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : `<div class="track-cover-placeholder">${noteSVG()}</div>`}
    <div class="track-info">
      <div class="track-title">${title}</div>
      <div class="track-artist">${artist} ${badge}</div>
    </div>
    <div class="track-duration">${dur}</div>
    <button class="track-like-btn${fav?' liked':''}"
      onclick="event.stopPropagation();toggleFavByIdx(${i},'${esc(key)}',this)"
      title="${fav?'Убрать':'В избранное'}">
      <svg viewBox="0 0 24 24" fill="${fav?'currentColor':'none'}">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke="currentColor" stroke-width="1.8"/>
      </svg>
    </button>
    <button class="track-menu-btn" onclick="event.stopPropagation();showTrackMenu(event,${i},'${esc(key)}')" title="Ещё">
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
async function openArtist(id, name) {
  const aid = id != null && id !== '' && String(id) !== 'undefined' && String(id) !== '0'
    ? id
    : null;
  // Always use dedicated artist page in multipage build
  if (!document.getElementById('page-search')) {
    const go = typeof mrfGo === 'function' ? mrfGo : (u) => { location.href = u; };
    if (!aid && name) {
      go(typeof mrfUrl === 'function' ? mrfUrl('artist', { name }) : `artist?name=${encodeURIComponent(name)}`);
      return;
    }
    if (!aid) { showNotif?.('Артист не найден'); return; }
    go(typeof mrfUrl === 'function'
      ? mrfUrl('artist', { id: aid, name: name || '' })
      : `artist?id=${encodeURIComponent(aid)}${name ? '&name=' + encodeURIComponent(name) : ''}`);
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
  if (!document.getElementById('page-search') && !document.getElementById('search-results')) {
    location.href = `album.html?id=${encodeURIComponent(id)}`;
    return;
  }
  showPage('search', qs('[data-page=search]'));
  el('search-tabs')?.classList.add('hidden');
  const resultsBox = el('search-results');
  if (resultsBox) resultsBox.innerHTML = loaderHTML('Загружаем альбом…');

  const album  = await dzObj(`/album/${id}`);
  const raw    = album.tracks?.data || [];
  const tracks = raw.map(t => normDZ({
    ...t,
    artist: { id: album.artist?.id, name: artistName, picture_medium: album.artist?.picture_medium||'' },
    album:  { id, title: albumName, cover_medium: album.cover_medium, cover: album.cover }
  }));
  const key   = `alb_${id}`;
  _src[key]   = tracks;
  const cover = album.cover_xl || album.cover_medium || '';

  if (!resultsBox) return;
  resultsBox.innerHTML = `
    <div style="display:flex;gap:28px;align-items:flex-start;margin-bottom:32px;flex-wrap:wrap">
      ${cover ? `<img src="${cover}" style="width:180px;height:180px;border-radius:12px;object-fit:cover;flex-shrink:0" alt="">` : ''}
      <div style="display:flex;flex-direction:column;justify-content:center;gap:8px">
        <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:2px">Альбом</div>
        <h2 style="font-size:32px;font-weight:800">${esc(albumName)}</h2>
        <div style="color:var(--text-3);font-size:14px;cursor:pointer"
          onclick="openArtist(${album.artist?.id||0},'${ejson(artistName)}')">${esc(artistName)}</div>
        <div style="color:var(--text-3);font-size:12px">${tracks.length} треков · ${album.release_date||''}</div>
        <button class="btn-primary" onclick="playFromSrc('${esc(key)}',0)" style="margin-top:6px;padding:10px 20px;font-size:13px;width:fit-content">
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="5,3 19,12 5,21"/></svg>
          Слушать альбом
        </button>
      </div>
    </div>
    <div class="track-list">${tracks.map((t,i) => rowHTML(t,i,key)).join('')}</div>`;
}

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
  const artist = esc(t.artist?.name || '');
  const cover  = t.album?.cover_medium || t.album?.cover || '';
  const dur    = t.duration ? fmt(t.duration) : '';
  const fav    = isFav(t.title||'', t.artist?.name||'');
  const playing= queueIndex>=0 && queue[queueIndex]?.id===t.id;
  const topCls = i===0?' top-1':i===1?' top-2':i===2?' top-3':'';
  const playIco = `<svg class="play-hover" viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M8 5v14l11-7z"/></svg>`;

  return `
  <div class="track-item${playing?' playing':''}${extraClass}${topCls}" onclick="playFromSrc('${esc(key)}',${i})">
    <div class="track-num">
      <span class="num-text">${playing ? '' : (i + 1)}</span>
      ${playIco}
    </div>
    ${cover
      ? `<img class="track-cover" src="${cover}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : `<div class="track-cover-placeholder">${noteSVG()}</div>`}
    <div class="track-info">
      <div class="track-title">${title}</div>
      <div class="track-artist">${artist}</div>
    </div>
    <div class="track-duration">${dur}</div>
    <button class="track-like-btn${fav?' liked':''}"
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
function playFromSrc(key, index) {
  const list = _src[key];
  if (!list?.length) return;
  _originalQueue = list.map(t => ({ ...t }));
  if (isShuffle) {
    // перемешиваем, выбранный трек ставим первым
    const current = _originalQueue[index];
    const rest = _originalQueue.filter((_, i) => i !== index);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    queue = [current, ...rest];
    queueIndex = 0;
  } else {
    queue = _originalQueue;
    queueIndex = index;
  }
  playNow();
}

function playNow() {
  if (queueIndex<0 || queueIndex>=queue.length) return;
  const t = queue[queueIndex];
  updatePlayerUI(t);
  addToRecent(t);
  renderQueuePanel();
  updateFavBtn();
  _wantPlaying = true;
  persistPlayer();
  if (!t.preview) {
    _wantPlaying = false;
    showNotification('Нет превью для этого трека');
    return;
  }
  audio.pause();
  audio.src    = t.preview;
  audio.volume = isMuted ? 0 : volume;
  audio.load();
  audio.play()
    .then(() => { _wantPlaying = true; })
    .catch(() => {
      _wantPlaying = false;
      showNotification('Не удалось воспроизвести');
    });
}

function persistPlayer(forcePos) {
  try {
    Store.setQueue(queue, queueIndex);
    const pos = (forcePos || !audio.paused || _wantPlaying)
      ? (audio.currentTime || 0)
      : (Store.getPlayerState()?.position || 0);
    Store.setPlayerState({
      volume: Math.round((volume || 0) * 100),
      muted: !!isMuted,
      shuffle: !!isShuffle,
      repeat: isRepeat || 'off',
      position: pos,
      playing: !!_wantPlaying && !audio.ended
    });
  } catch {}
}
window.persistPlayer = persistPlayer;

function togglePlay() {
  if (!queue[queueIndex]) return;
  if (!audio.src || audio.readyState===0) { playNow(); return; }
  if (isPlaying) {
    _wantPlaying = false;
    audio.pause();
  } else {
    _wantPlaying = true;
    audio.play().catch(() => { _wantPlaying = false; });
  }
}
function nextTrack() {
  if (!queue.length) return;
  queueIndex = (queueIndex + 1) % queue.length;
  playNow();
}
function prevTrack() {
  if (!queue.length) return;
  if (audio.currentTime>3) { audio.currentTime=0; return; }
  queueIndex = (queueIndex-1+queue.length)%queue.length;
  playNow();
}
function toggleShuffle() {
  isShuffle = !isShuffle;
  el('btn-shuffle').classList.toggle('active-btn', isShuffle);

  if (queue.length) {
    const currentTrack = queue[queueIndex];
    if (isShuffle) {
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
    renderQueuePanel();
  }
}
function toggleRepeat() {
  if (isRepeat === 'off')      isRepeat = 'all';
  else if (isRepeat === 'all') isRepeat = 'one';
  else                         isRepeat = 'off';
  updateRepeatBtn();
}
function updateRepeatBtn() {
  const btn = el('btn-repeat');
  if (!btn) return;
  btn.classList.toggle('active-btn', isRepeat !== 'off');
  const badge = btn.querySelector('.repeat-one-badge');
  if (badge) badge.remove();
  if (isRepeat === 'one') {
    const b = document.createElement('span');
    b.className = 'repeat-one-badge';
    b.textContent = '1';
    btn.appendChild(b);
  }
}

/* ── Player UI ── */
function setPlayIcon(on) {
  const btn = el('btn-play'); if (!btn) return;
  if (on) {
    // пауза — две полоски
    btn.innerHTML = '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5203 21.9939 21.9939 17.5203 22 12ZM11.996 19.992C16.4127 19.9942 19.9956 16.4167 20 12C19.9956 7.58329 16.4127 3.98979 11.996 3.992C7.57929 3.99421 4 7.57528 4 11.992C4 16.4087 7.57929 19.9898 11.996 19.992Z" fill-rule="evenodd" clip-rule="evenodd" fill="currentColor"/><path d="M11 8H9V16H11V8Z" fill="currentColor"/><path d="M13 16V8H15V16H13Z" fill="currentColor"/></svg>';
  } else {
    // плей — треугольник
    btn.innerHTML = '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5203 21.9939 21.9939 17.5203 22 12ZM11.996 19.992C16.4127 19.9942 19.9956 16.4167 20 12C19.9956 7.58329 16.4127 3.98979 11.996 3.992C7.57929 3.99421 4 7.57528 4 11.992C4 16.4087 7.57929 19.9898 11.996 19.992Z" fill-rule="evenodd" clip-rule="evenodd" fill="currentColor"/><path d="M10 16V8L16 12L10 16Z" fill="currentColor"/></svg>';
  }
}
function updatePlayerUI(t) {
  const titleEl = el('player-title');
  const artistEl = el('player-artist');
  if (artistEl && !artistEl.dataset.boundArtistClick) {
    artistEl.dataset.boundArtistClick = '1';
    artistEl.style.cursor = 'pointer';
    artistEl.addEventListener('click', e => {
      e.stopPropagation();
      const cur = queue[queueIndex];
      if (cur?.artist?.id || cur?.artist?.name) openArtist(cur.artist.id, cur.artist.name);
    });
  }
  if (titleEl) titleEl.textContent = t.title || '—';
  if (artistEl) artistEl.textContent = t.artist?.name || t.artist || '—';
  const c = el('player-cover');
  const cover = t.album?.cover_medium || t.album?.cover || t.cover || '';
  if (c) {
    c.style.background = cover ? `url("${cover}") center/cover` : 'var(--bg-3)';
    c.style.backgroundSize = 'cover';
    c.style.backgroundPosition = 'center';
  }
  const tt = el('time-total');
  const tc = el('time-current');
  const pf = el('progress-fill');
  if (tt) tt.textContent = t.duration ? fmt(t.duration) : '0:30';
  if (tc) tc.textContent = '0:00';
  if (pf) pf.style.width = '0%';
  el('player-like-btn')?.classList.add('visible');
  updateNowPlayingPanel(t);
}

/* ── Progress ── */
let _pt = null;
function startProgress() { stopProgress(); _pt = setInterval(tickProgress, 250); }
function stopProgress()  { clearInterval(_pt); }
function tickProgress() {
  if (!audio.duration) return;
  const pf = el('progress-fill');
  const tc = el('time-current');
  const tt = el('time-total');
  if (pf) pf.style.width = (audio.currentTime/audio.duration*100)+'%';
  if (tc) tc.textContent = fmt(audio.currentTime);
  if (tt) tt.textContent = fmt(audio.duration);
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
  return favourites.some(f=>f.title===title && f.artist===artist);
}

function toggleFavByIdx(idx, key, btn) {
  const t = _src[key]?.[idx]; if (!t) return;
  const added = Store.toggleFav({
    id: t.id,
    title: t.title,
    artistName: t.artist?.name || '',
    cover: t.album?.cover_medium || '',
    duration: t.duration || 0,
    preview: t.preview || null
  });
  btn.classList.toggle('liked', added);
  btn.querySelector('path')?.setAttribute('fill', added ? 'currentColor' : 'none');
  updateFavBadge();
  syncFavIcons();
}

function toggleFavPlayer() {
  const t=queue[queueIndex]; if (!t) return;
  const btn=el('player-like-btn');
  const added = Store.toggleFav({
    id: t.id,
    title: t.title,
    artistName: t.artist?.name || t.artist || '',
    cover: t.album?.cover_medium || '',
    duration: t.duration || 0,
    preview: t.preview || null
  });
  btn.classList.toggle('liked', added);
  btn.querySelector('path')?.setAttribute('fill', added ? 'currentColor' : 'none');
  updateFavBadge();
  syncFavIcons();
}

function updateFavBtn() {
  const t=queue[queueIndex]; if (!t) return;
  const f=isFav(t.title||'',t.artist?.name||t.artist||'');
  const b=el('player-like-btn');
  if (!b) return;
  b.classList.toggle('liked',f);
  b.querySelector('path')?.setAttribute('fill',f?'currentColor':'none');
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
    }
  }
  volume = (pState.volume ?? 70) / 100;
  isMuted = pState.muted || false;
  isShuffle = !!pState.shuffle;
  isRepeat = pState.repeat || 'off';
  audio.volume = isMuted ? 0 : volume;
  const vfill = el('volume-fill');
  if (vfill) vfill.style.width = (volume * 100) + '%';
  el('btn-shuffle')?.classList.toggle('active-btn', isShuffle);
  updateRepeatBtn();
  updateVolumeIcon();

  const t = queue[queueIndex];
  const shouldResume = !!pState.playing && !!t?.preview;
  if (!t?.preview) return;

  _wantPlaying = shouldResume;
  audio.src = t.preview;
  audio.volume = isMuted ? 0 : volume;

  const seekTo = Math.max(0, Number(pState.position) || 0);
  const applySeek = () => {
    if (seekTo > 0.25 && isFinite(audio.duration) && seekTo < audio.duration) {
      try { audio.currentTime = seekTo; } catch {}
    }
  };

  const tryResume = () => {
    applySeek();
    if (!shouldResume) {
      setPlayIcon(false);
      return;
    }
    audio.play().then(() => {
      setPlayIcon(true);
      startProgress();
    }).catch(() => {
      // Autoplay policy: resume on first user gesture
      setPlayIcon(false);
      const unlock = () => {
        if (!_wantPlaying) return;
        audio.play().then(() => { setPlayIcon(true); startProgress(); }).catch(() => {});
        document.removeEventListener('pointerdown', unlock, true);
        document.removeEventListener('keydown', unlock, true);
      };
      document.addEventListener('pointerdown', unlock, true);
      document.addEventListener('keydown', unlock, true);
    });
  };

  if (audio.readyState >= 1) tryResume();
  else audio.addEventListener('loadedmetadata', tryResume, { once: true });
  audio.load();
}
function syncFavIcons() {
  document.querySelectorAll('.track-like-btn').forEach(btn => {
    const item = btn.closest('.track-item');
    if (!item) return;
    const titleEl  = item.querySelector('.track-title');
    const artistEl = item.querySelector('.track-artist');
    if (!titleEl) return;
    const title  = titleEl.textContent.trim();
    // artist может содержать badge, берём только текст без дочерних элементов
    const artist = artistEl ? [...artistEl.childNodes]
      .filter(n => n.nodeType === 3)
      .map(n => n.textContent.trim())
      .join('') : '';
    const fav = isFav(title, artist);
    btn.classList.toggle('liked', fav);
    const path = btn.querySelector('path');
    if (path) path.setAttribute('fill', fav ? 'currentColor' : 'none');
  });
  // обновляем кнопку в плеере
  updateFavBtn();
}

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
  const btnBack = el('btn-nav-back');
  const btnFwd  = el('btn-nav-fwd');
  if (btnBack) btnBack.style.opacity = _navPos > 0 ? '1' : '0.3';
  if (btnFwd)  btnFwd.style.opacity  = _navPos < _navStack.length - 1 ? '1' : '0.3';
}

/* ══════════════════════════════════
   NOTIFICATION
══════════════════════════════════ */
let _nt=null;
function showNotification(msg){
  const n=el('notification');
  if (!n) { console.log('[MRF]', msg); return; }
  n.textContent=msg; n.classList.remove('hidden');
  clearTimeout(_nt); _nt=setTimeout(()=>n.classList.add('hidden'),2800);
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
  return`<div class="loading-placeholder"><div class="spinner"></div><span>${msg}</span></div>`;
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

function updateNowPlayingPanel(t) {
  const panel = el('now-playing-panel');
  if (!panel) return;

  const cover = t.album?.cover_medium || t.album?.cover || '';
  const npCover = el('np-cover');
  if (npCover) npCover.style.background = cover ? `url("${cover}") center/cover` : 'var(--bg-3)';

  const npTitle = el('np-title');
  if (npTitle) npTitle.textContent = t.title || '—';

  const npArtistName = el('np-artist-name');
  if (npArtistName) {
    npArtistName.textContent = t.artist?.name || '—';
    npArtistName.onclick = () => {
      if (t.artist?.id) { closeNowPlaying(); openArtist(t.artist.id, t.artist.name); }
    };
  }

  const npArtistNameBig = el('np-artist-name-big');
  if (npArtistNameBig) npArtistNameBig.textContent = t.artist?.name || '—';

  const npArtistBtn = el('np-artist-btn');
  if (npArtistBtn) {
    npArtistBtn.onclick = () => {
      if (t.artist?.id) { closeNowPlaying(); openArtist(t.artist.id, t.artist.name); }
    };
  }

  const artistCover = el('np-artist-cover');
  if (artistCover) {
    const artistPic = t.artist?.picture_medium || '';
    artistCover.style.background = artistPic ? `url("${artistPic}") center top/cover` : 'var(--bg-3)';
    if (!artistPic && t.artist?.id) {
      dzObj(`/artist/${t.artist.id}`).then(info => {
        const pic = info.picture_medium || info.picture_xl || '';
        if (pic) artistCover.style.background = `url("${pic}") center top/cover`;
      }).catch(() => {});
    }
  }

  const npArtistWrap = el('np-artist-cover-wrap');
  if (npArtistWrap) {
    npArtistWrap.onclick = () => {
      if (t.artist?.id) { closeNowPlaying(); openArtist(t.artist.id, t.artist.name); }
    };
  }

  // загружаем текст
  loadLyrics(t.title || '', t.artist?.name || '', t.duration || 0);
}

function goToNpArtist() {
  const t = queue[queueIndex]; if (!t) return;
  if (t.artist?.id) {
    closeNowPlaying();
    openArtist(t.artist.id, t.artist.name);
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
  renderNewReleases();
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
  box.innerHTML = MOCK.moods.map(m => `
    <div class="mood-tile" onclick="searchByTag('${esc(m.tag)}')" style="border-color:${m.color}20">
      <svg viewBox="0 0 24 24" fill="none" width="28" height="28" style="color:${m.color}">${m.icon}</svg>
      <div class="mood-tile-name">${esc(m.name)}</div>
    </div>`).join('');
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

function renderNewReleases() {
  const box = el('new-releases-row'); if (!box) return;
  // BACKEND TODO: Получение новых релизов
  box.innerHTML = MOCK.newReleases.map(r => `
    <div class="horiz-card" onclick="searchByTag('${esc(r.artist)}')">
      ${r.cover
        ? `<img src="${r.cover}" class="horiz-card-cover" alt="" loading="lazy">`
        : `<div class="horiz-card-cover-placeholder">${noteSVG()}</div>`}
      <div class="horiz-card-title">${esc(r.title)}</div>
      <div class="horiz-card-sub">${esc(r.artist)}</div>
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

/* ══════════════════════════════════
   SIDEBAR PLAYLISTS
══════════════════════════════════ */
function renderSidebarPlaylists() {
  const placeholder = qs('.nav-placeholder');
  if (!placeholder) return;
  if (!MOCK.playlists.length && !MOCK.followedArtists.length) return;

  let html = '';
  MOCK.playlists.slice(0, 5).forEach(pl => {
    html += `
      <a href="#" class="nav-item" onclick="openPlaylistPage('${pl.id}'); return false;" style="font-size:12px;padding:7px 18px">
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none"><path d="M9 18V6l12-3v12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="1.6"/><circle cx="18" cy="15" r="3" stroke="currentColor" stroke-width="1.6"/></svg>
        <span class="nav-label">${esc(pl.name)}</span>
      </a>`;
  });

  MOCK.followedArtists.slice(0, 3).forEach(a => {
    html += `
      <a href="#" class="nav-item" onclick="openArtist(${a.id},'${ejson(a.name)}'); return false;" style="font-size:12px;padding:7px 18px">
        ${a.picture_medium
          ? `<img src="${a.picture_medium}" style="width:18px;height:18px;border-radius:50%;object-fit:cover;flex-shrink:0" alt="">`
          : `<div class="nav-icon" style="width:18px;height:18px;border-radius:50%;background:var(--bg-3);display:flex;align-items:center;justify-content:center;font-size:9px;color:var(--accent)">${(a.name[0]||'?')}</div>`}
        <span class="nav-label">${esc(a.name)}</span>
      </a>`;
  });

  placeholder.outerHTML = html;
}

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
  const pl = MOCK.playlists.find(p => p.id === id);
  if (!pl) return;

  showPage('search', qs('[data-page=search]'));
  el('search-tabs').classList.add('hidden');

  if (!pl.tracks.length) {
    el('search-results').innerHTML = `
      <div style="display:flex;gap:24px;align-items:flex-start;margin-bottom:28px">
        <div style="width:160px;height:160px;border-radius:10px;background:var(--bg-3);display:flex;align-items:center;justify-content:center;flex-shrink:0">${noteSVG()}</div>
        <div style="display:flex;flex-direction:column;justify-content:center;gap:8px">
          <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:2px">Плейлист</div>
          <h2 style="font-size:32px;font-weight:800">${esc(pl.name)}</h2>
          ${pl.description ? `<p style="color:var(--text-3);font-size:13px">${esc(pl.description)}</p>` : ''}
          <div style="color:var(--text-3);font-size:12px">${pl.trackCount} треков</div>
        </div>
      </div>
      <div class="search-empty" style="padding:30px 0">
        <p style="color:var(--text-3)">Плейлист пуст. Добавь треки через контекстное меню.</p>
      </div>`;
    return;
  }

  const key = `pl_${id}`;
  _src[key] = pl.tracks;

  el('search-results').innerHTML = `
    <div style="display:flex;gap:24px;align-items:flex-start;margin-bottom:28px;flex-wrap:wrap">
      ${pl.cover
        ? `<img src="${pl.cover}" style="width:160px;height:160px;border-radius:10px;object-fit:cover;flex-shrink:0" alt="">`
        : `<div style="width:160px;height:160px;border-radius:10px;background:var(--bg-3);display:flex;align-items:center;justify-content:center;flex-shrink:0">${noteSVG()}</div>`}
      <div style="display:flex;flex-direction:column;justify-content:center;gap:8px">
        <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:2px">Плейлист</div>
        <h2 style="font-size:32px;font-weight:800">${esc(pl.name)}</h2>
        ${pl.description ? `<p style="color:var(--text-3);font-size:13px">${esc(pl.description)}</p>` : ''}
        <div style="color:var(--text-3);font-size:12px">${pl.tracks.length} треков</div>
        <button class="btn-primary" onclick="playFromSrc('${esc(key)}',0)" style="padding:10px 20px;font-size:13px;width:fit-content;margin-top:4px">
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="5,3 19,12 5,21"/></svg>
          Слушать плейлист
        </button>
      </div>
    </div>
    <div class="track-list">${pl.tracks.map((t,i) => rowHTML(t,i,key)).join('')}</div>`;
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
   CHARTS — переключение регионов/жанров
══════════════════════════════════ */
function switchChartRegion(btn, idx) {
  qsAll('.charts-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // BACKEND TODO: Загрузка чарта для региона MOCK.chartRegions[idx]
  loadChartsPage(); // пока грузим одни и те же данные
}

function switchChartGenre(btn) {
  qsAll('.charts-genre-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // BACKEND TODO: Фильтрация чарта по жанру
}

/* ══════════════════════════════════
   CONTEXT MENU
══════════════════════════════════ */
let _ctxMenu = null;

function showTrackMenu(e, idx, key) {
  e.preventDefault();
  e.stopPropagation();
  hideTrackMenu();
  const t = _src[key]?.[idx];
  if (!t) return;

  const fav = typeof Store !== 'undefined' && Store.isFav(t.title || '', t.artist?.name || '');
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';

  let x = e.clientX;
  let y = e.clientY;
  const btn = e.currentTarget?.closest?.('.track-menu-btn') || e.target?.closest?.('.track-menu-btn');
  if (btn) {
    const br = btn.getBoundingClientRect();
    x = br.right;
    y = br.bottom;
  }
  menu.style.position = 'fixed';
  menu.style.top = y + 'px';
  menu.style.left = x + 'px';
  menu.style.zIndex = '4000';

  const artistId = t.artist?.id;
  const albumId = t.album?.id;
  const trackId = t.id;

  menu.innerHTML = `
    <div class="ctx-item" onclick="playFromSrc('${esc(key)}',${idx});hideTrackMenu()">
      <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><polygon points="5,3 19,12 5,21"/></svg>
      Воспроизвести
    </div>
    <div class="ctx-item" onclick="addToQueue(_src['${esc(key)}'][${idx}]);hideTrackMenu()">
      <svg viewBox="0 0 24 24" fill="none" width="15" height="15"><path d="M3 6h18M3 12h12M3 18h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      Добавить в очередь
    </div>
    <div class="ctx-item" onclick="playNext(_src['${esc(key)}'][${idx}]);hideTrackMenu()">
      <svg viewBox="0 0 24 24" fill="none" width="15" height="15"><path d="M5 4l10 8-10 8V4zM19 4v16" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
      Воспроизвести следующим
    </div>
    <div class="ctx-divider"></div>
    <div class="ctx-item" onclick="toggleFavFromMenu(${idx},'${esc(key)}');hideTrackMenu()">
      <svg viewBox="0 0 24 24" fill="${fav ? 'currentColor' : 'none'}" width="15" height="15"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke="currentColor" stroke-width="1.8"/></svg>
      ${fav ? 'Удалить из избранного' : 'Добавить в избранное'}
    </div>
    <div class="ctx-item" onclick="showAddToPlaylist(_src['${esc(key)}'][${idx}]);hideTrackMenu()">
      <svg viewBox="0 0 24 24" fill="none" width="15" height="15"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      Добавить в плейлист
    </div>
    ${String(key).startsWith('pl_') ? `<div class="ctx-item ctx-item-danger" onclick="removeTrackFromPlaylistCtx('${esc(key)}',${idx});hideTrackMenu()">Удалить из плейлиста</div>` : ''}
    <div class="ctx-divider"></div>
    ${albumId ? `<div class="ctx-item" onclick="location.href='${typeof mrfUrl==='function'?mrfUrl('album',{id:albumId}):('album?id='+albumId)}';hideTrackMenu()">К альбому</div>` : ''}
    ${artistId ? `<div class="ctx-item" onclick="location.href='${typeof mrfUrl==='function'?mrfUrl('artist',{id:artistId,name:t.artist?.name||''}):('artist?id='+artistId)}';hideTrackMenu()">К исполнителю</div>` : ''}
    <div class="ctx-item" onclick="location.href='${typeof mrfUrl==='function'?mrfUrl('track',{id:trackId}):('track?id='+encodeURIComponent(trackId))}';hideTrackMenu()">Страница трека</div>
    <div class="ctx-item" onclick="showTrackInfo(_src['${esc(key)}'][${idx}]);hideTrackMenu()">Информация</div>
    <div class="ctx-item" onclick="shareTrack(_src['${esc(key)}'][${idx}]);hideTrackMenu()">Поделиться</div>
    ${key === 'favs' || key === 'liked' ? `<div class="ctx-divider"></div>
      <div class="ctx-item ctx-item-danger" onclick="toggleFavFromMenu(${idx},'${esc(key)}');hideTrackMenu();if(typeof renderLib==='function')renderLib(_libTab||'tracks');if(typeof renderLikedPage==='function')renderLikedPage()">Удалить из библиотеки</div>` : ''}
  `;

  document.body.appendChild(menu);
  _ctxMenu = menu;
  const r = menu.getBoundingClientRect();
  let left = x;
  let top = y;
  if (r.right > innerWidth) left = Math.max(8, x - r.width);
  if (r.bottom > innerHeight) top = Math.max(8, y - r.height);
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  setTimeout(() => document.addEventListener('click', hideTrackMenu, { once: true }), 0);
}

function hideTrackMenu() {
  if (_ctxMenu) { _ctxMenu.remove(); _ctxMenu = null; }
}

function toggleFavFromMenu(idx, key) {
  const t = _src[key]?.[idx]; if (!t) return;
  Store.toggleFav({
    id: t.id,
    title: t.title,
    artistName: t.artist?.name || '',
    cover: t.album?.cover_medium || '',
    duration: t.duration || 0,
    preview: t.preview || null
  });
  favourites = Store.getFavs();
  updateFavBadge();
  syncFavIcons();
  showNotification('Избранное обновлено');
}

function removeFromQueue(idx, key) {
  if (key === 'charts' || key === 'home' || key.startsWith('s-') || key.startsWith('art_') || key.startsWith('alb_')) return;
  // убираем из плейлиста
  const plId = key.replace('pl_', '');
  mockRemoveFromPlaylist(plId, _src[key]?.[idx]?.id);
  renderLibrary(_libTab);
}
