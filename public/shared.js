/* =====================================================
   MRF — shared.js
   Общие компоненты: sidebar, player, right panel
   Инжектируются на каждую страницу
   ===================================================== */

/* ══════════════════════════════════
   ОПРЕДЕЛЕНИЕ ТЕКУЩЕЙ СТРАНИЦЫ
══════════════════════════════════ */
function getPageId(href) {
  try {
    const u = new URL(href || location.href, location.href);
    const p = (u.pathname.split('/').pop() || 'index').replace(/\.html$/i, '');
    return (!p || p === '') ? 'index' : p;
  } catch {
    return 'index';
  }
}
const PAGE = getPageId();
window.getPageId = getPageId;

/* ══════════════════════════════════
   ИНЖЕКТ SIDEBAR
══════════════════════════════════ */
function updateSidebarActive(pageId) {
  const id = pageId || getPageId();
  document.querySelectorAll('.sidebar .nav-item[data-page]').forEach(a => {
    a.classList.toggle('active', a.getAttribute('data-page') === id);
  });
}
window.updateSidebarActive = updateSidebarActive;

function injectSidebar() {
  const root = document.getElementById('sidebar-root');
  if (!root) return;

  // Soft-nav: keep existing sidebar DOM (audio continuity), just refresh active state
  if (root.querySelector('.sidebar')) {
    updateSidebarActive(getPageId());
    renderSidebarPlaylists();
    if (typeof updateFavBadge === 'function') updateFavBadge();
    return;
  }

  const links = [
    { href: 'index.html',   page: 'index',   label: 'Главная',      icon: '<path d="M3 12L12 3L21 12V20H15V14H9V20H3V12Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' },
    { href: 'search.html',  page: 'search',  label: 'Поиск',        icon: '<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="M20 20L16.5 16.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' },
    { href: 'charts.html',  page: 'charts',  label: 'Чарты',        icon: '<polyline points="22,12 18,12 15,21 9,3 6,12 2,12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' },
    { href: 'library.html', page: 'library', label: 'Моя библиотека', icon: '<path d="M9 18V6l12-3v12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="1.8"/><circle cx="18" cy="15" r="3" stroke="currentColor" stroke-width="1.8"/>' },
  ];

  const libLinks = [
    { href: 'liked.html',     page: 'liked',     label: 'Любимые треки', icon: '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke="currentColor" stroke-width="1.8"/>' },
    { href: 'playlists.html', page: 'playlists', label: 'Плейлисты',     icon: '<path d="M3 6h18M3 12h12M3 18h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' },
    { href: 'albums.html',    page: 'albums',    label: 'Альбомы',       icon: '<rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/>' },
    { href: 'artists.html',   page: 'artists',   label: 'Исполнители',   icon: '<circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' },
  ];

  const favCount = Store.getFavs().length;
  const isCollapsed = localStorage.getItem('mrf_sidebar_collapsed') === '1';
  if (isCollapsed) document.body.classList.add('sidebar-collapsed');

  root.innerHTML = `
    <aside class="sidebar" id="sidebar">
      <div class="logo" id="sidebar-logo" onclick="(window.mrfGo||function(u){location.href=u})('index.html')" style="cursor:pointer">
        <img src="img/logo.png" alt="MRF" class="logo-img" />
        <span class="logo-brand">Make Russia Free</span>
        <button class="sidebar-collapse-btn" onclick="event.stopPropagation();toggleSidebar()" title="Свернуть">
          <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.8"/>
            <path d="M9 3v18" stroke="currentColor" stroke-width="1.8"/>
            <path d="M12 9l3 3-3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
      <div class="logo-collapsed hidden" id="logo-collapsed">
        <button class="sidebar-expand-btn" onclick="toggleSidebar()" title="Развернуть">
          <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.8"/>
            <path d="M9 3v18" stroke="currentColor" stroke-width="1.8"/>
            <path d="M12 9l3 3-3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      <nav class="nav">
        ${links.map(l => `
          <a href="${l.href}" class="nav-item${getPageId() === l.page ? ' active' : ''}" data-page="${l.page}">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none">${l.icon}</svg>
            <span class="nav-label">${l.label}</span>
            ${l.page === 'library' ? `<span class="nav-badge" id="fav-count">${favCount}</span>` : ''}
          </a>`).join('')}

        <div class="nav-divider"></div>
        <div class="nav-section-title">Моя музыка</div>

        ${libLinks.map(l => `
          <a href="${l.href}" class="nav-item${getPageId() === l.page ? ' active' : ''}" data-page="${l.page}" style="font-size:12.5px;padding:8px 18px">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" width="16" height="16">${l.icon}</svg>
            <span class="nav-label">${l.label}</span>
          </a>`).join('')}

        <div class="nav-divider"></div>
        <div class="nav-section-title">Плейлисты</div>
        <div id="sidebar-playlists"></div>
      </nav>
    </aside>`;

  renderSidebarPlaylists();
}

