/**
 * Subscription lifecycle on top of Mollie's Subscriptions API.
 *
 *  first payment (sequenceType=first) paid
 *    → local status active, loyalty streak starts (in the webhook transaction)
 *    → after commit: mandate found → Mollie subscription created (startDate = next interval)
 *  each renewal: Mollie creates a payment → webhook → recordRenewalPayment
 *  failed renewal: Mollie retries (≤5×, daily); after that Mollie cancels the
 *    subscription → sync/cron sees `canceled` → loyalty reset
 *  customer cancel: DELETE subscription at Mollie → loyalty reset
 *  loyalty anniversary: the daily cron updates the Mollie amount before the next charge
 */
import { getSql, transaction } from './db.js';
import { HttpError } from './http.js';
import { paymentProvider } from './payments/provider.js';
import { quote, centsToMollie, mollieToCents } from './pricing.js';
import { subscription as subConfig, brand, site } from '../config/commerce.js';
import * as loyalty from './loyalty.js';
import { sendOnce } from './email/index.js';

/** Add a Mollie interval ("1 month", "2 weeks", "30 days") to a date; months clamp to the last day. */
export function addInterval(date, interval) {
  const m = /^(\d+) (day|week|month)s?$/.exec(interval);
  if (!m) throw new Error(`Invalid interval "${interval}"`);
  const d = new Date(date);
  const n = Number.parseInt(m[1], 10);
  if (m[2] === 'day') d.setUTCDate(d.getUTCDate() + n);
  if (m[2] === 'week') d.setUTCDate(d.getUTCDate() + 7 * n);
  if (m[2] === 'month') {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + n);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  }
  return d;
}
const isoDate = (d) => new Date(d).toISOString().slice(0, 10);

async function appendHistory(tx, subId, entry) {
  await tx`UPDATE subscriptions SET loyalty_history = loyalty_history || ${tx.json([entry])} WHERE id = ${subId}`;
}

/** DB part of activation (inside the webhook transaction). Returns the row or null. Idempotent. */
export async function activateSubscriptionFromFirstPayment(tx, order, payment) {
  const [sub] = await tx`SELECT * FROM subscriptions WHERE id = ${order.subscription_id} FOR UPDATE`;
  if (!sub) return null;
  if (sub.mollie_subscription_id) return null; // already fully activated
  const paidAt = new Date(payment.paidAt || Date.now());
  const customerId = sub.mollie_customer_id || payment.customerId;
  const { patch, history } = loyalty.onSubscriptionActivated({ ...sub, loyalty_start_date: null }, paidAt);
  await tx`
    UPDATE subscriptions SET status = 'active', mollie_customer_id = ${customerId}, mollie_mandate_id = COALESCE(${payment.mandateId ?? null}, mollie_mandate_id),
      start_date = ${isoDate(paidAt)}, next_payment_date = ${isoDate(addInterval(paidAt, sub.interval))}, loyalty_start_date = ${patch.loyalty_start_date},
      loyalty_level = ${patch.loyalty_level}, last_payment_at = ${paidAt}, failed_payment_count = 0
    WHERE id = ${sub.id}`;
  await appendHistory(tx, sub.id, history);
  return { ...sub, status: 'active', mollie_customer_id: customerId };
}

/**
 * Provider part of activation (after commit): find the mandate, create the Mollie
 * subscription — or adopt one that already exists for this local subscription
 * (metadata.subscriptionId), so retries never double-charge. Retried by the cron
 * while mollie_subscription_id is NULL.
 */
