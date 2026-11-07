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
let isRepeat     = false;
let isMuted      = false;
let volume       = 0.7;
let currentTab   = 'tracks';
let searchTimer  = null;
const _src       = {};
let _cbId        = 0;

let favourites   = JSON.parse(localStorage.getItem('mrf_favs')   || '[]');
let recentTracks = JSON.parse(localStorage.getItem('mrf_recent') || '[]');

/* ══════════════════════════════════
   INIT
══════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  bindAudio();
  bindSearch();
  updateFavBadge();
  loadHomeCharts();
  loadChartsPage();
});

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
  audio.addEventListener('play',  () => { isPlaying=true;  setPlayIcon(true);  startProgress(); });
  audio.addEventListener('pause', () => { isPlaying=false; setPlayIcon(false); stopProgress();  });
  audio.addEventListener('ended', () => {
    stopProgress();
    isRepeat ? (audio.currentTime=0, audio.play()) : nextTrack();
  });
  audio.addEventListener('error', () => {
    isPlaying=false; setPlayIcon(false);
    showNotification('❌ Ошибка воспроизведения');
  });
  audio.addEventListener('timeupdate',     tickProgress);
  audio.addEventListener('loadedmetadata', () => el('time-total').textContent = fmt(audio.duration));
}

/* ══════════════════════════════════
   SEARCH
══════════════════════════════════ */
function bindSearch() {
  const top = el('main-search-input');
  const big = el('big-search-input');
  [top, big].forEach(inp => {
    inp.addEventListener('input', () => {
      const q = inp.value.trim();
      top.value = big.value = q;
      el('search-clear').style.display = q ? 'inline' : 'none';
      clearTimeout(searchTimer);
      if (q.length < 2) { showSearchEmpty(); return; }
      searchTimer = setTimeout(() => runSearch(q), 380);
    });
    inp.addEventListener('focus', () => showPage('search', qs('[data-page=search]')));
    inp.addEventListener('keydown', e => {
      if (e.key==='Enter' && inp.value.trim().length>=2) runSearch(inp.value.trim());
    });
  });
}

function clearSearch() {
  el('main-search-input').value = el('big-search-input').value = '';
  el('search-clear').style.display = 'none';
  showSearchEmpty();
}

function showSearchEmpty() {
  el('search-tabs').classList.add('hidden');
  el('search-results').innerHTML = `
    <div class="search-empty">
      <svg viewBox="0 0 24 24" fill="none" width="64" height="64">
        <circle cx="11" cy="11" r="7" stroke="#68C7EC" stroke-width="1.5"/>
        <path d="M20 20L16.5 16.5" stroke="#68C7EC" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <p>Начни вводить название трека или артиста</p>
    </div>`;
}

async function runSearch(q) {
  showPage('search', qs('[data-page=search]'));
  el('search-results').innerHTML = loaderHTML('Ищем…');
  el('search-tabs').classList.remove('hidden');
  currentTab = 'tracks';
  setActiveTab('tracks');

  /* Все три запроса параллельно — Deezer отвечает мгновенно */
  const [rawTracks, rawArtists, rawAlbums] = await Promise.all([
    dzArr(`/search/track?q=${enc(q)}&limit=50`),
    dzArr(`/search/artist?q=${enc(q)}&limit=20`),
    dzArr(`/search/album?q=${enc(q)}&limit=20`)
  ]);

  const tracks = rawTracks.map(normDZ);

  _src['s-tracks']  = tracks;
  _src['s-artists'] = rawArtists;
  _src['s-albums']  = rawAlbums;

  renderTrackList(tracks, 's-tracks', el('search-results'));
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
    ? `<span class="src-badge preview">◐ 30 сек</span>`
    : `<span class="src-badge none">— нет превью</span>`;

  return `
  <div class="track-item${playing?' playing':''}" onclick="playFromSrc('${esc(key)}',${i})">
    <div class="track-num">
      <span class="num-text">${playing?'▶':i+1}</span>
      <span class="play-hover">▶</span>
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
  showPage('search', qs('[data-page=search]'));
  el('search-tabs').classList.add('hidden');
  el('search-results').innerHTML = loaderHTML('Загружаем артиста…');

  /* Параллельно: инфо + первые 50 треков */
  const [artInfo, firstBatch] = await Promise.all([
    dzObj(`/artist/${id}`),
    dzArr(`/artist/${id}/top?limit=50`)
  ]);

  const img       = artInfo.picture_xl || artInfo.picture_medium || '';
  const totalFans = artInfo.nb_fan ? (+artInfo.nb_fan).toLocaleString('ru')+' фанатов' : '';
  const key       = `art_${id}`;
  let   tracks    = firstBatch.map(normDZ);
  _src[key]       = tracks;

  /* Рендерим сразу первые 50 */
  renderArtistPage(id, name, img, totalFans, tracks, key, firstBatch.length===50);
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
  showPage('search', qs('[data-page=search]'));
  el('search-tabs').classList.add('hidden');
  el('search-results').innerHTML = loaderHTML('Загружаем альбом…');

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

  el('search-results').innerHTML = `
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
    ? `<div class="track-list">${all.map((t,i) => rowHTML(t,i,'charts')).join('')}</div>`
    : `<p style="color:var(--text-3)">Не удалось загрузить</p>`;
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
  queue      = list.map(t => ({ ...t }));
  queueIndex = index;
  playNow();
}

