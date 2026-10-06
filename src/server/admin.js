// Lean admin API: orders, fulfilment, refunds, subscriptions. Protected by ADMIN_TOKEN.
import { json, readJson, v, HttpError } from './http.js';
import { getSql, transaction } from './db.js';
import { requireAdmin, rateLimit } from './security.js';
import { paymentProvider } from './payments/provider.js';
import { centsToMollie } from './pricing.js';
import { publicOrder } from './orders.js';
import { sendOnce } from './email/index.js';
import { processPaymentWebhook } from './webhooks.js';
import { cancelSubscription } from './subscriptions.js';
import { runMigrations } from './migrate.js';

export function adminRoutes(route) {
  const guard = async (req) => { await rateLimit(req, 'admin', { limit: 120, windowSec: 60 }); requireAdmin(req); };

  // One-off schema setup/upgrade from the deployed function (no local DB access needed):
  //   curl -X POST -H "authorization: Bearer $ADMIN_TOKEN" https://<site>/api/admin/migrate
  // No rate limit here: the rate_limits table does not exist before the first migration.
  route('POST', '/api/admin/migrate', async (req) => {
    requireAdmin(req);
    const result = await runMigrations(getSql());
    return json({ ok: true, ...result });
  });

  route('GET', '/api/admin/orders', async (req, { url }) => {
    await guard(req);
    const sql = getSql();
    const status = url.searchParams.get('status');
    const q = url.searchParams.get('q');
    const like = q ? '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%' : null;
    const rows = await sql`
      SELECT o.*, (SELECT method FROM payments p WHERE p.order_id = o.id ORDER BY created_at DESC LIMIT 1) AS method
      FROM orders o
      WHERE (${status || null}::text IS NULL OR o.payment_status::text = ${status || null} OR o.fulfillment_status::text = ${status || null})
        AND (${like}::text IS NULL OR o.number ILIKE ${like} OR o.email::text ILIKE ${like})
      ORDER BY o.created_at DESC LIMIT 200`;
    return json({ orders: rows.map((o) => ({ ...publicOrder(o, { method: o.method }), id: o.id, email: o.email, notes: o.notes, molliePaymentId: o.mollie_payment_id })) });
  });

  route('GET', '/api/admin/orders/:id', async (req, { params }) => {
    await guard(req);
    const sql = getSql();
    const [o] = await sql`SELECT * FROM orders WHERE id = ${v.uuid(params.id)}`;
    if (!o) throw new HttpError(404, 'Order not found');
    const payments = await sql`SELECT mollie_payment_id, mollie_status, method, amount_cents, amount_refunded_cents, created_at FROM payments WHERE order_id = ${o.id} ORDER BY created_at`;
    const events = await sql`SELECT * FROM webhook_events WHERE resource_id IN (SELECT mollie_payment_id FROM payments WHERE order_id = ${o.id}) ORDER BY received_at`;
    return json({ order: { ...publicOrder(o), id: o.id, email: o.email, notes: o.notes }, payments, events });
  });

  route('POST', '/api/admin/orders/:id/fulfillment', async (req, { params }) => {
    await guard(req);
    const body = await readJson(req);
    const status = v.oneOf(body.status, ['unfulfilled', 'processing', 'shipped', 'delivered', 'returned', 'cancelled'], 'status');
    const tracking = body.trackingCode ? v.str(body.trackingCode, { max: 80, name: 'trackingCode' }) : null;
    const order = await transaction(async (tx) => {
      const [o] = await tx`SELECT * FROM orders WHERE id = ${v.uuid(params.id)} FOR UPDATE`;
      if (!o) throw new HttpError(404, 'Order not found');
      if (status === 'shipped' && !['paid', 'partially_refunded'].includes(o.payment_status)) throw new HttpError(409, 'Only paid orders can be shipped');
      const [u] = await tx`UPDATE orders SET fulfillment_status = ${status}, tracking_code = COALESCE(${tracking}, tracking_code),
        shipped_at = CASE WHEN ${status} = 'shipped' THEN COALESCE(shipped_at, now()) ELSE shipped_at END WHERE id = ${o.id} RETURNING *`;
      return u;
    });
    if (status === 'shipped') await sendOnce(`order_shipped:${order.id}`, 'orderShipped', { to: order.email, locale: order.locale, order });
    return json({ ok: true, order: publicOrder(order) });
  });

  route('POST', '/api/admin/orders/:id/refund', async (req, { params }) => {
    await guard(req);
    const body = await readJson(req);
    const sql = getSql();
    const [o] = await sql`SELECT * FROM orders WHERE id = ${v.uuid(params.id)}`;
    if (!o) throw new HttpError(404, 'Order not found');
    if (!['paid', 'partially_refunded'].includes(o.payment_status)) throw new HttpError(409, 'Order is not refundable');
    const [p] = await sql`SELECT * FROM payments WHERE order_id = ${o.id} AND mollie_status = 'paid' ORDER BY created_at DESC LIMIT 1`;
    if (!p) throw new HttpError(409, 'No paid payment found');
    const remaining = p.amount_cents - p.amount_refunded_cents;
    const amountCents = body.amountCents ? v.int(body.amountCents, { min: 1, max: remaining, name: 'amountCents' }) : remaining;
    const refund = await paymentProvider().createRefund(p.mollie_payment_id, {
      amount: { currency: p.currency, value: centsToMollie(amountCents) },
      description: v.str(body.reason || `Refund order ${o.number}`, { max: 255, name: 'reason' }),
      metadata: { orderId: o.id },
    }, `refund-${o.id}-${p.amount_refunded_cents + amountCents}`);
    // Mollie will also call the webhook; processing is idempotent so refreshing now is safe.
    await processPaymentWebhook(p.mollie_payment_id).catch(() => {});
    // A full refund of the first subscription payment ends the subscription (no silent renewals after a refund).
    if (o.order_type === 'subscription_first' && o.subscription_id && amountCents === remaining) {
      const [s] = await sql`SELECT customer_id, status FROM subscriptions WHERE id = ${o.subscription_id}`;
      if (s && s.status !== 'canceled') await cancelSubscription(s.customer_id, o.subscription_id, 'refunded');
    }
    return json({ ok: true, refund: { id: refund.id, status: refund.status, amount: refund.amount } });
  });

  route('GET', '/api/admin/subscriptions', async (req) => {
    await guard(req);
    const sql = getSql();
    const rows = await sql`SELECT s.*, c.email FROM subscriptions s JOIN customers c ON c.id = s.customer_id ORDER BY s.created_at DESC LIMIT 200`;
    return json({ subscriptions: rows.map((s) => ({ id: s.id, email: s.email, status: s.status, quantity: s.quantity, interval: s.interval, startDate: s.start_date, nextPaymentDate: s.next_payment_date, loyaltyLevel: s.loyalty_level, loyaltyStartDate: s.loyalty_start_date, failedPaymentCount: s.failed_payment_count, canceledAt: s.canceled_at, cancelReason: s.cancel_reason, mollieSubscriptionId: s.mollie_subscription_id })) });
  });

  route('POST', '/api/admin/subscriptions/:id/cancel', async (req, { params }) => {
    await guard(req);
    const sql = getSql();
    const [s] = await sql`SELECT customer_id FROM subscriptions WHERE id = ${v.uuid(params.id)}`;
    if (!s) throw new HttpError(404, 'Subscription not found');
    const sub = await cancelSubscription(s.customer_id, params.id, 'admin');
    return json({ ok: true, status: sub.status });
  });

  route('GET', '/api/admin/stats', async (req) => {
    await guard(req);
    const sql = getSql();
    const [stats] = await sql`
      SELECT
        (SELECT count(*) FROM orders WHERE payment_status IN ('paid','partially_refunded')) AS paid_orders,
        (SELECT coalesce(sum(total_cents),0) FROM orders WHERE payment_status IN ('paid','partially_refunded')) AS revenue_cents,
        (SELECT count(*) FROM orders WHERE payment_status IN ('paid','partially_refunded') AND fulfillment_status = 'unfulfilled') AS to_ship,
        (SELECT count(*) FROM subscriptions WHERE status = 'active') AS active_subscriptions,
        (SELECT count(*) FROM subscriptions WHERE status = 'past_due') AS past_due_subscriptions`;
    return json({ stats });
  });
}
