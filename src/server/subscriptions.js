/**
 * Subscription lifecycle on top of Mollie's Subscriptions API.
 *
 *  first payment (sequenceType=first) paid
 *    → mandate exists → create Mollie subscription (startDate = next interval)
 *    → local status active, loyalty streak starts
 *  each renewal: Mollie creates a payment → webhook → recordRenewalPayment
 *  failed renewal: Mollie retries (≤5×, daily); after that Mollie cancels the
 *    subscription → cron/sync sees `canceled` → loyalty reset
 *  customer cancel: DELETE subscription at Mollie → loyalty reset
 */
import { getSql, transaction } from './db.js';
import { HttpError } from './http.js';
import { paymentProvider } from './payments/provider.js';
import { quote, centsToMollie } from './pricing.js';
import { subscription as subConfig, brand, site } from '../config/commerce.js';
import * as loyalty from './loyalty.js';
import { sendOnce } from './email/index.js';

/** Add a Mollie interval ("1 month", "2 weeks", "30 days") to a date. */
export function addInterval(date, interval) {
  const m = /^(\d+) (day|week|month)s?$/.exec(interval);
  if (!m) throw new Error(`Invalid interval "${interval}"`);
  const d = new Date(date);
  const n = Number.parseInt(m[1], 10);
  if (m[2] === 'day') d.setUTCDate(d.getUTCDate() + n);
  if (m[2] === 'week') d.setUTCDate(d.getUTCDate() + 7 * n);
  if (m[2] === 'month') d.setUTCMonth(d.getUTCMonth() + n);
  return d;
}
const isoDate = (d) => new Date(d).toISOString().slice(0, 10);

async function appendHistory(tx, subId, entry) {
  await tx`UPDATE subscriptions SET loyalty_history = loyalty_history || ${tx.json([entry])} WHERE id = ${subId}`;
}

/** Called from the webhook when the `first` payment is paid. Idempotent. */
export async function activateSubscriptionFromFirstPayment(tx, order, payment) {
  const [sub] = await tx`SELECT * FROM subscriptions WHERE id = ${order.subscription_id} FOR UPDATE`;
  if (!sub) return null;
  if (sub.mollie_subscription_id) return sub; // already activated (duplicate webhook)

  const pp = paymentProvider();
  const customerId = sub.mollie_customer_id || payment.customerId;
  // Mandate: the first payment creates it; `pending` is usable for subscriptions.
  let mandateId = payment.mandateId || null;
  if (!mandateId) {
    const list = await pp.listMandates(customerId);
    const usable = (list?._embedded?.mandates || []).filter((m) => ['valid', 'pending'].includes(m.status));
    mandateId = usable[0]?.id || null;
  }
  if (!mandateId) {
    // Mandate not visible yet: mark active locally and let the cron reconcile (it retries createSubscription).
    await tx`UPDATE subscriptions SET status = 'active', start_date = ${isoDate(payment.paidAt || new Date())}, loyalty_start_date = ${isoDate(payment.paidAt || new Date())}, mollie_customer_id = ${customerId}, last_payment_at = now() WHERE id = ${sub.id}`;
    await appendHistory(tx, sub.id, { event: 'activated_pending_mandate', at: new Date().toISOString(), level: 1 });
    return sub;
  }

  const paidAt = new Date(payment.paidAt || Date.now());
  const nextDate = addInterval(paidAt, sub.interval);
  const q = quote({ mode: 'subscription', quantity: sub.quantity, loyaltyLevel: 1, country: sub.shipping_address.country });
  const created = await pp.createSubscription(customerId, {
    amount: { currency: q.currency, value: centsToMollie(q.totalCents) },
    interval: sub.interval,
    startDate: isoDate(nextDate),
    description: `${brand.name} subscription · ${sub.quantity} × 40 wipes`,
    mandateId,
    webhookUrl: `${site.baseUrl}/api/webhooks/mollie`,
    metadata: { subscriptionId: sub.id, customerId: sub.customer_id },
  }, `sub-${sub.id}`);

  const { patch, history } = loyalty.onSubscriptionActivated({ ...sub, loyalty_start_date: null }, paidAt);
  await tx`
    UPDATE subscriptions SET status = 'active', mollie_subscription_id = ${created.id}, mollie_mandate_id = ${mandateId}, mollie_customer_id = ${customerId},
      start_date = ${isoDate(paidAt)}, next_payment_date = ${created.nextPaymentDate || isoDate(nextDate)}, loyalty_start_date = ${patch.loyalty_start_date},
      loyalty_level = ${patch.loyalty_level}, last_payment_at = ${paidAt}, failed_payment_count = 0
    WHERE id = ${sub.id}`;
  await appendHistory(tx, sub.id, history);
  return { ...sub, status: 'active', mollie_subscription_id: created.id };
}

