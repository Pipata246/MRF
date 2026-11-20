'use strict';

/**
 * Slot: recommendations — personal home feed + mood mixes
 * GET ?resource=home
 * GET ?resource=mood&id=mood1
 */
const { send, setSessionCookies, withHandler } = require('../lib/http');
const { requireUser, userClient, adminClient } = require('../lib/supabase');
const { dzArr, dzObj, normTrack, deezerIdOf, isSpokenOrNonMusic } = require('../lib/deezer');

const MIX_COLORS = [
  '#E91E8C', '#5B8DEF', '#E85D4C', '#C9A227', '#2BB673',
  '#9B59B6', '#E67E22', '#1ABC9C', '#E74C3C', '#3498DB'
];

/** Stable seed for the whole local calendar day (no per-request jitter). */
function daySeed(uid, localDay) {
  let h = 0;
  const s = `${uid || 'x'}|${localDay || '1970-01-01'}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function resolveLocalDay(tz, dayParam, offsetMinutes) {
  if (dayParam && /^\d{4}-\d{2}-\d{2}$/.test(String(dayParam))) return String(dayParam);
  try {
    if (tz) {
      // en-CA → YYYY-MM-DD
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: String(tz),
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
    }
  } catch (_) {}
  const off = Number.isFinite(Number(offsetMinutes)) ? Number(offsetMinutes) : -new Date().getTimezoneOffset();
  const d = new Date(Date.now() + off * 60000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mulberry32(a) {
  return function rand() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rand) {
  const a = (arr || []).slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function trackKey(t) {
  const id = deezerIdOf(t);
  if (id) return `dz:${id}`;
  const title = String(t?.title || '').trim().toLowerCase();
  const artist = String(t?.artistName || t?.artist?.name || t?.artist || '')
    .trim()
    .toLowerCase();
  return title || artist ? `${title}|${artist}` : '';
}

function artistKey(a) {
  if (!a) return '';
  if (a.id != null && String(a.id) && String(a.id) !== '0') return `id:${a.id}`;
  const name = String(a.name || a.artistName || '').trim().toLowerCase();
  return name ? `n:${name}` : '';
}

function albumKey(a) {
  if (!a) return '';
  if (a.id != null && String(a.id)) return `id:${a.id}`;
  return `t:${String(a.title || '').trim().toLowerCase()}`;
}

function payloadTrack(row) {
  const t = row?.payload || row || {};
  if (!t || (!t.title && !t.id && !t.deezerId)) return null;
  const artistName =
    typeof t.artist === 'string' ? t.artist : t.artist?.name || t.artistName || '';
  return {
    ...t,
    artist:
      t.artist && typeof t.artist === 'object'
        ? t.artist
        : { id: t.artistId || null, name: artistName },
    artistName,
    album: t.album || {
      cover_medium: t.cover || '',
      cover: t.cover || '',
      title: t.albumTitle || ''
    }
  };
}

function dedupeTracks(list) {
  const seen = new Set();
  const out = [];
  for (const t of list || []) {
    if (!t) continue;
    const k = trackKey(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function likedSet(likes) {
  const s = new Set();
  for (const t of likes || []) {
    const id = deezerIdOf(t);
    if (id) s.add(String(id));
    const k = trackKey(t);
    if (k) s.add(k);
  }
  return s;
}

function notLiked(tracks, banned) {
  return (tracks || []).filter((t) => {
    if (!t) return false;
    const id = deezerIdOf(t);
    if (id && banned.has(String(id))) return false;
    const k = trackKey(t);
    if (k && banned.has(k)) return false;
    return true;
  });
}

async function safeDzArr(path) {
  try {
    return await dzArr(path);
  } catch {
    return [];
  }
}

async function safeDzObj(path) {
  try {
    return await dzObj(path);
  } catch {
    return {};
  }
}

const REC_PLAYLIST_TRACKS = 50;

/** Similar tracks via search + artist top (radio/related paths are unreliable on Deezer). */
async function similarAroundSeeds(seeds, banned, rand, want) {
  const target = Math.max(Number(want) || REC_PLAYLIST_TRACKS, 8);
  const pool = shuffle(seeds || [], rand).slice(0, 6);
  if (!pool.length) return [];

  const artistIds = [
    ...new Set(
      pool
        .map((t) => t.artist?.id || t.artistId)
        .filter((id) => id && /^\d+$/.test(String(id)))
        .map(String)
    )
  ].slice(0, 4);
  const artistNames = [
    ...new Set(
      pool
        .map((t) => String(t.artist?.name || t.artistName || '').trim())
        .filter(Boolean)
    )
  ].slice(0, 5);

  const [tops, searchesA, searchesB] = await Promise.all([
    Promise.all(
      artistIds.map((aid) => safeDzArr(`/artist/${aid}/top?limit=50`))
    ),
    Promise.all(
      artistNames.map((n) =>
        safeDzArr(`/search/track?q=${encodeURIComponent(n)}&limit=25`)
      )
    ),
    Promise.all(
      artistNames.map((n) =>
        safeDzArr(`/search/track?q=${encodeURIComponent(n)}&limit=25&index=25`)
      )
    )
  ]);

  const raw = [
    ...tops.flat(),
    ...searchesA.flat(),
    ...searchesB.flat()
  ].map(normTrack).filter(Boolean);

  let out = notLiked(dedupeTracks(raw), banned);
  if (out.length < Math.min(8, target)) out = dedupeTracks(raw);
  return shuffle(out, rand).slice(0, target);
}

function rankArtists(pool) {
  const counts = new Map();
  for (const t of pool || []) {
    const name = t.artist?.name || t.artistName || '';
    const id = t.artist?.id || t.artistId || null;
    if (!name && !id) continue;
    const key = id ? `id:${id}` : `n:${String(name).toLowerCase()}`;
    const cur = counts.get(key) || {
      id,
      name,
      n: 0,
      picture_medium: t.artist?.picture_medium || '',
      picture_xl: t.artist?.picture_xl || '',
      seedTrack: t
    };
    cur.n += 1;
    if (!cur.name && name) cur.name = name;
    if (!cur.id && id) cur.id = id;
    if (!cur.picture_medium && t.artist?.picture_medium) {
      cur.picture_medium = t.artist.picture_medium;
    }
    if (!cur.seedTrack && t) cur.seedTrack = t;
    counts.set(key, cur);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n);
}

async function hydrateArtist(a) {
  if (!a) return a;
  if (a.picture_medium || a.picture_xl) return a;
  if (a.id && /^\d+$/.test(String(a.id))) {
    const full = await safeDzObj(`/artist/${a.id}`);
    if (full && full.id) {
      return {
        ...a,
        name: a.name || full.name,
        picture_medium: full.picture_medium || full.picture || '',
        picture_xl: full.picture_xl || full.picture_big || '',
        nb_fan: full.nb_fan || 0
      };
    }
  }
  if (a.name) {
    const found = await safeDzArr(`/search/artist?q=${encodeURIComponent(a.name)}&limit=5`);
    const hit =
      found.find((x) => String(x.name || '').toLowerCase() === String(a.name).toLowerCase()) ||
      found[0];
    if (hit) {
      return {
        ...a,
        id: a.id || hit.id,
        picture_medium: hit.picture_medium || hit.picture || '',
        picture_xl: hit.picture_xl || '',
        nb_fan: hit.nb_fan || 0
      };
    }
  }
  return a;
}

async function resolveArtistId(artist) {
  if (artist?.id && /^\d+$/.test(String(artist.id))) return String(artist.id);
  if (!artist?.name) return null;
  const found = await safeDzArr(`/search/artist?q=${encodeURIComponent(artist.name)}&limit=5`);
  const hit =
    found.find((x) => String(x.name || '').toLowerCase() === String(artist.name).toLowerCase()) ||
    found[0];
  return hit?.id ? String(hit.id) : null;
}

function blendOwnRatio(own, similar, rand, size) {
  const o = shuffle(own || [], rand);
  const s = shuffle(similar || [], rand);
  const ratio = 0.1 + rand() * 0.3;
  const ownN = Math.min(o.length, Math.max(o.length ? 1 : 0, Math.round(size * ratio)));
  return dedupeTracks([...o.slice(0, ownN), ...s]).slice(0, size);
}

/**
 * Artist mix — target REC_PLAYLIST_TRACKS (50).
 * Note: Deezer `/artist/:id/top` often returns 1 row from some IPs — search pages fill the rest.
 */
async function buildArtistMix(artist, pool, banned, rand, color) {
  let aid = artist?.id && /^\d+$/.test(String(artist.id)) ? String(artist.id) : null;
  if (!aid) aid = await resolveArtistId(artist);
  const name = String(artist?.name || '').trim();
  if (!name) return null;
  const want = REC_PLAYLIST_TRACKS;

  const ownOf = (pool || []).filter((t) => {
    const n = (t.artist?.name || t.artistName || '').toLowerCase();
    return n === name.toLowerCase();
  });

  const [topRaw, searchRaw, searchRaw2, related] = await Promise.all([
    aid ? safeDzArr(`/artist/${aid}/top?limit=50`) : Promise.resolve([]),
    safeDzArr(`/search/track?q=${encodeURIComponent(name)}&limit=25`),
    safeDzArr(`/search/track?q=${encodeURIComponent(name)}&limit=25&index=25`),
    aid ? safeDzArr(`/artist/${aid}/related?limit=6`) : Promise.resolve([])
  ]);

  const top = topRaw.map(normTrack).filter(Boolean);
  const searched = [...searchRaw, ...searchRaw2].map(normTrack).filter(Boolean);
  const searchForArtist = searched.filter((t) => {
    const n = String(t.artist?.name || t.artistName || '').toLowerCase();
    return !name || n === name.toLowerCase() || n.includes(name.toLowerCase());
  });

  let relTracks = [];
  const relPick = shuffle(related || [], rand).slice(0, 3);
  if (relPick.length) {
    const relSearches = await Promise.all(
      relPick.flatMap((ra) =>
        ra?.name
          ? [
              safeDzArr(`/search/track?q=${encodeURIComponent(ra.name)}&limit=25`),
              safeDzArr(`/search/track?q=${encodeURIComponent(ra.name)}&limit=25&index=25`)
            ]
          : []
      )
    );
    relTracks = relSearches.flat().map(normTrack).filter(Boolean);
  }

  const poolAll = dedupeTracks([...top, ...searchForArtist, ...searched, ...relTracks, ...ownOf]);
  let similar = notLiked(poolAll, banned);
  if (similar.length < Math.min(12, want)) similar = poolAll;
  let tracks = blendOwnRatio(ownOf, similar, rand, want);
  if (tracks.length < Math.min(8, want)) {
    tracks = shuffle(poolAll, rand).slice(0, want);
  }
  if (tracks.length < 4) return null;

  const relNames = (related || [])
    .slice(0, 3)
    .map((r) => r.name)
    .filter(Boolean);
  const cover =
    artist.picture_xl ||
    artist.picture_medium ||
    related[0]?.picture_xl ||
    related[0]?.picture_medium ||
    related[0]?.picture ||
    tracks[0]?.album?.cover_medium ||
    tracks[0]?.album?.cover ||
    '';

  const list = tracks.slice(0, want);
  return {
    id: `artist_mix_${aid || encodeURIComponent(name)}`,
    kind: 'artist',
    name: `${name}: микс`,
    artistName: name,
    artists: [name, ...relNames].filter(Boolean).slice(0, 4),
    cover,
    color,
    trackCount: list.length,
    tracks: list,
    canSave: true
  };
}

async function buildStyleMix(label, seedTracks, banned, rand, color) {
  const similar = await similarAroundSeeds(seedTracks, banned, rand, 30);
  const tracks = notLiked(dedupeTracks(similar), banned).slice(0, 14 + Math.floor(rand() * 6));
  if (tracks.length < 6) return null;
  const names = [];
  const seen = new Set();
  for (const t of tracks) {
    const n = t.artist?.name || t.artistName;
    if (!n || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    names.push(n);
    if (names.length >= 4) break;
  }
  return {
    id: `style_mix_${label}_${Math.floor(rand() * 1e5)}`,
    kind: 'style',
    name: label,
    artistName: '',
    artists: names,
    cover: tracks[0]?.album?.cover_xl || tracks[0]?.album?.cover_medium || '',
    color,
    trackCount: tracks.length,
    tracks,
    canSave: true
  };
}

async function loadLibrarySignals(sb, uid) {
  const [likesRes, followsRes, albumsRes, recentRes, playlistsRes] = await Promise.all([
    sb.from('liked_tracks').select('payload, added_at').eq('user_id', uid).order('added_at', { ascending: false }).limit(100),
    sb.from('followed_artists').select('payload, added_at').eq('user_id', uid).order('added_at', { ascending: false }).limit(40),
    sb.from('saved_albums').select('payload, saved_at').eq('user_id', uid).order('saved_at', { ascending: false }).limit(60),
    sb.from('recent_plays').select('payload, played_at').eq('user_id', uid).order('played_at', { ascending: false }).limit(40),
    sb.from('playlists').select('id, name, cover').eq('user_id', uid).order('updated_at', { ascending: false }).limit(12)
  ]);

  const likes = (likesRes.data || []).map(payloadTrack).filter(Boolean);
  const follows = (followsRes.data || []).map((r) => r.payload || r).filter((a) => a && (a.id || a.name));
  const albums = (albumsRes.data || []).map((r) => r.payload || r).filter((a) => a && (a.id || a.title));
  const recent = (recentRes.data || []).map(payloadTrack).filter(Boolean);

  const playlistTracks = [];
  for (const p of playlistsRes.data || []) {
    const { data: tracks } = await sb
      .from('playlist_tracks')
      .select('payload')
      .eq('playlist_id', p.id)
      .order('position', { ascending: true })
      .limit(40);
    (tracks || []).forEach((row) => {
      const pt = payloadTrack(row);
      if (pt) playlistTracks.push(pt);
    });
  }

  return { likes, follows, albums, recent, playlistTracks };
}

function packSections({ artists, mixes, albums, dayPlaylists }) {
  const days = Array.isArray(dayPlaylists)
    ? dayPlaylists.filter(Boolean)
    : (dayPlaylists ? [dayPlaylists] : []);
  return [
    artists?.length
      ? { id: 'similarArtists', type: 'artists', title: 'Похожие исполнители', items: artists }
      : null,
    mixes?.length
      ? { id: 'artistMixes', type: 'mixes', title: 'Миксы по исполнителям', items: mixes }
      : null,
    albums?.length
      ? { id: 'albumPicks', type: 'albums', title: 'Альбомы для тебя', items: albums }
      : null,
    days.length
      ? { id: 'playlistOfTheDay', type: 'mixes', title: 'Плейлисты дня', items: days }
      : null
  ].filter(Boolean);
}

/** Bump when feed shape / diversity rules change — invalidates same-day stale rows. */
const FEED_VERSION = 9;
/** Миксы по исполнителям на главной (было ~6–8, нужно заметно больше) */
const ARTIST_MIX_WANT = 12;

/** «Мало» = 0…5 сигналов → следующий ярус каскада. */
const FEW_MAX = 5;
function isFew(n) {
  return Number(n) <= FEW_MAX;
}

function isAlbumishRelease(a) {
  if (!a || a.id == null || !a.title) return false;
  const rt = String(a.record_type || '').toLowerCase();
  if (rt === 'single' || rt === 'ep') return false;
  const nb = Number(a.nb_tracks || 0);
  if (rt === 'album') return nb === 0 || nb >= 5;
  // No record_type on many Deezer payloads — keep unless clearly a short single
  if (nb > 0 && nb <= 3) return false;
  if (/\b(single|remix)\b/i.test(String(a.title || '')) && nb > 0 && nb < 6) return false;
  return !!(a.cover_medium || a.cover_xl || a.cover);
}

function albumArtistSlot(a, fallbackArtistId) {
  if (a?.artist?.id != null && String(a.artist.id) !== '' && String(a.artist.id) !== '0') {
    return `id:${a.artist.id}`;
  }
  if (fallbackArtistId != null && String(fallbackArtistId) !== '') {
    return `id:${fallbackArtistId}`;
  }
  const name = String(a?.artistName || a?.artist?.name || '')
    .trim()
    .toLowerCase();
  return name ? `n:${name}` : '';
}

function albumTitleNorm(a) {
  return String(a?.title || '')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '')
    .slice(0, 48);
}

function toAlbumItem(a, fallbackArtist) {
  const artist =
    a.artist && (a.artist.id || a.artist.name)
      ? a.artist
      : fallbackArtist || {};
  return {
    id: a.id,
    title: a.title,
    cover_medium: a.cover_medium || '',
    cover: a.cover_xl || a.cover_medium || a.cover || '',
    artist,
    artistName: artist.name || a.artistName || '',
    record_type: 'album'
  };
}

/**
 * Strict: 1 artist → 1 album.
 * allowChart=true только на ярусе «лайков мало» (чарт).
 */
async function collectAlbumPicks({
  seedArtistIds,
  similarArtists,
  savedKeys,
  rand,
  want = 12,
  allowChart = false
}) {
  const nameById = new Map(
    (similarArtists || [])
      .filter((a) => a?.id != null)
      .map((a) => [String(a.id), a.name || ''])
  );
  const albumArtistIds = [
    ...new Set(
      [
        ...(seedArtistIds || []),
        ...(similarArtists || []).map((a) => String(a.id)).filter((id) => /^\d+$/.test(id))
      ].map(String)
    )
  ].slice(0, 12);

  const usedArtists = new Set();
  const usedAlbums = new Set();
  const usedTitles = new Set();
  const albumItems = [];

  const tryPush = (raw, fallbackArtist) => {
    if (!isAlbumishRelease(raw)) return false;
    const item = toAlbumItem(raw, fallbackArtist);
    const k = albumKey(item);
    const art = albumArtistSlot(item, fallbackArtist?.id);
    const titleK = albumTitleNorm(item);
    if (!k || !art || usedAlbums.has(k) || savedKeys.has(k)) return false;
    if (usedArtists.has(art)) return false;
    if (titleK && usedTitles.has(titleK)) return false;
    usedAlbums.add(k);
    usedArtists.add(art);
    if (titleK) usedTitles.add(titleK);
    albumItems.push(item);
    return true;
  };

  if (albumArtistIds.length) {
    const albumBatches = await Promise.all(
      albumArtistIds.map((id) => safeDzArr(`/artist/${id}/albums?limit=15`))
    );
    for (let i = 0; i < albumArtistIds.length; i++) {
      const aid = albumArtistIds[i];
      if (usedArtists.has(`id:${aid}`)) continue;
      const fallback = { id: aid, name: nameById.get(String(aid)) || '' };
      for (const a of shuffle(albumBatches[i] || [], rand)) {
        if (tryPush(a, fallback)) break;
      }
      if (albumItems.length >= want) break;
    }
  }

  if (allowChart && albumItems.length < want) {
    const chart = await safeDzArr('/chart/0/albums?limit=50');
    for (const a of shuffle(chart, rand)) {
      if (tryPush(a, a.artist || null) && albumItems.length >= want) break;
    }
  }
  return albumItems.slice(0, want);
}

function dayPlaylistTitle(localDay, slot = 0) {
  const raw = String(localDay || '');
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dateBit = m ? `${m[3]}.${m[2]}.${m[1]}` : '';
  const n = Number(slot) || 0;
  if (n <= 0) return dateBit ? `Плейлист дня · ${dateBit}` : 'Плейлист дня';
  return dateBit ? `Плейлист дня · ${n + 1} · ${dateBit}` : `Плейлист дня · ${n + 1}`;
}

/** Grow a disjoint artist orbit (liked / similar artists + related). */
async function expandDayOrbit(seeds, excludeKeys, rand, want = 6) {
  const out = [];
  const seen = new Set(excludeKeys || []);
  for (const a of seeds || []) {
    const k = artistKey(a);
    if (!k || seen.has(k) || !a?.name) continue;
    seen.add(k);
    out.push({
      id: a.id,
      name: a.name,
      picture_medium: a.picture_medium || '',
      picture_xl: a.picture_xl || ''
    });
    if (out.length >= want) return out;
  }
  const seedIds = out
    .map((a) => (a.id && /^\d+$/.test(String(a.id)) ? String(a.id) : null))
    .filter(Boolean)
    .slice(0, 3);
  if (seedIds.length && out.length < want) {
    const related = await relatedArtistsFromSeeds(seedIds, seen, rand, Math.max(10, want * 2));
    for (const a of related || []) {
      const k = artistKey(a);
      if (!k || seen.has(k) || !a?.name) continue;
      seen.add(k);
      out.push({
        id: a.id,
        name: a.name,
        picture_medium: a.picture_medium || '',
        picture_xl: a.picture_xl || ''
      });
      if (out.length >= want) break;
    }
  }
  return out;
}

/**
 * One day playlist from a fixed artist orbit — never a copy of an artist mix.
 * Tracks stay in that orbit / its similarity bubble. Chart only if allowChart + thin.
 */
async function buildDayPlaylist(pool, banned, rand, {
  allowChart = false,
  localDay = null,
  slot = 0,
  orbit = null,
  excludeTrackIds = null
} = {}) {
  const want = REC_PLAYLIST_TRACKS;
  const orbitList = Array.isArray(orbit) ? orbit.filter((a) => a?.name) : [];
  const orbitNames = new Set(
    orbitList.map((a) => String(a.name || '').toLowerCase()).filter(Boolean)
  );

  let seeds = [];
  if (orbitNames.size) {
    seeds = shuffle(
      (pool || []).filter((t) =>
        orbitNames.has(String(t.artist?.name || t.artistName || '').toLowerCase())
      ),
      rand
    ).slice(0, 8);
  }
  if (!seeds.length) {
    seeds = shuffle(
      (pool || []).filter((t) => deezerIdOf(t)),
      rand
    ).slice(0, 6);
  }

  // Orbit artist tops as extra seed material
  const orbitIds = orbitList
    .map((a) => (a.id && /^\d+$/.test(String(a.id)) ? String(a.id) : null))
    .filter(Boolean)
    .slice(0, 5);
  let orbitTops = [];
  if (orbitIds.length) {
    const topsRaw = await Promise.all(
      orbitIds.map((id) => safeDzArr(`/artist/${id}/top?limit=25`))
    );
    orbitTops = topsRaw.flat().map(normTrack).filter(Boolean);
    if (!seeds.length) seeds = shuffle(orbitTops, rand).slice(0, 8);
  }

  let tracks = await similarAroundSeeds(seeds, banned, rand, want);
  tracks = dedupeTracks([...tracks, ...orbitTops]);

  if (tracks.length < want && orbitList.length) {
    const names = orbitList.map((a) => a.name).filter(Boolean).slice(0, 6);
    const more = await Promise.all(
      names.flatMap((n) => [
        safeDzArr(`/search/track?q=${encodeURIComponent(n)}&limit=25`),
        safeDzArr(`/search/track?q=${encodeURIComponent(n)}&limit=25&index=25`)
      ])
    );
    const extra = more.flat().map(normTrack).filter(Boolean);
    tracks = dedupeTracks([...tracks, ...extra]);
  }

  if (tracks.length < want && pool?.length && !orbitNames.size) {
    const extra = shuffle(notLiked(dedupeTracks(pool), banned), rand).slice(0, want);
    tracks = dedupeTracks([...tracks, ...extra]);
  }

  if (allowChart && tracks.length < Math.min(12, want)) {
    const chart = (await safeDzArr('/chart/0/tracks?limit=50')).map(normTrack).filter(Boolean);
    tracks = dedupeTracks([...tracks, ...shuffle(chart, rand)]);
  }

  let cleaned = notLiked(dedupeTracks(tracks), banned);
  if (cleaned.length < Math.min(10, want)) cleaned = dedupeTracks(tracks);
  if (excludeTrackIds && excludeTrackIds.size) {
    const filtered = cleaned.filter(
      (t) => !excludeTrackIds.has(String(t.deezerId || t.id || ''))
    );
    if (filtered.length >= Math.min(8, want)) cleaned = filtered;
  }
  cleaned = shuffle(cleaned, rand).slice(0, want);
  if (cleaned.length < 6) return null;

  const artists = [
    ...new Set(cleaned.map((t) => t.artist?.name || t.artistName).filter(Boolean))
  ].slice(0, 4);
  const slotN = Number(slot) || 0;
  return {
    id: slotN <= 0 ? 'playlist_of_the_day' : `playlist_of_the_day_${slotN + 1}`,
    kind: 'day',
    daySlot: slotN,
    name: dayPlaylistTitle(localDay, slotN),
    artists,
    cover: cleaned[0]?.album?.cover_medium || cleaned[0]?.album?.cover || '',
    color: MIX_COLORS[(slotN + Math.floor(rand() * 3)) % MIX_COLORS.length],
    trackCount: cleaned.length,
    tracks: cleaned,
    canSave: true,
    localDay: localDay || null
  };
}

/** Three day playlists — same rules, disjoint artist orbits from likes/similar. */
async function buildDayPlaylistsTrio(pool, banned, rand, {
  allowChart = false,
  localDay = null,
  extraArtists = null
} = {}) {
  const ranked = rankArtists(pool || []);
  const bonus = Array.isArray(extraArtists) ? extraArtists : [];
  const poolArtists = [];
  const seenRank = new Set();
  for (const a of [...ranked, ...bonus]) {
    const k = artistKey(a);
    if (!k || seenRank.has(k) || !a?.name) continue;
    seenRank.add(k);
    poolArtists.push(a);
  }
  const shuffled = shuffle(poolArtists.slice(0, 24), rand);
  const bases = [[], [], []];
  shuffled.forEach((a, i) => bases[i % 3].push(a));

  const usedArtists = new Set();
  const usedTracks = new Set();
  const playlists = [];

  for (let slot = 0; slot < 3; slot++) {
    const exclude = new Set(usedArtists);
    let orbit = await expandDayOrbit(bases[slot], exclude, rand, 6);
    if (orbit.length < 3) {
      for (const a of poolArtists) {
        const k = artistKey(a);
        if (!k || exclude.has(k) || usedArtists.has(k)) continue;
        orbit.push(a);
        if (orbit.length >= 5) break;
      }
      orbit = await expandDayOrbit(orbit, exclude, rand, 6);
    }
    for (const a of orbit) {
      const k = artistKey(a);
      if (k) usedArtists.add(k);
    }

    const pl = await buildDayPlaylist(pool, banned, rand, {
      allowChart: allowChart && slot === 2,
      localDay,
      slot,
      orbit,
      excludeTrackIds: usedTracks
    });
    if (!pl) continue;
    for (const t of pl.tracks || []) {
      const id = String(t.deezerId || t.id || '');
      if (id) usedTracks.add(id);
    }
    playlists.push(pl);
  }
  return playlists;
}

async function buildMixesFromArtists(artists, pool, banned, rand, want = ARTIST_MIX_WANT) {
  const candidates = [];
  const seen = new Set();
  for (const a of artists || []) {
    const k = artistKey(a);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    candidates.push({ ...a });
    if (candidates.length >= Math.max(want + 8, 20)) break;
  }
  // Resolve missing Deezer ids first
  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i];
    if (a.id && /^\d+$/.test(String(a.id))) continue;
    const id = await resolveArtistId(a);
    if (id) a.id = id;
  }

  // Small batches — parallel-all often rate-limits Deezer and yields 0 mixes
  const mixes = [];
  const queue = candidates.filter((a) => a.id && /^\d+$/.test(String(a.id)));
  for (let i = 0; i < queue.length && mixes.length < want; i += 3) {
    const chunk = queue.slice(i, i + 3);
    const built = await Promise.all(
      chunk.map((a, j) =>
        buildArtistMix(a, pool, banned, rand, MIX_COLORS[(mixes.length + j) % MIX_COLORS.length])
      )
    );
    for (const m of built) {
      if (!m) continue;
      mixes.push(m);
      if (mixes.length >= want) break;
    }
  }
  return mixes;
}

/**
 * Миксы по исполнителям: подписки + авторы лайков + похожие.
 * Не трогает альбомы / artists-rail / плейлист дня.
 */
async function buildArtistMixesForFeed({
  likes,
  follows,
  similarArtists,
  seedArtists,
  pool,
  banned,
  rand,
  want = ARTIST_MIX_WANT
}) {
  const candidates = [];
  const seen = new Set();
  const push = (a) => {
    if (!a) return;
    const row = {
      id: a.id,
      name: a.name || a.artistName || '',
      picture_medium: a.picture_medium || a.picture || '',
      picture_xl: a.picture_xl || ''
    };
    const k = artistKey(row);
    if (!k || !row.name || seen.has(k)) return;
    seen.add(k);
    candidates.push(row);
  };

  for (const f of follows || []) push(f);
  for (const a of rankArtists(likes || []).slice(0, 16)) push(a);
  for (const a of similarArtists || []) push(a);
  for (const a of seedArtists || []) push(a);

  let mixes = await buildMixesFromArtists(candidates, pool, banned, rand, want);

  // Добор из related сидов, пока не набрали want
  if (mixes.length < want) {
    const seedIds = candidates
      .map((a) => (a.id && /^\d+$/.test(String(a.id)) ? String(a.id) : null))
      .filter(Boolean)
      .slice(0, 8);
    const exclude = new Set([
      ...seen,
      ...mixes.map((m) => `n:${String(m.artistName || '').toLowerCase()}`)
    ]);
    const related = await relatedArtistsFromSeeds(seedIds, exclude, rand, Math.max(16, want * 2));
    const more = await buildMixesFromArtists(related, pool, banned, rand, want - mixes.length);
    const mixSeen = new Set(mixes.map((m) => String(m.artistName || '').toLowerCase()));
    for (const m of more) {
      const n = String(m.artistName || '').toLowerCase();
      if (!n || mixSeen.has(n)) continue;
      mixSeen.add(n);
      mixes.push(m);
      if (mixes.length >= want) break;
    }
  }
  return mixes.slice(0, want);
}

/** Related artists from seed ids — similarity only, no chart. */
async function relatedArtistsFromSeeds(seedArtistIds, excludeKeys, rand, want = 14) {
  const ids = (seedArtistIds || []).filter((id) => /^\d+$/.test(String(id))).slice(0, 6);
  if (!ids.length) return [];
  const batches = await Promise.all(
    ids.map((id) => safeDzArr(`/artist/${id}/related?limit=14`))
  );
  const seen = new Set(excludeKeys || []);
  const out = [];
  for (const a of shuffle(batches.flat(), rand)) {
    const k = artistKey(a);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({
      id: a.id,
      name: a.name,
      picture_medium: a.picture_medium || a.picture || '',
      picture_xl: a.picture_xl || '',
      nb_fan: a.nb_fan || 0
    });
    if (out.length >= want) break;
  }
  return Promise.all(
    out.map((a) => (a.picture_medium || a.picture_xl ? a : hydrateArtist(a)))
  );
}

/**
 * Рекомендованные исполнители ТОЛЬКО из:
 * — подписок (лайкнутых исполнителей)
 * — авторов лайкнутых треков
 * → related / похожие. Без чарта.
 */
async function buildRecommendedArtists({ likes, follows, rand, want = 14 }) {
  const seedKeys = new Set();
  const seeds = [];

  const pushSeed = (a) => {
    if (!a) return;
    const row = {
      id: a.id,
      name: a.name || a.artistName || '',
      picture_medium: a.picture_medium || a.picture || '',
      picture_xl: a.picture_xl || ''
    };
    const k = artistKey(row);
    if (!k || seedKeys.has(k)) return;
    seedKeys.add(k);
    seeds.push(row);
  };

  for (const f of follows || []) pushSeed(f);
  for (const a of rankArtists(likes || [])) {
    pushSeed(a);
    if (seeds.length >= 14) break;
  }

  const resolved = (
    await Promise.all(seeds.slice(0, 8).map((a) => resolveArtistId(a)))
  ).filter((id) => id && /^\d+$/.test(String(id)));

  let out = await relatedArtistsFromSeeds(resolved, seedKeys, rand, want);

  // Добор: авторы похожих треков (ещё не в сидах / списке)
  if (out.length < want && (likes || []).length) {
    const similarTracks = await similarAroundSeeds(likes, likedSet(likes), rand, 20);
    const seen = new Set(out.map(artistKey).filter(Boolean));
    for (const a of rankArtists(similarTracks)) {
      const k = artistKey(a);
      if (!k || seedKeys.has(k) || seen.has(k)) continue;
      seen.add(k);
      out.push({
        id: a.id,
        name: a.name,
        picture_medium: a.picture_medium || '',
        picture_xl: a.picture_xl || '',
        nb_fan: 0
      });
      if (out.length >= want) break;
    }
  }

  // Если related пустой — хотя бы гидратнём сиды с картинками (лучше чем пустота)
  if (!out.length && seeds.length) {
    out = await Promise.all(seeds.slice(0, want).map((a) => hydrateArtist(a)));
  }

  out = await Promise.all(
    out.slice(0, want).map((a) => (a.picture_medium || a.picture_xl ? a : hydrateArtist(a)))
  );
  return out.filter((a) => a && a.name);
}

function artistsFromSavedAlbums(savedAlbums) {
  const out = [];
  const seen = new Set();
  for (const alb of savedAlbums || []) {
    const a = alb.artist || { id: alb.artistId, name: alb.artistName || alb.artist?.name };
    const k = artistKey(a);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({
      id: a.id,
      name: a.name || alb.artistName || '',
      picture_medium: a.picture_medium || '',
      picture_xl: a.picture_xl || ''
    });
  }
  return out;
}

/** Ярус 3: чарт — только когда лайков мало (≤5). */
async function coldStartHome(rand, localDay) {
  const banned = likedSet([]);
  const [tracksRaw, artistsRaw] = await Promise.all([
    safeDzArr('/chart/0/tracks?limit=30'),
    safeDzArr('/chart/0/artists?limit=16')
  ]);
  const tracks = shuffle(tracksRaw.map(normTrack).filter(Boolean), rand);
  const artists = shuffle(artistsRaw, rand)
    .slice(0, 12)
    .map((a) => ({
      id: a.id,
      name: a.name,
      picture_medium: a.picture_medium || a.picture || '',
      picture_xl: a.picture_xl || '',
      nb_fan: a.nb_fan || 0
    }));
  const seedIds = artists.map((a) => String(a.id)).filter((id) => /^\d+$/.test(id));
  const similarArtists = await relatedArtistsFromSeeds(seedIds.slice(0, 4), new Set(), rand, 14);
  const albumItems = await collectAlbumPicks({
    seedArtistIds: seedIds.slice(0, 8),
    similarArtists,
    savedKeys: new Set(),
    rand,
    want: 12,
    allowChart: true
  });
  const mixes = await buildMixesFromArtists(
    [...artists, ...similarArtists],
    tracks,
    banned,
    rand,
    ARTIST_MIX_WANT
  );
  const dayPlaylists = await buildDayPlaylistsTrio(tracks, banned, rand, {
    allowChart: true,
    localDay,
    extraArtists: [...artists, ...similarArtists]
  });

  return {
    ok: true,
    guest: false,
    coldStart: true,
    localDay: localDay || null,
    sections: packSections({
      artists: similarArtists.length ? similarArtists : artists,
      mixes,
      albums: albumItems,
      dayPlaylists
    })
  };
}

/**
 * Каскад сигналов:
 * 1) лайкнутые альбомы + подписки на исполнителей (и похожие)
 * 2) если их мало (≤5) → лайкнутые треки → похожие треки/авторы
 * 3) если и лайков мало (≤5) → чарт
 */
async function buildHomeFeed(sb, uid, localDay) {
  const rand = mulberry32(daySeed(uid, localDay));
  const { likes, follows, albums: savedAlbums, recent, playlistTracks } = await loadLibrarySignals(
    sb,
    uid
  );
  const banned = likedSet(likes);
  const savedKeys = new Set(savedAlbums.map(albumKey).filter(Boolean));

  const albumArtistSeeds = artistsFromSavedAlbums(savedAlbums);
  const followSeeds = (follows || []).map((f) => ({
    id: f.id,
    name: f.name,
    picture_medium: f.picture_medium || f.picture || '',
    picture_xl: f.picture_xl || ''
  }));
  const personalArtistSignal = followSeeds.length + savedAlbums.length;
  const likeCount = (likes || []).length;

  // Ярус 3 — чарт
  if (isFew(personalArtistSignal) && isFew(likeCount)) {
    return coldStartHome(rand, localDay);
  }

  let seedArtists = [];
  let trackPool = [];
  let allowChart = false;

  if (!isFew(personalArtistSignal)) {
    // Ярус 1 — альбомы + исполнители
    seedArtists = [...followSeeds, ...albumArtistSeeds];
    trackPool = dedupeTracks([...likes, ...playlistTracks, ...recent]);
  } else {
    // Ярус 2 — мало альбомов/исполнителей, но лайков достаточно → похожие по трекам
    trackPool = dedupeTracks(likes.length ? likes : [...likes, ...playlistTracks, ...recent]);
    seedArtists = rankArtists(trackPool).slice(0, 10);
    // Расширяем орбиту похожими треками → их авторы тоже в сиды
    const similarTracks = await similarAroundSeeds(trackPool, banned, rand, 24);
    trackPool = dedupeTracks([...trackPool, ...similarTracks]);
    for (const a of rankArtists(similarTracks)) {
      const k = artistKey(a);
      if (!k || seedArtists.some((x) => artistKey(x) === k)) continue;
      seedArtists.push(a);
      if (seedArtists.length >= 12) break;
    }
  }

  const seedArtistIds = (
    await Promise.all(seedArtists.slice(0, 6).map((a) => resolveArtistId(a)))
  ).filter(Boolean);

  // Только исполнители: лайки треков + подписки → похожие
  const similarArtists = await buildRecommendedArtists({
    likes,
    follows,
    rand,
    want: 14
  });

  // Миксы: подписки + лайки + похожие (отдельно от rails альбомов/дня)
  const mixes = await buildArtistMixesForFeed({
    likes,
    follows,
    similarArtists,
    seedArtists,
    pool: trackPool,
    banned,
    rand,
    want: ARTIST_MIX_WANT
  });

  const albumItems = await collectAlbumPicks({
    seedArtistIds,
    similarArtists: [...similarArtists, ...seedArtists],
    savedKeys,
    rand,
    want: 12,
    allowChart
  });

  const dayPlaylists = await buildDayPlaylistsTrio(trackPool, banned, rand, {
    allowChart,
    localDay,
    extraArtists: [...similarArtists, ...seedArtists, ...follows]
  });

  return {
    ok: true,
    guest: false,
    coldStart: false,
    localDay: localDay || null,
    cascade: isFew(personalArtistSignal) ? 'likes' : 'library',
    sections: packSections({
      artists: similarArtists,
      mixes,
      albums: albumItems,
      dayPlaylists
    })
  };
}

/** Day-cache via admin client — avoids RLS/JWT flakiness on upsert. */
function cacheDb() {
  try {
    return adminClient();
  } catch (e) {
    console.warn('[recommendations] adminClient', e.message);
    return null;
  }
}

async function readFeedRow(uid) {
  const sb = cacheDb();
  if (!sb) return null;
  const { data, error } = await sb
    .from('user_recommendation_feeds')
    .select('local_day, timezone, payload, generated_at')
    .eq('user_id', uid)
    .maybeSingle();
  if (error) {
    console.warn('[recommendations] cache read', error.message);
    return null;
  }
  return data || null;
}

async function readCachedFeed(uid, localDay) {
  const data = await readFeedRow(uid);
  if (!data) return null;
  const rowDay = String(data.local_day || '').slice(0, 10);
  if (rowDay !== String(localDay).slice(0, 10)) return null;
  const payload = data.payload && typeof data.payload === 'object' ? data.payload : null;
  if (!payload || !Array.isArray(payload.sections) || !payload.sections.length) return null;
  if (Number(payload.v) !== FEED_VERSION) return null;
  return {
    ok: true,
    guest: false,
    cached: true,
    localDay: rowDay,
    coldStart: !!payload.coldStart,
    sections: payload.sections,
    generatedAt: data.generated_at || null
  };
}

async function writeCachedFeed(uid, localDay, timezone, feed) {
  if (!feed || !Array.isArray(feed.sections) || !feed.sections.length) {
    console.warn('[recommendations] skip empty cache write');
    return false;
  }
  const sb = cacheDb();
  if (!sb) return false;
  // Preserve mood mixes for the same local day
  let moodMixes = null;
  try {
    const prev = await readFeedRow(uid);
    const prevDay = String(prev?.local_day || '').slice(0, 10);
    const prevPayload = prev?.payload && typeof prev.payload === 'object' ? prev.payload : null;
    if (
      prevDay === String(localDay).slice(0, 10) &&
      prevPayload?.moodMixes &&
      Number(prevPayload.moodMixes.v) === MOOD_VERSION
    ) {
      moodMixes = prevPayload.moodMixes;
    }
  } catch (_) {}
  const payload = {
    v: FEED_VERSION,
    coldStart: !!feed.coldStart,
    cascade: feed.cascade || null,
    sections: feed.sections
  };
  if (moodMixes) payload.moodMixes = moodMixes;
  const row = {
    user_id: uid,
    local_day: localDay,
    timezone: timezone || 'UTC',
    payload,
    generated_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const { error } = await sb.from('user_recommendation_feeds').upsert(row, { onConflict: 'user_id' });
  if (error) {
    console.warn('[recommendations] cache write', error.message);
    return false;
  }
  return true;
}

/* ── Mood explore mixes (theme + personal, day-stable) ───────── */
const MOOD_VERSION = 1;
const MOOD_TRACKS = 50;

const MOOD_CATALOG = {
  mood1: {
    id: 'mood1',
    name: 'В работу',
    tag: 'focus instrumental',
    color: '#3d4a5c',
    cover: 'https://images.unsplash.com/photo-1497032628192-86f99bcd76bc?auto=format&fit=crop&w=640&q=80'
  },
  mood2: {
    id: 'mood2',
    name: 'Отдохнуть',
    tag: 'chill relax',
    color: '#2f4f45',
    cover: 'https://images.unsplash.com/photo-1519692933481-e162a57d6721?auto=format&fit=crop&w=640&q=80'
  },
  mood3: {
    id: 'mood3',
    name: 'Тренировка',
    tag: 'workout sport',
    color: '#5a3030',
    cover: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=640&q=80'
  },
  mood4: {
    id: 'mood4',
    name: 'Вечеринка',
    tag: 'party dance',
    color: '#5a4520',
    cover: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=640&q=80'
  },
  mood5: {
    id: 'mood5',
    name: 'Погрустить',
    tag: 'sad emotional',
    color: '#2e3a48',
    cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=640&q=80'
  },
  mood6: {
    id: 'mood6',
    name: 'С добрым утром',
    tag: 'morning acoustic',
    color: '#5a4028',
    cover: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=640&q=80'
  }
};

const MOOD_STRICT_QUERIES = {
  mood1: ['focus instrumental', 'deep focus beats', 'study lofi', 'concentration ambient', 'productive focus music'],
  mood2: ['chill relax', 'calm lo-fi', 'soft chill', 'evening relax', 'peaceful acoustic'],
  mood3: ['workout sport', 'gym motivational', 'running energy', 'training pump', 'cardio hits'],
  mood4: ['party dance', 'club dance hits', 'dance floor', 'party anthem', 'nightlife'],
  mood5: ['sad emotional', 'melancholy piano', 'heartbreak ballad', 'emotional indie', 'crying songs'],
  mood6: ['morning acoustic', 'soft morning', 'coffee acoustic', 'sunny morning', 'feel good morning']
};

function moodQueriesFor(id, tag, name) {
  const base = [
    ...(MOOD_STRICT_QUERIES[id] || []),
    tag,
    name,
    ...String(tag || '')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  ]
    .map((q) => String(q || '').trim())
    .filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const q of base) {
    const k = q.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(q);
    if (out.length >= 6) break;
  }
  return out;
}

function blendMoodWithRecs(moodTracks, recTracks, want, rand) {
  const moodN = Math.max(18, Math.round(want * 0.62));
  const recN = Math.max(8, want - moodN);
  const m = shuffle(moodTracks || [], rand).slice(0, moodN);
  const r = shuffle(recTracks || [], rand).slice(0, recN);
  const out = [];
  const seen = new Set();
  const push = (t) => {
    if (!t) return;
    const k = trackKey(t);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };
  const max = Math.max(m.length, r.length);
  for (let i = 0; i < max && out.length < want; i++) {
    if (i < m.length) push(m[i]);
    if (i < r.length && out.length < want) push(r[i]);
  }
  if (out.length < want) {
    for (const t of shuffle([...(moodTracks || []), ...(recTracks || [])], rand)) {
      push(t);
      if (out.length >= want) break;
    }
  }
  return out.slice(0, want);
}

function pickMoodArtists(tracks, want = 4) {
  const names = [];
  const seen = new Set();
  for (const t of tracks || []) {
    const n = t.artist?.name || t.artistName;
    if (!n || seen.has(String(n).toLowerCase())) continue;
    seen.add(String(n).toLowerCase());
    names.push(n);
    if (names.length >= want) break;
  }
  return names;
}

async function loadMoodPersonalSeeds(sb, uid, feed, rand) {
  const out = [];
  try {
    const { data } = await sb
      .from('liked_tracks')
      .select('payload')
      .eq('user_id', uid)
      .order('added_at', { ascending: false })
      .limit(40);
    for (const row of data || []) {
      const t = payloadTrack(row);
      if (t && !isSpokenOrNonMusic(t)) out.push(t);
    }
  } catch (_) {}
  for (const sec of feed?.sections || []) {
    if (sec.id === 'playlistOfTheDay' || sec.id === 'artistMixes' || sec.type === 'mixes') {
      for (const item of sec.items || []) {
        for (const raw of (item.tracks || []).slice(0, 12)) {
          const t = payloadTrack(raw) || raw;
          if (t && !isSpokenOrNonMusic(t)) out.push(t);
        }
      }
    }
  }
  let recs = shuffle(dedupeTracks(out), rand).slice(0, 16);
  const artists = [];
  const seenA = new Set();
  for (const t of recs) {
    const aid = t.artist?.id;
    const an = t.artist?.name || t.artistName || '';
    const key = aid ? `id:${aid}` : `n:${String(an).toLowerCase()}`;
    if (!an || seenA.has(key)) continue;
    seenA.add(key);
    artists.push({ id: aid, name: an });
    if (artists.length >= 5) break;
  }
  if (artists.length) {
    const tops = await Promise.all(
      artists.map(async (a) => {
        if (a.id && /^\d+$/.test(String(a.id))) return safeDzArr(`/artist/${a.id}/top?limit=12`);
        const found = await safeDzArr(`/search/artist?q=${encodeURIComponent(a.name)}&limit=3`);
        return found[0]?.id ? safeDzArr(`/artist/${found[0].id}/top?limit=12`) : [];
      })
    );
    recs = dedupeTracks([
      ...recs,
      ...tops.flat().map(normTrack).filter((t) => t && !isSpokenOrNonMusic(t))
    ]);
  }
  if (recs.length >= 3) {
    try {
      const more = await similarAroundSeeds(recs.slice(0, 12), likedSet(recs), rand, 30);
      recs = dedupeTracks([...recs, ...(more || [])]);
    } catch (_) {}
  }
  return shuffle(recs, rand).slice(0, 28);
}

async function buildMoodMix({ moodId, sb, uid, localDay, guest }) {
  const meta = MOOD_CATALOG[moodId];
  if (!meta) {
    const err = new Error('Unknown mood');
    err.statusCode = 404;
    throw err;
  }
  const rand = mulberry32(daySeed(uid || 'guest', `${localDay}|mood|${moodId}`));
  const queries = moodQueriesFor(meta.id, meta.tag, meta.name);
  const pages = await Promise.all(
    queries.flatMap((q) => [
      safeDzArr(`/search/track?q=${encodeURIComponent(q)}&limit=25`),
      safeDzArr(`/search/track?q=${encodeURIComponent(q)}&limit=25&index=25`)
    ])
  );
  const moodPool = dedupeTracks(
    pages
      .flat()
      .map(normTrack)
      .filter((t) => t && !isSpokenOrNonMusic(t))
  );
  let personal = [];
  if (!guest && sb && uid) {
    let feed = null;
    try {
      feed = await readCachedFeed(uid, localDay);
    } catch (_) {}
    personal = await loadMoodPersonalSeeds(sb, uid, feed, rand);
  }
  const tracks = blendMoodWithRecs(moodPool, personal, MOOD_TRACKS, rand);
  if (tracks.length < 8) {
    const err = new Error('Mood mix empty');
    err.statusCode = 502;
    throw err;
  }
  return {
    id: `mood_${meta.id}`,
    kind: 'mood',
    moodId: meta.id,
    name: meta.name,
    tag: meta.tag,
    artists: pickMoodArtists(tracks),
    cover: meta.cover || tracks[0]?.album?.cover_medium || tracks[0]?.album?.cover || '',
    color: meta.color || '',
    trackCount: tracks.length,
    tracks,
    localDay,
    readOnly: true,
    canSave: true
  };
}

async function readCachedMood(uid, localDay, moodId) {
  const data = await readFeedRow(uid);
  if (!data) return null;
  const rowDay = String(data.local_day || '').slice(0, 10);
  if (rowDay !== String(localDay).slice(0, 10)) return null;
  const payload = data.payload && typeof data.payload === 'object' ? data.payload : null;
  const pack = payload?.moodMixes;
  if (!pack || Number(pack.v) !== MOOD_VERSION) return null;
  if (String(pack.localDay || '') !== String(localDay)) return null;
  const mix = pack.byId && pack.byId[moodId];
  if (!mix?.tracks?.length) return null;
  return { ...mix, cached: true };
}

async function writeCachedMood(uid, localDay, timezone, moodId, mix) {
  const sb = cacheDb();
  if (!sb) return false;
  const prev = await readFeedRow(uid);
  const prevDay = String(prev?.local_day || '').slice(0, 10);
  const prevPayload =
    prev?.payload && typeof prev.payload === 'object' ? { ...prev.payload } : {};
  let moodMixes =
    prevDay === String(localDay).slice(0, 10) &&
    prevPayload.moodMixes &&
    Number(prevPayload.moodMixes.v) === MOOD_VERSION
      ? { ...prevPayload.moodMixes, byId: { ...(prevPayload.moodMixes.byId || {}) } }
      : { v: MOOD_VERSION, localDay, byId: {} };
  moodMixes.localDay = localDay;
  moodMixes.v = MOOD_VERSION;
  moodMixes.byId[moodId] = mix;
  const payload = {
    ...prevPayload,
    moodMixes
  };
  // Keep feed version marker if sections exist
  if (Array.isArray(prevPayload.sections) && prevPayload.sections.length) {
    payload.v = Number(prevPayload.v) || FEED_VERSION;
  }
  const row = {
    user_id: uid,
    local_day: localDay,
    timezone: timezone || prev?.timezone || 'UTC',
    payload,
    generated_at: prev?.generated_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const { error } = await sb.from('user_recommendation_feeds').upsert(row, { onConflict: 'user_id' });
  if (error) {
    console.warn('[recommendations] mood cache write', error.message);
    return false;
  }
  return true;
}

function feedHasArtistMixes(feed) {
  const sec = (feed?.sections || []).find((s) => s.id === 'artistMixes');
  // Incomplete / empty → repair. Short-but-present feeds are fine for the day;
  // FEED_VERSION bump regenerates with ARTIST_MIX_WANT.
  return !!(sec && Array.isArray(sec.items) && sec.items.length);
}

/**
 * Patch ONLY mixes into an existing day feed — keep artists / albums / day playlist as-is.
 */
async function repairMissingMixes(cached, sb, uid, localDay, timezone) {
  if (!cached || feedHasArtistMixes(cached)) return cached;
  const rand = mulberry32((daySeed(uid, localDay) ^ 0x4d4958) >>> 0);
  let likes = [];
  let follows = [];
  let recent = [];
  let playlistTracks = [];
  try {
    const lib = await loadLibrarySignals(sb, uid);
    likes = lib.likes || [];
    follows = lib.follows || [];
    recent = lib.recent || [];
    playlistTracks = lib.playlistTracks || [];
  } catch (e) {
    console.warn('[recommendations] mixes repair lib', e.message);
  }
  const banned = likedSet(likes);
  const pool = dedupeTracks([...likes, ...playlistTracks, ...recent]);
  const similarArtists =
    (cached.sections || []).find((s) => s.id === 'similarArtists')?.items || [];
  const mixes = await buildArtistMixesForFeed({
    likes,
    follows,
    similarArtists,
    seedArtists: rankArtists(likes).slice(0, 16),
    pool,
    banned,
    rand,
    want: ARTIST_MIX_WANT
  });
  if (!mixes.length) {
    console.warn('[recommendations] mixes repair produced 0');
    return cached;
  }
  const sections = (cached.sections || []).filter((s) => s.id !== 'artistMixes');
  const mixSec = {
    id: 'artistMixes',
    type: 'mixes',
    title: 'Миксы по исполнителям',
    items: mixes
  };
  const artIdx = sections.findIndex((s) => s.id === 'similarArtists');
  if (artIdx >= 0) sections.splice(artIdx + 1, 0, mixSec);
  else sections.unshift(mixSec);

  const feed = {
    ok: true,
    guest: false,
    cached: false,
    repaired: 'mixes',
    localDay,
    coldStart: !!cached.coldStart,
    sections
  };
  try {
    await writeCachedFeed(uid, localDay, timezone, feed);
  } catch (e) {
    console.warn('[recommendations] mixes repair write', e.message);
  }
  return feed;
}

module.exports = withHandler(async function recommendations(req, res) {
  const url = new URL(req.url || '/', 'http://local');
  const resource = (
    url.searchParams.get('resource') ||
    url.searchParams.get('action') ||
    'home'
  ).toLowerCase();

  if (req.method !== 'GET') {
    return send(res, 405, { error: 'Method not allowed' }, { Allow: 'GET' });
  }
  if (resource !== 'home' && resource !== 'mood') {
    return send(res, 400, { error: 'resource required: home|mood' });
  }

  const tz = url.searchParams.get('tz') || url.searchParams.get('timezone') || 'UTC';
  const dayParam = url.searchParams.get('day') || '';
  const offsetMinutes = url.searchParams.get('offset');
  const force = url.searchParams.get('force') === '1';
  const localDay = resolveLocalDay(tz, dayParam, offsetMinutes);

  /* ── Mood mix ─────────────────────────────────────────── */
  if (resource === 'mood') {
    const moodId = String(url.searchParams.get('id') || '').trim();
    if (!MOOD_CATALOG[moodId]) {
      return send(res, 400, { error: 'id required: mood1…mood6' });
    }

    let auth = null;
    let uid = null;
    let sb = null;
    try {
      auth = await requireUser(req);
      if (auth.session) setSessionCookies(res, auth.session);
      uid = auth.user.id;
      sb = userClient(auth.accessToken);
    } catch (e) {
      if (e.statusCode !== 401) throw e;
    }

    if (uid && !force) {
      try {
        const cached = await readCachedMood(uid, localDay, moodId);
        if (cached?.tracks?.length >= 8) {
          return send(res, 200, { ok: true, guest: false, cached: true, localDay, playlist: cached });
        }
      } catch (e) {
        console.warn('[recommendations] mood cache', e.message);
      }
    }

    const mix = await buildMoodMix({
      moodId,
      sb,
      uid,
      localDay,
      guest: !uid
    });
    if (uid) {
      try {
        await writeCachedMood(uid, localDay, tz, moodId, mix);
      } catch (e) {
        console.warn('[recommendations] mood write', e.message);
      }
    }
    return send(res, 200, {
      ok: true,
      guest: !uid,
      cached: false,
      localDay,
      playlist: mix
    });
  }

  /* ── Home feed ────────────────────────────────────────── */
  let auth;
  try {
    auth = await requireUser(req);
  } catch (e) {
    if (e.statusCode === 401) {
      return send(res, 200, { ok: true, guest: true, localDay, sections: [] });
    }
    throw e;
  }
  if (auth.session) setSessionCookies(res, auth.session);

  const sb = userClient(auth.accessToken);
  const uid = auth.user.id;

  // Day-stable: serve today's feed; if mixes missing — repair ONLY mixes
  if (!force) {
    try {
      const cached = await readCachedFeed(uid, localDay);
      if (cached) {
        if (feedHasArtistMixes(cached)) return send(res, 200, cached);
        const repaired = await repairMissingMixes(cached, sb, uid, localDay, tz);
        return send(res, 200, repaired);
      }
    } catch (e) {
      console.warn('[recommendations] cache read', e.message);
    }
  }

  let feed = await buildHomeFeed(sb, uid, localDay);
  feed.localDay = localDay;
  feed.cached = false;

  if (!feed.sections || !feed.sections.length) {
    try {
      const prev = await readCachedFeed(uid, localDay);
      if (prev) {
        if (!feedHasArtistMixes(prev)) {
          return send(res, 200, await repairMissingMixes(prev, sb, uid, localDay, tz));
        }
        return send(res, 200, prev);
      }
    } catch (_) {}
    return send(res, 200, feed);
  }

  if (!feedHasArtistMixes(feed)) {
    feed = await repairMissingMixes(feed, sb, uid, localDay, tz);
  }

  try {
    await writeCachedFeed(uid, localDay, tz, feed);
  } catch (e) {
    console.warn('[recommendations] cache write fail', e.message);
  }
  return send(res, 200, feed);
});
