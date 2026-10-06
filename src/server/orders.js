// Order creation and checkout start. The browser never sends amounts.
import { randomUUID } from 'node:crypto';
import { getSql, transaction } from './db.js';
import { HttpError, v } from './http.js';
import { quote, centsToMollie } from './pricing.js';
import { paymentProvider } from './payments/provider.js';
import { product, shipping, subscription, payments, site, brand } from '../config/commerce.js';

export async function nextOrderNumber(sql) {
  const [{ n }] = await sql`SELECT nextval('order_number_seq') AS n`;
  return `RY-${new Date().getUTCFullYear()}-${String(n).padStart(6, '0')}`;
}

export function validateAddress(a) {
  if (!a || typeof a !== 'object') throw new HttpError(400, 'Shipping address is required');
  const country = v.str(a.country, { min: 2, max: 2, name: 'country' }).toUpperCase();
  if (!shipping.countries.includes(country)) throw new HttpError(400, 'We do not ship to this country yet');
  return {
    name: v.str(a.name, { min: 2, max: 120, name: 'Full name' }),
    street: v.str(a.street, { min: 3, max: 160, name: 'Street and house number' }),
    postalCode: v.str(a.postalCode, { min: 4, max: 12, name: 'Postal code' }),
    city: v.str(a.city, { min: 2, max: 80, name: 'City' }),
    country,
  };
}

export async function upsertCustomer(sql, { email, name, marketingConsent = false }) {
  const [c] = await sql`
    INSERT INTO customers (email, name, marketing_consent) VALUES (${email}, ${name}, ${marketingConsent})
    ON CONFLICT (email) DO UPDATE SET name = COALESCE(EXCLUDED.name, customers.name), marketing_consent = customers.marketing_consent OR EXCLUDED.marketing_consent
    RETURNING *`;
  return c;
}

/** Ensure the customer exists at the payment provider (needed for first/recurring payments). */
export async function ensureProviderCustomer(sql, customer) {
  if (customer.mollie_customer_id) return customer.mollie_customer_id;
  const pp = paymentProvider();
  const created = await pp.createCustomer({ name: customer.name || undefined, email: customer.email, locale: payments.locale, metadata: { customerId: customer.id } }, `cst-${customer.id}`);
  await sql`UPDATE customers SET mollie_customer_id = ${created.id} WHERE id = ${customer.id} AND mollie_customer_id IS NULL`;
  return created.id;
}

/**
 * Create order + payment and return the hosted checkout URL.
 * @param {object} input {mode, quantity, email, name, address, method?, marketingConsent?}
 */
