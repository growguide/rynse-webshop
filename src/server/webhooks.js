/**
 * Mollie webhook processing.
 *
 * Mollie only posts `id=tr_…`; we always fetch the payment ourselves, so a
 * forged webhook can never mark an order as paid. Processing is idempotent:
 * every (payment id, status, refunded amount) transition is recorded once in
 * webhook_events with a UNIQUE constraint, so duplicate deliveries, retries and
 * races between the redirect page and the webhook cannot produce double
 * orders, double e-mails, double loyalty updates or double fulfilment.
 */
import { getSql, transaction } from './db.js';
import { paymentProvider } from './payments/provider.js';
import { stripRaw } from './orders.js';
import { mollieToCents } from './pricing.js';
import { sendOnce } from './email/index.js';
import { activateSubscriptionFromFirstPayment, recordRenewalPayment, recordFailedRenewal, syncSubscriptionStatus } from './subscriptions.js';
import { subscription as subscriptionConfig } from '../config/commerce.js';

const MOLLIE_TO_ORDER = {
  open: 'open', pending: 'pending', authorized: 'authorized', paid: 'paid',
  failed: 'failed', canceled: 'canceled', expired: 'expired',
};

/**
 * Process a payment id. Safe to call many times. Returns a small report.
 * @param {string} paymentId  tr_…
 */
export async function processPaymentWebhook(paymentId) {
  if (!/^tr_[A-Za-z0-9_]+$/.test(paymentId)) return { ok: false, reason: 'invalid id' };
  const pp = paymentProvider();
  let payment;
  try {
    payment = await pp.getPayment(paymentId);
  } catch (err) {
    if (err.status === 404) return { ok: false, reason: 'unknown payment' };
    throw err;
  }
  const refundedCents = payment.amountRefunded ? mollieToCents(payment.amountRefunded.value) : 0;
  const sql = getSql();

  // Idempotency gate: one row per transition.
  const [evt] = await sql`
    INSERT INTO webhook_events (provider, resource_id, resource_status, refunded_cents)
    VALUES ('mollie', ${payment.id}, ${payment.status}, ${refundedCents})
    ON CONFLICT (provider, resource_id, resource_status, refunded_cents) DO NOTHING
    RETURNING id`;
  if (!evt) return { ok: true, duplicate: true, status: payment.status };

  try {
    const result = await transaction((tx) => applyPayment(tx, payment, refundedCents));
    await sql`UPDATE webhook_events SET processed_at = now() WHERE id = ${evt.id}`;
    return { ok: true, ...result };
  } catch (err) {
    // Release the gate so Mollie's retry can process it again.
    await sql`DELETE FROM webhook_events WHERE id = ${evt.id}`;
    throw err;
  }
}

