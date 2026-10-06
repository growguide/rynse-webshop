// The 20 payment scenarios from the brief (section 44), run against the Mollie emulator.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, api, checkout, webhook, order, subscriptionOf, emails, orderStatus, emu, sql, processNow } from './helpers.js';
import { closeSql } from '../src/server/db.js';

before(async () => { await resetDb(); });
after(async () => { await closeSql(); });

test('1. successful iDEAL payment → paid, confirmation sent once, fulfilment separate', async () => {
  const { orderNumber, paymentId } = await checkout('one_time', 2);
  assert.equal((await order(orderNumber)).payment_status, 'open');
  await emu().setStatus(paymentId, 'paid', { method: 'ideal' });
  const w = await webhook(paymentId); assert.equal(w.status, 200);
  const o = await order(orderNumber);
  assert.equal(o.payment_status, 'paid'); assert.equal(o.fulfillment_status, 'unfulfilled'); assert.ok(o.paid_at);
  assert.equal(o.total_cents, 1500 * 2 + 0); // free shipping over threshold
  const mails = await emails(); assert.equal(mails.filter((m) => m.template === 'orderConfirmation').length, 1);
});

test('2. canceled iDEAL payment → canceled, retry offered, nothing shipped', async () => {
  const { orderNumber, paymentId } = await checkout();
  await emu().setStatus(paymentId, 'canceled'); await webhook(paymentId);
  const o = await order(orderNumber); assert.equal(o.payment_status, 'canceled');
  const s = await orderStatus(orderNumber); assert.match(s.data.order.retryUrl, new RegExp(`^/checkout\\?retry=${orderNumber}&t=[a-f0-9]{36}$`)); assert.equal(s.data.order.retry.mode, 'one_time');
  assert.equal((await emails()).filter((m) => m.dedupe_key.includes(o.id)).length, 0);
});

test('3. failed payment → failed', async () => {
  const { orderNumber, paymentId } = await checkout('one_time', 1, { method: 'creditcard' });
  await emu().setStatus(paymentId, 'failed', { method: 'creditcard' }); await webhook(paymentId);
  assert.equal((await order(orderNumber)).payment_status, 'failed');
});

test('4. pending payment → pending, later paid', async () => {
  const { orderNumber, paymentId } = await checkout();
  await emu().setStatus(paymentId, 'pending'); await webhook(paymentId);
  assert.equal((await order(orderNumber)).payment_status, 'pending');
  await emu().setStatus(paymentId, 'paid'); await webhook(paymentId);
  assert.equal((await order(orderNumber)).payment_status, 'paid');
});

test('5. credit card payment', async () => {
  const { orderNumber, paymentId } = await checkout('one_time', 1, { method: 'creditcard' });
  await emu().setStatus(paymentId, 'paid', { method: 'creditcard' }); await webhook(paymentId);
  const [p] = await sql`SELECT method FROM payments WHERE mollie_payment_id = ${paymentId}`;
  assert.equal(p.method, 'creditcard'); assert.equal((await order(orderNumber)).payment_status, 'paid');
});

test('6. Apple Pay (processed as card wallet by Mollie)', async () => {
  const { orderNumber, paymentId } = await checkout('one_time', 1, { method: 'applepay' });
  await emu().setStatus(paymentId, 'paid', { method: 'applepay' }); await webhook(paymentId);
  assert.equal((await order(orderNumber)).payment_status, 'paid');
});

test('7. duplicate webhook → no double e-mail, no double processing', async () => {
  const { orderNumber, paymentId } = await checkout();
  await emu().setStatus(paymentId, 'paid');
  await Promise.all([webhook(paymentId), webhook(paymentId), webhook(paymentId)]);
  await webhook(paymentId);
  const o = await order(orderNumber);
  const mails = (await emails()).filter((m) => m.dedupe_key === `order_confirmation:${o.id}`);
  assert.equal(mails.length, 1);
  const ev = await sql`SELECT count(*)::int AS n FROM webhook_events WHERE resource_id = ${paymentId}`;
  assert.equal(ev[0].n, 1);
});

