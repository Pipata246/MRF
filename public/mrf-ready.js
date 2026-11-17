/* =====================================================
   MRF — mrf-ready.js
   Доводка до полной готовности: панель, очередь, меню,
   тема, хелперы страниц. Подключается после app.js.
   ===================================================== */

const CLOSE_ICO = `<svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
function ejsonReady(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\n\r]/g, '');
}

/* ── Theme / accent ────────────────────────────────── */
function shadeHex(hex, factor) {
  const raw = String(hex || '').replace('#', '').trim();
  if (raw.length !== 6) return hex;
  const to = (i) => Math.max(0, Math.min(255, Math.round(parseInt(raw.slice(i, i + 2), 16) * factor)));
  return '#' + [to(0), to(2), to(4)].map(n => n.toString(16).padStart(2, '0')).join('');
}

function applyAccentColor(color) {
  if (!color) return;
  const root = document.documentElement;
  root.style.setProperty('--accent', color);
  root.style.setProperty('--accent-d', shadeHex(color, 0.86));
  root.style.setProperty('--accent-dim', shadeHex(color, 0.52));
  root.style.setProperty('--accent-soft', color + '22');
  root.style.setProperty('--accent-mid', color + '55');
}
window.applyAccentColor = applyAccentColor;
window.shadeHex = shadeHex;

function applyThemeFromSettings() {
  const s = Store.getSettings();
  const theme = s.theme || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  document.body.classList.toggle('theme-light', theme === 'light');
  applyAccentColor(s.accentColor || '#EE90B7');
}
window.applyThemeFromSettings = applyThemeFromSettings;

function setTheme(theme) {
  Store.setSettings({ theme });
  applyThemeFromSettings();
  document.getElementById('theme-dark-btn')?.classList.toggle('active-btn', theme === 'dark');
  document.getElementById('theme-light-btn')?.classList.toggle('active-btn', theme === 'light');
  showNotif(theme === 'light' ? 'Светлая тема' : 'Тёмная тема');
}
window.setTheme = setTheme;

/* ── Close icons: replace emoji closes ─────────────── */
function polishShellIcons() {
  document.querySelectorAll('#queue-panel .queue-header button, #now-playing-panel .np-header button, .modal-header button, #right-panel .rp-close').forEach(btn => {
    if (btn && /[✕×xX]/.test(btn.textContent || '') && !btn.querySelector('svg')) {
      btn.innerHTML = CLOSE_ICO;
    }
  });
}

/* ── Right panel with tabs ─────────────────────────── */
function ensureRightPanel() {
  if (document.getElementById('right-panel')) return;

  const root = document.getElementById('player-root');
  if (!root) return;

  const panel = document.createElement('aside');
  panel.id = 'right-panel';
  panel.className = 'right-panel hidden';
  panel.innerHTML = `
    <div class="rp-header">
      <div class="rp-tabs">
        <button class="rp-tab active" data-tab="now" onclick="setRightPanelTab('now')">Сейчас</button>
        <button class="rp-tab" data-tab="queue" onclick="setRightPanelTab('queue')">Очередь</button>
        <button class="rp-tab" data-tab="lyrics" onclick="setRightPanelTab('lyrics')">Текст</button>
        <button class="rp-tab" data-tab="artist" onclick="setRightPanelTab('artist')">Артист</button>
      </div>
      <button class="rp-close" onclick="closeRightPanel()" title="Закрыть">${CLOSE_ICO}</button>
    </div>
    <div class="rp-body" id="rp-body"></div>`;
  root.appendChild(panel);

  // lyrics button on player
  const pr = document.querySelector('.player-right');
  if (pr && !document.getElementById('btn-panel')) {
    const b = document.createElement('button');
    b.className = 'ctrl-btn';
    b.id = 'btn-panel';
    b.title = 'Панель';
    b.onclick = () => toggleRightPanel();
    b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M15 3v18" stroke="currentColor" stroke-width="1.8"/></svg>`;
    pr.insertBefore(b, pr.firstChild);
  }

  const state = Store.getPanelState();
  if (state.open) {
    openRightPanel(state.tab || 'now');
  }
}