function renderSidebarPlaylists() {
  const box = document.getElementById('sidebar-playlists');
  if (!box) return;
  const pls = Store.getPlaylists().slice(0, 6);
  if (!pls.length) {
    box.innerHTML = `<div class="nav-placeholder"><span>Плейлисты появятся здесь</span></div>`;
    return;
  }
  box.innerHTML = pls.map(pl => `
    <a href="playlist.html?id=${pl.id}" class="nav-item" style="font-size:12px;padding:6px 18px">
      <svg class="nav-icon" viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M9 18V6l12-3v12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="1.6"/><circle cx="18" cy="15" r="3" stroke="currentColor" stroke-width="1.6"/></svg>
      <span class="nav-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(pl.name)}</span>
    </a>`).join('');
}

window.renderSidebarPlaylists = renderSidebarPlaylists;

function toggleSidebar() {
  const collapsed = document.body.classList.toggle('sidebar-collapsed');
  localStorage.setItem('mrf_sidebar_collapsed', collapsed ? '1' : '0');
  const DEFAULT_W = 240, COLLAPSED_W = 60;
  document.body.style.setProperty('--sidebar-w', collapsed ? COLLAPSED_W + 'px' : DEFAULT_W + 'px');
}

/* ══════════════════════════════════
   ИНЖЕКТ TOPBAR
══════════════════════════════════ */
function injectTopbar() {
  const root = document.getElementById('topbar-root');
  if (!root) return;

  const profile = Store.getProfile();
  const initials = (profile.name || 'П')[0].toUpperCase();

  root.innerHTML = `
    <header class="topbar">
      <div class="topbar-nav">
        <button class="topbar-btn" id="btn-nav-back" onclick="history.back()" title="Назад" style="opacity:0.4">
          <svg viewBox="0 0 24 24" fill="none"><path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
        <button class="topbar-btn" id="btn-nav-fwd" onclick="history.forward()" title="Вперёд" style="opacity:0.4">
          <svg viewBox="0 0 24 24" fill="none"><path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </div>

      <div class="topbar-search" id="topbar-search-box">
        <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="M20 20L16.5 16.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        <input type="text" id="main-search-input" placeholder="Артист, трек, альбом…" autocomplete="off"
          onkeydown="if(event.key==='Enter'&&this.value.trim()){event.preventDefault();(typeof goSearchPage==='function'?goSearchPage:function(q){location.href=(typeof mrfUrl==='function'?mrfUrl('search',{q:q}):('search?q='+encodeURIComponent(q)));})(this.value.trim())}"
          onclick="event.stopPropagation()"/>
      </div>

      <div class="topbar-actions">
        <button class="btn-premium" onclick="location.href='profile.html'">MRF+</button>
        <div class="topbar-avatar" id="topbar-avatar" onclick="toggleUserMenu(event)" title="Профиль">${initials}</div>
        <div class="user-dropdown hidden" id="user-dropdown">
          <a href="profile.html" class="user-menu-item">
            <svg viewBox="0 0 24 24" fill="none" width="15" height="15"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            Мой профиль
          </a>
          <a href="profile.html#settings" class="user-menu-item">
            <svg viewBox="0 0 24 24" fill="none" width="15" height="15"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" stroke-width="1.8"/></svg>
            Настройки
          </a>
          <div class="user-menu-divider"></div>
          <div class="user-menu-item" onclick="Store.reset();location.reload()">
            <svg viewBox="0 0 24 24" fill="none" width="15" height="15"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Выйти
          </div>
        </div>
      </div>
    </header>`;
}

function toggleUserMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('user-dropdown');
  if (!menu) return;
  menu.classList.toggle('hidden');
  if (!menu.classList.contains('hidden')) {
    setTimeout(() => document.addEventListener('click', () => menu.classList.add('hidden'), { once: true }), 0);
  }
}

