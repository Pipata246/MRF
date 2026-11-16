/* =====================================================
   MRF — Mock Data
   Все демонстрационные данные для frontend.
   BACKEND TODO: Заменить на реальные API-запросы.
   ===================================================== */

const MOCK = {

  /* ── Пользователь ──────────────────────────────── */
  // BACKEND TODO: Получение профиля пользователя
  user: {
    id: 'user_demo',
    name: 'Пользователь',
    plan: 'MRF Free',
    avatar: null,
    joinedAt: '2024-01-01'
  },

  /* ── Треки ─────────────────────────────────────── */
  // BACKEND TODO: Получение рекомендаций с сервера
  recentlyPlayed: [
    { id: 'm1', title: 'Blinding Lights', artist: { name: 'The Weeknd' }, album: { title: 'After Hours', cover_medium: 'https://e-cdns-images.dzcdn.net/images/cover/1a4fb4c9e854cfb7d4d44ba6c0f7c27d/250x250-000000-80-0-0.jpg' }, duration: 200, preview: null },
    { id: 'm2', title: 'Levitating', artist: { name: 'Dua Lipa' }, album: { title: 'Future Nostalgia', cover_medium: 'https://e-cdns-images.dzcdn.net/images/cover/8a63a62bdfd5ca61d3b4c79aa30f0a0a/250x250-000000-80-0-0.jpg' }, duration: 203, preview: null },
    { id: 'm3', title: 'Stay', artist: { name: 'The Kid LAROI' }, album: { title: 'F*CK LOVE 3', cover_medium: 'https://e-cdns-images.dzcdn.net/images/cover/3a52c7b3f06d87d0a6023bcd08d3a99c/250x250-000000-80-0-0.jpg' }, duration: 141, preview: null },
    { id: 'm4', title: 'Heat Waves', artist: { name: 'Glass Animals' }, album: { title: 'Dreamland', cover_medium: 'https://e-cdns-images.dzcdn.net/images/cover/1e6b8fa97e77da7e8e3461af37b7a3e8/250x250-000000-80-0-0.jpg' }, duration: 238, preview: null },
    { id: 'm5', title: 'As It Was', artist: { name: 'Harry Styles' }, album: { title: "Harry's House", cover_medium: 'https://e-cdns-images.dzcdn.net/images/cover/fa0d57c4ccbc6f39cc56d5be9f98b82c/250x250-000000-80-0-0.jpg' }, duration: 167, preview: null },
    { id: 'm6', title: 'Unholy', artist: { name: 'Sam Smith' }, album: { title: 'Gloria', cover_medium: 'https://e-cdns-images.dzcdn.net/images/cover/b8a2ae90b9c97e63c5bd63fd1e8e01fe/250x250-000000-80-0-0.jpg' }, duration: 156, preview: null },
  ],

  /* ── Плейлисты ─────────────────────────────────── */
  // BACKEND TODO: Получение плейлистов пользователя
  playlists: [
    { id: 'pl1', name: 'Утренний драйв', description: 'Для бодрого начала дня', trackCount: 24, cover: 'https://e-cdns-images.dzcdn.net/images/cover/1a4fb4c9e854cfb7d4d44ba6c0f7c27d/250x250-000000-80-0-0.jpg', createdAt: '2024-03-15', tracks: [] },
    { id: 'pl2', name: 'Вечерняя атмосфера', description: 'Расслабляющие треки', trackCount: 18, cover: 'https://e-cdns-images.dzcdn.net/images/cover/8a63a62bdfd5ca61d3b4c79aa30f0a0a/250x250-000000-80-0-0.jpg', createdAt: '2024-02-20', tracks: [] },
    { id: 'pl3', name: 'Тренировка', description: 'Максимальная энергия', trackCount: 32, cover: 'https://e-cdns-images.dzcdn.net/images/cover/fa0d57c4ccbc6f39cc56d5be9f98b82c/250x250-000000-80-0-0.jpg', createdAt: '2024-01-10', tracks: [] },
  ],

  /* ── Артисты ───────────────────────────────────── */
  // BACKEND TODO: Получение подписок на артистов
  followedArtists: [
    { id: 'a1', name: 'The Weeknd', picture_medium: 'https://e-cdns-images.dzcdn.net/images/artist/4f9f2673c50d47f21cca5bc0e3dbc697/250x250-000000-80-0-0.jpg', nb_fan: 42000000 },
    { id: 'a2', name: 'Drake', picture_medium: 'https://e-cdns-images.dzcdn.net/images/artist/9c6e8ed4c0bfbe8b8b24b2b6c55d7de8/250x250-000000-80-0-0.jpg', nb_fan: 56000000 },
    { id: 'a3', name: 'Billie Eilish', picture_medium: 'https://e-cdns-images.dzcdn.net/images/artist/9b2cc87ccddc7b75d94c0e4e3a4e3e23/250x250-000000-80-0-0.jpg', nb_fan: 38000000 },
    { id: 'a4', name: 'Post Malone', picture_medium: 'https://e-cdns-images.dzcdn.net/images/artist/1b9b2b3f4c5d6e7f8a9b0c1d2e3f4a5b/250x250-000000-80-0-0.jpg', nb_fan: 29000000 },
  ],

  /* ── Рекомендации ──────────────────────────────── */
  // BACKEND TODO: Персональные рекомендации на основе истории прослушиваний
  recommendations: [
    { id: 'r1', title: 'Flowers', artist: { name: 'Miley Cyrus' }, album: { title: 'Endless Summer Vacation', cover_medium: 'https://e-cdns-images.dzcdn.net/images/cover/9c6e8ed4c0bfbe8b8b24b2b6c55d7de8/250x250-000000-80-0-0.jpg' }, duration: 200, preview: null },
    { id: 'r2', title: 'Cruel Summer', artist: { name: 'Taylor Swift' }, album: { title: 'Lover', cover_medium: 'https://e-cdns-images.dzcdn.net/images/cover/4f9f2673c50d47f21cca5bc0e3dbc697/250x250-000000-80-0-0.jpg' }, duration: 178, preview: null },
    { id: 'r3', title: 'Anti-Hero', artist: { name: 'Taylor Swift' }, album: { title: 'Midnights', cover_medium: 'https://e-cdns-images.dzcdn.net/images/cover/1b9b2b3f4c5d6e7f8a9b0c1d2e3f4a5b/250x250-000000-80-0-0.jpg' }, duration: 200, preview: null },
    { id: 'r4', title: 'Montero', artist: { name: 'Lil Nas X' }, album: { title: 'Montero', cover_medium: 'https://e-cdns-images.dzcdn.net/images/cover/8a63a62bdfd5ca61d3b4c79aa30f0a0a/250x250-000000-80-0-0.jpg' }, duration: 137, preview: null },
    { id: 'r5', title: 'Industry Baby', artist: { name: 'Lil Nas X' }, album: { title: 'Montero', cover_medium: 'https://e-cdns-images.dzcdn.net/images/cover/fa0d57c4ccbc6f39cc56d5be9f98b82c/250x250-000000-80-0-0.jpg' }, duration: 212, preview: null },
    { id: 'r6', title: 'Good 4 U', artist: { name: 'Olivia Rodrigo' }, album: { title: 'SOUR', cover_medium: 'https://e-cdns-images.dzcdn.net/images/cover/1a4fb4c9e854cfb7d4d44ba6c0f7c27d/250x250-000000-80-0-0.jpg' }, duration: 178, preview: null },
  ],

  /* ── Новинки ───────────────────────────────────── */
  // BACKEND TODO: Получение новых релизов
  newReleases: [
    { id: 'nr1', title: 'New Album 1', artist: 'Artist One', cover: 'https://e-cdns-images.dzcdn.net/images/cover/9c6e8ed4c0bfbe8b8b24b2b6c55d7de8/250x250-000000-80-0-0.jpg', year: 2026, type: 'album' },
    { id: 'nr2', title: 'Single Drop', artist: 'Artist Two', cover: 'https://e-cdns-images.dzcdn.net/images/cover/4f9f2673c50d47f21cca5bc0e3dbc697/250x250-000000-80-0-0.jpg', year: 2026, type: 'single' },
    { id: 'nr3', title: 'Fresh Beats', artist: 'Artist Three', cover: 'https://e-cdns-images.dzcdn.net/images/cover/1b9b2b3f4c5d6e7f8a9b0c1d2e3f4a5b/250x250-000000-80-0-0.jpg', year: 2026, type: 'album' },
    { id: 'nr4', title: 'Deep Cuts', artist: 'Artist Four', cover: 'https://e-cdns-images.dzcdn.net/images/cover/8a63a62bdfd5ca61d3b4c79aa30f0a0a/250x250-000000-80-0-0.jpg', year: 2026, type: 'ep' },
    { id: 'nr5', title: 'Neon Lights', artist: 'Artist Five', cover: 'https://e-cdns-images.dzcdn.net/images/cover/fa0d57c4ccbc6f39cc56d5be9f98b82c/250x250-000000-80-0-0.jpg', year: 2026, type: 'album' },
    { id: 'nr6', title: 'Midnight Run', artist: 'Artist Six', cover: 'https://e-cdns-images.dzcdn.net/images/cover/1a4fb4c9e854cfb7d4d44ba6c0f7c27d/250x250-000000-80-0-0.jpg', year: 2026, type: 'single' },
  ],

  /* ── Настроения ────────────────────────────────── */
  // BACKEND TODO: Получение подборок по настроению
  moods: [
    { id: 'mood1', name: 'Для работы', tag: 'focus work', color: '#6C63FF', icon: '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' },
    { id: 'mood2', name: 'Расслабиться', tag: 'chill relax', color: '#43B89C', icon: '<path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" stroke="currentColor" stroke-width="1.8"/><path d="M8 14s1.5 2 4 2 4-2 4-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' },
    { id: 'mood3', name: 'Тренировка', tag: 'workout sport', color: '#FF6B6B', icon: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11M5 12h2m10 0h2M12 5v2m0 10v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
    { id: 'mood4', name: 'Вечеринка', tag: 'party dance', color: '#F7B731', icon: '<polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26 12,2" stroke="currentColor" stroke-width="1.8" fill="none"/>' },
    { id: 'mood5', name: 'Грустить', tag: 'sad emotional', color: '#778CA3', icon: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" stroke-width="1.8" fill="none"/>' },
    { id: 'mood6', name: 'Утро', tag: 'morning acoustic', color: '#FD9644', icon: '<circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' },
  ],

  /* ── Чарты mock ────────────────────────────────── */
  // BACKEND TODO: Получение чартов по регионам
  chartRegions: ['Мировой', 'Россия', 'США', 'Великобритания', 'Европа'],
  chartPeriods: ['За неделю', 'За месяц', 'За год'],
  chartGenres: ['Все жанры', 'Поп', 'Рэп', 'Хип-хоп', 'Электронная', 'Рок'],
};

/* ── Helpers ──────────────────────────────────────── */

// BACKEND TODO: Создание нового плейлиста
function mockCreatePlaylist(name) {
  const pl = {
    id: 'pl_' + Date.now(),
    name,
    description: '',
    trackCount: 0,
    cover: null,
    createdAt: new Date().toISOString().split('T')[0],
    tracks: []
  };
  MOCK.playlists.unshift(pl);
  savePlaylists();
  return pl;
}

// BACKEND TODO: Удаление плейлиста
function mockDeletePlaylist(id) {
  MOCK.playlists = MOCK.playlists.filter(p => p.id !== id);
  savePlaylists();
}

// BACKEND TODO: Добавление трека в плейлист
function mockAddToPlaylist(playlistId, track) {
  const pl = MOCK.playlists.find(p => p.id === playlistId);
  if (!pl) return;
  if (!pl.tracks.some(t => t.id === track.id)) {
    pl.tracks.push(track);
    pl.trackCount = pl.tracks.length;
    if (!pl.cover && track.album?.cover_medium) pl.cover = track.album.cover_medium;
    savePlaylists();
  }
}

// BACKEND TODO: Удаление трека из плейлиста
function mockRemoveFromPlaylist(playlistId, trackId) {
  const pl = MOCK.playlists.find(p => p.id === playlistId);
  if (!pl) return;
  pl.tracks = pl.tracks.filter(t => t.id !== trackId);
  pl.trackCount = pl.tracks.length;
  savePlaylists();
}

function savePlaylists() {
  localStorage.setItem('mrf_playlists', JSON.stringify(MOCK.playlists));
}

function loadPlaylists() {
  const saved = localStorage.getItem('mrf_playlists');
  if (saved) MOCK.playlists = JSON.parse(saved);
}

// подписка на артиста (toggle)
function mockToggleFollowArtist(artist) {
  const idx = MOCK.followedArtists.findIndex(a => a.id === String(artist.id));
  if (idx >= 0) {
    MOCK.followedArtists.splice(idx, 1);
  } else {
    MOCK.followedArtists.unshift({ id: String(artist.id), name: artist.name, picture_medium: artist.picture_medium || '', nb_fan: artist.nb_fan || 0 });
  }
  localStorage.setItem('mrf_followed', JSON.stringify(MOCK.followedArtists));
}

function isFollowingArtist(artistId) {
  return MOCK.followedArtists.some(a => a.id === String(artistId));
}

function loadFollowed() {
  const saved = localStorage.getItem('mrf_followed');
  if (saved) MOCK.followedArtists = JSON.parse(saved);
}

// Инициализация mock при загрузке
(function initMock() {
  loadPlaylists();
  loadFollowed();
})();
