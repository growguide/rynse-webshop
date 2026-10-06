/* RYNSE account — magic-link sign in, orders, subscription + loyalty, cancel. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const R = window.RYNSE; if (!R) return;
  const fmt = R.fmt;
  const signin = $('[data-acc-signin]'), content = $('[data-acc-content]');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const date = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const pill = (s) => `<span class="pill ${esc(s)}">${esc(String(s).replace('_', ' '))}</span>`;

  const form = $('[data-signin-form]');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('[data-form-error]', form), ok = $('[data-form-ok]', form); err.hidden = true; ok.hidden = true;
    const input = form.elements.email; const field = input.closest('.field');
    if (!input.checkValidity()) { field.classList.add('has-error'); return; } field.classList.remove('has-error');
    const btn = $('button', form); btn.setAttribute('aria-busy', 'true');
    try { await R.api('/api/auth/request', { email: input.value }); ok.hidden = false; } catch (ex) { err.textContent = ex.message; err.hidden = false; } finally { btn.removeAttribute('aria-busy'); }
  });
  if (new URLSearchParams(location.search).get('error') === 'link') { const err = $('[data-form-error]', form); err.textContent = 'That sign-in link is invalid or expired. Request a new one below.'; err.hidden = false; }

  const renderSub = (s) => {
    const box = $('[data-acc-sub]');
    if (!s) { box.innerHTML = `<p class="eyebrow">Subscription</p><p style="margin-top:8px">You don't have a subscription yet.</p><p style="margin-top:14px"><a class="btn btn-primary" href="/#buy">Subscribe &amp; save</a></p>`; return; }
    const L = s.loyalty;
    const active = ['active', 'past_due'].includes(s.status);
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><p class="eyebrow">Subscription</p>${pill(s.status)}</div>
      <dl class="kv" style="margin-top:6px">
        <div><dt>Plan</dt><dd>${s.quantity} × RYNSE — 40 Wipes, every ${esc(s.interval)}</dd></div>
        <div><dt>Since</dt><dd>${date(s.startDate)}</dd></div>
        ${active ? `<div><dt>Next delivery &amp; payment</dt><dd>${date(s.nextPaymentDate)}${s.nextChargeCents != null ? ` · ${fmt(s.nextChargeCents)}` : ''}</dd></div>` : ''}
        ${s.canceledAt ? `<div><dt>Cancelled</dt><dd>${date(s.canceledAt)}</dd></div>` : ''}
        <div><dt>Loyalty</dt><dd>${L.active ? `${esc(L.label)}${L.discountPct != null ? ` · −${L.discountPct}%` : ''}${L.daysToNextLevel != null ? ` · next level in ${L.daysToNextLevel} days` : ''}` : 'Not active (starts with an active subscription)'}</dd></div>
      </dl>
      ${s.status === 'past_due' ? '<div class="alert alert-error">Your last payment did not go through. Mollie retries automatically; if it keeps failing the subscription will be cancelled and your loyalty status resets.</div>' : ''}
      ${active ? `<div><button class="btn btn-ghost" type="button" data-cancel-sub="${esc(s.id)}">Cancel subscription</button><p class="small muted" style="margin-top:8px">Cancelling stops all future deliveries and payments immediately and resets your loyalty status. A new subscription starts again at year 1.</p></div>` : ''}
      <div class="alert alert-error" data-sub-error hidden></div>`;
    $('[data-cancel-sub]', box)?.addEventListener('click', async (e) => {
      const b = e.currentTarget;
      if (!b.dataset.confirm) { b.dataset.confirm = '1'; b.textContent = 'Yes, cancel my subscription'; b.classList.add('btn-primary'); return; }
      b.setAttribute('aria-busy', 'true');
      try { await R.api('/api/account/subscription/cancel', { subscriptionId: b.dataset.cancelSub }); load(); } catch (ex) { const er = $('[data-sub-error]', box); er.textContent = ex.message; er.hidden = false; b.removeAttribute('aria-busy'); }
    });
  };

  const load = async () => {
    const r = await fetch('/api/account', { credentials: 'same-origin' }); const d = await r.json();
    if (!d.signedIn) { signin.hidden = false; content.hidden = true; return; }
    signin.hidden = true; content.hidden = false;
    renderSub(d.subscription);
    $('[data-acc-orders]').innerHTML = d.orders.length ? d.orders.map((o) => `<tr><td><a class="link" href="/order/${esc(o.number)}?e=${encodeURIComponent(d.customer.email)}">${esc(o.number)}</a></td><td>${date(o.createdAt)}</td><td>${esc(o.orderType.replace(/_/g, ' '))}</td><td>${fmt(o.totalCents)}</td><td>${pill(o.paymentStatus)}</td><td>${pill(o.fulfillmentStatus)}${o.trackingCode ? `<div class="small muted">${esc(o.trackingCode)}</div>` : ''}</td></tr>`).join('') : '<tr><td colspan="6" class="muted">No orders yet.</td></tr>';
  };
  $('[data-logout]')?.addEventListener('click', async () => { await R.api('/api/auth/logout', {}); location.reload(); });
  load();
})();