/* ══════════════════════════════════
   ИНЖЕКТ PLAYER
══════════════════════════════════ */
function injectPlayer() {
  const root = document.getElementById('player-root');
  if (!root) return;
  // Never rebuild player DOM while soft-navigating — that would glitch audio UX
  if (root.querySelector('.player')) return;

  root.innerHTML = `
    <footer class="player" id="player">
      <div class="player-track">
        <div class="player-cover" id="player-cover" onclick="openNowPlaying()" title="Подробнее" style="cursor:pointer"></div>
        <div class="player-track-info">
          <div class="player-title" id="player-title">Ничего не играет</div>
          <div class="player-artist" id="player-artist">Выбери трек</div>
        </div>
        <button class="player-like" id="player-like-btn" onclick="toggleFavPlayer()" title="В избранное">
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke="currentColor" stroke-width="1.8"/></svg>
        </button>
      </div>

      <div class="player-controls">
        <button class="ctrl-btn" id="btn-shuffle" onclick="toggleShuffle()" title="Перемешать">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M15 13.5L18 16.5V14H20V20L14 20V18H16.5L13.5 15L15 13.5ZM9 10.5L10.5 9L5.5 4L4 5.5L9 10.5Z" fill-rule="evenodd" clip-rule="evenodd" fill="currentColor"/>
            <path d="M20 4H14V6H16.5L4 18.5L5.5 20L18 7.5V10H20L20 4Z" fill="currentColor"/>
          </svg>
        </button>
        <button class="ctrl-btn" onclick="prevTrack()" title="Предыдущий">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
        </button>
        <button class="ctrl-btn ctrl-play" id="btn-play" onclick="togglePlay()" title="Играть / Пауза">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none">
            <path d="M22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5203 21.9939 21.9939 17.5203 22 12ZM11.996 19.992C16.4127 19.9942 19.9956 16.4167 20 12C19.9956 7.58329 16.4127 3.98979 11.996 3.992C7.57929 3.99421 4 7.57528 4 11.992C4 16.4087 7.57929 19.9898 11.996 19.992Z" fill-rule="evenodd" clip-rule="evenodd" fill="currentColor"/>
            <path d="M10 16V8L16 12L10 16Z" fill="currentColor"/>
          </svg>
        </button>
        <button class="ctrl-btn" onclick="nextTrack()" title="Следующий">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
        </button>
        <button class="ctrl-btn" id="btn-repeat" onclick="toggleRepeat()" title="Повтор">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M7.5 22L2.5 17L7.5 12L9 13.5L6.50003 16H18V14L20 12V18H6.49997L9 20.5L7.5 22Z" fill="currentColor"/>
            <path d="M15 3.49999L16.5 2L21.5 7L16.5 12L15 10.5L17.5 8H6V10L4 12V5.99999H17.5L15 3.49999Z" fill="currentColor"/>
          </svg>
        </button>
        <div class="progress-bar">
          <span class="time-current" id="time-current">0:00</span>
          <div class="progress-track" id="progress-track">
            <div class="progress-fill" id="progress-fill"><div class="progress-thumb" id="progress-thumb"></div></div>
          </div>
          <span class="time-total" id="time-total">0:00</span>
        </div>
      </div>

      <div class="player-right">
        <button class="ctrl-btn" onclick="toggleQueue()" title="Очередь">
          <svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M3 12h12M3 18h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
        <div class="volume-control">
          <button class="ctrl-btn" onclick="toggleMute()" id="btn-vol">
            <svg viewBox="0 0 24 24" fill="none"><path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
          <div class="volume-track" id="volume-track">
            <div class="volume-fill" id="volume-fill" style="width:70%"><div class="volume-thumb"></div></div>
          </div>
        </div>
      </div>
    </footer>

    <!-- QUEUE PANEL -->
    <div class="queue-panel hidden" id="queue-panel">
      <div class="queue-header"><span>Очередь</span><button onclick="toggleQueue()">✕</button></div>
      <div id="queue-list" class="queue-list"></div>
    </div>

    <!-- NOW PLAYING PANEL -->
    <div class="now-playing-panel hidden" id="now-playing-panel">
      <div class="np-header">
        <span>Сейчас играет</span>
        <button onclick="closeNowPlaying()">✕</button>
      </div>
      <div class="np-body">
        <div class="np-cover-wrap"><div class="np-cover" id="np-cover"></div></div>
        <div class="np-meta">
          <div class="np-title" id="np-title">—</div>
          <div class="np-artist" id="np-artist-name">—</div>
        </div>
        <div class="np-actions">
          <button class="np-artist-btn" id="np-artist-btn">
            <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            Перейти к исполнителю
          </button>
        </div>
        <div class="np-artist-cover-wrap" id="np-artist-cover-wrap">
          <div class="np-artist-cover" id="np-artist-cover"></div>
          <div class="np-artist-label">Исполнитель</div>
          <div class="np-artist-name-big" id="np-artist-name-big">—</div>
        </div>
        <div class="np-lyrics-wrap" id="np-lyrics-wrap">
          <div class="np-lyrics-header"><span>Текст</span></div>
          <div class="np-lyrics" id="np-lyrics"><div class="np-lyrics-empty">Текст не найден</div></div>
        </div>
      </div>
    </div>

    <!-- NOTIFICATION -->
    <div class="notification hidden" id="notification"></div>

    <!-- MODALS -->
    <div class="modal-overlay hidden" id="modal-overlay" onclick="closeModal()"></div>
    <div class="modal hidden" id="modal-create-playlist">
      <div class="modal-header"><span>Создать плейлист</span><button onclick="closeModal()">✕</button></div>
      <div class="modal-body">
        <input type="text" class="modal-input" id="playlist-name-input" placeholder="Название плейлиста" maxlength="60"/>
        <input type="text" class="modal-input" id="playlist-desc-input" placeholder="Описание (необязательно)" maxlength="120"/>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal()">Отмена</button>
        <button class="btn-primary" onclick="confirmCreatePlaylist()" style="padding:10px 20px;font-size:13px">Создать</button>
      </div>
    </div>
    <div class="modal hidden" id="modal-add-to-playlist">
      <div class="modal-header"><span>Добавить в плейлист</span><button onclick="closeModal()">✕</button></div>
      <div class="modal-body" id="modal-playlist-list"></div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="showCreatePlaylist()">+ Новый плейлист</button>
        <button class="btn-primary" onclick="closeModal()" style="padding:10px 20px;font-size:13px">Готово</button>
      </div>
    </div>
  `;
}

