/* MRF — search-page.js (external to avoid let collisions with app.js) */
var _searchPageTimer = null;
var _searchPageResults = { tracks: [], artists: [], albums: [] };

function syncMobileSearchInput(query) {
  const mob = document.getElementById('mobile-search-input');
  if (mob && mob.value !== (query || '')) mob.value = query || '';
  syncMobileSearchClear(query);
}

function syncMobileSearchClear(query) {
  const q = (query != null ? query : (document.getElementById('mobile-search-input')?.value || '')).trim();
  document.getElementById('mobile-search-clear')?.classList.toggle('hidden', !q);
  document.getElementById('topbar-search-clear')?.classList.toggle('hidden', !q);
}

function closeMobileSearchFlyout() {
  document.getElementById('mobile-search-flyout')?.classList.add('hidden');
}
window.closeMobileSearchFlyout = closeMobileSearchFlyout;

var _mobileFlyoutGen = 0;

async function renderMobileSearchFlyout(q) {
  const fly = document.getElementById('mobile-search-flyout');
  if (!fly) return;
  const query = (q || '').trim();
  const gen = ++_mobileFlyoutGen;

  if (!query) {
    closeMobileSearchFlyout();
    return;
  }

  fly.classList.remove('hidden');
  fly.innerHTML = `<div class="search-flyout-empty">Ищем…</div>`;
  try {
    const [tracks, artists, albums] = await Promise.all([
      dzArr(`/search/track?q=${encodeURIComponent(query)}&limit=5`),
      dzArr(`/search/artist?q=${encodeURIComponent(query)}&limit=4`),
      dzArr(`/search/album?q=${encodeURIComponent(query)}&limit=3`)
    ]);
    if (gen !== _mobileFlyoutGen) return;
    const tNorm = (tracks || []).map(normDZ);
    const aList = artists || [];
    const albList = albums || [];
    if (!tNorm.length && !aList.length && !albList.length) {
      fly.innerHTML = `<div class="search-flyout-empty">Ничего не найдено</div>
        <button type="button" class="search-flyout-row search-flyout-more" onclick="commitMobileSearch('${jsStr(query)}')">Искать «${escHtml(query)}»</button>`;
      return;
    }
    let html = `<div class="search-flyout-hint"><span>Быстрый поиск</span><kbd>Enter</kbd><span>— все результаты</span></div>`;
    if (aList.length) {
      html += `<div class="search-flyout-label">Артисты</div>` + aList.map(a => `
        <button type="button" class="search-flyout-row" onclick="closeMobileSearchFlyout();openArtist(${a.id != null && String(a.id) !== '' ? `'${jsStr(a.id)}'` : 'null'},'${jsStr(a.name)}')">
          ${a.picture_medium ? `<img class="search-flyout-avatar" src="${a.picture_medium}" alt="">` : `<span class="search-flyout-avatar ph">${escHtml((a.name || '?')[0])}</span>`}
          <span class="search-flyout-meta"><span class="search-flyout-title">${escHtml(a.name || '')}</span><span class="search-flyout-sub">Исполнитель</span></span>
        </button>`).join('');
    }
    if (albList.length) {
      html += `<div class="search-flyout-label">Альбомы</div>` + albList.map(a => `
        <button type="button" class="search-flyout-row" onclick="closeMobileSearchFlyout();openSavedAlbum('${jsStr(a.id)}','${jsStr(a.title)}','${jsStr(a.artist?.name || '')}')">
          ${a.cover_medium ? `<img class="search-flyout-cover" src="${a.cover_medium}" alt="">` : `<span class="search-flyout-cover ph"></span>`}
          <span class="search-flyout-meta"><span class="search-flyout-title">${escHtml(a.title || '')}</span><span class="search-flyout-sub">${escHtml(a.artist?.name || '')}</span></span>
        </button>`).join('');
    }
    if (tNorm.length) {
      _src['mobile_flyout_tracks'] = tNorm;
      html += `<div class="search-flyout-label">Треки</div>` + tNorm.map((t, i) => `
        <button type="button" class="search-flyout-row" onclick="closeMobileSearchFlyout();playFromSrc('mobile_flyout_tracks',${i})">
          ${t.album?.cover_medium ? `<img class="search-flyout-cover" src="${t.album.cover_medium}" alt="">` : `<span class="search-flyout-cover ph"></span>`}
          <span class="search-flyout-meta"><span class="search-flyout-title">${escHtml(t.title || '')}</span><span class="search-flyout-sub">${escHtml(t.artist?.name || '')}</span></span>
        </button>`).join('');
    }
    html += `<button type="button" class="search-flyout-row search-flyout-more" onclick="commitMobileSearch('${jsStr(query)}')">Смотреть все по запросу «${escHtml(query)}»</button>`;
    fly.innerHTML = html;
  } catch {
    if (gen !== _mobileFlyoutGen) return;
    fly.innerHTML = `<div class="search-flyout-empty">Ошибка поиска</div>`;
  }
}

