// Sessions (signed cookies), CSRF, magic-link tokens, admin auth, rate limiting.
import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { getSql } from './db.js';
import { HttpError, parseCookies, serializeCookie, clientIp } from './http.js';

const SESSION_COOKIE = 'rynse_session';
const CSRF_COOKIE = 'rynse_csrf';
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
      throw new Error('SESSION_SECRET must be set (>= 32 chars) in production');
    }
    return 'dev-only-insecure-session-secret-change-me-0123456789';
  }
  return s;
}

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sign = (payload) => createHmac('sha256', secret()).update(payload).digest('base64url');

export function isSecureRequest(request) {
  const proto = request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '');
  return proto === 'https';
}

/** Create a signed session cookie value. */
export function createSession(data, ttl = SESSION_TTL) {
  const body = b64u(JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + ttl }));
  return `${body}.${sign(body)}`;
}

export function readSession(request) {
  const raw = parseCookies(request)[SESSION_COOKIE];
  if (!raw) return null;
  const [body, sig] = raw.split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now() / 1000) return null;
    return data;
  } catch {
    return null;
  }
}

export function sessionCookieHeaders(request, value, { clear = false } = {}) {
  const secure = isSecureRequest(request);
  return {
    'set-cookie': serializeCookie(SESSION_COOKIE, clear ? '' : value, { maxAge: clear ? 0 : SESSION_TTL, secure, sameSite: 'Lax' }),
  };
}

export function requireSession(request) {
  const s = readSession(request);
  if (!s || !s.customerId) throw new HttpError(401, 'Please sign in');
  return s;
}

/**
 * CSRF: double-submit cookie. The client reads the (non-HttpOnly) csrf cookie
 * and sends it back as the `x-csrf-token` header. Cross-site pages cannot read
 * the cookie, so they cannot forge the header. Combined with SameSite=Lax and
 * an Origin check this protects all state-changing JSON endpoints.
 */
export function ensureCsrfCookie(request, headers = {}) {
  const cookies = parseCookies(request);
  if (cookies[CSRF_COOKIE]) return { token: cookies[CSRF_COOKIE], headers };
  const token = b64u(randomBytes(24));
  const existing = headers['set-cookie'];
  const cookie = serializeCookie(CSRF_COOKIE, token, { maxAge: SESSION_TTL, httpOnly: false, secure: isSecureRequest(request), sameSite: 'Lax' });
  return { token, headers: { ...headers, 'set-cookie': existing ? [existing, cookie] : cookie } };
}

export function verifyCsrf(request) {
  const cookie = parseCookies(request)[CSRF_COOKIE];
  const header = request.headers.get('x-csrf-token');
  if (!cookie || !header || cookie.length !== header.length || !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) {
    throw new HttpError(403, 'Invalid CSRF token — please reload the page and try again');
  }
  const origin = request.headers.get('origin');
  if (origin) {
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
    try {
      if (new URL(origin).host !== host) throw new HttpError(403, 'Cross-origin request blocked');
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(403, 'Invalid origin');
    }
  }
}

/** Magic-link tokens: random secret, only the hash is stored. */
export function newLoginToken() {
  const token = b64u(randomBytes(32));
  return { token, hash: hashToken(token) };
}
export const hashToken = (t) => createHash('sha256').update(t).digest('hex');

/** Admin: bearer token compared in constant time. */
export function requireAdmin(request) {
  const expected = process.env.ADMIN_TOKEN || '';
  const auth = request.headers.get('authorization') || '';
  const given = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!expected || expected.length < 16) throw new HttpError(503, 'ADMIN_TOKEN is not configured');
  if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    throw new HttpError(401, 'Unauthorized');
  }
}

export function requireCron(request) {
  const expected = process.env.CRON_SECRET || '';
  const auth = request.headers.get('authorization') || '';
  if (!expected) throw new HttpError(503, 'CRON_SECRET is not configured');
  if (auth !== `Bearer ${expected}`) throw new HttpError(401, 'Unauthorized');
}

/**
 * Fixed-window rate limiter backed by Postgres so it works across serverless instances.
 * bucket = `${scope}:${ip}`; allows `limit` hits per `windowSec`.
 */
export async function rateLimit(request, scope, { limit = 20, windowSec = 60 } = {}) {
  const sql = getSql();
  const ip = clientIp(request);
  const bucket = `${scope}:${ip}`;
  const windowStart = new Date(Math.floor(Date.now() / (windowSec * 1000)) * windowSec * 1000);
  const [row] = await sql`
    INSERT INTO rate_limits (bucket, window_start, count) VALUES (${bucket}, ${windowStart}, 1)
    ON CONFLICT (bucket, window_start) DO UPDATE SET count = rate_limits.count + 1
    RETURNING count`;
  if (row.count > limit) throw new HttpError(429, 'Too many requests — please wait a moment', { retryAfter: windowSec });
  // opportunistic cleanup (cheap, occasional)
  if (Math.random() < 0.02) await sql`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`;
}

export function randomId(prefix, bytes = 8) {
  return `${prefix}${randomBytes(bytes).toString('hex')}`;
}
