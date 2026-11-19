
let _pageLibView = 'grid';
let _pageLibTab  = 'all';
let _pageLibQuery = '';
let _pageSelectMode = false;
let _pageSelected = new Set();
let _libTracksExpanded = false;

function syncLibGuestChrome(isGuest) {
  document.body.classList.toggle('is-lib-guest', !!isGuest);
  document.querySelectorAll('.library-controls, .lib-toolbar, .lib-filters, .lib-bulk-bar, .mobile-head-action').forEach((el) => {
    if (!el) return;
    if (isGuest) el.setAttribute('hidden', '');
    else el.removeAttribute('hidden');
  });
}

function bootLibrary() {
  if (typeof initShared === 'function') initShared();
  if (typeof updateSearchModeUI === 'function') updateSearchModeUI();
  if (typeof updateTopbarAvatar === 'function') updateTopbarAvatar();
  if (typeof updateMobileNavActive === 'function') updateMobileNavActive('library');
  const params = new URLSearchParams(location.search);
  if (params.get('tab') && typeof mrfIsLoggedIn === 'function' && mrfIsLoggedIn()) {
    const tab = params.get('tab');
    const btn = [...document.querySelectorAll('.lib-filter')].find(b => b.textContent.toLowerCase().includes(
      tab === 'tracks' ? 'любим' : tab === 'playlists' ? 'плейл' : tab === 'albums' ? 'альбом' : tab === 'artists' ? 'исполн' : 'всё'
    ));
    if (btn) switchLibTab(tab === 'liked' ? 'tracks' : tab, btn);
    else renderLib('all');
  } else renderLib('all');
}
window.bootLibrary = bootLibrary;
if (typeof whenDomReady === 'function') whenDomReady(bootLibrary);
else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootLibrary);
else bootLibrary();

window.addEventListener('mrf:auth', () => {
  if (document.getElementById('lib-content')) renderLib(_pageLibTab || 'all');
});

function setLibView(v) {
  _pageLibView = v;
  document.getElementById('lib-view-grid')?.classList.toggle('active', v==='grid');
  document.getElementById('lib-view-list')?.classList.toggle('active', v==='list');
  renderLib(_pageLibTab);
}

function switchLibTab(tab, btn) {
  _pageLibTab = tab;
  _libTracksExpanded = false;
  document.querySelectorAll('.lib-filter').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  clearLibSelection();
  renderLib(tab);
}

function expandLibTracks() {
  _libTracksExpanded = true;
  renderLib(_pageLibTab || 'tracks');
}
function collapseLibTracks() {
  _libTracksExpanded = false;
  renderLib(_pageLibTab || 'tracks');
}
window.expandLibTracks = expandLibTracks;
window.collapseLibTracks = collapseLibTracks;

function onLibSearch() {
  _pageLibQuery = (document.getElementById('lib-search')?.value || '').trim().toLowerCase();
  renderLib(_pageLibTab);
}
function syncSelectModeBtn() {
  const btn = document.getElementById('lib-select-btn');
  if (!btn) return;
  btn.classList.toggle('is-on', !!_pageSelectMode);
  btn.setAttribute('aria-pressed', _pageSelectMode ? 'true' : 'false');
  btn.textContent = _pageSelectMode ? 'Готово' : 'Выбрать';
}
window.syncSelectModeBtn = syncSelectModeBtn;

function toggleSelectMode() {
  _pageSelectMode = !_pageSelectMode;
  document.querySelector('.feed')?.classList.toggle('lib-select-mode', _pageSelectMode);
  syncSelectModeBtn();
  if (!_pageSelectMode) clearLibSelection();
  else {
    updateBulkBar();
    renderLib(_pageLibTab);
  }
  showNotif(_pageSelectMode ? 'Режим выбора включён' : 'Режим выбора выключен');
  if (_pageSelectMode) return;
  renderLib(_pageLibTab);
}

function clearLibSelection() {
  _pageSelected.clear();
  updateBulkBar();
  document.querySelectorAll('.track-check').forEach(c => {
    c.classList.remove('is-on');
    c.setAttribute('aria-checked', 'false');
  });
}

function updateBulkBar() {
  const bar = document.getElementById('lib-bulk');
  const count = document.getElementById('lib-bulk-count');
  if (!bar) return;
  bar.classList.toggle('visible', _pageSelected.size > 0);
  if (count) count.textContent = _pageSelected.size + ' выбрано';
}

