/* =====================================================
   NOVALIBER — shared.js
   Общие компоненты: sidebar, player, right panel
   Инжектируются на каждую страницу
   ===================================================== */

/* ══════════════════════════════════
   LAYOUT MODE — phone/tablet vs desktop PC
   Tablets (any resolution) ALWAYS use mobile UI.
══════════════════════════════════ */
function isDesktopLayout() {
  // Simple rule: large screens = PC, smaller = phone/tablet shell
  return window.matchMedia('(min-width: 901px)').matches;
}
window.isDesktopLayout = isDesktopLayout;

function isTabletDevice() {
  return !isDesktopLayout();
}
window.isTabletDevice = isTabletDevice;

function isTabletViewport() {
  return !isDesktopLayout();
}
window.isTabletViewport = isTabletViewport;

function isMobileLayout() {
  return !isDesktopLayout();
}
window.isMobileLayout = isMobileLayout;

function applyUiLayoutMode() {
  const desktop = isDesktopLayout();
  const mode = desktop ? 'desktop' : 'mobile';
  const root = document.documentElement;
  if (root.getAttribute('data-ui') !== mode) {
    root.setAttribute('data-ui', mode);
  }
  root.classList.toggle('ui-mobile', !desktop);
  root.classList.toggle('ui-desktop', desktop);
  if (document.body) {
    document.body.classList.toggle('is-mobile-ui', !desktop);
    document.body.classList.toggle('is-desktop-ui', desktop);
    if (!desktop) {
      document.body.style.setProperty('--sidebar-w', '0px');
      document.body.classList.remove('sidebar-collapsed');
    } else {
      // Restore PC sidebar width (undo leftover mobile inline 0)
      const collapsed = localStorage.getItem('mrf_sidebar_collapsed') === '1';
      document.body.style.setProperty('--sidebar-w', collapsed ? '60px' : '240px');
      document.body.classList.toggle('sidebar-collapsed', collapsed);
      // Never keep FS player open on desktop
      document.body.classList.remove('fs-player-open');
      document.getElementById('fs-player')?.classList.add('hidden');
      document.getElementById('fs-player')?.classList.remove('is-open');
      document.getElementById('fs-sheet-overlay')?.classList.add('hidden');
      document.getElementById('fs-more-sheet')?.classList.add('hidden');
      document.getElementById('fs-queue-sheet')?.classList.add('hidden');
    }
  }
  return mode;
}
window.applyUiLayoutMode = applyUiLayoutMode;

// Run ASAP to avoid desktop FOUC on tablets
try { applyUiLayoutMode(); } catch (_) {}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    applyUiLayoutMode();
  });
} else {
  applyUiLayoutMode();
}
window.addEventListener('resize', () => {
  clearTimeout(window.__mrfUiLayoutT);
  window.__mrfUiLayoutT = setTimeout(() => {
    const prev = document.documentElement.getAttribute('data-ui');
    const next = applyUiLayoutMode();
    if (prev !== next) {
      if (typeof ensureFsPlayerChrome === 'function') {
        try { ensureFsPlayerChrome(); } catch (_) {}
      }
      try { syncMrfPremFab(); } catch (_) {}
    }
  }, 120);
});
window.addEventListener('orientationchange', () => {
  setTimeout(() => applyUiLayoutMode(), 50);
});

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

/**
 * NOVALIBER logos — wordmark format (no circle / equalizer).
 * - wordmark: full «NOVALIBER» (sidebar, boot, premium, footer)
 * - mark: compact «N» path (collapsed, fab, plan icon) — no webfont dependency
 */
function novaliberLogoWordmarkInner(opts = {}) {
  const wordClass = opts.wordClass ? ` class="${opts.wordClass}"` : '';
  return `<text${wordClass} x="500" y="118" text-anchor="middle" font-family="Nunito, Arial, Helvetica, sans-serif" font-weight="800" font-size="128" letter-spacing="8" textLength="920" lengthAdjust="spacingAndGlyphs" fill="currentColor">NOVALIBER</text>`;
}

function novaliberLogoMarkInner(opts = {}) {
  const wordClass = opts.wordClass ? ` class="${opts.wordClass}"` : '';
  const n = '\u004E'; /* Latin capital N only */
  return `<text${wordClass} x="50" y="68" text-anchor="middle" font-family="Nunito, Arial, Helvetica, sans-serif" font-weight="800" font-size="64" fill="currentColor">${n}</text>`;
}

function novaliberLogoSVG(height = 28) {
  const h = Number(height) || 28;
  const w = Math.round(h * (1000 / 160));
  return `<svg class="logo-img logo-img--word" viewBox="0 0 1000 160" width="${w}" height="${h}" role="img" aria-label="NOVALIBER" fill="currentColor" xmlns="http://www.w3.org/2000/svg">${novaliberLogoWordmarkInner()}</svg>`;
}

function novaliberMarkSVG(size = 36) {
  const s = Number(size) || 36;
  return `<svg class="logo-img logo-img--mark" viewBox="0 0 100 100" width="${s}" height="${s}" role="img" aria-label="NOVALIBER" fill="currentColor" xmlns="http://www.w3.org/2000/svg">${novaliberLogoMarkInner()}</svg>`;
}

function mrfLogoMarkInner(opts) { return novaliberLogoMarkInner(opts); }
function mrfLogoSVG(size) { return novaliberLogoSVG(size); }
window.novaliberLogoSVG = novaliberLogoSVG;
window.novaliberMarkSVG = novaliberMarkSVG;
window.novaliberLogoMarkInner = novaliberLogoMarkInner;
window.novaliberLogoWordmarkInner = novaliberLogoWordmarkInner;
window.mrfLogoSVG = mrfLogoSVG;
window.mrfLogoMarkInner = mrfLogoMarkInner;

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
    ensureSidebarPlaylistsBox();
    renderSidebarPlaylists();
    if (typeof updateFavBadge === 'function') updateFavBadge();
    const markHost = root.querySelector('.sidebar-expand-mark');
    if (markHost && typeof novaliberMarkSVG === 'function') {
      markHost.innerHTML = novaliberMarkSVG(28);
    }
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
    { href: 'albums.html',    page: 'albums',    label: 'Альбомы и релизы', icon: '<rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/>' },
    { href: 'artists.html',   page: 'artists',   label: 'Исполнители',   icon: '<circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' },
  ];

  const favCount = Store.getFavs().length;
  const isCollapsed = localStorage.getItem('mrf_sidebar_collapsed') === '1';
  if (isCollapsed) document.body.classList.add('sidebar-collapsed');

  root.innerHTML = `
    <aside class="sidebar" id="sidebar">
      <div class="logo" id="sidebar-logo" onclick="(window.mrfGo||function(u){location.href=u})('index.html')" style="cursor:pointer">
        ${novaliberLogoSVG(26)}
        <button class="sidebar-collapse-btn" onclick="event.stopPropagation();toggleSidebar()" title="Свернуть">
          <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.8"/>
            <path d="M9 3v18" stroke="currentColor" stroke-width="1.8"/>
            <path d="M12 9l3 3-3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
      <div class="logo-collapsed hidden" id="logo-collapsed">
        <button class="sidebar-expand-btn" onclick="toggleSidebar()" title="Развернуть" aria-label="Развернуть меню">
          <span class="sidebar-expand-mark" aria-hidden="true">${novaliberMarkSVG(28)}</span>
          <span class="sidebar-expand-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
              <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.8"/>
              <path d="M9 3v18" stroke="currentColor" stroke-width="1.8"/>
              <path d="M12 15l3-3-3-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
        </button>
      </div>

      <nav class="nav">
        <div class="nav-group nav-group-main">
        ${links.map(l => `
          <a href="${l.href}" class="nav-item${getPageId() === l.page ? ' active' : ''}" data-page="${l.page}">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none">${l.icon}</svg>
            <span class="nav-label">${l.label}</span>
            ${l.page === 'library' ? `<span class="nav-badge" id="fav-count">${favCount}</span>` : ''}
          </a>`).join('')}
        </div>

        <div class="nav-divider" role="separator"></div>
        <div class="nav-section-title">Моя музыка</div>

        <div class="nav-group nav-group-lib">
        ${libLinks.map(l => `
          <a href="${l.href}" class="nav-item${getPageId() === l.page ? ' active' : ''}" data-page="${l.page}" style="font-size:12.5px;padding:8px 18px">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" width="16" height="16">${l.icon}</svg>
            <span class="nav-label">${l.label}</span>
          </a>`).join('')}
        </div>

        <div class="nav-divider" role="separator"></div>
        <div class="nav-section-title">Плейлисты</div>
        <div class="nav-group nav-group-pl" id="sidebar-playlists"></div>
      </nav>
    </aside>`;

  renderSidebarPlaylists();
}

function playlistCoverOf(pl) {
  if (pl?.cover) return pl.cover;
  const first = pl?.tracks?.[0];
  return first?.cover || first?.album?.cover_medium || '';
}

function ensureSidebarPlaylistsBox() {
  let box = document.getElementById('sidebar-playlists');
  if (box) return box;
  const nav = document.querySelector('#sidebar-root .nav, .sidebar .nav');
  if (!nav) return null;
  let title = [...nav.querySelectorAll('.nav-section-title')].find(el => /плейлист/i.test(el.textContent || ''));
  if (!title) {
    title = document.createElement('div');
    title.className = 'nav-section-title';
    title.textContent = 'Плейлисты';
    nav.appendChild(title);
  }
  box = document.createElement('div');
  box.id = 'sidebar-playlists';
  box.className = 'nav-group nav-group-pl';
  title.insertAdjacentElement('afterend', box);
  return box;
}

function renderSidebarPlaylists() {
  const box = ensureSidebarPlaylistsBox();
  if (!box) return;
  let pls = [];
  try { pls = Store.getPlaylists() || []; } catch (_) { pls = []; }
  if (!pls.length) {
    box.innerHTML = `<div class="nav-placeholder"><span>Плейлисты появятся здесь</span></div>`;
    return;
  }
  const page = typeof getPageId === 'function' ? getPageId() : '';
  const currentId = page === 'playlist'
    ? new URLSearchParams(location.search).get('id')
    : null;

  box.innerHTML = pls.map(pl => {
    const href = typeof mrfUrl === 'function'
      ? mrfUrl('playlist', { id: pl.id })
      : `playlist.html?id=${encodeURIComponent(pl.id)}`;
    const cover = playlistCoverOf(pl);
    const active = currentId && String(currentId) === String(pl.id) ? ' active' : '';
    const safeCover = String(cover || '').replace(/"/g, '&quot;');
    const avatar = cover
      ? `<img class="nav-icon nav-pl-avatar" src="${safeCover}" alt="" loading="lazy">`
      : `<span class="nav-icon nav-pl-avatar nav-pl-avatar-ph">${escHtml((pl.name || '?')[0])}</span>`;
    return `
    <a href="${href}" class="nav-item nav-pl-item${active}" title="${escHtml(pl.name)}" data-playlist-id="${escHtml(String(pl.id))}">
      ${avatar}
      <span class="nav-label nav-pl-label">${escHtml(pl.name)}</span>
    </a>`;
  }).join('');
}

window.renderSidebarPlaylists = renderSidebarPlaylists;
window.ensureSidebarPlaylistsBox = ensureSidebarPlaylistsBox;
window.playlistCoverOf = playlistCoverOf;

/** Escape a string for use inside a single-quoted JS literal in HTML onclick */
function jsStr(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n');
}
window.jsStr = jsStr;

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
  const avatarInner = profile.avatar
    ? `<img src="${profile.avatar}" alt="" decoding="async">`
    : initials;

  root.innerHTML = `
    <header class="topbar">
      <button type="button" class="topbar-avatar" id="topbar-avatar" onclick="goProfile()" title="Профиль" aria-label="Профиль">${avatarInner}</button>

      <div class="topbar-nav">
        <button class="topbar-btn is-disabled" id="btn-nav-back" onclick="(typeof mrfHistoryBack==='function'?mrfHistoryBack:history.back)()" title="Назад" aria-disabled="true">
          <svg viewBox="0 0 24 24" fill="none"><path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
        <button class="topbar-btn is-disabled" id="btn-nav-fwd" onclick="(typeof mrfHistoryForward==='function'?mrfHistoryForward:history.forward)()" title="Вперёд" aria-disabled="true">
          <svg viewBox="0 0 24 24" fill="none"><path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </div>

      <div class="topbar-search" id="topbar-search-box">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="M20 20L16.5 16.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        <input type="text" id="main-search-input" placeholder="Артист, трек, альбом…" autocomplete="off"/>
        <button type="button" class="search-clear hidden" id="topbar-search-clear" title="Очистить" aria-label="Очистить">
          <svg viewBox="0 0 24 24" fill="none" width="12" height="12" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
        </button>
        <div class="search-flyout hidden" id="search-flyout" role="listbox"></div>
      </div>
    </header>`;

  injectMobileBackFab();
  updateSearchModeUI();
  bindTopbarSearchFlyout();
  updateTopbarAvatar();

  // Restore back/forward active state after topbar rebuild (soft-nav)
  if (typeof updateChromeNavButtons === 'function') updateChromeNavButtons();
  else if (typeof updateNavBtns === 'function') updateNavBtns();
  try { syncMrfPremFab(); } catch (_) {}
}

