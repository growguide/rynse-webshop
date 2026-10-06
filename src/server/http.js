// Small helpers around the Web Request/Response API used by every route.

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(init.headers || {}) },
  });

export const text = (body, init = {}) =>
  new Response(body, { ...init, headers: { 'content-type': 'text/plain; charset=utf-8', ...(init.headers || {}) } });

export const html = (body, init = {}) =>
  new Response(body, { ...init, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...(init.headers || {}) } });

export const redirect = (location, status = 303, headers = {}) =>
  new Response(null, { status, headers: { location, ...headers } });

export async function readJson(request, { maxBytes = 64 * 1024 } = {}) {
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new HttpError(415, 'Expected application/json');
  const buf = await request.arrayBuffer();
  if (buf.byteLength > maxBytes) throw new HttpError(413, 'Payload too large');
  try {
    return JSON.parse(new TextDecoder().decode(buf));
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

export async function readForm(request, { maxBytes = 64 * 1024 } = {}) {
  const buf = await request.arrayBuffer();
  if (buf.byteLength > maxBytes) throw new HttpError(413, 'Payload too large');
  return new URLSearchParams(new TextDecoder().decode(buf));
}

export function parseCookies(request) {
  const header = request.headers.get('cookie') || '';
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function serializeCookie(name, value, { maxAge, path = '/', httpOnly = true, secure = true, sameSite = 'Lax' } = {}) {
  let s = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
  if (httpOnly) s += '; HttpOnly';
  if (secure) s += '; Secure';
  if (maxAge !== undefined) s += `; Max-Age=${maxAge}`;
  return s;
}

export function clientIp(request) {
  return (
    request.headers.get('x-real-ip') ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    '0.0.0.0'
  );
}

/** Validation helpers — tiny on purpose (no external schema library). */
export const v = {
  str(x, { min = 0, max = 200, name = 'value' } = {}) {
    if (typeof x !== 'string') throw new HttpError(400, `${name} must be a string`);
    const s = x.trim();
    if (s.length < min) throw new HttpError(400, `${name} is required`);
    if (s.length > max) throw new HttpError(400, `${name} is too long`);
    return s;
  },
  email(x, name = 'email') {
    const s = v.str(x, { min: 3, max: 254, name }).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) throw new HttpError(400, 'Please enter a valid e-mail address');
    return s;
  },
  uuid(x, name = 'id') {
    if (typeof x !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x)) throw new HttpError(400, `${name} is not a valid id`);
    return x;
  },
  int(x, { min = -Infinity, max = Infinity, name = 'value' } = {}) {
    const n = typeof x === 'string' ? Number.parseInt(x, 10) : x;
    if (!Number.isInteger(n)) throw new HttpError(400, `${name} must be a whole number`);
    if (n < min || n > max) throw new HttpError(400, `${name} must be between ${min} and ${max}`);
    return n;
  },
  oneOf(x, options, name = 'value') {
    if (!options.includes(x)) throw new HttpError(400, `${name} must be one of: ${options.join(', ')}`);
    return x;
  },
  bool(x) {
    return x === true || x === 'true' || x === 1 || x === '1';
  },
};
