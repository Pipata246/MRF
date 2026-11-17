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

/** Inline MRF mark — uses currentColor / --accent */
function mrfLogoSVG(size = 52) {
  const s = Number(size) || 52;
  return `<svg class="logo-img" viewBox="0 0 1254 1254" width="${s}" height="${s}" role="img" aria-label="MRF" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <circle cx="626" cy="615" r="603" fill="none" stroke="currentColor" stroke-width="38"/>
    <rect x="429" y="314" width="53" height="158" rx="26.5" ry="26.5"/>
    <rect x="515" y="268" width="53" height="220" rx="26.5" ry="26.5"/>
    <rect x="600" y="193" width="54" height="287" rx="27" ry="27"/>
    <rect x="686" y="268" width="53" height="220" rx="26.5" ry="26.5"/>
    <rect x="772" y="314" width="53" height="158" rx="26.5" ry="26.5"/>
    <text x="626" y="848" text-anchor="middle" font-family="Arial Black, Helvetica Neue, Impact, sans-serif" font-size="310" font-weight="900" font-style="italic" letter-spacing="-14">MRF</text>
  </svg>`;
}
window.mrfLogoSVG = mrfLogoSVG;

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
        ${mrfLogoSVG(52)}
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
    ? `<img src="${profile.avatar}" alt="">`
    : initials;

  root.innerHTML = `
    <header class="topbar">
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
        <button type="button" class="search-clear hidden" id="topbar-search-clear" title="Очистить" aria-label="Очистить">✕</button>
        <div class="search-flyout hidden" id="search-flyout" role="listbox"></div>
      </div>

      <div class="topbar-actions">
        <button type="button" class="topbar-avatar" id="topbar-avatar" onclick="goProfile()" title="Профиль" aria-label="Профиль">${avatarInner}</button>
      </div>
    </header>`;

  updateSearchModeUI();
  bindTopbarSearchFlyout();

  // Restore back/forward active state after topbar rebuild (soft-nav)
  if (typeof updateChromeNavButtons === 'function') updateChromeNavButtons();
  else if (typeof updateNavBtns === 'function') updateNavBtns();
}

function updateTopbarAvatar() {
  const btn = document.getElementById('topbar-avatar');
  if (!btn) return;
  const profile = Store.getProfile();
  if (profile.avatar) {
    btn.innerHTML = `<img src="${profile.avatar}" alt="">`;
  } else {
    btn.textContent = (profile.name || 'П')[0].toUpperCase();
  }
  btn.title = profile.name || 'Профиль';
}
window.updateTopbarAvatar = updateTopbarAvatar;

function isSearchPage() {
  const path = (location.pathname || '').replace(/\/+$/, '');
  return /(?:^|\/)search(?:\.html)?$/i.test(path);
}

function updateSearchModeUI() {
  document.body.classList.toggle('is-search-page', isSearchPage());
  if (isSearchPage()) closeSearchFlyout();
}

function goProfile() {
  const url = typeof mrfUrl === 'function' ? mrfUrl('profile') : 'profile.html';
  if (typeof mrfGo === 'function') mrfGo(url);
  else location.href = url;
}

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