/** Root tabs in bottom nav — no back button here */
function isMobileNavRootPage(pageId) {
  const p = pageId || (typeof getPageId === 'function' ? getPageId() : '');
  return p === 'index' || p === 'home' || p === '' || p === 'search' || p === 'library';
}
window.isMobileNavRootPage = isMobileNavRootPage;

/** Deep pages (artist / playlist / album / …) need a Spotify-style back control */
function isMobileDeepPage(pageId) {
  return !isMobileNavRootPage(pageId);
}
window.isMobileDeepPage = isMobileDeepPage;

function hasSearchDrillIn() {
  const page = typeof getPageId === 'function' ? getPageId() : '';
  if (!isSearchPage() && page !== 'search') return false;
  // Back only when full results are open (not while typing in the flyout)
  const results = document.getElementById('search-results-section');
  if (!results) return false;
  const disp = results.style.display || '';
  if (disp === 'none') return false;
  try {
    return getComputedStyle(results).display !== 'none';
  } catch (_) {
    return true;
  }
}
window.hasSearchDrillIn = hasSearchDrillIn;

function shouldShowMobileBack() {
  if (isMobileDeepPage()) return true;
  // Search root tab: back only when user drilled into results
  if (isSearchPage() || (typeof getPageId === 'function' && getPageId() === 'search')) {
    return hasSearchDrillIn();
  }
  return false;
}
window.shouldShowMobileBack = shouldShowMobileBack;

function mobileGoBack() {
  if (isSearchPage() || (typeof getPageId === 'function' && getPageId() === 'search')) {
    if (hasSearchDrillIn()) {
      if (typeof resetSearchHome === 'function') resetSearchHome({ replaceUrl: true });
      else if (typeof clearSearchInput === 'function') clearSearchInput();
      updateMobileBackFab();
      return;
    }
  }
  /* Profile settings: back = close edit (same as old «Закрыть») */
  if (typeof getPageId === 'function' && getPageId() === 'profile'
    && typeof isProfileEditMode === 'function' && isProfileEditMode()
    && typeof setProfileEditMode === 'function') {
    setProfileEditMode(false);
    updateMobileBackFab();
    return;
  }
  const hist = window.__mrfSoftHist;
  if (hist && hist.index > 0 && typeof mrfHistoryBack === 'function') {
    mrfHistoryBack();
    return;
  }
  if (window.history.length > 1) {
    history.back();
    return;
  }
  const page = typeof getPageId === 'function' ? getPageId() : '';
  let url = 'index.html';
  if (['playlist', 'liked', 'playlists', 'albums', 'artists', 'album', 'profile'].includes(page)) {
    url = 'library.html';
  } else if (page === 'premium') {
    url = 'profile.html';
  } else if (['artist', 'charts'].includes(page)) {
    url = 'search.html';
  }
  if (typeof mrfGo === 'function') mrfGo(url);
  else location.href = url;
}
window.mobileGoBack = mobileGoBack;

function injectMobileBackFab() {
  const main = document.querySelector('main.main-content');
  if (!main) return;
  let fab = document.getElementById('mobile-back-fab');
  if (!fab) {
    fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'mobile-back-fab';
    fab.className = 'mobile-back-fab';
    fab.title = 'Назад';
    fab.setAttribute('aria-label', 'Назад');
    fab.innerHTML = `<svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true"><path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    fab.addEventListener('click', () => mobileGoBack());
  }
  // Overlay on main — sits over hero content like Spotify (not a padded row)
  if (fab.parentElement !== main) main.appendChild(fab);
  updateMobileBackFab();
}
window.injectMobileBackFab = injectMobileBackFab;

function updateMobileBackFab() {
  const fab = document.getElementById('mobile-back-fab');
  const show = shouldShowMobileBack();
  const deep = isMobileDeepPage();
  document.body.classList.toggle('is-deep-page', deep);
  document.body.classList.toggle('can-go-back', show);
  document.body.classList.toggle('has-mobile-back', show);
  if (!fab) return;
  fab.classList.toggle('is-on', show);
  fab.hidden = !show;
  fab.setAttribute('aria-hidden', show ? 'false' : 'true');
}
window.updateMobileBackFab = updateMobileBackFab;

function updateTopbarAvatar() {
  const logged = !!(window.MrfAuth && typeof MrfAuth.isLoggedIn === 'function' && MrfAuth.isLoggedIn());
  const local = (typeof Store !== 'undefined' && Store.getProfile) ? Store.getProfile() : {};
  const cloud = (window.MrfAuth && MrfAuth.profile) ? MrfAuth.profile : null;
  const profile = {
    ...local,
    ...(cloud || {}),
    avatar: (cloud && cloud.avatar) || local.avatar || null,
    name: (cloud && cloud.name) || local.name || '',
    username: (cloud && cloud.username) || local.username || ''
  };
  const avatar = logged ? (profile.avatar || null) : null;
  const letter = logged
    ? String(profile.name || profile.username || 'П').replace(/^@+/, '')[0].toUpperCase()
    : 'П';
  const title = logged ? (profile.name || 'Профиль') : 'Профиль';
  const fill = (el) => {
    if (!el) return;
    el.title = title;
    if (avatar) {
      const src = typeof escHtml === 'function' ? escHtml(avatar) : String(avatar);
      el.innerHTML = `<img src="${src}" alt="" decoding="async">`;
    } else {
      el.innerHTML = '';
      el.textContent = letter || 'П';
    }
  };
  fill(document.getElementById('topbar-avatar'));
  fill(document.getElementById('search-mobile-avatar'));
  fill(document.getElementById('library-mobile-avatar'));
  fill(document.getElementById('liked-mobile-avatar'));
  document.querySelectorAll('.mobile-page-avatar').forEach(el => {
    if (el.id === 'search-mobile-avatar' || el.id === 'library-mobile-avatar' || el.id === 'liked-mobile-avatar') return;
    fill(el);
  });
}
window.updateTopbarAvatar = updateTopbarAvatar;

function isSearchPage() {
  const path = (location.pathname || '').replace(/\/+$/, '');
  return /(?:^|\/)search(?:\.html)?$/i.test(path);
}

function updateHomeTopbarScroll() {
  if (!document.body.classList.contains('is-home-page')) {
    document.body.classList.remove('is-home-scrolled');
    return;
  }
  const feed = document.getElementById('feed') || document.querySelector('main .feed');
  const hero = document.getElementById('home-feature');
  const top = feed ? feed.scrollTop : 0;
  const limit = hero ? Math.max(72, Math.round(hero.offsetHeight * 0.42)) : 96;
  document.body.classList.toggle('is-home-scrolled', top > limit);
}
window.updateHomeTopbarScroll = updateHomeTopbarScroll;

function bindHomeTopbarScroll() {
  const feed = document.getElementById('feed') || document.querySelector('main .feed');
  if (!feed) {
    document.body.classList.remove('is-home-scrolled');
    return;
  }
  if (feed.dataset.homeScrollBound !== '1') {
    feed.dataset.homeScrollBound = '1';
    let saveTimer = 0;
    feed.addEventListener('scroll', () => {
      updateHomeTopbarScroll();
      // Keep home scroll fresh so back-from-playlist lands correctly
      if (document.body.classList.contains('is-home-page')) {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          if (typeof mrfSavePageScroll === 'function') mrfSavePageScroll();
          else {
            window.__mrfHomeFeedScroll = {
              feed: feed.scrollTop || 0,
              main: 0,
              win: window.scrollY || 0
            };
          }
        }, 80);
      }
    }, { passive: true });
  }
  updateHomeTopbarScroll();
}
window.bindHomeTopbarScroll = bindHomeTopbarScroll;

function updateSearchModeUI() {
  const page = typeof getPageId === 'function' ? getPageId() : '';
  const home = page === 'index' || page === 'home' || page === '';
  const onSearch = page === 'search' || isSearchPage();
  document.body.classList.toggle('is-search-page', onSearch);
  document.body.classList.toggle('is-library-page', page === 'library');
  document.body.classList.toggle('is-liked-page', page === 'liked');
  document.body.classList.toggle('is-playlist-page', page === 'playlist');
  document.body.classList.toggle('is-home-page', home);
  document.body.classList.toggle('is-profile-page', page === 'profile');
  document.body.classList.toggle('is-premium-page', page === 'premium');
  document.body.classList.toggle('is-deep-page', isMobileDeepPage(page));
  if (!home) document.body.classList.remove('is-home-scrolled');
  if (!onSearch) document.body.classList.remove('is-search-results');
  if (onSearch) closeSearchFlyout();
  if (typeof injectMobileBackFab === 'function') injectMobileBackFab();
  else if (typeof updateMobileBackFab === 'function') updateMobileBackFab();
  if (typeof bindHomeTopbarScroll === 'function') bindHomeTopbarScroll();
}

function goProfile() {
  const url = typeof mrfUrl === 'function' ? mrfUrl('profile') : 'profile.html';
  // Always land on public profile, never stay in settings/edit
  if (typeof getPageId === 'function' && getPageId() === 'profile') {
    if (typeof showPublicProfileView === 'function') {
      showPublicProfileView();
      return;
    }
    if (typeof setProfileEditMode === 'function') setProfileEditMode(false);
  }
  if (typeof mrfGo === 'function') mrfGo(url);
  else location.href = url;
}

function mrfIsLoggedIn() {
  return !!(window.MrfAuth && typeof MrfAuth.isLoggedIn === 'function' && MrfAuth.isLoggedIn());
}
window.mrfIsLoggedIn = mrfIsLoggedIn;

function mrfAuthIsReady() {
  return !!(window.MrfAuth && MrfAuth.ready);
}
window.mrfAuthIsReady = mrfAuthIsReady;

function mrfAuthHintLogged() {
  return !!(window.MrfAuth && typeof MrfAuth.hasAuthHint === 'function' && MrfAuth.hasAuthHint());
}
window.mrfAuthHintLogged = mrfAuthHintLogged;

/** Session still restoring — never flash guest UI yet */
function mrfAuthPending() {
  return !mrfAuthIsReady();
}
window.mrfAuthPending = mrfAuthPending;

/** True only after auth ready and user is guest */
function mrfShouldShowGuestGate() {
  if (mrfAuthPending()) return false;
  return !mrfIsLoggedIn();
}
window.mrfShouldShowGuestGate = mrfShouldShowGuestGate;

function mrfAuthBootHTML(opts) {
  const compact = !!(opts && opts.compact);
  const spin = typeof mrfBallSpinHTML === 'function'
    ? mrfBallSpinHTML()
    : '<span class="mrf-ball-spin" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>';
  return `<div class="auth-content-boot${compact ? ' is-compact' : ''}" role="status" aria-live="polite">${spin}</div>`;
}
window.mrfAuthBootHTML = mrfAuthBootHTML;

/** Returns true if logged in; otherwise toast (+ optional go to profile) and false. */
function mrfRequireLogin(opts) {
  if (mrfAuthPending()) return false;
  if (mrfIsLoggedIn()) return true;
  const o = opts || {};
  const msg = o.message || 'Сначала войди в аккаунт';
  if (typeof showNotif === 'function') showNotif(msg);
  if (o.goProfile) goProfile();
  return false;
}
window.mrfRequireLogin = mrfRequireLogin;

function mrfGuestGateHTML(opts) {
  const o = opts || {};
  const title = o.title || 'Войди в аккаунт';
  const text = o.text || 'Сохранять музыку можно после входа';
  const homeHref = typeof mrfUrl === 'function' ? mrfUrl('index') : 'index.html';
  return `<div class="lib-guest-gate" role="status">
    <div class="lib-guest-gate-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
      </svg>
          </div>
    <h2 class="lib-guest-gate-title">${title}</h2>
    <p class="lib-guest-gate-text">${text}</p>
    <div class="lib-guest-gate-actions">
      <button type="button" class="btn-primary lib-guest-gate-cta" onclick="goProfile()">Войти</button>
      <button type="button" class="btn-secondary lib-guest-gate-secondary" onclick="(window.mrfGo||function(u){location.href=u})('${homeHref}')">На главную</button>
        </div>
  </div>`;
}
window.mrfGuestGateHTML = mrfGuestGateHTML;

function toggleUserMenu() { goProfile(); }

let _flyoutTimer = null;
let _flyoutGen = 0;

function closeSearchFlyout() {
  document.getElementById('search-flyout')?.classList.add('hidden');
}

function openSearchFlyout(q) {
  if (isSearchPage()) { closeSearchFlyout(); return; }
  const fly = document.getElementById('search-flyout');
  if (!fly) return;
  fly.classList.remove('hidden');
  renderSearchFlyout(q || '');
}

async function renderSearchFlyout(q) {
  const fly = document.getElementById('search-flyout');
  if (!fly || isSearchPage()) return;
  const query = (q || '').trim();
  const gen = ++_flyoutGen;

  if (!query) {
    if (typeof Store?.pruneHistory === 'function') Store.pruneHistory();
    const hist = Store.getHistory().filter(h => String(h || '').trim().length >= 2).slice(0, 6);
    fly.innerHTML = `
      <div class="search-flyout-hint"><span>Быстрый поиск</span><kbd>Enter</kbd><span>— вкладка Поиск</span></div>
      ${hist.length
        ? `<div class="search-flyout-label">Недавние</div>${hist.map(h => `
          <button type="button" class="search-flyout-row" onclick="pickSearchFlyout('${escHtml(h).replace(/'/g, "\\'")}')">
            <svg class="search-flyout-ico" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="M20 20L16.5 16.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            <span>${escHtml(h)}</span>
          </button>`).join('')}`
        : `<div class="search-flyout-empty">Начни вводить трек или артиста</div>`}`;
    return;
  }

  fly.innerHTML = `<div class="search-flyout-empty">Ищем…</div>`;
  try {
    const [tracks, artists] = await Promise.all([
      dzArr(`/search/track?q=${encodeURIComponent(query)}&limit=5`),
      dzArr(`/search/artist?q=${encodeURIComponent(query)}&limit=4`)
    ]);
    if (gen !== _flyoutGen) return;
    const tNorm = (tracks || []).map(normDZ);
    const aList = artists || [];
    if (!tNorm.length && !aList.length) {
      fly.innerHTML = `<div class="search-flyout-empty">Ничего не найдено</div>
        <button type="button" class="search-flyout-row search-flyout-more" onclick="pickSearchFlyout('${escHtml(query).replace(/'/g, "\\'")}')">Искать «${escHtml(query)}» во вкладке Поиск</button>`;
      return;
    }
    let html = `<div class="search-flyout-hint"><span>Результаты</span><kbd>Enter</kbd><span>— все результаты</span></div>`;
    if (aList.length) {
      html += `<div class="search-flyout-label">Артисты</div>` + aList.map(a => `
        <button type="button" class="search-flyout-row" onclick="openArtistFromFlyout(${a.id ? Number(a.id) : 'null'},'${escHtml(a.name || '').replace(/'/g, "\\'")}')">
          ${a.picture_medium ? `<img class="search-flyout-avatar" src="${a.picture_medium}" alt="">` : `<span class="search-flyout-avatar ph">${escHtml((a.name || '?')[0])}</span>`}
          <span class="search-flyout-meta"><span class="search-flyout-title">${escHtml(a.name || '')}</span><span class="search-flyout-sub">Исполнитель</span></span>
        </button>`).join('');
    }
    if (tNorm.length) {
      _src['flyout_tracks'] = tNorm;
      html += `<div class="search-flyout-label">Треки</div>` + tNorm.map((t, i) => `
        <button type="button" class="search-flyout-row" onclick="playFlyoutTrack(${i})">
          ${t.album?.cover_medium ? `<img class="search-flyout-cover" src="${t.album.cover_medium}" alt="">` : `<span class="search-flyout-cover ph"></span>`}
          <span class="search-flyout-meta"><span class="search-flyout-title">${escHtml(t.title || '')}</span><span class="search-flyout-sub">${escHtml(t.artist?.name || '')}</span></span>
        </button>`).join('');
    }
    html += `<button type="button" class="search-flyout-row search-flyout-more" onclick="pickSearchFlyout('${escHtml(query).replace(/'/g, "\\'")}')">Смотреть все по запросу «${escHtml(query)}»</button>`;
    fly.innerHTML = html;
  } catch {
    if (gen !== _flyoutGen) return;
    fly.innerHTML = `<div class="search-flyout-empty">Ошибка поиска</div>`;
  }
}

