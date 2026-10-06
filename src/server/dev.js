#!/usr/bin/env node
// Local server: serves ./dist (built static site) and routes /api/* to the same
// Web-standard handler Vercel runs. Also applies the vercel.json rewrites that matter locally.
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import app from './app.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(here, '..', '..', 'dist');
const PORT = Number.parseInt(process.env.PORT || '3000', 10);

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json' };

function resolveStatic(pathname) {
  let p = decodeURIComponent(pathname);
  p = p.replace(/^(\/(?:nl|es))?\/order\/[^/]+$/, '$1/order/index.html');
  if (p === '/admin') p = '/admin/index.html';
  const candidates = [p, `${p}.html`, path.posix.join(p, 'index.html')];
  for (const c of candidates) {
    const full = path.join(DIST, c);
    if (!full.startsWith(DIST)) return null;
    if (existsSync(full) && statSync(full).isFile()) return full;
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    const headers = new Headers();
    for (const [k, val] of Object.entries(req.headers)) if (val !== undefined) headers.set(k, Array.isArray(val) ? val.join(', ') : val);
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    const request = new Request(url, { method: req.method, headers, body: hasBody ? Readable.toWeb(req) : undefined, duplex: 'half' });
    const response = await app.fetch(request);
    res.statusCode = response.status;
    response.headers.forEach((val, k) => { if (k === 'set-cookie') return; res.setHeader(k, val); });
    const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    if (cookies.length) res.setHeader('set-cookie', cookies);
    if (response.body) {
      const reader = response.body.getReader();
      for (;;) { const { done, value } = await reader.read(); if (done) break; res.write(value); }
    }
    res.end();
    return;
  }
  const file = resolveStatic(url.pathname);
  if (!file) {
    const nf = path.join(DIST, '404.html');
    res.statusCode = 404;
    if (existsSync(nf)) { res.setHeader('content-type', 'text/html; charset=utf-8'); createReadStream(nf).pipe(res); } else res.end('Not found');
    return;
  }
  res.setHeader('content-type', MIME[path.extname(file)] || 'application/octet-stream');
  if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('cache-control', 'public, max-age=31536000, immutable');
  createReadStream(file).pipe(res);
});

server.listen(PORT, () => console.log(`RYNSE dev server → http://localhost:${PORT}  (static: ${DIST}, provider: ${process.env.PAYMENT_PROVIDER || 'emulator'})`));
