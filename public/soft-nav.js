/* =====================================================
   MRF — soft-nav.js
   In-app navigation without full reload so Audio keeps playing.
   ===================================================== */
(function () {
  if (window.__mrfSoftNav) return;
  window.__mrfSoftNav = true;

  const CORE = new Set(['mock.js', 'shared.js', 'app.js', 'mrf-ready.js', 'soft-nav.js']);
  const loadedScripts = new Set(
    [...document.querySelectorAll('script[src]')].map(s => {
      try { return new URL(s.src, location.href).pathname.split('/').pop(); } catch { return ''; }
    }).filter(Boolean)
  );

  let busy = false;
  let navToken = 0;
  let pendingNav = null;
  let hrefPatchInstalled = false;
  let allowHardNav = false;
  let rawAssign = null;
  let rawReplace = null;
  let rawHrefSet = null;

  function normUrl(href) {
    try {
      const u = new URL(href, location.href);
      let path = u.pathname.replace(/\/index\.html$/i, '/').replace(/\.html$/i, '');
      if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
      if (!path) path = '/';
      return path + u.search;
    } catch {
      return String(href || '');
    }
  }

  // Soft-nav history for back/forward button chrome (browser History API has no canGoBack)
  const hist = window.__mrfSoftHist || {
    stack: [normUrl(location.href)],
    index: 0
  };
  window.__mrfSoftHist = hist;

  function updateChromeNavButtons() {
    const back = document.getElementById('btn-nav-back');
    const fwd = document.getElementById('btn-nav-fwd');
    const canBack = hist.index > 0;
    const canFwd = hist.index < hist.stack.length - 1;
    if (back) {
      back.style.opacity = canBack ? '1' : '0.4';
      back.classList.toggle('is-disabled', !canBack);
      back.setAttribute('aria-disabled', canBack ? 'false' : 'true');
    }
    if (fwd) {
      fwd.style.opacity = canFwd ? '1' : '0.4';
      fwd.classList.toggle('is-disabled', !canFwd);
      fwd.setAttribute('aria-disabled', canFwd ? 'false' : 'true');
    }
  }
  window.updateChromeNavButtons = updateChromeNavButtons;

  function recordHistory(url, { replace = false, fromPop = false } = {}) {
    const n = normUrl(url);
    if (fromPop) {
      const found = hist.stack.lastIndexOf(n);
      if (found >= 0) hist.index = found;
      else {
        hist.stack = hist.stack.slice(0, hist.index + 1);
        hist.stack.push(n);
        hist.index = hist.stack.length - 1;
      }
    } else if (replace) {
      hist.stack[hist.index] = n;
    } else {
      if (hist.stack[hist.index] === n) {
        updateChromeNavButtons();
        return;
      }
      hist.stack = hist.stack.slice(0, hist.index + 1);
      hist.stack.push(n);
      hist.index = hist.stack.length - 1;
    }
    updateChromeNavButtons();
  }

  function pageName(url) {
    return (typeof getPageId === 'function' ? getPageId(url) : 'index');
  }

  function isInternalUrl(url) {
    try {
      const u = new URL(url, location.href);
      if (u.origin !== location.origin) return false;
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
      const path = u.pathname || '/';
      // allow html pages and clean urls under site root
      if (/\.(png|jpe?g|gif|webp|svg|css|js|json|ico|map|mp3|woff2?)$/i.test(path)) return false;
      return true;
    } catch {
      return false;
    }
  }

  function loadScriptOnce(src) {
    const name = String(src).split('/').pop().split('?')[0];
    if (loadedScripts.has(name)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      const timer = setTimeout(() => {
        s.remove();
        reject(new Error('script timeout ' + src));
      }, 8000);
      s.src = src;
      s.onload = () => { clearTimeout(timer); loadedScripts.add(name); resolve(); };
      s.onerror = () => { clearTimeout(timer); reject(new Error('script ' + src)); };
      document.head.appendChild(s);
    });
  }

  function runInline(code) {
    if (!code || !code.trim()) return;
    // Allow re-running page scripts that use let/const
    const rewritten = code
      .replace(/\blet\s+/g, 'var ')
      .replace(/\bconst\s+/g, 'var ');
    const s = document.createElement('script');
    s.textContent = rewritten;
    document.body.appendChild(s);
    s.remove();
  }

  /** Page-specific <style> / extra CSS from fetched document head */
  function applyPageAssets(doc, pageId) {
    document.querySelectorAll('style[data-mrf-page]').forEach(el => el.remove());
    doc.querySelectorAll('head style').forEach((st, i) => {
      const css = (st.textContent || '').trim();
      if (!css) return;
      const el = document.createElement('style');
      el.setAttribute('data-mrf-page', pageId || ('p' + i));
      el.textContent = css;
      document.head.appendChild(el);
    });
    doc.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
      const href = link.getAttribute('href');
      if (!href) return;
      const name = href.split('/').pop().split('?')[0];
      if (/^style\.css$/i.test(name)) return;
      if (document.querySelector(`link[data-mrf-page-css="${name}"]`)) return;
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      l.setAttribute('data-mrf-page-css', name);
      document.head.appendChild(l);
    });
  }

  /** Cancel in-flight artist/album renders only when leaving those pages */
  function cancelLoadsWhenLeaving(fromPage, toPage) {
    if (fromPage === 'artist' && toPage !== 'artist') {
      window.__artistLoadGen = (window.__artistLoadGen || 0) + 1;
    }
    if (fromPage === 'album' && toPage !== 'album') {
      window.__albumLoadGen = (window.__albumLoadGen || 0) + 1;
    }
    window.__mrfNavGen = (window.__mrfNavGen || 0) + 1;
  }

  function rememberRouteParams(absUrl) {
    try {
      const p = pageName(absUrl);
      if (p === 'artist') {
        sessionStorage.setItem('mrf_route_artist', JSON.stringify({
          id: absUrl.searchParams.get('id') || '',
          name: absUrl.searchParams.get('name') || ''
        }));
      } else if (p === 'album') {
        sessionStorage.setItem('mrf_route_album', JSON.stringify({
          id: absUrl.searchParams.get('id') || '',
          title: absUrl.searchParams.get('title') || '',
          artist: absUrl.searchParams.get('artist') || ''
        }));
      }
    } catch {}
  }

  async function bootFetchedPage(doc, absUrl) {
    const scripts = [...doc.querySelectorAll('script')];
    const externals = [];
    const inlines = [];

    for (const sc of scripts) {
      const src = sc.getAttribute('src');
      if (src) {
        const name = src.split('/').pop().split('?')[0];
        if (CORE.has(name)) continue;
        externals.push(src);
      } else if ((sc.textContent || '').trim()) {
        inlines.push(sc.textContent);
      }
    }

    for (const src of externals) {
      try { await loadScriptOnce(src); }
      catch (e) { console.warn('[MRF soft-nav] script', e); }
    }

    // Inline page scripts (charts/artist/album/…) — whenDomReady runs immediately
    for (const code of inlines) runInline(code);

    // External page modules: first load auto-boots; later visits need a re-enter
    // IMPORTANT: do not await Deezer/API page loaders — they block soft-nav for seconds
    const pname = pageName(absUrl);
    const justLoadedSearch = externals.some(s => String(s).includes('search-page'));
    const justLoadedLib = externals.some(s => String(s).includes('library-page'));

    if (pname === 'search') {
      const q = absUrl.searchParams.get('q');
      if (typeof bindMobileSearchField === 'function') bindMobileSearchField();
      if (!justLoadedSearch && typeof bootSearchPage === 'function') {
        // re-enter search without reloading search-page.js
        if (typeof initSearchPage === 'function') initSearchPage();
        if (q && typeof doSearch === 'function') doSearch(q, { save: true });
        else if (typeof resetSearchHome === 'function') resetSearchHome({ replaceUrl: false });
        else if (typeof showSearchInitial === 'function') showSearchInitial();
      } else if (justLoadedSearch && q && typeof doSearch === 'function') {
        // script just loaded & may have booted; ensure query still applied
        doSearch(q, { save: true });
      }
    } else if (pname === 'library' && typeof bootLibrary === 'function' && !justLoadedLib) {
      bootLibrary();
    } else if (pname === 'playlist' && typeof loadPlaylistPage === 'function') {
      loadPlaylistPage();
    } else if (pname === 'playlists' && typeof renderPlaylistsPage === 'function') {
      renderPlaylistsPage();
    } else if (pname === 'liked' && typeof renderLikedPage === 'function') {
      renderLikedPage();
    } else if (pname === 'artist') {
      let id = absUrl.searchParams.get('id') || '';
      let name = absUrl.searchParams.get('name') || '';
      if (!id && !name) {
        try {
          const saved = JSON.parse(sessionStorage.getItem('mrf_route_artist') || '{}');
          id = saved.id || '';
          name = saved.name || '';
        } catch {}
      }
      if (typeof window.loadArtistPage === 'function') {
        void window.loadArtistPage({ id, name });
      } else if (typeof openArtist === 'function') {
        void openArtist(id || null, name || '');
      }
    } else if (pname === 'album' && typeof window.loadAlbumPage === 'function') {
      let id = absUrl.searchParams.get('id') || '';
      let title = absUrl.searchParams.get('title') || '';
      let artist = absUrl.searchParams.get('artist') || '';
      if (!id && !title) {
        try {
          const saved = JSON.parse(sessionStorage.getItem('mrf_route_album') || '{}');
          id = saved.id || '';
          title = saved.title || '';
          artist = saved.artist || '';
        } catch {}
      }
      void window.loadAlbumPage({ id, title, artist });
    } else if (pname === 'artists' && typeof window.renderArtistsPage === 'function') {
      window.renderArtistsPage();
    } else if (pname === 'albums' && typeof window.renderAlbumsPage === 'function') {
      window.renderAlbumsPage();
    } else if (pname === 'profile' && typeof window.loadProfilePage === 'function') {
      window.loadProfilePage();
    } else if ((pname === 'index' || pname === '' || pname === 'home') && typeof window.loadHomePage === 'function') {
      void window.loadHomePage();
    } else if (pname === 'charts' && typeof window.loadCharts === 'function') {
      void window.loadCharts();
    }
  }

  async function softNavigate(url, opts = {}) {
    const replace = !!opts.replace;
    const fromPop = !!opts.fromPop;
    let abs;
    try { abs = new URL(url, location.href); } catch { location.assign(url); return; }

    if (!isInternalUrl(abs.href)) {
      location.assign(abs.href);
      return;
    }

    // Same URL in address bar: skip only for ordinary navigations.
    // On popstate (back/forward) location already changed, but main content is still the old page — must fetch.
    // Exception: re-clicking Search while already there resets to search home.
    if (!fromPop && abs.pathname === location.pathname && abs.search === location.search) {
      if (pageName(abs) === 'search') {
        if (typeof resetSearchHome === 'function') resetSearchHome({ replaceUrl: true });
        else if (typeof clearSearchInput === 'function') clearSearchInput();
        else if (typeof showSearchInitial === 'function') showSearchInitial();
      }
      if (abs.hash) location.hash = abs.hash;
      updateChromeNavButtons();
      return;
    }

    // If a nav is in flight, queue the latest target instead of dropping clicks
    if (busy) {
      pendingNav = { url: abs.href, opts: { replace, fromPop } };
      return;
    }

    const token = ++navToken;
    busy = true;
    window.__mrfSoftNavigating = true;
    const fromPage = pageName(location.href);
    const toPage = pageName(abs);
    cancelLoadsWhenLeaving(fromPage, toPage);
    rememberRouteParams(abs);

    try {
      const res = await fetch(abs.href, { credentials: 'same-origin', cache: 'no-cache' });
      if (token !== navToken) return;
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const html = await res.text();
      if (token !== navToken) return;
      const doc = new DOMParser().parseFromString(html, 'text/html');

      const newMain = doc.querySelector('main.main-content, main');
      const curMain = document.querySelector('main.main-content, main');
      if (!newMain || !curMain) throw new Error('missing main');

      // Keep sidebar-root + player-root untouched — Audio keeps playing
      document.title = doc.title || document.title;
      // Prefer URL with query (some static servers strip ? on clean /artist redirects)
      const stateUrl = abs.href;
      if (!fromPop) {
        if (replace) history.replaceState({ mrfSoft: 1 }, '', stateUrl);
        else history.pushState({ mrfSoft: 1 }, '', stateUrl);
      }
      recordHistory(stateUrl, { replace: replace && !fromPop, fromPop });

      applyPageAssets(doc, toPage);
      curMain.innerHTML = newMain.innerHTML;

      // Refresh chrome inside main + sidebar active state (no player rebuild)
      if (typeof initShared === 'function') initShared();
      else {
        if (typeof injectTopbar === 'function') injectTopbar();
        if (typeof updateSidebarActive === 'function') updateSidebarActive(pageName(abs.href));
      }
      if (typeof applyThemeFromSettings === 'function') applyThemeFromSettings();
      if (typeof window.renderSidebarPlaylists === 'function') window.renderSidebarPlaylists();
      updateChromeNavButtons();

      await bootFetchedPage(doc, abs);
      if (token !== navToken) return;

      if (typeof window.renderSidebarPlaylists === 'function') window.renderSidebarPlaylists();

      curMain.scrollTop = 0;
      const feed = curMain.querySelector('.feed');
      if (feed) feed.scrollTop = 0;
      window.scrollTo(0, 0);
      if (typeof updateFavBadge === 'function') updateFavBadge();
      if (typeof syncFavIcons === 'function') syncFavIcons();
      if (typeof syncPlayingRows === 'function') syncPlayingRows();
      if (typeof updateSearchModeUI === 'function') updateSearchModeUI();
      if (typeof updateMobileNavActive === 'function') updateMobileNavActive(toPage);
      if (typeof updateTopbarAvatar === 'function') updateTopbarAvatar();
      updateChromeNavButtons();
    } catch (err) {
      console.warn('[MRF soft-nav] fallback hard nav', err);
      window.__mrfSoftNavigating = false;
      busy = false;
      pendingNav = null;
      allowHardNav = true;
      try { (rawAssign || Location.prototype.assign).call(location, abs.href); }
      finally { allowHardNav = false; }
      return;
    } finally {
      if (token === navToken) {
        window.__mrfSoftNavigating = false;
        busy = false;
        const next = pendingNav;
        pendingNav = null;
        if (next) {
          // Defer so finally settles before next nav
          setTimeout(() => softNavigate(next.url, next.opts), 0);
        }
      }
    }
  }

  window.mrfGo = softNavigate;
  window.softNavigate = softNavigate;

  /** Topbar back/forward — browser history triggers popstate; fallback if no-op */
  window.mrfHistoryBack = function () {
    if (hist.index <= 0) return;
    const before = normUrl(location.href);
    history.back();
    setTimeout(() => {
      // popstate already handled navigation if URL changed
      if (normUrl(location.href) === before && hist.index > 0) {
        hist.index--;
        softNavigate(hist.stack[hist.index], { replace: true, fromPop: true });
      }
    }, 40);
  };

  window.mrfHistoryForward = function () {
    if (hist.index >= hist.stack.length - 1) return;
    const before = normUrl(location.href);
    history.forward();
    setTimeout(() => {
      if (normUrl(location.href) === before && hist.index < hist.stack.length - 1) {
        hist.index++;
        softNavigate(hist.stack[hist.index], { replace: true, fromPop: true });
      }
    }, 40);
  };

  function shouldInterceptAnchor(a, e) {
    if (!a || !a.getAttribute('href')) return false;
    if (a.target && a.target !== '_self') return false;
    if (a.hasAttribute('download')) return false;
    if (e.defaultPrevented) return false;
    if (e.button !== 0) return false;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return false;
    return isInternalUrl(a.href);
  }

  document.addEventListener('click', e => {
    const a = e.target.closest?.('a[href]');
    if (!shouldInterceptAnchor(a, e)) return;
    e.preventDefault();
    softNavigate(a.href);
  }, true);

  window.addEventListener('popstate', () => {
    softNavigate(location.href, { replace: true, fromPop: true });
  });

  // Initial chrome state
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateChromeNavButtons);
  } else {
    updateChromeNavButtons();
  }

  // Catch location.href = '…' / assign / replace used by onclick handlers
  function installLocationPatch() {
    if (hrefPatchInstalled) return;
    hrefPatchInstalled = true;

    rawAssign = Location.prototype.assign;
    rawReplace = Location.prototype.replace;

    Location.prototype.assign = function (url) {
      if (!allowHardNav && isInternalUrl(url)) softNavigate(url);
      else rawAssign.call(this, url);
    };
    Location.prototype.replace = function (url) {
      if (!allowHardNav && isInternalUrl(url)) softNavigate(url, { replace: true });
      else rawReplace.call(this, url);
    };

    try {
      const desc = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
      if (desc && desc.set && desc.get) {
        rawHrefSet = desc.set;
        Object.defineProperty(Location.prototype, 'href', {
          configurable: true,
          enumerable: true,
          get() { return desc.get.call(this); },
          set(v) {
            if (!allowHardNav && isInternalUrl(v)) softNavigate(v);
            else desc.set.call(this, v);
          }
        });
      }
    } catch (e) {
      console.warn('[MRF soft-nav] href patch skipped', e);
    }
  }

  installLocationPatch();
})();
