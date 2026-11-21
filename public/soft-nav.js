/* =====================================================
   MRF — soft-nav.js
   In-app navigation without full reload so Audio keeps playing.
   ===================================================== */
(function () {
  if (window.__mrfSoftNav) return;
  window.__mrfSoftNav = true;

  const CORE = new Set(['backend.js', 'mock.js', 'shared.js', 'app.js', 'mrf-ready.js', 'soft-nav.js']);
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
    document.body.classList.toggle('can-go-back', canBack);
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
    if (typeof updateMobileBackFab === 'function') updateMobileBackFab();
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

  /* Mobile-only: remember / restore feed scroll across soft-nav (home ↔ mix/day) */
  const scrollMemory = window.__mrfScrollMemory || Object.create(null);
  window.__mrfScrollMemory = scrollMemory;

  function isMobileUi() {
    try {
      return document.documentElement.getAttribute('data-ui') === 'mobile'
        || window.matchMedia('(max-width: 900px)').matches;
    } catch (_) {
      return false;
    }
  }

  /** Stable key — home URLs vary (/ vs /index.html) */
  function scrollKeyFor(url) {
    const p = pageName(url);
    if (p === 'index' || p === 'home' || p === '') return 'page:index';
    return normUrl(url);
  }

  function readScrollPos() {
    const feed = document.querySelector('main .feed') || document.getElementById('feed');
    const main = document.querySelector('main.main-content, main');
    return {
      feed: feed ? feed.scrollTop : 0,
      main: main ? main.scrollTop : 0,
      win: window.scrollY || window.pageYOffset || 0
    };
  }

  function saveScrollFor(url) {
    if (!isMobileUi()) return;
    const key = scrollKeyFor(url || location.href);
    if (!key) return;
    const pos = readScrollPos();
    scrollMemory[key] = pos;
    // Always keep a dedicated home snapshot when leaving home
    if (key === 'page:index' && (pos.feed > 0 || pos.main > 0 || pos.win > 0)) {
      window.__mrfHomeFeedScroll = pos;
    }
  }

  function applyScrollPos(pos) {
    if (!pos) return;
    const feed = document.querySelector('main .feed') || document.getElementById('feed');
    const main = document.querySelector('main.main-content, main');
    if (feed) feed.scrollTop = pos.feed || 0;
    if (main) main.scrollTop = pos.main || 0;
    if (pos.win) window.scrollTo(0, pos.win);
    if (typeof updateHomeTopbarScroll === 'function') updateHomeTopbarScroll();
  }

  function savedScrollPos(url) {
    const key = scrollKeyFor(url || location.href);
    if (key === 'page:index' && window.__mrfHomeFeedScroll) {
      const h = window.__mrfHomeFeedScroll;
      if ((h.feed || 0) > 0 || (h.main || 0) > 0 || (h.win || 0) > 0) return h;
    }
    return scrollMemory[key] || null;
  }

  function hasSavedScroll(url) {
    if (!isMobileUi()) return false;
    const pos = savedScrollPos(url);
    if (!pos) return false;
    return (pos.feed || 0) > 0 || (pos.main || 0) > 0 || (pos.win || 0) > 0;
  }

  function restoreScrollFor(url) {
    if (!isMobileUi()) return false;
    const key = scrollKeyFor(url || location.href);
    const pos = savedScrollPos(url);
    if (!pos) return false;
    if ((pos.feed || 0) <= 0 && (pos.main || 0) <= 0 && (pos.win || 0) <= 0) return false;

    // One pending restore — home paints async; avoid timeout spam / jump-lag
    window.__mrfPendingScroll = { key, pos, until: Date.now() + 1800 };
    applyScrollPos(pos);
    requestAnimationFrame(() => {
      if (window.__mrfPendingScroll?.key !== key) return;
      applyScrollPos(pos);
    });
    return true;
  }

  /** Re-apply pending restore once (after home paint). No multi-timeout thrash. */
  function flushPendingScroll() {
    if (!isMobileUi()) return false;
    const pending = window.__mrfPendingScroll;
    if (!pending || Date.now() > pending.until) return false;
    if (scrollKeyFor(location.href) !== pending.key) return false;
    applyScrollPos(pending.pos);
    return true;
  }

  window.mrfSavePageScroll = () => saveScrollFor(location.href);
  window.mrfRestorePageScroll = (url) => {
    if (url) return restoreScrollFor(url);
    if (flushPendingScroll()) return true;
    return restoreScrollFor(location.href);
  };
  window.mrfFlushPendingScroll = flushPendingScroll;

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
    // Bump only when leaving (or switching same-type page). Do NOT bump on enter —
    // the page loader bumps its own gen; an enter-bump raced and aborted fresh loads.
    if (fromPage === 'artist') {
      window.__artistLoadGen = (window.__artistLoadGen || 0) + 1;
    }
    if (fromPage === 'album') {
      window.__albumLoadGen = (window.__albumLoadGen || 0) + 1;
    }
    if (toPage !== 'artist') {
      try { sessionStorage.removeItem('mrf_route_artist'); } catch (_) {}
    }
    if (toPage !== 'album') {
      try { sessionStorage.removeItem('mrf_route_album'); } catch (_) {}
    }
    if (toPage !== 'playlist') {
      try { sessionStorage.removeItem('mrf_route_playlist'); } catch (_) {}
    }
    if (toPage !== 'account') {
      try { sessionStorage.removeItem('mrf_route_account'); } catch (_) {}
    }
    window.__mrfNavGen = (window.__mrfNavGen || 0) + 1;
  }

  function rememberRouteParams(absUrl) {
    try {
      const p = pageName(absUrl);
      if (p === 'artist') {
        const id = absUrl.searchParams.get('id') || '';
        const name = absUrl.searchParams.get('name') || '';
        // Don't wipe a good route with empty query (broken href / stripped ?)
        if (!id && !name) {
          try {
            const prev = JSON.parse(sessionStorage.getItem('mrf_route_artist') || '{}');
            if (prev.id || prev.name) return;
          } catch (_) {}
        }
        sessionStorage.setItem('mrf_route_artist', JSON.stringify({ id, name }));
      } else if (p === 'album') {
        const id = absUrl.searchParams.get('id') || '';
        const title = absUrl.searchParams.get('title') || '';
        const artist = absUrl.searchParams.get('artist') || '';
        if (!id && !title && !artist) {
          try {
            const prev = JSON.parse(sessionStorage.getItem('mrf_route_album') || '{}');
            if (prev.id || prev.title) return;
          } catch (_) {}
        }
        sessionStorage.setItem('mrf_route_album', JSON.stringify({ id, title, artist }));
      } else if (p === 'playlist') {
        const id = absUrl.searchParams.get('id') || '';
        if (!id) {
          try {
            const prev = JSON.parse(sessionStorage.getItem('mrf_route_playlist') || '{}');
            if (prev.id) return;
          } catch (_) {}
        }
        if (id) sessionStorage.setItem('mrf_route_playlist', JSON.stringify({ id }));
      } else if (p === 'account') {
        const u = absUrl.searchParams.get('u') || '';
        if (!u) {
          try {
            const prev = JSON.parse(sessionStorage.getItem('mrf_route_account') || '{}');
            if (prev.u) return;
          } catch (_) {}
        }
        if (u) sessionStorage.setItem('mrf_route_account', JSON.stringify({ u }));
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

    // Track which page modules were already cached BEFORE this nav
    const wasCached = (needle) => {
      const src = externals.find(s => String(s).includes(needle));
      if (!src) return false;
      const name = String(src).split('/').pop().split('?')[0];
      return loadedScripts.has(name);
    };
    const searchWasCached = wasCached('search-page');

    for (const src of externals) {
      try { await loadScriptOnce(src); }
      catch (e) { console.warn('[MRF soft-nav] script', e); }
    }

    // Inline page scripts (charts/artist/album/…) — whenDomReady runs immediately
    for (const code of inlines) runInline(code);

    // External page modules: first load auto-boots; later visits need an explicit re-enter.
    // IMPORTANT: do not await Deezer/API page loaders — they block soft-nav for seconds
    const pname = pageName(absUrl);

    if (pname === 'search') {
      const q = absUrl.searchParams.get('q');
      if (typeof bindMobileSearchField === 'function') bindMobileSearchField();
      // Always re-boot search: cached script won't auto-run, and DOM was just replaced
      if (typeof bootSearchPage === 'function') bootSearchPage();
      else if (searchWasCached) {
        if (typeof initSearchPage === 'function') initSearchPage();
        if (q && typeof doSearch === 'function') doSearch(q, { save: true });
        else if (typeof resetSearchHome === 'function') resetSearchHome({ replaceUrl: false });
        else if (typeof showSearchInitial === 'function') showSearchInitial();
      } else if (q && typeof doSearch === 'function') {
        doSearch(q, { save: true });
      }
    } else if (pname === 'library') {
      // HTML always lists library-page.js — must re-boot on every visit or lib-content stays empty
      if (typeof bootLibrary === 'function') bootLibrary();
      else if (typeof renderLib === 'function') renderLib('all');
    } else if (pname === 'playlist' && typeof loadPlaylistPage === 'function') {
      let id = absUrl.searchParams.get('id') || '';
      if (!id) {
        try {
          const saved = JSON.parse(sessionStorage.getItem('mrf_route_playlist') || '{}');
          id = saved.id || '';
        } catch (_) {}
      }
      loadPlaylistPage(id || undefined);
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
        } catch (_) {}
      }
      // Always pass forced object so loadArtistPage won't revive a previous favourite from sessionStorage
      if (typeof window.loadArtistPage === 'function') {
        void window.loadArtistPage({ id, name });
      } else if (typeof openArtist === 'function') {
        void openArtist(id || null, name || '');
      }
    } else if (pname === 'album' && typeof window.loadAlbumPage === 'function') {
      let id = absUrl.searchParams.get('id') || '';
      let title = absUrl.searchParams.get('title') || '';
      let artist = absUrl.searchParams.get('artist') || '';
      if (!id && !title && !artist) {
        try {
          const saved = JSON.parse(sessionStorage.getItem('mrf_route_album') || '{}');
          id = saved.id || '';
          title = saved.title || '';
          artist = saved.artist || '';
        } catch (_) {}
      }
      void window.loadAlbumPage({ id, title, artist });
    } else if (pname === 'artists' && typeof window.renderArtistsPage === 'function') {
      window.renderArtistsPage();
    } else if (pname === 'albums' && typeof window.renderAlbumsPage === 'function') {
      window.renderAlbumsPage();
    } else if (pname === 'profile') {
      // Entering profile from anywhere → public view (strip edit leftover)
      if (absUrl.searchParams.get('edit') !== '1') {
        if (typeof window.showPublicProfileView === 'function') window.showPublicProfileView();
        else if (typeof window.loadProfilePage === 'function') window.loadProfilePage();
      } else if (typeof window.loadProfilePage === 'function') {
        window.loadProfilePage();
      }
    } else if (pname === 'account') {
      let u = absUrl.searchParams.get('u') || '';
      if (!u) {
        try {
          const saved = JSON.parse(sessionStorage.getItem('mrf_route_account') || '{}');
          u = saved.u || '';
        } catch (_) {}
      }
      if (typeof window.loadAccountPage === 'function') window.loadAccountPage(u || undefined);
      else if (typeof window.bootAccountPage === 'function') window.bootAccountPage();
    } else if ((pname === 'index' || pname === '' || pname === 'home') && typeof window.loadHomePage === 'function') {
      window.__mrfHomeBootPromise = Promise.resolve()
        .then(() => window.loadHomePage())
        .catch(() => {});
      if (typeof window.syncHomeFooter === 'function') window.syncHomeFooter();
    } else if (pname === 'charts' && typeof window.loadCharts === 'function') {
      void window.loadCharts();
    } else if (pname === 'premium') {
      if (typeof window.renderPremiumPage === 'function') window.renderPremiumPage();
      else if (typeof window.bootPremiumPage === 'function') window.bootPremiumPage();
      if (typeof window.mrfConfirmBillingPayment === 'function') {
        void window.mrfConfirmBillingPayment({ silent: false }).then(() => {
          if (typeof window.renderPremiumPage === 'function') window.renderPremiumPage();
        });
      }
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
    // Exception: Profile always opens the public view (not settings/edit).
    if (!fromPop && pageName(abs) === 'profile' && pageName(location.href) === 'profile') {
      if (typeof showPublicProfileView === 'function') showPublicProfileView();
      else if (typeof setProfileEditMode === 'function') {
        setProfileEditMode(false);
        if (typeof loadProfilePage === 'function') loadProfilePage();
      } else if (typeof loadProfilePage === 'function') {
        try { history.replaceState(history.state || { mrfSoft: 1 }, '', abs.pathname.endsWith('.html') ? abs.href.replace(/\?.*$/, '') || 'profile.html' : abs.href); } catch (_) {}
        loadProfilePage();
      }
      updateChromeNavButtons();
      return;
    }
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
    // On popstate location already = destination; DOM is still the old page.
    // Never save under the destination key from stale DOM (that wiped home scroll).
    const fromPage = fromPop
      ? pageName(hist.stack[hist.index] || location.href)
      : pageName(location.href);
    const toPage = pageName(abs);
    if (!fromPop) saveScrollFor(location.href);
    const shouldRestoreScroll = hasSavedScroll(abs.href);
    if (shouldRestoreScroll) {
      window.__mrfPendingScroll = {
        key: scrollKeyFor(abs.href),
        pos: savedScrollPos(abs.href),
        until: Date.now() + 1800
      };
    } else {
      window.__mrfPendingScroll = null;
    }
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

      // Home paints async — wait for boot so restore isn't fighting empty layout
      if (shouldRestoreScroll && (toPage === 'index' || toPage === 'home' || toPage === '')) {
        try {
          if (window.__mrfHomeBootPromise) {
            await Promise.race([
              window.__mrfHomeBootPromise,
              new Promise((r) => setTimeout(r, 1200))
            ]);
          }
        } catch (_) {}
      }
      if (token !== navToken) return;

      if (typeof window.renderSidebarPlaylists === 'function') window.renderSidebarPlaylists();

      if (shouldRestoreScroll) {
        restoreScrollFor(abs.href);
        // One calm follow-up after layout — not a burst of jumps
        setTimeout(() => {
          if (token !== navToken) return;
          flushPendingScroll();
        }, 160);
      } else {
        window.__mrfPendingScroll = null;
        curMain.scrollTop = 0;
        const feed = curMain.querySelector('.feed');
        if (feed) feed.scrollTop = 0;
        window.scrollTo(0, 0);
      }
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

  /** Full browser navigation (YooKassa, external, paid return) — bypass soft-nav patch. */
  window.mrfHardNavigate = function (url) {
    const href = String(url || '');
    if (!href) return;
    allowHardNav = true;
    try {
      if (rawAssign) rawAssign.call(location, href);
      else location.assign(href);
    } finally {
      // Keep hard-nav open briefly in case assign is async / redirected
      setTimeout(() => { allowHardNav = false; }, 0);
    }
  };

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