export async function startCheckout(input, { request } = {}) {
  const mode = v.oneOf(input.mode, ['one_time', 'subscription'], 'mode');
  const quantity = v.int(input.quantity, { min: 1, max: product.maxQuantity, name: 'quantity' });
  const email = v.email(input.email);
  const name = v.str(input.name, { min: 2, max: 120, name: 'Full name' });
  const address = validateAddress({ ...input.address, name: input.address?.name || name });
  const method = input.method ? v.oneOf(input.method, payments.methods, 'payment method') : null;
  if (mode === 'subscription' && !subscription.enabled) throw new HttpError(400, 'Subscriptions are not available right now');

  const q = quote({ mode, quantity, loyaltyLevel: 1, country: address.country });
  const pp = paymentProvider();

  return transaction(async (sql) => {
    const customer = await upsertCustomer(sql, { email, name, marketingConsent: !!input.marketingConsent });
    const number = await nextOrderNumber(sql);
    const orderType = mode === 'subscription' ? 'subscription_first' : 'one_time';

    let sub = null;
    let providerCustomerId = null;
    if (mode === 'subscription') {
      // One active/pending subscription per customer keeps the loyalty rule unambiguous.
      const [existing] = await sql`SELECT id, status FROM subscriptions WHERE customer_id = ${customer.id} AND status IN ('active','past_due','pending') LIMIT 1`;
      if (existing && existing.status !== 'pending') throw new HttpError(409, 'You already have an active subscription. Manage it from your account.');
      providerCustomerId = await ensureProviderCustomer(sql, customer);
      [sub] = await sql`
        INSERT INTO subscriptions (customer_id, status, quantity, interval, unit_price_cents, shipping_address, mollie_customer_id)
        VALUES (${customer.id}, 'pending', ${quantity}, ${subscription.interval}, ${q.unitPriceCents}, ${sql.json(address)}, ${providerCustomerId})
        RETURNING *`;
    }

    const [order] = await sql`
      INSERT INTO orders (number, customer_id, subscription_id, order_type, quantity, currency, unit_price_cents, subtotal_cents,
        discount_cents, discount_label, shipping_cents, total_cents, vat_cents, email, shipping_address, pricing_snapshot)
      VALUES (${number}, ${customer.id}, ${sub?.id ?? null}, ${orderType}, ${quantity}, ${q.currency}, ${q.unitPriceCents}, ${q.subtotalCents},
        ${q.discountCents}, ${q.discountLabel}, ${q.shippingCents}, ${q.totalCents}, ${q.vatCents}, ${email}, ${sql.json(address)}, ${sql.json(q.snapshot)})
      RETURNING *`;
    if (sub) await sql`UPDATE subscriptions SET first_order_id = ${order.id} WHERE id = ${sub.id}`;

    const base = site.baseUrl;
    const params = {
      amount: { currency: q.currency, value: centsToMollie(q.totalCents) },
      description: `${brand.name} order ${number}`,
      redirectUrl: `${base}/order/${number}?e=${encodeURIComponent(email)}&r=1`,
      cancelUrl: `${base}/checkout?canceled=${number}`,
      webhookUrl: `${base}/api/webhooks/mollie`,
      locale: payments.locale,
      metadata: { orderId: order.id, orderNumber: number, orderType, subscriptionId: sub?.id ?? null },
      shippingAddress: { givenName: address.name.split(' ')[0], familyName: address.name.split(' ').slice(1).join(' ') || address.name, streetAndNumber: address.street, postalCode: address.postalCode, city: address.city, country: address.country, email },
      lines: [{ type: 'physical', description: product.name, quantity, unitPrice: { currency: q.currency, value: centsToMollie(q.unitPriceCents) }, totalAmount: { currency: q.currency, value: centsToMollie(q.subtotalCents) }, sku: product.sku, vatRate: String(product.vatRatePct.toFixed(2)), vatAmount: { currency: q.currency, value: centsToMollie(Math.round(q.subtotalCents - q.subtotalCents / (1 + product.vatRatePct / 100))) } }],
    };
    // Order lines are optional for iDEAL/cards/Apple Pay. Mollie validates them strictly
    // (vat amounts must match to the cent), so they are opt-in via MOLLIE_SEND_LINES=true.
    if (process.env.MOLLIE_SEND_LINES !== 'true') delete params.lines;
    if (params.lines && q.discountCents) params.lines.push({ type: 'discount', description: q.discountLabel, quantity: 1, unitPrice: { currency: q.currency, value: `-${centsToMollie(q.discountCents)}` }, totalAmount: { currency: q.currency, value: `-${centsToMollie(q.discountCents)}` } });
    if (params.lines && q.shippingCents) params.lines.push({ type: 'shipping_fee', description: 'Shipping', quantity: 1, unitPrice: { currency: q.currency, value: centsToMollie(q.shippingCents) }, totalAmount: { currency: q.currency, value: centsToMollie(q.shippingCents) } });
    if (method) params.method = method;
    if (mode === 'subscription') {
      params.sequenceType = 'first';
      params.customerId = providerCustomerId;
    }

    const payment = await pp.createPayment(params, `order-${order.id}`);
    await sql`
      INSERT INTO payments (order_id, mollie_payment_id, mollie_status, sequence_type, method, amount_cents, currency, checkout_url, raw)
      VALUES (${order.id}, ${payment.id}, ${payment.status}, ${payment.sequenceType || 'oneoff'}, ${payment.method ?? null}, ${q.totalCents}, ${q.currency}, ${payment._links?.checkout?.href ?? null}, ${sql.json(stripRaw(payment))})`;
    await sql`UPDATE orders SET mollie_payment_id = ${payment.id}, payment_status = 'open' WHERE id = ${order.id}`;

    return { orderNumber: number, orderId: order.id, checkoutUrl: payment._links?.checkout?.href, quote: q };
  });
}

/** Remove anything we never want to persist (defensive; Mollie never returns PANs anyway). */
export function stripRaw(payment) {
  const { _links, details, ...rest } = payment || {};
  const safeDetails = details ? Object.fromEntries(Object.entries(details).filter(([k]) => !/cardnumber|consumeraccount|token/i.test(k))) : null;
  return { ...rest, details: safeDetails };
}

export async function getOrderByNumber(number, email) {
  const sql = getSql();
  const [order] = await sql`SELECT * FROM orders WHERE number = ${number} AND email = ${email}`;
  return order || null;
}

export function publicOrder(order, extra = {}) {
  return {
    number: order.number,
    orderType: order.order_type,
    quantity: order.quantity,
    currency: order.currency,
    unitPriceCents: order.unit_price_cents,
    subtotalCents: order.subtotal_cents,
    discountCents: order.discount_cents,
    discountLabel: order.discount_label,
    shippingCents: order.shipping_cents,
    totalCents: order.total_cents,
    paymentStatus: order.payment_status,
    fulfillmentStatus: order.fulfillment_status,
    shippingAddress: order.shipping_address,
    trackingCode: order.tracking_code,
    createdAt: order.created_at,
    paidAt: order.paid_at,
    ...extra,
  };
}

export const newIdempotencyKey = () => randomUUID();
