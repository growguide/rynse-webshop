// Plain, premium e-mail templates (HTML + text). Kept simple and bulletproof for
// mail clients: table-free, inline styles, navy + gold.
import { formatMoney } from '../../config/commerce.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function layout({ brand, siteUrl }, title, bodyHtml, bodyText) {
  const html = `<!doctype html><html><body style="margin:0;background:#0A1428;font-family:Helvetica,Arial,sans-serif;color:#F3EEE2">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
  <div style="font-weight:900;letter-spacing:.08em;color:#E2C272;font-size:22px;margin-bottom:28px">${esc(brand.name)}</div>
  <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;color:#FFFFFF">${esc(title)}</h1>
  <div style="font-size:16px;line-height:1.6;color:#D9D2C2">${bodyHtml}</div>
  <p style="margin-top:36px;font-size:13px;color:#8A8FA3">${esc(brand.tagline)} · <a href="${esc(siteUrl)}" style="color:#E2C272">${esc(siteUrl.replace(/^https?:\/\//, ''))}</a> · Questions? <a href="mailto:${esc(brand.supportEmail)}" style="color:#E2C272">${esc(brand.supportEmail)}</a></p>
</div></body></html>`;
  const text = `${brand.name}\n\n${title}\n\n${bodyText}\n\n${brand.tagline} · ${siteUrl} · ${brand.supportEmail}`;
  return { subject: title, html, text };
}

const lines = (order) => {
  const rows = [
    [`${order.quantity} × ${order.productName || 'RYNSE — 40 Wipes'}`, formatMoney(order.subtotal_cents)],
    ...(order.discount_cents ? [[order.discount_label || 'Discount', `− ${formatMoney(order.discount_cents)}`]] : []),
    ['Shipping', order.shipping_cents ? formatMoney(order.shipping_cents) : 'Free'],
    ['Total (incl. VAT)', formatMoney(order.total_cents)],
  ];
  const html = rows.map(([k, val]) => `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #1E2A47"><span>${esc(k)}</span><span style="color:#fff">${esc(val)}</span></div>`).join('');
  const text = rows.map(([k, val]) => `${k}: ${val}`).join('\n');
  return { html, text };
};

const address = (a) => [a.name, a.street, `${a.postalCode} ${a.city}`, a.country].filter(Boolean);

export function orderConfirmation(d) {
  const { order } = d;
  const l = lines(order);
  const addr = address(order.shipping_address);
  const sub = order.order_type === 'subscription_first'
    ? `<p>This is the first delivery of your subscription (every ${esc(d.interval)}). You can pause or cancel any time from <a href="${esc(d.siteUrl)}/account" style="color:#E2C272">your account</a> — no questions asked.</p>`
    : '';
  const subText = order.order_type === 'subscription_first' ? `\nThis is the first delivery of your subscription (every ${d.interval}). Cancel any time at ${d.siteUrl}/account.` : '';
  return layout(d, `Order ${order.number} confirmed`,
    `<p>Thanks — your payment went through and we're getting your pack ready.</p>${l.html}<p style="margin-top:20px">Shipping to:<br>${addr.map(esc).join('<br>')}</p>${sub}<p>Track your order: <a href="${esc(d.siteUrl)}/order/${esc(order.number)}?e=${encodeURIComponent(order.email)}" style="color:#E2C272">${esc(d.siteUrl)}/order/${esc(order.number)}</a></p>`,
    `Thanks — your payment went through and we're getting your pack ready.\n\n${l.text}\n\nShipping to:\n${addr.join('\n')}${subText}\n\nTrack your order: ${d.siteUrl}/order/${order.number}?e=${encodeURIComponent(order.email)}`);
}

export function orderShipped(d) {
  const { order } = d;
  const track = order.tracking_code ? `<p>Tracking code: <strong style="color:#fff">${esc(order.tracking_code)}</strong></p>` : '';
  return layout(d, `Order ${order.number} is on its way`,
    `<p>Your RYNSE pack has shipped.</p>${track}<p>Stay fresh. Anywhere.</p>`,
    `Your RYNSE pack has shipped.${order.tracking_code ? `\nTracking code: ${order.tracking_code}` : ''}\n\nStay fresh. Anywhere.`);
}

export function paymentFailed(d) {
  return layout(d, 'We could not process your renewal',
    `<p>The payment for your RYNSE subscription did not go through. Mollie will retry automatically over the next few days. If it keeps failing, your subscription will be cancelled and your loyalty status will reset — you can always start a new one.</p><p><a href="${esc(d.siteUrl)}/account" style="color:#E2C272">Manage your subscription</a></p>`,
    `The payment for your RYNSE subscription did not go through. Mollie will retry automatically over the next few days. If it keeps failing, your subscription will be cancelled and your loyalty status will reset.\n\nManage your subscription: ${d.siteUrl}/account`);
}

export function subscriptionCanceled(d) {
  return layout(d, 'Your subscription has been cancelled',
    `<p>Your RYNSE subscription is now cancelled and no further payments will be taken. Your loyalty status has been reset; a new subscription starts again at year 1.</p><p>Whenever you want back in: <a href="${esc(d.siteUrl)}" style="color:#E2C272">${esc(d.siteUrl.replace(/^https?:\/\//, ''))}</a></p>`,
    `Your RYNSE subscription is now cancelled and no further payments will be taken. Your loyalty status has been reset; a new subscription starts again at year 1.\n\n${d.siteUrl}`);
}

export function refundIssued(d) {
  return layout(d, `Refund for order ${d.order.number}`,
    `<p>We've refunded <strong style="color:#fff">${esc(formatMoney(d.amountCents))}</strong> to your original payment method. Depending on your bank it can take a few days to show up.</p>`,
    `We've refunded ${formatMoney(d.amountCents)} to your original payment method. Depending on your bank it can take a few days to show up.`);
}

export function magicLink(d) {
  return layout(d, 'Your RYNSE sign-in link',
    `<p>Tap the button to sign in. The link works once and expires in 15 minutes.</p><p><a href="${esc(d.link)}" style="display:inline-block;background:#E2C272;color:#0A1428;font-weight:700;padding:14px 22px;border-radius:4px;text-decoration:none">Sign in</a></p><p style="font-size:13px;color:#8A8FA3">If you didn't request this, you can ignore this e-mail.</p>`,
    `Sign in with this link (valid 15 minutes, works once):\n${d.link}\n\nIf you didn't request this, ignore this e-mail.`);
}

export function contactMessage(d) {
  return layout(d, `Contact form: ${d.name || d.fromEmail}`,
    `<p>From: ${esc(d.name)} &lt;${esc(d.fromEmail)}&gt;</p><p style="white-space:pre-wrap">${esc(d.message)}</p>`,
    `From: ${d.name} <${d.fromEmail}>\n\n${d.message}`);
}