function pickSearchFlyout(q) {
  closeSearchFlyout();
  if (typeof goSearchPage === 'function') goSearchPage(q);
  else location.href = typeof mrfUrl === 'function' ? mrfUrl('search', { q }) : `search.html?q=${encodeURIComponent(q)}`;
}

function playFlyoutTrack(i) {
  closeSearchFlyout();
  if (typeof playFromSrc === 'function') playFromSrc('flyout_tracks', i);
}

function rememberCurrentSearchQuery(extra) {
  const q = String(
    extra
    || document.getElementById('mobile-search-input')?.value
    || document.getElementById('main-search-input')?.value
    || document.getElementById('search-input')?.value
    || ''
  ).trim();
  if (q.length < 2) return;
  if (typeof Store?.addHistory === 'function') {
    try { Store.addHistory(q); } catch (_) {}
  }
  if (typeof renderSearchHistory === 'function') renderSearchHistory();
}
window.rememberCurrentSearchQuery = rememberCurrentSearchQuery;

function openArtistFromFlyout(id, name) {
  rememberCurrentSearchQuery();
  closeSearchFlyout();
  if (typeof openArtist === 'function') openArtist(id, name);
  else {
    const url = typeof mrfUrl === 'function' ? mrfUrl('artist', { id, name }) : `artist.html?id=${id}`;
    if (typeof mrfGo === 'function') mrfGo(url); else location.href = url;
  }
}

function syncSearchPageHiddenInput(q) {
  const hidden = document.getElementById('search-input');
  if (hidden) hidden.value = q || '';
}

function runSearchOnPage(q, opts) {
  const query = (q || '').trim();
  const save = !!(opts && opts.save);
  syncSearchPageHiddenInput(query);
  if (!query) {
    if (typeof showSearchInitial === 'function') showSearchInitial();
    return;
  }
  // Typing updates results live without polluting history
  if (typeof doSearch === 'function') doSearch(query, { save });
  else if (typeof pageRunSearch === 'function') pageRunSearch(query);
}

function bindTopbarSearchFlyout() {
  const input = document.getElementById('main-search-input');
  const clearBtn = document.getElementById('topbar-search-clear');
  if (!input) return;

  input.onfocus = () => {
    if (isSearchPage()) { closeSearchFlyout(); return; }
    openSearchFlyout(input.value.trim());
  };
  input.onclick = e => e.stopPropagation();
  input.oninput = () => {
    const q = input.value.trim();
    clearBtn?.classList.toggle('hidden', !q);
    if (isSearchPage()) {
      closeSearchFlyout();
      clearTimeout(_flyoutTimer);
      _flyoutTimer = setTimeout(() => runSearchOnPage(q, { save: false }), 320);
      return;
    }
    clearTimeout(_flyoutTimer);
    _flyoutTimer = setTimeout(() => openSearchFlyout(q), 280);
  };
  input.onkeydown = e => {
    if (e.key === 'Escape') { closeSearchFlyout(); input.blur(); return; }
    if (e.key === 'Enter') {
      const q = input.value.trim();
      if (!q) return;
      e.preventDefault();
      closeSearchFlyout();
      if (isSearchPage()) runSearchOnPage(q, { save: true });
      else if (typeof goSearchPage === 'function') goSearchPage(q);
    }
  };
  if (clearBtn) {
    clearBtn.onclick = e => {
  e.stopPropagation();
      input.value = '';
      clearBtn.classList.add('hidden');
      if (isSearchPage()) runSearchOnPage('');
      else openSearchFlyout('');
      input.focus();
    };
  }
  if (!window._searchFlyoutDocBound) {
    window._searchFlyoutDocBound = true;
    document.addEventListener('click', e => {
      if (!e.target.closest('#topbar-search-box')) closeSearchFlyout();
    });
  }
}

/* ══════════════════════════════════
   ИНЖЕКТ PLAYER
══════════════════════════════════ */
function playlistModalsHTML() {
  return `
    <div class="modal-overlay hidden" id="modal-overlay" onclick="closeModal()"></div>
    <div class="modal hidden" id="modal-create-playlist">
      <div class="modal-header"><span>Создать плейлист</span><button onclick="closeModal()">✕</button></div>
      <div class="modal-body modal-create-pl-body">
        <input type="text" class="modal-input" id="playlist-name-input" placeholder="Название плейлиста" maxlength="60"/>
        <input type="search" class="modal-input modal-pl-track-search" id="playlist-track-search" placeholder="Поиск" autocomplete="off" enterkeyhint="search"/>
        <div class="modal-pl-add-block">
          <div class="modal-pl-picked" id="playlist-picked-tracks"></div>
          <div class="modal-pl-search-results" id="playlist-track-results"></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal()">Отмена</button>
        <button class="btn-primary" onclick="confirmCreatePlaylist()" style="padding:10px 20px;font-size:13px">Создать</button>
      </div>
    </div>
    <div class="modal hidden" id="modal-add-tracks">
      <div class="modal-header"><span>Добавить из избранного</span><button onclick="closeModal()">✕</button></div>
      <div class="modal-body modal-create-pl-body">
        <input type="search" class="modal-input modal-pl-track-search" id="add-tracks-search" placeholder="Поиск" autocomplete="off" enterkeyhint="search"/>
        <div class="modal-pl-search-results" id="add-tracks-results"></div>
      </div>
      <div class="modal-footer">
        <button class="btn-primary" onclick="closeModal()" style="padding:10px 20px;font-size:13px">Готово</button>
      </div>
    </div>
    <div class="modal hidden" id="modal-rename-playlist">
      <div class="modal-header"><span>Переименовать</span><button onclick="closeModal()">✕</button></div>
      <div class="modal-body">
        <input type="text" class="modal-input" id="playlist-rename-input" placeholder="Новое название" maxlength="60"/>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal()">Отмена</button>
        <button class="btn-primary" onclick="confirmRenamePlaylist()" style="padding:10px 20px;font-size:13px">Сохранить</button>
      </div>
    </div>
    <div class="modal hidden" id="modal-add-to-playlist">
      <div class="modal-header"><span>Добавить в плейлист</span><button onclick="closeModal()">✕</button></div>
      <div class="modal-body" id="modal-playlist-list"></div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="showCreatePlaylist()">+ Новый плейлист</button>
        <button class="btn-primary" onclick="closeModal()" style="padding:10px 20px;font-size:13px">Готово</button>
      </div>
    </div>`;
}

/** Keep playlist modals up to date even when player DOM is preserved across soft-nav */
function ensurePlaylistModals() {
  const needCreate = !document.getElementById('playlist-picked-tracks')
    || !document.getElementById('playlist-track-search')
    || !document.getElementById('add-tracks-search')
    || !document.getElementById('modal-add-tracks')
    || !document.getElementById('modal-rename-playlist');
  if (!needCreate) return;
  document.getElementById('mrf-playlist-modals')?.remove();
  ['modal-overlay', 'modal-create-playlist', 'modal-add-tracks', 'modal-rename-playlist', 'modal-add-to-playlist'].forEach(id => {
    document.getElementById(id)?.remove();
  });
  const wrap = document.createElement('div');
  wrap.id = 'mrf-playlist-modals';
  wrap.innerHTML = playlistModalsHTML();
  document.body.appendChild(wrap);
}
window.ensurePlaylistModals = ensurePlaylistModals;

