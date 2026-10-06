/**
 * Mollie webhook processing.
 *
 * Mollie only posts `id=tr_…`; we always fetch the payment ourselves, so a
 * forged webhook can never mark an order as paid. Processing is idempotent:
 * every (payment id, status, refunded amount) transition is recorded once in
 * webhook_events with a UNIQUE constraint, so duplicate deliveries, retries and
 * races between the redirect page and the webhook cannot produce double
 * orders, double e-mails, double loyalty updates or double fulfilment.
 *
 * Structure: all database state changes happen inside one short transaction
 * (row locks, no network I/O); side effects (Mollie subscription creation,
 * e-mails) run after commit and are individually idempotent, so a failure
 * there is retried by Mollie's next webhook or by the daily cron.
 */
import { getSql, transaction } from './db.js';
import { paymentProvider } from './payments/provider.js';
import { stripRaw, applyCustomerProfile } from './orders.js';
import { mollieToCents, quote } from './pricing.js';
import { sendOnce } from './email/index.js';
import { activateSubscriptionFromFirstPayment, recordRenewalPayment, recordFailedRenewal, syncSubscriptionStatus } from './subscriptions.js';
import { nextOrderNumber } from './orders.js';
import { levelFor } from './loyalty.js';

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

  let result;
  try {
    result = await transaction((tx) => applyPayment(tx, payment, refundedCents));
  } catch (err) {
    // Release the gate so Mollie's retry can process it again.
    await sql`DELETE FROM webhook_events WHERE id = ${evt.id}`;
    throw err;
  }
  await sql`UPDATE webhook_events SET processed_at = now() WHERE id = ${evt.id}`;

  // Side effects after commit (each idempotent on its own).
  const actions = [...(result.actions || [])];
  for (const effect of result.effects || []) {
    try {
      const r = await effect();
      if (r) actions.push(r);
    } catch (err) {
      console.error('post-commit effect failed', err);
      actions.push(`effect_failed:${err.message}`);
    }
  }
  return { ok: true, ...result, actions, effects: undefined };
}

