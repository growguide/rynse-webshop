/* RYNSE order status page — never trusts the redirect; polls the server until the payment is final. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const R = window.RYNSE; if (!R) return;
  const number = decodeURIComponent(location.pathname.split('/').pop() || '');
  const email = new URLSearchParams(location.search).get('e') || '';
  const fmt = R.fmt;
  const title = $('[data-order-title]'), msg = $('[data-order-message]'), icon = $('[data-status-icon]'), details = $('[data-order-details]'), actions = $('[data-order-actions]');
  const icons = {
    ok: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    pending: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    failed: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>',
  };
  const label = { one_time: 'One-time purchase', subscription_first: 'Subscription — first delivery', subscription_renewal: 'Subscription delivery' };
  let attempts = 0;
  const render = (o) => {
    const final = ['paid', 'refunded', 'partially_refunded', 'failed', 'canceled', 'expired'].includes(o.paymentStatus);
    const paid = ['paid', 'refunded', 'partially_refunded'].includes(o.paymentStatus);
    const failed = ['failed', 'canceled', 'expired'].includes(o.paymentStatus);
    title.innerHTML = paid ? 'Thank you. <span class="serif gold">You\'re set.</span>' : failed ? 'Payment <span class="serif gold">not completed.</span>' : 'Confirming your <span class="serif gold">payment…</span>';
    icon.className = `status-icon ${paid ? '' : failed ? 'failed' : 'pending'}`; icon.innerHTML = paid ? icons.ok : failed ? icons.failed : icons.pending;
    msg.textContent = paid ? `Order ${o.number} is confirmed. A confirmation is on its way to your inbox and we're getting your pack ready.${o.orderType === 'subscription_first' ? ` Your subscription is active — the next pack arrives every ${o.interval}.` : ''}` : failed ? `Your payment was ${o.paymentStatus === 'canceled' ? 'cancelled' : o.paymentStatus}. Nothing has been charged. You can try again with another method.` : 'We are waiting for your bank or card provider to confirm. This usually takes a few seconds — you can leave this page; we\'ll e-mail you.';
    const a = o.shippingAddress || {};
    details.innerHTML = [['Order', o.number], ['Type', label[o.orderType] || o.orderType], ['Items', `${o.quantity} × RYNSE — 40 Wipes`], o.discountCents ? [o.discountLabel, `− ${fmt(o.discountCents)}`] : null, ['Shipping', o.shippingCents ? fmt(o.shippingCents) : 'Free'], ['Total', fmt(o.totalCents)], ['Payment', `${o.paymentStatus}${o.method ? ` · ${o.method}` : ''}`], ['Delivery to', `${a.name}, ${a.street}, ${a.postalCode} ${a.city}`], o.trackingCode ? ['Tracking', o.trackingCode] : null].filter(Boolean).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    actions.innerHTML = failed ? `<a class="btn btn-primary" href="${o.retryUrl || '/checkout'}">Try again</a><a class="btn btn-ghost" href="/contact">Need help?</a>` : paid ? `<a class="btn btn-ghost" href="/account">Your account</a><a class="btn btn-ghost" href="/">Back to RYNSE</a>` : '';
    if (paid && sessionStorage.getItem('rynse:purchase-tracked') !== o.number) {
      sessionStorage.setItem('rynse:purchase-tracked', o.number);
      R.track('purchase', { transaction_id: o.number, currency: o.currency, value: o.totalCents / 100, shipping: o.shippingCents / 100, items: [{ item_id: 'RYNSE-40', item_name: 'RYNSE — 40 Wipes', quantity: o.quantity, price: o.unitPriceCents / 100, item_variant: o.orderType }] });
      if (o.orderType === 'subscription_first') R.track('subscription_purchase', { transaction_id: o.number, value: o.totalCents / 100 });
      R.writeCart(null); sessionStorage.removeItem('rynse:pending-order'); sessionStorage.removeItem('rynse:checkout-draft');
    }
    return final;
  };
  const poll = async () => {
    try {
      const r = await fetch(`/api/orders/${encodeURIComponent(number)}?e=${encodeURIComponent(email)}`);
      if (r.status === 404) { title.textContent = 'Order not found'; msg.textContent = 'We could not find this order. Check the link in your confirmation e-mail or sign in to your account.'; actions.innerHTML = '<a class="btn btn-ghost" href="/account">Account</a>'; return; }
      const { order } = await r.json();
      const final = render(order);
      attempts += 1;
      if (!final && attempts < 40) setTimeout(poll, attempts < 6 ? 2000 : 5000);
    } catch { if (attempts++ < 40) setTimeout(poll, 4000); }
  };
  poll();
})();
