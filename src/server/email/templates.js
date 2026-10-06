// Transactional e-mail templates (HTML + text), localized (en/nl/es) via src/web/i18n.
// Simple, bulletproof markup: inline styles, navy + gold.
import { formatMoney } from '../../config/commerce.js';
import { translator, href, LOCALE_META } from '../../web/i18n/index.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tr = (d) => translator(d.locale || 'en');
const money = (cents, t) => formatMoney(cents, 'EUR', t.meta.numberLocale).replace(/ /g, ' ');

function layout(d, t, title, bodyHtml, bodyText) {
  const { brand, siteUrl } = d;
  const html = `<!doctype html><html lang="${t.meta.lang}"><body style="margin:0;background:#0A1428;font-family:Helvetica,Arial,sans-serif;color:#F3EEE2">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
  <div style="font-weight:900;letter-spacing:.08em;color:#E2C272;font-size:22px;margin-bottom:28px">${esc(brand.name)}</div>
  <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;color:#FFFFFF">${esc(title)}</h1>
  <div style="font-size:16px;line-height:1.6;color:#D9D2C2">${bodyHtml}</div>
  <p style="margin-top:36px;font-size:13px;color:#8A8FA3">${esc(t('brand.tagline'))} · <a href="${esc(siteUrl + href('/', t.locale))}" style="color:#E2C272">${esc(siteUrl.replace(/^https?:\/\//, ''))}</a> · ${esc(t('email.questions'))} <a href="mailto:${esc(brand.supportEmail)}" style="color:#E2C272">${esc(brand.supportEmail)}</a></p>
</div></body></html>`;
  const text = `${brand.name}\n\n${title}\n\n${bodyText}\n\n${t('brand.tagline')} · ${siteUrl}${href('/', t.locale)} · ${brand.supportEmail}`;
  return { subject: title, html, text };
}

const lines = (order, t) => {
  const rows = [
    [t('js.cart.line', { n: order.quantity }), money(order.subtotal_cents, t)],
    ...(order.discount_cents ? [[order.discount_label || t('email.line.discount'), `− ${money(order.discount_cents, t)}`]] : []),
    [t('email.line.shipping'), order.shipping_cents ? money(order.shipping_cents, t) : t('email.line.free')],
    [t('email.line.total'), money(order.total_cents, t)],
  ];
  const html = rows.map(([k, val]) => `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #1E2A47"><span>${esc(k)}</span><span style="color:#fff">${esc(val)}</span></div>`).join('');
  const text = rows.map(([k, val]) => `${k}: ${val}`).join('\n');
  return { html, text };
};

const address = (a) => [a.name, a.street, `${a.postalCode} ${a.city}`, a.country].filter(Boolean);

export function orderConfirmation(d) {
  const t = tr(d);
  const { order } = d;
  const l = lines(order, t);
  const addr = address(order.shipping_address);
  const track = `${d.siteUrl}${href(`/order/${order.number}`, t.locale)}?e=${encodeURIComponent(order.email)}`;
  const account = `${d.siteUrl}${href('/account', t.locale)}`;
  const isSub = order.order_type === 'subscription_first';
  const subHtml = isSub ? `<p>${esc(t('email.confirm.sub', { interval: d.interval }))} <a href="${esc(account)}" style="color:#E2C272">${esc(account.replace(/^https?:\/\//, ''))}</a></p>` : '';
  const subText = isSub ? `\n${t('email.confirm.sub', { interval: d.interval })} ${account}` : '';
  return layout(d, t, t('email.confirm.subject', { number: order.number }),
    `<p>${esc(t('email.confirm.body'))}</p>${l.html}<p style="margin-top:20px">${esc(t('email.confirm.shipTo'))}<br>${addr.map(esc).join('<br>')}</p>${subHtml}<p>${esc(t('email.confirm.track'))} <a href="${esc(track)}" style="color:#E2C272">${esc(track)}</a></p>`,
    `${t('email.confirm.body')}\n\n${l.text}\n\n${t('email.confirm.shipTo')}\n${addr.join('\n')}${subText}\n\n${t('email.confirm.track')} ${track}`);
}

export function orderShipped(d) {
  const t = tr(d);
  const { order } = d;
  const track = order.tracking_code ? `<p>${esc(t('email.shipped.tracking'))} <strong style="color:#fff">${esc(order.tracking_code)}</strong></p>` : '';
  return layout(d, t, t('email.shipped.subject', { number: order.number }),
    `<p>${esc(t('email.shipped.body'))}</p>${track}<p>${esc(t('brand.tagline'))}</p>`,
    `${t('email.shipped.body')}${order.tracking_code ? `\n${t('email.shipped.tracking')} ${order.tracking_code}` : ''}\n\n${t('brand.tagline')}`);
}

export function paymentFailed(d) {
  const t = tr(d);
  const account = `${d.siteUrl}${href('/account', t.locale)}`;
  return layout(d, t, t('email.failed.subject'),
    `<p>${esc(t('email.failed.body'))}</p><p><a href="${esc(account)}" style="color:#E2C272">${esc(t('email.failed.manage'))}</a></p>`,
    `${t('email.failed.body')}\n\n${t('email.failed.manage')}: ${account}`);
}

export function subscriptionCanceled(d) {
  const t = tr(d);
  const home = `${d.siteUrl}${href('/', t.locale)}`;
  return layout(d, t, t('email.canceled.subject'),
    `<p>${esc(t('email.canceled.body'))}</p><p>${esc(t('email.canceled.back'))} <a href="${esc(home)}" style="color:#E2C272">${esc(home.replace(/^https?:\/\//, ''))}</a></p>`,
    `${t('email.canceled.body')}\n\n${t('email.canceled.back')} ${home}`);
}

export function refundIssued(d) {
  const t = tr(d);
  return layout(d, t, t('email.refund.subject', { number: d.order.number }),
    `<p>${esc(t('email.refund.body', { amount: money(d.amountCents, t) }))}</p>`,
    t('email.refund.body', { amount: money(d.amountCents, t) }));
}

export function magicLink(d) {
  const t = tr(d);
  return layout(d, t, t('email.magic.subject'),
    `<p>${esc(t('email.magic.body'))}</p><p><a href="${esc(d.link)}" style="display:inline-block;background:#E2C272;color:#0A1428;font-weight:700;padding:14px 22px;border-radius:4px;text-decoration:none">${esc(t('email.magic.button'))}</a></p><p style="font-size:13px;color:#8A8FA3">${esc(t('email.magic.ignore'))}</p>`,
    `${t('email.magic.body')}\n${d.link}\n\n${t('email.magic.ignore')}`);
}

export function contactMessage(d) {
  const t = translator('en');
  return layout(d, t, `Contact form: ${d.name || d.fromEmail}`,
    `<p>From: ${esc(d.name)} &lt;${esc(d.fromEmail)}&gt;</p><p style="white-space:pre-wrap">${esc(d.message)}</p>`,
    `From: ${d.name} <${d.fromEmail}>\n\n${d.message}`);
}

export const emailLocales = LOCALE_META;
