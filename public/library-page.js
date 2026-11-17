
let _pageLibView = 'grid';
let _pageLibTab  = 'all';
let _pageLibQuery = '';
let _pageSelectMode = false;
let _pageSelected = new Set();

function bootLibrary() {
  initShared();
  const params = new URLSearchParams(location.search);
  if (params.get('tab')) {
    const tab = params.get('tab');
    const btn = [...document.querySelectorAll('.lib-filter')].find(b => b.textContent.toLowerCase().includes(
      tab === 'tracks' ? 'любим' : tab === 'playlists' ? 'плейл' : tab === 'albums' ? 'альбом' : tab === 'artists' ? 'исполн' : 'всё'
    ));
    if (btn) switchLibTab(tab === 'liked' ? 'tracks' : tab, btn);
    else renderLib('all');
  } else renderLib('all');
}
if (typeof whenDomReady === 'function') whenDomReady(bootLibrary);
else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootLibrary);
else bootLibrary();

function setLibView(v) {
  _pageLibView = v;
  document.getElementById('lib-view-grid')?.classList.toggle('active', v==='grid');
  document.getElementById('lib-view-list')?.classList.toggle('active', v==='list');
  renderLib(_pageLibTab);
}

function switchLibTab(tab, btn) {
  _pageLibTab = tab;
  document.querySelectorAll('.lib-filter').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  clearLibSelection();
  renderLib(tab);
}

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

function renderLib(tab) {
  const box = document.getElementById('lib-content');
  if (!box) return;
  const activeTab = tab || _pageLibTab || 'all';
  _pageLibTab = activeTab;
  let html = '';

  if (activeTab === 'all' || activeTab === 'tracks') {
    let favs = filterByQuery(Store.getFavs(), ['title', 'artist']);
    html += `<div class="section"><div class="section-header">
      <h3 class="section-title" style="font-size:16px">Любимые треки <span style="font-size:12px;color:var(--text-3)">${favs.length}</span></h3>
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
      html += `<div id="fav-list" class="track-list">${fake.map((t,i) => {
        const row = rowHTML(t,i,'favs');
        return row.replace('<div class="track-num">', `${libCheckHTML(t.id)}<div class="track-num">`);
      }).join('')}</div>`;
    }
    html += `</div>`;
  }

  if (activeTab === 'all' || activeTab === 'playlists') {
    let pls = Store.getPlaylists();
    if (_pageLibQuery) pls = pls.filter(p => (p.name||'').toLowerCase().includes(_pageLibQuery));
    html += `<div class="section"><div class="section-header"><h3 class="section-title" style="font-size:16px">Плейлисты</h3></div>`;
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

  if (activeTab === 'all' || activeTab === 'albums') {
    let albs = Store.getAlbums();
    if (_pageLibQuery) albs = albs.filter(a => ((a.title||'')+(a.artistName||'')).toLowerCase().includes(_pageLibQuery));
    html += `<div class="section"><div class="section-header"><h3 class="section-title" style="font-size:16px">Альбомы и релизы</h3></div>`;
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

  if (activeTab === 'all' || activeTab === 'artists') {
    let followed = Store.getFollowed();
    if (_pageLibQuery) followed = followed.filter(a => (a.name||'').toLowerCase().includes(_pageLibQuery));
    html += `<div class="section"><div class="section-header"><h3 class="section-title" style="font-size:16px">Исполнители</h3></div>`;
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