function playNow() {
  if (queueIndex<0 || queueIndex>=queue.length) return;
  const t = queue[queueIndex];
  updatePlayerUI(t);
  addToRecent(t);
  renderQueuePanel();
  updateFavBtn();
  if (!t.preview) { showNotification('⚠️ Для этого трека нет превью'); return; }
  audio.pause();
  audio.src    = t.preview;
  audio.volume = isMuted ? 0 : volume;
  audio.load();
  audio.play()
    .then(() => showNotification(`▶  ${t.title} — ${t.artist?.name||''}`))
    .catch(() => showNotification('❌ Не удалось воспроизвести'));
}

function togglePlay() {
  if (!queue[queueIndex]) return;
  if (!audio.src || audio.readyState===0) { playNow(); return; }
  isPlaying ? audio.pause() : audio.play();
}
function nextTrack() {
  if (!queue.length) return;
  queueIndex = isShuffle ? Math.floor(Math.random()*queue.length) : (queueIndex+1)%queue.length;
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
  showNotification(isShuffle ? '🔀 Перемешивание включено' : '🔀 Перемешивание выключено');
}
function toggleRepeat() {
  isRepeat = !isRepeat;
  el('btn-repeat').classList.toggle('active-btn', isRepeat);
  showNotification(isRepeat ? '🔁 Повтор включён' : '🔁 Повтор выключён');
}

/* ── Player UI ── */
function setPlayIcon(on) {
  const ic = el('play-icon'); if (!ic) return;
  ic.innerHTML = on
    ? '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>'
    : '<polygon points="5,3 19,12 5,21"/>';
}
function updatePlayerUI(t) {
  el('player-title').textContent  = t.title           || '—';
  el('player-artist').textContent = t.artist?.name    || '—';
  const c     = el('player-cover');
  const cover = t.album?.cover_medium || t.album?.cover || '';
  c.style.background         = cover ? `url("${cover}") center/cover` : 'var(--bg-3)';
  c.style.backgroundSize     = 'cover';
  c.style.backgroundPosition = 'center';
  el('time-total').textContent    = t.duration ? fmt(t.duration) : '0:30';
  el('time-current').textContent  = '0:00';
  el('progress-fill').style.width = '0%';
}

/* ── Progress ── */
let _pt = null;
function startProgress() { stopProgress(); _pt = setInterval(tickProgress, 250); }
function stopProgress()  { clearInterval(_pt); }
function tickProgress() {
  if (!audio.duration) return;
  el('progress-fill').style.width = (audio.currentTime/audio.duration*100)+'%';
  el('time-current').textContent  = fmt(audio.currentTime);
  el('time-total').textContent    = fmt(audio.duration);
}
function seekTo(e) {
  if (!audio.duration) return;
  const r = e.currentTarget.getBoundingClientRect();
  audio.currentTime = audio.duration * Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));
}
function setVolume(e) {
  const r = e.currentTarget.getBoundingClientRect();
  volume  = Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));
  audio.volume=volume; isMuted=false;
  el('volume-fill').style.width=(volume*100)+'%';
}
function toggleMute() {
  isMuted=!isMuted; audio.volume=isMuted?0:volume;
  el('volume-fill').style.width=(isMuted?0:volume*100)+'%';
}

/* ══════════════════════════════════
   FAVOURITES (LOCAL + SUPABASE SYNC)
══════════════════════════════════ */
function isFav(title, artist) {
  return favourites.some(f=>f.title===title && f.artist===artist);
}

