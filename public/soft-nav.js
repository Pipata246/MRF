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
  let hrefPatchInstalled = false;
  let allowHardNav = false;
  let rawAssign = null;
  let rawReplace = null;
  let rawHrefSet = null;

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
      s.src = src;
      s.onload = () => { loadedScripts.add(name); resolve(); };
      s.onerror = () => reject(new Error('script ' + src));
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
      await loadScriptOnce(src);
    }

    // Inline page scripts (charts/artist/album/…) — whenDomReady runs immediately
    for (const code of inlines) runInline(code);

    // External page modules: first load auto-boots; later visits need a re-enter
    const pname = pageName(absUrl);
    const justLoadedSearch = externals.some(s => String(s).includes('search-page'));
    const justLoadedLib = externals.some(s => String(s).includes('library-page'));

    if (pname === 'search' && typeof bootSearchPage === 'function' && !justLoadedSearch) {
      if (typeof initSearchPage === 'function') initSearchPage();
      const q = absUrl.searchParams.get('q');
      if (q && typeof doSearch === 'function') doSearch(q);
      else if (typeof showSearchInitial === 'function') showSearchInitial();
    } else if (pname === 'library' && typeof bootLibrary === 'function' && !justLoadedLib) {
      bootLibrary();
    }
  }

  async function softNavigate(url, opts = {}) {
    const replace = !!opts.replace;
    let abs;
    try { abs = new URL(url, location.href); } catch { location.assign(url); return; }

    if (!isInternalUrl(abs.href)) {
      location.assign(abs.href);
      return;
    }

    // same document
    if (abs.pathname === location.pathname && abs.search === location.search) {
      if (abs.hash) location.hash = abs.hash;
      return;
    }

    if (busy) return;
    busy = true;
    window.__mrfSoftNavigating = true;

    try {
      const res = await fetch(abs.href, { credentials: 'same-origin', cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      const newMain = doc.querySelector('main.main-content, main');
      const curMain = document.querySelector('main.main-content, main');
      if (!newMain || !curMain) throw new Error('missing main');

      // Keep sidebar-root + player-root untouched — Audio keeps playing
      document.title = doc.title || document.title;
      if (replace) history.replaceState({ mrfSoft: 1 }, '', abs.href);
      else history.pushState({ mrfSoft: 1 }, '', abs.href);

      curMain.innerHTML = newMain.innerHTML;

      // Refresh chrome inside main + sidebar active state (no player rebuild)
      if (typeof initShared === 'function') initShared();
      else {
        if (typeof injectTopbar === 'function') injectTopbar();
        if (typeof updateSidebarActive === 'function') updateSidebarActive(pageName(abs.href));
      }

      await bootFetchedPage(doc, abs);

      curMain.scrollTop = 0;
      window.scrollTo(0, 0);
      if (typeof updateFavBadge === 'function') updateFavBadge();
      if (typeof syncFavIcons === 'function') syncFavIcons();
    } catch (err) {
      console.warn('[MRF soft-nav] fallback hard nav', err);
      window.__mrfSoftNavigating = false;
      busy = false;
      allowHardNav = true;
      try { (rawAssign || Location.prototype.assign).call(location, abs.href); }
      finally { allowHardNav = false; }
      return;
    }

    window.__mrfSoftNavigating = false;
    busy = false;
  }

  window.mrfGo = softNavigate;
  window.softNavigate = softNavigate;

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
    softNavigate(location.href, { replace: true });
  });

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