async function applyPayment(tx, payment, refundedCents) {
  const amountCents = mollieToCents(payment.amount.value);
  const meta = typeof payment.metadata === 'object' && payment.metadata ? payment.metadata : {};

  // 1) Find or create the local payment row. Renewal payments are created by Mollie
  //    (subscription), so they do not exist yet when the first webhook arrives.
  let [prow] = await tx`SELECT * FROM payments WHERE mollie_payment_id = ${payment.id} FOR UPDATE`;
  let order = null;
  if (prow) {
    [order] = await tx`SELECT * FROM orders WHERE id = ${prow.order_id} FOR UPDATE`;
  } else if (payment.subscriptionId || payment.sequenceType === 'recurring') {
    order = await createRenewalOrder(tx, payment);
    if (!order) return { handled: false, reason: 'subscription unknown' };
    [prow] = await tx`
      INSERT INTO payments (order_id, mollie_payment_id, mollie_status, sequence_type, method, amount_cents, currency, mollie_mandate_id, mollie_subscription_id, raw)
      VALUES (${order.id}, ${payment.id}, ${payment.status}, 'recurring', ${payment.method ?? null}, ${amountCents}, ${payment.amount.currency}, ${payment.mandateId ?? null}, ${payment.subscriptionId ?? null}, ${tx.json(stripRaw(payment))})
      RETURNING *`;
    await tx`UPDATE orders SET mollie_payment_id = ${payment.id} WHERE id = ${order.id}`;
  } else if (meta.orderId) {
    [order] = await tx`SELECT * FROM orders WHERE id = ${meta.orderId} FOR UPDATE`;
    if (!order) return { handled: false, reason: 'order unknown' };
  } else {
    return { handled: false, reason: 'payment not linked to an order' };
  }

  // 2) Update the payment row with the fresh resource.
  await tx`
    UPDATE payments SET mollie_status = ${payment.status}, method = COALESCE(${payment.method ?? null}, method),
      amount_refunded_cents = ${refundedCents}, mollie_mandate_id = COALESCE(${payment.mandateId ?? null}, mollie_mandate_id),
      mollie_subscription_id = COALESCE(${payment.subscriptionId ?? null}, mollie_subscription_id), raw = ${tx.json(stripRaw(payment))}
    WHERE mollie_payment_id = ${payment.id}`;

  // 3) Derive the order payment status (paid stays paid; refunds are layered on top).
  const prev = order.payment_status;
  let next = MOLLIE_TO_ORDER[payment.status] || prev;
  if (payment.status === 'paid' && refundedCents > 0) next = refundedCents >= amountCents ? 'refunded' : 'partially_refunded';
  // Never downgrade a paid order because of a stale/late webhook for an older attempt.
  const finalish = ['paid', 'refunded', 'partially_refunded'];
  if (finalish.includes(prev) && !finalish.includes(next)) next = prev;
  // Amount check: the backend decides what the order costs; a mismatch is flagged, never trusted.
  if (payment.status === 'paid' && amountCents !== order.total_cents) {
    await tx`UPDATE orders SET notes = COALESCE(notes,'') || ${`\n[${new Date().toISOString()}] Paid amount ${amountCents} differs from order total ${order.total_cents} — review before fulfilment`} WHERE id = ${order.id}`;
  }

  const becamePaid = next === 'paid' && prev !== 'paid' && !finalish.includes(prev);
  await tx`UPDATE orders SET payment_status = ${next}, paid_at = COALESCE(paid_at, ${becamePaid ? new Date() : null}) WHERE id = ${order.id}`;

  const actions = [];
  // 4) Side effects — each guarded by its own dedupe key.
  if (becamePaid) {
    if (order.order_type === 'subscription_first') {
      await activateSubscriptionFromFirstPayment(tx, order, payment);
      actions.push('subscription_activated');
    } else if (order.order_type === 'subscription_renewal') {
      await recordRenewalPayment(tx, order, payment);
      actions.push('renewal_recorded');
    }
    await sendOnce(`order_confirmation:${order.id}`, 'orderConfirmation', { to: order.email, order: { ...order, payment_status: next }, interval: subscriptionConfig.interval });
    await tx`UPDATE orders SET confirmation_sent_at = now() WHERE id = ${order.id} AND confirmation_sent_at IS NULL`;
    actions.push('confirmation_sent');
  }
  if (['failed', 'canceled', 'expired'].includes(payment.status) && order.order_type === 'subscription_renewal') {
    await recordFailedRenewal(tx, order, payment);
    actions.push('renewal_failed');
  }
  if (['failed', 'canceled', 'expired'].includes(payment.status) && order.order_type === 'subscription_first' && order.subscription_id) {
    // First payment did not succeed: the pending subscription never starts.
    await tx`UPDATE subscriptions SET status = 'canceled', canceled_at = now(), cancel_reason = ${'first_payment_' + payment.status} WHERE id = ${order.subscription_id} AND status = 'pending'`;
  }
  if (refundedCents > 0 && ['refunded', 'partially_refunded'].includes(next)) {
    await sendOnce(`refund:${order.id}:${refundedCents}`, 'refundIssued', { to: order.email, order, amountCents: refundedCents });
    if (next === 'refunded') await tx`UPDATE orders SET fulfillment_status = CASE WHEN fulfillment_status = 'unfulfilled' THEN 'cancelled'::fulfillment_status ELSE fulfillment_status END WHERE id = ${order.id}`;
    actions.push('refund_recorded');
  }
  // Keep the subscription status in sync after any subscription payment event.
  if (payment.subscriptionId && order.subscription_id) {
    await syncSubscriptionStatus(tx, order.subscription_id).catch(() => {});
  }

  await tx`INSERT INTO analytics_events (name, order_id, payload) VALUES (${'payment_' + payment.status}, ${order.id}, ${tx.json({ method: payment.method, amountCents, refundedCents })})`;
  return { handled: true, orderNumber: order.number, status: next, actions };
}

/** A subscription renewal payment created by Mollie → create the local order for it. */
async function createRenewalOrder(tx, payment) {
  const [sub] = await tx`SELECT * FROM subscriptions WHERE mollie_subscription_id = ${payment.subscriptionId} FOR UPDATE`;
  if (!sub) return null;
  const [customer] = await tx`SELECT * FROM customers WHERE id = ${sub.customer_id}`;
  const { quote } = await import('./pricing.js');
  const { nextOrderNumber } = await import('./orders.js');
  const { levelFor } = await import('./loyalty.js');
  const q = quote({ mode: 'subscription', quantity: sub.quantity, loyaltyLevel: levelFor(sub), country: sub.shipping_address.country });
  const number = await nextOrderNumber(tx);
  const [order] = await tx`
    INSERT INTO orders (number, customer_id, subscription_id, order_type, quantity, currency, unit_price_cents, subtotal_cents, discount_cents, discount_label,
      shipping_cents, total_cents, vat_cents, email, shipping_address, pricing_snapshot, payment_status)
    VALUES (${number}, ${sub.customer_id}, ${sub.id}, 'subscription_renewal', ${sub.quantity}, ${q.currency}, ${q.unitPriceCents}, ${q.subtotalCents}, ${q.discountCents}, ${q.discountLabel},
      ${q.shippingCents}, ${q.totalCents}, ${q.vatCents}, ${customer.email}, ${tx.json(sub.shipping_address)}, ${tx.json(q.snapshot)}, 'pending')
    RETURNING *`;
  return order;
}
