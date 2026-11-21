/* MRF — public account page helpers (search + profile + account.html) */

function accountUsernameOf(raw) {
  if (window.MrfAuth?.normalizeUsername) return MrfAuth.normalizeUsername(raw);
  return String(raw || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24);
}

function accountHandleOf(raw) {
  if (window.MrfAuth?.displayUsername) return MrfAuth.displayUsername(raw) || '';
  const n = accountUsernameOf(raw);
  return n ? '@' + n : '';
}

function openAccount(username) {
  const u = accountUsernameOf(username);
  if (!u) return;
  const url = typeof mrfUrl === 'function' ? mrfUrl('account', { u }) : `account.html?u=${encodeURIComponent(u)}`;
  if (typeof mrfGo === 'function') mrfGo(url);
  else location.href = url;
}
window.openAccount = openAccount;
window.accountUsernameOf = accountUsernameOf;
window.accountHandleOf = accountHandleOf;

async function fetchPublicAccount(username) {
  const u = accountUsernameOf(username);
  if (!u || typeof mrfApi !== 'function') return null;
  try {
    return await mrfApi('/api/me?resource=account&u=' + encodeURIComponent(u));
  } catch (_) {
    return null;
  }
}
window.fetchPublicAccount = fetchPublicAccount;

async function searchAccountsApi(q) {
  const u = accountUsernameOf(q);
  if (!u || typeof mrfApi !== 'function') return [];
  try {
    const data = await mrfApi('/api/me?resource=accounts&q=' + encodeURIComponent(u) + '&limit=20');
    return Array.isArray(data?.items) ? data.items : [];
  } catch (_) {
    return [];
  }
}
window.searchAccountsApi = searchAccountsApi;

function accountLooksLikeNick(q) {
  const s = String(q || '').trim();
  if (!s) return false;
  if (s.startsWith('@')) return accountUsernameOf(s).length >= 1;
  return /^[a-zA-Z0-9_]+$/.test(s) && accountUsernameOf(s).length >= 1;
}
window.accountLooksLikeNick = accountLooksLikeNick;

function accountAvatarHTML(profile, sizeClass) {
  const name = profile?.name || profile?.username || '?';
  const letter = escHtml(String(name).replace(/^@+/, '')[0] || '?').toUpperCase();
  const cls = sizeClass || '';
  if (profile?.avatar) {
    return `<div class="profile-avatar ${cls}"><img src="${escHtml(profile.avatar)}" alt=""></div>`;
  }
  return `<div class="profile-avatar ${cls}">${letter}</div>`;
}