function commitMobileSearch(q) {
  closeMobileSearchFlyout();
  doSearch(q, { save: true });
}
window.commitMobileSearch = commitMobileSearch;

function bindMobileSearchField() {
  const mob = document.getElementById('mobile-search-input');
  if (!mob || mob.dataset.bound === '1') return;
  mob.dataset.bound = '1';
  mob.addEventListener('input', () => {
    const q = mob.value.trim();
    const top = document.getElementById('main-search-input');
    if (top) top.value = mob.value;
    syncMobileSearchClear(q);
    clearTimeout(_searchPageTimer);
    _searchPageTimer = setTimeout(() => {
      if (!q) {
        closeMobileSearchFlyout();
        showSearchInitial();
        return;
      }
      // Live suggestions under the field; full results on Enter / «смотреть все»
      void renderMobileSearchFlyout(q);
    }, 260);
  });
  mob.addEventListener('focus', () => {
    const q = mob.value.trim();
    if (q) void renderMobileSearchFlyout(q);
  });
  mob.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMobileSearchFlyout();
      mob.blur();
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    commitMobileSearch(mob.value.trim());
  });
  if (!window._mobileSearchFlyoutDocBound) {
    window._mobileSearchFlyoutDocBound = true;
    document.addEventListener('click', e => {
      if (!e.target.closest('.mobile-search-wrap')) closeMobileSearchFlyout();
    });
  }
}
window.bindMobileSearchField = bindMobileSearchField;

function bootSearchPage() {
  initShared();
  initSearchPage();
  bindMobileSearchField();
  const q = new URLSearchParams(location.search).get('q');
  const top = document.getElementById('main-search-input');
  if (q) {
    if (top) top.value = q;
    syncMobileSearchInput(q);
    syncMobileSearchClear(q);
    doSearch(q, { save: true });
  } else if (top?.value.trim()) {
    syncMobileSearchInput(top.value.trim());
    // Restore results from typed query without re-saving drafts
    doSearch(top.value.trim(), { save: false });
  } else {
    syncMobileSearchClear('');
    showSearchInitial();
  }
}

async function renderSearchBrowse() {
  await Promise.all([
    renderSearchPopular(),
    renderSearchTrending(),
    renderSearchAlbumsFocus()
  ]);
}

async function renderSearchTrending() {
  const box = document.getElementById('search-trend-grid');
  if (!box) return;
  try {
    const tracks = (await dzArr('/chart/0/tracks?limit=8')).map(normDZ);
    _src['search_trend'] = tracks;
    if (!tracks.length) {
      box.innerHTML = `<p class="search-browse-empty">Не удалось загрузить тренды</p>`;
      return;
    }
    box.innerHTML = tracks.map((t, i) => `
      <button type="button" class="search-trend-row" onclick="playFromSrc('search_trend',${i})">
        <span class="search-trend-num">${i + 1}</span>
        ${t.album?.cover_medium
          ? `<img class="search-trend-cover" src="${t.album.cover_medium}" alt="" loading="lazy">`
          : `<span class="search-trend-cover ph"></span>`}
        <span class="search-trend-meta">
          <span class="search-trend-title">${escHtml(t.title || '')}</span>
          <span class="search-trend-artist">${escHtml(t.artist?.name || '')}</span>
        </span>
        <span class="search-trend-play" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </span>
      </button>`).join('');
  } catch {
    box.innerHTML = `<p class="search-browse-empty">Не удалось загрузить тренды</p>`;
  }
}

