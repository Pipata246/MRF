/* =====================================================
   MRF — Mock Data v2
   BACKEND TODO: Заменить все данные на реальные API-запросы
   ===================================================== */

const MOCK = {

  /* ── Пользователь ──────────────────────────────── */
  // BACKEND TODO: Получение профиля пользователя
  user: {
    id: 'user_demo',
    name: 'Пользователь',
    username: '@mrf_user',
    description: 'Любитель хорошей музыки',
    plan: 'MRF Free',
    avatar: null,
    joinedAt: '2024-01-01'
  },

  /* ── Настройки ─────────────────────────────────── */
  settings: {
    autoplay: true,
    shuffleOnPlay: false,
    quality: 'normal',
    rememberPosition: true,
    defaultVolume: 70,
    notifyReleases: true,
    notifyPlaylist: false,
    notifyNews: true,
    publicPlaylists: false,
    publicLiked: false,
    publicActivity: false,
    accentColor: '#EE90B7',
    theme: 'dark'
  },

  /* ── Треки ─────────────────────────────────────── */
  tracks: [
    { id: 't001', title: 'Blinding Lights', artistId: 'a001', artistName: 'The Weeknd', albumId: 'al001', albumTitle: 'After Hours', cover: 'https://e-cdns-images.dzcdn.net/images/cover/1a4fb4c9e854cfb7d4d44ba6c0f7c27d/250x250-000000-80-0-0.jpg', duration: 200, preview: null, year: 2019, genre: 'Pop' },
    { id: 't002', title: 'Save Your Tears', artistId: 'a001', artistName: 'The Weeknd', albumId: 'al001', albumTitle: 'After Hours', cover: 'https://e-cdns-images.dzcdn.net/images/cover/1a4fb4c9e854cfb7d4d44ba6c0f7c27d/250x250-000000-80-0-0.jpg', duration: 215, preview: null, year: 2020, genre: 'Pop' },
    { id: 't003', title: 'Levitating', artistId: 'a002', artistName: 'Dua Lipa', albumId: 'al002', albumTitle: 'Future Nostalgia', cover: 'https://e-cdns-images.dzcdn.net/images/cover/8a63a62bdfd5ca61d3b4c79aa30f0a0a/250x250-000000-80-0-0.jpg', duration: 203, preview: null, year: 2020, genre: 'Pop' },
    { id: 't004', title: "Don't Start Now", artistId: 'a002', artistName: 'Dua Lipa', albumId: 'al002', albumTitle: 'Future Nostalgia', cover: 'https://e-cdns-images.dzcdn.net/images/cover/8a63a62bdfd5ca61d3b4c79aa30f0a0a/250x250-000000-80-0-0.jpg', duration: 183, preview: null, year: 2019, genre: 'Pop' },
    { id: 't005', title: 'Stay', artistId: 'a003', artistName: 'The Kid LAROI', albumId: 'al003', albumTitle: 'F*CK LOVE 3', cover: 'https://e-cdns-images.dzcdn.net/images/cover/3a52c7b3f06d87d0a6023bcd08d3a99c/250x250-000000-80-0-0.jpg', duration: 141, preview: null, year: 2021, genre: 'Hip-Hop' },
    { id: 't006', title: 'Heat Waves', artistId: 'a004', artistName: 'Glass Animals', albumId: 'al004', albumTitle: 'Dreamland', cover: 'https://e-cdns-images.dzcdn.net/images/cover/1e6b8fa97e77da7e8e3461af37b7a3e8/250x250-000000-80-0-0.jpg', duration: 238, preview: null, year: 2020, genre: 'Indie' },
    { id: 't007', title: 'As It Was', artistId: 'a005', artistName: 'Harry Styles', albumId: 'al005', albumTitle: "Harry's House", cover: 'https://e-cdns-images.dzcdn.net/images/cover/fa0d57c4ccbc6f39cc56d5be9f98b82c/250x250-000000-80-0-0.jpg', duration: 167, preview: null, year: 2022, genre: 'Pop' },
    { id: 't008', title: 'Unholy', artistId: 'a006', artistName: 'Sam Smith', albumId: 'al006', albumTitle: 'Gloria', cover: 'https://e-cdns-images.dzcdn.net/images/cover/b8a2ae90b9c97e63c5bd63fd1e8e01fe/250x250-000000-80-0-0.jpg', duration: 156, preview: null, year: 2022, genre: 'Pop' },
    { id: 't009', title: 'Flowers', artistId: 'a007', artistName: 'Miley Cyrus', albumId: 'al007', albumTitle: 'Endless Summer Vacation', cover: 'https://e-cdns-images.dzcdn.net/images/cover/9c6e8ed4c0bfbe8b8b24b2b6c55d7de8/250x250-000000-80-0-0.jpg', duration: 200, preview: null, year: 2023, genre: 'Pop' },
    { id: 't010', title: 'Cruel Summer', artistId: 'a008', artistName: 'Taylor Swift', albumId: 'al008', albumTitle: 'Lover', cover: 'https://e-cdns-images.dzcdn.net/images/cover/4f9f2673c50d47f21cca5bc0e3dbc697/250x250-000000-80-0-0.jpg', duration: 178, preview: null, year: 2019, genre: 'Pop' },
    { id: 't011', title: 'Anti-Hero', artistId: 'a008', artistName: 'Taylor Swift', albumId: 'al009', albumTitle: 'Midnights', cover: 'https://e-cdns-images.dzcdn.net/images/cover/1b9b2b3f4c5d6e7f8a9b0c1d2e3f4a5b/250x250-000000-80-0-0.jpg', duration: 200, preview: null, year: 2022, genre: 'Pop' },
    { id: 't012', title: 'Good 4 U', artistId: 'a009', artistName: 'Olivia Rodrigo', albumId: 'al010', albumTitle: 'SOUR', cover: 'https://e-cdns-images.dzcdn.net/images/cover/1a4fb4c9e854cfb7d4d44ba6c0f7c27d/250x250-000000-80-0-0.jpg', duration: 178, preview: null, year: 2021, genre: 'Pop' },
    { id: 't013', title: 'Montero', artistId: 'a010', artistName: 'Lil Nas X', albumId: 'al011', albumTitle: 'Montero', cover: 'https://e-cdns-images.dzcdn.net/images/cover/8a63a62bdfd5ca61d3b4c79aa30f0a0a/250x250-000000-80-0-0.jpg', duration: 137, preview: null, year: 2021, genre: 'Hip-Hop' },
    { id: 't014', title: 'Shivers', artistId: 'a011', artistName: 'Ed Sheeran', albumId: 'al012', albumTitle: '=', cover: 'https://e-cdns-images.dzcdn.net/images/cover/fa0d57c4ccbc6f39cc56d5be9f98b82c/250x250-000000-80-0-0.jpg', duration: 207, preview: null, year: 2021, genre: 'Pop' },
    { id: 't015', title: 'Easy On Me', artistId: 'a012', artistName: 'Adele', albumId: 'al013', albumTitle: '30', cover: 'https://e-cdns-images.dzcdn.net/images/cover/4f9f2673c50d47f21cca5bc0e3dbc697/250x250-000000-80-0-0.jpg', duration: 224, preview: null, year: 2021, genre: 'Pop' },
    { id: 't016', title: 'Enemy', artistId: 'a013', artistName: 'Imagine Dragons', albumId: 'al014', albumTitle: 'Mercury', cover: 'https://e-cdns-images.dzcdn.net/images/cover/9c6e8ed4c0bfbe8b8b24b2b6c55d7de8/250x250-000000-80-0-0.jpg', duration: 173, preview: null, year: 2021, genre: 'Rock' },
    { id: 't017', title: 'Industry Baby', artistId: 'a010', artistName: 'Lil Nas X', albumId: 'al011', albumTitle: 'Montero', cover: 'https://e-cdns-images.dzcdn.net/images/cover/8a63a62bdfd5ca61d3b4c79aa30f0a0a/250x250-000000-80-0-0.jpg', duration: 212, preview: null, year: 2021, genre: 'Hip-Hop' },
    { id: 't018', title: 'Cold Heart', artistId: 'a014', artistName: 'Elton John', albumId: 'al015', albumTitle: 'The Lockdown Sessions', cover: 'https://e-cdns-images.dzcdn.net/images/cover/1b9b2b3f4c5d6e7f8a9b0c1d2e3f4a5b/250x250-000000-80-0-0.jpg', duration: 219, preview: null, year: 2021, genre: 'Pop' },
    { id: 't019', title: 'Butter', artistId: 'a015', artistName: 'BTS', albumId: 'al016', albumTitle: 'Butter', cover: 'https://e-cdns-images.dzcdn.net/images/cover/1a4fb4c9e854cfb7d4d44ba6c0f7c27d/250x250-000000-80-0-0.jpg', duration: 164, preview: null, year: 2021, genre: 'K-Pop' },
    { id: 't020', title: 'Peaches', artistId: 'a016', artistName: 'Justin Bieber', albumId: 'al017', albumTitle: 'Justice', cover: 'https://e-cdns-images.dzcdn.net/images/cover/fa0d57c4ccbc6f39cc56d5be9f98b82c/250x250-000000-80-0-0.jpg', duration: 198, preview: null, year: 2021, genre: 'Pop' },
  ],

  /* ── Исполнители ───────────────────────────────── */
  artists: [
    { id: 'a001', name: 'The Weeknd', picture: 'https://e-cdns-images.dzcdn.net/images/artist/4f9f2673c50d47f21cca5bc0e3dbc697/250x250-000000-80-0-0.jpg', fans: 42000000, bio: 'Канадский певец, автор песен и продюсер. Известен своим уникальным стилем, сочетающим R&B, поп и электронику.', genre: 'R&B' },
    { id: 'a002', name: 'Dua Lipa', picture: 'https://e-cdns-images.dzcdn.net/images/artist/9c6e8ed4c0bfbe8b8b24b2b6c55d7de8/250x250-000000-80-0-0.jpg', fans: 38000000, bio: 'Британская певица и автор песен, покорившая мир своими хитами в стиле поп и диско.', genre: 'Pop' },
    { id: 'a003', name: 'The Kid LAROI', picture: 'https://e-cdns-images.dzcdn.net/images/artist/9b2cc87ccddc7b75d94c0e4e3a4e3e23/250x250-000000-80-0-0.jpg', fans: 15000000, bio: 'Австралийский рэпер и певец, стремительно завоевавший мировую популярность.', genre: 'Hip-Hop' },
    { id: 'a004', name: 'Glass Animals', picture: 'https://e-cdns-images.dzcdn.net/images/artist/4f9f2673c50d47f21cca5bc0e3dbc697/250x250-000000-80-0-0.jpg', fans: 12000000, bio: 'Британская инди-поп группа, известная психоделическим звучанием и необычными текстами.', genre: 'Indie' },
    { id: 'a005', name: 'Harry Styles', picture: 'https://e-cdns-images.dzcdn.net/images/artist/9c6e8ed4c0bfbe8b8b24b2b6c55d7de8/250x250-000000-80-0-0.jpg', fans: 29000000, bio: 'Британский певец, бывший участник One Direction, сольная карьера которого охватывает поп, рок и соул.', genre: 'Pop' },
    { id: 'a006', name: 'Sam Smith', picture: 'https://e-cdns-images.dzcdn.net/images/artist/4f9f2673c50d47f21cca5bc0e3dbc697/250x250-000000-80-0-0.jpg', fans: 22000000, bio: 'Британский певец, известный своим пронзительным голосом и эмоциональными балладами.', genre: 'Pop' },
    { id: 'a007', name: 'Miley Cyrus', picture: 'https://e-cdns-images.dzcdn.net/images/artist/9b2cc87ccddc7b75d94c0e4e3a4e3e23/250x250-000000-80-0-0.jpg', fans: 31000000, bio: 'Американская певица и актриса, прошедшая путь от Disney-звезды до рок-иконы.', genre: 'Pop' },
    { id: 'a008', name: 'Taylor Swift', picture: 'https://e-cdns-images.dzcdn.net/images/artist/9c6e8ed4c0bfbe8b8b24b2b6c55d7de8/250x250-000000-80-0-0.jpg', fans: 65000000, bio: 'Американская певица и автор песен, одна из самых продаваемых музыкальных артистов всех времён.', genre: 'Pop' },
    { id: 'a009', name: 'Olivia Rodrigo', picture: 'https://e-cdns-images.dzcdn.net/images/artist/4f9f2673c50d47f21cca5bc0e3dbc697/250x250-000000-80-0-0.jpg', fans: 25000000, bio: 'Молодая американская певица, дебютный альбом которой стал культурным феноменом.', genre: 'Pop' },
    { id: 'a010', name: 'Lil Nas X', picture: 'https://e-cdns-images.dzcdn.net/images/artist/9b2cc87ccddc7b75d94c0e4e3a4e3e23/250x250-000000-80-0-0.jpg', fans: 18000000, bio: 'Американский рэпер и певец, известный провокационным стилем и хитами Old Town Road и Montero.', genre: 'Hip-Hop' },
  ],

  /* ── Альбомы ───────────────────────────────────── */
  albums: [
    { id: 'al001', title: 'After Hours', artistId: 'a001', artistName: 'The Weeknd', cover: 'https://e-cdns-images.dzcdn.net/images/cover/1a4fb4c9e854cfb7d4d44ba6c0f7c27d/250x250-000000-80-0-0.jpg', year: 2020, trackCount: 14, duration: 2860, genre: 'R&B' },
    { id: 'al002', title: 'Future Nostalgia', artistId: 'a002', artistName: 'Dua Lipa', cover: 'https://e-cdns-images.dzcdn.net/images/cover/8a63a62bdfd5ca61d3b4c79aa30f0a0a/250x250-000000-80-0-0.jpg', year: 2020, trackCount: 11, duration: 2340, genre: 'Pop' },
    { id: 'al003', title: 'F*CK LOVE 3', artistId: 'a003', artistName: 'The Kid LAROI', cover: 'https://e-cdns-images.dzcdn.net/images/cover/3a52c7b3f06d87d0a6023bcd08d3a99c/250x250-000000-80-0-0.jpg', year: 2021, trackCount: 16, duration: 2200, genre: 'Hip-Hop' },
    { id: 'al004', title: 'Dreamland', artistId: 'a004', artistName: 'Glass Animals', cover: 'https://e-cdns-images.dzcdn.net/images/cover/1e6b8fa97e77da7e8e3461af37b7a3e8/250x250-000000-80-0-0.jpg', year: 2020, trackCount: 12, duration: 2560, genre: 'Indie' },
    { id: 'al005', title: "Harry's House", artistId: 'a005', artistName: 'Harry Styles', cover: 'https://e-cdns-images.dzcdn.net/images/cover/fa0d57c4ccbc6f39cc56d5be9f98b82c/250x250-000000-80-0-0.jpg', year: 2022, trackCount: 13, duration: 2220, genre: 'Pop' },
    { id: 'al008', title: 'Lover', artistId: 'a008', artistName: 'Taylor Swift', cover: 'https://e-cdns-images.dzcdn.net/images/cover/4f9f2673c50d47f21cca5bc0e3dbc697/250x250-000000-80-0-0.jpg', year: 2019, trackCount: 18, duration: 3360, genre: 'Pop' },
    { id: 'al009', title: 'Midnights', artistId: 'a008', artistName: 'Taylor Swift', cover: 'https://e-cdns-images.dzcdn.net/images/cover/1b9b2b3f4c5d6e7f8a9b0c1d2e3f4a5b/250x250-000000-80-0-0.jpg', year: 2022, trackCount: 13, duration: 2470, genre: 'Pop' },
    { id: 'al010', title: 'SOUR', artistId: 'a009', artistName: 'Olivia Rodrigo', cover: 'https://e-cdns-images.dzcdn.net/images/cover/1a4fb4c9e854cfb7d4d44ba6c0f7c27d/250x250-000000-80-0-0.jpg', year: 2021, trackCount: 11, duration: 1890, genre: 'Pop' },
    { id: 'al011', title: 'Montero', artistId: 'a010', artistName: 'Lil Nas X', cover: 'https://e-cdns-images.dzcdn.net/images/cover/8a63a62bdfd5ca61d3b4c79aa30f0a0a/250x250-000000-80-0-0.jpg', year: 2021, trackCount: 15, duration: 2520, genre: 'Hip-Hop' },
  ],

  /* ── Плейлисты ─────────────────────────────────── */
  playlists: [],

  /* ── Подписки на артистов ──────────────────────── */
  followedArtists: [],

  /* ── Чарты ─────────────────────────────────────── */
  // BACKEND TODO: Получение чартов по регионам
  chartRegions: [
    { id: 0, label: 'Мировой', dzId: 0 },
    { id: 1, label: 'Россия', dzId: 116 },
    { id: 2, label: 'США', dzId: 23 },
    { id: 3, label: 'Великобритания', dzId: 1316 },
    { id: 4, label: 'Европа', dzId: 0 },
  ],
  chartPeriods: ['За неделю', 'За месяц'],
  chartGenres: ['Все жанры', 'Поп', 'Рэп', 'Хип-хоп', 'Электронная', 'Рок'],

  /* ── Настроения / Жанровые подборки ───────────── */
  moods: [
    { id: 'mood1', name: 'Для работы',    tag: 'focus work',       color: '#6C63FF' },
    { id: 'mood2', name: 'Расслабиться',  tag: 'chill relax',      color: '#43B89C' },
    { id: 'mood3', name: 'Тренировка',    tag: 'workout sport',    color: '#FF6B6B' },
    { id: 'mood4', name: 'Вечеринка',     tag: 'party dance',      color: '#F7B731' },
    { id: 'mood5', name: 'Грустить',      tag: 'sad emotional',    color: '#778CA3' },
    { id: 'mood6', name: 'Утро',          tag: 'morning acoustic', color: '#FD9644' },
  ],

  /* ── История поиска ────────────────────────────── */
  searchHistory: [],
};

