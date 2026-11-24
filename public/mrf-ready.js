/* =====================================================
   NOVALIBER — mrf-ready.js
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

function getAccentForTheme(theme, settings) {
  const s = settings || (typeof Store !== 'undefined' ? Store.getSettings() : {}) || {};
  const t = theme || s.theme || 'dark';
  const raw = t === 'light'
    ? (s.accentColorLight || s.accentColor || '#27AE60')
    : (s.accentColorDark || s.accentColor || '#EE90B7');
  const fallback = t === 'light' ? '#27AE60' : '#EE90B7';
  if (typeof mrfClampAccentForPlan === 'function') return mrfClampAccentForPlan(raw, fallback);
  return raw;
}
window.getAccentForTheme = getAccentForTheme;

function applyThemeFromSettings() {
  const s = Store.getSettings() || {};
  const theme = s.theme || 'dark';
  const accent = getAccentForTheme(theme, s);
  // Persist clamp for free users who had a locked color saved locally
  if (typeof mrfUserHasPremium === 'function' && !mrfUserHasPremium()) {
    const patch = {};
    const dark = (typeof mrfClampAccentForPlan === 'function')
      ? mrfClampAccentForPlan(s.accentColorDark || s.accentColor, '#EE90B7')
      : '#EE90B7';
    const light = (typeof mrfClampAccentForPlan === 'function')
      ? mrfClampAccentForPlan(s.accentColorLight || s.accentColor, '#27AE60')
      : '#27AE60';
    if (String(s.accentColorDark || '').toUpperCase() !== dark) patch.accentColorDark = dark;
    if (String(s.accentColorLight || '').toUpperCase() !== light) patch.accentColorLight = light;
    const curKey = theme === 'light' ? 'accentColorLight' : 'accentColorDark';
    const curVal = theme === 'light' ? light : dark;
    if (String(s.accentColor || '').toUpperCase() !== curVal) patch.accentColor = curVal;
    if (s.shuffleOnPlay) patch.shuffleOnPlay = false;
    if (Object.keys(patch).length) Store.setSettings(patch);
  }
  document.documentElement.setAttribute('data-theme', theme);
  document.body.classList.toggle('theme-light', theme === 'light');
  applyAccentColor(accent);
  if (typeof syncAccentPaletteUI === 'function') syncAccentPaletteUI();
  if (typeof syncAccentPremiumLocks === 'function') syncAccentPremiumLocks();
  if (typeof syncPrisonPlayerUi === 'function') syncPrisonPlayerUi();
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
  // Сбросить скролл к верху при открытии
  const body = document.getElementById('rp-body');
  if (body) body.scrollTop = 0;
}

function closeRightPanel() {
  document.getElementById('right-panel')?.classList.add('hidden');
  document.body.classList.remove('right-panel-open');
  Store.setPanelState({ open: false });
  if (typeof _stopRpProgressSync === 'function') _stopRpProgressSync();
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

function isDesktopRp() {
  try {
    if (typeof isMobilePlayerUi === 'function') return !isMobilePlayerUi();
    return window.matchMedia('(min-width: 901px)').matches
      || document.documentElement.getAttribute('data-ui') === 'desktop';
  } catch (_) {
    return false;
  }
}

function rpArtistChipsHTML(t) {
  const arts = typeof trackArtists === 'function' ? trackArtists(t) : [];
  const desktop = isDesktopRp();
  if (!arts.length) {
    const name = t?.artist?.name || (typeof t?.artist === 'string' ? t.artist : '') || '';
    if (!name) return '';
    const click = desktop
      ? `selectRpArtist(null,'${ejsonReady(name)}')`
      : `openArtist(null,'${ejsonReady(name)}')`;
    return `<div class="rp-artist-row"><button type="button" class="rp-artist-pill" onclick="${click}"><span class="rp-artist-pill-ph">${escHtml(name[0] || '?')}</span><span>${escHtml(name)}</span></button></div>`;
  }
  return `<div class="rp-artist-row">${arts.map(a => {
    const idArg = a.id != null ? `'${ejsonReady(a.id)}'` : 'null';
    const pic = a.picture_medium || a.picture_xl || '';
    const avatar = pic
      ? `<img class="rp-artist-pill-ava" src="${pic}" alt="">`
      : `<span class="rp-artist-pill-ph">${escHtml((a.name || '?')[0])}</span>`;
    const click = desktop
      ? `selectRpArtist(${idArg},'${ejsonReady(a.name)}')`
      : `openArtist(${idArg},'${ejsonReady(a.name)}')`;
    return `<button type="button" class="rp-artist-pill" onclick="${click}">${avatar}<span>${escHtml(a.name)}</span></button>`;
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
  const playing = typeof isPlaying !== 'undefined' && isPlaying;
  const albumClick = albumId
    ? `onclick="(typeof openSavedAlbum==='function'?openSavedAlbum('${albumId}','${ejsonReady(album)}','${ejsonReady(t.artist?.name || '')}'):(window.mrfGo||function(u){location.href=u})(mrfUrl('album',{id:'${albumId}',title:'${ejsonReady(album)}'})))"`
    : '';

  const playIconSvg = playing
    ? `<svg width="56" height="56" viewBox="0 0 24 24" fill="none"><path d="M22 12C22 6.477 17.523 2 12 2S2 6.477 2 12s4.477 10 10 10 10-4.477 10-10zm-10 7.992C7.58 19.99 4 16.408 4 11.992S7.58 3.994 11.996 3.992C16.413 3.99 20 7.583 20 12c0 4.413-3.583 7.994-7.996 7.992z" fill="currentColor" clip-rule="evenodd" fill-rule="evenodd"/><path d="M11 8H9v8h2V8zm4 0h-2v8h2V8z" fill="currentColor"/></svg>`
    : `<svg width="56" height="56" viewBox="0 0 24 24" fill="none"><path d="M22 12C22 6.477 17.523 2 12 2S2 6.477 2 12s4.477 10 10 10 10-4.477 10-10zm-10 7.992C7.58 19.99 4 16.408 4 11.992S7.58 3.994 11.996 3.992C16.413 3.99 20 7.583 20 12c0 4.413-3.583 7.994-7.996 7.992z" fill="currentColor" clip-rule="evenodd" fill-rule="evenodd"/><path d="M10 16V8l6 4-6 4z" fill="currentColor"/></svg>`;

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

      <!-- Мобильные контролы плеера -->
      <div class="rp-player-controls">
        <div class="rp-progress-wrap">
          <div class="rp-progress-track" id="rp-progress-track">
            <div class="rp-progress-fill" id="rp-progress-fill" style="width:${getRpProgressPct()}%">
              <div class="rp-progress-thumb"></div>
            </div>
          </div>
          <div class="rp-progress-times">
            <span id="rp-time-current">${getRpTimeCurrent()}</span>
            <span id="rp-time-total">${getRpTimeTotal()}</span>
          </div>
        </div>
        <div class="rp-controls-row">
          <button type="button" class="rp-ctrl-btn rp-ctrl-sm" onclick="toggleFavPlayer();setRightPanelTab('now')" title="${fav ? 'Убрать из избранного' : 'В избранное'}">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="${fav ? 'currentColor' : 'none'}"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke="currentColor" stroke-width="1.8"/></svg>
          </button>
          <button type="button" class="rp-ctrl-btn" onclick="prevTrack()" title="Предыдущий">
            <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
          </button>
          <button type="button" class="rp-ctrl-btn rp-ctrl-play" onclick="togglePlay();setTimeout(()=>setRightPanelTab('now'),80)" title="Пауза / Играть">
            ${playIconSvg}
          </button>
          <button type="button" class="rp-ctrl-btn" onclick="nextTrack()" title="Следующий">
            <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
          </button>
          <button type="button" class="rp-ctrl-btn rp-ctrl-sm" onclick="setRightPanelTab('queue')" title="Очередь">
            <svg viewBox="0 0 24 24" fill="none" width="22" height="22"><path d="M3 6h18M3 12h12M3 18h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>

      ${isDesktopRp() ? '' : `<div class="rp-now-actions">
        <button type="button" class="rp-action" onclick="setRightPanelTab('lyrics')">Текст</button>
        <button type="button" class="rp-action" onclick="setRightPanelTab('artist')">Артисты</button>
      </div>`}
      <div class="rp-section-title">Похожие</div>
      <div id="rp-similar" class="rp-similar">${loaderHTMLShared('Ищем похожие…')}</div>
    </div>`;

  // Привязка прогресс-бара
  _bindRpProgress();
  // Сбросить скролл к верху
  if (box) box.scrollTop = 0;
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

/* ── helpers for rp progress display ── */
function getRpProgressPct() {
  try {
    const a = (typeof audio !== 'undefined') ? audio : null;
    if (!a || !a.duration || !isFinite(a.duration)) return 0;
    return Math.min(100, (a.currentTime / a.duration) * 100);
  } catch { return 0; }
}
function _fmt(sec) {
  if (!sec || !isFinite(sec)) return '0:00';
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}
function getRpTimeCurrent() {
  try { return _fmt((typeof audio !== 'undefined') ? audio.currentTime : 0); } catch { return '0:00'; }
}
function getRpTimeTotal() {
  try {
    const a = (typeof audio !== 'undefined') ? audio : null;
    if (!a || !a.duration || !isFinite(a.duration)) return '0:00';
    return _fmt(a.duration);
  } catch { return '0:00'; }
}