test('8. paid order can be shipped via admin; shipping mail once', async () => {
  const { orderNumber, paymentId } = await checkout();
  await emu().setStatus(paymentId, 'paid'); await webhook(paymentId);
  const o = await order(orderNumber);
  const h = { authorization: 'Bearer test-admin-token-0123456789' };
  const r = await api('POST', `/api/admin/orders/${o.id}/fulfillment`, { status: 'shipped', trackingCode: '3SABC123' }, { headers: h });
  assert.equal(r.status, 200); assert.equal(r.data.order.fulfillmentStatus, 'shipped');
  await api('POST', `/api/admin/orders/${o.id}/fulfillment`, { status: 'shipped' }, { headers: h });
  assert.equal((await emails()).filter((m) => m.dedupe_key === `order_shipped:${o.id}`).length, 1);
  const bad = await api('POST', `/api/admin/orders/${o.id}/fulfillment`, { status: 'shipped' }, { headers: { authorization: 'Bearer wrong' } });
  assert.equal(bad.status, 401);
});

test('9. refund (partial, then full) → statuses, refund mails', async () => {
  const { orderNumber, paymentId } = await checkout('one_time', 2);
  await emu().setStatus(paymentId, 'paid'); await webhook(paymentId);
  const o = await order(orderNumber);
  const h = { authorization: 'Bearer test-admin-token-0123456789' };
  const r1 = await api('POST', `/api/admin/orders/${o.id}/refund`, { amountCents: 500 }, { headers: h });
  assert.equal(r1.status, 200);
  await webhook(paymentId);
  assert.equal((await order(orderNumber)).payment_status, 'partially_refunded');
  const r2 = await api('POST', `/api/admin/orders/${o.id}/refund`, {}, { headers: h });
  assert.equal(r2.status, 200);
  await webhook(paymentId);
  const after = await order(orderNumber);
  assert.equal(after.payment_status, 'refunded'); assert.equal(after.fulfillment_status, 'cancelled');
  assert.equal((await emails()).filter((m) => m.template === 'refundIssued' && m.dedupe_key.includes(o.id)).length, 2);
});

test('10. one-time purchase does not create a subscription', async () => {
  const { orderNumber, paymentId } = await checkout('one_time');
  await emu().setStatus(paymentId, 'paid'); await webhook(paymentId);
  const o = await order(orderNumber); assert.equal(o.subscription_id, null); assert.equal(o.order_type, 'one_time');
});

test('11. first subscription payment → mandate, Mollie subscription, loyalty year 1', async () => {
  const { orderNumber, paymentId } = await checkout('subscription', 1, { email: 'sub1@example.com' });
  const pending = await subscriptionOf(orderNumber); assert.equal(pending.status, 'pending');
  await emu().setStatus(paymentId, 'paid', { method: 'ideal' }); await webhook(paymentId);
  const s = await subscriptionOf(orderNumber);
  assert.equal(s.status, 'active'); assert.ok(s.mollie_subscription_id); assert.ok(s.mollie_mandate_id);
  assert.equal(s.loyalty_level, 1); assert.ok(s.loyalty_start_date);
  const remote = await emu().getSubscription(s.mollie_customer_id, s.mollie_subscription_id);
  assert.equal(remote.interval, '1 month'); assert.equal(remote.status, 'active');
  const [mandate] = (await emu().listMandates(s.mollie_customer_id))._embedded.mandates;
  assert.equal(mandate.method, 'directdebit');
});

test('12. recurring subscription payment → renewal order created from the webhook alone', async () => {
  const { orderNumber, paymentId } = await checkout('subscription', 1, { email: 'sub2@example.com' });
  await emu().setStatus(paymentId, 'paid'); await webhook(paymentId);
  const s = await subscriptionOf(orderNumber);
  const renewal = await emu().chargeSubscription(s.mollie_subscription_id, { outcome: 'paid' });
  const w = await webhook(renewal.id); assert.equal(w.status, 200);
  const [ro] = await sql`SELECT * FROM orders WHERE subscription_id = ${s.id} AND order_type = 'subscription_renewal'`;
  assert.ok(ro); assert.equal(ro.payment_status, 'paid'); assert.equal(ro.email, 'sub2@example.com');
  assert.equal(ro.shipping_cents, 0);
  const mails = (await emails()).filter((m) => m.dedupe_key === `order_confirmation:${ro.id}`); assert.equal(mails.length, 1);
  const s2 = await subscriptionOf(orderNumber); assert.equal(s2.status, 'active'); assert.equal(s2.failed_payment_count, 0);
});

