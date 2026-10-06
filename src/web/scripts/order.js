/* RYNSE order status page — never trusts the redirect; polls the server until the payment is final. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const R = window.RYNSE; if (!R) return;
  const number = decodeURIComponent(location.pathname.split('/').pop() || '');
  const email = new URLSearchParams(location.search).get('e') || '';
  const fmt = R.fmt, T = R.T, P = R.P;
  const title = $('[data-order-title]'), msg = $('[data-order-message]'), icon = $('[data-status-icon]'), details = $('[data-order-details]'), actions = $('[data-order-actions]');
  const icons = {
    ok: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    pending: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    failed: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>',
  };
  const label = (k) => T(`order.type.${k}`);
  let attempts = 0;
  const render = (o) => {
    const final = ['paid', 'refunded', 'partially_refunded', 'failed', 'canceled', 'expired'].includes(o.paymentStatus);
    const paid = ['paid', 'refunded', 'partially_refunded'].includes(o.paymentStatus);
    const failed = ['failed', 'canceled', 'expired'].includes(o.paymentStatus);
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    title.innerHTML = paid ? `${esc(T('order.thanksA'))} <span class="serif gold">${esc(T('order.thanksB'))}</span>` : failed ? `${esc(T('order.failedA'))} <span class="serif gold">${esc(T('order.failedB'))}</span>` : `${esc(T('order.pendingA'))} <span class="serif gold">${esc(T('order.pendingB'))}</span>`;
    icon.className = `status-icon ${paid ? '' : failed ? 'failed' : 'pending'}`; icon.innerHTML = paid ? icons.ok : failed ? icons.failed : icons.pending;
    msg.textContent = paid ? `${T('order.paidMsg', { number: o.number })}${o.orderType === 'subscription_first' ? T('order.paidSub', { interval: window.__RYNSE__.interval }) : ''}` : failed ? T('order.failedMsg', { status: T(`order.status.${o.paymentStatus}`) }) : T('order.pendingMsg');
    const a = o.shippingAddress || {};
    details.innerHTML = [[T('order.l.order'), o.number], [T('order.l.type'), label(o.orderType)], [T('order.l.items'), T('cart.line', { n: o.quantity })], o.discountCents ? [o.discountLabel, `− ${fmt(o.discountCents)}`] : null, [T('order.l.shipping'), o.shippingCents ? fmt(o.shippingCents) : T('cart.free')], [T('order.l.total'), fmt(o.totalCents)], [T('order.l.payment'), `${T(`status.${o.paymentStatus}`)}${o.method ? ` · ${o.method}` : ''}`], [T('order.l.deliveryTo'), `${a.name}, ${a.street}, ${a.postalCode} ${a.city}`], o.trackingCode ? [T('order.l.tracking'), o.trackingCode] : null].filter(Boolean).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
    actions.innerHTML = failed ? `<a class="btn btn-primary" href="${P}${o.retryUrl || '/checkout'}">${esc(T('order.tryAgain'))}</a><a class="btn btn-ghost" href="${P}/contact">${esc(T('order.help'))}</a>` : paid ? `<a class="btn btn-ghost" href="${P}/account">${esc(T('order.account'))}</a><a class="btn btn-ghost" href="${P}/">${esc(T('order.back'))}</a>` : '';
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
      if (r.status === 404) { title.textContent = T('order.notFound'); msg.textContent = T('order.notFoundMsg'); actions.innerHTML = `<a class="btn btn-ghost" href="${P}/account">${T('order.account')}</a>`; return; }
      const { order } = await r.json();
      const final = render(order);
      attempts += 1;
      if (!final && attempts < 40) setTimeout(poll, attempts < 6 ? 2000 : 5000);
    } catch { if (attempts++ < 40) setTimeout(poll, 4000); }
  };
  poll();
})();