async function renderSearchAlbumsFocus() {
  const box = document.getElementById('search-albums-rail');
  if (!box) return;
  try {
    const albums = await dzArr('/chart/0/albums?limit=10');
    if (!albums.length) {
      box.innerHTML = `<p class="search-browse-empty">Нет альбомов</p>`;
      return;
    }
    box.innerHTML = albums.map(a => `
      <button type="button" class="cover-card" onclick="openSavedAlbum('${jsStr(a.id)}','${jsStr(a.title)}','${jsStr(a.artist?.name || '')}')">
        ${a.cover_medium
          ? `<img class="cover-card-art" src="${a.cover_medium}" alt="" loading="lazy">`
          : `<span class="cover-card-art cover-card-fallback">${noteSVGShared()}</span>`}
        <span class="cover-card-title">${escHtml(a.title || '')}</span>
        <span class="cover-card-sub">${escHtml(a.artist?.name || '')}</span>
      </button>`).join('');
    bindSearchRails();
  } catch {
    box.innerHTML = `<p class="search-browse-empty">Не удалось загрузить альбомы</p>`;
  }
}

function searchRailNavHTML() {
  return `
    <button type="button" class="genre-nav-btn rail-prev" aria-label="Назад">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <button type="button" class="genre-nav-btn rail-next" aria-label="Вперёд">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>`;
}

function bindSearchRails() {
  document.querySelectorAll('.rail-nav[data-rail]').forEach(nav => {
    const rail = document.getElementById(nav.dataset.rail);
    if (!rail) return;
    if (!nav.querySelector('.rail-prev')) nav.innerHTML = searchRailNavHTML();
    const prev = nav.querySelector('.rail-prev');
    const next = nav.querySelector('.rail-next');
    const step = () => Math.max(180, Math.floor(rail.clientWidth * 0.75));
    const sync = () => {
      const max = rail.scrollWidth - rail.clientWidth - 2;
      const canScroll = max > 4;
      prev.disabled = !canScroll || rail.scrollLeft <= 2;
      next.disabled = !canScroll || rail.scrollLeft >= max;
      nav.classList.toggle('is-idle', !canScroll);
    };
    prev.onclick = () => rail.scrollBy({ left: -step(), behavior: 'smooth' });
    next.onclick = () => rail.scrollBy({ left: step(), behavior: 'smooth' });
    rail.onscroll = sync;
    requestAnimationFrame(sync);
  });
  if (!window._searchRailsResizeBound) {
    window._searchRailsResizeBound = true;
    window.addEventListener('resize', () => bindSearchRails(), { passive: true });
  }
}

function initSearchPage() {
  if (typeof Store?.pruneHistory === 'function') Store.pruneHistory();
  renderSearchHistory();
  if (window.MrfAuth && typeof MrfAuth.onChange === 'function' && !window.__mrfSearchAuthBound) {
    window.__mrfSearchAuthBound = true;
    MrfAuth.onChange(() => {
      if (typeof renderSearchHistory === 'function') renderSearchHistory();
    });
  }
  if (typeof updateSearchModeUI === 'function') updateSearchModeUI();
  if (typeof closeSearchFlyout === 'function') closeSearchFlyout();
  // Results are driven by topbar #main-search-input via bindTopbarSearchFlyout
}

