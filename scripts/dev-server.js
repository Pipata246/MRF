#!/usr/bin/env node
'use strict';

/**
 * Local static + /api server (respects the 12-file API lock).
 * Loads .env from project root (server-side only).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const root = path.join(__dirname, '..');
const pub = path.join(root, 'public');
const port = Number(process.env.PORT || 3000);

function loadEnvFile() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const i = t.indexOf('=');
    if (i < 0) return;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (k && process.env[k] == null) process.env[k] = v;
  });
}

loadEnvFile();

const API = {
  '/api/auth': require('../api/auth'),
  '/api/me': require('../api/me'),
  '/api/library': require('../api/library'),
  '/api/recommendations': require('../api/recommendations')
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url || '/', `http://127.0.0.1:${port}`);
  const pathname = u.pathname;

  if (pathname.startsWith('/api/')) {
    const base = pathname.replace(/\/$/, '') || pathname;
    const handler = API[base];
    if (!handler) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unknown API route' }));
      return;
    }
    req.url = base + u.search;
    return handler(req, res);
  }

  let rel = decodeURIComponent(pathname);
  if (rel === '/') rel = '/index.html';
  const filePath = path.normalize(path.join(pub, rel));
  if (!filePath.startsWith(pub)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.stat(filePath, (err, st) => {
    if (!err && st.isFile()) return sendFile(res, filePath);
    const htmlTry = filePath.endsWith('.html') ? filePath : filePath + '.html';
    fs.stat(htmlTry, (e2, st2) => {
      if (!e2 && st2.isFile()) return sendFile(res, htmlTry);
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    });
  });
});

server.listen(port, () => {
  const n = Object.keys(API).length;
  console.log(`[MRF] http://127.0.0.1:${port}  (API ${n}/12)`);
});