/* ══════════════════════════════════
   ИНИЦИАЛИЗАЦИЯ SHARED
══════════════════════════════════ */
function initShared() {
  console.log('[MRF] initShared started');
  
  // восстанавливаем ширину sidebar
  const isCollapsed = localStorage.getItem('mrf_sidebar_collapsed') === '1';
  document.body.style.setProperty('--sidebar-w', isCollapsed ? '60px' : '240px');
  if (isCollapsed) document.body.classList.add('sidebar-collapsed');

  const hadPlayer = !!document.querySelector('#player-root .player');

  injectSidebar();
  injectTopbar();
  injectPlayer();

  // bind progress/volume after player DOM exists
  if (typeof bindPlayerUIControls === 'function') bindPlayerUIControls();
  // topbar search is injected above — rebind if available
  if (typeof bindSearch === 'function') bindSearch();

  // Restore audio ONLY on cold start — soft-nav must not touch the playing Audio
  if (!hadPlayer && !window.__mrfPlayerRestored && typeof restorePlayerState === 'function') {
    window.__mrfPlayerRestored = true;
    restorePlayerState();
  } else if (hadPlayer && typeof updateFavBtn === 'function') {
    updateFavBtn();
  }
  
  console.log('[MRF] initShared completed');
}

/* ══════════════════════════════════
   HELPERS
══════════════════════════════════ */
const el = id => document.getElementById(id);
const qs = sel => document.querySelector(sel);

