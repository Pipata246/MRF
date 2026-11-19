'use strict';

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body != null && typeof req.body === 'object') {
      resolve(req.body);
      return;
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(Object.assign(new Error('Invalid JSON'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}

function send(res, status, data, extraHeaders) {
  if (res.headersSent) return;
  const body = JSON.stringify(data ?? {});
  // Prefer setHeader + statusCode (Vercel Node) over writeHead after prior setHeader(CORS/cookies)
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (extraHeaders) {
    Object.entries(extraHeaders).forEach(([k, v]) => {
      if (v != null) res.setHeader(k, v);
    });
  }
  res.end(body);
}

function setSessionCookies(res, session) {
  if (!session?.access_token) return;
  const secure = process.env.VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const maxAt = Math.max(60, Number(session.expires_in) || 3600);
  const cookies = [
    `mrf_at=${encodeURIComponent(session.access_token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAt}${secure}`,
    `mrf_rt=${encodeURIComponent(session.refresh_token || '')}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 14}${secure}`
  ];
  res.setHeader('Set-Cookie', cookies);
}

function clearSessionCookies(res) {
  const secure = process.env.VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', [
    `mrf_at=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
    `mrf_rt=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  ]);
}

function methodNotAllowed(res, allow) {
  send(res, 405, { error: 'Method not allowed' }, { Allow: allow });
}

function withHandler(fn) {
  return async function handler(req, res) {
    try {
      // CORS for local / preview
      const origin = req.headers.origin;
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      await fn(req, res);
    } catch (e) {
      const status = e.statusCode || 500;
      send(res, status, { error: e.message || 'Server error' });
    }
  };
}

module.exports = {
  parseCookies,
  readBody,
  send,
  setSessionCookies,
  clearSessionCookies,
  methodNotAllowed,
  withHandler
};
