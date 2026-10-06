// Order creation and checkout start. The browser never sends amounts.
import { randomUUID } from 'node:crypto';
import { getSql, transaction } from './db.js';
import { HttpError, v } from './http.js';
import { quote, centsToMollie } from './pricing.js';
import { paymentProvider } from './payments/provider.js';
import { product, shipping, subscription, payments, site, brand } from '../config/commerce.js';
import { pickLocale, LOCALE_META, href } from '../web/i18n/index.js';

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

/**
 * Find or create the customer row for an e-mail address. Profile fields (name,
 * locale, marketing consent) are NOT touched here: an unauthenticated checkout
 * must not be able to rewrite another person's profile. They are stored on the
 * order and applied by applyCustomerProfile() once the order is paid.
 */
export async function findOrCreateCustomer(sql, { email, name, locale = 'en' }) {
  const [existing] = await sql`SELECT * FROM customers WHERE email = ${email}`;
  if (existing) return existing;
  const [c] = await sql`
    INSERT INTO customers (email, name, locale) VALUES (${email}, ${name}, ${locale})
    ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
    RETURNING *`;
  return c;
}

/** Called when an order becomes paid: the payer proved control of the e-mail address at Mollie. */
export async function applyCustomerProfile(sql, order) {
  if (!order.customer_id) return;
  await sql`
    UPDATE customers SET name = ${order.shipping_address?.name || null}, locale = ${order.locale || 'en'},
      marketing_consent = marketing_consent OR ${!!order.marketing_consent}
    WHERE id = ${order.customer_id}`;
}

/** Ensure the customer exists at the payment provider (needed for first/recurring payments). */
export async function ensureProviderCustomer(sql, customer, locale = 'en') {
  if (customer.mollie_customer_id) return customer.mollie_customer_id;
  const pp = paymentProvider();
  const created = await pp.createCustomer({ name: customer.name || undefined, email: customer.email, locale: (LOCALE_META[locale] || LOCALE_META.en).mollie, metadata: { customerId: customer.id } }, `cst-${customer.id}`);
  await sql`UPDATE customers SET mollie_customer_id = ${created.id} WHERE id = ${customer.id} AND mollie_customer_id IS NULL`;
  const [fresh] = await sql`SELECT mollie_customer_id FROM customers WHERE id = ${customer.id}`;
  return fresh.mollie_customer_id;
}

/**
 * Create order + payment and return the hosted checkout URL.
 * Two short transactions: (1) order/subscription rows, (2) payment row — the
 * Mollie call happens in between so no DB connection is held while waiting.
 * @param {object} input {mode, quantity, email, name, address, method?, marketingConsent?, locale?}
 */