let _rpProgressTimer = null;
function _startRpProgressSync() {
  _stopRpProgressSync();
  _rpProgressTimer = setInterval(() => {
    try {
      const a = (typeof audio !== 'undefined') ? audio : null;
      if (!a) return;
      const fill = document.getElementById('rp-progress-fill');
      const tc = document.getElementById('rp-time-current');
      const tt = document.getElementById('rp-time-total');
      if (fill && a.duration && isFinite(a.duration)) {
        fill.style.width = Math.min(100, (a.currentTime / a.duration) * 100) + '%';
      }
      if (tc) tc.textContent = _fmt(a.currentTime);
      if (tt && a.duration && isFinite(a.duration)) tt.textContent = _fmt(a.duration);
    } catch {}
  }, 500);
}
function _stopRpProgressSync() {
  if (_rpProgressTimer) { clearInterval(_rpProgressTimer); _rpProgressTimer = null; }
}

function _bindRpProgress() {
  _startRpProgressSync();
  const track = document.getElementById('rp-progress-track');
  if (!track || track.dataset.rpBound) return;
  track.dataset.rpBound = '1';
  let dragging = false;
  const getPct = e => {
    const r = track.getBoundingClientRect();
    return Math.max(0, Math.min(1, ((e.clientX || e.touches?.[0]?.clientX || 0) - r.left) / r.width));
  };
  const apply = pct => {
    const fill = document.getElementById('rp-progress-fill');
    if (fill) fill.style.width = (pct * 100) + '%';
    try {
      const a = (typeof audio !== 'undefined') ? audio : null;
      if (a && a.duration && isFinite(a.duration)) a.currentTime = pct * a.duration;
    } catch {}
  };
  track.addEventListener('pointerdown', e => { dragging = true; track.setPointerCapture(e.pointerId); apply(getPct(e)); });
  track.addEventListener('pointermove', e => { if (dragging) apply(getPct(e)); });
  track.addEventListener('pointerup',   e => { if (dragging) { apply(getPct(e)); dragging = false; } });
  track.addEventListener('pointercancel', () => { dragging = false; });
}

/* Keep rp-now controls in sync when play state changes from outside */
const _origSetPlayIconRp = window.setPlayIcon;
function _syncRpPlayBtn() {
  const btn = document.querySelector('.rp-ctrl-play');
  if (!btn) return;
  const on = typeof isPlaying !== 'undefined' && isPlaying;
  btn.innerHTML = on
    ? `<svg width="56" height="56" viewBox="0 0 24 24" fill="none"><path d="M22 12C22 6.477 17.523 2 12 2S2 6.477 2 12s4.477 10 10 10 10-4.477 10-10zm-10 7.992C7.58 19.99 4 16.408 4 11.992S7.58 3.994 11.996 3.992C16.413 3.99 20 7.583 20 12c0 4.413-3.583 7.994-7.996 7.992z" fill="currentColor" clip-rule="evenodd" fill-rule="evenodd"/><path d="M11 8H9v8h2V8zm4 0h-2v8h2V8z" fill="currentColor"/></svg>`
    : `<svg width="56" height="56" viewBox="0 0 24 24" fill="none"><path d="M22 12C22 6.477 17.523 2 12 2S2 6.477 2 12s4.477 10 10 10 10-4.477 10-10zm-10 7.992C7.58 19.99 4 16.408 4 11.992S7.58 3.994 11.996 3.992C16.413 3.99 20 7.583 20 12c0 4.413-3.583 7.994-7.996 7.992z" fill="currentColor" clip-rule="evenodd" fill-rule="evenodd"/><path d="M10 16V8l6 4-6 4z" fill="currentColor"/></svg>`;
}
window._syncRpPlayBtn = _syncRpPlayBtn;
/* Patch setPlayIcon to also update rp panel button */
(function patchSetPlayIcon() {
  const wait = setInterval(() => {
    if (typeof setPlayIcon !== 'function') return;
    clearInterval(wait);
    const orig = setPlayIcon;
    window.setPlayIcon = function(on) {
      orig(on);
      _syncRpPlayBtn();
    };
  }, 100);
})();
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
    'NOVALIBER — NOVALIBER'
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
let _rpSelectedArtistId = null;
let _rpSelectedArtistName = '';
let _rpArtistTrackId = null;