function toggleRightPanel() {
  const p = document.getElementById('right-panel');
  if (!p) return;
  if (p.classList.contains('hidden')) openRightPanel(Store.getPanelState().tab || 'now');
  else closeRightPanel();
}

function openRightPanel(tab) {
  const p = document.getElementById('right-panel');
  if (!p) return;
  // hide legacy panels
  document.getElementById('queue-panel')?.classList.add('hidden');
  document.getElementById('now-playing-panel')?.classList.add('hidden');
  p.classList.remove('hidden');
  document.body.classList.add('right-panel-open');
  setRightPanelTab(tab || 'now');
  Store.setPanelState({ open: true, tab: tab || 'now' });
}

function closeRightPanel() {
  document.getElementById('right-panel')?.classList.add('hidden');
  document.body.classList.remove('right-panel-open');
  Store.setPanelState({ open: false });
}

function setRightPanelTab(tab) {
  Store.setPanelState({ open: true, tab });
  document.querySelectorAll('.rp-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const body = document.getElementById('rp-body');
  if (!body) return;
  if (tab === 'now') renderRpNow(body);
  else if (tab === 'queue') renderRpQueue(body);
  else if (tab === 'lyrics') renderRpLyrics(body);
  else if (tab === 'artist') renderRpArtist(body);
}

function getCurrentTrack() {
  if (typeof queue === 'undefined' || typeof queueIndex === 'undefined') return null;
  return queue[queueIndex] || null;
}

/** Refresh open right panel when current track / tab content should update */
function syncRightPanel() {
  const p = document.getElementById('right-panel');
  if (!p || p.classList.contains('hidden')) return;
  const tab = (typeof Store !== 'undefined' && Store.getPanelState?.()?.tab) || 'now';
  setRightPanelTab(tab);
}
window.syncRightPanel = syncRightPanel;

/** Refresh queue UI everywhere after add / shuffle / reorder / clear */
function notifyQueueChanged() {
  try {
    if (typeof renderQueuePanel === 'function') renderQueuePanel();
  } catch (_) {}
  const legacy = document.getElementById('queue-panel');
  if (legacy && !legacy.classList.contains('hidden') && typeof renderQueuePanel === 'function') {
    try { renderQueuePanel(); } catch (_) {}
  }
  const p = document.getElementById('right-panel');
  if (p && !p.classList.contains('hidden')) {
    const tab = (typeof Store !== 'undefined' && Store.getPanelState?.()?.tab) || 'queue';
    // Prefer staying on queue when user is managing it; otherwise refresh current tab
    setRightPanelTab(tab);
  }
}
window.notifyQueueChanged = notifyQueueChanged;

function rpArtistChipsHTML(t) {
  const arts = typeof trackArtists === 'function' ? trackArtists(t) : [];
  if (!arts.length) {
    const name = t?.artist?.name || (typeof t?.artist === 'string' ? t.artist : '') || '';
    if (!name) return '';
    return `<div class="rp-artist-row"><button type="button" class="rp-artist-pill" onclick="openArtist(null,'${ejsonReady(name)}')"><span class="rp-artist-pill-ph">${escHtml(name[0] || '?')}</span><span>${escHtml(name)}</span></button></div>`;
  }
  return `<div class="rp-artist-row">${arts.map(a => {
    const idArg = a.id != null ? `'${ejsonReady(a.id)}'` : 'null';
    const pic = a.picture_medium || a.picture_xl || '';
    const avatar = pic
      ? `<img class="rp-artist-pill-ava" src="${pic}" alt="">`
      : `<span class="rp-artist-pill-ph">${escHtml((a.name || '?')[0])}</span>`;
    return `<button type="button" class="rp-artist-pill" onclick="openArtist(${idArg},'${ejsonReady(a.name)}')">${avatar}<span>${escHtml(a.name)}</span></button>`;
  }).join('')}</div>`;
}

function renderRpNow(box) {
  const t = getCurrentTrack();
  if (!t) {
    box.innerHTML = `<div class="rp-empty">Ничего не играет.<br/>Выбери трек, чтобы увидеть детали.</div>`;
    return;
  }
  const cover = t.album?.cover_xl || t.album?.cover_medium || t.cover || '';
  const album = t.album?.title || '';
  const albumId = t.album?.id;
  const fav = typeof Store !== 'undefined' && Store.isFav(t);
  const albumClick = albumId
    ? `onclick="(typeof openSavedAlbum==='function'?openSavedAlbum('${albumId}','${ejsonReady(album)}','${ejsonReady(t.artist?.name || '')}'):(window.mrfGo||function(u){location.href=u})(mrfUrl('album',{id:'${albumId}',title:'${ejsonReady(album)}'})))"`
    : '';
  box.innerHTML = `
    <div class="rp-now">
      <div class="rp-cover-wrap">
        <div class="rp-cover" style="${cover ? `background-image:url('${cover}')` : ''}"></div>
      </div>
      <div class="rp-now-meta">
        <h2 class="rp-now-title">${escHtml(t.title || '')}</h2>
        ${rpArtistChipsHTML(t)}
        ${album ? `<button type="button" class="rp-now-album" ${albumClick}>${escHtml(album)}</button>` : ''}
      </div>
      <div class="rp-now-actions">
        <button type="button" class="rp-action${fav ? ' is-on' : ''}" onclick="toggleFavPlayer();setRightPanelTab('now')">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="${fav ? 'currentColor' : 'none'}"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke="currentColor" stroke-width="1.8"/></svg>
          ${fav ? 'В избранном' : 'В избранное'}
        </button>
        <button type="button" class="rp-action" onclick="setRightPanelTab('lyrics')">Текст</button>
        <button type="button" class="rp-action" onclick="setRightPanelTab('artist')">Артисты</button>
      </div>
      <div class="rp-section-title">Похожие</div>
      <div id="rp-similar" class="rp-similar">${loaderHTMLShared('Ищем похожие…')}</div>
    </div>`;
  if (typeof enrichTrackArtists === 'function' && !t._artistsEnriched) {
    const tid = t.id;
    enrichTrackArtists(t).then(() => {
      if (getCurrentTrack()?.id !== tid) return;
      if (typeof Store !== 'undefined' && Store.getPanelState?.()?.tab === 'now') renderRpNow(box);
      if (typeof updatePlayerUI === 'function') updatePlayerUI(getCurrentTrack());
    }).catch(() => {});
  }
  loadSimilarTracks(t);
}

let _rpSimilarGen = 0;
async function loadSimilarTracks(t) {
  const box = document.getElementById('rp-similar');
  if (!box) return;
  const gen = ++_rpSimilarGen;
  const trackId = t?.id;
  try {
    const q = encodeURIComponent((t.artist?.name || t.artist || t.title || 'pop') + '');
    const list = (await dzArr(`/search/track?q=${q}&limit=8`)).map(normDZ).filter(x => x.id !== t.id).slice(0, 5);
    if (gen !== _rpSimilarGen) return;
    if (getCurrentTrack()?.id !== trackId) return;
    _src['rp_similar'] = list;
    box.innerHTML = list.length
      ? list.map((x, i) => `
        <button type="button" class="rp-track" onclick="playFromSrc('rp_similar',${i})">
          ${x.album?.cover_medium ? `<img src="${x.album.cover_medium}" alt="">` : `<div class="rp-track-ph">${noteSVGShared()}</div>`}
          <span class="rp-track-meta">
            <span class="rp-track-t">${escHtml(x.title)}</span>
            <span class="rp-track-a">${typeof formatArtistsText === 'function' ? escHtml(formatArtistsText(x)) : escHtml(x.artist?.name || '')}</span>
          </span>
        </button>`).join('')
      : `<div class="rp-empty" style="padding:12px 0">Нет похожих</div>`;
  } catch {
    if (gen !== _rpSimilarGen) return;
    box.innerHTML = `<div class="rp-empty" style="padding:12px 0">Не удалось загрузить</div>`;
  }
}

function renderRpQueue(box) {
  if (typeof queue === 'undefined' || !queue.length) {
    box.innerHTML = `<div class="rp-empty">Очередь пуста</div>`;
    return;
  }
  box.innerHTML = `
    <div class="rp-queue-toolbar">
      <span>${queue.length} треков</span>
      <button class="btn-secondary" style="padding:6px 10px;font-size:11px" onclick="clearQueue()">Очистить</button>
    </div>
    <div class="rp-queue-list">
      ${queue.map((t, i) => {
        const cur = i === queueIndex;
        return `<div class="rp-queue-item${cur ? ' current' : ''}" draggable="true" data-qi="${i}"
          ondragstart="queueDragStart(event,${i})" ondragover="event.preventDefault()" ondrop="queueDrop(event,${i})">
          <button class="rp-q-play" onclick="playFromQueue(${i})" title="Играть">${cur ? '▶' : (i + 1)}</button>
          ${t.album?.cover_medium ? `<img src="${t.album.cover_medium}" alt="">` : `<div class="rp-track-ph">${noteSVGShared()}</div>`}
          <div class="rp-q-info" onclick="playFromQueue(${i})">
            <div class="rp-track-t">${escHtml(t.title || '')}</div>
            <div class="rp-track-a">${typeof formatArtistsText === 'function' ? escHtml(formatArtistsText(t)) : escHtml(t.artist?.name || '')}</div>
          </div>
          <button class="rp-q-del" onclick="removeQueueItem(${i})" title="Удалить">${CLOSE_ICO}</button>
        </div>`;
      }).join('')}
    </div>`;
}

function renderRpLyrics(box) {
  const t = getCurrentTrack();
  if (!t) { box.innerHTML = `<div class="rp-empty">Нет активного трека</div>`; return; }
  const lines = fakeLyricsFor(t);
  box.innerHTML = `
    <div class="rp-lyrics-meta">
      <div class="rp-now-title" style="font-size:18px;margin-bottom:10px">${escHtml(t.title || '')}</div>
      ${rpArtistChipsHTML(t)}
    </div>
    <div class="rp-lyrics" id="rp-lyrics-lines">
      ${lines.map((line, i) => `<div class="rp-lyric-line" data-i="${i}">${escHtml(line)}</div>`).join('')}
    </div>`;
  startFakeLyricSync(lines.length);
}

function fakeLyricsFor(t) {
  const title = t.title || 'Трек';
  const artist = t.artist?.name || 'Артист';
  return [
    `${title}`,
    '',
    `Это демонстрационный текст песни`,
    `для композиции «${title}»`,
    `в исполнении ${artist}.`,
    '',
    'Строки подсвечиваются по мере',
    'воспроизведения превью —',
    'имитация синхронизации.',
    '',
    'Когда появится backend,',
    'сюда можно подключить реальные lyrics.',
    '',
    'MRF — Make Russia Free'
  ];
}

let _lyricTimer = null;
function startFakeLyricSync(n) {
  clearInterval(_lyricTimer);
  const lines = document.querySelectorAll('#rp-lyrics-lines .rp-lyric-line');
  if (!lines.length) return;
  let i = 0;
  const tick = () => {
    lines.forEach(l => l.classList.remove('active'));
    if (lines[i]) {
      lines[i].classList.add('active');
      lines[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    i = (i + 1) % Math.max(n, 1);
  };
  tick();
  _lyricTimer = setInterval(tick, 2200);
}

let _rpArtistGen = 0;

async function resolveArtistId(track) {
  let id = track?.artist?.id || track?.artistId || null;
  if (id && String(id) !== '0' && String(id) !== 'undefined') return String(id);
  const name = track?.artist?.name || track?.artist || '';
  if (!name) return null;
  try {
    const found = await dzArr(`/search/artist?q=${encodeURIComponent(name)}&limit=8`);
    const exact = found.find(a => (a.name || '').toLowerCase() === String(name).toLowerCase()) || found[0];
    if (exact?.id) return String(exact.id);
  } catch (_) {}
  return null;
}

function enrichQueueArtist(trackId, artistMeta) {
  if (typeof queue === 'undefined' || !artistMeta) return;
  queue.forEach(t => {
    if (!t || t.id !== trackId) return;
    if (!t.artist || typeof t.artist !== 'object') t.artist = { name: artistMeta.name || '' };
    t.artist.id = artistMeta.id;
    if (artistMeta.name) t.artist.name = artistMeta.name;
    if (artistMeta.picture_medium) t.artist.picture_medium = artistMeta.picture_medium;
    if (artistMeta.picture_xl) t.artist.picture_xl = artistMeta.picture_xl;
  });
}

async function renderRpArtist(box) {
  const t = getCurrentTrack();
  if (!t) { box.innerHTML = `<div class="rp-empty">Нет активного трека</div>`; return; }
  const trackId = t.id;
  const gen = ++_rpArtistGen;
  box.innerHTML = loaderHTMLShared('Загружаем артиста…');

  if (typeof enrichTrackArtists === 'function' && !t._artistsEnriched) {
    try { await enrichTrackArtists(t); } catch (_) {}
  }
  if (gen !== _rpArtistGen) return;
  if (getCurrentTrack()?.id !== trackId) return;

  const arts = typeof trackArtists === 'function' ? trackArtists(t) : [];
  const name = arts[0]?.name || t.artist?.name || (typeof t.artist === 'string' ? t.artist : '') || '';
  let art = {};
  let top = [];
  let albs = [];
  let id = arts[0]?.id || null;
  try {
    if (!id) id = await resolveArtistId(t);
    if (id) {
      [art, top, albs] = await Promise.all([
        dzObj(`/artist/${id}`),
        dzArr(`/artist/${id}/top?limit=5`),
        dzArr(`/artist/${id}/albums?limit=8`)
      ]);
      if (art?.id) {
        enrichQueueArtist(trackId, {
          id: art.id,
          name: art.name || name,
          picture_medium: art.picture_medium,
          picture_xl: art.picture_xl
        });
      }
    }
  } catch (_) {}

  if (gen !== _rpArtistGen) return;
  if (getCurrentTrack()?.id !== trackId) return;

  const pic = art.picture_xl || art.picture_medium || t.artist?.picture_medium || arts[0]?.picture_medium || '';
  const aName = art.name || name || 'Артист';
  const aid = art.id || id;
  const following = aid ? Store.isFollowing(aid) : false;
  const topN = (top || []).map(normDZ);
  _src['rp_artist_top'] = topN;
  const artistUrl = aid
    ? (typeof mrfUrl === 'function' ? mrfUrl('artist', { id: aid, name: aName }) : `artist.html?id=${aid}`)
    : (name ? (typeof mrfUrl === 'function' ? mrfUrl('artist', { name: aName }) : `artist.html?name=${encodeURIComponent(aName)}`) : '');

  if (!aid && !name && !arts.length) {
    box.innerHTML = `<div class="rp-empty">Информация об артисте недоступна</div>`;
    return;
  }

  const switcher = arts.length > 1
    ? `<div class="rp-artists-on-track">
        <div class="rp-section-title" style="margin-top:0">На этом треке</div>
        <div class="rp-artist-row">${arts.map((a, i) => {
          const isActive = (aid && String(a.id) === String(aid)) || (!aid && i === 0);
          return `<button type="button" class="rp-artist-pill${isActive ? ' is-active' : ''}" onclick="openArtist(${a.id != null ? `'${ejsonReady(a.id)}'` : 'null'},'${ejsonReady(a.name)}')">
            ${a.picture_medium ? `<img class="rp-artist-pill-ava" src="${a.picture_medium}" alt="">` : `<span class="rp-artist-pill-ph">${escHtml((a.name||'?')[0])}</span>`}
            <span>${escHtml(a.name)}</span>
          </button>`;
        }).join('')}</div>
      </div>`
    : '';

  box.innerHTML = `
    <div class="rp-artist">
      ${switcher}
      <div class="rp-artist-hero">
        <div class="rp-artist-photo" style="${pic ? `background-image:url('${pic}')` : ''}">${!pic ? escHtml((aName || '?')[0]) : ''}</div>
        <div class="rp-artist-hero-meta">
          <div class="rp-kicker">Исполнитель</div>
          <h2 class="rp-now-title">${escHtml(aName)}</h2>
          <div class="rp-now-artist">${art.nb_fan ? (+art.nb_fan).toLocaleString('ru') + ' слушателей' : ''}</div>
        </div>
      </div>
      <p class="rp-bio">${escHtml(aid
        ? `Открой страницу ${aName}, чтобы посмотреть альбомы и релизы.`
        : (name ? `Ищем данные по «${aName}»…` : 'Информация об артисте недоступна.'))}</p>
      <div class="rp-now-actions">
        ${artistUrl ? `<button type="button" class="rp-action is-primary" onclick="(window.mrfGo||function(u){location.href=u})('${artistUrl}')">Страница</button>` : ''}
        ${aid ? `<button type="button" class="rp-action${following ? ' is-on' : ''}" onclick="toggleFollowFromPanel('${String(aid)}','${ejsonReady(aName)}','${String(pic).replace(/'/g, '')}')">${following ? 'Вы подписаны' : 'Подписаться'}</button>` : ''}
      </div>
      ${topN.length ? `<div class="rp-section-title">Популярные</div>
        <div class="rp-similar">${topN.map((x,i) => `
          <button type="button" class="rp-track" onclick="playFromSrc('rp_artist_top',${i})">
            ${x.album?.cover_medium ? `<img src="${x.album.cover_medium}" alt="">` : `<div class="rp-track-ph">${noteSVGShared()}</div>`}
            <span class="rp-track-meta"><span class="rp-track-t">${escHtml(x.title)}</span><span class="rp-track-a">${fmtDur(x.duration)}</span></span>
          </button>`).join('')}</div>` : ''}
      ${albs.length ? `<div class="rp-section-title">Альбомы и релизы</div>
        <div class="rp-albums">${albs.slice(0,8).map(a => {
          const albUrl = typeof mrfUrl === 'function' ? mrfUrl('album', { id: a.id, title: a.title, artist: aName }) : `album.html?id=${a.id}`;
          return `<button type="button" class="rp-album" onclick="(window.mrfGo||function(u){location.href=u})('${albUrl}')">
            ${a.cover_medium ? `<img src="${a.cover_medium}" alt="">` : `<div class="rp-track-ph">${noteSVGShared()}</div>`}
            <span class="rp-track-t">${escHtml(a.title)}</span>
          </button>`;
        }).join('')}</div>` : ''}
    </div>`;
}

function toggleFollowFromPanel(id, name, picture) {
  const added = Store.toggleFollow({ id, name, picture });
  showNotif(added ? 'Подписка оформлена' : 'Подписка отменена');
  if (typeof notifyLibraryChanged === 'function') notifyLibraryChanged();
  setRightPanelTab('artist');
}

/* ── Queue helpers ─────────────────────────────────── */
function playFromQueue(i) {
  if (typeof queue === 'undefined' || !queue[i]) return;
  queueIndex = i;
  playNow();
  if (document.getElementById('right-panel') && !document.getElementById('right-panel').classList.contains('hidden')) {
    setRightPanelTab('queue');
  }
}

function removeQueueItem(i) {
  if (typeof queue === 'undefined') return;
  const removed = queue.splice(i, 1)[0];
  if (typeof _originalQueue !== 'undefined' && removed?.id != null) {
    _originalQueue = _originalQueue.filter(t => t.id !== removed.id);
  }
  if (queueIndex >= queue.length) queueIndex = queue.length - 1;
  else if (i < queueIndex) queueIndex--;
  if (typeof persistPlayer === 'function') persistPlayer();
  notifyQueueChanged();
  showNotif('Удалено из очереди');
}

function clearQueue() {
  if (!confirm('Очистить очередь?')) return;
  const cur = getCurrentTrack();
  queue = cur ? [cur] : [];
  queueIndex = cur ? 0 : -1;
  if (typeof _originalQueue !== 'undefined') _originalQueue = queue.map(t => ({ ...t }));
  if (typeof persistPlayer === 'function') persistPlayer();
  notifyQueueChanged();
  showNotif('Очередь очищена');
}

let _dragQi = null;
function queueDragStart(e, i) { _dragQi = i; e.dataTransfer.effectAllowed = 'move'; }
function queueDrop(e, to) {
  e.preventDefault();
  if (_dragQi == null || _dragQi === to) return;
  const item = queue.splice(_dragQi, 1)[0];
  queue.splice(to, 0, item);
  if (queueIndex === _dragQi) queueIndex = to;
  else if (_dragQi < queueIndex && to >= queueIndex) queueIndex--;
  else if (_dragQi > queueIndex && to <= queueIndex) queueIndex++;
  _dragQi = null;
  if (typeof persistPlayer === 'function') persistPlayer();
  notifyQueueChanged();
}

function addToQueue(track) {
  if (!track) return;
  if (typeof queue === 'undefined') return;
  const copy = { ...track };
  queue.push(copy);
  if (typeof _originalQueue !== 'undefined') _originalQueue.push({ ...copy });
  if (queueIndex < 0) { queueIndex = 0; playNow(); }
  else if (typeof persistPlayer === 'function') persistPlayer();
  notifyQueueChanged();
  showNotif('Добавлено в очередь');
}

function playNext(track) {
  if (!track || typeof queue === 'undefined') return;
  const copy = { ...track };
  const at = Math.max(queueIndex + 1, 0);
  queue.splice(at, 0, copy);
  if (typeof _originalQueue !== 'undefined') {
    const oAt = Math.min(at, _originalQueue.length);
    _originalQueue.splice(oAt, 0, { ...copy });
  }
  if (queueIndex < 0) { queueIndex = 0; playNow(); }
  else if (typeof persistPlayer === 'function') persistPlayer();
  notifyQueueChanged();
  showNotif('Будет следующим');
}

window.playFromQueue = playFromQueue;
window.removeQueueItem = removeQueueItem;
window.clearQueue = clearQueue;
window.queueDragStart = queueDragStart;
window.queueDrop = queueDrop;
window.addToQueue = addToQueue;
window.playNext = playNext;
window.toggleRightPanel = toggleRightPanel;
window.openRightPanel = openRightPanel;
window.closeRightPanel = closeRightPanel;
window.setRightPanelTab = setRightPanelTab;

/* ── Context menu helpers (showTrackMenu lives in app.js) ── */
function removeTrackFromPlaylistCtx(key, idx) {
  const plId = key.replace('pl_', '');
  const t = _src[key]?.[idx];
  if (!t) return;
  Store.removeTrackFromPlaylist(plId, t.id);
  showNotif('Удалено из плейлиста');
  if (typeof loadPlaylistPage === 'function') loadPlaylistPage();
}

function showTrackInfo(t) {
  if (!t) return;
  const artists = typeof formatArtistsText === 'function' ? formatArtistsText(t) : (t.artist?.name || '');
  const lines = [
    t.title || 'Без названия',
    artists || 'Неизвестный исполнитель',
    t.album?.title ? `Альбом: ${t.album.title}` : '',
    t.duration ? `Длительность: ${fmtDur(t.duration)}` : ''
  ].filter(Boolean);
  showNotif(lines.join(' · '), 4000);
  alert(lines.join('\n'));
}
window.showTrackInfo = showTrackInfo;

function shareTrack(t) {
  if (!t) return;
  const id = t.deezerId || String(t.id || '').replace(/^dz_/i, '') || t.id;
  const url = typeof mrfUrl === 'function'
    ? new URL(mrfUrl('track', { id }), location.href).href
    : `${location.origin}${location.pathname.replace(/[^/]+$/, '')}track.html?id=${encodeURIComponent(id)}`;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(() => showNotif('Ссылка скопирована')).catch(() => prompt('Ссылка:', url));
  } else prompt('Ссылка:', url);
}
window.shareTrack = shareTrack;

/* Override openNowPlaying / toggleQueue to use right panel */
function openNowPlaying() { openRightPanel('now'); }
function closeNowPlaying() { closeRightPanel(); }
function toggleQueue() {
  const p = document.getElementById('right-panel');
  if (p && !p.classList.contains('hidden') && Store.getPanelState().tab === 'queue') closeRightPanel();
  else openRightPanel('queue');
}

/* Patch rowHTML to include menu button if not present - via monkey patch after load */
(function patchRowHTML() {
  if (typeof rowHTML !== 'function') return;
  const orig = rowHTML;
  window.rowHTML = function(t, i, key) {
    let html = orig(t, i, key);
    if (!html.includes('track-menu-btn')) {
      html = html.replace(
        '</button>\n  </div>`',
        `</button>
    <button class="track-menu-btn" onclick="event.stopPropagation();showTrackMenu(event,${i},'${typeof esc==='function'?esc(key):key}')" title="Ещё">
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>
    </button>
  </div>`
      );
      // fallback simpler inject before closing track-item
      if (!html.includes('track-menu-btn')) {
        html = html.replace(
          /(<\/div>)(\s*)$/,
          `<button class="track-menu-btn" onclick="event.stopPropagation();showTrackMenu(event,${i},'${String(key).replace(/'/g, "\\'")}')" title="Ещё"><svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg></button>$1$2`
        );
      }
    }
    return html;
  };
})();

/* ── Boot after shared init ────────────────────────── */
function bootMrfReady() {
  applyThemeFromSettings();
  ensureRightPanel();
  polishShellIcons();
  const cover = document.getElementById('player-cover');
  if (cover) cover.onclick = () => openRightPanel('now');
}
window.bootMrfReady = bootMrfReady;

// Hook into initShared completion (idempotent wrap)
if (!window.__mrfInitWrapped && typeof initShared === 'function') {
  window.__mrfInitWrapped = true;
  const _origInitShared = initShared;
  window.initShared = function() {
    _origInitShared();
    bootMrfReady();
  };
}

/** Safe page boot helper — use when scripts are at end of body */
function whenDomReady(fn) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
  else fn();
}
window.whenDomReady = whenDomReady;

/* Soft-nav fallback loader if page HTML doesn't include soft-nav.js yet */
(function ensureSoftNav() {
  if (window.__mrfSoftNav || window.mrfGo) return;
  if (document.querySelector('script[src*="soft-nav.js"]')) return;
  const s = document.createElement('script');
  s.src = 'soft-nav.js';
  s.async = false;
  (document.head || document.documentElement).appendChild(s);
})();