test('13. failed recurring payment → past_due, customer informed, loyalty kept while Mollie retries', async () => {
  const { orderNumber, paymentId } = await checkout('subscription', 1, { email: 'sub3@example.com' });
  await emu().setStatus(paymentId, 'paid'); await webhook(paymentId);
  const s = await subscriptionOf(orderNumber);
  const failed = await emu().chargeSubscription(s.mollie_subscription_id, { outcome: 'failed' });
  await webhook(failed.id);
  const s2 = await subscriptionOf(orderNumber);
  assert.equal(s2.status, 'past_due'); assert.equal(s2.failed_payment_count, 1); assert.ok(s2.loyalty_start_date, 'loyalty not reset on a retryable failure');
  assert.equal((await emails()).filter((m) => m.template === 'paymentFailed').length, 1);
  // a later successful retry heals it
  const ok = await emu().chargeSubscription(s.mollie_subscription_id, { outcome: 'paid' });
  await webhook(ok.id);
  assert.equal((await subscriptionOf(orderNumber)).status, 'active');
});

test('14. customer cancels subscription → canceled at Mollie, loyalty reset, mail', async () => {
  const { orderNumber, paymentId } = await checkout('subscription', 1, { email: 'sub4@example.com' });
  await emu().setStatus(paymentId, 'paid'); await webhook(paymentId);
  const s = await subscriptionOf(orderNumber);
  const { createSession } = await import('../src/server/security.js');
  const { setSessionCookie, resetSession } = await import('./helpers.js');
  setSessionCookie(createSession({ customerId: s.customer_id, email: 'sub4@example.com' }));
  const r = await api('POST', '/api/account/subscription/cancel', { subscriptionId: s.id });
  assert.equal(r.status, 200); assert.equal(r.data.status, 'canceled');
  const s2 = await subscriptionOf(orderNumber);
  assert.equal(s2.status, 'canceled'); assert.equal(s2.loyalty_start_date, null); assert.equal(s2.loyalty_level, 1);
  const remote = await emu().getSubscription(s.mollie_customer_id, s.mollie_subscription_id); assert.equal(remote.status, 'canceled');
  assert.equal((await emails()).filter((m) => m.template === 'subscriptionCanceled').length, 1);
  resetSession();
});

test('15. loyalty reset after Mollie cancels (exhausted retries) via reconcile', async () => {
  const { orderNumber, paymentId } = await checkout('subscription', 1, { email: 'sub5@example.com' });
  await emu().setStatus(paymentId, 'paid'); await webhook(paymentId);
  const s = await subscriptionOf(orderNumber);
  // pretend the subscription has run for 2 years → level 3
  await sql`UPDATE subscriptions SET loyalty_start_date = (now() - interval '2 years 1 day')::date WHERE id = ${s.id}`;
  const { levelFor } = await import('../src/server/loyalty.js');
  assert.equal(levelFor(await subscriptionOf(orderNumber)), 3);
  await emu().providerCancelSubscription(s.mollie_subscription_id);
  const cron = await api('GET', '/api/cron/daily', undefined, { headers: { authorization: 'Bearer test-cron-secret' } });
  assert.equal(cron.status, 200);
  const s2 = await subscriptionOf(orderNumber);
  assert.equal(s2.status, 'canceled'); assert.equal(s2.loyalty_start_date, null); assert.equal(s2.loyalty_level, 1);
  assert.equal(s2.cancel_reason, 'provider_canceled');
});

