/* RYNSE admin — token kept in sessionStorage for this tab only. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const R = window.RYNSE; if (!R) return;
  const fmt = R.fmt;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const date = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  const pill = (s) => `<span class="pill ${esc(s)}">${esc(String(s).replace('_', ' '))}</span>`;
  const KEY = 'rynse:admin-token';
  let token = sessionStorage.getItem(KEY) || '';
  const call = async (path, body, method = body ? 'POST' : 'GET') => {
    const r = await fetch(path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`); return d;
  };
  const login = $('[data-admin-login]'), app = $('[data-admin-app]');
  const start = async () => {
    try { await call('/api/admin/stats'); login.hidden = true; app.hidden = false; sessionStorage.setItem(KEY, token); refresh(); }
    catch (e) { const er = $('[data-admin-error]'); er.textContent = e.message; er.hidden = false; }
  };
  $('[data-admin-signin]').addEventListener('click', () => { token = $('#adm-token').value.trim(); start(); });
  $('#adm-token').addEventListener('keydown', (e) => { if (e.key === 'Enter') { token = e.target.value.trim(); start(); } });
  if (token) start();

  const refresh = async () => {
    const q = $('[data-admin-search]').value.trim(); const status = $('[data-admin-filter]').value;
    const [{ stats }, { orders }, { subscriptions }] = await Promise.all([call('/api/admin/stats'), call(`/api/admin/orders?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`), call('/api/admin/subscriptions')]);
    $('[data-admin-stats]').innerHTML = [['Paid orders', stats.paid_orders], ['Revenue', fmt(Number(stats.revenue_cents))], ['To ship', stats.to_ship], ['Active subscriptions', `${stats.active_subscriptions}${Number(stats.past_due_subscriptions) ? ` (+${stats.past_due_subscriptions} past due)` : ''}`]].map(([k, v]) => `<div class="why-item"><p class="eyebrow">${k}</p><p class="h3">${v}</p></div>`).join('');
    $('[data-admin-orders]').innerHTML = orders.map((o) => `<tr><td><strong>${esc(o.number)}</strong><div class="small muted">${esc(o.method || '')}</div></td><td>${date(o.createdAt)}</td><td>${esc(o.shippingAddress?.name)}<div class="small muted">${esc(o.email)}</div><div class="small muted">${esc(o.shippingAddress?.street)}, ${esc(o.shippingAddress?.postalCode)} ${esc(o.shippingAddress?.city)} ${esc(o.shippingAddress?.country)}</div></td><td>${esc(o.orderType.replace(/_/g, ' '))}<div class="small muted">${o.quantity} × 40</div></td><td>${fmt(o.totalCents)}</td><td>${pill(o.paymentStatus)}</td><td>${pill(o.fulfillmentStatus)}${o.trackingCode ? `<div class="small muted">${esc(o.trackingCode)}</div>` : ''}${o.notes ? `<div class="small" style="color:var(--danger)">${esc(o.notes)}</div>` : ''}</td><td style="white-space:nowrap">${['paid', 'partially_refunded'].includes(o.paymentStatus) && o.fulfillmentStatus === 'unfulfilled' ? `<button class="link" data-ship="${o.id}">Mark shipped</button><br>` : ''}${['paid', 'partially_refunded'].includes(o.paymentStatus) ? `<button class="link" data-refund="${o.id}" style="color:var(--danger)">Refund</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">No orders.</td></tr>';
    $('[data-admin-subs]').innerHTML = subscriptions.map((s) => `<tr><td>${esc(s.email)}</td><td>${pill(s.status)}</td><td>${esc(s.interval)}</td><td>${s.nextPaymentDate || '—'}</td><td>Year ${s.loyaltyLevel}${s.loyaltyStartDate ? ` (since ${s.loyaltyStartDate})` : ' (reset)'}</td><td>${s.failedPaymentCount}</td><td>${['active', 'past_due', 'suspended'].includes(s.status) ? `<button class="link" data-cancel="${s.id}" style="color:var(--danger)">Cancel</button>` : esc(s.cancelReason || '')}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No subscriptions.</td></tr>';
    app.querySelectorAll('[data-ship]').forEach((b) => b.addEventListener('click', async () => { const t = prompt('Tracking code (optional):') || ''; await call(`/api/admin/orders/${b.dataset.ship}/fulfillment`, { status: 'shipped', trackingCode: t || undefined }); refresh(); }));
    app.querySelectorAll('[data-refund]').forEach((b) => b.addEventListener('click', async () => { const amt = prompt('Refund amount in cents (empty = full remaining):'); if (amt === null) return; try { await call(`/api/admin/orders/${b.dataset.refund}/refund`, { amountCents: amt ? Number(amt) : undefined, reason: 'Refund via admin' }); } catch (e) { alert(e.message); } refresh(); }));
    app.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', async () => { if (!confirm('Cancel this subscription? Loyalty resets.')) return; await call(`/api/admin/subscriptions/${b.dataset.cancel}/cancel`, {}); refresh(); }));
  };
  $('[data-admin-search]').addEventListener('input', () => { clearTimeout(window.__t); window.__t = setTimeout(refresh, 300); });
  $('[data-admin-filter]').addEventListener('change', refresh);
})();
