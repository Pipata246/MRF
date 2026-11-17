/* =====================================================
   MRF — mrf-ready.js
   Доводка до полной готовности: панель, очередь, меню,
   тема, хелперы страниц. Подключается после app.js.
   ===================================================== */

const CLOSE_ICO = `<svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
function ejsonReady(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\n\r]/g, '');
}

/* ── Theme ─────────────────────────────────────────── */
function applyThemeFromSettings() {
  const s = Store.getSettings();
  const theme = s.theme || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  document.body.classList.toggle('theme-light', theme === 'light');
  if (s.accentColor) {
    document.documentElement.style.setProperty('--accent', s.accentColor);
    document.documentElement.style.setProperty('--accent-d', s.accentColor);
  }
}
window.applyThemeFromSettings = applyThemeFromSettings;

function setTheme(theme) {
  Store.setSettings({ theme });
  applyThemeFromSettings();
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

function renderRpNow(box) {
  const t = getCurrentTrack();
  if (!t) {
    box.innerHTML = `<div class="rp-empty">Ничего не играет.<br/>Выбери трек, чтобы увидеть детали.</div>`;
    return;
  }
  const cover = t.album?.cover_xl || t.album?.cover_medium || t.cover || '';
  const artist = t.artist?.name || t.artist || '';
  const album = t.album?.title || '';
  const fav = typeof isFav === 'function' && isFav(t.title || '', artist);
  box.innerHTML = `
    <div class="rp-now">
      <div class="rp-cover" style="${cover ? `background-image:url('${cover}')` : ''}"></div>
      <div class="rp-now-title">${escHtml(t.title || '')}</div>
      <div class="rp-now-artist">${escHtml(artist)}</div>
      ${album ? `<div class="rp-now-album">${escHtml(album)}</div>` : ''}
      <div class="rp-now-actions">
        <button class="btn-secondary" onclick="toggleFavPlayer()">${fav ? 'В избранном' : 'В избранное'}</button>
        <button class="btn-secondary" onclick="setRightPanelTab('lyrics')">Текст</button>
        <button class="btn-secondary" onclick="setRightPanelTab('artist')">Об артисте</button>
      </div>
      <div class="rp-section-title">Похожие</div>
      <div id="rp-similar" class="rp-similar">${loaderHTMLShared('Ищем похожие…')}</div>
    </div>`;
  loadSimilarTracks(t);
}

async function loadSimilarTracks(t) {
  const box = document.getElementById('rp-similar');
  if (!box) return;
  try {
    const q = encodeURIComponent((t.artist?.name || t.artist || t.title || 'pop') + '');
    const list = (await dzArr(`/search/track?q=${q}&limit=8`)).map(normDZ).filter(x => x.id !== t.id).slice(0, 5);
    _src['rp_similar'] = list;
    box.innerHTML = list.length
      ? list.map((x, i) => `
        <div class="rp-track" onclick="playFromSrc('rp_similar',${i})">
          ${x.album?.cover_medium ? `<img src="${x.album.cover_medium}" alt="">` : `<div class="rp-track-ph">${noteSVGShared()}</div>`}
          <div><div class="rp-track-t">${escHtml(x.title)}</div><div class="rp-track-a">${escHtml(x.artist?.name || '')}</div></div>
        </div>`).join('')
      : `<div class="rp-empty" style="padding:12px 0">Нет похожих</div>`;
  } catch {
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
            <div class="rp-track-a">${escHtml(t.artist?.name || '')}</div>
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
      <div class="rp-now-title" style="font-size:18px">${escHtml(t.title || '')}</div>
      <div class="rp-now-artist">${escHtml(t.artist?.name || '')}</div>
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

async function renderRpArtist(box) {
  const t = getCurrentTrack();
  if (!t) { box.innerHTML = `<div class="rp-empty">Нет активного трека</div>`; return; }
  const id = t.artist?.id;
  const name = t.artist?.name || '';
  box.innerHTML = loaderHTMLShared('Загружаем артиста…');
  let art = {};
  let top = [];
  let albs = [];
  try {
    if (id) {
      [art, top, albs] = await Promise.all([
        dzObj(`/artist/${id}`),
        dzArr(`/artist/${id}/top?limit=5`),
        dzArr(`/artist/${id}/albums?limit=6`)
      ]);
    }
  } catch {}
  const pic = art.picture_xl || art.picture_medium || t.artist?.picture_medium || '';
  const aName = art.name || name;
  const following = id ? Store.isFollowing(id) : false;
  const topN = top.map(normDZ);
  _src['rp_artist_top'] = topN;
  box.innerHTML = `
    <div class="rp-artist">
      <div class="rp-artist-photo" style="${pic ? `background-image:url('${pic}')` : ''}">${!pic ? (aName[0] || '?') : ''}</div>
      <div class="rp-now-title">${escHtml(aName)}</div>
      <div class="rp-now-artist">${art.nb_fan ? (+art.nb_fan).toLocaleString('ru') + ' слушателей' : ''}</div>
      <p class="rp-bio">${escHtml(art.name ? `${aName} — артист на MRF. Открой страницу исполнителя, чтобы увидеть полную биографию и дискографию.` : 'Информация об артисте недоступна.')}</p>
      <div class="rp-now-actions">
        ${id ? `<button class="btn-primary" style="padding:8px 14px;font-size:12px" onclick="location.href='${mrfUrl('artist',{id,name:aName})}'">Страница артиста</button>` : ''}
        ${id ? `<button class="btn-secondary" onclick="toggleFollowFromPanel(${id},'${ejsonReady(aName)}','${pic.replace(/'/g, '')}')">${following ? 'Вы подписаны' : 'Подписаться'}</button>` : ''}
      </div>
      ${topN.length ? `<div class="rp-section-title">Популярные</div>
        ${topN.map((x,i) => `<div class="rp-track" onclick="playFromSrc('rp_artist_top',${i})">
          ${x.album?.cover_medium ? `<img src="${x.album.cover_medium}" alt="">` : `<div class="rp-track-ph">${noteSVGShared()}</div>`}
          <div><div class="rp-track-t">${escHtml(x.title)}</div><div class="rp-track-a">${fmtDur(x.duration)}</div></div>
        </div>`).join('')}` : ''}
      ${albs.length ? `<div class="rp-section-title">Альбомы</div>
        <div class="rp-albums">${albs.slice(0,6).map(a => `
          <div class="rp-album" onclick="location.href='${mrfUrl('album',{id:a.id,title:a.title,artist:aName})}'">
            ${a.cover_medium ? `<img src="${a.cover_medium}" alt="">` : `<div class="rp-track-ph">${noteSVGShared()}</div>`}
            <div class="rp-track-t">${escHtml(a.title)}</div>
          </div>`).join('')}</div>` : ''}
    </div>`;
}

function toggleFollowFromPanel(id, name, picture) {
  const added = Store.toggleFollow({ id, name, picture });
  showNotif(added ? 'Подписка оформлена' : 'Подписка отменена');
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
  queue.splice(i, 1);
  if (queueIndex >= queue.length) queueIndex = queue.length - 1;
  else if (i < queueIndex) queueIndex--;
  if (typeof persistPlayer === 'function') persistPlayer();
  setRightPanelTab('queue');
  showNotif('Удалено из очереди');
}

function clearQueue() {
  if (!confirm('Очистить очередь?')) return;
  const cur = getCurrentTrack();
  queue = cur ? [cur] : [];
  queueIndex = cur ? 0 : -1;
  if (typeof persistPlayer === 'function') persistPlayer();
  setRightPanelTab('queue');
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
  setRightPanelTab('queue');
}

function addToQueue(track) {
  if (!track) return;
  if (typeof queue === 'undefined') return;
  queue.push({ ...track });
  if (queueIndex < 0) { queueIndex = 0; playNow(); }
  else if (typeof persistPlayer === 'function') persistPlayer();
  showNotif('Добавлено в очередь');
}

function playNext(track) {
  if (!track || typeof queue === 'undefined') return;
  const at = Math.max(queueIndex + 1, 0);
  queue.splice(at, 0, { ...track });
  if (queueIndex < 0) { queueIndex = 0; playNow(); }
  else if (typeof persistPlayer === 'function') persistPlayer();
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
  alert(`${t.title || ''}\n${t.artist?.name || ''}\n${t.album?.title || ''}\n${fmtDur(t.duration)}`);
}

function shareTrack(t) {
  if (!t) return;
  const url = `${location.origin}${location.pathname.replace(/[^/]+$/, '')}track.html?id=${encodeURIComponent(t.id)}`;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(() => showNotif('Ссылка скопирована')).catch(() => prompt('Ссылка:', url));
  } else prompt('Ссылка:', url);
}

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
