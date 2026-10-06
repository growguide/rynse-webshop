// Test harness: runs the API handler in-process against the rynse_test database with the payment emulator.
import './env.js';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from '../src/server/db.js';
import app from '../src/server/app.js';
import { paymentProvider } from '../src/server/payments/provider.js';
import { processPaymentWebhook } from '../src/server/webhooks.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const sql = getSql();
export const emu = () => paymentProvider();

export async function resetDb() {
  await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const dir = path.join(here, '..', 'db', 'migrations');
  for (const f of (await readdir(dir)).filter((x) => x.endsWith('.sql')).sort()) await sql.unsafe(await readFile(path.join(dir, f), 'utf8'));
}

let csrf = null;
let cookie = '';
export async function api(method, pathname, body, { headers = {}, raw = false } = {}) {
  if (!csrf) {
    const r = await app.fetch(new Request('http://test.local/api/config'));
    const d = await r.json(); csrf = d.csrfToken;
    const sc = r.headers.get('set-cookie') || ''; cookie = sc.split(';')[0];
  }
  // Each call comes from a fresh IP so the (working) per-IP rate limiter does not throttle the suite.
  const h = { cookie, 'x-csrf-token': csrf, origin: 'http://test.local', host: 'test.local', 'x-real-ip': `10.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`, ...headers };
  let payload;
  if (body instanceof URLSearchParams) { h['content-type'] = 'application/x-www-form-urlencoded'; payload = body.toString(); }
  else if (body !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await app.fetch(new Request(`http://test.local${pathname}`, { method, headers: h, body: payload }));
  if (raw) return res;
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

export function setSessionCookie(value) { cookie = `${cookie}; rynse_session=${encodeURIComponent(value)}`; }
export function resetSession() { csrf = null; cookie = ''; }

export const customer = (overrides = {}) => ({
  email: 'tester@example.com', name: 'Tess Tester',
  address: { street: 'Prinsengracht 1', postalCode: '1015 DX', city: 'Amsterdam', country: 'NL' },
  method: 'ideal', ...overrides,
});

export async function checkout(mode = 'one_time', quantity = 1, overrides = {}) {
  const r = await api('POST', '/api/checkout', { mode, quantity, ...customer(overrides) });
  if (r.status !== 200) throw new Error(`checkout failed: ${r.status} ${JSON.stringify(r.data)}`);
  const paymentId = new URL(r.data.checkoutUrl).searchParams.get('id');
  return { ...r.data, paymentId };
}

export const webhook = (id) => api('POST', '/api/webhooks/mollie', new URLSearchParams({ id }));
export const processNow = (id) => processPaymentWebhook(id);
export const order = async (number) => (await sql`SELECT * FROM orders WHERE number = ${number}`)[0];
export const subscriptionOf = async (orderNumber) => { const o = await order(orderNumber); return (await sql`SELECT * FROM subscriptions WHERE id = ${o.subscription_id}`)[0]; };
export const emails = () => sql`SELECT dedupe_key, template, to_email FROM email_log ORDER BY id`;
export const orderStatus = (number, email = 'tester@example.com') => api('GET', `/api/orders/${number}?e=${encodeURIComponent(email)}`);
