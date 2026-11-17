/* MRF — search-page.js (external to avoid let collisions with app.js) */
var _searchPageTimer = null;
var _searchPageResults = { tracks: [], artists: [], albums: [] };

function bootSearchPage() {
  initShared();
  initSearchPage();
  const q = new URLSearchParams(location.search).get('q');
  if (q) doSearch(q);
}

function initSearchPage() {
  const inp = document.getElementById('search-input');
  if (!inp) return;

  renderSearchHistory();

  if (inp.dataset.boundSearchPage === '1') return;
  inp.dataset.boundSearchPage = '1';

  inp.addEventListener('input', () => {
    const q = inp.value.trim();
    document.getElementById('search-clear')?.classList.toggle('hidden', !q);
    clearTimeout(_searchPageTimer);
    if (!q) { showSearchInitial(); return; }
    const box = document.getElementById('search-results');
    if (box) box.innerHTML = loaderHTMLShared('Ищем…');
    showSearchResults();
    _searchPageTimer = setTimeout(() => pageRunSearch(q), 350);
  });

  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' && inp.value.trim().length >= 2) {
      clearTimeout(_searchPageTimer);
      pageRunSearch(inp.value.trim());
    }
  });
}

function clearSearchInput() {
  const inp = document.getElementById('search-input');
  if (inp) inp.value = '';
  document.getElementById('search-clear')?.classList.add('hidden');
  showSearchInitial();
}

function showSearchInitial() {
  const initial = document.getElementById('search-initial');
  const results = document.getElementById('search-results-section');
  if (initial) initial.style.display = '';
  if (results) results.style.display = 'none';
}

function showSearchResults() {
  const initial = document.getElementById('search-initial');
  const results = document.getElementById('search-results-section');
  if (initial) initial.style.display = 'none';
  if (results) results.style.display = '';
}

function doSearch(q) {
  const inp = document.getElementById('search-input');
  if (inp) inp.value = q;
  document.getElementById('search-clear')?.classList.remove('hidden');
  showSearchResults();
  const box = document.getElementById('search-results');
  if (box) box.innerHTML = loaderHTMLShared('Ищем…');
  Store.addHistory(q);
  pageRunSearch(q);
}

async function pageRunSearch(q) {
  if (!q || q.trim().length < 1) return;
  Store.addHistory(q);
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
    renderSearchHistory();
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
  const q = (document.getElementById('search-input')?.value || '').trim().toLowerCase();
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
        <div class="artist-card" onclick="location.href='${mrfUrl('artist',{id:a.id,name:a.name})}'">
          ${a.picture_medium ? `<img class="artist-img" src="${a.picture_medium}" alt="" loading="lazy">` : `<div class="artist-img-placeholder">${(a.name || '?')[0]}</div>`}
          <div class="artist-name">${escHtml(a.name)}</div>
          <div class="artist-listeners">${a.nb_fan ? (+a.nb_fan).toLocaleString('ru') + ' фанатов' : ''}</div>
        </div>`).join('')}</div></div>`;
  }
  if (albums.length) {
    html += `<div class="section"><div class="section-header"><h3 class="section-title" style="font-size:16px">Альбомы</h3></div>
      <div class="albums-grid">${albums.slice(0, 6).map(a => `
        <div class="album-card" onclick="location.href='${mrfUrl('album',{id:a.id,title:a.title,artist:a.artist?.name||''})}'">
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
        <div class="artist-card" onclick="location.href='${mrfUrl('artist',{id:a.id,name:a.name})}'">
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
        <div class="album-card" onclick="location.href='${mrfUrl('album',{id:a.id,title:a.title,artist:a.artist?.name||''})}'">
          ${a.cover_medium ? `<img class="album-cover" src="${a.cover_medium}" alt="" loading="lazy">` : `<div class="album-cover-placeholder">${noteSVGShared()}</div>`}
          <div class="album-body"><div class="album-title">${escHtml(a.title)}</div><div class="album-artist">${escHtml(a.artist?.name || '')}</div></div>
        </div>`).join('')}</div>`
    : `<div class="search-empty"><p>Альбомы не найдены</p></div>`;
}

function renderSearchHistory() {
  const history = Store.getHistory();
  const section = document.getElementById('search-history-section');
  const list = document.getElementById('search-history-list');
  if (!section || !list) return;
  if (!history.length) { section.style.display = 'none'; return; }
  section.style.display = '';
  list.innerHTML = history.slice(0, 8).map(h => `
    <div class="search-history-item" onclick="doSearch('${escHtml(h).replace(/'/g, "\\'")}')">
      <svg viewBox="0 0 24 24" fill="none" width="14" height="14" style="color:var(--text-3)"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><polyline points="12 7 12 12 15 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <span>${escHtml(h)}</span>
      <button onclick="event.stopPropagation();removeHistoryItem('${escHtml(h).replace(/'/g, "\\'")}')" style="background:none;border:none;color:var(--text-3);cursor:pointer;margin-left:auto">
        <svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      </button>
    </div>`).join('');
}

function clearSearchHistory() {
  Store.clearHistory();
  renderSearchHistory();
}

function removeHistoryItem(q) {
  const arr = Store.getHistory().filter(h => h !== q);
  Store._set(Store.keys.history, arr);
  renderSearchHistory();
}

if (typeof whenDomReady === 'function') whenDomReady(bootSearchPage);
else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootSearchPage);
else bootSearchPage();