/** PC: switch artist inside right panel (do not navigate to artist page) */
function selectRpArtist(id, name) {
  _rpSelectedArtistId = id != null && String(id) !== '' && String(id) !== 'null' ? String(id) : null;
  _rpSelectedArtistName = name || '';
  openRightPanel('artist');
  setRightPanelTab('artist');
}
window.selectRpArtist = selectRpArtist;

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
  if (_rpArtistTrackId !== trackId) {
    _rpArtistTrackId = trackId;
    _rpSelectedArtistId = null;
    _rpSelectedArtistName = '';
  }
  const gen = ++_rpArtistGen;
  box.innerHTML = loaderHTMLShared('Загружаем артиста…');

  if (typeof enrichTrackArtists === 'function' && !t._artistsEnriched) {
    try { await enrichTrackArtists(t); } catch (_) {}
  }
  if (gen !== _rpArtistGen) return;
  if (getCurrentTrack()?.id !== trackId) return;

  const arts = typeof trackArtists === 'function' ? trackArtists(t) : [];
  const desktop = isDesktopRp();
  const selectedFromList = _rpSelectedArtistId
    ? arts.find(a => String(a.id) === String(_rpSelectedArtistId))
    : (_rpSelectedArtistName
      ? arts.find(a => String(a.name || '').toLowerCase() === String(_rpSelectedArtistName).toLowerCase())
      : null);
  const name = selectedFromList?.name
    || _rpSelectedArtistName
    || arts[0]?.name
    || t.artist?.name
    || (typeof t.artist === 'string' ? t.artist : '')
    || '';
  let art = {};
  let top = [];
  let albs = [];
  let id = selectedFromList?.id || _rpSelectedArtistId || arts[0]?.id || null;
  try {
    if (!id && !_rpSelectedArtistName) id = await resolveArtistId(t);
    if (!id && name) {
      try {
        const found = await dzArr(`/search/artist?q=${encodeURIComponent(name)}&limit=8`);
        const exact = found.find(a => (a.name || '').toLowerCase() === String(name).toLowerCase()) || found[0];
        if (exact?.id) id = String(exact.id);
      } catch (_) {}
    }
    if (id) {
      [art, top, albs] = await Promise.all([
        dzObj(`/artist/${id}`),
        dzArr(`/artist/${id}/top?limit=5`),
        dzArr(`/artist/${id}/albums?limit=8`)
      ]);
      if (art?.id) {
        _rpSelectedArtistId = String(art.id);
        _rpSelectedArtistName = art.name || name;
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

  const pic = art.picture_xl || art.picture_medium || selectedFromList?.picture_medium || t.artist?.picture_medium || arts[0]?.picture_medium || '';
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
          const isActive = (aid && String(a.id) === String(aid))
            || (!aid && _rpSelectedArtistName && String(a.name || '').toLowerCase() === String(_rpSelectedArtistName).toLowerCase())
            || (!aid && !_rpSelectedArtistName && i === 0);
          const idArg = a.id != null ? `'${ejsonReady(a.id)}'` : 'null';
          const click = desktop
            ? `selectRpArtist(${idArg},'${ejsonReady(a.name)}')`
            : `openArtist(${idArg},'${ejsonReady(a.name)}')`;
          return `<button type="button" class="rp-artist-pill${isActive ? ' is-active' : ''}" onclick="${click}">
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
        ? ''
        : (name ? `Ищем данные по «${aName}»…` : 'Информация об артисте недоступна.'))}</p>
      <div class="rp-now-actions">
        ${artistUrl ? `<button type="button" class="rp-action is-primary" onclick="closeRightPanel();(window.mrfGo||function(u){location.href=u})('${artistUrl}')">Страница</button>` : ''}
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
  if (typeof renderArtistsPage === 'function' && document.getElementById('artists-grid')) {
    renderArtistsPage();
  }
  setRightPanelTab('artist');
}

/* ── Queue helpers ─────────────────────────────────── */
function playFromQueue(i) {
  if (typeof queue === 'undefined' || !queue[i]) return;
  if (typeof queueIndex === 'number' && i !== queueIndex) {
    if (typeof mrfRequirePremium === 'function' && !mrfRequirePremium('pick')) return;
    window._trackFlowDir = i > queueIndex ? 1 : -1;
  }
  queueIndex = i;
  playNow();
  if (!document.getElementById('fs-queue-sheet')?.classList.contains('hidden')) {
    renderFsQueueSheet();
  }
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
  if (typeof isOwnedPlaylistSrcKey === 'function' && !isOwnedPlaylistSrcKey(key)) return;
  const plId = String(key || '').replace(/^pl_/, '');
  if (!plId || plId.startsWith('rec_')) return;
  const t = _src[key]?.[idx];
  if (!t) return;
  const pl = Store.getPlaylist?.(plId);
  if (!pl || pl.readOnly) return;
  Store.removeTrackFromPlaylist(plId, t.id);
  showNotif('Удалено из плейлиста');
  if (typeof loadPlaylistPage === 'function') loadPlaylistPage();
}

function showTrackInfo() {
  /* removed — no track info toasts */
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

function isMobilePlayerUi() {
  if (typeof isMobileLayout === 'function') return isMobileLayout();
  return window.matchMedia('(max-width: 900px)').matches
    || document.documentElement.getAttribute('data-ui') === 'mobile';
}
window.isMobilePlayerUi = isMobilePlayerUi;

function trackCoverUrl(t, size = 1000) {
  if (!t) return '';
  if (typeof bestCoverUrl === 'function') return bestCoverUrl(t, size);
  const raw = t.album?.cover_xl || t.album?.cover_big || t.album?.cover_medium || t.album?.cover || t.cover || '';
  if (typeof upgradeCoverUrl === 'function') return upgradeCoverUrl(raw, size);
  return raw;
}

function setCoverEl(el, url) {
  if (!el) return;
  const img = el.matches?.('img') ? el : el.querySelector?.('img.fs-cover-img, img');
  if (img) {
    if (url) {
      img.src = url;
      img.decoding = 'async';
      img.loading = 'eager';
      img.removeAttribute('hidden');
    } else {
      img.removeAttribute('src');
      img.setAttribute('hidden', '');
    }
    el.classList.toggle('is-empty', !url);
    el.style.backgroundImage = '';
    return;
  }
  el.style.backgroundImage = url ? `url("${url}")` : '';
  el.style.backgroundSize = 'cover';
  el.style.backgroundPosition = 'center';
  el.classList.toggle('is-empty', !url);
}

function clampChannel(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function applyFsAmbientFromCover(url) {
  const player = document.getElementById('fs-player');
  const bg = document.getElementById('fs-player-bg');
  if (!player || !bg) return;
  const fallback = () => {
    player.style.setProperty('--fs-ambient', '#4a3540');
    player.style.setProperty('--fs-ambient-deep', '#141014');
    player.style.backgroundColor = '#141014';
    if (url) {
      bg.style.setProperty('--fs-cover-url', `url("${url}")`);
      bg.classList.add('has-cover');
    } else {
      bg.style.removeProperty('--fs-cover-url');
      bg.classList.remove('has-cover');
    }
  };
  if (!url) {
    fallback();
    return;
  }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = 32;
      c.height = 32;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, 32, 32);
      const data = ctx.getImageData(0, 0, 32, 32).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < data.length; i += 4) {
        const rr = data[i], gg = data[i + 1], bb = data[i + 2], a = data[i + 3];
        if (a < 140) continue;
        const max = Math.max(rr, gg, bb);
        const min = Math.min(rr, gg, bb);
        if (max < 28 || min > 235) continue;
        // prefer saturated pixels for ambient mood
        const sat = max - min;
        const w = 1 + sat / 40;
        r += rr * w; g += gg * w; b += bb * w; n += w;
      }
      if (!n) { r = 70; g = 50; b = 60; n = 1; }
      r /= n; g /= n; b /= n;
      // Slightly lifted mid-tone + deep base for smooth Spotify-like wash
      const ambient = `rgb(${clampChannel(r * 0.62 + 18)},${clampChannel(g * 0.62 + 14)},${clampChannel(b * 0.62 + 14)})`;
      const deep = `rgb(${clampChannel(r * 0.18 + 6)},${clampChannel(g * 0.18 + 5)},${clampChannel(b * 0.18 + 5)})`;
      player.style.setProperty('--fs-ambient', ambient);
      player.style.setProperty('--fs-ambient-deep', deep);
      player.style.backgroundColor = deep;
      bg.style.setProperty('--fs-cover-url', `url("${url}")`);
      bg.classList.add('has-cover');
    } catch (_) {
      fallback();
    }
  };
  img.onerror = fallback;
  img.src = url;
}
window.applyFsAmbientFromCover = applyFsAmbientFromCover;

function fsScrollTo(sel) {
  const root = document.getElementById('fs-scroll');
  const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (!root || !el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
window.fsScrollTo = fsScrollTo;

let _fsSheetCloseTimer = null;
function closeFsSheets(immediate) {
  const overlay = document.getElementById('fs-sheet-overlay');
  const sheets = [
    document.getElementById('fs-more-sheet'),
    document.getElementById('fs-queue-sheet')
  ].filter(Boolean);
  clearTimeout(_fsSheetCloseTimer);
  overlay?.classList.remove('is-open');
  sheets.forEach(s => s.classList.remove('is-open'));
  const hide = () => {
    overlay?.classList.add('hidden');
    sheets.forEach(s => {
      if (!s.classList.contains('is-open')) s.classList.add('hidden');
    });
  };
  if (immediate) hide();
  else _fsSheetCloseTimer = setTimeout(hide, 480);
}
window.closeFsSheets = closeFsSheets;

function openFsSheet(id) {
  clearTimeout(_fsSheetCloseTimer);
  const overlay = document.getElementById('fs-sheet-overlay');
  const target = document.getElementById(id);
  ['fs-more-sheet', 'fs-queue-sheet'].forEach(sid => {
    const s = document.getElementById(sid);
    if (!s || s === target) return;
    s.classList.remove('is-open');
    s.classList.add('hidden');
  });
  if (overlay) {
    overlay.classList.remove('hidden');
    requestAnimationFrame(() => overlay.classList.add('is-open'));
  }
  if (target) {
    target.classList.remove('hidden');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => target.classList.add('is-open'));
    });
  }
}

function resetFsLayoutTransforms() {
  const root = document.getElementById('fs-player');
  if (!root) return;
  root.querySelectorAll(
    '.fs-cover, .fs-cover-img, .fs-hero, .fs-stage, .fs-dock, .fs-meta, .fs-meta-row, .fs-scroll, .fs-controls, .fs-tools'
  ).forEach((n) => {
    n.classList.remove('track-flow-next', 'track-flow-prev');
    n.style.transform = '';
    n.style.translate = '';
    n.style.willChange = '';
    n.style.left = '';
    n.style.right = '';
    n.style.marginLeft = '';
    n.style.marginRight = '';
  });
  const sc = document.getElementById('fs-scroll');
  if (sc) sc.scrollLeft = 0;
}
window.resetFsLayoutTransforms = resetFsLayoutTransforms;

/** Mobile-only: swipe mini-player left/right to change track */
function bindMiniPlayerSwipe() {
  if (window.__mrfMiniSwipeBound) return;
  window.__mrfMiniSwipeBound = true;
  let startX = 0;
  let startY = 0;
  let tracking = false;
  const isMobileUi = () => {
    try {
      if (typeof isMobilePlayerUi === 'function') return isMobilePlayerUi();
      if (document.documentElement.getAttribute('data-ui') === 'mobile') return true;
      return window.matchMedia('(max-width: 900px)').matches;
    } catch (_) {
      return false;
    }
  };
  const playerFromEvent = (e) => {
    const el = e.target && e.target.closest ? e.target.closest('#player') : null;
    return el && el.classList.contains('player') ? el : null;
  };

  document.addEventListener('touchstart', (e) => {
    if (!isMobileUi()) return;
    const player = playerFromEvent(e);
    if (!player) return;
    if (e.target.closest('button, a, input, .progress-track, .progress-bar')) return;
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    startX = t.clientX;
    startY = t.clientY;
    tracking = true;
  }, { passive: true, capture: true });

  document.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    if (!isMobileUi()) return;
    if (!playerFromEvent(e)) return;
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Math.abs(dx) < 56) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.15) return;
    if (dx < 0) {
      if (typeof nextTrack === 'function') nextTrack();
    } else if (typeof prevTrack === 'function') {
      prevTrack();
    }
  }, { passive: true, capture: true });

  document.addEventListener('touchcancel', () => { tracking = false; }, { passive: true, capture: true });
}
window.bindMiniPlayerSwipe = bindMiniPlayerSwipe;

/** Mobile: hoist mini-player onto <body> so #player-root never paints a grid slab */
function ensureMobilePlayerHost() {
  const player = document.getElementById('player');
  const root = document.getElementById('player-root');
  if (!player) return;
  const mobile = typeof isMobilePlayerUi === 'function'
    ? isMobilePlayerUi()
    : window.matchMedia('(max-width: 900px)').matches;
  if (mobile) {
    if (player.parentElement !== document.body) {
      document.body.appendChild(player);
    }
    // Toast must not stay inside #player-root (z-index 280) — mini-player is 281
    const note = document.getElementById('notification');
    if (note && note.parentElement !== document.body) {
      document.body.appendChild(note);
    }
    // Relocate FS leftovers out of the zero-box root
    if (typeof ensureFsPlayerDom === 'function') ensureFsPlayerDom();
    // Keep progress line animating after remount
    if (typeof bindPlayerUIControls === 'function') bindPlayerUIControls();
    if (typeof bindMiniPlayerSwipe === 'function') bindMiniPlayerSwipe();
    if (typeof tickProgress === 'function' && typeof audio !== 'undefined' && audio && !audio.paused) {
      try { tickProgress(); } catch (_) {}
    }
    if (typeof syncPlayingRows === 'function') syncPlayingRows();
    return;
  }
  // Desktop: keep classic dock + toast inside player-root
  if (root) {
    if (player.parentElement !== root) {
      const anchor = root.querySelector('#notification, .notification');
      if (anchor) root.insertBefore(player, anchor);
      else root.insertBefore(player, root.firstChild);
    }
    const note = document.getElementById('notification');
    if (note && note.parentElement !== root) root.appendChild(note);
  }
}
window.ensureMobilePlayerHost = ensureMobilePlayerHost;

function syncFsPlayer(track) {
  resetFsLayoutTransforms();
  const t = track || (typeof getCurrentTrack === 'function' ? getCurrentTrack() : null)
    || (typeof queue !== 'undefined' ? queue[queueIndex] : null);
  const panel = document.getElementById('fs-player');
  if (!panel) return;
  if (!t) {
    const title = document.getElementById('fs-title');
    const artist = document.getElementById('fs-artist');
    if (title) title.textContent = 'Ничего не играет';
    if (artist) artist.textContent = 'Выбери трек';
    return;
  }
  const cover = trackCoverUrl(t, 1000);
  const coverBlur = trackCoverUrl(t, 500);
  setCoverEl(document.getElementById('fs-cover'), cover);
  applyFsAmbientFromCover(coverBlur || cover);
  const title = document.getElementById('fs-title');
  const artist = document.getElementById('fs-artist');
  if (title) title.textContent = t.title || '—';
  if (artist) {
    artist.textContent = (typeof formatArtistsText === 'function'
      ? formatArtistsText(t)
      : (t.artist?.name || t.artist || '')) || '—';
  }
  if (typeof syncFsPlayerContext === 'function') syncFsPlayerContext();
  if (typeof updateFavBtn === 'function') updateFavBtn();
  if (typeof isPlaying !== 'undefined' && typeof setPlayIcon === 'function') setPlayIcon(!!isPlaying);
  if (typeof syncShuffleRepeatUi === 'function') syncShuffleRepeatUi();
  else {
    const shOn = typeof isShuffle !== 'undefined' && !!isShuffle;
    document.getElementById('fs-btn-shuffle')?.classList.toggle('active-btn', shOn);
    const rep = typeof isRepeat !== 'undefined' ? isRepeat : 'off';
    document.getElementById('fs-btn-repeat')?.classList.toggle('active-btn', rep !== 'off');
  }
  renderFsContentBlocks(t);
  renderFsNextTrack();
  loadFsSimilarTracks(t);
  if (!document.getElementById('fs-queue-sheet')?.classList.contains('hidden')) {
    renderFsQueueSheet();
  }
}
window.syncFsPlayer = syncFsPlayer;

function renderFsNextTrack() {
  const box = document.getElementById('fs-next-card');
  if (!box) return;
  if (typeof queue === 'undefined' || !queue.length) {
    box.innerHTML = '<div class="fs-empty">Очередь пуста</div>';
    return;
  }
  let nextIdx = queueIndex + 1;
  if (nextIdx >= queue.length) {
    if (typeof isRepeat !== 'undefined' && isRepeat === 'all') nextIdx = 0;
    else {
      box.innerHTML = '<div class="fs-empty">Это последний трек в очереди</div>';
      return;
    }
  }
  if (nextIdx === queueIndex && queue.length < 2) {
    box.innerHTML = '<div class="fs-empty">Нет следующего трека</div>';
    return;
  }
  const t = queue[nextIdx];
  if (!t) {
    box.innerHTML = '<div class="fs-empty">Нет следующего трека</div>';
    return;
  }
  const cover = trackCoverUrl(t);
  const artist = typeof formatArtistsText === 'function' ? formatArtistsText(t) : (t.artist?.name || '');
  box.innerHTML = `
    <button type="button" class="fs-next-row" onclick="playFsTrackFromList('queue',${nextIdx})">
      ${cover ? `<img class="fs-next-cover" src="${cover}" alt="">` : '<div class="fs-next-cover fs-next-ph"></div>'}
      <span class="fs-next-meta">
        <span class="fs-next-label">Далее</span>
        <span class="fs-next-title">${escHtml(t.title || '')}</span>
        <span class="fs-next-artist">${escHtml(artist || '')}</span>
      </span>
      <span class="fs-next-play" aria-hidden="true">▶</span>
    </button>`;
}
window.renderFsNextTrack = renderFsNextTrack;

let _fsSimilarGen = 0;
async function loadFsSimilarTracks(t) {
  const box = document.getElementById('fs-similar-card');
  if (!box || !t) return;
  const gen = ++_fsSimilarGen;
  const trackId = t.id;
  box.innerHTML = typeof loaderHTMLShared === 'function'
    ? loaderHTMLShared('Ищем похожие…')
    : '<div class="fs-empty">Ищем похожие…</div>';
  try {
    const deezerId = t.deezerId || String(t.id || '').replace(/^dz_/i, '');
    let raw = [];
    if (deezerId && typeof dzArr === 'function') {
      raw = await dzArr(`/radio/track/${encodeURIComponent(deezerId)}`);
      if (!raw.length) raw = await dzArr(`/track/${encodeURIComponent(deezerId)}/related`);
    }
    if (!raw.length && t.artist?.id && typeof dzArr === 'function') {
      raw = await dzArr(`/artist/${encodeURIComponent(t.artist.id)}/top?limit=15`);
    }
    if (!raw.length && typeof dzArr === 'function') {
      const q = encodeURIComponent(
        [t.artist?.name || (typeof t.artist === 'string' ? t.artist : ''), t.title]
          .filter(Boolean).join(' ') || 'music'
      );
      raw = await dzArr(`/search/track?q=${q}&limit=15`);
    }
    if (gen !== _fsSimilarGen) return;
    const still = (typeof getCurrentTrack === 'function' ? getCurrentTrack() : null) || queue?.[queueIndex];
    if (still && trackId != null && still.id != null && String(still.id) !== String(trackId)) return;
    const curId = String(t.id || '');
    const curDz = String(deezerId || '');
    const list = (typeof normDZ === 'function' ? raw.map(normDZ) : raw)
      .filter(x => x && String(x.id) !== curId && String(x.deezerId || x.id || '').replace(/^dz_/i, '') !== curDz)
      .slice(0, 8);
    if (typeof _src !== 'undefined') _src.fs_similar = list;
    if (!list.length) {
      box.innerHTML = '<div class="fs-empty">Похожие треки не найдены</div>';
      return;
    }
    box.innerHTML = list.map((x, i) => {
      const cover = x.album?.cover_medium || x.album?.cover || x.cover || '';
      const artist = typeof formatArtistsText === 'function' ? formatArtistsText(x) : (x.artist?.name || '');
      return `<button type="button" class="fs-sim-row" onclick="playFsTrackFromList('fs_similar',${i})">
        ${cover ? `<img src="${cover}" alt="">` : '<div class="fs-sim-ph"></div>'}
        <span class="fs-sim-meta">
          <span class="fs-sim-t">${escHtml(x.title || '')}</span>
          <span class="fs-sim-a">${escHtml(artist || '')}</span>
        </span>
      </button>`;
    }).join('');
  } catch (_) {
    if (gen !== _fsSimilarGen) return;
    box.innerHTML = '<div class="fs-empty">Не удалось загрузить</div>';
  }
}
window.loadFsSimilarTracks = loadFsSimilarTracks;

function scrollFsPlayerToTop(smooth) {
  const sc = document.getElementById('fs-scroll');
  if (!sc) return;
  sc.scrollTo({ top: 0, behavior: smooth === false ? 'auto' : 'smooth' });
}
window.scrollFsPlayerToTop = scrollFsPlayerToTop;

function playFsTrackFromList(src, index) {
  if (src === 'queue') {
    if (typeof playFromQueue === 'function') playFromQueue(index);
  } else if (typeof playFromSrc === 'function') {
    playFromSrc(src, index);
  }
  if (typeof isMobilePlayerUi === 'function' ? isMobilePlayerUi() : true) {
    if (typeof openFsPlayer === 'function') openFsPlayer();
  }
  // Wait a tick so syncFsPlayer/content update, then jump to top of player
  requestAnimationFrame(() => {
    scrollFsPlayerToTop(true);
    setTimeout(() => scrollFsPlayerToTop(true), 80);
  });
}
window.playFsTrackFromList = playFsTrackFromList;

function renderFsContentBlocks(t) {
  const artsBox = document.getElementById('fs-artists');
  if (artsBox) {
    const arts = typeof trackArtists === 'function' ? trackArtists(t) : [];
    const chip = (id, name, pic) => {
      const label = name || '—';
      const ava = pic
        ? `<img class="fs-artist-chip-ava" src="${pic}" alt="">`
        : `<span class="fs-artist-chip-ph">${escHtml(label[0] || '?')}</span>`;
      const idAttr = id ? String(id).replace(/[^0-9a-zA-Z_-]/g, '') : '';
      const jsName = String(label).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return `<button type="button" class="fs-artist-chip" onclick="closeFsPlayer();openArtist(${idAttr ? `'${idAttr}'` : 'null'},'${jsName}')">${ava}<span>${escHtml(label)}</span></button>`;
    };
    if (!arts.length) {
      const name = t?.artist?.name || (typeof t?.artist === 'string' ? t.artist : '') || '—';
      artsBox.innerHTML = chip(t?.artist?.id, name, t?.artist?.picture_medium || t?.artist?.picture || '');
    } else {
      artsBox.innerHTML = arts.map(a => chip(a.id, a.name, a.picture_medium || a.picture || '')).join('');
    }
  }

  const credits = document.getElementById('fs-credits-card');
  if (credits) {
    const arts = typeof trackArtists === 'function' ? trackArtists(t) : [];
    const album = t.album?.title || '';
    const rows = [];
    if (arts.length) {
      arts.forEach((a, i) => {
        rows.push(`<div class="fs-credit-row"><div><div class="fs-credit-name">${escHtml(a.name || '')}</div><div class="fs-credit-role">${i === 0 ? 'Основной исполнитель' : 'Исполнитель'}</div></div></div>`);
      });
    } else {
      const name = t?.artist?.name || t?.artist || '—';
      rows.push(`<div class="fs-credit-row"><div><div class="fs-credit-name">${escHtml(String(name))}</div><div class="fs-credit-role">Основной исполнитель</div></div></div>`);
    }
    if (album) {
      rows.push(`<div class="fs-credit-row"><div><div class="fs-credit-name">${escHtml(album)}</div><div class="fs-credit-role">Альбом</div></div></div>`);
    }
    credits.innerHTML = rows.join('') || '<div class="fs-empty">Нет сведений</div>';
  }

  const lyrics = document.getElementById('fs-lyrics-card');
  if (lyrics) {
    const lines = typeof fakeLyricsFor === 'function' ? fakeLyricsFor(t) : [t.title || ''];
    lyrics.innerHTML = lines.map(line => line
      ? `<p class="fs-lyric-line">${escHtml(line)}</p>`
      : '<div class="fs-lyric-gap"></div>').join('');
  }

  loadFsAboutCard(t);
}

let _fsAboutGen = 0;
async function loadFsAboutCard(t) {
  const box = document.getElementById('fs-about-card');
  if (!box) return;
  const gen = ++_fsAboutGen;
  box.innerHTML = '<div class="fs-empty">Загружаем…</div>';
  try {
    const aid = typeof resolveArtistId === 'function' ? await resolveArtistId(t) : (t?.artist?.id || null);
    if (gen !== _fsAboutGen) return;
    let art = null;
    if (aid && typeof dzObj === 'function') {
      try { art = await dzObj('/artist/' + aid); } catch (_) {}
    }
    if (gen !== _fsAboutGen) return;
    const name = art?.name || t?.artist?.name || t?.artist || 'Исполнитель';
    const pic = art?.picture_xl || art?.picture_medium || t?.artist?.picture_medium || '';
    const fans = art?.nb_fan ? (+art.nb_fan).toLocaleString('ru') : '';
    box.innerHTML = `
      <div class="fs-about">
        <div class="fs-about-photo" style="${pic ? `background-image:url('${pic}')` : ''}">${!pic ? escHtml(String(name)[0] || '?') : ''}</div>
        <div class="fs-about-meta">
          <div class="fs-about-label">Исполнитель</div>
          <div class="fs-about-name">${escHtml(String(name))}</div>
          ${fans ? `<div class="fs-about-fans">Слушателей: ${fans}</div>` : ''}
          <p class="fs-about-bio">Информация об исполнителе и популярных релизах доступна в карточке артиста. Прокрутите плеер, чтобы увидеть текст и сведения о треке.</p>
        </div>
      </div>`;
  } catch (_) {
    if (gen !== _fsAboutGen) return;
    box.innerHTML = '<div class="fs-empty">Не удалось загрузить</div>';
  }
}

let _fsPlayerCloseTimer = null;
const FS_PLAYER_ANIM_MS = 520;

function openFsPlayer() {
  ensureFsPlayerChrome();
  const panel = document.getElementById('fs-player');
  if (!panel) {
    // Mobile-only chrome; never open desktop right panel as a fallback here
    if (typeof isMobilePlayerUi === 'function' && !isMobilePlayerUi()) return;
    return;
  }
  clearTimeout(_fsPlayerCloseTimer);
  closeFsSheets(true);
  resetFsLayoutTransforms();
  syncFsPlayer();
  // Start off-screen, then animate up like a finger swipe
  panel.classList.remove('hidden', 'is-open');
  panel.style.transform = '';
  panel.setAttribute('aria-hidden', 'false');
  document.body.classList.add('fs-player-open');
  scrollFsPlayerToTop(false);
  // Force layout so transform transition always runs
  panel.style.willChange = 'transform';
  void panel.offsetHeight;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      panel.classList.add('is-open');
      // Drop will-change after settle — prevents blurry rasterized text
      clearTimeout(panel._fsWillClear);
      panel._fsWillClear = setTimeout(() => {
        if (panel.classList.contains('is-open')) panel.style.willChange = 'auto';
      }, FS_PLAYER_ANIM_MS + 40);
    });
  });
}
window.openFsPlayer = openFsPlayer;

function closeFsPlayer() {
  closeFsSheets(true);
  const panel = document.getElementById('fs-player');
  if (panel) {
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    clearTimeout(_fsPlayerCloseTimer);
    _fsPlayerCloseTimer = setTimeout(() => {
      if (!panel.classList.contains('is-open')) panel.classList.add('hidden');
      document.body.classList.remove('fs-player-open');
    }, FS_PLAYER_ANIM_MS);
  } else {
    document.body.classList.remove('fs-player-open');
  }
}
window.closeFsPlayer = closeFsPlayer;

function openFsMoreSheet() {
  const t = typeof getCurrentTrack === 'function' ? getCurrentTrack() : queue?.[queueIndex];
  if (!t) return;
  const head = document.getElementById('fs-more-head');
  const list = document.getElementById('fs-more-list');
  const cover = trackCoverUrl(t);
  const artist = (typeof formatArtistsText === 'function' ? formatArtistsText(t) : (t.artist?.name || '')) || '';
  const album = t.album?.title || '';
  if (head) {
    head.innerHTML = `
      <div class="fs-more-cover" style="${cover ? `background-image:url('${cover}')` : ''}"></div>
      <div class="fs-more-meta">
        <div class="fs-more-title">${escHtml(t.title || '')}</div>
        <div class="fs-more-sub">${escHtml([artist, album].filter(Boolean).join(' • '))}</div>
      </div>`;
  }
  const liked = typeof Store !== 'undefined' && Store.isFav(t);
  if (list) {
    const shareSvg = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true"><path d="M12 3v11" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M8.2 6.8L12 3l3.8 3.8" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 13v5.2A1.8 1.8 0 0 0 6.8 20h10.4A1.8 1.8 0 0 0 19 18.2V13" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`;
    const lyricsSvg = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h10" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`;
    const heartSvg = `<svg viewBox="0 0 24 24" width="22" height="22" fill="${liked ? 'currentColor' : 'none'}" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke="currentColor" stroke-width="1.8"/></svg>`;
    const addSvg = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`;
    const queueSvg = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M17 15.2v5.1l4.2-2.55L17 15.2z" fill="currentColor"/></svg>`;
    const aboutSvg = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.2" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="8.2" r="1.15" fill="currentColor"/><path d="M12 11.2v5.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    list.innerHTML = `
      <button type="button" class="fs-more-item" onclick="closeFsSheets();if(typeof shareTrack==='function')shareTrack(queue[queueIndex])">
        <span class="fs-more-ico">${shareSvg}</span><span>Поделиться</span>
      </button>
      <button type="button" class="fs-more-item" onclick="closeFsSheets();fsScrollTo('#fs-block-lyrics')">
        <span class="fs-more-ico">${lyricsSvg}</span><span>Текст</span>
      </button>
      <button type="button" class="fs-more-item" onclick="closeFsSheets();toggleFavPlayer()">
        <span class="fs-more-ico">${heartSvg}</span><span>${liked ? 'Убрать из любимых' : 'Добавить в любимые'}</span>
      </button>
      <button type="button" class="fs-more-item" onclick="closeFsSheets();if(typeof showAddToPlaylist==='function')showAddToPlaylist(queue[queueIndex])">
        <span class="fs-more-ico">${addSvg}</span><span>Добавить в плейлист</span>
      </button>
      <button type="button" class="fs-more-item" onclick="closeFsSheets();openFsQueueSheet()">
        <span class="fs-more-ico">${queueSvg}</span><span>Перейти в очередь</span>
      </button>
      <button type="button" class="fs-more-item" onclick="closeFsSheets();fsScrollTo('#fs-block-about')">
        <span class="fs-more-ico">${aboutSvg}</span><span>Об исполнителе</span>
      </button>`;
  }
  openFsSheet('fs-more-sheet');
}
window.openFsMoreSheet = openFsMoreSheet;

function syncFsPlayerContext() {
  const sub = document.getElementById('fs-player-context-sub');
  if (!sub) return;
  let label = '';
  try {
    label = String(
      (typeof currentSrcLabel !== 'undefined' && currentSrcLabel) ||
      window.currentSrcLabel ||
      ''
    ).trim();
    if (!label && typeof resolvePlaybackSourceLabel === 'function') {
      const key = (typeof currentSrcKey !== 'undefined' && currentSrcKey) || window.currentSrcKey || '';
      label = resolvePlaybackSourceLabel(key);
    }
    if (!label) {
      const st = typeof Store !== 'undefined' ? Store.getPlayerState() : null;
      label = String(st?.srcLabel || '').trim() ||
        (typeof resolvePlaybackSourceLabel === 'function' ? resolvePlaybackSourceLabel(st?.srcKey) : '');
    }
  } catch (_) {}
  if (label) {
    sub.textContent = label;
    sub.hidden = false;
  } else {
    sub.textContent = '';
    sub.hidden = true;
  }
}
window.syncFsPlayerContext = syncFsPlayerContext;

function syncFsQueueChrome() {
  if (typeof syncShuffleRepeatUi === 'function') syncShuffleRepeatUi();
  else {
    const shOn = typeof isShuffle !== 'undefined' ? !!isShuffle : !!window.isShuffle;
    document.getElementById('fs-q-shuffle')?.classList.toggle('is-on', shOn);
    const rm = typeof isRepeat !== 'undefined' ? isRepeat : (window.isRepeat || 'off');
    document.getElementById('fs-q-repeat')?.classList.toggle('is-on', rm && rm !== 'off');
  }
  const sub = document.getElementById('fs-queue-sub');
  if (sub) {
    let label = '';
    try {
      label = String(window.currentSrcLabel || currentSrcLabel || '').trim();
      if (!label && typeof resolvePlaybackSourceLabel === 'function') {
        label = resolvePlaybackSourceLabel(window.currentSrcKey || currentSrcKey || '');
      }
    } catch (_) {}
    sub.textContent = label ? `Играет · ${label}` : 'Сейчас играет';
  }
}
window.syncFsQueueChrome = syncFsQueueChrome;

function renderFsQueueSheet() {
  const list = document.getElementById('fs-queue-list');
  if (!list) return;
  syncFsQueueChrome();
  if (typeof queue === 'undefined' || !queue.length) {
    list.innerHTML = '<div class="fs-empty">Очередь пуста</div>';
    return;
  }
  list.innerHTML = queue.map((t, i) => {
    const cur = i === queueIndex;
    const cover = trackCoverUrl(t);
    const artist = typeof formatArtistsText === 'function' ? formatArtistsText(t) : (t.artist?.name || '');
    return `<button type="button" class="fs-q-item${cur ? ' is-current' : ''}" onclick="playFromQueue(${i})">
      ${cover ? `<img src="${cover}" alt="">` : '<div class="fs-q-ph"></div>'}
      <span class="fs-q-info">
        <span class="fs-q-t">${escHtml(t.title || '')}</span>
        <span class="fs-q-a">${escHtml(artist || '')}</span>
      </span>
      <span class="fs-q-num">${cur ? '▶' : (i + 1)}</span>
    </button>`;
  }).join('');
}
window.renderFsQueueSheet = renderFsQueueSheet;

function openFsQueueSheet() {
  renderFsQueueSheet();
  openFsSheet('fs-queue-sheet');
}
window.openFsQueueSheet = openFsQueueSheet;

function ensureFsPlayerDom() {
  // Mount FS chrome on <body> (not #player-root) so:
  // 1) player-root stays a zero-box and never paints a slab
  // 2) fixed FS layout is always viewport-relative (no broken containing block)
  const host = document.body;
  if (!host) return;
  const existing = document.getElementById('fs-player');
  // Upgrade old FS markup / move out of player-root if needed
  const mustRebuild = existing && (
    !document.getElementById('fs-scroll') ||
    !document.getElementById('fs-more-sheet') ||
    !document.querySelector('.fs-stage') ||
    !document.querySelector('.fs-tool-ico') ||
    !document.getElementById('fs-block-similar') ||
    !document.querySelector('.fs-cover-img') ||
    !document.getElementById('fs-player-context-sub') ||
    document.getElementById('fs-q-repeat') ||
    existing.parentElement !== host
  );
  if (mustRebuild) {
    existing?.remove();
    document.getElementById('fs-sheet-overlay')?.remove();
    document.getElementById('fs-more-sheet')?.remove();
    document.getElementById('fs-queue-sheet')?.remove();
  }
  // Relocate leftover sheets still inside player-root
  ['fs-player', 'fs-sheet-overlay', 'fs-more-sheet', 'fs-queue-sheet'].forEach((id) => {
    const el = document.getElementById(id);
    if (el && el.parentElement !== host) host.appendChild(el);
  });
  if (document.getElementById('fs-player')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = typeof fsPlayerMarkup === 'function' ? fsPlayerMarkup() : '';
  [...wrap.children].forEach(node => host.appendChild(node));
}

function ensureLikeBesidePlay() {
  const like = document.getElementById('player-like-btn');
  if (!like) return;
  const play = document.getElementById('btn-play');
  const controls = document.querySelector('#player .player-controls');
  const titleRow = document.querySelector('#player .player-title-row');
  const mobile = typeof isMobilePlayerUi === 'function'
    ? isMobilePlayerUi()
    : window.matchMedia('(max-width: 900px)').matches;

  if (mobile) {
    // Mobile: heart next to play/pause
    if (!play || !controls) return;
    if (like.parentElement !== controls || like.nextElementSibling !== play) {
      controls.insertBefore(like, play);
    }
    return;
  }

  // PC: heart next to track title — never leave it in transport controls
  if (titleRow && like.parentElement !== titleRow) {
    titleRow.appendChild(like);
  }
}

function bindMiniPlayerOpen() {
  const mini = document.getElementById('player');
  if (!mini || mini.dataset.openBound === '1') return;
  mini.dataset.openBound = '1';
  mini.addEventListener('click', (e) => {
    if (e.target.closest('button, a, input, .progress-bar, .volume-bar, .player-right')) return;
    // PC: right panel opens only via its dock button — never by clicking the player bar
    if (typeof isMobilePlayerUi === 'function' ? !isMobilePlayerUi() : !window.matchMedia('(max-width: 900px)').matches) {
      return;
    }
    openNowPlaying();
  });

  // Mobile: swipe up on mini-player → same sheet open as tap
  let startY = 0;
  let startX = 0;
  let tracking = false;
  mini.addEventListener('touchstart', (e) => {
    if (!(typeof isMobilePlayerUi === 'function' ? isMobilePlayerUi() : true)) return;
    if (e.target.closest('button, a, input')) return;
    const t = e.touches[0];
    startY = t.clientY;
    startX = t.clientX;
    tracking = true;
  }, { passive: true });
  mini.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dy = startY - t.clientY;
    const dx = Math.abs(t.clientX - startX);
    if (dy > 48 && dy > dx * 1.2) openNowPlaying();
  }, { passive: true });
}

