
let _pageLibView = 'grid';
let _pageLibTab  = 'all';
let _pageLibQuery = '';
let _pageLibSort = 'date';
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
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootLibrary);
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
  btn.classList.add('active');
  clearLibSelection();
  renderLib(tab);
}

function onLibSearch() {
  _pageLibQuery = (document.getElementById('lib-search')?.value || '').trim().toLowerCase();
  renderLib(_pageLibTab);
}
function onLibSort() {
  _pageLibSort = document.getElementById('lib-sort')?.value || 'date';
  renderLib(_pageLibTab);
}

function toggleSelectMode() {
  _pageSelectMode = !_pageSelectMode;
  document.querySelector('.feed')?.classList.toggle('lib-select-mode', _pageSelectMode);
  if (!_pageSelectMode) clearLibSelection();
  else updateBulkBar();
  showNotif(_pageSelectMode ? 'Режим выбора включён' : 'Режим выбора выключен');
}

function clearLibSelection() {
  _pageSelected.clear();
  updateBulkBar();
  document.querySelectorAll('.track-check').forEach(c => { c.checked = false; });
}

function updateBulkBar() {
  const bar = document.getElementById('lib-bulk');
  const count = document.getElementById('lib-bulk-count');
  if (!bar) return;
  bar.classList.toggle('visible', _pageSelected.size > 0);
  if (count) count.textContent = _pageSelected.size + ' выбрано';
}

function toggleSelectTrack(id, checked) {
  if (checked) _pageSelected.add(String(id)); else _pageSelected.delete(String(id));
  updateBulkBar();
}

function sortFavs(list) {
  const arr = [...list];
  if (_pageLibSort === 'title') arr.sort((a,b) => (a.title||'').localeCompare(b.title||'', 'ru'));
  else if (_pageLibSort === 'artist') arr.sort((a,b) => (a.artist||'').localeCompare(b.artist||'', 'ru'));
  else if (_pageLibSort === 'duration') arr.sort((a,b) => (a.duration||0) - (b.duration||0));
  else arr.sort((a,b) => (b.addedAt||0) - (a.addedAt||0));
  return arr;
}

function filterByQuery(list, fields) {
  if (!_pageLibQuery) return list;
  return list.filter(item => fields.some(f => String(item[f] || '').toLowerCase().includes(_pageLibQuery)));
}