async function applyPayment(tx, payment, refundedCents) {
  const amountCents = mollieToCents(payment.amount.value);
  const meta = typeof payment.metadata === 'object' && payment.metadata ? payment.metadata : {};
  const effects = [];
  const actions = [];

  // 1) Find or create the local payment row. Renewal payments are created by Mollie
  //    (subscription), so they do not exist yet when the first webhook arrives.
  let [prow] = await tx`SELECT * FROM payments WHERE mollie_payment_id = ${payment.id} FOR UPDATE`;
  let order = null;
  if (prow) {
    [order] = await tx`SELECT * FROM orders WHERE id = ${prow.order_id} FOR UPDATE`;
  } else if (payment.subscriptionId || payment.sequenceType === 'recurring') {
    order = await findOrCreateRenewalOrder(tx, payment, amountCents);
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
  const finalish = ['paid', 'refunded', 'partially_refunded'];
  if (finalish.includes(prev) && !finalish.includes(next)) next = prev; // never downgrade a paid order
  if (payment.status === 'paid' && amountCents !== order.total_cents) {
    await tx`UPDATE orders SET notes = COALESCE(notes,'') || ${`\n[${new Date().toISOString()}] Paid amount ${amountCents} differs from order total ${order.total_cents} — review before fulfilment`} WHERE id = ${order.id}`;
  }

  const becamePaid = next === 'paid' && !finalish.includes(prev);
  await tx`UPDATE orders SET payment_status = ${next}, paid_at = COALESCE(paid_at, ${becamePaid ? new Date() : null}) WHERE id = ${order.id}`;

  // 4) State transitions (DB only) + queued side effects.
  if (becamePaid) {
    await applyCustomerProfile(tx, order);
    if (order.order_type === 'subscription_first') {
      const sub = await activateSubscriptionFromFirstPayment(tx, order, payment); // DB part; Mollie subscription is created after commit
      if (sub) effects.push(async () => { const { createProviderSubscription } = await import('./subscriptions.js'); return createProviderSubscription(sub.id); });
      actions.push('subscription_activated');
    } else if (order.order_type === 'subscription_renewal') {
      const amountToSync = await recordRenewalPayment(tx, order, payment);
      if (amountToSync) effects.push(async () => { const { syncProviderAmount } = await import('./subscriptions.js'); return syncProviderAmount(order.subscription_id); });
      actions.push('renewal_recorded');
    }
    const snapshot = { ...order, payment_status: next };
    effects.push(async () => { const sent = await sendOnce(`order_confirmation:${order.id}`, 'orderConfirmation', { to: order.email, locale: order.locale, order: snapshot }); if (sent) await getSql()`UPDATE orders SET confirmation_sent_at = now() WHERE id = ${order.id} AND confirmation_sent_at IS NULL`; return sent ? 'confirmation_sent' : null; });
  }
  if (['failed', 'canceled', 'expired'].includes(payment.status) && order.order_type === 'subscription_renewal') {
    const notify = await recordFailedRenewal(tx, order, payment);
    if (notify) effects.push(() => sendOnce(`payment_failed:${payment.id}`, 'paymentFailed', { to: notify.email, locale: notify.locale }).then((s) => (s ? 'failed_mail_sent' : null)));
    actions.push('renewal_failed');
  }
  if (['failed', 'canceled', 'expired'].includes(payment.status) && order.order_type === 'subscription_first' && order.subscription_id) {
    await tx`UPDATE subscriptions SET status = 'canceled', canceled_at = now(), cancel_reason = ${'first_payment_' + payment.status} WHERE id = ${order.subscription_id} AND status = 'pending'`;
  }
  if (refundedCents > 0 && ['refunded', 'partially_refunded'].includes(next)) {
    if (next === 'refunded') await tx`UPDATE orders SET fulfillment_status = CASE WHEN fulfillment_status = 'unfulfilled' THEN 'cancelled'::fulfillment_status ELSE fulfillment_status END WHERE id = ${order.id}`;
    effects.push(() => sendOnce(`refund:${order.id}:${refundedCents}`, 'refundIssued', { to: order.email, locale: order.locale, order, amountCents: refundedCents }).then((s) => (s ? 'refund_mail_sent' : null)));
    actions.push('refund_recorded');
  }
  // Keep the subscription status in sync after any subscription payment event (Mollie cancels after exhausted retries).
  if (payment.subscriptionId && order.subscription_id) {
    effects.push(async () => { const { syncSubscriptionById } = await import('./subscriptions.js'); return syncSubscriptionById(order.subscription_id); });
  }

  await tx`INSERT INTO analytics_events (name, order_id, payload) VALUES (${'payment_' + payment.status}, ${order.id}, ${tx.json({ method: payment.method, amountCents, refundedCents })})`;
  return { handled: true, orderNumber: order.number, status: next, actions, effects };
}

/**
 * A subscription renewal payment created by Mollie → the local order for it.
 * Mollie may retry a failed charge with a new payment id; an open renewal order
 * for the same cycle is reused instead of creating one order per attempt.
 * Totals are recorded at the amount Mollie actually charged.
 */
async function findOrCreateRenewalOrder(tx, payment, amountCents) {
  const [sub] = await tx`SELECT * FROM subscriptions WHERE mollie_subscription_id = ${payment.subscriptionId} FOR UPDATE`;
  if (!sub) return null;
  const [existing] = await tx`
    SELECT * FROM orders WHERE subscription_id = ${sub.id} AND order_type = 'subscription_renewal'
      AND payment_status IN ('pending','open','failed','canceled','expired') AND created_at > now() - interval '20 days'
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE`;
  if (existing) return existing;
  const [customer] = await tx`SELECT * FROM customers WHERE id = ${sub.customer_id}`;
  const q = quote({ mode: 'subscription', quantity: sub.quantity, loyaltyLevel: levelFor(sub), country: sub.shipping_address.country });
  // Record what was charged: if the configured price moved since Mollie's amount was set, the
  // difference lands in the discount line so subtotal − discount + shipping == charged.
  const discountCents = Math.max(0, q.subtotalCents + q.shippingCents - amountCents);
  const number = await nextOrderNumber(tx);
  const [order] = await tx`
    INSERT INTO orders (number, customer_id, subscription_id, order_type, quantity, currency, unit_price_cents, subtotal_cents, discount_cents, discount_label,
      shipping_cents, total_cents, vat_cents, email, locale, shipping_address, pricing_snapshot, payment_status)
    VALUES (${number}, ${sub.customer_id}, ${sub.id}, 'subscription_renewal', ${sub.quantity}, ${q.currency}, ${q.unitPriceCents}, ${q.subtotalCents}, ${discountCents}, ${discountCents ? (q.discountLabel || 'Subscriber price') : null},
      ${q.shippingCents}, ${amountCents}, ${Math.round(amountCents - amountCents / (1 + q.vatRatePct / 100))}, ${customer.email}, ${customer.locale || 'en'}, ${tx.json(sub.shipping_address)}, ${tx.json({ ...q.snapshot, chargedCents: amountCents })}, 'pending')
    RETURNING *`;
  return order;
}
