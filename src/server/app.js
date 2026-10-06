// API router — Web-standard Request → Response. Runs unchanged on Vercel
// (api/index.js) and in the local dev server (src/server/dev.js).
import { HttpError, json, html, text, redirect, readJson, readForm, v } from './http.js';
import { getSql, transaction } from './db.js';
import { publicConfig, product, brand, site, shipping, subscription as subConfig, payments as payConfig, formatMoney } from '../config/commerce.js';
import { quote } from './pricing.js';
import { startCheckout, getOrderByNumber, publicOrder } from './orders.js';
import { processPaymentWebhook } from './webhooks.js';
import { paymentProvider, isEmulator } from './payments/provider.js';
import { setWebhookDeliverer } from './payments/emulator.js';
import { cancelSubscription, subscriptionSummary, reconcileSubscriptions } from './subscriptions.js';
import { ensureCsrfCookie, verifyCsrf, rateLimit, createSession, readSession, requireSession, sessionCookieHeaders, newLoginToken, hashToken, requireAdmin, requireCron } from './security.js';
import { sendOnce } from './email/index.js';
import { emulatorCheckoutPage } from './payments/emulator-page.js';
import { adminRoutes } from './admin.js';

// Emulator webhooks are delivered in-process (there is no public URL locally).
setWebhookDeliverer((id) => processPaymentWebhook(id).catch((e) => console.error('emulated webhook failed', e)));

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, pattern: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}/?$`), handler });

// ---------------------------------------------------------------------------
route('GET', '/api/health', async () => {
  const sql = getSql();
  await sql`SELECT 1`;
  return json({ ok: true, provider: payConfig.provider, mode: paymentProvider().mode });
});

route('GET', '/api/config', async (req) => {
  const { token, headers } = ensureCsrfCookie(req);
  return json({ ...publicConfig(), csrfToken: token }, { headers });
});

route('POST', '/api/quote', async (req) => {
  const body = await readJson(req);
  const q = quote({ mode: body.mode, quantity: v.int(body.quantity, { min: 1, max: product.maxQuantity, name: 'quantity' }), loyaltyLevel: 1, country: body.country || shipping.defaultCountry });
  const { snapshot, ...pub } = q;
  return json(pub);
});

route('POST', '/api/checkout', async (req) => {
  verifyCsrf(req);
  await rateLimit(req, 'checkout', { limit: 10, windowSec: 300 });
  const body = await readJson(req);
  const result = await startCheckout(body, { request: req });
  const sql = getSql();
  await sql`INSERT INTO analytics_events (name, order_id, payload) VALUES ('begin_checkout', ${result.orderId}, ${sql.json({ mode: body.mode, quantity: body.quantity })})`;
  return json({ ok: true, orderNumber: result.orderNumber, checkoutUrl: result.checkoutUrl });
});

/** Order status for the confirmation page. Handles "webhook later than redirect" by fetching once. */
route('GET', '/api/orders/:number', async (req, { params, url }) => {
  await rateLimit(req, 'order-status', { limit: 60, windowSec: 60 });
  const email = v.email(url.searchParams.get('e') || '');
  let order = await getOrderByNumber(params.number, email);
  if (!order) throw new HttpError(404, 'Order not found');
  if (['open', 'pending', 'authorized'].includes(order.payment_status) && order.mollie_payment_id) {
    // Do not trust the redirect: verify with the provider (idempotent — same path as the webhook).
    await processPaymentWebhook(order.mollie_payment_id).catch((e) => console.error('status refresh failed', e.message));
    order = await getOrderByNumber(params.number, email);
  }
  let retryUrl = null;
  if (['failed', 'canceled', 'expired'].includes(order.payment_status)) retryUrl = `/checkout?retry=${order.number}`;
  const [pay] = await getSql()`SELECT method FROM payments WHERE order_id = ${order.id} ORDER BY created_at DESC LIMIT 1`;
  return json({ order: publicOrder(order, { method: pay?.method || null, retryUrl, interval: subConfig.interval }) });
});

// --- Mollie webhook ----------------------------------------------------------
route('POST', '/api/webhooks/mollie', async (req) => {
  const form = await readForm(req);
  const id = form.get('id');
  if (!id) return text('missing id', { status: 400 });
  try {
    const result = await processPaymentWebhook(id);
    if (process.env.NODE_ENV !== 'test') console.log('webhook', id, JSON.stringify(result));
  } catch (err) {
    console.error('webhook processing failed', id, err);
    return text('retry', { status: 500 }); // Mollie retries on non-200
  }
  return text('ok');
});

// --- Emulator (dev/test only) ---------------------------------------------------
route('GET', '/api/emulator/checkout', async (req, { url }) => {
  if (!isEmulator()) throw new HttpError(404, 'Not found');
  const pp = paymentProvider();
  const payment = await pp.getPayment(url.searchParams.get('id') || '');
  return html(emulatorCheckoutPage(payment));
});
route('POST', '/api/emulator/checkout', async (req) => {
  if (!isEmulator()) throw new HttpError(404, 'Not found');
  const form = await readForm(req);
  const pp = paymentProvider();
  const id = form.get('id');
  const status = v.oneOf(form.get('status'), ['paid', 'failed', 'canceled', 'expired', 'pending', 'open'], 'status');
  const method = form.get('method') || 'ideal';
  const webhookDelay = Number.parseInt(form.get('webhookDelay') || '0', 10);
  const p = await pp.setStatus(id, status, { method, fireHook: webhookDelay === 0 });
  if (webhookDelay > 0) setTimeout(() => pp.deliverWebhook(id), webhookDelay);
  const back = status === 'canceled' ? (p.cancelUrl || p.redirectUrl) : p.redirectUrl;
  return redirect(back || '/', 303);
});
route('GET', '/api/emulator/payments/:id', async (req, { params }) => {
  if (!isEmulator()) throw new HttpError(404, 'Not found');
  return json(await paymentProvider().getPayment(params.id));
});

// --- Auth (passwordless) ---------------------------------------------------------
route('POST', '/api/auth/request', async (req) => {
  verifyCsrf(req);
  await rateLimit(req, 'auth', { limit: 5, windowSec: 600 });
  const body = await readJson(req);
  const email = v.email(body.email);
  const sql = getSql();
  const [customer] = await sql`SELECT id FROM customers WHERE email = ${email}`;
  // Always respond the same way (no account enumeration). Only send when the customer exists.
  if (customer) {
    const { token, hash } = newLoginToken();
    await sql`INSERT INTO login_tokens (token_hash, email, expires_at) VALUES (${hash}, ${email}, now() + interval '15 minutes')`;
    const link = `${site.baseUrl}/api/auth/verify?token=${encodeURIComponent(token)}`;
    await sendOnce(`magic:${hash}`, 'magicLink', { to: email, link });
  }
  return json({ ok: true, message: 'If an account exists for this e-mail, a sign-in link is on its way.' });
});

route('GET', '/api/auth/verify', async (req, { url }) => {
  const token = url.searchParams.get('token') || '';
  const sql = getSql();
  const [row] = await sql`UPDATE login_tokens SET used_at = now() WHERE token_hash = ${hashToken(token)} AND used_at IS NULL AND expires_at > now() RETURNING email`;
  if (!row) return redirect('/account?error=link', 303);
  const [customer] = await sql`SELECT id, email FROM customers WHERE email = ${row.email}`;
  if (!customer) return redirect('/account?error=link', 303);
  const session = createSession({ customerId: customer.id, email: customer.email });
  return redirect('/account', 303, sessionCookieHeaders(req, session));
});

route('POST', '/api/auth/logout', async (req) => {
  verifyCsrf(req);
  return json({ ok: true }, { headers: sessionCookieHeaders(req, '', { clear: true }) });
});

// --- Account ----------------------------------------------------------------------
route('GET', '/api/account', async (req) => {
  const session = readSession(req);
  if (!session?.customerId) return json({ signedIn: false });
  const sql = getSql();
  const [customer] = await sql`SELECT id, email, name, created_at FROM customers WHERE id = ${session.customerId}`;
  if (!customer) return json({ signedIn: false }, { headers: sessionCookieHeaders(req, '', { clear: true }) });
  const orders = await sql`SELECT * FROM orders WHERE customer_id = ${customer.id} ORDER BY created_at DESC LIMIT 50`;
  return json({
    signedIn: true,
    customer: { email: customer.email, name: customer.name, since: customer.created_at },
    orders: orders.map((o) => publicOrder(o)),
    subscription: await subscriptionSummary(customer.id),
  });
});

route('POST', '/api/account/subscription/cancel', async (req) => {
  verifyCsrf(req);
  const session = requireSession(req);
  const body = await readJson(req);
  const sub = await cancelSubscription(session.customerId, v.str(body.subscriptionId, { min: 10, max: 60, name: 'subscriptionId' }), 'customer');
  return json({ ok: true, status: sub.status });
});

// --- Contact ----------------------------------------------------------------------
route('POST', '/api/contact', async (req) => {
  verifyCsrf(req);
  await rateLimit(req, 'contact', { limit: 5, windowSec: 600 });
  const body = await readJson(req);
  const email = v.email(body.email);
  const message = v.str(body.message, { min: 10, max: 4000, name: 'Message' });
  const name = v.str(body.name || '', { max: 120, name: 'Name' });
  if (body.website) return json({ ok: true }); // honeypot
  const sql = getSql();
  await sql`INSERT INTO analytics_events (name, payload) VALUES ('contact_message', ${sql.json({ email, name, message })})`;
  await sendOnce(`contact:${Date.now()}:${email}`, 'contactMessage', { to: brand.supportEmail, fromEmail: email, name, message }).catch((e) => console.error('contact mail failed', e.message));
  return json({ ok: true });
});

// --- Analytics (server-side copy, consent-aware) ---------------------------------------
route('POST', '/api/events', async (req) => {
  const body = await readJson(req, { maxBytes: 8 * 1024 });
  const name = v.str(body.name, { min: 2, max: 40, name: 'name' });
  if (!/^[a-z_]+$/.test(name)) throw new HttpError(400, 'Invalid event name');
  const sql = getSql();
  await sql`INSERT INTO analytics_events (name, payload) VALUES (${name}, ${sql.json(body.params || {})})`;
  return json({ ok: true });
});

// --- Cron --------------------------------------------------------------------------
route('GET', '/api/cron/daily', async (req) => {
  requireCron(req);
  const report = await reconcileSubscriptions();
  const sql = getSql();
  await sql`DELETE FROM login_tokens WHERE expires_at < now() - interval '1 day'`;
  await sql`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`;
  return json({ ok: true, report });
});

// --- Admin ---------------------------------------------------------------------------
adminRoutes(route);

// ---------------------------------------------------------------------------
export async function handle(request) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  try {
    for (const r of routes) {
      if (r.method !== method && !(r.method === 'GET' && method === 'HEAD')) continue;
      const m = r.pattern.exec(url.pathname);
      if (!m) continue;
      const res = await r.handler(request, { params: m.groups || {}, url });
      return withSecurityHeaders(res);
    }
    if (url.pathname.startsWith('/api/')) {
      // Method exists on another verb?
      const exists = routes.some((r) => r.pattern.test(url.pathname));
      return withSecurityHeaders(json({ error: exists ? 'Method not allowed' : 'Not found' }, { status: exists ? 405 : 404 }));
    }
    return withSecurityHeaders(json({ error: 'Not found' }, { status: 404 }));
  } catch (err) {
    if (err instanceof HttpError) {
      const headers = err.status === 429 ? { 'retry-after': String(err.extra.retryAfter || 60) } : {};
      return withSecurityHeaders(json({ error: err.message, ...err.extra }, { status: err.status, headers }));
    }
    if (err?.status && err?.body?.detail) {
      // Payment provider validation error: surface a safe message.
      console.error('provider error', err.status, err.body);
      return withSecurityHeaders(json({ error: 'The payment provider rejected the request. Please try again.' }, { status: 502 }));
    }
    console.error('Unhandled error', err);
    return withSecurityHeaders(json({ error: 'Something went wrong on our side. Please try again.' }, { status: 500 }));
  }
}

function withSecurityHeaders(res) {
  res.headers.set('x-content-type-options', 'nosniff');
  res.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  res.headers.set('x-frame-options', 'DENY');
  return res;
}

export default { fetch: handle };
export { formatMoney };
