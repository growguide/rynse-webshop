/**
 * Mollie emulator — same interface as mollie.js, backed by Postgres tables.
 * Used for local development and the automated payment-scenario tests only
 * (PAYMENT_PROVIDER=emulator). It mimics the parts of Mollie's behaviour the
 * shop depends on:
 *   - hosted checkout with a status selector (like Mollie test mode)
 *   - webhooks that carry only `id=tr_…` and may arrive before/after the redirect
 *   - first payments creating a mandate, recurring charges, subscriptions, refunds
 * It never talks to the real Mollie API.
 */
import { randomBytes } from 'node:crypto';
import { getSql } from '../db.js';
import { site } from '../../config/commerce.js';

const id = (p) => `${p}_emu_${randomBytes(6).toString('hex')}`;
const now = () => new Date().toISOString();

/** Webhook delivery hook: the app registers a function that processes `id`. */
let deliver = null;
export function setWebhookDeliverer(fn) { deliver = fn; }

async function fireWebhook(paymentId) {
  if (process.env.EMULATOR_MANUAL_WEBHOOKS === 'true') return; // tests deliver by hand
  if (deliver) await deliver(paymentId);
}

export function createEmulatorClient() {
  const sql = getSql();

  async function getPaymentRow(pid) {
    const [row] = await sql`SELECT resource FROM emulator_payments WHERE id = ${pid}`;
    if (!row) { const e = new Error('Payment not found'); e.status = 404; throw e; }
    return row.resource;
  }
  async function savePayment(p) {
    await sql`INSERT INTO emulator_payments (id, resource) VALUES (${p.id}, ${sql.json(p)})
              ON CONFLICT (id) DO UPDATE SET resource = EXCLUDED.resource`;
    return p;
  }

  const client = {
    mode: 'emulator',

    async createPayment(params) {
      const pid = id('tr');
      const seq = params.sequenceType || 'oneoff';
      const p = {
        resource: 'payment', id: pid, mode: 'test', createdAt: now(), status: 'open',
        amount: params.amount, description: params.description, redirectUrl: params.redirectUrl ?? null,
        cancelUrl: params.cancelUrl ?? null, webhookUrl: params.webhookUrl ?? null, method: params.method ?? null,
        metadata: params.metadata ?? null, sequenceType: seq, customerId: params.customerId ?? null,
        mandateId: params.mandateId ?? null, locale: params.locale ?? null, isCancelable: true,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        _links: { self: { href: `${site.baseUrl}/api/emulator/payments/${pid}`, type: 'application/hal+json' } },
      };
      if (seq === 'recurring') {
        // Background charge: no checkout, resolves via setStatus() (cron/test) like Mollie's changePaymentState.
        if (!p.customerId) { const e = new Error('customerId required for recurring'); e.status = 422; throw e; }
        p.status = 'pending';
        p.method = p.method || 'directdebit';
        if (!p.mandateId) {
          const [m] = await sql`SELECT id FROM emulator_mandates WHERE customer_id = ${p.customerId} ORDER BY (resource->>'createdAt') DESC LIMIT 1`;
          if (!m) { const e = new Error('No mandate for customer'); e.status = 422; throw e; }
          p.mandateId = m.id;
        }
        p._links.changePaymentState = { href: `${site.baseUrl}/api/emulator/checkout?id=${pid}`, type: 'text/html' };
      } else {
        p._links.checkout = { href: `${site.baseUrl}/api/emulator/checkout?id=${pid}`, type: 'text/html' };
      }
      return savePayment(p);
    },

    getPayment: (pid) => getPaymentRow(pid),

    async cancelPayment(pid) {
      const p = await getPaymentRow(pid);
      if (p.status !== 'open') { const e = new Error('Payment no longer cancelable'); e.status = 422; throw e; }
      return client.setStatus(pid, 'canceled');
    },

    async createCustomer(params) {
      const c = { resource: 'customer', id: id('cst'), mode: 'test', name: params.name ?? null, email: params.email ?? null, locale: params.locale ?? null, metadata: params.metadata ?? null, createdAt: now() };
      await sql`INSERT INTO emulator_customers (id, resource) VALUES (${c.id}, ${sql.json(c)})`;
      return c;
    },
    async getCustomer(cid) {
      const [row] = await sql`SELECT resource FROM emulator_customers WHERE id = ${cid}`;
      if (!row) { const e = new Error('Customer not found'); e.status = 404; throw e; }
      return row.resource;
    },

    async listMandates(cid) {
      const rows = await sql`SELECT resource FROM emulator_mandates WHERE customer_id = ${cid}`;
      return { count: rows.length, _embedded: { mandates: rows.map((r) => r.resource) } };
    },
    async getMandate(cid, mid) {
      const [row] = await sql`SELECT resource FROM emulator_mandates WHERE id = ${mid} AND customer_id = ${cid}`;
      if (!row) { const e = new Error('Mandate not found'); e.status = 404; throw e; }
      return row.resource;
    },
    async revokeMandate(cid, mid) {
      await sql`DELETE FROM emulator_mandates WHERE id = ${mid} AND customer_id = ${cid}`;
      return null;
    },

    async createSubscription(cid, params) {
      const mandates = await client.listMandates(cid);
      const usable = mandates._embedded.mandates.filter((m) => ['valid', 'pending'].includes(m.status));
      if (!usable.length) { const e = new Error('The customer has no valid mandate'); e.status = 422; e.body = { status: 422, title: 'Unprocessable Entity', detail: 'Customer has no valid mandate' }; throw e; }
      const s = {
        resource: 'subscription', id: id('sub'), mode: 'test', createdAt: now(), status: 'active',
        amount: params.amount, times: params.times ?? null, timesRemaining: params.times ?? null, interval: params.interval,
        startDate: params.startDate || now().slice(0, 10), nextPaymentDate: params.startDate || now().slice(0, 10),
        description: params.description, method: params.method ?? null, mandateId: params.mandateId ?? usable[0].id,
        customerId: cid, webhookUrl: params.webhookUrl ?? null, metadata: params.metadata ?? null,
      };
      await sql`INSERT INTO emulator_subscriptions (id, customer_id, resource) VALUES (${s.id}, ${cid}, ${sql.json(s)})`;
      return s;
    },
    async getSubscription(cid, sid) {
      const [row] = await sql`SELECT resource FROM emulator_subscriptions WHERE id = ${sid} AND customer_id = ${cid}`;
      if (!row) { const e = new Error('Subscription not found'); e.status = 404; throw e; }
      return row.resource;
    },
    async updateSubscription(cid, sid, params) {
      const s = await client.getSubscription(cid, sid);
      if (s.status === 'canceled') { const e = new Error('Canceled subscriptions cannot be updated'); e.status = 422; throw e; }
      Object.assign(s, params);
      await sql`UPDATE emulator_subscriptions SET resource = ${sql.json(s)} WHERE id = ${sid}`;
      return s;
    },
    async cancelSubscription(cid, sid) {
      const s = await client.getSubscription(cid, sid);
      s.status = 'canceled'; s.canceledAt = now(); delete s.nextPaymentDate;
      await sql`UPDATE emulator_subscriptions SET resource = ${sql.json(s)} WHERE id = ${sid}`;
      return s;
    },

    async createRefund(pid, params) {
      const p = await getPaymentRow(pid);
      if (p.status !== 'paid') { const e = new Error('Only paid payments can be refunded'); e.status = 422; throw e; }
      const cents = Math.round(Number.parseFloat(params.amount.value) * 100);
      const already = Math.round(Number.parseFloat(p.amountRefunded?.value || '0') * 100);
      const total = Math.round(Number.parseFloat(p.amount.value) * 100);
      if (already + cents > total) { const e = new Error('Refund exceeds remaining amount'); e.status = 422; throw e; }
      const r = { resource: 'refund', id: id('re'), mode: 'test', amount: params.amount, description: params.description ?? null, metadata: params.metadata ?? null, status: 'refunded', paymentId: pid, createdAt: now() };
      await sql`INSERT INTO emulator_refunds (id, payment_id, resource) VALUES (${r.id}, ${pid}, ${sql.json(r)})`;
      p.amountRefunded = { currency: p.amount.currency, value: ((already + cents) / 100).toFixed(2) };
      p.amountRemaining = { currency: p.amount.currency, value: ((total - already - cents) / 100).toFixed(2) };
      await savePayment(p);
      await fireWebhook(pid);
      return r;
    },
    async listRefunds(pid) {
      const rows = await sql`SELECT resource FROM emulator_refunds WHERE payment_id = ${pid}`;
      return { count: rows.length, _embedded: { refunds: rows.map((r) => r.resource) } };
    },

    async listMethods() {
      return { count: 3, _embedded: { methods: [
        { resource: 'method', id: 'ideal', description: 'iDEAL', status: 'activated' },
        { resource: 'method', id: 'creditcard', description: 'Card', status: 'activated' },
        { resource: 'method', id: 'applepay', description: 'Apple Pay', status: 'activated' },
      ] } };
    },
    async requestApplePaySession() { const e = new Error('Apple Pay sessions are not available in the emulator'); e.status = 503; throw e; },

    // --- Emulator-only controls (used by the fake checkout page and the tests) ---

    /** Move a payment to a (final) status like a customer or Mollie would, then fire the webhook. */
    async setStatus(pid, status, { method, fireHook = true } = {}) {
      const p = await getPaymentRow(pid);
      const t = now();
      p.status = status;
      if (method) p.method = method;
      if (['paid', 'failed', 'canceled', 'expired'].includes(status)) delete p.isCancelable;
      if (status === 'paid') {
        p.paidAt = t;
        p.amountRefunded = { currency: p.amount.currency, value: '0.00' };
        p.amountRemaining = { currency: p.amount.currency, value: p.amount.value };
        if (p.sequenceType === 'first' && p.customerId) {
          const mandateMethod = ['ideal', 'bancontact'].includes(p.method) ? 'directdebit' : (p.method === 'paypal' ? 'paypal' : 'creditcard');
          const m = { resource: 'mandate', id: id('mdt'), mode: 'test', status: 'valid', method: mandateMethod, customerId: p.customerId, createdAt: t, signatureDate: t.slice(0, 10), details: mandateMethod === 'directdebit' ? { consumerName: 'T. Tester', consumerAccount: 'NL00EMUL0000000000', consumerBic: 'EMULNL2A' } : { cardHolder: 'T. Tester', cardNumber: '9399', cardLabel: 'Mastercard' } };
          await sql`INSERT INTO emulator_mandates (id, customer_id, resource) VALUES (${m.id}, ${p.customerId}, ${sql.json(m)})`;
          p.mandateId = m.id;
        }
        if (p.subscriptionId) {
          const [srow] = await sql`SELECT resource FROM emulator_subscriptions WHERE id = ${p.subscriptionId}`;
          if (srow) {
            const s = srow.resource;
            const n = new Date(t); const m = /(\d+) (day|week|month)s?/.exec(s.interval);
            if (m) { const k = +m[1]; if (m[2] === 'day') n.setUTCDate(n.getUTCDate() + k); if (m[2] === 'week') n.setUTCDate(n.getUTCDate() + 7 * k); if (m[2] === 'month') n.setUTCMonth(n.getUTCMonth() + k); }
            s.nextPaymentDate = n.toISOString().slice(0, 10);
            if (s.timesRemaining != null) { s.timesRemaining -= 1; if (s.timesRemaining <= 0) { s.status = 'completed'; delete s.nextPaymentDate; } }
            await sql`UPDATE emulator_subscriptions SET resource = ${sql.json(s)} WHERE id = ${s.id}`;
          }
        }
      }
      if (status === 'failed') p.failedAt = t;
      if (status === 'canceled') p.canceledAt = t;
      if (status === 'expired') p.expiredAt = t;
      await savePayment(p);
      if (fireHook) await fireWebhook(pid);
      return p;
    },

    /** Simulate Mollie creating the next payment for a subscription (what the subscription webhook later reports). */
    async chargeSubscription(sid, { outcome = 'paid', fireHook = true } = {}) {
      const [row] = await sql`SELECT resource FROM emulator_subscriptions WHERE id = ${sid}`;
      if (!row) throw new Error('Subscription not found');
      const s = row.resource;
      if (s.status !== 'active') throw new Error(`Subscription is ${s.status}`);
      const pid = id('tr');
      const p = {
        resource: 'payment', id: pid, mode: 'test', createdAt: now(), status: 'pending', amount: s.amount,
        description: s.description, redirectUrl: null, webhookUrl: s.webhookUrl, method: 'directdebit', metadata: s.metadata,
        sequenceType: 'recurring', customerId: s.customerId, mandateId: s.mandateId, subscriptionId: s.id, _links: {},
      };
      await savePayment(p);
      if (outcome === 'pending') return p;
      return client.setStatus(pid, outcome, { fireHook });
    },

    /** Mollie cancels a subscription after exhausted retries. */
    async providerCancelSubscription(sid) {
      const [row] = await sql`SELECT resource, customer_id FROM emulator_subscriptions WHERE id = ${sid}`;
      return client.cancelSubscription(row.customer_id, sid);
    },

    /** Force-deliver a webhook (tests use this to control ordering). */
    deliverWebhook: (pid) => (deliver ? deliver(pid) : null),
  };
  return client;
}