/* ══════════════════════════════════
   STORAGE — единый механизм
══════════════════════════════════ */
const Store = {
  keys: {
    favs:      'mrf_favs',
    playlists: 'mrf_playlists',
    followed:  'mrf_followed',
    recent:    'mrf_recent',
    profile:   'mrf_profile',
    settings:  'mrf_settings',
    history:   'mrf_search_history',
    queue:     'mrf_queue',
    player:    'mrf_player',
    albums:    'mrf_albums',
    panel:     'mrf_right_panel',
  },

  _get(key, def) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : def;
    } catch { return def; }
  },

  _set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  },

  /* Избранное */
  getFavs()       { return this._get(this.keys.favs, []); },
  setFavs(v)      { this._set(this.keys.favs, v); },
  isFav(title, artist) {
    return this.getFavs().some(f => f.title === title && f.artist === artist);
  },
  toggleFav(track) {
    let favs = this.getFavs();
    const key = { title: track.title, artist: track.artistName || track.artist?.name || track.artist || '' };
    const exists = favs.some(f => f.title === key.title && f.artist === key.artist);
    if (exists) {
      favs = favs.filter(f => !(f.title === key.title && f.artist === key.artist));
    } else {
      favs.push({
        id: track.id, title: track.title,
        artist: key.artist,
        cover: track.cover || track.album?.cover_medium || '',
        duration: track.duration || 0,
        preview: track.preview || null,
        addedAt: Date.now()
      });
    }
    this.setFavs(favs);
    return !exists;
  },

  /* Плейлисты */
  getPlaylists()  { return this._get(this.keys.playlists, []); },
  setPlaylists(v) { this._set(this.keys.playlists, v); MOCK.playlists = v; },
  createPlaylist(name, desc = '') {
    const pl = {
      id: 'pl_' + Date.now(),
      name, description: desc,
      cover: null, trackCount: 0,
      createdAt: Date.now(), tracks: []
    };
    const pls = this.getPlaylists();
    pls.unshift(pl);
    this.setPlaylists(pls);
    return pl;
  },
  updatePlaylist(id, data) {
    const pls = this.getPlaylists().map(p => p.id === id ? { ...p, ...data } : p);
    this.setPlaylists(pls);
  },
  deletePlaylist(id) {
    this.setPlaylists(this.getPlaylists().filter(p => p.id !== id));
  },
  addTrackToPlaylist(playlistId, track) {
    const pls = this.getPlaylists();
    const pl = pls.find(p => p.id === playlistId);
    if (!pl) return;
    if (!pl.tracks.some(t => t.id === track.id)) {
      pl.tracks.push({ ...track, addedAt: Date.now() });
      pl.trackCount = pl.tracks.length;
      if (!pl.cover && (track.cover || track.album?.cover_medium))
        pl.cover = track.cover || track.album?.cover_medium;
    }
    this.setPlaylists(pls);
  },
  removeTrackFromPlaylist(playlistId, trackId) {
    const pls = this.getPlaylists();
    const pl = pls.find(p => p.id === playlistId);
    if (!pl) return;
    pl.tracks = pl.tracks.filter(t => t.id !== trackId);
    pl.trackCount = pl.tracks.length;
    this.setPlaylists(pls);
  },
  getPlaylist(id) { return this.getPlaylists().find(p => p.id === id); },

  /* Подписки */
  getFollowed()   { return this._get(this.keys.followed, []); },
  setFollowed(v)  { this._set(this.keys.followed, v); },
  isFollowing(id) { return this.getFollowed().some(a => a.id === String(id)); },
  toggleFollow(artist) {
    let arr = this.getFollowed();
    const id = String(artist.id || artist.deezerId || '');
    const exists = arr.some(a => a.id === id);
    if (exists) arr = arr.filter(a => a.id !== id);
    else arr.unshift({ id, name: artist.name, picture: artist.picture || artist.picture_medium || '', fans: artist.nb_fan || artist.fans || 0 });
    this.setFollowed(arr);
    return !exists;
  },

  /* Недавно прослушанное */
  getRecent()     { return this._get(this.keys.recent, []); },
  addRecent(track) {
    let arr = this.getRecent();
    arr = arr.filter(t => t.id !== track.id);
    arr.unshift({ id: track.id, title: track.title, artist: track.artistName || track.artist?.name || '', cover: track.cover || track.album?.cover_medium || '', addedAt: Date.now() });
    if (arr.length > 20) arr = arr.slice(0, 20);
    this._set(this.keys.recent, arr);
  },

  /* Профиль */
  getProfile()    { return { ...MOCK.user, ...this._get(this.keys.profile, {}) }; },
  setProfile(v)   { this._set(this.keys.profile, v); },

  /* Настройки */
  getSettings()   { return { ...MOCK.settings, ...this._get(this.keys.settings, {}) }; },
  setSettings(v)  { this._set(this.keys.settings, { ...this.getSettings(), ...v }); },

  /* История поиска */
  getHistory()    { return this._get(this.keys.history, []); },
  addHistory(q)   {
    if (!q?.trim()) return;
    let arr = this.getHistory().filter(h => h !== q.trim());
    arr.unshift(q.trim());
    if (arr.length > 20) arr = arr.slice(0, 20);
    this._set(this.keys.history, arr);
  },
  clearHistory()  { this._set(this.keys.history, []); },

  /* Очередь и плеер */
  getQueue()      { return this._get(this.keys.queue, { queue: [], index: -1 }); },
  setQueue(queue, index) { this._set(this.keys.queue, { queue, index }); },
  getPlayerState(){ return this._get(this.keys.player, { volume: 70, muted: false }); },
  setPlayerState(v){ this._set(this.keys.player, { ...this.getPlayerState(), ...v }); },

  /* Сохранённые альбомы */
  getAlbums() { return this._get(this.keys.albums, []); },
  setAlbums(v){ this._set(this.keys.albums, v); },
  isAlbumSaved(id) { return this.getAlbums().some(a => String(a.id) === String(id)); },
  toggleAlbum(album) {
    let arr = this.getAlbums();
    const id = String(album.id);
    const exists = arr.some(a => String(a.id) === id);
    if (exists) arr = arr.filter(a => String(a.id) !== id);
    else arr.unshift({
      id: album.id,
      title: album.title || album.name || '',
      artistName: album.artistName || album.artist?.name || '',
      cover: album.cover || album.cover_medium || album.album?.cover_medium || '',
      year: album.year || album.release_date || '',
      trackCount: album.trackCount || album.nb_tracks || 0,
      savedAt: Date.now()
    });
    this.setAlbums(arr);
    return !exists;
  },

  /* Правая панель */
  getPanelState() { return this._get(this.keys.panel, { open: false, tab: 'now' }); },
  setPanelState(v){ this._set(this.keys.panel, { ...this.getPanelState(), ...v }); },

  /* Сброс */
  reset() {
    Object.values(this.keys).forEach(k => localStorage.removeItem(k));
    MOCK.playlists = [];
    MOCK.followedArtists = [];
  }
};