function toggleFavByIdx(idx, key, btn) {
  const t = _src[key]?.[idx]; if (!t) return;
  const title=t.title||'', artist=t.artist?.name||'', cover=t.album?.cover_medium||'';
  if (isFav(title,artist)) {
    favourites=favourites.filter(f=>!(f.title===title&&f.artist===artist));
    btn.classList.remove('liked'); btn.querySelector('path').setAttribute('fill','none');
    showNotification('💔 Убрано из избранного');
  } else {
    favourites.push({id:t.id,title,artist,cover,duration:t.duration||0,preview:t.preview||null,fullTrack:t.fullTrack||false});
    btn.classList.add('liked'); btn.querySelector('path').setAttribute('fill','currentColor');
    showNotification('❤️ Добавлено в избранное');
  }
  localStorage.setItem('mrf_favs',JSON.stringify(favourites));
  updateFavBadge();
  syncFavToSupabase();
}

function toggleFavPlayer() {
  const t=queue[queueIndex]; if (!t) return;
  const btn=el('player-like-btn');
  const title=t.title||'', artist=t.artist?.name||t.artist||'';
  if (isFav(title,artist)) {
    favourites=favourites.filter(f=>!(f.title===title&&f.artist===artist));
    btn.classList.remove('liked'); btn.querySelector('path').setAttribute('fill','none');
    showNotification('💔 Убрано из избранного');
  } else {
    favourites.push({id:t.id,title,artist,cover:t.album?.cover_medium||'',duration:t.duration||0,preview:t.preview||null,fullTrack:t.fullTrack||false});
    btn.classList.add('liked'); btn.querySelector('path').setAttribute('fill','currentColor');
    showNotification('❤️ Добавлено в избранное');
  }
  localStorage.setItem('mrf_favs',JSON.stringify(favourites));
  updateFavBadge();
  syncFavToSupabase();
}

function updateFavBtn() {
  const t=queue[queueIndex]; if (!t) return;
  const f=isFav(t.title||'',t.artist?.name||t.artist||'');
  const b=el('player-like-btn');
  b.classList.toggle('liked',f);
  b.querySelector('path').setAttribute('fill',f?'currentColor':'none');
}

function updateFavBadge() { el('fav-count').textContent=favourites.length; }

function showFavourites() { showPage('library',qs('[data-page=library]')); renderFavList(); }

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
  const artist=t.artist?.name||t.artist||'';
  recentTracks=recentTracks.filter(r=>!(r.title===t.title&&r.artist===artist));
  recentTracks.unshift({title:t.title,artist,cover:t.album?.cover_medium||'',preview:t.preview||null,fullTrack:t.fullTrack||false});
  if (recentTracks.length>8) recentTracks.pop();
  localStorage.setItem('mrf_recent',JSON.stringify(recentTracks));
}

/* ══════════════════════════════════
   QUEUE
══════════════════════════════════ */
function toggleQueue() { el('queue-panel').classList.toggle('hidden'); renderQueuePanel(); }
function renderQueuePanel() {
  const box=el('queue-list');
  if (!queue.length){box.innerHTML=`<div style="padding:24px;color:var(--text-3);font-size:13px;text-align:center">Очередь пуста</div>`;return;}
  box.innerHTML=queue.map((t,i)=>`
    <div class="queue-item${i===queueIndex?' current':''}" onclick="queueIndex=${i};playNow()">
      ${t.album?.cover_medium?`<img class="queue-item-cover" src="${esc(t.album.cover_medium)}" alt="" loading="lazy">`:`<div class="queue-item-cover" style="display:flex;align-items:center;justify-content:center;color:var(--accent)">♪</div>`}
      <div class="queue-item-info">
        <div class="queue-item-title">${esc(t.title)}</div>
        <div class="queue-item-artist">${esc(t.artist?.name||'')}${t.fullTrack?' <span style="color:#68C7EC;font-size:9px">FULL</span>':''}</div>
      </div>
      <div class="queue-item-num">${i===queueIndex?'▶':i+1}</div>
    </div>`).join('');
}

/* ══════════════════════════════════
   NAVIGATION
══════════════════════════════════ */
function showPage(pageId,navEl) {
  qsAll('.page').forEach(p=>p.classList.add('hidden'));
  document.getElementById('page-'+pageId)?.classList.remove('hidden');
  qsAll('.nav-item').forEach(n=>n.classList.remove('active'));
  if (navEl) navEl.classList.add('active');
  if (pageId==='library') renderFavList();
}
function historyBack(){history.back();}
function historyFwd() {history.forward();}

/* ══════════════════════════════════
   NOTIFICATION
══════════════════════════════════ */
let _nt=null;
function showNotification(msg){
  const n=el('notification');
  n.textContent=msg; n.classList.remove('hidden');
  clearTimeout(_nt); _nt=setTimeout(()=>n.classList.add('hidden'),2800);
}

/* ══════════════════════════════════
   HELPERS
══════════════════════════════════ */
const el    = id  => document.getElementById(id);
const qs    = sel => document.querySelector(sel);
const qsAll = sel => document.querySelectorAll(sel);
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