function toggleSelectTrack(id, btn) {
  const sid = String(id);
  const on = !_pageSelected.has(sid);
  if (on) _pageSelected.add(sid); else _pageSelected.delete(sid);
  if (btn) {
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  }
  updateBulkBar();
}

function filterByQuery(list, fields) {
  if (!_pageLibQuery) return list;
  return list.filter(item => fields.some(f => String(item[f] || '').toLowerCase().includes(_pageLibQuery)));
}

function libCheckHTML(id) {
  const on = _pageSelected.has(String(id));
  const safe = String(id).replace(/'/g, "\\'");
  return `<button type="button" class="track-check${on ? ' is-on' : ''}" aria-checked="${on ? 'true' : 'false'}" onclick="event.stopPropagation();toggleSelectTrack('${safe}', this)" title="Выбрать">
    <svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </button>`;
}

function isDesktopLibrary() {
  try {
    return window.matchMedia('(min-width: 901px)').matches
      || document.documentElement.getAttribute('data-ui') === 'desktop';
  } catch (_) {
    return false;
  }
}

/**
 * Tracks block for library.
 * PC «Всё»: 5 + «Показать ещё» (preview=true).
 * PC «Треки»: полный список без кнопки.
 * Mobile tracks tab: полный список (без preview).
 */
function libTracksSectionHTML(favs, opts) {
  const isDesktopLib = isDesktopLibrary();
  const preview = !!(opts && opts.preview) && isDesktopLib;
  const sectionTitle = isDesktopLib ? 'Треки' : 'Любимые треки';
  let html = `<div class="section lib-tracks-section"><div class="section-header">
    <h3 class="section-title" style="font-size:16px">${sectionTitle} <span style="font-size:12px;color:var(--text-3)">${favs.length}</span></h3>
    ${favs.length ? `<button class="btn-primary" style="padding:7px 14px;font-size:12px" onclick="playFavs()">Слушать</button>` : ''}
  </div>`;
  if (!favs.length) {
    html += `<div class="search-empty" style="padding:12px 0 8px"><p style="color:var(--text-3)">Добавляй треки в избранное сердечком</p></div>`;
  } else {
    const fake = favs.map(f => ({
      id: f.id || 0,
      title: f.title,
      artist: { id: f.artistId || null, name: f.artist },
      artistId: f.artistId || null,
      album: { id: f.albumId || null, title: f.albumTitle || '', cover_medium: f.cover },
      duration: f.duration || 0,
      preview: f.preview || null
    }));
    _src['favs'] = fake;
    const shown = (preview && !_libTracksExpanded) ? fake.slice(0, 5) : fake;
    html += `<div id="fav-list" class="track-list">${shown.map((t, i) => {
      const row = rowHTML(t, i, 'favs');
      return row.replace('<div class="track-num">', `${libCheckHTML(t.id)}<div class="track-num">`);
    }).join('')}</div>`;
    if (preview && fake.length > 5) {
      html += `<div style="padding:14px 0 4px;display:flex;justify-content:center">
        ${_libTracksExpanded
          ? `<button type="button" class="btn-secondary" style="padding:9px 18px;font-size:13px" onclick="collapseLibTracks()">Свернуть</button>`
          : `<button type="button" class="btn-secondary" style="padding:9px 18px;font-size:13px" onclick="expandLibTracks()">Показать ещё</button>`}
      </div>`;
    }
  }
  html += `</div>`;
  return html;
}

function renderLib(tab) {
  const box = document.getElementById('lib-content');
  if (!box) return;
  const activeTab = tab || _pageLibTab || 'all';
  _pageLibTab = activeTab;

  const guest = typeof mrfIsLoggedIn === 'function' ? !mrfIsLoggedIn() : false;
  syncLibGuestChrome(guest);
  if (guest) {
    box.innerHTML = typeof mrfGuestGateHTML === 'function'
      ? mrfGuestGateHTML()
      : `<div class="search-empty"><p>Войди в аккаунт</p></div>`;
    return;
  }

  const isDesktopLib = isDesktopLibrary();
  let html = '';

  if (activeTab === 'all' || activeTab === 'tracks') {
    let favs = filterByQuery(Store.getFavs(), ['title', 'artist']);
    const likedHref = typeof mrfUrl === 'function' ? mrfUrl('liked') : 'liked.html';
    const cover = favs.find(f => f.cover)?.cover || '';

    if (activeTab === 'all' && !isDesktopLib) {
      // Mobile only: featured «Любимые треки» card
      html += `<div class="section lib-featured-section">
        <button type="button" class="lib-featured" onclick="(window.mrfGo||function(u){location.href=u})('${likedHref}')">
          <span class="lib-featured-text">
            <span class="lib-featured-title">Любимые треки</span>
            <span class="lib-featured-sub">${favs.length} треков</span>
          </span>
          <span class="lib-featured-cover" aria-hidden="true">
            ${cover
              ? `<img src="${cover}" alt="">`
              : `<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`}
          </span>
        </button>
      </div>`;
    } else if (activeTab === 'all' && isDesktopLib) {
      // PC «Всё»: 5 треков + «Показать ещё»
      html += libTracksSectionHTML(favs, { preview: true });
    } else if (activeTab === 'tracks') {
      // PC «Треки» / mobile tracks: полный список, без «Показать ещё»
      html += libTracksSectionHTML(favs, { preview: false });
    }
  }

  // Mini-app order: Playlists → Artists → Albums (after featured liked)
  if (activeTab === 'all' || activeTab === 'playlists') {
    let pls = Store.getPlaylists();
    if (_pageLibQuery) pls = pls.filter(p => (p.name||'').toLowerCase().includes(_pageLibQuery));
    html += `<div class="section lib-section"><div class="section-header lib-section-head"><h3 class="lib-section-title">Плейлисты</h3></div>`;
    if (!pls.length) {
      html += `<div class="search-empty" style="padding:8px 0 4px"><p style="color:var(--text-3)">Создай первый плейлист</p></div>`;
    } else {
      html += `<div class="${_pageLibView==='grid'?'lib-grid':'lib-list'}">`;
      pls.forEach(pl => {
        const href = typeof mrfUrl === 'function' ? mrfUrl('playlist', { id: pl.id }) : `playlist.html?id=${encodeURIComponent(pl.id)}`;
        if (_pageLibView === 'grid') {
          html += `<div class="lib-card" onclick="(window.mrfGo||function(u){location.href=u})('${href}')">
            ${pl.cover ? `<img src="${pl.cover}" class="lib-card-cover" alt="">` : `<div class="lib-card-cover-placeholder">${noteSVGShared()}</div>`}
            <div class="lib-card-body"><div class="lib-card-title">${escHtml(pl.name)}</div><div class="lib-card-sub">${pl.trackCount || pl.tracks?.length || 0} треков</div></div>
            <div class="lib-card-actions">
              <button class="lib-card-btn" onclick="event.stopPropagation();delPlaylist('${pl.id}')" title="Удалить">
                <svg viewBox="0 0 24 24" fill="none" width="13" height="13"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              </button>
            </div>
          </div>`;
        } else {
          html += `<div class="lib-list-item" onclick="(window.mrfGo||function(u){location.href=u})('${href}')">
            ${pl.cover ? `<img src="${pl.cover}" class="lib-list-cover" alt="">` : `<div class="lib-list-cover" style="display:flex;align-items:center;justify-content:center;border-radius:6px;background:var(--bg-3)">${noteSVGShared()}</div>`}
            <div class="lib-list-info"><div class="lib-list-title">${escHtml(pl.name)}</div><div class="lib-list-sub">Плейлист · ${pl.trackCount || pl.tracks?.length || 0} треков</div></div>
          </div>`;
        }
      });
      html += `</div>`;
    }
    html += `</div>`;
  }

  if (activeTab === 'all' || activeTab === 'artists') {
    let followed = Store.getFollowed();
    if (_pageLibQuery) followed = followed.filter(a => (a.name||'').toLowerCase().includes(_pageLibQuery));
    html += `<div class="section lib-section"><div class="section-header lib-section-head"><h3 class="lib-section-title">Артисты</h3></div>`;
    if (!followed.length) {
      html += `<div class="search-empty" style="padding:8px 0 4px"><p style="color:var(--text-3)">Подпишись на исполнителей</p></div>`;
    } else {
      html += `<div class="artists-grid artists-grid-follow">${followed.map(a => {
        const sid = a.id != null ? (typeof jsStr === 'function' ? jsStr(a.id) : String(a.id).replace(/'/g, "\\'")) : '';
        const sn = typeof jsStr === 'function' ? jsStr(a.name) : String(a.name || '').replace(/'/g, "\\'");
        const letter = escHtml((a.name || '?')[0]);
        return `
        <button type="button" class="artist-tile" onclick="openArtist(${sid ? `'${sid}'` : 'null'},'${sn}')">
          <span class="artist-tile-photo">
            ${a.picture ? `<img src="${a.picture}" alt="">` : `<span class="artist-tile-ph">${letter}</span>`}
          </span>
          <span class="artist-tile-meta">
            <span class="artist-tile-name">${escHtml(a.name || '')}</span>
            ${a.fans ? `<span class="artist-tile-fans">${(+a.fans).toLocaleString('ru')} фанатов</span>` : `<span class="artist-tile-fans">Исполнитель</span>`}
          </span>
        </button>`;
      }).join('')}</div>`;
    }
    html += `</div>`;
  }

  if (activeTab === 'all' || activeTab === 'albums') {
    let albs = Store.getAlbums();
    if (_pageLibQuery) albs = albs.filter(a => ((a.title||'')+(a.artistName||'')).toLowerCase().includes(_pageLibQuery));
    html += `<div class="section lib-section"><div class="section-header lib-section-head"><h3 class="lib-section-title">Альбомы</h3></div>`;
    if (!albs.length) {
      html += `<div class="search-empty" style="padding:8px 0 4px"><p style="color:var(--text-3)">Сохраняй альбомы со страницы альбома</p></div>`;
    } else {
      html += `<div class="albums-grid">${albs.map(a => {
        const sid = typeof jsStr === 'function' ? jsStr(a.id) : String(a.id ?? '').replace(/'/g, "\\'");
        const st = typeof jsStr === 'function' ? jsStr(a.title) : String(a.title || '').replace(/'/g, "\\'");
        const sa = typeof jsStr === 'function' ? jsStr(a.artistName) : String(a.artistName || '').replace(/'/g, "\\'");
        return `
        <div class="album-card" onclick="openSavedAlbum('${sid}','${st}','${sa}')">
          ${a.cover ? `<img class="album-cover" src="${a.cover}" alt="">` : `<div class="album-cover-placeholder">${noteSVGShared()}</div>`}
          <div class="album-body"><div class="album-title">${escHtml(a.title || '')}</div><div class="album-artist">${escHtml(a.artistName||'')}</div></div>
        </div>`;
      }).join('')}</div>`;
    }
    html += `</div>`;
  }

  box.innerHTML = html || `<div class="search-empty" style="padding:60px 0"><p style="color:var(--text-3)">Здесь пока ничего нет</p></div>`;
  if (_pageSelectMode) document.querySelector('.feed')?.classList.add('lib-select-mode');
  syncSelectModeBtn();
  if (typeof syncPlayingRows === 'function') syncPlayingRows();
}
window.renderLib = renderLib;

function playFavs() {
  if (_src['favs']?.length) playFromSrc('favs', 0);
}

function delPlaylist(id) {
  if (!confirm('Удалить плейлист?')) return;
  Store.deletePlaylist(id);
  renderLib(_pageLibTab);
  if (typeof renderSidebarPlaylists === 'function') renderSidebarPlaylists();
  if (typeof notifyLibraryChanged === 'function') notifyLibraryChanged();
  showNotif('Плейлист удалён');
}

function bulkAddQueue() {
  const favs = Store.getFavs().filter(f => _pageSelected.has(String(f.id)));
  favs.forEach(f => addToQueue({
    id: f.id, title: f.title, artist: { name: f.artist },
    album: { cover_medium: f.cover }, duration: f.duration, preview: f.preview
  }));
  showNotif('Добавлено в очередь: ' + favs.length);
}

function bulkAddPlaylist() {
  const favs = Store.getFavs().filter(f => _pageSelected.has(String(f.id)));
  if (!favs.length) return;
  showAddToPlaylist({
    id: favs[0].id, title: favs[0].title, artist: { name: favs[0].artist },
    album: { cover_medium: favs[0].cover }, duration: favs[0].duration, preview: favs[0].preview
  });
  favs.slice(1).forEach(f => {
    window._bulkPending = window._bulkPending || [];
    window._bulkPending.push(f);
  });
}

function bulkRemoveFavs() {
  if (!confirm('Удалить выбранные из избранного?')) return;
  let favs = Store.getFavs().filter(f => !_pageSelected.has(String(f.id)));
  Store.setFavs(favs);
  if (typeof favourites !== 'undefined') favourites = favs;
  clearLibSelection();
  updateFavBadge();
  if (typeof notifyLibraryChanged === 'function') notifyLibraryChanged();
  else renderLib(_pageLibTab);
  showNotif('Удалено из избранного');
}