function openArtistFromFlyout(id, name) {
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
        <div class="modal-pl-add-block">
          <label class="modal-pl-add-label">Из избранного</label>
          <input type="text" class="modal-input" id="playlist-track-search" placeholder="Фильтр по избранному…" maxlength="80" oninput="renderFavPickerCreate()"/>
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
        <input type="text" class="modal-input" id="add-tracks-search" placeholder="Фильтр по избранному…" maxlength="80" oninput="renderFavPickerAdd()"/>
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
  const needCreate = !document.getElementById('playlist-track-search')
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

function injectPlayer() {
  const root = document.getElementById('player-root');
  if (!root) return;
  // Never rebuild player DOM while soft-navigating — that would glitch audio UX
  if (root.querySelector('.player')) {
    ensurePlaylistModals();
    return;
  }

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
    ${playlistModalsHTML()}
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
  ensurePlaylistModals();

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
  if (page === 'playlists' && typeof renderPlaylistsPage === 'function') renderPlaylistsPage();
  if (page === 'liked' && typeof renderLikedPage === 'function') renderLikedPage();
  if (page === 'playlist' && typeof renderPlaylist === 'function' && typeof _currentPlaylistId !== 'undefined' && _currentPlaylistId) {
    renderPlaylist(_currentPlaylistId);
  }
  if (typeof renderHomePlaylists === 'function') renderHomePlaylists();
}
window.notifyLibraryChanged = notifyLibraryChanged;

function favToTrack(f) {
  return {
    id: f.id,
    title: f.title,
    artistName: f.artist,
    artist: { id: f.artistId || null, name: f.artist },
    cover: f.cover,
    album: { id: f.albumId || null, title: f.albumTitle || '', cover_medium: f.cover },
    duration: f.duration || 0,
    preview: f.preview || null
  };
}

function filterFavsByQuery(q) {
  const query = String(q || '').trim().toLowerCase();
  const favs = Store.getFavs();
  if (!query) return favs;
  return favs.filter(f =>
    String(f.title || '').toLowerCase().includes(query) ||
    String(f.artist || '').toLowerCase().includes(query)
  );
}

function showCreatePlaylist() {
  ensurePlaylistModals();
  const modal = document.getElementById('modal-create-playlist');
  const overlay = document.getElementById('modal-overlay');
  const nameInput = document.getElementById('playlist-name-input');
  const searchInput = document.getElementById('playlist-track-search');
  _createPlDraftTracks = [];
  if (_pendingTrackForPlaylist) {
    _createPlDraftTracks.push(_pendingTrackForPlaylist);
  }
  if (nameInput) nameInput.value = '';
  if (searchInput) searchInput.value = '';
  renderCreatePlaylistPicked();
  renderFavPickerCreate();
  if (modal) modal.classList.remove('hidden');
  if (overlay) overlay.classList.remove('hidden');
  if (nameInput) setTimeout(() => nameInput.focus(), 50);
}

function renderCreatePlaylistPicked() {
  const box = document.getElementById('playlist-picked-tracks');
  if (!box) return;
  if (!_createPlDraftTracks.length) {
    box.innerHTML = `<div class="modal-pl-picked-empty">Выбери треки из избранного ниже</div>`;
    return;
  }
  box.innerHTML = _createPlDraftTracks.map((t, i) => {
    const cover = t.cover || t.album?.cover_medium || '';
    const artist = t.artistName || t.artist?.name || t.artist || '';
    return `<div class="modal-pl-picked-row">
      ${cover ? `<img src="${cover}" alt="">` : `<span class="modal-pl-picked-ph"></span>`}
      <span class="modal-pl-picked-meta">
        <span class="modal-pl-picked-title">${escHtml(t.title || '')}</span>
        <span class="modal-pl-picked-artist">${escHtml(artist)}</span>
      </span>
      <button type="button" class="modal-pl-picked-x" onclick="removeCreatePlaylistDraft(${i})" title="Убрать">✕</button>
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
  const favs = filterFavsByQuery(q);
  if (!Store.getFavs().length) {
    box.innerHTML = `<div class="modal-pl-search-hint">В избранном пока пусто — добавь треки сердечком</div>`;
    return;
  }
  if (!favs.length) {
    box.innerHTML = `<div class="modal-pl-search-hint">Ничего не найдено в избранном</div>`;
    return;
  }
  _src['create_pl_favs'] = favs.map(favToTrack);
  box.innerHTML = _src['create_pl_favs'].map((t, i) => {
    const cover = t.cover || '';
    const picked = _createPlDraftTracks.some(x => String(x.id) === String(t.id));
    return `<button type="button" class="modal-pl-search-row${picked ? ' is-picked' : ''}" onclick="pickCreatePlaylistTrack(${i})">
      ${cover ? `<img src="${cover}" alt="">` : `<span class="modal-pl-picked-ph"></span>`}
      <span class="modal-pl-picked-meta">
        <span class="modal-pl-picked-title">${escHtml(t.title || '')}</span>
        <span class="modal-pl-picked-artist">${escHtml(t.artist?.name || '')}</span>
      </span>
      <span class="modal-pl-search-add">${picked ? '✓' : '+'}</span>
    </button>`;
  }).join('');
}
window.renderFavPickerCreate = renderFavPickerCreate;

function pickCreatePlaylistTrack(i) {
  const t = _src['create_pl_favs']?.[i];
  if (!t) return;
  const idx = _createPlDraftTracks.findIndex(x => String(x.id) === String(t.id));
  if (idx >= 0) _createPlDraftTracks.splice(idx, 1);
  else _createPlDraftTracks.push(t);
  renderCreatePlaylistPicked();
  renderFavPickerCreate();
}

function confirmCreatePlaylist() {
  const name = document.getElementById('playlist-name-input')?.value.trim();
  if (!name) { showNotif('Введи название'); return; }

  const pl = Store.createPlaylist(name, '');
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
  ensurePlaylistModals();
  _addTracksPlaylistId = playlistId;
  const modal = document.getElementById('modal-add-tracks');
  const overlay = document.getElementById('modal-overlay');
  const input = document.getElementById('add-tracks-search');
  if (input) input.value = '';
  renderFavPickerAdd();
  if (modal) modal.classList.remove('hidden');
  if (overlay) overlay.classList.remove('hidden');
  if (input) setTimeout(() => input.focus(), 50);
}
window.showAddTracksToPlaylist = showAddTracksToPlaylist;

function renderFavPickerAdd() {
  const box = document.getElementById('add-tracks-results');
  if (!box || !_addTracksPlaylistId) return;
  const q = document.getElementById('add-tracks-search')?.value || '';
  const pl = Store.getPlaylist(_addTracksPlaylistId);
  const favs = filterFavsByQuery(q);
  if (!Store.getFavs().length) {
    box.innerHTML = `<div class="modal-pl-search-hint">В избранном пока пусто</div>`;
    return;
  }
  if (!favs.length) {
    box.innerHTML = `<div class="modal-pl-search-hint">Ничего не найдено в избранном</div>`;
    return;
  }
  _src['add_pl_favs'] = favs.map(favToTrack);
  box.innerHTML = _src['add_pl_favs'].map((t, i) => {
    const cover = t.cover || '';
    const inPl = pl?.tracks?.some(x => String(x.id) === String(t.id));
    return `<button type="button" class="modal-pl-search-row${inPl ? ' is-picked' : ''}" onclick="pickAddPlaylistTrack(${i})">
      ${cover ? `<img src="${cover}" alt="">` : `<span class="modal-pl-picked-ph"></span>`}
      <span class="modal-pl-picked-meta">
        <span class="modal-pl-picked-title">${escHtml(t.title || '')}</span>
        <span class="modal-pl-picked-artist">${escHtml(t.artist?.name || '')}</span>
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
  const name = document.getElementById('playlist-rename-input')?.value.trim();
  if (!name) { showNotif('Введи название'); return; }
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
  if (!pl) return;

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