function fsPlayerMarkup() {
  return `
    <div class="fs-player hidden" id="fs-player" aria-hidden="true">
      <div class="fs-player-bg" id="fs-player-bg" aria-hidden="true"></div>
      <div class="fs-player-shade" aria-hidden="true"></div>
      <div class="fs-scroll" id="fs-scroll">
        <div class="fs-stage">
          <div class="fs-player-top">
            <button type="button" class="fs-icon-btn" id="fs-close-btn" onclick="closeFsPlayer()" aria-label="Свернуть">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <div class="fs-player-context" id="fs-player-context">
              <div class="fs-player-context-title">Сейчас играет</div>
              <div class="fs-player-context-sub" id="fs-player-context-sub" hidden></div>
            </div>
            <button type="button" class="fs-icon-btn" id="fs-menu-btn" onclick="openFsMoreSheet()" aria-label="Ещё">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
            </button>
          </div>
          <div class="fs-hero">
            <div class="fs-cover" id="fs-cover">
              <img class="fs-cover-img" alt="" decoding="async" draggable="false" hidden>
            </div>
          </div>
          <div class="fs-dock">
            <div class="fs-meta-row">
              <div class="fs-meta">
                <div class="fs-title" id="fs-title">—</div>
                <div class="fs-artist" id="fs-artist">—</div>
              </div>
              <button type="button" class="fs-like" id="fs-like-btn" onclick="event.stopPropagation();toggleFavPlayer()" title="В избранное">
                <svg viewBox="0 0 24 24" fill="none" width="22" height="22"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke="currentColor" stroke-width="1.8"/></svg>
              </button>
            </div>
            <div class="fs-progress">
              <div class="fs-progress-track" id="fs-progress-track">
                <div class="fs-progress-fill" id="fs-progress-fill"><div class="fs-progress-thumb"></div></div>
              </div>
              <div class="fs-progress-times">
                <span id="fs-time-current">0:00</span>
                <span id="fs-time-total">0:00</span>
              </div>
            </div>
            <div class="fs-controls">
              <button type="button" class="fs-ctrl" id="fs-btn-shuffle" onclick="toggleShuffle()" title="Перемешать">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M15 13.5L18 16.5V14H20V20L14 20V18H16.5L13.5 15L15 13.5ZM9 10.5L10.5 9L5.5 4L4 5.5L9 10.5Z"/><path d="M20 4H14V6H16.5L4 18.5L5.5 20L18 7.5V10H20L20 4Z"/></svg>
              </button>
              <button type="button" class="fs-ctrl" onclick="prevTrack()" title="Предыдущий">
                <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
              </button>
              <button type="button" class="fs-ctrl fs-ctrl-play" id="fs-btn-play" onclick="togglePlay()" title="Играть / Пауза">
                <svg width="52" height="52" viewBox="0 0 24 24" fill="none"><path d="M22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5203 21.9939 21.9939 17.5203 22 12ZM11.996 19.992C16.4127 19.9942 19.9956 16.4167 20 12C19.9956 7.58329 16.4127 3.98979 11.996 3.992C7.57929 3.99421 4 7.57528 4 11.992C4 16.4087 7.57929 19.9898 11.996 19.992Z" fill-rule="evenodd" clip-rule="evenodd" fill="currentColor"/><path d="M10 16V8L16 12L10 16Z" fill="currentColor"/></svg>
              </button>
              <button type="button" class="fs-ctrl" onclick="nextTrack()" title="Следующий">
                <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
              </button>
              <button type="button" class="fs-ctrl" id="fs-btn-repeat" onclick="toggleRepeat()" title="Повтор">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M7.5 22L2.5 17L7.5 12L9 13.5L6.50003 16H18V14L20 12V18H6.49997L9 20.5L7.5 22Z"/><path d="M15 3.49999L16.5 2L21.5 7L16.5 12L15 10.5L17.5 8H6V10L4 12V5.99999H17.5L15 3.49999Z"/></svg>
              </button>
            </div>
            <div class="fs-tools">
              <button type="button" class="fs-tool-ico fs-tool-share" onclick="if(typeof shareTrack==='function'&&queue[queueIndex])shareTrack(queue[queueIndex])" aria-label="Поделиться" title="Поделиться">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none"><path d="M12 3v10" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M8.5 6.5L12 3l3.5 3.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>
              </button>
              <span class="fs-tools-spacer" aria-hidden="true"></span>
              <button type="button" class="fs-tool-ico fs-tool-queue" onclick="openFsQueueSheet()" aria-label="Очередь" title="Очередь">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none"><path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M17 15.5v5l4-2.5-4-2.5z" fill="currentColor"/></svg>
              </button>
            </div>
          </div>
        </div>

        <section class="fs-block" id="fs-block-artists">
          <h3 class="fs-block-title">Исполнители</h3>
          <div class="fs-artists" id="fs-artists"></div>
        </section>
        <section class="fs-block" id="fs-block-about">
          <h3 class="fs-block-title">Об исполнителе</h3>
          <div class="fs-card" id="fs-about-card"></div>
        </section>
        <section class="fs-block" id="fs-block-credits">
          <h3 class="fs-block-title">Сведения</h3>
          <div class="fs-card" id="fs-credits-card"></div>
        </section>
        <section class="fs-block" id="fs-block-lyrics">
          <h3 class="fs-block-title">Текст</h3>
          <div class="fs-card fs-lyrics-card" id="fs-lyrics-card"></div>
        </section>
        <section class="fs-block" id="fs-block-next">
          <h3 class="fs-block-title">Следующий трек</h3>
          <div class="fs-card" id="fs-next-card"></div>
        </section>
        <section class="fs-block" id="fs-block-similar">
          <h3 class="fs-block-title">Похожие треки</h3>
          <div class="fs-card" id="fs-similar-card"></div>
        </section>
        <div class="fs-scroll-spacer"></div>
      </div>
    </div>

    <div class="fs-sheet-overlay hidden" id="fs-sheet-overlay" onclick="closeFsSheets()"></div>
    <div class="fs-sheet hidden" id="fs-more-sheet" role="dialog" aria-label="Действия">
      <div class="fs-sheet-handle" aria-hidden="true"></div>
      <div class="fs-sheet-head" id="fs-more-head"></div>
      <div class="fs-sheet-list" id="fs-more-list"></div>
    </div>
    <div class="fs-sheet fs-sheet-queue hidden" id="fs-queue-sheet" role="dialog" aria-label="Очередь">
      <div class="fs-sheet-handle" aria-hidden="true"></div>
      <div class="fs-queue-head">
        <div>
          <div class="fs-queue-title">Очередь</div>
          <div class="fs-queue-sub" id="fs-queue-sub">Сейчас играет</div>
        </div>
        <button type="button" class="fs-sheet-close" onclick="closeFsSheets()" aria-label="Закрыть">✕</button>
      </div>
      <div class="fs-queue-actions fs-queue-actions-2">
        <button type="button" class="fs-q-chip" id="fs-q-shuffle" onclick="toggleShuffle();syncFsQueueChrome()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15 13.5L18 16.5V14H20V20L14 20V18H16.5L13.5 15L15 13.5ZM9 10.5L10.5 9L5.5 4L4 5.5L9 10.5Z"/><path d="M20 4H14V6H16.5L4 18.5L5.5 20L18 7.5V10H20L20 4Z"/></svg>
          Перемешать
        </button>
        <button type="button" class="fs-q-chip" onclick="if(typeof clearQueue==='function')clearQueue();renderFsQueueSheet()">
          Очистить
        </button>
      </div>
      <div class="fs-queue-list" id="fs-queue-list"></div>
    </div>`;
}
window.fsPlayerMarkup = fsPlayerMarkup;

function injectPlayer() {
  const root = document.getElementById('player-root');
  if (!root) return;
  // Never rebuild player DOM while soft-navigating — that would glitch audio UX
  // Mini-player may live on <body> (mobile) — check globally
  if (document.getElementById('player') || root.querySelector('.player')) {
    ensurePlaylistModals();
    if (typeof ensureMobilePlayerHost === 'function') ensureMobilePlayerHost();
    if (typeof ensureFsPlayerDom === 'function') ensureFsPlayerDom();
    return;
  }

  root.innerHTML = `
    <footer class="player" id="player">
      <div class="player-track">
        <div class="player-cover" id="player-cover" title="Подробнее"></div>
        <div class="player-track-info">
          <div class="player-title-row">
          <div class="player-title" id="player-title">Ничего не играет</div>
            <button type="button" class="player-like" id="player-like-btn" onclick="event.stopPropagation();toggleFavPlayer()" title="В избранное">
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke="currentColor" stroke-width="1.8"/></svg>
        </button>
          </div>
          <div class="player-artist" id="player-artist">Выбери трек</div>
        </div>
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
        <button type="button" class="ctrl-btn ctrl-play" id="btn-play" onclick="event.stopPropagation();togglePlay()" title="Играть / Пауза">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none">
            <path d="M22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5203 21.9939 21.9939 17.5203 22 12ZM11.996 19.992C16.4127 19.9942 19.9956 16.4167 20 12C19.9956 7.58329 16.4127 3.98979 11.996 3.992C7.57929 3.99421 4 7.57528 4 11.992C4 16.4087 7.57929 19.9898 11.996 19.992Z" fill-rule="evenodd" clip-rule="evenodd" fill="currentColor"/>
            <path d="M10 16V8L16 12L10 16Z" fill="currentColor"/>
          </svg>
        </button>
        <button type="button" class="ctrl-btn ctrl-next" onclick="event.stopPropagation();nextTrack()" title="Следующий">
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

    <!-- FS player mounts on <body> via ensureFsPlayerDom — not inside player-root -->

    <!-- NOTIFICATION -->
    <div class="notification hidden" id="notification"></div>
    ${playlistModalsHTML()}
  `;
}

/* ══════════════════════════════════
   МОБИЛЬНАЯ НАВИГАЦИЯ
══════════════════════════════════ */
function injectMobileNav() {
  let root = document.getElementById('mobile-nav-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'mobile-nav-root';
    document.body.appendChild(root);
  }

  // Apple / SF Symbols–style: outline idle, filled when active
  const navItems = [
    {
      href: 'index.html', page: 'index', label: 'Главная',
      icon: `
        <g class="nav-ico-line" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">
          <path d="M4.5 10.2L12 4.2l7.5 6V19.2a1.3 1.3 0 0 1-1.3 1.3h-4.4v-5.2h-4.6v5.2H5.8A1.3 1.3 0 0 1 4.5 19.2v-9z"/>
        </g>
        <g class="nav-ico-fill" fill="currentColor">
          <path d="M12 3.4L3.8 9.9a1 1 0 0 0-.3.7V19a1.7 1.7 0 0 0 1.7 1.7h4.2v-5.6h5.2V20.7h4.2A1.7 1.7 0 0 0 20.5 19v-8.4a1 1 0 0 0-.3-.7L12 3.4z"/>
        </g>`
    },
    {
      href: 'search.html', page: 'search', label: 'Поиск',
      icon: `
        <g class="nav-ico-line" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
          <circle cx="11" cy="11" r="6.2"/>
          <path d="M16.2 16.2L20 20"/>
        </g>
        <g class="nav-ico-fill" fill="currentColor">
          <path d="M10.8 3.6a7.2 7.2 0 1 0 4.5 12.8l3.7 3.7a1 1 0 0 0 1.4-1.4l-3.7-3.7A7.2 7.2 0 0 0 10.8 3.6zm0 2a5.2 5.2 0 1 1 0 10.4 5.2 5.2 0 0 1 0-10.4z"/>
        </g>`
    },
    {
      href: 'library.html', page: 'library', label: 'Библиотека',
      icon: `
        <g class="nav-ico-line" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6.2 5.2h11.6a1 1 0 0 1 1 1v1.4H5.2V6.2a1 1 0 0 1 1-1z"/>
          <path d="M5.2 9.4h13.6v9.2a1.2 1.2 0 0 1-1.2 1.2H6.4a1.2 1.2 0 0 1-1.2-1.2V9.4z"/>
          <path d="M9.2 13.2h5.6"/>
        </g>
        <g class="nav-ico-fill" fill="currentColor">
          <path d="M6.2 4.4h11.6A1.8 1.8 0 0 1 19.6 6.2v.8H4.4v-.8A1.8 1.8 0 0 1 6.2 4.4z"/>
          <path d="M4.4 8.6h15.2v9.6A2 2 0 0 1 17.6 20.2H6.4A2 2 0 0 1 4.4 18.2V8.6zm5.2 4.2a1 1 0 0 0 0 2h5.6a1 1 0 0 0 0-2H9.6z"/>
        </g>`
    },
  ];

  const curPage = getPageId();
  root.innerHTML = `<nav class="mobile-nav" role="navigation" aria-label="Главная навигация">
    ${navItems.map(item => `
      <a href="${item.href}" class="mobile-nav-item${mobileNavRootForPage(curPage) === item.page ? ' active' : ''}" data-mob-page="${item.page}" onclick="event.preventDefault();(window.mrfGo||function(u){location.href=u})('${item.href}')">
        <svg class="mobile-nav-ico" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">${item.icon}</svg>
        <span>${item.label}</span>
      </a>`).join('')}
  </nav>`;
}

function mobileNavRootForPage(pageId) {
  const p = pageId || getPageId();
  if (p === 'search') return 'search';
  if (['library', 'liked', 'playlists', 'albums', 'artists', 'playlist', 'album', 'profile'].includes(p)) {
    return 'library';
  }
  if (p === 'artist' || p === 'charts') return 'search';
  if (p === 'index' || p === 'home' || p === '') return 'index';
  return 'index';
}

function updateMobileNavActive(pageId) {
  const root = mobileNavRootForPage(pageId);
  document.querySelectorAll('.mobile-nav-item[data-mob-page]').forEach(a => {
    a.classList.toggle('active', a.getAttribute('data-mob-page') === root);
  });
}
window.updateMobileNavActive = updateMobileNavActive;

