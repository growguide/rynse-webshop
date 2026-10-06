/**
 * Thin Mollie API v2 client (server-side only, native fetch, no SDK).
 * Endpoints and fields follow docs/mollie-api-reference.md (verified against
 * docs.mollie.com and the official @mollie/api-client source).
 *
 * Never import this module from client code. MOLLIE_API_KEY stays on the server.
 */
import { randomUUID } from 'node:crypto';

const BASE = 'https://api.mollie.com/v2';

export class MollieError extends Error {
  constructor(status, body) {
    super(body?.detail || body?.title || `Mollie API error (${status})`);
    this.status = status;
    this.title = body?.title;
    this.field = body?.field;
    this.body = body;
  }
}

export function createMollieClient({ apiKey = process.env.MOLLIE_API_KEY, fetchImpl = globalThis.fetch } = {}) {
  if (!apiKey) throw new Error('MOLLIE_API_KEY is not set');
  const mode = apiKey.startsWith('live_') ? 'live' : 'test';

  async function call(method, path, { body, idempotencyKey, query } = {}) {
    const url = new URL(BASE + path);
    if (query) for (const [k, val] of Object.entries(query)) if (val !== undefined && val !== null) url.searchParams.set(k, String(val));
    const headers = {
      authorization: `Bearer ${apiKey}`,
      accept: 'application/hal+json',
      'user-agent': 'RYNSE-webshop/1.0 (node)',
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (method === 'POST' || method === 'DELETE') headers['idempotency-key'] = idempotencyKey || randomUUID();

    let attempt = 0;
    for (;;) {
      attempt += 1;
      const res = await fetchImpl(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      if (res.status === 204) return null;
      let data = null;
      const txt = await res.text();
      try { data = txt ? JSON.parse(txt) : null; } catch { data = { title: 'Invalid JSON from Mollie', detail: txt.slice(0, 200) }; }
      if (res.ok) return data;
      // Retry 5xx / 429 a couple of times with the same idempotency key (safe).
      if ((res.status >= 500 || res.status === 429) && attempt < 3) {
        const retryAfter = Number.parseInt(res.headers.get('retry-after') || '2', 10);
        await new Promise((r) => setTimeout(r, Math.min(retryAfter, 5) * 1000));
        continue;
      }
      throw new MollieError(res.status, data);
    }
  }

  return {
    mode,
    // --- Payments ---------------------------------------------------------
    createPayment: (params, idempotencyKey) => call('POST', '/payments', { body: params, idempotencyKey }),
    getPayment: (id, query) => call('GET', `/payments/${encodeURIComponent(id)}`, { query }),
    cancelPayment: (id) => call('DELETE', `/payments/${encodeURIComponent(id)}`),
    // --- Customers --------------------------------------------------------
    createCustomer: (params, idempotencyKey) => call('POST', '/customers', { body: params, idempotencyKey }),
    getCustomer: (id) => call('GET', `/customers/${encodeURIComponent(id)}`),
    // --- Mandates ---------------------------------------------------------
    listMandates: (customerId) => call('GET', `/customers/${encodeURIComponent(customerId)}/mandates`, { query: { limit: 250 } }),
    getMandate: (customerId, mandateId) => call('GET', `/customers/${encodeURIComponent(customerId)}/mandates/${encodeURIComponent(mandateId)}`),
    revokeMandate: (customerId, mandateId) => call('DELETE', `/customers/${encodeURIComponent(customerId)}/mandates/${encodeURIComponent(mandateId)}`),
    // --- Subscriptions ----------------------------------------------------
    createSubscription: (customerId, params, idempotencyKey) => call('POST', `/customers/${encodeURIComponent(customerId)}/subscriptions`, { body: params, idempotencyKey }),
    getSubscription: (customerId, subId) => call('GET', `/customers/${encodeURIComponent(customerId)}/subscriptions/${encodeURIComponent(subId)}`),
    updateSubscription: (customerId, subId, params) => call('PATCH', `/customers/${encodeURIComponent(customerId)}/subscriptions/${encodeURIComponent(subId)}`, { body: params }),
    cancelSubscription: (customerId, subId) => call('DELETE', `/customers/${encodeURIComponent(customerId)}/subscriptions/${encodeURIComponent(subId)}`),
    // --- Refunds ----------------------------------------------------------
    createRefund: (paymentId, params, idempotencyKey) => call('POST', `/payments/${encodeURIComponent(paymentId)}/refunds`, { body: params, idempotencyKey }),
    listRefunds: (paymentId) => call('GET', `/payments/${encodeURIComponent(paymentId)}/refunds`),
    // --- Methods / Apple Pay ----------------------------------------------
    listMethods: (query) => call('GET', '/methods', { query }),
    // Direct Apple Pay integration only (hosted checkout does not need it). Must be called with a live key.
    requestApplePaySession: (validationUrl, domain) => call('POST', '/wallets/applepay/sessions', { body: { validationUrl, domain } }),
  };
}

/** Statuses considered final by Mollie. */
export const FINAL_STATUSES = ['paid', 'failed', 'canceled', 'expired'];
export const ALL_STATUSES = ['open', 'pending', 'authorized', 'paid', 'failed', 'canceled', 'expired'];