/** Build page URL without .html so serve cleanUrls won't strip ?query on redirect */
function mrfUrl(page, params) {
  const base = String(page || '').replace(/\.html$/i, '');
  if (!params) return base + '.html';
  const qs = new URLSearchParams();
  Object.keys(params).forEach(k => {
    const v = params[k];
    if (v != null && v !== '') qs.set(k, v);
  });
  const q = qs.toString();
  // Prefer extensionless path when params exist (works with cleanUrls on/off)
  return q ? `${base}?${q}` : `${base}.html`;
}
window.mrfUrl = mrfUrl;

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtDur(sec) {
  if (!sec || !isFinite(sec)) return '0:00';
  return `${Math.floor(sec/60)}:${String(Math.floor(sec%60)).padStart(2,'0')}`;
}
function noteSVGShared() {
  return `<svg viewBox="0 0 24 24" fill="none" width="22" height="22" style="color:var(--text-3)"><path d="M9 18V6l12-3v12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="1.8"/><circle cx="18" cy="15" r="3" stroke="currentColor" stroke-width="1.8"/></svg>`;
}
function loaderHTMLShared(msg) {
  return `<div class="loading-placeholder"><div class="spinner"></div><span>${msg}</span></div>`;
}

function showNotif(msg, duration = 2500) {
  const n = document.getElementById('notification');
  if (!n) return;
  n.textContent = msg;
  n.classList.remove('hidden');
  clearTimeout(showNotif._t);
  showNotif._t = setTimeout(() => n.classList.add('hidden'), duration);
}


/* ══════════════════════════════════
   MODALS & PLAYLIST CREATION
══════════════════════════════════ */
let _pendingTrackForPlaylist = null;

function showCreatePlaylist() {
  const modal = document.getElementById('modal-create-playlist');
  const overlay = document.getElementById('modal-overlay');
  const nameInput = document.getElementById('playlist-name-input');
  const descInput = document.getElementById('playlist-desc-input');
  
  if (nameInput) nameInput.value = '';
  if (descInput) descInput.value = '';
  
  if (modal) modal.classList.remove('hidden');
  if (overlay) overlay.classList.remove('hidden');
  if (nameInput) setTimeout(() => nameInput.focus(), 50);
}

function confirmCreatePlaylist() {
  const name = document.getElementById('playlist-name-input')?.value.trim();
  if (!name) { showNotif('Введи название'); return; }
  
  const desc = document.getElementById('playlist-desc-input')?.value.trim() || '';
  const pl = Store.createPlaylist(name, desc);
  
  if (_pendingTrackForPlaylist) {
    Store.addTrackToPlaylist(pl.id, _pendingTrackForPlaylist);
    _pendingTrackForPlaylist = null;
  }
  
  closeModal();
  renderSidebarPlaylists();
  showNotif('Плейлист создан');
  
  // обновляем страницу плейлистов если она открыта
  if (PAGE === 'playlists' && typeof renderPlaylistsPage === 'function') renderPlaylistsPage();
  if (PAGE === 'library' && typeof renderLib === 'function') renderLib(_libTab || 'all');
}