export async function createProviderSubscription(subId) {
  const sql = getSql();
  const [sub] = await sql`SELECT * FROM subscriptions WHERE id = ${subId}`;
  if (!sub || sub.status !== 'active' || sub.mollie_subscription_id) return null;
  const pp = paymentProvider();
  const customerId = sub.mollie_customer_id;

  // Adopt an existing Mollie subscription created by an earlier attempt.
  const list = await pp.listSubscriptions(customerId).catch(() => null);
  const existing = (list?._embedded?.subscriptions || []).find((s) => s.metadata?.subscriptionId === sub.id && ['active', 'pending', 'suspended'].includes(s.status));
  if (existing) {
    await sql`UPDATE subscriptions SET mollie_subscription_id = ${existing.id}, mollie_mandate_id = COALESCE(mollie_mandate_id, ${existing.mandateId ?? null}), mollie_amount_cents = ${mollieToCents(existing.amount.value)}, next_payment_date = COALESCE(${existing.nextPaymentDate ?? null}, next_payment_date) WHERE id = ${sub.id} AND mollie_subscription_id IS NULL`;
    return 'provider_subscription_adopted';
  }

  let mandateId = sub.mollie_mandate_id;
  if (!mandateId) {
    const mandates = await pp.listMandates(customerId);
    mandateId = (mandates?._embedded?.mandates || []).find((m) => ['valid', 'pending'].includes(m.status))?.id || null;
  }
  if (!mandateId) return 'mandate_not_available_yet'; // cron retries

  const q = quote({ mode: 'subscription', quantity: sub.quantity, loyaltyLevel: loyalty.levelFor(sub), country: sub.shipping_address.country });
  const created = await pp.createSubscription(customerId, {
    amount: { currency: q.currency, value: centsToMollie(q.totalCents) },
    interval: sub.interval,
    startDate: sub.next_payment_date ? isoDate(sub.next_payment_date) : isoDate(addInterval(new Date(), sub.interval)),
    description: `${brand.name} subscription · ${sub.quantity} × 40 wipes`,
    mandateId,
    webhookUrl: `${site.baseUrl}/api/webhooks/mollie`,
    metadata: { subscriptionId: sub.id, customerId: sub.customer_id },
  }, `sub-${sub.id}`);
  await sql`UPDATE subscriptions SET mollie_subscription_id = ${created.id}, mollie_mandate_id = ${mandateId}, mollie_amount_cents = ${q.totalCents}, next_payment_date = ${created.nextPaymentDate || sub.next_payment_date} WHERE id = ${sub.id} AND mollie_subscription_id IS NULL`;
  return 'provider_subscription_created';
}

/** A renewal payment was paid (DB only). Returns true when the Mollie amount should be re-synced. */
export async function recordRenewalPayment(tx, order, payment) {
  const [sub] = await tx`SELECT * FROM subscriptions WHERE id = ${order.subscription_id} FOR UPDATE`;
  if (!sub) return false;
  const paidAt = new Date(payment.paidAt || Date.now());
  const { patch, history } = loyalty.onSubscriptionRenewed(sub, paidAt);
  await tx`UPDATE subscriptions SET status = 'active', loyalty_level = ${patch.loyalty_level}, last_payment_at = ${paidAt}, failed_payment_count = 0,
           next_payment_date = ${isoDate(addInterval(paidAt, sub.interval))}, mollie_amount_cents = ${mollieToCents(payment.amount.value)} WHERE id = ${sub.id}`;
  await appendHistory(tx, sub.id, history);
  const q = quote({ mode: 'subscription', quantity: sub.quantity, loyaltyLevel: patch.loyalty_level, country: sub.shipping_address.country });
  return q.totalCents !== mollieToCents(payment.amount.value);
}

/** Make the amount configured at Mollie match the current (loyalty-level) price. */
export async function syncProviderAmount(subId) {
  const sql = getSql();
  const [sub] = await sql`SELECT * FROM subscriptions WHERE id = ${subId}`;
  if (!sub || !sub.mollie_subscription_id || !['active', 'past_due'].includes(sub.status)) return null;
  const q = quote({ mode: 'subscription', quantity: sub.quantity, loyaltyLevel: loyalty.levelFor(sub), country: sub.shipping_address.country });
  if (sub.mollie_amount_cents === q.totalCents) return null;
  await paymentProvider().updateSubscription(sub.mollie_customer_id, sub.mollie_subscription_id, { amount: { currency: q.currency, value: centsToMollie(q.totalCents) } });
  await sql`UPDATE subscriptions SET mollie_amount_cents = ${q.totalCents} WHERE id = ${sub.id}`;
  return 'provider_amount_synced';
}

