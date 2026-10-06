/* RYNSE checkout — validates locally, sends only {mode, quantity, contact, address, method}; the server prices. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const R = window.RYNSE;
  const form = $('[data-checkout-form]');
  if (!form || !R) return;
  const params = new URLSearchParams(location.search);
  let cart = R.readCart();
  if (!cart && params.get('retry')) cart = { mode: 'one_time', quantity: 1 };
  if (!cart) { $('[data-cart-empty]').hidden = false; $$('.form-section, .checkout-summary').forEach((el) => (el.style.display = 'none')); return; }
  if (params.get('retry') || params.get('canceled')) $('[data-retry-note]').hidden = false;

  // Apple Pay: only offer it when the device can actually use it (hosted Mollie checkout still handles the wallet).
  const applePayRow = $('[data-method-applepay]');
  const canApplePay = !!(window.ApplePaySession && window.ApplePaySession.canMakePayments && window.ApplePaySession.canMakePayments());
  if (!canApplePay && applePayRow) applePayRow.remove();

  const fmt = R.fmt, T = R.T;
  const summary = async () => {
    $('[data-sum-mode]').textContent = cart.mode === 'subscription' ? T('checkout.subscription', { interval: window.__RYNSE__.interval }) : T('checkout.oneTime');
    $('[data-sum-qty]').textContent = T('checkout.wipes', { n: cart.quantity });
    $$('[data-mode-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modeBtn === cart.mode)));
    const terms = $('[data-sub-terms]'); terms.hidden = cart.mode !== 'subscription';
    $('[data-pay-label]').textContent = cart.mode === 'subscription' ? T('checkout.paySubscribe') : T('checkout.payNow');
    try {
      const r = await fetch('/api/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: cart.mode, quantity: cart.quantity, country: $('#f-country').value }) });
      const q = await r.json();
      if (!r.ok) throw new Error(q.error);
      $('[data-sum-totals]').innerHTML = `<div><span>${T('cart.line', { n: cart.quantity })}</span><span>${fmt(q.subtotalCents)}</span></div>${q.discountCents ? `<div><span>${q.discountLabel}</span><span>− ${fmt(q.discountCents)}</span></div>` : ''}<div><span>${T('cart.shipping')}</span><span>${q.shippingCents ? fmt(q.shippingCents) : T('cart.free')}</span></div><div class="grand"><span>${T('cart.totalNow')}</span><span>${fmt(q.totalCents)}</span></div>`;
      $('[data-sub-amount]').textContent = fmt(q.totalCents);
      $('[data-pay-label]').textContent = `${cart.mode === 'subscription' ? T('checkout.paySubscribe') : T('checkout.pay')} ${fmt(q.totalCents)}`;
    } catch (e) { $('[data-sum-totals]').innerHTML = `<div class="alert alert-error">${e.message || T('checkout.priceError')}</div>`; }
  };
  $$('[data-mode-btn]').forEach((b) => b.addEventListener('click', () => { cart = { ...cart, mode: b.dataset.modeBtn }; R.writeCart(cart); summary(); }));
  $('#f-country').addEventListener('change', summary);
  summary();
  R.track('begin_checkout', { currency: 'EUR', items: [{ item_id: 'RYNSE-40', quantity: cart.quantity, item_variant: cart.mode }] });

  // Restore contact details typed earlier (same device) to shorten repeat checkouts. Never stores payment data.
  const DRAFT = 'rynse:checkout-draft';
  try { const d = JSON.parse(sessionStorage.getItem(DRAFT) || '{}'); for (const [k, v] of Object.entries(d)) { const el = form.elements[k]; if (el && el.type !== 'checkbox' && el.type !== 'radio') el.value = v; } } catch {}
  form.addEventListener('input', () => { try { const d = {}; ['email', 'name', 'street', 'postalCode', 'city', 'country'].forEach((k) => (d[k] = form.elements[k].value)); sessionStorage.setItem(DRAFT, JSON.stringify(d)); } catch {} });

  const validate = () => {
    let ok = true;
    $$('.field', form).forEach((f) => {
      const input = $('input, select, textarea', f); if (!input) return;
      const valid = input.checkValidity();
      f.classList.toggle('has-error', !valid); input.setAttribute('aria-invalid', String(!valid));
      if (!valid && ok) { input.focus(); ok = false; }
    });
    const terms = form.elements.terms; const termsWrap = terms.closest('.consent');
    termsWrap.classList.toggle('has-error', !terms.checked);
    $('.err', termsWrap).style.display = terms.checked ? 'none' : 'block';
    if (!terms.checked) ok = false;
    return ok;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('[data-form-error]'); err.hidden = true;
    if (!validate()) return;
    const btn = $('[data-pay]'); btn.setAttribute('aria-busy', 'true'); btn.disabled = true;
    try {
      const f = form.elements;
      const data = await R.api('/api/checkout', {
        mode: cart.mode, quantity: cart.quantity, email: f.email.value, name: f.name.value,
        address: { name: f.name.value, street: f.street.value, postalCode: f.postalCode.value, city: f.city.value, country: f.country.value },
        method: f.method.value, marketingConsent: f.marketingConsent.checked, locale: R.locale,
      });
      R.track('add_payment_info', { payment_type: f.method.value });
      if (cart.mode === 'subscription') R.track('subscription_purchase_started', { quantity: cart.quantity });
      // The cart is cleared once the order page confirms payment; keep it for a retry.
      sessionStorage.setItem('rynse:pending-order', data.orderNumber);
      location.assign(data.checkoutUrl);
    } catch (ex) {
      err.textContent = ex.message || T('checkout.error'); err.hidden = false;
      btn.removeAttribute('aria-busy'); btn.disabled = false;
      err.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
})();