/** Mobile: drag down on top/hero to dismiss — feels like a real swipe sheet */
function bindFsSwipeClose() {
  const panel = document.getElementById('fs-player');
  if (!panel || panel.dataset.swipeBound === '1') return;
  panel.dataset.swipeBound = '1';
  let startY = 0;
  let dragging = false;
  let active = false;

  const onStart = (e) => {
    if (!(typeof isMobilePlayerUi === 'function' ? isMobilePlayerUi() : true)) return;
    if (!panel.classList.contains('is-open')) return;
    if (e.target.closest('button, a, input, .fs-progress, .fs-controls, .fs-tools')) return;
    const sc = document.getElementById('fs-scroll');
    if (sc && sc.scrollTop > 4) return;
    const zone = e.target.closest('.fs-player-top, .fs-hero, .fs-cover');
    if (!zone) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    startY = y;
    dragging = false;
    active = true;
  };
  const onMove = (e) => {
    if (!active) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    const dy = y - startY;
    if (!dragging) {
      if (dy < 8) return;
      dragging = true;
      panel.style.transition = 'none';
    }
    if (dy <= 0) {
      panel.style.transform = 'translate3d(0,0,0)';
      return;
    }
    if (e.cancelable) e.preventDefault();
    panel.style.transform = `translate3d(0,${Math.min(dy, window.innerHeight)}px,0)`;
  };
  const onEnd = (e) => {
    if (!active) return;
    active = false;
    const y = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
    const dy = y - startY;
    panel.style.transition = '';
    panel.style.transform = '';
    if (dragging && dy > 110) closeFsPlayer();
    dragging = false;
  };

  panel.addEventListener('touchstart', onStart, { passive: true });
  panel.addEventListener('touchmove', onMove, { passive: false });
  panel.addEventListener('touchend', onEnd, { passive: true });
  panel.addEventListener('touchcancel', onEnd, { passive: true });
}