/** A renewal payment failed/expired/canceled (DB only). Returns {email, locale} when the customer should be told. */
export async function recordFailedRenewal(tx, order, payment) {
  const [sub] = await tx`SELECT * FROM subscriptions WHERE id = ${order.subscription_id} FOR UPDATE`;
  if (!sub || sub.status === 'canceled') return null;
  await tx`UPDATE subscriptions SET status = 'past_due', failed_payment_count = failed_payment_count + 1 WHERE id = ${sub.id}`;
  await appendHistory(tx, sub.id, { event: 'payment_failed', at: new Date().toISOString(), level: sub.loyalty_level, paymentId: payment.id });
  const [customer] = await tx`SELECT email, locale FROM customers WHERE id = ${sub.customer_id}`;
  return customer || null;
}

/** Pull the subscription status from Mollie and apply cancellations (loyalty reset). */
export async function syncSubscriptionStatus(tx, subId) {
  const [sub] = await tx`SELECT * FROM subscriptions WHERE id = ${subId} FOR UPDATE`;
  if (!sub || !sub.mollie_subscription_id || sub.status === 'canceled') return sub;
  const remote = await paymentProvider().getSubscription(sub.mollie_customer_id, sub.mollie_subscription_id);
  if (remote.status === 'canceled' || remote.status === 'completed') {
    await applyCancellation(tx, sub, remote.status === 'completed' ? 'completed' : 'provider_canceled');
  } else if (remote.status === 'suspended' && sub.status !== 'suspended') {
    await tx`UPDATE subscriptions SET status = 'suspended' WHERE id = ${sub.id}`;
  } else if (remote.status === 'active' && sub.status === 'suspended') {
    await tx`UPDATE subscriptions SET status = 'active' WHERE id = ${sub.id}`;
  }
  if (remote.nextPaymentDate) await tx`UPDATE subscriptions SET next_payment_date = ${remote.nextPaymentDate} WHERE id = ${sub.id}`;
  if (remote.amount) await tx`UPDATE subscriptions SET mollie_amount_cents = ${mollieToCents(remote.amount.value)} WHERE id = ${sub.id}`;
  const [fresh] = await tx`SELECT * FROM subscriptions WHERE id = ${sub.id}`;
  return fresh;
}

export async function syncSubscriptionById(subId) {
  const pending = [];
  await transaction(async (tx) => {
    const before = (await tx`SELECT status FROM subscriptions WHERE id = ${subId}`)[0]?.status;
    const after = await syncSubscriptionStatus(tx, subId);
    if (after && before !== after.status && after.status === 'canceled') pending.push(after);
  });
  for (const s of pending) await notifyCanceled(s);
  return 'subscription_synced';
}

async function applyCancellation(tx, sub, reason) {
  if (sub.status === 'canceled') return;
  const { patch, history } = loyalty.onSubscriptionCanceled(sub, new Date(), reason);
  await tx`UPDATE subscriptions SET status = ${reason === 'completed' ? 'completed' : 'canceled'}, loyalty_start_date = NULL, loyalty_level = 1,
           canceled_at = ${patch.canceled_at}, cancel_reason = ${reason}, next_payment_date = NULL WHERE id = ${sub.id}`;
  await appendHistory(tx, sub.id, history);
}

async function notifyCanceled(sub) {
  const sql = getSql();
  const [customer] = await sql`SELECT email, locale FROM customers WHERE id = ${sub.customer_id}`;
  if (customer) await sendOnce(`subscription_canceled:${sub.id}`, 'subscriptionCanceled', { to: customer.email, locale: customer.locale });
}

/** Customer- or admin-initiated cancellation. */
export async function cancelSubscription(customerId, subId, reason = 'customer') {
  const sql = getSql();
  const [sub] = await sql`SELECT * FROM subscriptions WHERE id = ${subId} AND customer_id = ${customerId}`;
  if (!sub) throw new HttpError(404, 'Subscription not found');
  if (sub.status === 'canceled') return sub;
  if (sub.mollie_subscription_id) {
    try {
      await paymentProvider().cancelSubscription(sub.mollie_customer_id, sub.mollie_subscription_id);
    } catch (err) {
      if (err.status !== 404 && err.status !== 422) throw err; // already gone at Mollie: fine
    }
  }
  const fresh = await transaction(async (tx) => {
    const [locked] = await tx`SELECT * FROM subscriptions WHERE id = ${sub.id} FOR UPDATE`;
    await applyCancellation(tx, locked, reason);
    return (await tx`SELECT * FROM subscriptions WHERE id = ${sub.id}`)[0];
  });
  await notifyCanceled(fresh);
  return fresh;
}