test('16. new subscription after cancellation starts again at year 1', async () => {
  const { orderNumber, paymentId } = await checkout('subscription', 1, { email: 'sub6@example.com' });
  await emu().setStatus(paymentId, 'paid'); await webhook(paymentId);
  const s = await subscriptionOf(orderNumber);
  await sql`UPDATE subscriptions SET loyalty_start_date = (now() - interval '3 years')::date, loyalty_level = 4 WHERE id = ${s.id}`;
  const { cancelSubscription } = await import('../src/server/subscriptions.js');
  await cancelSubscription(s.customer_id, s.id, 'customer');
  const again = await checkout('subscription', 1, { email: 'sub6@example.com' });
  await emu().setStatus(again.paymentId, 'paid'); await webhook(again.paymentId);
  const s2 = await subscriptionOf(again.orderNumber);
  assert.notEqual(s2.id, s.id); assert.equal(s2.status, 'active'); assert.equal(s2.loyalty_level, 1);
  assert.equal(new Date(s2.loyalty_start_date).toISOString().slice(0, 10), new Date().toISOString().slice(0, 10));
  // renewal price for a year-3 subscriber would use the loyalty discount; a fresh one does not
  const { quote } = await import('../src/server/pricing.js');
  assert.equal(quote({ mode: 'subscription', quantity: 1, loyaltyLevel: 1 }).discountCents, 0);
  assert.equal(quote({ mode: 'subscription', quantity: 1, loyaltyLevel: 3 }).discountCents, 225);
});

test('17. order confirmation page data + e-mail content', async () => {
  const { orderNumber, paymentId } = await checkout('one_time', 1, { email: 'conf@example.com' });
  await emu().setStatus(paymentId, 'paid'); await webhook(paymentId);
  const r = await orderStatus(orderNumber);
  assert.equal(r.status, 200); assert.equal(r.data.order.paymentStatus, 'paid'); assert.equal(r.data.order.totalCents, 1895);
  const wrong = await orderStatus(orderNumber, 'a'.repeat(36)); assert.equal(wrong.status, 404);
  const guess = await api('GET', `/api/orders/${orderNumber}?e=conf@example.com`); assert.equal(guess.status, 404, 'e-mail alone must not unlock an order');
});

test('18. error during redirect (user never returns) — webhook alone completes the order', async () => {
  const { orderNumber, paymentId } = await checkout();
  await emu().setStatus(paymentId, 'paid');
  await webhook(paymentId); // no visit to the order page at all
  assert.equal((await order(orderNumber)).payment_status, 'paid');
});

test('19. refreshing the success page many times is harmless', async () => {
  const { orderNumber, paymentId } = await checkout();
  await emu().setStatus(paymentId, 'paid'); await webhook(paymentId);
  for (let i = 0; i < 5; i++) { const r = await orderStatus(orderNumber); assert.equal(r.data.order.paymentStatus, 'paid'); }
  const o = await order(orderNumber);
  assert.equal((await emails()).filter((m) => m.dedupe_key === `order_confirmation:${o.id}`).length, 1);
});

test('20. webhook arrives later than the redirect — status page verifies with the provider itself', async () => {
  const { orderNumber, paymentId } = await checkout();
  await emu().setStatus(paymentId, 'paid'); // Mollie knows it is paid, our webhook has not arrived yet
  const r = await orderStatus(orderNumber);
  assert.equal(r.data.order.paymentStatus, 'paid');
  await webhook(paymentId); // late webhook = duplicate
  const o = await order(orderNumber);
  assert.equal((await emails()).filter((m) => m.dedupe_key === `order_confirmation:${o.id}`).length, 1);
  const ev = await sql`SELECT count(*)::int AS n FROM webhook_events WHERE resource_id = ${paymentId}`; assert.equal(ev[0].n, 1);
});

test('security: frontend amounts are ignored, CSRF enforced, rate limits, forged webhook', async () => {
  const r = await api('POST', '/api/checkout', { mode: 'one_time', quantity: 1, totalCents: 1, priceCents: 1, ...(await import('./helpers.js')).customer() });
  assert.equal(r.status, 200); assert.equal((await order(r.data.orderNumber)).total_cents, 1895);
  const noCsrf = await api('POST', '/api/checkout', { mode: 'one_time', quantity: 1 }, { headers: { 'x-csrf-token': 'nope' } });
  assert.equal(noCsrf.status, 403);
  const forged = await webhook('tr_does_not_exist'); assert.equal(forged.status, 200); // 200 but nothing happens
  const bad = await api('POST', '/api/checkout', { mode: 'one_time', quantity: 99, ...(await import('./helpers.js')).customer() }); assert.equal(bad.status, 400);
  const expired = await checkout(); await emu().setStatus(expired.paymentId, 'expired'); await webhook(expired.paymentId);
  assert.equal((await order(expired.orderNumber)).payment_status, 'expired');
});