function accountCardHTML(profile) {
  const handle = accountHandleOf(profile?.username);
  const nick = accountUsernameOf(profile?.username);
  const name = profile?.name || handle || nick;
  const safeNick = typeof jsStr === 'function' ? jsStr(nick) : String(nick).replace(/'/g, "\\'");
  return `
    <button type="button" class="account-search-card" onclick="openAccount('${safeNick}')">
      ${accountAvatarHTML(profile, 'account-search-avatar')}
      <span class="account-search-meta">
        <span class="account-search-title">${escHtml(name)}</span>
        <span class="account-search-sub">${escHtml(handle)}</span>
      </span>
    </button>`;
}
window.accountCardHTML = accountCardHTML;

function renderAccountLibrary(box, data, opts) {
  if (!box) return;
  const albums = data?.albums || [];
  const artists = data?.artists || [];
  const playlists = data?.playlists || [];
  const empty = !albums.length && !artists.length && !playlists.length;

  let html = '';

  if (albums.length) {
    html += `<div class="section account-section">
      <div class="section-header"><h3 class="section-title" style="font-size:16px">Альбомы</h3></div>
      <div class="albums-grid">${albums.map((a) => {
        const id = a.id != null ? String(a.id) : '';
        const title = a.title || a.name || 'Альбом';
        const artist = a.artistName || a.artist?.name || a.artist || '';
        const cover = a.cover || a.cover_medium || a.album?.cover_medium || '';
        const sid = typeof jsStr === 'function' ? jsStr(id) : id.replace(/'/g, "\\'");
        const st = typeof jsStr === 'function' ? jsStr(title) : String(title).replace(/'/g, "\\'");
        const sa = typeof jsStr === 'function' ? jsStr(artist) : String(artist).replace(/'/g, "\\'");
        return `
        <div class="album-card" onclick="openSavedAlbum('${sid}','${st}','${sa}')">
          ${cover ? `<img class="album-cover" src="${escHtml(cover)}" alt="" loading="lazy">` : `<div class="album-cover-placeholder">${noteSVGShared()}</div>`}
          <div class="album-body">
            <div class="album-title">${escHtml(title)}</div>
            <div class="album-artist">${escHtml(artist)}</div>
          </div>
        </div>`;
      }).join('')}</div>
    </div>`;
  }

  if (artists.length) {
    html += `<div class="section account-section">
      <div class="section-header"><h3 class="section-title" style="font-size:16px">Исполнители</h3></div>
      <div class="artists-grid artists-grid-follow">${artists.map((a) => {
        const sid = a.id != null ? (typeof jsStr === 'function' ? jsStr(a.id) : String(a.id).replace(/'/g, "\\'")) : '';
        const sn = typeof jsStr === 'function' ? jsStr(a.name) : String(a.name || '').replace(/'/g, "\\'");
        const letter = escHtml((a.name || '?')[0]);
        return `
        <button type="button" class="artist-tile" onclick="openArtist(${sid ? `'${sid}'` : 'null'},'${sn}')">
          <span class="artist-tile-photo">
            ${a.picture ? `<img src="${escHtml(a.picture)}" alt="">` : `<span class="artist-tile-ph">${letter}</span>`}
          </span>
          <span class="artist-tile-meta">
            <span class="artist-tile-name">${escHtml(a.name || '')}</span>
            <span class="artist-tile-fans">Исполнитель</span>
          </span>
        </button>`;
      }).join('')}</div>
    </div>`;
  }

  if (playlists.length) {
    html += `<div class="section account-section">
      <div class="section-header"><h3 class="section-title" style="font-size:16px">Плейлисты</h3></div>
      <div class="lib-grid">${playlists.map((pl) => {
        const href = typeof mrfUrl === 'function' ? mrfUrl('playlist', { id: pl.id }) : `playlist.html?id=${encodeURIComponent(pl.id)}`;
        const handle = accountHandleOf(pl.author?.username || data?.profile?.username);
        return `
        <div class="lib-card" onclick="(window.mrfGo||function(u){location.href=u})('${href}')">
          ${pl.cover ? `<img src="${escHtml(pl.cover)}" class="lib-card-cover" alt="">` : `<div class="lib-card-cover-placeholder">${noteSVGShared()}</div>`}
          <div class="lib-card-body">
            <div class="lib-card-title">${escHtml(pl.name || 'Плейлист')}</div>
            <div class="lib-card-sub">${escHtml(handle || ((pl.trackCount || 0) + ' треков'))}</div>
          </div>
        </div>`;
      }).join('')}</div>
    </div>`;
  }

  if (empty) {
    html = `<div class="search-empty" style="padding:40px 0"><p style="color:var(--text-3)">Пока пусто</p></div>`;
  }

  box.innerHTML = html;
  if (typeof syncPlayingRows === 'function') syncPlayingRows();
  if (typeof syncFavIcons === 'function') syncFavIcons();
}
window.renderAccountLibrary = renderAccountLibrary;

function accountStatLabel(n, one, few, many) {
  const x = Math.abs(Number(n) || 0) % 100;
  const y = x % 10;
  if (x > 10 && x < 20) return many;
  if (y === 1) return one;
  if (y >= 2 && y <= 4) return few;
  return many;
}

function accountMosaicCovers(data) {
  const albums = data?.albums || [];
  const artists = data?.artists || [];
  const playlists = data?.playlists || [];
  const albumCovers = albums.map((a) => a.cover || a.cover_medium || a.album?.cover_medium || '').filter(Boolean);
  const artistCovers = artists.map((a) => a.picture || a.picture_medium || a.image || '').filter(Boolean);
  const playlistCovers = playlists.map((p) => p.cover || '').filter(Boolean);
  // Interleave album / artist / playlist covers
  const mixed = [];
  const max = Math.max(albumCovers.length, artistCovers.length, playlistCovers.length);
  for (let i = 0; i < max; i++) {
    if (albumCovers[i]) mixed.push(albumCovers[i]);
    if (artistCovers[i]) mixed.push(artistCovers[i]);
    if (playlistCovers[i]) mixed.push(playlistCovers[i]);
  }
  return mixed;
}

function accountMosaicHTML(covers) {
  if (!covers.length) return '';
  const cols = 4;
  const rows = 3;
  const total = cols * rows;
  const pool = [];
  while (pool.length < total) {
    for (let i = 0; i < covers.length && pool.length < total; i++) pool.push(covers[i]);
  }
  const rots = [-7, 5, -4, 6, -5, 4, -6, 3, -3, 7, -5, 4];
  return pool.map((src, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const left = 46 + col * 14.5 + (row % 2 ? 3.5 : 0);
    const top = 8 + row * 30;
    const rot = rots[i % rots.length];
    const z = row * cols + col + 1;
    return `<img class="liked-mosaic-cell account-mosaic-cell" src="${escHtml(src)}" alt="" loading="lazy" style="--c:${col};--r:${row};left:${left}%;top:${top}%;transform:rotate(${rot}deg);z-index:${z}">`;
  }).join('');
}

function renderAccountHero(box, profile, opts) {
  if (!box || !profile) return;
  const handle = accountHandleOf(profile.username);
  const bio = String(profile.bio || '').trim();
  const isSelf = !!(opts && opts.isSelf);
  const editMode = !!(opts && opts.editMode);
  const data = opts?.library || {};
  const counts = opts?.counts || {
    albums: (data.albums || []).length,
    artists: (data.artists || []).length,
    playlists: (data.playlists || []).length
  };
  const albumsN = Number(counts.albums) || 0;
  const artistsN = Number(counts.artists) || 0;
  const playlistsN = Number(counts.playlists) || 0;
  const parts = [];
  if (albumsN) parts.push(`${albumsN} ${accountStatLabel(albumsN, 'альбом', 'альбома', 'альбомов')}`);
  if (artistsN) parts.push(`${artistsN} ${accountStatLabel(artistsN, 'исполнитель', 'исполнителя', 'исполнителей')}`);
  if (playlistsN) parts.push(`${playlistsN} ${accountStatLabel(playlistsN, 'плейлист', 'плейлиста', 'плейлистов')}`);
  const statsLine = parts.join(' · ');
  const covers = accountMosaicCovers(data);
  const mosaic = accountMosaicHTML(covers);
  let actions = '';
  if (isSelf) {
    actions = editMode
      ? `<button type="button" class="btn-secondary account-edit-btn" onclick="setProfileEditMode(false)">Готово</button>`
      : `<button type="button" class="btn-secondary account-edit-btn" onclick="setProfileEditMode(true)">Редактировать</button>`;
  }
  box.innerHTML = `
    <section class="account-hero${!covers.length ? ' is-empty' : ''}">
      <div class="liked-mosaic account-mosaic" aria-hidden="true"${mosaic ? '' : ' hidden'}>${mosaic}</div>
      <div class="account-hero-scrim" aria-hidden="true"></div>
      <div class="account-hero-main">
        <div class="account-hero-top">
          <div class="profile-avatar-wrap account-avatar-wrap${isSelf && editMode ? '' : ' is-static'}">
            ${accountAvatarHTML(profile, 'account-hero-avatar')}
          </div>
          <div class="account-hero-meta">
            <div class="account-hero-kicker">Аккаунт</div>
            <h1 class="account-hero-name" id="profile-name-display">${escHtml(profile.name || handle)}</h1>
          </div>
        </div>
        <div class="account-hero-handle" id="profile-username-display">${escHtml(handle)}</div>
        ${bio
          ? `<p class="account-bio" id="profile-bio-display">${escHtml(bio)}</p>`
          : `<p class="account-bio" id="profile-bio-display" hidden></p>`}
        ${statsLine ? `<p class="account-hero-sub">${escHtml(statsLine)}</p>` : ''}
        ${actions ? `<div class="account-hero-actions">${actions}</div>` : ''}
      </div>
    </section>`;
}
window.renderAccountHero = renderAccountHero;