/** A renewal payment was paid. */
export async function recordRenewalPayment(tx, order, payment) {
  const [sub] = await tx`SELECT * FROM subscriptions WHERE id = ${order.subscription_id} FOR UPDATE`;
  if (!sub) return;
  const paidAt = new Date(payment.paidAt || Date.now());
  const { patch, history } = loyalty.onSubscriptionRenewed(sub, paidAt);
  await tx`UPDATE subscriptions SET status = 'active', loyalty_level = ${patch.loyalty_level}, last_payment_at = ${paidAt}, failed_payment_count = 0,
           next_payment_date = ${isoDate(addInterval(paidAt, sub.interval))} WHERE id = ${sub.id}`;
  await appendHistory(tx, sub.id, history);
  // Keep the Mollie amount in sync when the loyalty level changed the price.
  const q = quote({ mode: 'subscription', quantity: sub.quantity, loyaltyLevel: patch.loyalty_level, country: sub.shipping_address.country });
  const current = Math.round(Number.parseFloat(payment.amount.value) * 100);
  if (q.totalCents !== current && sub.mollie_subscription_id) {
    try {
      await paymentProvider().updateSubscription(sub.mollie_customer_id, sub.mollie_subscription_id, { amount: { currency: q.currency, value: centsToMollie(q.totalCents) } });
    } catch (err) {
      console.error('Could not update subscription amount', err.message);
    }
  }
}

/** A renewal payment failed/expired/canceled. Mollie retries; we only flag it. */
export async function recordFailedRenewal(tx, order, payment) {
  const [sub] = await tx`SELECT * FROM subscriptions WHERE id = ${order.subscription_id} FOR UPDATE`;
  if (!sub || sub.status === 'canceled') return;
  await tx`UPDATE subscriptions SET status = 'past_due', failed_payment_count = failed_payment_count + 1 WHERE id = ${sub.id}`;
  await appendHistory(tx, sub.id, { event: 'payment_failed', at: new Date().toISOString(), level: sub.loyalty_level, paymentId: payment.id });
  const [customer] = await tx`SELECT email FROM customers WHERE id = ${sub.customer_id}`;
  if (customer) await sendOnce(`payment_failed:${payment.id}`, 'paymentFailed', { to: customer.email });
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
  return sub;
}

async function applyCancellation(tx, sub, reason) {
  if (sub.status === 'canceled') return;
  const { patch, history } = loyalty.onSubscriptionCanceled(sub, new Date(), reason);
  await tx`UPDATE subscriptions SET status = ${reason === 'completed' ? 'completed' : 'canceled'}, loyalty_start_date = NULL, loyalty_level = 1,
           canceled_at = ${patch.canceled_at}, cancel_reason = ${reason}, next_payment_date = NULL WHERE id = ${sub.id}`;
  await appendHistory(tx, sub.id, history);
  const [customer] = await tx`SELECT email FROM customers WHERE id = ${sub.customer_id}`;
  if (customer) await sendOnce(`subscription_canceled:${sub.id}`, 'subscriptionCanceled', { to: customer.email });
}

/** Customer-initiated cancellation. */
export async function cancelSubscription(customerId, subId, reason = 'customer') {
  return transaction(async (tx) => {
    const [sub] = await tx`SELECT * FROM subscriptions WHERE id = ${subId} AND customer_id = ${customerId} FOR UPDATE`;
    if (!sub) throw new HttpError(404, 'Subscription not found');
    if (sub.status === 'canceled') return sub;
    if (sub.mollie_subscription_id) {
      try {
        await paymentProvider().cancelSubscription(sub.mollie_customer_id, sub.mollie_subscription_id);
      } catch (err) {
        if (err.status !== 404 && err.status !== 422) throw err; // already gone at Mollie: fine
      }
    }
    await applyCancellation(tx, sub, reason);
    const [fresh] = await tx`SELECT * FROM subscriptions WHERE id = ${sub.id}`;
    return fresh;
  });
}

/** Daily cron: reconcile every non-final subscription with Mollie, retry pending activations. */
export async function reconcileSubscriptions({ limit = 200 } = {}) {
  const sql = getSql();
  const subs = await sql`SELECT id FROM subscriptions WHERE status IN ('active','past_due','suspended') ORDER BY updated_at ASC LIMIT ${limit}`;
  const report = { checked: 0, canceled: 0, errors: 0 };
  for (const { id } of subs) {
    try {
      await transaction(async (tx) => {
        const [sub] = await tx`SELECT * FROM subscriptions WHERE id = ${id} FOR UPDATE`;
        if (sub.status === 'active' && !sub.mollie_subscription_id) {
          // Activation was deferred because no mandate was visible yet: retry.
          const [order] = await tx`SELECT * FROM orders WHERE id = ${sub.first_order_id}`;
          const [pay] = await tx`SELECT * FROM payments WHERE order_id = ${order.id} ORDER BY created_at DESC LIMIT 1`;
          const remotePayment = await paymentProvider().getPayment(pay.mollie_payment_id);
          await activateSubscriptionFromFirstPayment(tx, order, remotePayment);
          return;
        }
        const before = sub.status;
        const after = await syncSubscriptionStatus(tx, id);
        report.checked += 1;
        if (before !== 'canceled' && after && after.status === 'canceled') report.canceled += 1;
      });
    } catch (err) {
      report.errors += 1;
      console.error('reconcile error', id, err.message);
    }
  }
  return report;
}

/** Account page view model. */
export async function subscriptionSummary(customerId) {
  const sql = getSql();
  const [sub] = await sql`SELECT * FROM subscriptions WHERE customer_id = ${customerId} ORDER BY created_at DESC LIMIT 1`;
  if (!sub) return null;
  const level = loyalty.levelFor(sub);
  const q = sub.status === 'active' || sub.status === 'past_due' ? quote({ mode: 'subscription', quantity: sub.quantity, loyaltyLevel: level, country: sub.shipping_address.country }) : null;
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