/* ── Инициализация ──────────────────────────────── */
(function initStore() {
  MOCK.playlists       = Store.getPlaylists();
  MOCK.followedArtists = Store.getFollowed();
  MOCK.searchHistory   = Store.getHistory();
})();

/* ── Утилиты ────────────────────────────────────── */
function mockGetTrack(id)   { return MOCK.tracks.find(t => t.id === id); }
function mockGetArtist(id)  { return MOCK.artists.find(a => a.id === id); }
function mockGetAlbum(id)   { return MOCK.albums.find(a => a.id === id); }
function mockGetAlbumTracks(albumId) { return MOCK.tracks.filter(t => t.albumId === albumId); }
function mockGetArtistTracks(artistId) { return MOCK.tracks.filter(t => t.artistId === artistId); }
function mockGetArtistAlbums(artistId) { return MOCK.albums.filter(a => a.artistId === artistId); }

// BACKEND TODO: Создание нового плейлиста
function mockCreatePlaylist(name, desc) { return Store.createPlaylist(name, desc); }
// BACKEND TODO: Удаление плейлиста
function mockDeletePlaylist(id) { Store.deletePlaylist(id); }
// BACKEND TODO: Добавление трека в плейлист
function mockAddToPlaylist(playlistId, track) { Store.addTrackToPlaylist(playlistId, track); }
// BACKEND TODO: Удаление трека из плейлиста
function mockRemoveFromPlaylist(playlistId, trackId) { Store.removeTrackFromPlaylist(playlistId, trackId); }