/* ══════════════════════════════════
   ИНИЦИАЛИЗАЦИЯ SHARED
══════════════════════════════════ */
function initShared() {
  console.log('[NOVALIBER] initShared started');
  const coldBoot = !window.__mrfSharedInited;
  window.__mrfSharedInited = true;
  if (coldBoot) {
    try { showPageBoot(); } catch (_) {}
  }
  
  applyUiLayoutMode();

  // восстанавливаем ширину sidebar (только desktop PC)
  const isCollapsed = localStorage.getItem('mrf_sidebar_collapsed') === '1';
  if (isDesktopLayout()) {
  document.body.style.setProperty('--sidebar-w', isCollapsed ? '60px' : '240px');
  if (isCollapsed) document.body.classList.add('sidebar-collapsed');
  } else {
    document.body.style.setProperty('--sidebar-w', '0px');
    document.body.classList.remove('sidebar-collapsed');
  }

  const hadPlayer = !!(document.getElementById('player') || document.querySelector('#player-root .player'));

  injectSidebar();
  injectTopbar();
  injectPlayer();
  injectMobileNav();
  ensurePlaylistModals();
  applyUiLayoutMode();
  if (typeof ensureMobilePlayerHost === 'function') ensureMobilePlayerHost();
  if (typeof ensureFsPlayerDom === 'function') ensureFsPlayerDom();

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
  if (typeof syncActiveTrackClass === 'function') {
    const t = (typeof queue !== 'undefined' && typeof queueIndex === 'number' && queueIndex >= 0)
      ? queue[queueIndex]
      : null;
    syncActiveTrackClass(t || null);
  }

  try { syncMrfPremFab(); } catch (_) {}
  try { syncPrisonPlayerUi(); } catch (_) {}
  console.log('[NOVALIBER] initShared completed');
  if (coldBoot) hidePageBootWhenAuthReady();
}

/* ══════════════════════════════════
   HELPERS
══════════════════════════════════ */
const el = id => document.getElementById(id);
const qs = sel => document.querySelector(sel);

function accountUsernameOf(raw) {
  if (window.MrfAuth?.normalizeUsername) return MrfAuth.normalizeUsername(raw);
  return String(raw || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24);
}
window.accountUsernameOf = accountUsernameOf;

function accountHandleOf(raw) {
  if (window.MrfAuth?.displayUsername) return MrfAuth.displayUsername(raw) || '';
  const n = accountUsernameOf(raw);
  return n ? '@' + n : '';
}
window.accountHandleOf = accountHandleOf;

/** Build page URL — always keep .html so soft-nav/static servers keep ?query */
function mrfUrl(page, params) {
  const base = String(page || '').replace(/\.html$/i, '') + '.html';
  if (!params) return base;
  const qs = new URLSearchParams();
  Object.keys(params).forEach(k => {
    const v = params[k];
    if (v != null && v !== '') qs.set(k, v);
  });
  const q = qs.toString();
  return q ? `${base}?${q}` : base;
}
window.mrfUrl = mrfUrl;

function openAccount(username) {
  const u = accountUsernameOf(username);
  if (!u) return;
  const url = mrfUrl('account', { u });
  if (typeof mrfGo === 'function') mrfGo(url);
  else location.href = url;
}
window.openAccount = openAccount;

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
function mrfBallSpinHTML(extraClass) {
  const cls = extraClass ? `mrf-ball-spin ${extraClass}` : 'mrf-ball-spin';
  return `<span class="${cls}" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>`;
}
window.mrfBallSpinHTML = mrfBallSpinHTML;

function mrfPremiumStillActive(p) {
  if (!p) return false;
  const flagged = !!(p.premium || p.plan === 'premium');
  if (!flagged) return false;
  const endRaw = p.premiumEndsAt || p.premium_ends_at;
  if (endRaw) {
    const end = Date.parse(endRaw);
    if (Number.isFinite(end) && end <= Date.now()) return false;
  }
  return true;
}

function mrfUserHasPremium() {
  const cloud = window.MrfAuth?.profile;
  if (cloud) {
    if (mrfPremiumStillActive(cloud)) return true;
    if (cloud.premium === false || cloud.plan === 'free') return false;
  }
  try {
    const p = typeof Store !== 'undefined' && Store.getProfile ? Store.getProfile() : null;
    return mrfPremiumStillActive(p);
  } catch (_) {
    return false;
  }
}
window.mrfUserHasPremium = mrfUserHasPremium;
window.mrfPremiumStillActive = mrfPremiumStillActive;

/** Free accents: brand pink + Spotify-like green */
const MRF_FREE_ACCENTS = ['#EE90B7', '#27AE60'];
window.MRF_FREE_ACCENTS = MRF_FREE_ACCENTS;

function mrfNormalizeAccentHex(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  if (s[0] !== '#') s = '#' + s;
  s = s.toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(s)) return s;
  if (/^#[0-9A-F]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  return '';
}
window.mrfNormalizeAccentHex = mrfNormalizeAccentHex;

function mrfIsFreeAccent(hex) {
  const n = mrfNormalizeAccentHex(hex);
  return !!n && MRF_FREE_ACCENTS.includes(n);
}
window.mrfIsFreeAccent = mrfIsFreeAccent;

function mrfClampAccentForPlan(hex, fallback) {
  const n = mrfNormalizeAccentHex(hex);
  if (mrfUserHasPremium()) return n || mrfNormalizeAccentHex(fallback) || MRF_FREE_ACCENTS[0];
  if (n && MRF_FREE_ACCENTS.includes(n)) return n;
  return mrfNormalizeAccentHex(fallback) || MRF_FREE_ACCENTS[0];
}
window.mrfClampAccentForPlan = mrfClampAccentForPlan;

function mrfRequirePremium(kind) {
  if (mrfUserHasPremium()) return true;
  const msg = kind === 'accent'
    ? 'Цвет — в Premium'
    : kind === 'shuffle'
      ? 'Перемешивание — в Premium'
      : kind === 'pick'
        ? 'Выбор трека — в Premium'
        : 'Переключение — в Premium';
  if (typeof showNotification === 'function') showNotification(msg);
  else if (typeof showNotif === 'function') showNotif(msg);
  return false;
}
window.mrfRequirePremium = mrfRequirePremium;

function syncPrisonPlayerUi() {
  const prem = mrfUserHasPremium();
  document.body?.classList.toggle('is-free-plan', !prem);
  document.body?.classList.toggle('is-premium-plan', prem);
  const lockSel = [
    '#btn-shuffle', '#fs-btn-shuffle', '#fs-q-shuffle',
    '#shuffle-liked-btn',
    '.liked-shuffle-btn',
    '.playlist-shuffle-btn',
    '[onclick*="shuffleLiked"]',
    '[onclick*="shufflePlaylistNow"]',
    '[onclick*="toggleShuffle"]',
    '.player-controls .ctrl-btn[onclick*="prevTrack"]',
    '.player-controls .ctrl-next',
    '.fs-ctrl[onclick*="prevTrack"]',
    '.fs-ctrl[onclick*="nextTrack"]',
    '.rp-ctrl-btn[onclick*="prevTrack"]',
    '.rp-ctrl-btn[onclick*="nextTrack"]'
  ];
  document.querySelectorAll(lockSel.join(',')).forEach((btn) => {
    const onclick = btn.getAttribute('onclick') || '';
    const isShuffleBtn = btn.id === 'btn-shuffle' || btn.id === 'fs-btn-shuffle' || btn.id === 'fs-q-shuffle'
      || btn.id === 'shuffle-liked-btn'
      || btn.classList.contains('liked-shuffle-btn')
      || btn.classList.contains('playlist-shuffle-btn')
      || onclick.includes('toggleShuffle')
      || onclick.includes('shuffleLiked')
      || onclick.includes('shufflePlaylistNow');
    const isSkip = onclick.includes('nextTrack')
      || onclick.includes('prevTrack')
      || btn.classList.contains('ctrl-next');
    if (!isShuffleBtn && !isSkip) return;
    btn.classList.toggle('is-premium-locked', !prem);
    btn.setAttribute('aria-disabled', prem ? 'false' : 'true');
    if (!prem) {
      btn.title = isShuffleBtn ? 'Перемешивание — Premium' : 'Переключение — Premium';
    } else if (isShuffleBtn) {
      btn.title = btn.id === 'shuffle-liked-btn' ? 'Вразброс' : 'Перемешать';
    }
  });
  if (!prem && typeof isShuffle !== 'undefined' && isShuffle) {
    try {
      isShuffle = false;
      if (typeof syncShuffleRepeatUi === 'function') syncShuffleRepeatUi();
    } catch (_) {}
  }
}
window.syncPrisonPlayerUi = syncPrisonPlayerUi;

function openPremiumCheckout() {
  const url = typeof mrfUrl === 'function' ? mrfUrl('premium') : 'premium.html';
  if (typeof mrfGo === 'function') mrfGo(url);
  else location.href = url;
}
window.openPremiumCheckout = openPremiumCheckout;

function syncMrfPremFab() {
  if (!document.body) return;
  let fab = document.getElementById('mrf-prem-fab');
  const onPremiumPage = typeof getPageId === 'function' && getPageId() === 'premium';
  const show = !mrfUserHasPremium() && !onPremiumPage;
  if (!show) {
    if (fab) fab.hidden = true;
    return;
  }
  const markHTML = `${novaliberMarkSVG(28).replace('class="logo-img logo-img--mark"', 'class="mrf-prem-fab-mark logo-img logo-img--mark"')}
    <span class="mrf-prem-fab-tag">Prem</span>
    <span class="mrf-prem-fab-copy">
      <span class="mrf-prem-fab-kicker">NOVALIBER</span>
      <span class="mrf-prem-fab-title">Premium</span>
    </span>`;
  if (!fab) {
    fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'mrf-prem-fab';
    fab.className = 'mrf-prem-fab';
    fab.setAttribute('aria-label', 'NOVALIBER Premium');
    fab.innerHTML = markHTML;
    fab.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPremiumCheckout();
    });
  } else if (!fab.querySelector('.mrf-prem-fab-copy')) {
    fab.innerHTML = markHTML;
  }

  // PC: banner in topbar next to profile. Mobile: floating ball on body (unchanged).
  const desktop = typeof isDesktopLayout === 'function' ? isDesktopLayout() : window.matchMedia('(min-width: 901px)').matches;
  const topbar = document.querySelector('#topbar-root .topbar, .topbar');
  const avatar = document.getElementById('topbar-avatar');
  if (desktop && topbar) {
    if (avatar && avatar.parentElement === topbar) topbar.insertBefore(fab, avatar);
    else if (fab.parentElement !== topbar) topbar.appendChild(fab);
  } else if (fab.parentElement !== document.body) {
    document.body.appendChild(fab);
  }
  fab.hidden = false;
}
window.syncMrfPremFab = syncMrfPremFab;

if (!window.__mrfPremFabAuthBound) {
  window.__mrfPremFabAuthBound = true;
  window.addEventListener('mrf:auth', () => {
    try { syncMrfPremFab(); } catch (_) {}
    try { syncPrisonPlayerUi(); } catch (_) {}
    try {
      if (typeof applyThemeFromSettings === 'function') applyThemeFromSettings();
    } catch (_) {}
    try {
      const params = new URLSearchParams(location.search);
      const hasReturn = params.get('paid') === '1' || !!mrfReadPayWait();
      if (hasReturn) void mrfConfirmBillingPayment({ silent: false });
      else void mrfConfirmBillingPayment({ silent: true, pendingOnly: true });
    } catch (_) {}
  });
}

/* ── Billing: auto-confirm after YooKassa return (no modal required) ── */
const MRF_PAY_WAIT_KEY = 'mrf_pay_wait_v1';
let __mrfBillingConfirmBusy = false;

function mrfReadPayWait() {
  const read = (store) => {
    try {
      const raw = store.getItem(MRF_PAY_WAIT_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (!p || (!p.localId && !p.paymentId)) return null;
      return p;
    } catch (_) {
      return null;
    }
  };
  try {
    return read(localStorage) || read(sessionStorage);
  } catch (_) {
    return null;
  }
}

function mrfSavePayWait(payload) {
  const raw = JSON.stringify(payload || {});
  try { localStorage.setItem(MRF_PAY_WAIT_KEY, raw); } catch (_) {}
  try { sessionStorage.setItem(MRF_PAY_WAIT_KEY, raw); } catch (_) {}
}
window.mrfSavePayWait = mrfSavePayWait;

function mrfClearPayWait() {
  try { localStorage.removeItem(MRF_PAY_WAIT_KEY); } catch (_) {}
  try { sessionStorage.removeItem(MRF_PAY_WAIT_KEY); } catch (_) {}
}

function mrfStripPaidQuery() {
  try {
    const u = new URL(location.href);
    if (!u.searchParams.has('paid') && !u.searchParams.has('pid')) return;
    u.searchParams.delete('paid');
    u.searchParams.delete('pid');
    history.replaceState(history.state || {}, '', u.pathname + u.search + u.hash);
  } catch (_) {}
}

function mrfApplyBillingProfile(profile) {
  if (!profile || !window.MrfAuth) return;
  MrfAuth.profile = profile;
  if (typeof MrfAuth.applyProfileLocal === 'function') MrfAuth.applyProfileLocal(profile);
  try { if (typeof syncPrisonPlayerUi === 'function') syncPrisonPlayerUi(); } catch (_) {}
  try { if (typeof syncMrfPremFab === 'function') syncMrfPremFab(); } catch (_) {}
  try {
    if (typeof getPageId === 'function' && getPageId() === 'premium' && typeof renderPremiumPage === 'function') {
      renderPremiumPage();
    }
  } catch (_) {}
  try {
    if (typeof getPageId === 'function' && getPageId() === 'profile' && typeof loadProfilePage === 'function') {
      loadProfilePage();
    }
  } catch (_) {}
}

function mrfWaitAuthReady(timeoutMs) {
  const limit = typeof timeoutMs === 'number' ? timeoutMs : 20000;
  if (window.MrfAuth?.ready) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(tick);
      clearTimeout(kill);
      window.removeEventListener('mrf:auth', onAuth);
      resolve();
    };
    const onAuth = () => {
      if (window.MrfAuth?.ready) finish();
    };
    const tick = setInterval(() => {
      if (window.MrfAuth?.ready) finish();
    }, 120);
    const kill = setTimeout(finish, limit);
    window.addEventListener('mrf:auth', onAuth);
  });
}