export async function startCheckout(input) {
  const mode = v.oneOf(input.mode, ['one_time', 'subscription'], 'mode');
  const quantity = v.int(input.quantity, { min: 1, max: product.maxQuantity, name: 'quantity' });
  const email = v.email(input.email);
  const name = v.str(input.name, { min: 2, max: 120, name: 'Full name' });
  const address = validateAddress({ ...input.address, name: input.address?.name || name });
  const method = input.method ? v.oneOf(input.method, payments.methods, 'payment method') : null;
  const locale = pickLocale(input.locale) || 'en';
  if (mode === 'subscription' && !subscription.enabled) throw new HttpError(400, 'Subscriptions are not available right now');

  const q = quote({ mode, quantity, loyaltyLevel: 1, country: address.country });
  const pp = paymentProvider();

  // --- 1) order (+ pending subscription) -------------------------------------
  const { order, sub, providerCustomerId } = await transaction(async (sql) => {
    const customer = await findOrCreateCustomer(sql, { email, name, locale });
    const number = await nextOrderNumber(sql);
    const orderType = mode === 'subscription' ? 'subscription_first' : 'one_time';
    let sub = null;
    let providerCustomerId = null;
    if (mode === 'subscription') {
      // One live subscription per customer keeps the loyalty rule unambiguous. Abandoned
      // (pending) checkouts are expired by the cron; a fresh one supersedes them.
      const [existing] = await sql`SELECT id, status FROM subscriptions WHERE customer_id = ${customer.id} AND status IN ('active','past_due','suspended') LIMIT 1`;
      if (existing) throw new HttpError(409, 'You already have an active subscription. Manage it from your account.');
      providerCustomerId = await ensureProviderCustomer(sql, customer, locale);
      await sql`UPDATE subscriptions SET status = 'canceled', canceled_at = now(), cancel_reason = 'superseded' WHERE customer_id = ${customer.id} AND status = 'pending'`;
      [sub] = await sql`
        INSERT INTO subscriptions (customer_id, status, quantity, interval, unit_price_cents, shipping_address, mollie_customer_id)
        VALUES (${customer.id}, 'pending', ${quantity}, ${subscription.interval}, ${q.unitPriceCents}, ${sql.json(address)}, ${providerCustomerId})
        RETURNING *`;
    }
    const [order] = await sql`
      INSERT INTO orders (number, customer_id, subscription_id, order_type, quantity, currency, unit_price_cents, subtotal_cents,
        discount_cents, discount_label, shipping_cents, total_cents, vat_cents, email, locale, marketing_consent, shipping_address, pricing_snapshot)
      VALUES (${number}, ${customer.id}, ${sub?.id ?? null}, ${orderType}, ${quantity}, ${q.currency}, ${q.unitPriceCents}, ${q.subtotalCents},
        ${q.discountCents}, ${q.discountLabel}, ${q.shippingCents}, ${q.totalCents}, ${q.vatCents}, ${email}, ${locale}, ${!!input.marketingConsent}, ${sql.json(address)}, ${sql.json(q.snapshot)})
      RETURNING *`;
    if (sub) await sql`UPDATE subscriptions SET first_order_id = ${order.id} WHERE id = ${sub.id}`;
    return { order, sub, providerCustomerId };
  });

  // --- 2) payment at the provider ----------------------------------------------
  const base = site.baseUrl;
  const statusUrl = `${base}${href(`/order/${order.number}`, locale)}?t=${order.access_token}`;
  const params = {
    amount: { currency: q.currency, value: centsToMollie(q.totalCents) },
    description: `${brand.name} order ${order.number}`,
    redirectUrl: `${statusUrl}&r=1`,
    cancelUrl: `${base}${href('/checkout', locale)}?canceled=${order.number}&t=${order.access_token}`,
    webhookUrl: `${base}/api/webhooks/mollie`,
    locale: LOCALE_META[locale].mollie,
    metadata: { orderId: order.id, orderNumber: order.number, orderType: order.order_type, subscriptionId: sub?.id ?? null },
    shippingAddress: { givenName: address.name.split(' ')[0], familyName: address.name.split(' ').slice(1).join(' ') || address.name, streetAndNumber: address.street, postalCode: address.postalCode, city: address.city, country: address.country, email },
  };
  // Order lines are optional for iDEAL/cards/Apple Pay and strictly validated by Mollie: opt-in.
  if (process.env.MOLLIE_SEND_LINES === 'true') {
    params.lines = [{ type: 'physical', description: product.name, quantity, unitPrice: { currency: q.currency, value: centsToMollie(q.unitPriceCents) }, totalAmount: { currency: q.currency, value: centsToMollie(q.subtotalCents) }, sku: product.sku, vatRate: product.vatRatePct.toFixed(2), vatAmount: { currency: q.currency, value: centsToMollie(Math.round(q.subtotalCents - q.subtotalCents / (1 + product.vatRatePct / 100))) } }];
    if (q.discountCents) params.lines.push({ type: 'discount', description: q.discountLabel, quantity: 1, unitPrice: { currency: q.currency, value: `-${centsToMollie(q.discountCents)}` }, totalAmount: { currency: q.currency, value: `-${centsToMollie(q.discountCents)}` } });
    if (q.shippingCents) params.lines.push({ type: 'shipping_fee', description: 'Shipping', quantity: 1, unitPrice: { currency: q.currency, value: centsToMollie(q.shippingCents) }, totalAmount: { currency: q.currency, value: centsToMollie(q.shippingCents) } });
  }
  // Apple Pay is offered inside Mollie's hosted checkout on capable devices; forcing `applepay`
  // would fail on profiles where the wallet is not enabled, so we let the checkout show it.
  if (method && method !== 'applepay') params.method = method;
  if (mode === 'subscription') { params.sequenceType = 'first'; params.customerId = providerCustomerId; }

  let payment;
  try {
    payment = await pp.createPayment(params, `order-${order.id}`);
  } catch (err) {
    const sql = getSql();
    await sql`UPDATE orders SET payment_status = 'failed', notes = ${`Payment could not be created: ${err.message}`} WHERE id = ${order.id}`;
    if (sub) await sql`UPDATE subscriptions SET status = 'canceled', canceled_at = now(), cancel_reason = 'payment_not_created' WHERE id = ${sub.id}`;
    throw err;
  }

  // --- 3) persist the payment reference ----------------------------------------
  const sql = getSql();
  await sql`
    INSERT INTO payments (order_id, mollie_payment_id, mollie_status, sequence_type, method, amount_cents, currency, checkout_url, raw)
    VALUES (${order.id}, ${payment.id}, ${payment.status}, ${payment.sequenceType || 'oneoff'}, ${payment.method ?? null}, ${q.totalCents}, ${q.currency}, ${payment._links?.checkout?.href ?? null}, ${sql.json(stripRaw(payment))})
    ON CONFLICT (mollie_payment_id) DO NOTHING`;
  await sql`UPDATE orders SET mollie_payment_id = ${payment.id}, payment_status = 'open' WHERE id = ${order.id}`;

  return { orderNumber: order.number, orderId: order.id, accessToken: order.access_token, checkoutUrl: payment._links?.checkout?.href, statusUrl, quote: q };
}

/** Remove anything we never want to persist (defensive; Mollie never returns PANs anyway). */
export function stripRaw(payment) {
  const { _links, details, ...rest } = payment || {};
  const safeDetails = details ? Object.fromEntries(Object.entries(details).filter(([k]) => !/cardnumber|consumeraccount|token/i.test(k))) : null;
  return { ...rest, details: safeDetails };
}

/** Order lookup by number + access token (capability URL from the checkout redirect / e-mail). */
export async function getOrderByToken(number, token) {
  if (!/^RY-\d{4}-\d{6}$/.test(number || '') || !/^[a-f0-9]{36}$/.test(token || '')) return null;
  const sql = getSql();
  const [order] = await sql`SELECT * FROM orders WHERE number = ${number} AND access_token = ${token}`;
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