/** Mobile: swipe down to close queue / more sheets */
function bindFsSheetSwipeClose() {
  ['fs-more-sheet', 'fs-queue-sheet'].forEach((id) => {
    const sheet = document.getElementById(id);
    if (!sheet || sheet.dataset.swipeBound === '1') return;
    sheet.dataset.swipeBound = '1';
    let startY = 0;
    let dragging = false;
    let active = false;

    sheet.addEventListener('touchstart', (e) => {
      if (!(typeof isMobilePlayerUi === 'function' ? isMobilePlayerUi() : true)) return;
      if (sheet.classList.contains('hidden') || !sheet.classList.contains('is-open')) return;
      if (e.target.closest('button, a, input, .fs-sheet-list, .fs-queue-list')) {
        // Allow swipe from handle / head only when list is scrolled? Prefer head+handle
      }
      const zone = e.target.closest('.fs-sheet-handle, .fs-sheet-head, .fs-queue-head, .fs-sheet-handle');
      const atTop = !e.target.closest('.fs-sheet-list, .fs-queue-list')
        || (e.target.closest('.fs-sheet-list, .fs-queue-list')?.scrollTop || 0) <= 0;
      if (!zone && !atTop) return;
      if (e.target.closest('.fs-sheet-list, .fs-queue-list') && (e.target.closest('.fs-sheet-list, .fs-queue-list').scrollTop > 2)) return;
      startY = e.touches[0].clientY;
      dragging = false;
      active = true;
    }, { passive: true });

    sheet.addEventListener('touchmove', (e) => {
      if (!active) return;
      const dy = e.touches[0].clientY - startY;
      if (!dragging) {
        if (dy < 10) return;
        dragging = true;
        sheet.style.transition = 'none';
      }
      if (dy <= 0) {
        sheet.style.transform = 'translate3d(0,0,0)';
        return;
      }
      if (e.cancelable) e.preventDefault();
      sheet.style.transform = `translate3d(0,${Math.min(dy, window.innerHeight)}px,0)`;
    }, { passive: false });

    sheet.addEventListener('touchend', (e) => {
      if (!active) return;
      active = false;
      const dy = e.changedTouches[0].clientY - startY;
      sheet.style.transition = '';
      sheet.style.transform = '';
      if (dragging && dy > 100) closeFsSheets();
      dragging = false;
    }, { passive: true });
  });
}

