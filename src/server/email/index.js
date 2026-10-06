// Transactional e-mail with a dedupe log so webhook retries never send twice.
// Transport: EMAIL_PROVIDER=resend (REST, no SDK) or log (default in dev).
import { getSql } from '../db.js';
import { brand, site } from '../../config/commerce.js';
import * as templates from './templates.js';
import { intervalLabel, pickLocale } from '../../web/i18n/index.js';
import { subscription } from '../../config/commerce.js';

async function sendViaResend({ to, subject, html, text }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const from = process.env.EMAIL_FROM || `${brand.name} <${brand.supportEmail}>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html, text, reply_to: brand.supportEmail }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${data?.message || 'unknown'}`);
  return data.id || null;
}

async function sendViaLog({ to, subject, text }) {
  if (process.env.NODE_ENV !== 'test') console.log(`[email → ${to}] ${subject}\n${text}\n`);
  return `log_${Date.now()}`;
}

const transports = { resend: sendViaResend, log: sendViaLog };

/**
 * Send an e-mail exactly once per dedupeKey.
 * Returns true when sent, false when it was already sent before.
 */
export async function sendOnce(dedupeKey, templateName, data) {
  const sql = getSql();
  const tpl = templates[templateName];
  if (!tpl) throw new Error(`Unknown e-mail template ${templateName}`);
  // Language: explicit, else the customer's stored preference, else English.
  let locale = pickLocale(data.locale);
  if (!locale && data.to) {
    const [c] = await sql`SELECT locale FROM customers WHERE email = ${data.to}`;
    locale = pickLocale(c?.locale) || 'en';
  }
  locale = locale || 'en';
  const msg = tpl({ ...data, locale, interval: intervalLabel(locale, data.interval || subscription.interval), brand, siteUrl: site.baseUrl });
  const provider = process.env.EMAIL_PROVIDER || 'log';
  const transport = transports[provider];
  if (!transport) throw new Error(`Unknown EMAIL_PROVIDER ${provider}`);

  // Reserve the key first (unique constraint = idempotency across concurrent webhooks).
  const [reserved] = await sql`
    INSERT INTO email_log (dedupe_key, to_email, template, status)
    VALUES (${dedupeKey}, ${data.to}, ${templateName}, 'sending')
    ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`;
  if (!reserved) return false;
  try {
    const providerId = await transport({ to: data.to, ...msg });
    await sql`UPDATE email_log SET status = 'sent', provider_id = ${providerId} WHERE id = ${reserved.id}`;
    return true;
  } catch (err) {
    // Free the key so a later retry can send it.
    await sql`DELETE FROM email_log WHERE id = ${reserved.id}`;
    throw err;
  }
}