function showAddToPlaylist(track) {
  _pendingTrackForPlaylist = track;
  const modal = document.getElementById('modal-add-to-playlist');
  const overlay = document.getElementById('modal-overlay');
  const list = document.getElementById('modal-playlist-list');
  
  const pls = Store.getPlaylists();
  
  if (!pls.length) {
    if (list) list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-3);font-size:13px">
      <p>Нет плейлистов</p>
      <button class="btn-primary" onclick="closeModal();showCreatePlaylist()" style="margin-top:12px;padding:8px 16px;font-size:12px">Создать первый</button>
    </div>`;
  } else {
    if (list) list.innerHTML = pls.map(pl => {
      const inPlaylist = pl.tracks?.some(t => t.id === track.id);
      return `<div class="modal-playlist-item${inPlaylist?' added':''}" onclick="toggleTrackInPlaylist('${pl.id}','${track.id}',this)">
        ${pl.cover ? `<img src="${pl.cover}" class="modal-pl-cover" alt="">` : `<div class="modal-pl-cover">${noteSVGShared()}</div>`}
        <div class="modal-pl-info">
          <div class="modal-pl-name">${escHtml(pl.name)}</div>
          <div class="modal-pl-count">${pl.trackCount} треков</div>
        </div>
        <div class="modal-pl-check">
          <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
            <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>`;
    }).join('') + `<button class="btn-secondary" onclick="closeModal();showCreatePlaylist()" style="margin-top:12px;width:100%;padding:10px;font-size:12px">+ Новый плейлист</button>`;
  }
  
  if (modal) modal.classList.remove('hidden');
  if (overlay) overlay.classList.remove('hidden');
}

function toggleTrackInPlaylist(playlistId, trackId, el) {
  const pl = Store.getPlaylist(playlistId);
  if (!pl) return;
  
  const inPlaylist = pl.tracks?.some(t => t.id === trackId);
  
  if (inPlaylist) {
    Store.removeTrackFromPlaylist(playlistId, trackId);
    el.classList.remove('added');
    showNotif('Убрано из плейлиста');
  } else {
    if (_pendingTrackForPlaylist) {
      Store.addTrackToPlaylist(playlistId, _pendingTrackForPlaylist);
      el.classList.add('added');
      showNotif('Добавлено в плейлист');
    }
  }
  
  renderSidebarPlaylists();
}

function closeModal() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.add('hidden');
  _pendingTrackForPlaylist = null;
}

/* ══════════════════════════════════
   QUEUE PANEL
══════════════════════════════════ */
function toggleQueue() {
  const panel = document.getElementById('queue-panel');
  if (!panel) return;
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) renderQueuePanel();
}

function renderQueuePanel() {
  const list = document.getElementById('queue-list');
  if (!list || typeof queue === 'undefined') return;
  
  if (!queue.length) {
    list.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--text-3);font-size:13px">Очередь пуста</div>`;
    return;
  }
  
  list.innerHTML = queue.map((t, i) => {
    const current = i === (typeof queueIndex !== 'undefined' ? queueIndex : -1);
    return `<div class="queue-item${current?' current':''}" onclick="typeof playFromQueue === 'function' && playFromQueue(${i})">
      ${t.album?.cover_medium ? `<img class="queue-cover" src="${t.album.cover_medium}" alt="">` : `<div class="queue-cover-placeholder">${noteSVGShared()}</div>`}
      <div class="queue-info">
        <div class="queue-title">${escHtml(t.title||'')}</div>
        <div class="queue-artist">${escHtml(t.artist?.name||'')}</div>
      </div>
      <div class="queue-duration">${fmtDur(t.duration)}</div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════
   NOW PLAYING PANEL
══════════════════════════════════ */
function openNowPlaying() {
  const panel = document.getElementById('now-playing-panel');
  if (!panel) return;
  panel.classList.remove('hidden');
  updateNowPlayingPanel();
}

function closeNowPlaying() {
  const panel = document.getElementById('now-playing-panel');
  if (panel) panel.classList.add('hidden');
}

function updateNowPlayingPanel() {
  if (typeof queue === 'undefined' || typeof queueIndex === 'undefined') return;
  const t = queue[queueIndex];
  if (!t) return;
  
  const cover = t.album?.cover_xl || t.album?.cover_medium || '';
  const title = t.title || '';
  const artist = t.artist?.name || '';
  
  const npCover = document.getElementById('np-cover');
  const npTitle = document.getElementById('np-title');
  const npArtist = document.getElementById('np-artist-name');
  const npArtistCover = document.getElementById('np-artist-cover');
  const npArtistNameBig = document.getElementById('np-artist-name-big');
  
  if (npCover) npCover.style.backgroundImage = cover ? `url(${cover})` : 'none';
  if (npTitle) npTitle.textContent = title;
  if (npArtist) npArtist.textContent = artist;
  if (npArtistCover) npArtistCover.style.backgroundImage = t.artist?.picture_xl ? `url(${t.artist.picture_xl})` : 'none';
  if (npArtistNameBig) npArtistNameBig.textContent = artist;
}

/* ══════════════════════════════════
   PLAYER HELPERS
══════════════════════════════════ */
function toggleFavPlayer() {
  if (typeof queue === 'undefined' || typeof queueIndex === 'undefined') return;
  const t = queue[queueIndex];
  if (!t) return;
  
  const artist = t.artist?.name || '';
  const added = Store.toggleFav({
    id: t.id,
    title: t.title,
    artistName: artist,
    cover: t.album?.cover_medium || '',
    duration: t.duration || 0,
    preview: t.preview || null
  });
  
  const btn = document.getElementById('player-like-btn');
  if (btn) {
    btn.classList.toggle('liked', added);
    const path = btn.querySelector('path');
    if (path) path.setAttribute('fill', added ? 'currentColor' : 'none');
  }
  
  updateFavBadge();
  showNotif(added ? 'Добавлено в избранное' : 'Убрано из избранного');
}

/* ══════════════════════════════════
   END OF SHARED.JS
   Функции плеера (togglePlay, prevTrack, etc.)
   определяются в app.js
══════════════════════════════════ */