async function renderSearchPopular() {
  const box = document.getElementById('search-popular-grid');
  if (!box) return;

  const fallback = [
    { name: 'The Weeknd' }, { name: 'Taylor Swift' }, { name: 'Drake' },
    { name: 'Billie Eilish' }, { name: 'Dua Lipa' }, { name: 'Post Malone' },
    { name: 'Bad Bunny' }, { name: 'Harry Styles' }
  ];

  let artists = [];
  try {
    artists = await dzArr('/chart/0/artists?limit=12');
  } catch (_) {}
  if (!artists.length) artists = fallback;

  box.innerHTML = artists.slice(0, 10).map(a => {
    const name = a.name || '';
    const pic = a.picture_medium || a.picture || '';
    const q = escHtml(name).replace(/'/g, "\\'");
    return `
      <button type="button" class="search-popular-card" onclick="doSearch('${q}')">
        ${pic
          ? `<img class="search-popular-cover" src="${pic}" alt="" loading="lazy">`
          : `<span class="search-popular-cover search-popular-fallback">${escHtml((name || '?')[0])}</span>`}
        <span class="search-popular-name">${escHtml(name)}</span>
      </button>`;
  }).join('');
}

function clearSearchInput() {
  resetSearchHome({ replaceUrl: true });
}

/** Reset Search tab to browse home (clear query + show initial). */
function resetSearchHome(opts) {
  const replaceUrl = !opts || opts.replaceUrl !== false;
  const top = document.getElementById('main-search-input');
  if (top) top.value = '';
  syncMobileSearchInput('');
  const hidden = document.getElementById('search-input');
  if (hidden) hidden.value = '';
  document.getElementById('topbar-search-clear')?.classList.add('hidden');
  document.getElementById('mobile-search-clear')?.classList.add('hidden');
  if (typeof closeSearchFlyout === 'function') closeSearchFlyout();
  closeMobileSearchFlyout();

  if (replaceUrl && /(?:^|[?&])q=/i.test(location.search || '')) {
    const clean = typeof mrfUrl === 'function' ? mrfUrl('search') : 'search.html';
    try { history.replaceState({ mrfSoft: 1 }, '', clean); } catch (_) {}
    if (window.__mrfSoftHist) {
      const n = (typeof getPageId === 'function' ? '/search' : 'search.html');
      try {
        const u = new URL(clean, location.href);
        let path = u.pathname.replace(/\/index\.html$/i, '/').replace(/\.html$/i, '');
        if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
        window.__mrfSoftHist.stack[window.__mrfSoftHist.index] = (path || '/') + (u.search || '');
      } catch (_) {
        window.__mrfSoftHist.stack[window.__mrfSoftHist.index] = n;
      }
      if (typeof updateChromeNavButtons === 'function') updateChromeNavButtons();
    }
  }

  showSearchInitial();
}
window.resetSearchHome = resetSearchHome;

function showSearchInitial() {
  const initial = document.getElementById('search-initial');
  const results = document.getElementById('search-results-section');
  if (initial) initial.style.display = '';
  if (results) results.style.display = 'none';
  document.body.classList.remove('is-search-results');
  closeMobileSearchFlyout();
  renderSearchHistory();
  renderSearchBrowse();
  if (typeof updateMobileBackFab === 'function') updateMobileBackFab();
  if (typeof updateChromeNavButtons === 'function') updateChromeNavButtons();
}

function showSearchResults() {
  const initial = document.getElementById('search-initial');
  const results = document.getElementById('search-results-section');
  if (initial) initial.style.display = 'none';
  if (results) results.style.display = '';
  document.body.classList.add('is-search-results');
  closeMobileSearchFlyout();
  // Sync sticky topbar with the query (becomes the pinned search chrome)
  const q = (document.getElementById('mobile-search-input')?.value
    || document.getElementById('main-search-input')?.value
    || document.getElementById('search-input')?.value || '').trim();
  const top = document.getElementById('main-search-input');
  if (top && q && top.value.trim() !== q) top.value = q;
  syncMobileSearchClear(q);
  if (typeof updateTopbarAvatar === 'function') updateTopbarAvatar();
  if (typeof updateMobileBackFab === 'function') updateMobileBackFab();
  if (typeof updateChromeNavButtons === 'function') updateChromeNavButtons();
}

function doSearch(q, opts) {
  const query = (q || '').trim();
  const save = !opts || opts.save !== false;
  const hidden = document.getElementById('search-input');
  if (hidden) hidden.value = query;
  const top = document.getElementById('main-search-input');
  if (top && top.value.trim() !== query) top.value = query;
  syncMobileSearchInput(query);
  syncMobileSearchClear(query);
  closeMobileSearchFlyout();
  if (!query) { showSearchInitial(); return; }
  showSearchResults();
  const box = document.getElementById('search-results');
  if (box) box.innerHTML = loaderHTMLShared('Ищем…');
  if (save) {
    Store.addHistory(query);
    // Live update chips (same idea as recent / queue)
    renderSearchHistory();
  }
  pageRunSearch(query);
  if (typeof updateMobileBackFab === 'function') updateMobileBackFab();
}

async function pageRunSearch(q) {
  if (!q || q.trim().length < 1) return;
  // Live typing must NOT write history — only Enter / click commits via doSearch({save:true})
  showSearchResults();
  const box = document.getElementById('search-results');
  if (box) box.innerHTML = loaderHTMLShared('Ищем…');

  // BACKEND TODO: Получение поисковой выдачи
  try {
    const [rawTracks, rawArtists, rawAlbums] = await Promise.all([
      dzArr(`/search/track?q=${encodeURIComponent(q)}&limit=50`),
      dzArr(`/search/artist?q=${encodeURIComponent(q)}&limit=20`),
      dzArr(`/search/album?q=${encodeURIComponent(q)}&limit=20`)
    ]);
    _searchPageResults.tracks  = (rawTracks || []).map(normDZ);
    _searchPageResults.artists = (rawArtists || []).slice().sort((a, b) => (+b.nb_fan || 0) - (+a.nb_fan || 0));
    _searchPageResults.albums  = rawAlbums || [];

    // reset tabs to "all"
    document.querySelectorAll('#search-tabs .tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
    renderSearchAll();
  } catch (err) {
    console.error('[SEARCH]', err);
    if (box) box.innerHTML = `<div class="search-empty" style="padding:40px 0"><p>Ошибка поиска. Попробуй ещё раз.</p></div>`;
  }
}

function switchSearchTab(tab, btn) {
  document.querySelectorAll('#search-tabs .tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (tab === 'all')       renderSearchAll();
  if (tab === 'tracks')    renderSearchTracks();
  if (tab === 'artists')   renderSearchArtists();
  if (tab === 'albums')    renderSearchAlbums();
  if (tab === 'playlists') renderSearchPlaylists();
}

function renderSearchPlaylists() {
  const box = document.getElementById('search-results');
  if (!box) return;
  const q = (document.getElementById('main-search-input')?.value || document.getElementById('search-input')?.value || '').trim().toLowerCase();
  const pls = Store.getPlaylists().filter(p => !q || (p.name || '').toLowerCase().includes(q));
  box.innerHTML = pls.length
    ? `<div class="lib-grid">${pls.map(pl => `
        <div class="lib-card" onclick="location.href='playlist.html?id=${pl.id}'">
          ${pl.cover ? `<img src="${pl.cover}" class="lib-card-cover" alt="">` : `<div class="lib-card-cover-placeholder">${noteSVGShared()}</div>`}
          <div class="lib-card-body"><div class="lib-card-title">${escHtml(pl.name)}</div><div class="lib-card-sub">${pl.trackCount} треков</div></div>
        </div>`).join('')}</div>`
    : `<div class="search-empty"><p>Плейлисты не найдены</p></div>`;
}

function renderSearchAll() {
  const box = document.getElementById('search-results');
  if (!box) return;
  let html = '';
  const tracks = _searchPageResults.tracks;
  const artists = _searchPageResults.artists;
  const albums = _searchPageResults.albums;

  if (tracks.length) {
    const best = tracks[0];
    html += `<div class="section"><div class="section-header"><h3 class="section-title" style="font-size:16px">Лучший результат</h3></div>
      <div class="best-result" onclick="playFromSrc('s-tracks',0)">
        ${best.album?.cover_medium ? `<img src="${best.album.cover_medium}" class="best-result-cover" alt="">` : `<div class="best-result-cover ph">${noteSVGShared()}</div>`}
        <div>
          <div class="best-result-title">${escHtml(best.title)}</div>
          <div class="best-result-sub">Трек · ${escHtml(best.artist?.name || '')}</div>
          <button class="btn-primary" style="margin-top:10px;padding:8px 16px;font-size:12px" onclick="event.stopPropagation();playFromSrc('s-tracks',0)">Слушать</button>
        </div>
      </div></div>`;
    _src['s-tracks'] = tracks;
    html += `<div class="section"><div class="section-header"><h3 class="section-title" style="font-size:16px">Треки</h3></div>
      <div class="track-list">${tracks.slice(0, 8).map((t, i) => rowHTML(t, i, 's-tracks')).join('')}</div></div>`;
  }
  if (artists.length) {
    html += `<div class="section"><div class="section-header"><h3 class="section-title" style="font-size:16px">Артисты</h3></div>
      <div class="artists-grid">${artists.slice(0, 6).map(a => `
        <div class="artist-card" onclick="openArtist(${a.id != null && String(a.id) !== '' ? `'${jsStr(a.id)}'` : 'null'},'${jsStr(a.name)}')">
          ${a.picture_medium ? `<img class="artist-img" src="${a.picture_medium}" alt="" loading="lazy">` : `<div class="artist-img-placeholder">${(a.name || '?')[0]}</div>`}
          <div class="artist-name">${escHtml(a.name)}</div>
          <div class="artist-listeners">${a.nb_fan ? (+a.nb_fan).toLocaleString('ru') + ' фанатов' : ''}</div>
        </div>`).join('')}</div></div>`;
  }
  if (albums.length) {
    html += `<div class="section"><div class="section-header"><h3 class="section-title" style="font-size:16px">Альбомы</h3></div>
      <div class="albums-grid">${albums.slice(0, 6).map(a => `
        <div class="album-card" onclick="openSavedAlbum('${jsStr(a.id)}','${jsStr(a.title)}','${jsStr(a.artist?.name || '')}')">
          ${a.cover_medium ? `<img class="album-cover" src="${a.cover_medium}" alt="" loading="lazy">` : `<div class="album-cover-placeholder">${noteSVGShared()}</div>`}
          <div class="album-body"><div class="album-title">${escHtml(a.title)}</div><div class="album-artist">${escHtml(a.artist?.name || '')}</div></div>
        </div>`).join('')}</div></div>`;
  }
  if (!html) {
    html = `<div class="search-empty" style="padding:60px 0">
      <svg viewBox="0 0 24 24" fill="none" width="48" height="48" style="color:var(--text-3);margin-bottom:12px"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M20 20L16.5 16.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      <p>Ничего не найдено</p></div>`;
  }
  box.innerHTML = html;
}

function renderSearchTracks() {
  const box = document.getElementById('search-results');
  if (!box) return;
  _src['s-tracks'] = _searchPageResults.tracks;
  box.innerHTML = _searchPageResults.tracks.length
    ? `<div class="track-list">${_searchPageResults.tracks.map((t, i) => rowHTML(t, i, 's-tracks')).join('')}</div>`
    : `<div class="search-empty"><p>Треки не найдены</p></div>`;
}

function renderSearchArtists() {
  const box = document.getElementById('search-results');
  if (!box) return;
  box.innerHTML = _searchPageResults.artists.length
    ? `<div class="artists-grid">${_searchPageResults.artists.map(a => `
        <div class="artist-card" onclick="openArtist(${a.id != null && String(a.id) !== '' ? `'${jsStr(a.id)}'` : 'null'},'${jsStr(a.name)}')">
          ${a.picture_medium ? `<img class="artist-img" src="${a.picture_medium}" alt="" loading="lazy">` : `<div class="artist-img-placeholder">${(a.name || '?')[0]}</div>`}
          <div class="artist-name">${escHtml(a.name)}</div>
          <div class="artist-listeners">${a.nb_fan ? (+a.nb_fan).toLocaleString('ru') + ' фанатов' : ''}</div>
        </div>`).join('')}</div>`
    : `<div class="search-empty"><p>Артисты не найдены</p></div>`;
}

function renderSearchAlbums() {
  const box = document.getElementById('search-results');
  if (!box) return;
  box.innerHTML = _searchPageResults.albums.length
    ? `<div class="albums-grid">${_searchPageResults.albums.map(a => `
        <div class="album-card" onclick="openSavedAlbum('${jsStr(a.id)}','${jsStr(a.title)}','${jsStr(a.artist?.name || '')}')">
          ${a.cover_medium ? `<img class="album-cover" src="${a.cover_medium}" alt="" loading="lazy">` : `<div class="album-cover-placeholder">${noteSVGShared()}</div>`}
          <div class="album-body"><div class="album-title">${escHtml(a.title)}</div><div class="album-artist">${escHtml(a.artist?.name || '')}</div></div>
        </div>`).join('')}</div>`
    : `<div class="search-empty"><p>Альбомы не найдены</p></div>`;
}

function renderSearchHistory() {
  const section = document.getElementById('search-history-section');
  const list = document.getElementById('search-history-list');
  if (!section || !list) return;

  const loggedIn = typeof mrfIsLoggedIn === 'function' ? mrfIsLoggedIn() : !!(window.MrfAuth?.session?.user);
  const hint = !!(window.MrfAuth && typeof MrfAuth.hasAuthHint === 'function' && MrfAuth.hasAuthHint());
  const authReady = !!(window.MrfAuth && MrfAuth.ready);
  const clearBtn = document.getElementById('search-history-clear');
  if (!loggedIn) {
    if (hint && !authReady) {
      section.style.display = 'none';
      list.innerHTML = '';
      return;
    }
    section.style.display = '';
    if (clearBtn) clearBtn.style.display = 'none';
    list.innerHTML = `<div class="rail-guest-hint" role="status">
      <p class="rail-guest-hint-text">Войдите в аккаунт</p>
      <button type="button" class="btn-secondary rail-guest-hint-btn" onclick="goProfile()">Войти</button>
    </div>`;
    return;
  }
  if (clearBtn) clearBtn.style.display = '';

  if (typeof Store?.pruneHistory === 'function') Store.pruneHistory();
  const history = Store.getHistory().filter(h => String(h || '').trim().length >= 2);

  if (!history.length) { section.style.display = 'none'; list.innerHTML = ''; return; }
  section.style.display = '';
  list.innerHTML = history.slice(0, 8).map(h => {
    const safe = escHtml(h).replace(/'/g, "\\'");
    return `
    <button type="button" class="search-history-chip search-history-row" onclick="doSearch('${safe}',{save:true})">
      <span class="search-history-meta">
        <span class="search-history-chip-text">${escHtml(h)}</span>
      </span>
      <span class="search-history-chip-x" onclick="event.stopPropagation();removeHistoryItem('${safe}')" title="Удалить" aria-label="Удалить">✕</span>
    </button>`;
  }).join('');
}
window.renderSearchHistory = renderSearchHistory;

function clearSearchHistory() {
  Store.clearHistory();
  renderSearchHistory();
}

function removeHistoryItem(q) {
  if (typeof Store.removeHistory === 'function') Store.removeHistory(q);
  else {
    const arr = Store.getHistory().filter(h => h !== q);
    Store._set(Store.keys.history, arr);
  }
  renderSearchHistory();
}

if (typeof whenDomReady === 'function') whenDomReady(bootSearchPage);
else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootSearchPage);
else bootSearchPage();
