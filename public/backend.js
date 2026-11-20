/* =====================================================
   MRF — frontend bridge to /api/* only (no Supabase in browser)
   ===================================================== */
(function () {
  'use strict';

  const AUTH_HINT_KEY = 'mrf_auth_hint';
  const MrfAuth = {
    ready: false,
    session: null, // { user }
    profile: null,
    _listeners: []
  };

  function setAuthHint(on) {
    try {
      if (on) localStorage.setItem(AUTH_HINT_KEY, '1');
      else localStorage.removeItem(AUTH_HINT_KEY);
    } catch (_) {}
  }
  function hasAuthHint() {
    try { return localStorage.getItem(AUTH_HINT_KEY) === '1'; }
    catch (_) { return false; }
  }
  const MrfCloud = { _quiet: false, _pushTimer: null };

  window.MrfAuth = MrfAuth;
  window.MrfCloud = MrfCloud;

  function apiBase() {
    const e = window.__MRF_ENV__ || {};
    return (e.API_BASE || '').replace(/\/$/, '');
  }

  async function api(path, opts = {}) {
    const res = await fetch(apiBase() + path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts,
      body: opts.body != null ? JSON.stringify(opts.body) : undefined
    });
    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    if (!res.ok) {
      const msg = (data && (data.error || data.message))
        || (res.status === 404 ? 'API не найден на сервере' : '')
        || (res.status === 500 || res.status === 503 ? 'Сервер не настроен (проверь env и Redeploy)' : '')
        || res.statusText
        || `Ошибка API (${res.status || '?'})`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function notify() {
    MrfAuth._listeners.forEach((fn) => {
      try { fn(MrfAuth.session, MrfAuth.profile); } catch (_) {}
    });
    try {
      window.dispatchEvent(new CustomEvent('mrf:auth', {
        detail: { session: MrfAuth.session, profile: MrfAuth.profile }
      }));
    } catch (_) {}
  }

  function normalizeUsername(raw) {
    return String(raw || '').trim().replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
  }
  function displayUsername(u) {
    const n = normalizeUsername(u);
    return n ? '@' + n : '';
  }
  function validateUsername(u) {
    const n = normalizeUsername(u);
    if (n.length < 3) return 'Никнейм: минимум 3 символа';
    if (n.length > 24) return 'Никнейм: максимум 24 символа';
    if (!/^[a-z0-9_]+$/.test(n)) return 'Только латиница, цифры и _';
    return '';
  }
  function validatePassword(p) {
    const s = String(p || '');
    if (s.length < 8) return 'Пароль: минимум 8 символов';
    if (s.length > 72) return 'Пароль слишком длинный';
    return '';
  }

  function applyProfileLocal(profile) {
    if (!profile || typeof Store === 'undefined') return;
    MrfCloud._quiet = true;
    try {
      Store.setProfile({
        id: profile.id,
        name: profile.name,
        username: profile.username,
        avatar: profile.avatar || null,
        plan: profile.plan || 'MRF Free',
        joinedAt: profile.joinedAt
      });
    } finally {
      MrfCloud._quiet = false;
    }
    if (typeof updateTopbarAvatar === 'function') updateTopbarAvatar();
  }

  async function pullLibrary() {
    if (!MrfAuth.session || typeof Store === 'undefined') return;
    MrfCloud._quiet = true;
    try {
      const [likes, follows, albums, settings, playlists, savedPlaylists, recent, history] = await Promise.all([
        api('/api/library?resource=likes'),
        api('/api/library?resource=follows'),
        api('/api/library?resource=albums'),
        api('/api/me?resource=settings'),
        api('/api/library?resource=playlists'),
        api('/api/library?resource=savedPlaylists'),
        api('/api/library?resource=recent'),
        api('/api/library?resource=history')
      ]);
      if (likes?.items) {
        Store.setFavs(likes.items);
        if (typeof favourites !== 'undefined') favourites = Store.getFavs();
      }
      if (follows?.items) Store.setFollowed(follows.items);
      if (albums?.items) Store.setAlbums(albums.items);
      if (settings?.settings) {
        Store.setSettings(settings.settings);
        if (typeof applyThemeFromSettings === 'function') applyThemeFromSettings();
      }
      if (playlists?.items || savedPlaylists?.items) {
        const owned = Array.isArray(playlists?.items) ? playlists.items : [];
        const saved = Array.isArray(savedPlaylists?.items) ? savedPlaylists.items : [];
        Store.setPlaylists([...owned, ...saved]);
      }
      if (recent?.items && typeof Store.setRecent === 'function') {
        Store.setRecent(recent.items);
        if (typeof recentTracks !== 'undefined') recentTracks = Store.getRecent();
      }
      if (history?.items) {
        try {
          localStorage.setItem(Store.keys.history, JSON.stringify(history.items));
        } catch (_) { /* ignore */ }
        if (typeof MOCK !== 'undefined') MOCK.searchHistory = history.items;
      }
    } catch (e) {
      console.warn('[MRF] pullLibrary', e.message);
    } finally {
      MrfCloud._quiet = false;
    }
    if (typeof notifyLibraryChanged === 'function') notifyLibraryChanged();
    if (typeof syncFavIcons === 'function') syncFavIcons();
    if (typeof updateFavBadge === 'function') updateFavBadge();
    if (typeof renderSidebarPlaylists === 'function') renderSidebarPlaylists();
    if (typeof renderHomeRecent === 'function') renderHomeRecent();
    else if (typeof window.renderHomeRecent === 'function') window.renderHomeRecent();
    if (typeof renderSearchHistory === 'function') renderSearchHistory();
    else if (typeof window.renderSearchHistory === 'function') window.renderSearchHistory();
  }

  function schedulePush(kind) {
    if (MrfCloud._quiet || !MrfAuth.session) return;
    clearTimeout(MrfCloud._pushTimer);
    MrfCloud._pushTimer = setTimeout(async () => {
      try {
        if (kind === 'favs' || kind === 'all') {
          await api('/api/library?resource=likes', { method: 'PUT', body: { items: Store.getFavs() } });
        }
        if (kind === 'followed' || kind === 'all') {
          await api('/api/library?resource=follows', { method: 'PUT', body: { items: Store.getFollowed() } });
        }
        if (kind === 'albums' || kind === 'all') {
          await api('/api/library?resource=albums', { method: 'PUT', body: { items: Store.getAlbums() } });
        }
        if (kind === 'settings' || kind === 'all') {
          await api('/api/me?resource=settings', { method: 'PUT', body: { settings: Store.getSettings() } });
        }
        if (kind === 'playlists' || kind === 'all') {
          const owned = typeof Store.getOwnedPlaylists === 'function'
            ? Store.getOwnedPlaylists()
            : (Store.getPlaylists() || []).filter((p) => p && p.origin !== 'saved' && !p.readOnly);
          await api('/api/library?resource=playlists', { method: 'PUT', body: { items: owned } });
        }
        if (kind === 'recent' || kind === 'all') {
          await api('/api/library?resource=recent', { method: 'PUT', body: { items: Store.getRecent() } });
        }
        if (kind === 'history' || kind === 'all') {
          await api('/api/library?resource=history', { method: 'PUT', body: { items: Store.getHistory() } });
        }
        if (kind === 'profile' || kind === 'all') {
          const p = Store.getProfile();
          const body = { name: p.name };
          // Only sync real cloud URLs — never push local data: URLs
          if (p.avatar && String(p.avatar).startsWith('http')) body.avatar_url = p.avatar;
          await api('/api/me?resource=profile', { method: 'PATCH', body });
        }
      } catch (e) {
        console.warn('[MRF] cloud push', e.message);
      }
    }, 400);
  }

  function isAuthed() {
    return !!(MrfAuth.session && MrfAuth.session.user);
  }

  function clearLocalLibraryQuiet() {
    if (typeof Store === 'undefined') return;
    MrfCloud._quiet = true;
    try {
      if (typeof Store.setFavs === 'function') Store.setFavs([]);
      if (typeof Store.setFollowed === 'function') Store.setFollowed([]);
      if (typeof Store.setAlbums === 'function') Store.setAlbums([]);
      if (typeof Store.setPlaylists === 'function') Store.setPlaylists([]);
      if (typeof Store.setRecent === 'function') Store.setRecent([]);
      if (typeof Store.clearHistory === 'function') Store.clearHistory();
      if (typeof Store.setProfile === 'function') {
        Store.setProfile({
          id: null,
          name: 'Пользователь',
          username: '',
          avatar: null,
          plan: 'free',
          joinedAt: null
        });
      }
    } finally {
      MrfCloud._quiet = false;
    }
    if (typeof favourites !== 'undefined') favourites = [];
    if (typeof recentTracks !== 'undefined') recentTracks = [];
    if (typeof syncFavIcons === 'function') syncFavIcons();
    if (typeof updateFavBadge === 'function') updateFavBadge();
    if (typeof updateTopbarAvatar === 'function') updateTopbarAvatar();
    if (typeof renderHomeRecent === 'function') renderHomeRecent();
    else if (typeof window.renderHomeRecent === 'function') window.renderHomeRecent();
    if (typeof renderSearchHistory === 'function') renderSearchHistory();
    else if (typeof window.renderSearchHistory === 'function') window.renderSearchHistory();
  }

  function wrapStore() {
    if (typeof Store === 'undefined' || Store.__mrfCloudWrapped) return;
    Store.__mrfCloudWrapped = true;
    const gated = new Set([
      'setFavs', 'toggleFav',
      'setFollowed', 'toggleFollow',
      'setAlbums', 'toggleAlbum',
      'setPlaylists', 'createPlaylist', 'updatePlaylist', 'deletePlaylist',
      'addTrackToPlaylist', 'removeTrackFromPlaylist', 'savePlaylist', 'unsavePlaylist',
      'addRecent', 'setRecent', 'addHistory', 'clearHistory', 'removeHistory'
    ]);
    const silentGuest = new Set(['addRecent', 'setRecent', 'addHistory', 'clearHistory', 'removeHistory']);
    const hook = (method, kind) => {
      if (typeof Store[method] !== 'function') return;
      const orig = Store[method].bind(Store);
      Store[method] = function (...args) {
        if (gated.has(method) && !MrfCloud._quiet && !isAuthed()) {
          if (!silentGuest.has(method) && typeof showNotif === 'function') {
            showNotif('Сначала войди в аккаунт');
          }
          if (method.indexOf('toggle') === 0) return false;
          if (method === 'savePlaylist' || method === 'unsavePlaylist') return false;
          return method === 'createPlaylist' ? null : undefined;
        }
        const result = orig(...args);
        if (method === 'savePlaylist' || method === 'unsavePlaylist') {
          if (!MrfCloud._quiet) syncSavedPlaylist(method, args[0], result);
          return result;
        }
        schedulePush(kind);
        return result;
      };
    };
    hook('setFavs', 'favs');
    hook('toggleFav', 'favs');
    hook('setFollowed', 'followed');
    hook('toggleFollow', 'followed');
    hook('setAlbums', 'albums');
    hook('toggleAlbum', 'albums');
    hook('setSettings', 'settings');
    hook('setPlaylists', 'playlists');
    hook('createPlaylist', 'playlists');
    hook('updatePlaylist', 'playlists');
    hook('deletePlaylist', 'playlists');
    hook('addTrackToPlaylist', 'playlists');
    hook('removeTrackFromPlaylist', 'playlists');
    hook('savePlaylist', 'savedPlaylists');
    hook('unsavePlaylist', 'savedPlaylists');
    hook('setProfile', 'profile');
    hook('addRecent', 'recent');
    hook('setRecent', 'recent');
    hook('addHistory', 'history');
    hook('clearHistory', 'history');
    hook('removeHistory', 'history');
  }

  function syncSavedPlaylist(method, arg, ok) {
    if (MrfCloud._quiet || !isAuthed() || !ok) return;
    const playlistId = method === 'savePlaylist'
      ? String(arg && arg.id != null ? arg.id : arg || '')
      : String(arg || '');
    if (!playlistId) return;
    const path = '/api/library?resource=savedPlaylists';
    const req = method === 'savePlaylist'
      ? api(path, { method: 'POST', body: { playlistId } })
      : api(path, { method: 'DELETE', body: { playlistId } });
    req.then((data) => {
      if (method === 'savePlaylist' && data?.item && typeof Store.savePlaylist === 'function') {
        MrfCloud._quiet = true;
        try { Store.savePlaylist(data.item); } finally { MrfCloud._quiet = false; }
      }
    }).catch((e) => {
      console.warn('[MRF] saved playlist sync', e.message);
    });
  }

  async function refreshSession() {
    try {
      const data = await api('/api/auth?action=session');
      if (data.user) {
        MrfAuth.session = { user: data.user };
        MrfAuth.profile = data.profile;
        setAuthHint(true);
        applyProfileLocal(data.profile);
        await pullLibrary();
      } else {
        MrfAuth.session = null;
        MrfAuth.profile = null;
        setAuthHint(false);
        clearLocalLibraryQuiet();
      }
    } catch (_) {
      MrfAuth.session = null;
      MrfAuth.profile = null;
      // Keep hint on network blip so profile page doesn't flash login
      clearLocalLibraryQuiet();
    }
    notify();
  }

  async function register({ username, password, displayName }) {
    const uErr = validateUsername(username);
    if (uErr) return { ok: false, error: uErr };
    const pErr = validatePassword(password);
    if (pErr) return { ok: false, error: pErr };
    try {
      const data = await api('/api/auth', {
        method: 'POST',
        body: { action: 'register', username, password, displayName }
      });
      MrfAuth.session = { user: data.user };
      MrfAuth.profile = data.profile;
      setAuthHint(true);
      applyProfileLocal(data.profile);
      await pullLibrary();
      notify();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || 'Ошибка регистрации' };
    }
  }

  async function login({ username, password }) {
    const uErr = validateUsername(username);
    if (uErr) return { ok: false, error: uErr };
    if (!password) return { ok: false, error: 'Введи пароль' };
    try {
      const data = await api('/api/auth', {
        method: 'POST',
        body: { action: 'login', username, password }
      });
      MrfAuth.session = { user: data.user };
      MrfAuth.profile = data.profile;
      setAuthHint(true);
      applyProfileLocal(data.profile);
      await pullLibrary();
      notify();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || 'Неверный логин или пароль' };
    }
  }

  async function logout() {
    try { await api('/api/auth', { method: 'POST', body: { action: 'logout' } }); } catch (_) {}
    MrfAuth.session = null;
    MrfAuth.profile = null;
    setAuthHint(false);
    clearLocalLibraryQuiet();
    notify();
    return { ok: true };
  }

  async function deleteAccount({ password } = {}) {
    if (!password) return { ok: false, error: 'Введи пароль для подтверждения' };
    try {
      await api('/api/auth', {
        method: 'POST',
        body: {
          action: 'delete-account',
          password: String(password),
          username: MrfAuth.profile?.username || ''
        }
      });
      MrfAuth.session = null;
      MrfAuth.profile = null;
      setAuthHint(false);
      clearLocalLibraryQuiet();
      if (typeof Store !== 'undefined' && typeof Store.reset === 'function') {
        MrfCloud._quiet = true;
        try { Store.reset(); } finally { MrfCloud._quiet = false; }
      }
      notify();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || 'Не удалось удалить аккаунт' };
    }
  }

  async function updateProfile({ name } = {}) {
    try {
      const data = await api('/api/me?resource=profile', {
        method: 'PATCH',
        body: { name }
      });
      MrfAuth.profile = data.profile;
      applyProfileLocal(data.profile);
      notify();
      return { ok: true, profile: data.profile };
    } catch (e) {
      return { ok: false, error: e.message || 'Не удалось сохранить профиль' };
    }
  }

  function isConfigured() {
    // Server holds secrets; frontend is "configured" if API answers
    return true;
  }
  function isLoggedIn() {
    return !!(MrfAuth.session && MrfAuth.session.user);
  }

  async function initBackend() {
    wrapStore();
    MrfAuth.ready = false;
    await refreshSession();
    try {
      const h = await api('/api/auth?action=health');
      MrfAuth._health = h && typeof h === 'object'
        ? h
        : { ok: false, supabaseConfigured: false };
    } catch (_) {
      // On Vercel this usually means env missing on this deployment (need Redeploy)
      // or /api route not reachable.
      MrfAuth._health = { ok: false, supabaseConfigured: false };
    }
    MrfAuth.ready = true;
    notify();
  }

  MrfAuth.hasAuthHint = hasAuthHint;

  MrfAuth.normalizeUsername = normalizeUsername;
  MrfAuth.displayUsername = displayUsername;
  MrfAuth.validateUsername = validateUsername;
  MrfAuth.validatePassword = validatePassword;
  MrfAuth.isConfigured = () => !!(MrfAuth._health && MrfAuth._health.supabaseConfigured !== false);
  MrfAuth.isLoggedIn = isLoggedIn;
  MrfAuth.register = register;
  MrfAuth.login = login;
  MrfAuth.logout = logout;
  MrfAuth.deleteAccount = deleteAccount;
  MrfAuth.updateProfile = updateProfile;
  MrfAuth.onChange = (fn) => { if (typeof fn === 'function') MrfAuth._listeners.push(fn); };
  MrfCloud.pullLibrary = pullLibrary;
  MrfCloud.schedulePush = schedulePush;
  window.initMrfBackend = initBackend;
  window.mrfApi = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { initBackend(); });
  } else {
    initBackend();
  }
})();
