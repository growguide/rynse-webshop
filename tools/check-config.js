#!/usr/bin/env node
// Build-time guard: lists placeholder commercial values; refuses a production
// deploy while any remain or while payments would not run against Mollie.
import { placeholders, payments, site } from '../src/config/commerce.js';

const strict = process.argv.includes('--strict');
const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
const problems = [];

if (placeholders.length) {
  console.log('Placeholder values still in use (set the environment variable to make them final):');
  for (const p of placeholders) console.log(`  • ${p.key}${p.value !== null && p.value !== undefined ? ` = ${JSON.stringify(p.value)}` : ''} — ${p.note}`);
}
if (isProd || strict) {
  for (const p of placeholders) {
    // Loyalty / subscription percentages may legitimately stay undecided (UI hides them); everything else must be final.
    if (['LOYALTY_YEAR_n_DISCOUNT', 'RYNSE_SUBSCRIPTION_DISCOUNT_PCT'].includes(p.key)) continue;
    problems.push(`${p.key} is still a placeholder (${p.note})`);
  }
  if (payments.provider !== 'mollie') problems.push('PAYMENT_PROVIDER must be "mollie" in production');
  if (payments.provider === 'mollie' && !payments.mollie.apiKey) problems.push('MOLLIE_API_KEY is not set');
  if (payments.provider === 'mollie' && isProd && !payments.mollie.apiKey.startsWith('live_')) problems.push('MOLLIE_API_KEY is a test key — production needs a live_ key');
  if (!/^https:\/\//.test(site.baseUrl)) problems.push(`SITE_URL must be a public https URL (now: ${site.baseUrl})`);
  for (const v of ['DATABASE_URL', 'SESSION_SECRET', 'ADMIN_TOKEN', 'CRON_SECRET']) if (!process.env[v]) problems.push(`${v} is not set`);
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 32) problems.push('SESSION_SECRET must be at least 32 characters');
  if ((process.env.EMAIL_PROVIDER || 'log') === 'log') problems.push('EMAIL_PROVIDER is "log" — customers would not receive e-mails (set resend + RESEND_API_KEY + EMAIL_FROM)');
}
if (problems.length) {
  console.error('\nConfiguration is not production-ready:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  if (isProd || strict) { console.error('\nFix the items above (see docs/CONFIGURATION.md) or deploy to a preview environment.'); process.exit(1); }
}
if (!placeholders.length && !problems.length) console.log('Configuration check passed.');