function ensureFsPlayerChrome() {
  ensureMobilePlayerHost();
  ensureFsPlayerDom();
  resetFsLayoutTransforms();
  ensureLikeBesidePlay();
  bindMiniPlayerOpen();
  bindFsSwipeClose();
  bindFsSheetSwipeClose();
  const track = document.getElementById('fs-progress-track');
  if (track && track.dataset.bound !== '1') {
    track.dataset.bound = '1';
    const seek = (e) => {
      if (!audio?.duration) return;
      const r = track.getBoundingClientRect();
      const x = ('clientX' in e ? e.clientX : e.touches?.[0]?.clientX) || 0;
      const pct = Math.max(0, Math.min(1, (x - r.left) / Math.max(1, r.width)));
      audio.currentTime = audio.duration * pct;
      const fill = document.getElementById('fs-progress-fill');
      if (fill) fill.style.width = (pct * 100) + '%';
    };
    track.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      seek(e);
      const move = (ev) => seek(ev);
      const up = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
  }
}
window.ensureFsPlayerChrome = ensureFsPlayerChrome;


/* Override openNowPlaying / toggleQueue — mobile uses Spotify-style sheet */
function openNowPlaying() {
  // PC: never open right panel from player bar — only mobile FS player
  if (isMobilePlayerUi()) openFsPlayer();
}
function closeNowPlaying() {
  if (isMobilePlayerUi()) closeFsPlayer();
  else closeRightPanel();
}
function toggleQueue() {
  if (isMobilePlayerUi()) {
    if (!document.getElementById('fs-player') || document.getElementById('fs-player').classList.contains('hidden')) {
      openFsPlayer();
    }
    openFsQueueSheet();
    return;
  }
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
  ensureFsPlayerChrome();
  const playBtn = document.getElementById('btn-play');
  if (playBtn) playBtn.setAttribute('onclick', 'event.stopPropagation();togglePlay()');
  const likeBtn = document.getElementById('player-like-btn');
  if (likeBtn) likeBtn.setAttribute('onclick', 'event.stopPropagation();toggleFavPlayer()');
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