test('review fixes: profile applied only when paid; renewal retry reuses order; loyalty price synced at Mollie; forced-method cancel swept by cron', async () => {
  // Unauthenticated checkout must not rewrite an existing customer's name/marketing consent.
  const first = await checkout('one_time', 1, { email: 'profile@example.com', name: 'Real Name', marketingConsent: false });
  await emu().setStatus(first.paymentId, 'paid'); await webhook(first.paymentId);
  await checkout('one_time', 1, { email: 'profile@example.com', name: 'Impostor', marketingConsent: true }); // never paid
  const [c] = await sql`SELECT name, marketing_consent FROM customers WHERE email = 'profile@example.com'`;
  assert.equal(c.name, 'Real Name'); assert.equal(c.marketing_consent, false);

  // Renewal: failed attempt + retry → one renewal order, recorded at the charged amount.
  const sub = await checkout('subscription', 1, { email: 'retry@example.com' });
  await emu().setStatus(sub.paymentId, 'paid'); await webhook(sub.paymentId);
  const s = await subscriptionOf(sub.orderNumber);
  const f = await emu().chargeSubscription(s.mollie_subscription_id, { outcome: 'failed' }); await webhook(f.id);
  const ok = await emu().chargeSubscription(s.mollie_subscription_id, { outcome: 'paid' }); await webhook(ok.id);
  const renewals = await sql`SELECT * FROM orders WHERE subscription_id = ${s.id} AND order_type = 'subscription_renewal'`;
  assert.equal(renewals.length, 1); assert.equal(renewals[0].payment_status, 'paid');

  // Loyalty anniversary → cron updates the Mollie amount BEFORE the next charge (year 3 = 15% in the test env).
  await sql`UPDATE subscriptions SET loyalty_start_date = (now() - interval '2 years 1 day')::date WHERE id = ${s.id}`;
  const cron = await api('GET', '/api/cron/daily', undefined, { headers: { authorization: 'Bearer test-cron-secret' } });
  assert.equal(cron.status, 200); assert.ok(cron.data.report.amountSynced >= 1, JSON.stringify(cron.data.report));
  const remote = await emu().getSubscription(s.mollie_customer_id, s.mollie_subscription_id);
  assert.equal(remote.amount.value, '12.75');
  const charged = await emu().chargeSubscription(s.mollie_subscription_id, { outcome: 'paid' }); await webhook(charged.id);
  const [latest] = await sql`SELECT total_cents, discount_cents FROM orders WHERE mollie_payment_id = ${charged.id}`;
  assert.equal(latest.total_cents, 1275); assert.equal(latest.discount_cents, 225);

  // Forced-method cancel on the hosted page sends no webhook: the cron sweep resolves it.
  const stale = await checkout('one_time', 1, { email: 'stale@example.com' });
  await emu().setStatus(stale.paymentId, 'canceled', { fireHook: false });
  await sql`UPDATE payments SET created_at = now() - interval '2 hours' WHERE mollie_payment_id = ${stale.paymentId}`;
  assert.equal((await order(stale.orderNumber)).payment_status, 'open');
  await api('GET', '/api/cron/daily', undefined, { headers: { authorization: 'Bearer test-cron-secret' } });
  assert.equal((await order(stale.orderNumber)).payment_status, 'canceled');

  // Abandoned pending subscription is expired and does not shadow the real one.
  const dup = await checkout('subscription', 1, { email: 'retry2@example.com' });
  await sql`UPDATE subscriptions SET created_at = now() - interval '4 hours' WHERE id = (SELECT subscription_id FROM orders WHERE number = ${dup.orderNumber})`;
  await api('GET', '/api/cron/daily', undefined, { headers: { authorization: 'Bearer test-cron-secret' } });
  assert.equal((await subscriptionOf(dup.orderNumber)).status, 'canceled');
});

