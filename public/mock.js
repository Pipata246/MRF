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
    rememberPosition: true,
    defaultVolume: 70,
    accentColor: '#EE90B7',
    accentColorDark: '#EE90B7',
    accentColorLight: '#E35A90',
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
  // BACKEND TODO: Получение мировых чартов
  chartPeriods: ['За неделю', 'За месяц'],
  chartGenres: ['Все жанры', 'Поп', 'Рэп', 'Хип-хоп', 'Электронная', 'Рок'],

  /* ── Настроения / Жанровые подборки ───────────── */
  moods: [
    {
      id: 'mood1', name: 'В работу', tag: 'focus work', color: '#3d4a5c',
      hint: 'Спокойный фокус без отвлечений',
      image: 'https://images.unsplash.com/photo-1497032628192-86f99bcd76bc?auto=format&fit=crop&w=640&q=80'
    },
    {
      id: 'mood2', name: 'Отдохнуть', tag: 'chill relax', color: '#2f4f45',
      hint: 'Мягкий саунд для вечера дома',
      image: 'https://images.unsplash.com/photo-1519692933481-e162a57d6721?auto=format&fit=crop&w=640&q=80'
    },
    {
      id: 'mood3', name: 'Тренировка', tag: 'workout sport', color: '#5a3030',
      hint: 'Темп и драйв на разгон',
      image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=640&q=80'
    },
    {
      id: 'mood4', name: 'Вечеринка', tag: 'party dance', color: '#5a4520',
      hint: 'Громче, быстрее, в движение',
      image: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=640&q=80'
    },
    {
      id: 'mood5', name: 'Погрустить', tag: 'sad emotional', color: '#2e3a48',
      hint: 'Тихие треки, когда нужно побыть с собой',
      image: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=640&q=80'
    },
    {
      id: 'mood6', name: 'С добрым утром', tag: 'morning acoustic', color: '#5a4028',
      hint: 'Лёгкий старт дня',
      image: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=640&q=80'
    },
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
  isFav(titleOrTrack, artist) {
    const favs = this.getFavs();
    if (titleOrTrack && typeof titleOrTrack === 'object') {
      const t = titleOrTrack;
      const tid = t.id != null ? String(t.id) : '';
      const title = t.title || '';
      const art = t.artistName || t.artist?.name || t.artist || '';
      return favs.some(f =>
        (tid && f.id != null && String(f.id) === tid) ||
        (f.title === title && f.artist === art)
      );
    }
    const title = titleOrTrack || '';
    return favs.some(f => f.title === title && f.artist === (artist || ''));
  },
  toggleFav(track) {
    let favs = this.getFavs();
    const tid = track.id != null ? String(track.id) : '';
    const key = { title: track.title, artist: track.artistName || track.artist?.name || track.artist || '' };
    const exists = favs.some(f =>
      (tid && f.id != null && String(f.id) === tid) ||
      (f.title === key.title && f.artist === key.artist)
    );
    if (exists) {
      favs = favs.filter(f => {
        if (tid && f.id != null && String(f.id) === tid) return false;
        if (f.title === key.title && f.artist === key.artist) return false;
        return true;
      });
    } else {
      favs.push({
        id: track.id, title: track.title,
        artist: key.artist,
        artistId: track.artist?.id || track.artistId || null,
        cover: track.cover || track.album?.cover_medium || '',
        albumId: track.album?.id || track.albumId || null,
        albumTitle: track.album?.title || '',
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
    const sid = String(id);
    const pls = this.getPlaylists().map(p => String(p.id) === sid ? { ...p, ...data } : p);
    this.setPlaylists(pls);
  },
  deletePlaylist(id) {
    const sid = String(id);
    this.setPlaylists(this.getPlaylists().filter(p => String(p.id) !== sid));
  },
  addTrackToPlaylist(playlistId, track) {
    if (!track) return;
    const sid = String(playlistId);
    const pls = this.getPlaylists();
    const pl = pls.find(p => String(p.id) === sid);
    if (!pl) return;
    const tid = track.id != null ? String(track.id) : '';
    const norm = {
      id: track.id,
      title: track.title || '',
      artistName: track.artistName || track.artist?.name || track.artist || '',
      artist: track.artist?.name || track.artistName || track.artist || '',
      cover: track.cover || track.album?.cover_medium || '',
      album: track.album || { cover_medium: track.cover || '' },
      duration: track.duration || 0,
      preview: track.preview || null,
      addedAt: Date.now()
    };
    if (!pl.tracks) pl.tracks = [];
    if (tid && pl.tracks.some(t => String(t.id) === tid)) {
      this.setPlaylists(pls);
      return;
    }
    pl.tracks.push(norm);
    pl.trackCount = pl.tracks.length;
    if (!pl.cover && norm.cover) pl.cover = norm.cover;
    this.setPlaylists(pls);
  },
  removeTrackFromPlaylist(playlistId, trackId) {
    const sid = String(playlistId);
    const tid = String(trackId);
    const pls = this.getPlaylists();
    const pl = pls.find(p => String(p.id) === sid);
    if (!pl) return;
    pl.tracks = (pl.tracks || []).filter(t => String(t.id) !== tid);
    pl.trackCount = pl.tracks.length;
    this.setPlaylists(pls);
  },
  getPlaylist(id) {
    const sid = String(id || '');
    return this.getPlaylists().find(p => String(p.id) === sid) || null;
  },

  /* Подписки */
  getFollowed()   { return this._get(this.keys.followed, []); },
  setFollowed(v)  { this._set(this.keys.followed, v); MOCK.followedArtists = v; },
  isFollowing(id) { return this.getFollowed().some(a => String(a.id) === String(id)); },
  toggleFollow(artist) {
    let arr = this.getFollowed();
    const id = String(artist.id || artist.deezerId || '');
    if (!id || id === 'undefined' || id === 'null') return false;
    const exists = arr.some(a => String(a.id) === id);
    if (exists) arr = arr.filter(a => String(a.id) !== id);
    else arr.unshift({
      id,
      name: artist.name || '',
      picture: artist.picture || artist.picture_medium || '',
      fans: artist.nb_fan || artist.fans || 0
    });
    this.setFollowed(arr);
    return !exists;
  },

  /* Недавно прослушанное */
  getRecent()     { return this._get(this.keys.recent, []); },
  addRecent(track) {
    let arr = this.getRecent();
    arr = arr.filter(t => String(t.id) !== String(track.id));
    arr.unshift({
      id: track.id,
      deezerId: track.deezerId || (String(track.id || '').startsWith('dz_') ? String(track.id).slice(3) : null),
      title: track.title,
      artist: track.artistName || track.artist?.name || '',
      artistId: track.artist?.id || track.artistId || null,
      cover: track.cover || track.album?.cover_medium || track.album?.cover || '',
      preview: track.preview || null,
      duration: track.duration || 0,
      source: track.source || null,
      addedAt: Date.now()
    });
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
    const t = (q || '').trim();
    if (t.length < 2) return;
    const tl = t.toLowerCase();
    // Drop prefix/incomplete siblings so "pla" / "play" don't sit next to "playboi carti"
    let arr = this.getHistory().filter(h => {
      const hl = String(h || '').trim().toLowerCase();
      if (!hl || hl === tl) return false;
      if (tl.startsWith(hl) || hl.startsWith(tl)) return false;
      return true;
    });
    arr.unshift(t);
    if (arr.length > 12) arr = arr.slice(0, 12);
    this._set(this.keys.history, arr);
  },
  clearHistory()  { this._set(this.keys.history, []); },
  pruneHistory()  {
    const raw = this.getHistory();
    const kept = [];
    raw.forEach(h => {
      const t = String(h || '').trim();
      if (t.length < 2) return;
      const tl = t.toLowerCase();
      const worse = kept.findIndex(x => {
        const xl = x.toLowerCase();
        return xl.startsWith(tl) || tl.startsWith(xl);
      });
      if (worse === -1) kept.push(t);
      else if (t.length > kept[worse].length) kept[worse] = t;
    });
    this._set(this.keys.history, kept.slice(0, 12));
    return kept;
  },

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
    MOCK.searchHistory = [];
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