/**
 * After YooKassa return / page load: ask server to sync this payment with YooKassa
 * and apply Premium once. Works without modal; safe if user closed the tab and came back.
 */
async function mrfConfirmBillingPayment(opts) {
  const o = opts || {};
  if (__mrfBillingConfirmBusy) return null;
  __mrfBillingConfirmBusy = true;
  try {
    // Capture return params into durable storage before anything strips them
    try {
      const params = new URLSearchParams(location.search);
      const pid = params.get('pid') || '';
      if (params.get('paid') === '1' && pid) {
        mrfSavePayWait({
          localId: pid,
          fromReturn: true,
          t: Date.now()
        });
      }
    } catch (_) {}

    await mrfWaitAuthReady();
    if (!(window.MrfAuth?.api && MrfAuth.isLoggedIn && MrfAuth.isLoggedIn())) {
      return null;
    }

    const stored = mrfReadPayWait();
    const params = new URLSearchParams(location.search);
    const localId = params.get('pid') || stored?.localId || null;
    const paymentId = stored?.paymentId || null;
    const fromReturn = params.get('paid') === '1' || !!stored?.fromReturn;

    // Prefer explicit id; else ask server for active pending and sync it
    let targetLocal = localId;
    let targetYoo = paymentId;

    if (!targetLocal && !targetYoo) {
      // Background: only look for an open pending checkout (auto-fix stuck pays)
      try {
        const pending = await MrfAuth.api('/api/billing?action=pending');
        if (pending?.payment?.status === 'pending') {
          targetLocal = pending.payment.id;
          targetYoo = pending.payment.paymentId;
        } else if (pending?.payment && fromReturn) {
          mrfStripPaidQuery();
          mrfClearPayWait();
          if (pending.profile) mrfApplyBillingProfile(pending.profile);
          if (!o.silent && typeof showNotif === 'function') {
            const st = pending.payment.status;
            if (st === 'succeeded') showNotif('Premium активен', 2200);
            else if (st === 'canceled') showNotif('Оплата отменена', 2200);
            else if (st === 'expired') showNotif('Время оплаты истекло', 2200);
          }
          return pending;
        } else if (o.pendingOnly || (!fromReturn && !stored)) {
          return null;
        }
      } catch (_) {
        if (o.pendingOnly) return null;
      }
    }

    if (!targetLocal && !targetYoo) {
      mrfStripPaidQuery();
      return null;
    }

    const started = Date.now();
    const maxMs = 3 * 60 * 1000;
    let last = null;

    while (Date.now() - started < maxMs) {
      try {
        const q = targetLocal
          ? `local_id=${encodeURIComponent(targetLocal)}`
          : `payment_id=${encodeURIComponent(targetYoo)}`;
        last = await MrfAuth.api(`/api/billing?action=status&${q}`);
        const st = last?.payment?.status || last?.status || '';
        if (st === 'succeeded' || st === 'canceled' || st === 'expired') {
          mrfStripPaidQuery();
          mrfClearPayWait();
          if (last.profile) mrfApplyBillingProfile(last.profile);
          if (!o.silent && typeof showNotif === 'function') {
            if (st === 'succeeded') showNotif('Premium активен', 2200);
            else if (st === 'canceled') showNotif('Оплата отменена', 2200);
            else showNotif('Время оплаты истекло', 2200);
          }
          return last;
        }
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 1800));
    }

    // Timed out waiting — leave storage so next page load retries
    mrfStripPaidQuery();
    if (!o.silent && typeof showNotif === 'function') showNotif('Проверяем оплату…', 1800);
    return last;
  } finally {
    __mrfBillingConfirmBusy = false;
  }
}
window.mrfConfirmBillingPayment = mrfConfirmBillingPayment;

function mrfHardGo(url) {
  if (typeof window.mrfHardNavigate === 'function') window.mrfHardNavigate(url);
  else {
    try { window.location.href = url; } catch (_) { location.assign(url); }
  }
}
window.mrfHardGo = mrfHardGo;

function loaderHTMLShared(msg) {
  const label = msg ? `<span>${msg}</span>` : '';
  return `<div class="loading-placeholder">${mrfBallSpinHTML()}${label}</div>`;
}

/** Boot logo — wordmark + calm progress (PC + mobile). */
function mrfBootLogoHTML(height = 42) {
  const h = Number(height) || 42;
  const w = Math.round(h * (1000 / 160));
  return `<div class="page-boot-inner" role="status" aria-live="polite" aria-label="Загрузка">
    <div class="page-boot-mark">
      <svg class="page-boot-logo" viewBox="0 0 1000 160" width="${w}" height="${h}" role="img" aria-label="NOVALIBER" fill="currentColor" xmlns="http://www.w3.org/2000/svg">${novaliberLogoWordmarkInner({
        wordClass: 'page-boot-word'
      })}</svg>
      <div class="page-boot-progress" aria-hidden="true"><span></span></div>
    </div>
    <p class="page-boot-hint" id="page-boot-hint" hidden></p>
  </div>`;
}
window.mrfBootLogoHTML = mrfBootLogoHTML;

function pageBootInnerHTML() {
  const desktop = typeof isDesktopLayout === 'function'
    ? isDesktopLayout()
    : window.matchMedia('(min-width: 901px)').matches;
  return mrfBootLogoHTML(desktop ? 48 : 36);
}

function syncBootAccentFromSettings() {
  try {
    if (typeof applyThemeFromSettings === 'function') {
      applyThemeFromSettings();
      return;
    }
    if (typeof Store === 'undefined' || !Store.getSettings) return;
    const s = Store.getSettings() || {};
    const theme = s.theme || 'dark';
    const color = theme === 'light'
      ? (s.accentColorLight || s.accentColor || '#E35A90')
      : (s.accentColorDark || s.accentColor || '#EE90B7');
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.setProperty('--accent', color);
    if (document.body) document.body.classList.toggle('theme-light', theme === 'light');
  } catch (_) {}
}

function clearPageBootSlowHint() {
  if (window.__mrfBootSlowTimer) {
    clearTimeout(window.__mrfBootSlowTimer);
    window.__mrfBootSlowTimer = null;
  }
  window.__mrfBootSlowHintShown = false;
}

function schedulePageBootSlowHint() {
  clearPageBootSlowHint();
  window.__mrfBootSlowTimer = setTimeout(() => {
    window.__mrfBootSlowTimer = null;
    if (!document.body?.classList.contains('is-page-booting')) return;
    if (document.getElementById('mrf-page-boot')?.classList.contains('is-done')) return;
    if (window.__mrfBootSlowHintShown) return;
    window.__mrfBootSlowHintShown = true;
    const msg = 'Ничего не зависло — подгружаем рекомендации в кэш';
    const hint = document.getElementById('page-boot-hint');
    if (hint) {
      hint.hidden = false;
      hint.textContent = msg;
      requestAnimationFrame(() => hint.classList.add('is-show'));
    }
  }, 10000);
}

function showPageBoot() {
  syncBootAccentFromSettings();
  const existing = document.getElementById('mrf-page-boot');
  if (existing) {
    document.body.classList.add('is-page-booting');
    existing.classList.remove('is-done');
    existing.innerHTML = pageBootInnerHTML();
    schedulePageBootSlowHint();
    return;
  }
  if (!document.body) return;
  document.body.classList.add('is-page-booting');
  const el = document.createElement('div');
  el.id = 'mrf-page-boot';
  el.className = 'page-boot';
  el.setAttribute('aria-busy', 'true');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = pageBootInnerHTML();
  document.body.appendChild(el);
  schedulePageBootSlowHint();
}
window.showPageBoot = showPageBoot;

function hidePageBoot() {
  clearPageBootSlowHint();
  document.body.classList.remove('is-page-booting');
  const el = document.getElementById('mrf-page-boot');
  if (!el) return;
  el.classList.add('is-done');
  el.removeAttribute('aria-busy');
  setTimeout(() => {
    if (el.parentNode) el.remove();
  }, 340);
}
window.hidePageBoot = hidePageBoot;

function mrfClientTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (_) {
    return 'UTC';
  }
}
window.mrfClientTimezone = mrfClientTimezone;

/** Local calendar day YYYY-MM-DD (user's timezone). */
function mrfLocalDay(tz) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || mrfClientTimezone(),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  } catch (_) {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
window.mrfLocalDay = mrfLocalDay;

/** «Плейлист дня · 20 ноября» from YYYY-MM-DD / now. */
function mrfFormatLocalDayLabel(day) {
  const raw = String(day || mrfLocalDay() || '');
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  try {
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(y, mo - 1, d));
  } catch (_) {
    return `${String(d).padStart(2, '0')}.${String(mo).padStart(2, '0')}.${y}`;
  }
}
window.mrfFormatLocalDayLabel = mrfFormatLocalDayLabel;

function mrfDayPlaylistTitle(day) {
  const label = mrfFormatLocalDayLabel(day);
  return label ? `Плейлист дня · ${label}` : 'Плейлист дня';
}
window.mrfDayPlaylistTitle = mrfDayPlaylistTitle;

const MRF_REC_CACHE_VER = 9;
const MRF_REC_FEED_SS = 'mrf_rec_feed_v9';
window.__mrfRecCache = window.__mrfRecCache || { localDay: null, data: null, tz: null, ver: 0 };
window.__mrfRecInflight = window.__mrfRecInflight || null;

function mrfRecCacheHasSections(data) {
  return !!(data && Array.isArray(data.sections) && data.sections.length);
}

/** Day cache without artist mixes is incomplete — must refetch (server repairs mixes). */
function mrfRecFeedMissingMixes(data) {
  if (!data || data.guest) return false;
  const sec = (data.sections || []).find((s) => s.id === 'artistMixes');
  return !(sec && Array.isArray(sec.items) && sec.items.length);
}