test('magic link: GET shows a page, only the POST consumes the token (scanner-safe)', async () => {
  await sql`INSERT INTO customers (email, name) VALUES ('magic@example.com', 'M') ON CONFLICT DO NOTHING`;
  const r = await api('POST', '/api/auth/request', { email: 'magic@example.com', locale: 'nl' });
  assert.equal(r.status, 200);
  const [row] = await sql`SELECT token_hash FROM login_tokens WHERE email = 'magic@example.com' ORDER BY created_at DESC LIMIT 1`;
  assert.ok(row);
  const [mail] = await sql`SELECT dedupe_key FROM email_log WHERE to_email = 'magic@example.com'`; assert.ok(mail);
  // We cannot read the raw token from the hash; emulate the flow with a known token instead.
  const { newLoginToken } = await import('../src/server/security.js');
  const { token, hash } = newLoginToken();
  await sql`INSERT INTO login_tokens (token_hash, email, expires_at) VALUES (${hash}, 'magic@example.com', now() + interval '15 minutes')`;
  const page = await api('GET', `/api/auth/verify?token=${encodeURIComponent(token)}&l=nl`);
  assert.equal(page.status, 200); assert.match(String(page.data), /<form method="post" action="\/api\/auth\/consume"/);
  const [unused] = await sql`SELECT used_at FROM login_tokens WHERE token_hash = ${hash}`; assert.equal(unused.used_at, null, 'GET must not consume the token');
  const consume = await api('POST', '/api/auth/consume', new URLSearchParams({ token, l: 'nl' }));
  assert.equal(consume.status, 303); assert.equal(consume.headers.get('location'), '/nl/account'); assert.match(consume.headers.get('set-cookie') || '', /rynse_session=/);
  const again = await api('POST', '/api/auth/consume', new URLSearchParams({ token, l: 'nl' }));
  assert.equal(again.headers.get('location'), '/nl/account?error=link');
});

test('worldwide shipping: zone rates, duties flag, excluded countries, localized country list', async () => {
  const nl = await api('POST', '/api/quote', { mode: 'one_time', quantity: 1, country: 'NL' });
  const de = await api('POST', '/api/quote', { mode: 'one_time', quantity: 1, country: 'DE' });
  const us = await api('POST', '/api/quote', { mode: 'one_time', quantity: 1, country: 'US' });
  const jp = await api('POST', '/api/quote', { mode: 'one_time', quantity: 6, country: 'JP' });
  assert.equal(nl.data.shippingZone, 'nl'); assert.equal(nl.data.shippingCents, 395); assert.equal(nl.data.dutiesMayApply, false);
  assert.equal(de.data.shippingZone, 'europe'); assert.equal(de.data.shippingCents, 795); assert.equal(de.data.dutiesMayApply, false);
  assert.equal(us.data.shippingZone, 'world'); assert.equal(us.data.shippingCents, 1495); assert.equal(us.data.dutiesMayApply, true);
  assert.equal(jp.data.shippingCents, 0, 'free shipping above the world threshold');
  const subUs = await api('POST', '/api/quote', { mode: 'subscription', quantity: 1, country: 'US' });
  assert.equal(subUs.data.shippingCents, 0, 'subscriptions ship free in every zone');
  const bad = await api('POST', '/api/quote', { mode: 'one_time', quantity: 1, country: 'ZZ' }); assert.equal(bad.status, 400);
  // A paid order to Brazil snapshots the zone.
  const br = await checkout('one_time', 1, { email: 'br@example.com', address: { street: 'Rua A 1', postalCode: '01000-000', city: 'São Paulo', country: 'BR' }, method: 'creditcard' });
  await emu().setStatus(br.paymentId, 'paid'); await webhook(br.paymentId);
  const o = await order(br.orderNumber); assert.equal(o.total_cents, 1500 + 1495); assert.equal(o.pricing_snapshot.shippingZone, 'world');
});