/**
 * Daily cron, bounded in time:
 *  - finish activations whose Mollie subscription could not be created yet
 *  - sync status with Mollie (cancellations after exhausted retries → loyalty reset)
 *  - update the Mollie amount before the next charge when the loyalty level changed
 *  - expire abandoned pending subscriptions / open payments (no webhook for forced-method cancels)
 */
export async function reconcileSubscriptions({ limit = 150, budgetMs = 20000 } = {}) {
  const sql = getSql();
  const started = Date.now();
  const report = { checked: 0, activated: 0, amountSynced: 0, canceled: 0, expiredPending: 0, paymentsSwept: 0, errors: 0 };
  const timeLeft = () => Date.now() - started < budgetMs;

  // Abandoned subscription checkouts (never paid): close them so the account page and duplicate checks stay clean.
  const expired = await sql`UPDATE subscriptions SET status = 'canceled', canceled_at = now(), cancel_reason = 'abandoned' WHERE status = 'pending' AND created_at < now() - interval '3 hours' RETURNING id`;
  report.expiredPending = expired.length;

  // Open/pending payments older than an hour: Mollie sends no webhook when a forced-method payment is cancelled on the hosted page.
  const stale = await sql`SELECT p.mollie_payment_id FROM payments p JOIN orders o ON o.id = p.order_id WHERE o.payment_status IN ('open','pending') AND p.created_at < now() - interval '1 hour' AND p.created_at > now() - interval '14 days' ORDER BY p.created_at DESC LIMIT ${limit}`;
  const { processPaymentWebhook } = await import('./webhooks.js');
  for (const { mollie_payment_id } of stale) {
    if (!timeLeft()) break;
    try { await processPaymentWebhook(mollie_payment_id); report.paymentsSwept += 1; } catch (err) { report.errors += 1; console.error('sweep error', mollie_payment_id, err.message); }
  }

  const subs = await sql`SELECT id, status, mollie_subscription_id FROM subscriptions WHERE status IN ('active','past_due','suspended') ORDER BY updated_at ASC LIMIT ${limit}`;
  for (const s of subs) {
    if (!timeLeft()) break;
    try {
      if (!s.mollie_subscription_id) { const r = await createProviderSubscription(s.id); if (r === 'provider_subscription_created' || r === 'provider_subscription_adopted') report.activated += 1; continue; }
      const before = s.status;
      await transaction(async (tx) => { const after = await syncSubscriptionStatus(tx, s.id); if (after && before !== 'canceled' && after.status === 'canceled') report.canceled += 1; });
      const [fresh] = await sql`SELECT * FROM subscriptions WHERE id = ${s.id}`;
      if (fresh.status === 'canceled' && before !== 'canceled') await notifyCanceled(fresh);
      if (await syncProviderAmount(s.id)) report.amountSynced += 1;
      report.checked += 1;
    } catch (err) {
      report.errors += 1;
      console.error('reconcile error', s.id, err.message);
    }
  }
  report.durationMs = Date.now() - started;
  return report;
}

/** Account page view model: the live subscription wins over stale pending/canceled rows. */
export async function subscriptionSummary(customerId) {
  const sql = getSql();
  const [sub] = await sql`SELECT * FROM subscriptions WHERE customer_id = ${customerId}
    ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'past_due' THEN 1 WHEN 'suspended' THEN 2 WHEN 'pending' THEN 3 ELSE 4 END, created_at DESC LIMIT 1`;
  if (!sub) return null;
  const level = loyalty.levelFor(sub);
  const q = ['active', 'past_due'].includes(sub.status) ? quote({ mode: 'subscription', quantity: sub.quantity, loyaltyLevel: level, country: sub.shipping_address.country }) : null;
  return {
    id: sub.id,
    status: sub.status,
    quantity: sub.quantity,
    interval: sub.interval,
    startDate: sub.start_date,
    nextPaymentDate: sub.next_payment_date,
    canceledAt: sub.canceled_at,
    shippingAddress: sub.shipping_address,
    loyalty: loyalty.summary(sub),
    nextChargeCents: q ? q.totalCents : null,
    cancelAnytime: subConfig.cancelAnytime,
  };
}