function readRecCacheFromSession() {
  try {
    const raw = sessionStorage.getItem(MRF_REC_FEED_SS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.localDay || Number(parsed.ver) !== MRF_REC_CACHE_VER) return null;
    if (!mrfRecCacheHasSections(parsed.data)) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function writeRecCache(day, data, tz) {
  const prev = window.__mrfRecCache;
  // Never let guest/empty stomp a good logged-in day cache
  if (
    prev &&
    prev.localDay === day &&
    Number(prev.ver) === MRF_REC_CACHE_VER &&
    mrfRecCacheHasSections(prev.data) &&
    !prev.data.guest
  ) {
    if (!data || data.guest) return;
    if (!mrfRecCacheHasSections(data)) return;
  }
  window.__mrfRecCache = { localDay: day, data, tz, ver: MRF_REC_CACHE_VER };
  try {
    sessionStorage.setItem(
      MRF_REC_FEED_SS,
      JSON.stringify({ localDay: day, data, tz, ver: MRF_REC_CACHE_VER })
    );
  } catch (_) {
    // Quota / private mode — memory cache still used for soft-nav
  }
  try {
    window.dispatchEvent(new CustomEvent('mrf:recs', { detail: { localDay: day } }));
  } catch (_) {}
}

function peekRecommendationsCache() {
  const tz = typeof mrfClientTimezone === 'function' ? mrfClientTimezone() : 'UTC';
  const day = typeof mrfLocalDay === 'function' ? mrfLocalDay(tz) : '';
  let cached = window.__mrfRecCache;
  if (!cached?.data || cached.localDay !== day || Number(cached.ver) !== MRF_REC_CACHE_VER) {
    const fromSs = readRecCacheFromSession();
    if (fromSs && fromSs.localDay === day) {
      window.__mrfRecCache = fromSs;
      cached = fromSs;
    } else {
      cached = null;
    }
  }
  if (cached && cached.localDay === day && mrfRecCacheHasSections(cached.data) && !cached.data.guest) {
    // Incomplete day row (no mixes) → miss so API can repair
    if (mrfRecFeedMissingMixes(cached.data)) return null;
    return cached.data;
  }
  if (cached && cached.localDay === day && cached.data?.guest) {
    return cached.data;
  }
  return null;
}
window.peekRecommendationsCache = peekRecommendationsCache;

/** Prefetch / reuse daily recommendation feed — single-flight, stable until midnight. */
async function prefetchRecommendations(opts) {
  const force = !!(opts && opts.force);
  const tz = mrfClientTimezone();
  const day = mrfLocalDay(tz);
  const loggedIn = typeof mrfIsLoggedIn === 'function' ? mrfIsLoggedIn() : false;

  if (!force) {
    const hit = peekRecommendationsCache();
    if (hit && !!hit.guest === !loggedIn) return hit;
  }

  if (!loggedIn) {
    // Do not clobber today's personal cache if auth is briefly unset
    const existing = peekRecommendationsCache();
    if (existing && !existing.guest) return existing;
    return { ok: true, guest: true, sections: [] };
  }

  if (!force && window.__mrfRecInflight && window.__mrfRecInflight.day === day) {
    return window.__mrfRecInflight.promise;
  }

  const promise = (async () => {
    const q = new URLSearchParams({
      resource: 'home',
      tz,
      day,
      offset: String(-new Date().getTimezoneOffset())
    });
    if (force) q.set('force', '1');
    const res = await fetch(`/api/recommendations?${q}`, { credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (data && data.ok !== false && mrfRecCacheHasSections(data) && !data.guest) {
      writeRecCache(data.localDay || day, data, tz);
    } else if (data && data.ok !== false && !data.guest) {
      // Empty API — keep previous day cache if any
      const prev = peekRecommendationsCache();
      if (prev && !prev.guest) return prev;
    }
    return data;
  })();

  window.__mrfRecInflight = { day, promise };
  try {
    return await promise;
  } finally {
    if (window.__mrfRecInflight && window.__mrfRecInflight.promise === promise) {
      window.__mrfRecInflight = null;
    }
  }
}
window.prefetchRecommendations = prefetchRecommendations;

/** Keep centered boot until auth + library + daily recs are ready (cap ~15s). */
function hidePageBootWhenAuthReady() {
  try { showPageBoot(); } catch (_) {}
  let done = false;
  const finish = async () => {
    if (done) return;
    done = true;
    window.removeEventListener('mrf:auth', onAuth);
    try {
      if (typeof mrfIsLoggedIn === 'function' && mrfIsLoggedIn() && typeof prefetchRecommendations === 'function') {
        const p = prefetchRecommendations();
        // Hide boot by 15s, but let the same single-flight finish and fill cache
        await Promise.race([
          p,
          new Promise((resolve) => setTimeout(resolve, 14000))
        ]);
      }
    } catch (e) {
      console.warn('[NOVALIBER] boot recs', e);
    }
    if (typeof updateTopbarAvatar === 'function') updateTopbarAvatar();
    hidePageBoot();
  };
  const onAuth = () => {
    if (mrfAuthIsReady()) finish();
  };
  if (mrfAuthIsReady()) {
    requestAnimationFrame(() => { finish(); });
    return;
  }
  window.addEventListener('mrf:auth', onAuth);
  setTimeout(() => { finish(); }, 15000);
}
window.hidePageBootWhenAuthReady = hidePageBootWhenAuthReady;

/** Square high-quality avatar for upload (profile 1024 / chrome 256). */
async function prepareAvatarDataUrl(file, size = 1024) {
  const out = Math.max(128, Math.min(1536, Number(size) || 1024));
  let bmp = null;
  try {
    if (typeof createImageBitmap === 'function') {
      bmp = await createImageBitmap(file);
    }
  } catch (_) {}
  if (!bmp) {
    const url = URL.createObjectURL(file);
    try {
      bmp = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('bad image'));
        img.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const iw = bmp.width || bmp.naturalWidth || 0;
  const ih = bmp.height || bmp.naturalHeight || 0;
  if (!iw || !ih) throw new Error('bad image');
  const side = Math.min(iw, ih);
  const sx = Math.floor((iw - side) / 2);
  const sy = Math.floor((ih - side) / 2);
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, sx, sy, side, side, 0, 0, out, out);
  if (typeof bmp.close === 'function') {
    try { bmp.close(); } catch (_) {}
  }
  let dataUrl = '';
  try {
    dataUrl = canvas.toDataURL('image/webp', 0.92);
  } catch (_) {}
  if (!dataUrl || !dataUrl.startsWith('data:image/webp')) {
    dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  }
  return dataUrl;
}
window.prepareAvatarDataUrl = prepareAvatarDataUrl;

// Always refresh chrome avatar when session/profile settles (refresh / soft-nav)
if (!window.__mrfAvatarAuthBound) {
  window.__mrfAvatarAuthBound = true;
  window.addEventListener('mrf:auth', () => {
    if (typeof updateTopbarAvatar === 'function') updateTopbarAvatar();
  });
}

try { showPageBoot(); } catch (_) {}

function showNotif(msg, duration = 1400) {
  const n = document.getElementById('notification');
  if (!n) return;
  // Keep toast on <body> so it stays above modals / player stacking contexts
  if (n.parentElement !== document.body) {
    try { document.body.appendChild(n); } catch (_) {}
  }
  const text = String(msg || '');
  n.innerHTML = `<div class="notification-inner">
    <span class="notification-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M9 18V6l12-3v12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="6" cy="18" r="2.6" stroke="currentColor" stroke-width="1.8"/><circle cx="18" cy="15" r="2.6" stroke="currentColor" stroke-width="1.8"/></svg>
    </span>
    <span class="notification-msg">${typeof escHtml === 'function' ? escHtml(text) : text}</span>
  </div>`;
  n.classList.remove('hidden', 'is-leaving', 'is-show');
  clearTimeout(showNotif._t);
  clearTimeout(showNotif._t2);
  requestAnimationFrame(() => {
    n.classList.add('is-show');
  });
  showNotif._t = setTimeout(() => {
    n.classList.add('is-leaving');
    n.classList.remove('is-show');
    showNotif._t2 = setTimeout(() => {
      n.classList.add('hidden');
      n.classList.remove('is-leaving');
    }, 220);
  }, duration);
}


/* ══════════════════════════════════
   MODALS & PLAYLIST CREATION
══════════════════════════════════ */
let _pendingTrackForPlaylist = null;
let _createPlDraftTracks = [];
let _createPlSearchTimer = null;
let _addTracksPlaylistId = null;
let _addTracksSearchTimer = null;

function notifyLibraryChanged() {
  try {
    if (typeof favourites !== 'undefined') favourites = Store.getFavs();
  } catch (_) {}
  if (typeof updateFavBadge === 'function') updateFavBadge();
  if (typeof syncFavIcons === 'function') syncFavIcons();
  try { renderSidebarPlaylists(); } catch (_) {}

  const page = typeof getPageId === 'function' ? getPageId() : (typeof PAGE !== 'undefined' ? PAGE : '');
  if (page === 'library' && typeof renderLib === 'function') {
    renderLib(typeof _pageLibTab !== 'undefined' ? _pageLibTab : 'all');
  }
  if (page === 'artists' && typeof renderArtistsPage === 'function') renderArtistsPage();
  else if (document.getElementById('artists-grid') && typeof renderArtistsPage === 'function') renderArtistsPage();
  if (page === 'playlists' && typeof renderPlaylistsPage === 'function') renderPlaylistsPage();
  if (page === 'liked' && typeof renderLikedPage === 'function') renderLikedPage();
  if (page === 'playlist' && typeof renderPlaylist === 'function' && typeof _currentPlaylistId !== 'undefined' && _currentPlaylistId) {
    renderPlaylist(_currentPlaylistId);
  }
  if (typeof renderHomePlaylists === 'function') renderHomePlaylists();
}
window.notifyLibraryChanged = notifyLibraryChanged;

function trackCoverOf(t) {
  if (!t) return '';
  return t.cover || t.album?.cover_medium || t.album?.cover || t.picture_medium || '';
}
window.trackCoverOf = trackCoverOf;

function favToTrack(f) {
  const cover = f.cover || f.album?.cover_medium || f.album?.cover || '';
  const deezerId = f.deezerId
    || (String(f.id || '').startsWith('dz_') ? String(f.id).slice(3) : null)
    || (typeof deezerIdOf === 'function' ? deezerIdOf(f) : null)
    || null;
  return {
    id: f.id || (deezerId ? `dz_${deezerId}` : f.id),
    deezerId: deezerId || null,
    title: f.title,
    artistName: f.artist || f.artistName || '',
    artist: { id: f.artistId || f.artist?.id || null, name: f.artist || f.artistName || f.artist?.name || '' },
    cover,
    album: { id: f.albumId || f.album?.id || null, title: f.albumTitle || f.album?.title || '', cover_medium: cover, cover },
    duration: f.duration || 0,
    preview: f.preview || null,
    source: 'deezer'
  };
}

function filterFavsByQuery(q) {
  const query = String(q || '').trim().toLowerCase();
  const favs = Store.getFavs();
  if (!query) return favs;
  return favs.filter(f => {
    const title = String(f.title || '').toLowerCase();
    const artist = String(f.artist || f.artistName || f.artist?.name || '').toLowerCase();
    const album = String(f.albumTitle || f.album?.title || '').toLowerCase();
    return title.includes(query) || artist.includes(query) || album.includes(query);
  });
}

function bindCreatePlaylistSearch() {
  const input = document.getElementById('playlist-track-search');
  if (!input || input.dataset.bound === '1') return;
  input.dataset.bound = '1';
  input.addEventListener('input', () => {
    clearTimeout(_createPlSearchTimer);
    _createPlSearchTimer = setTimeout(() => renderFavPickerCreate(), 80);
  });
}

function bindAddTracksSearch() {
  const input = document.getElementById('add-tracks-search');
  if (!input || input.dataset.bound === '1') return;
  input.dataset.bound = '1';
  input.addEventListener('input', () => {
    clearTimeout(_addTracksSearchTimer);
    _addTracksSearchTimer = setTimeout(() => renderFavPickerAdd(), 80);
  });
}

function showCreatePlaylist() {
  if (typeof mrfRequireLogin === 'function' && !mrfRequireLogin({ message: 'Чтобы создать плейлист, войди в аккаунт' })) return;
  ensurePlaylistModals();
  const modal = document.getElementById('modal-create-playlist');
  const overlay = document.getElementById('modal-overlay');
  const nameInput = document.getElementById('playlist-name-input');
  const searchInput = document.getElementById('playlist-track-search');
  _createPlDraftTracks = [];
  if (_pendingTrackForPlaylist) {
    _createPlDraftTracks.push(_pendingTrackForPlaylist);
  }
  if (nameInput) {
    nameInput.value = '';
    nameInput.classList.remove('is-invalid');
  }
  if (searchInput) searchInput.value = '';
  bindCreatePlaylistSearch();
  renderCreatePlaylistPicked();
  renderFavPickerCreate();
  if (modal) modal.classList.remove('hidden');
  if (overlay) overlay.classList.remove('hidden');
  if (nameInput) setTimeout(() => nameInput.focus(), 50);
}

function dedupeTracksById(list) {
  const seen = new Set();
  return (list || []).filter(t => {
    const id = String(t?.id ?? '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function renderCreatePlaylistPicked() {
  const box = document.getElementById('playlist-picked-tracks');
  if (!box) return;
  _createPlDraftTracks = dedupeTracksById(_createPlDraftTracks);
  if (!_createPlDraftTracks.length) {
    box.innerHTML = `<div class="modal-pl-picked-empty">Выбери треки из избранного ниже</div>`;
    return;
  }
  box.innerHTML = `<div class="modal-pl-picked-label">${_createPlDraftTracks.length} выбрано</div>` +
    _createPlDraftTracks.map((t, i) => {
      const cover = trackCoverOf(t);
      const artist = t.artistName || t.artist?.name || t.artist || '';
      return `<div class="modal-pl-picked-row">
        ${cover ? `<img src="${cover}" alt="" loading="lazy" onerror="this.style.display='none'">` : `<span class="modal-pl-picked-ph"></span>`}
        <span class="modal-pl-picked-meta">
          <span class="modal-pl-picked-title">${escHtml(t.title || '')}</span>
          <span class="modal-pl-picked-artist">${escHtml(artist)}</span>
        </span>
        <button type="button" class="modal-pl-picked-x" onclick="removeCreatePlaylistDraft(${i})" title="Убрать" aria-label="Убрать">✕</button>
      </div>`;
    }).join('');
}

function removeCreatePlaylistDraft(i) {
  _createPlDraftTracks.splice(i, 1);
  renderCreatePlaylistPicked();
  renderFavPickerCreate();
}

function renderFavPickerCreate() {
  const box = document.getElementById('playlist-track-results');
  if (!box) return;
  const q = document.getElementById('playlist-track-search')?.value || '';
  const allFavs = dedupeTracksById(filterFavsByQuery(q).map(favToTrack));
  if (!Store.getFavs().length) {
    box.innerHTML = `<div class="modal-pl-search-hint">В избранном пока пусто</div>`;
    return;
  }
  // PC logic: already-picked tracks stay only in the top selection — no duplicates below
  const pickedIds = new Set(_createPlDraftTracks.map(t => String(t.id)));
  const available = allFavs.filter(t => !pickedIds.has(String(t.id)));
  _src['create_pl_favs'] = available;
  if (!available.length) {
    const hint = String(q || '').trim()
      ? 'Ничего не найдено'
      : (pickedIds.size ? 'Все треки уже выбраны' : 'Ничего не найдено');
    box.innerHTML = `<div class="modal-pl-search-hint">${hint}</div>`;
    return;
  }
  box.innerHTML = available.map((t, i) => {
    const cover = trackCoverOf(t);
    return `<button type="button" class="modal-pl-search-row" onclick="pickCreatePlaylistTrack(${i})">
      ${cover ? `<img src="${cover}" alt="" loading="lazy" onerror="this.style.opacity='0'">` : `<span class="modal-pl-picked-ph"></span>`}
      <span class="modal-pl-picked-meta">
        <span class="modal-pl-picked-title">${escHtml(t.title || '')}</span>
        <span class="modal-pl-picked-artist">${escHtml(t.artist?.name || t.artistName || '')}</span>
      </span>
      <span class="modal-pl-search-add" aria-hidden="true">+</span>
    </button>`;
  }).join('');
}
window.renderFavPickerCreate = renderFavPickerCreate;

function pickCreatePlaylistTrack(i) {
  const t = _src['create_pl_favs']?.[i];
  if (!t) return;
  if (_createPlDraftTracks.some(x => String(x.id) === String(t.id))) return;
  _createPlDraftTracks.push(t);
  renderCreatePlaylistPicked();
  renderFavPickerCreate();
}

function confirmCreatePlaylist() {
  const nameInput = document.getElementById('playlist-name-input');
  const name = nameInput?.value.trim();
  if (!name) {
    if (nameInput) {
      nameInput.classList.add('is-invalid');
      nameInput.focus();
      const clearInvalid = () => {
        nameInput.classList.remove('is-invalid');
        nameInput.removeEventListener('input', clearInvalid);
      };
      nameInput.addEventListener('input', clearInvalid);
    }
    showNotif('Введи название');
    return;
  }
  if (nameInput) nameInput.classList.remove('is-invalid');

  const pl = Store.createPlaylist(name, '');
  if (!pl) {
    showNotif('Не удалось создать плейлист');
    return;
  }
  _createPlDraftTracks.forEach(t => Store.addTrackToPlaylist(pl.id, t));
  if (window._bulkPending?.length) {
    window._bulkPending.forEach(f => Store.addTrackToPlaylist(pl.id, favToTrack(f)));
    window._bulkPending = [];
  }

  _pendingTrackForPlaylist = null;
  _createPlDraftTracks = [];
  closeModal();
  renderSidebarPlaylists();
  notifyLibraryChanged();
  showNotif('Плейлист создан');

  const url = typeof mrfUrl === 'function' ? mrfUrl('playlist', { id: pl.id }) : `playlist.html?id=${encodeURIComponent(pl.id)}`;
  if (typeof mrfGo === 'function') mrfGo(url);
  else location.href = url;
}

function showAddTracksToPlaylist(playlistId) {
  const cur = typeof Store.getPlaylist === 'function' ? Store.getPlaylist(playlistId) : null;
  if (cur && typeof Store.isOwnedPlaylist === 'function' && !Store.isOwnedPlaylist(cur)) return;
  ensurePlaylistModals();
  _addTracksPlaylistId = playlistId;
  const modal = document.getElementById('modal-add-tracks');
  const overlay = document.getElementById('modal-overlay');
  const searchInput = document.getElementById('add-tracks-search');
  if (searchInput) searchInput.value = '';
  bindAddTracksSearch();
  renderFavPickerAdd();
  if (modal) modal.classList.remove('hidden');
  if (overlay) overlay.classList.remove('hidden');
}
window.showAddTracksToPlaylist = showAddTracksToPlaylist;

function renderFavPickerAdd() {
  const box = document.getElementById('add-tracks-results');
  if (!box || !_addTracksPlaylistId) return;
  const pl = Store.getPlaylist(_addTracksPlaylistId);
  const q = document.getElementById('add-tracks-search')?.value || '';
  const favs = filterFavsByQuery(q);
  if (!Store.getFavs().length) {
    box.innerHTML = `<div class="modal-pl-search-hint">В избранном пока пусто</div>`;
    return;
  }
  if (!favs.length) {
    box.innerHTML = `<div class="modal-pl-search-hint">Ничего не найдено</div>`;
    return;
  }
  _src['add_pl_favs'] = dedupeTracksById(favs.map(favToTrack));
  box.innerHTML = _src['add_pl_favs'].map((t, i) => {
    const cover = trackCoverOf(t);
    const inPl = pl?.tracks?.some(x => String(x.id) === String(t.id));
    return `<button type="button" class="modal-pl-search-row${inPl ? ' is-picked' : ''}" onclick="pickAddPlaylistTrack(${i})">
      ${cover ? `<img src="${cover}" alt="" loading="lazy" onerror="this.style.display='none'">` : `<span class="modal-pl-picked-ph"></span>`}
      <span class="modal-pl-picked-meta">
        <span class="modal-pl-picked-title">${escHtml(t.title || '')}</span>
        <span class="modal-pl-picked-artist">${escHtml(t.artist?.name || t.artistName || '')}</span>
      </span>
      <span class="modal-pl-search-add">${inPl ? '✓' : '+'}</span>
    </button>`;
  }).join('');
}
window.renderFavPickerAdd = renderFavPickerAdd;

function pickAddPlaylistTrack(i) {
  const t = _src['add_pl_favs']?.[i];
  if (!t || !_addTracksPlaylistId) return;
  const pl = Store.getPlaylist(_addTracksPlaylistId);
  const inPl = pl?.tracks?.some(x => String(x.id) === String(t.id));
  if (inPl) {
    Store.removeTrackFromPlaylist(_addTracksPlaylistId, t.id);
    showNotif('Убрано из плейлиста');
  } else {
    Store.addTrackToPlaylist(_addTracksPlaylistId, t);
    showNotif('Добавлено в плейлист');
  }
  notifyLibraryChanged();
  renderFavPickerAdd();
}

let _renamePlaylistId = null;
function showRenamePlaylist(id) {
  const cur = typeof Store.getPlaylist === 'function' ? Store.getPlaylist(id) : null;
  if (cur && typeof Store.isOwnedPlaylist === 'function' && !Store.isOwnedPlaylist(cur)) return;
  ensurePlaylistModals();
  const pl = Store.getPlaylist(id);
  if (!pl) return;
  _renamePlaylistId = String(id);
  const modal = document.getElementById('modal-rename-playlist');
  const overlay = document.getElementById('modal-overlay');
  const input = document.getElementById('playlist-rename-input');
  if (input) {
    input.value = pl.name || '';
    setTimeout(() => { input.focus(); input.select(); }, 40);
  }
  if (modal) modal.classList.remove('hidden');
  if (overlay) overlay.classList.remove('hidden');
}
window.showRenamePlaylist = showRenamePlaylist;

function confirmRenamePlaylist() {
  const nameInput = document.getElementById('playlist-rename-input');
  const name = nameInput?.value.trim();
  if (!name) {
    if (nameInput) {
      nameInput.classList.add('is-invalid');
      nameInput.focus();
      const clearInvalid = () => {
        nameInput.classList.remove('is-invalid');
        nameInput.removeEventListener('input', clearInvalid);
      };
      nameInput.addEventListener('input', clearInvalid);
    }
    showNotif('Введи название');
    return;
  }
  if (nameInput) nameInput.classList.remove('is-invalid');
  if (!_renamePlaylistId) return;
  Store.updatePlaylist(_renamePlaylistId, { name });
  const id = _renamePlaylistId;
  _renamePlaylistId = null;
  closeModal();
  if (typeof renderPlaylist === 'function') renderPlaylist(id);
  notifyLibraryChanged();
  renderSidebarPlaylists();
  showNotif('Плейлист переименован');
}
window.confirmRenamePlaylist = confirmRenamePlaylist;

function showAddToPlaylist(track) {
  if (typeof mrfRequireLogin === 'function' && !mrfRequireLogin({ message: 'Чтобы сохранить в плейлист, войди в аккаунт' })) return;
  _pendingTrackForPlaylist = track;
  const modal = document.getElementById('modal-add-to-playlist');
  const overlay = document.getElementById('modal-overlay');
  const list = document.getElementById('modal-playlist-list');
  
  const pls = typeof Store.getOwnedPlaylists === 'function'
    ? Store.getOwnedPlaylists()
    : (Store.getPlaylists() || []).filter((p) => p && p.origin !== 'saved' && !p.readOnly);
  
  if (!pls.length) {
    if (list) list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-3);font-size:13px">
      <p>Нет плейлистов</p>
      <button class="btn-primary" onclick="closeModal();showCreatePlaylist()" style="margin-top:12px;padding:8px 16px;font-size:12px">Создать первый</button>
    </div>`;
  } else {
    if (list) list.innerHTML = pls.map(pl => {
      const inPlaylist = pl.tracks?.some(t => String(t.id) === String(track.id));
      return `<div class="modal-playlist-item${inPlaylist?' added':''}" onclick="toggleTrackInPlaylist('${pl.id}','${track.id}',this)">
        ${pl.cover ? `<img src="${pl.cover}" class="modal-pl-cover" alt="">` : `<div class="modal-pl-cover">${noteSVGShared()}</div>`}
        <div class="modal-pl-info">
          <div class="modal-pl-name">${escHtml(pl.name)}</div>
          <div class="modal-pl-count">${pl.trackCount || pl.tracks?.length || 0} треков</div>
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
  if (!pl || (typeof Store.isOwnedPlaylist === 'function' && !Store.isOwnedPlaylist(pl))) return;
  
  const inPlaylist = pl.tracks?.some(t => String(t.id) === String(trackId));
  
  if (inPlaylist) {
    Store.removeTrackFromPlaylist(playlistId, trackId);
    el.classList.remove('added');
    showNotif('Убрано из плейлиста');
  } else if (_pendingTrackForPlaylist) {
      Store.addTrackToPlaylist(playlistId, _pendingTrackForPlaylist);
    if (window._bulkPending?.length) {
      window._bulkPending.forEach(f => Store.addTrackToPlaylist(playlistId, {
        id: f.id, title: f.title, artistName: f.artist, cover: f.cover, duration: f.duration, preview: f.preview
      }));
      window._bulkPending = [];
    }
      el.classList.add('added');
      showNotif('Добавлено в плейлист');
  }
  
  notifyLibraryChanged();
}

function closeModal() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.add('hidden');
  _pendingTrackForPlaylist = null;
  _addTracksPlaylistId = null;
  _renamePlaylistId = null;
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

function updateNowPlayingPanel(track) {
  if (typeof queue === 'undefined' || typeof queueIndex === 'undefined') return;
  const t = track || queue[queueIndex];
  if (!t) return;
  
  const cover = t.album?.cover_xl || t.album?.cover_medium || t.cover || '';
  const title = t.title || '';
  const artist = t.artist?.name || t.artist || '';
  
  const npCover = document.getElementById('np-cover');
  const npTitle = document.getElementById('np-title');
  const npArtist = document.getElementById('np-artist-name');
  const npArtistCover = document.getElementById('np-artist-cover');
  const npArtistNameBig = document.getElementById('np-artist-name-big');
  
  if (npCover) {
    npCover.style.backgroundImage = cover ? `url("${cover}")` : 'none';
    npCover.style.backgroundSize = 'cover';
    npCover.style.backgroundPosition = 'center';
  }
  if (npTitle) npTitle.textContent = title;
  if (npArtist) npArtist.textContent = artist;
  if (npArtistCover) {
    const pic = t.artist?.picture_xl || t.artist?.picture_medium || '';
    npArtistCover.style.backgroundImage = pic ? `url("${pic}")` : 'none';
    npArtistCover.style.backgroundSize = 'cover';
    npArtistCover.style.backgroundPosition = 'center top';
  }
  if (npArtistNameBig) npArtistNameBig.textContent = artist;

  if (typeof syncRightPanel === 'function') syncRightPanel();
}

/* ══════════════════════════════════
   PLAYER HELPERS
══════════════════════════════════ */
/* toggleFavPlayer is defined in app.js — do not shadow here */

/* ══════════════════════════════════
   END OF SHARED.JS
   Функции плеера (togglePlay, prevTrack, etc.)
   определяются в app.js
══════════════════════════════════ */

