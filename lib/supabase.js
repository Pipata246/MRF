'use strict';

const { createClient } = require('@supabase/supabase-js');
const { parseCookies } = require('./http');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    const err = new Error(`Missing env ${name}`);
    err.statusCode = 500;
    throw err;
  }
  return v;
}

function getUrl() {
  return process.env.MRF_SUPABASE_URL || process.env.SUPABASE_URL || '';
}

function getAnon() {
  return process.env.MRF_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
}

function getService() {
  return process.env.MRF_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function adminClient() {
  const url = getUrl();
  const key = getService() || getAnon();
  if (!url || !key) {
    const err = new Error('Supabase is not configured on the server');
    err.statusCode = 503;
    throw err;
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function anonClient() {
  const url = getUrl();
  const key = getAnon();
  if (!url || !key) {
    const err = new Error('Supabase is not configured on the server');
    err.statusCode = 503;
    throw err;
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function userClient(accessToken) {
  const url = getUrl();
  const key = getAnon();
  if (!url || !key) {
    const err = new Error('Supabase is not configured on the server');
    err.statusCode = 503;
    throw err;
  }
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function bearerFromReq(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  const cookies = parseCookies(req);
  return cookies.mrf_at || '';
}

async function requireUser(req) {
  let access = bearerFromReq(req);
  const cookies = parseCookies(req);
  const refresh = cookies.mrf_rt || '';

  if (!access && !refresh) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }

  const anon = anonClient();

  if (!access && refresh) {
    const { data, error } = await anon.auth.refreshSession({ refresh_token: refresh });
    if (error || !data.session) {
      const err = new Error('Unauthorized');
      err.statusCode = 401;
      throw err;
    }
    return { user: data.session.user, session: data.session, accessToken: data.session.access_token };
  }

  const { data, error } = await anon.auth.getUser(access);
  if (error || !data?.user) {
    if (refresh) {
      const refreshed = await anon.auth.refreshSession({ refresh_token: refresh });
      if (!refreshed.error && refreshed.data.session) {
        return {
          user: refreshed.data.session.user,
          session: refreshed.data.session,
          accessToken: refreshed.data.session.access_token
        };
      }
    }
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }
  return { user: data.user, session: null, accessToken: access };
}

module.exports = {
  requireEnv,
  getUrl,
  getAnon,
  getService,
  adminClient,
  anonClient,
  userClient,
  bearerFromReq,
  requireUser
};