function renderLib(tab) {
  const box = document.getElementById('lib-content');
  if (!box) return;
  let html = '';

  if (tab === 'all' || tab === 'tracks') {
    let favs = sortFavs(filterByQuery(Store.getFavs(), ['title', 'artist']));
    html += `<div class="section"><div class="section-header">
      <h3 class="section-title" style="font-size:16px">Любимые треки <span style="font-size:12px;color:var(--text-3)">${favs.length}</span></h3>
      ${favs.length ? `<button class="btn-primary" style="padding:7px 14px;font-size:12px" onclick="playFavs()">Слушать</button>` : ''}
    </div>`;
    if (!favs.length) {
      html += `<div class="search-empty" style="padding:12px 0 8px"><p style="color:var(--text-3)">Добавляй треки в избранное сердечком</p></div>`;
    } else {
      const fake = favs.map(f => ({ id:f.id||0, title:f.title, artist:{name:f.artist}, album:{cover_medium:f.cover}, duration:f.duration||0, preview:f.preview||null }));
      _src['favs'] = fake;
      html += `<div id="fav-list" class="track-list">${fake.map((t,i) => {
        const row = rowHTML(t,i,'favs');
        return row.replace('<div class="track-num">', `<input type="checkbox" class="track-check" onclick="event.stopPropagation();toggleSelectTrack('${String(t.id).replace(/'/g,"\\'")}', this.checked)"/><div class="track-num">`);
      }).join('')}</div>`;
    }
    html += `</div>`;
  }

  if (tab === 'all' || tab === 'playlists') {
    let pls = Store.getPlaylists();
    if (_pageLibQuery) pls = pls.filter(p => (p.name||'').toLowerCase().includes(_pageLibQuery));
    html += `<div class="section"><div class="section-header"><h3 class="section-title" style="font-size:16px">Плейлисты</h3></div>`;
    if (!pls.length) {
      html += `<div class="search-empty" style="padding:8px 0 4px"><p style="color:var(--text-3)">Создай первый плейлист</p></div>`;
    } else {
      html += `<div class="${_pageLibView==='grid'?'lib-grid':'lib-list'}">`;
      pls.forEach(pl => {
        if (_pageLibView === 'grid') {
          html += `<div class="lib-card" onclick="location.href='playlist.html?id=${pl.id}'">
            ${pl.cover ? `<img src="${pl.cover}" class="lib-card-cover" alt="">` : `<div class="lib-card-cover-placeholder">${noteSVGShared()}</div>`}
            <div class="lib-card-body"><div class="lib-card-title">${escHtml(pl.name)}</div><div class="lib-card-sub">${pl.trackCount} треков</div></div>
            <div class="lib-card-actions">
              <button class="lib-card-btn" onclick="event.stopPropagation();delPlaylist('${pl.id}')" title="Удалить">
                <svg viewBox="0 0 24 24" fill="none" width="13" height="13"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              </button>
            </div>
          </div>`;
        } else {
          html += `<div class="lib-list-item" onclick="location.href='playlist.html?id=${pl.id}'">
            ${pl.cover ? `<img src="${pl.cover}" class="lib-list-cover" alt="">` : `<div class="lib-list-cover" style="display:flex;align-items:center;justify-content:center;border-radius:6px;background:var(--bg-3)">${noteSVGShared()}</div>`}
            <div class="lib-list-info"><div class="lib-list-title">${escHtml(pl.name)}</div><div class="lib-list-sub">Плейлист · ${pl.trackCount} треков</div></div>
          </div>`;
        }
      });
      html += `</div>`;
    }
    html += `</div>`;
  }

  if (tab === 'all' || tab === 'albums') {
    let albs = Store.getAlbums();
    if (_pageLibQuery) albs = albs.filter(a => ((a.title||'')+(a.artistName||'')).toLowerCase().includes(_pageLibQuery));
    html += `<div class="section"><div class="section-header"><h3 class="section-title" style="font-size:16px">Альбомы</h3></div>`;
    if (!albs.length) {
      html += `<div class="search-empty" style="padding:8px 0 4px"><p style="color:var(--text-3)">Сохраняй альбомы со страницы альбома</p></div>`;
    } else {
      html += `<div class="albums-grid">${albs.map(a => `
        <div class="album-card" onclick="location.href='${mrfUrl('album',{id:a.id,title:a.title,artist:a.artistName||''})}'">
          ${a.cover ? `<img class="album-cover" src="${a.cover}" alt="">` : `<div class="album-cover-placeholder">${noteSVGShared()}</div>`}
          <div class="album-body"><div class="album-title">${escHtml(a.title)}</div><div class="album-artist">${escHtml(a.artistName||'')}</div></div>
        </div>`).join('')}</div>`;
    }
    html += `</div>`;
  }

  if (tab === 'all' || tab === 'artists') {
    let followed = Store.getFollowed();
    if (_pageLibQuery) followed = followed.filter(a => (a.name||'').toLowerCase().includes(_pageLibQuery));
    html += `<div class="section"><div class="section-header"><h3 class="section-title" style="font-size:16px">Исполнители</h3></div>`;
    if (!followed.length) {
      html += `<div class="search-empty" style="padding:8px 0 4px"><p style="color:var(--text-3)">Подпишись на исполнителей</p></div>`;
    } else {
      html += `<div class="artists-grid">${followed.map(a => `
        <div class="artist-card" onclick="location.href='${mrfUrl('artist',{id:a.id,name:a.name})}'">
          ${a.picture ? `<img class="artist-img" src="${a.picture}" alt="">` : `<div class="artist-img-placeholder">${(a.name||'?')[0]}</div>`}
          <div class="artist-name">${escHtml(a.name)}</div>
          <div class="artist-listeners">${a.fans ? (+a.fans).toLocaleString('ru') + ' фанатов' : ''}</div>
        </div>`).join('')}</div>`;
    }
    html += `</div>`;
  }

  box.innerHTML = html || `<div class="search-empty" style="padding:60px 0"><p style="color:var(--text-3)">Здесь пока ничего нет</p></div>`;
}

function playFavs() {
  if (_src['favs']?.length) playFromSrc('favs', 0);
}

function delPlaylist(id) {
  if (!confirm('Удалить плейлист?')) return;
  Store.deletePlaylist(id);
  renderLib(_pageLibTab);
  renderSidebarPlaylists();
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
  // add rest after modal uses pending — for multi, add directly to first playlist after create is complex; add all to queue of selection helper:
  favs.slice(1).forEach(f => {
    window._bulkPending = window._bulkPending || [];
    window._bulkPending.push(f);
  });
}

function bulkRemoveFavs() {
  if (!confirm('Удалить выбранные из избранного?')) return;
  let favs = Store.getFavs().filter(f => !_pageSelected.has(String(f.id)));
  Store.setFavs(favs);
  favourites = favs;
  clearLibSelection();
  updateFavBadge();
  renderLib(_pageLibTab);
  showNotif('Удалено из избранного');
}
