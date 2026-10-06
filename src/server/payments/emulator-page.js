// Fake hosted checkout page for the payment emulator (mirrors Mollie's test-mode
// status selector). Only reachable when PAYMENT_PROVIDER=emulator.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function emulatorCheckoutPage(p) {
  const statuses = ['paid', 'failed', 'canceled', 'expired', 'pending'];
  const methods = ['ideal', 'creditcard', 'applepay'];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment emulator — ${esc(p.id)}</title>
<style>body{font-family:system-ui,sans-serif;background:#f4f5f7;color:#111;margin:0;padding:24px}main{max-width:460px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;box-shadow:0 10px 30px rgba(0,0,0,.08)}h1{font-size:18px;margin:0 0 4px}p{color:#555;font-size:14px}.amt{font-size:28px;font-weight:700;margin:12px 0}label{display:block;font-size:13px;color:#333;margin:14px 0 6px}select,button{width:100%;font:inherit;padding:12px;border-radius:8px;border:1px solid #d0d4da}button{background:#111;color:#fff;border:0;margin-top:18px;cursor:pointer}.tag{display:inline-block;font-size:11px;background:#fff3cd;color:#7a5a00;padding:3px 8px;border-radius:99px;margin-bottom:12px}code{font-size:12px;color:#666}</style></head>
<body><main><span class="tag">PAYMENT EMULATOR — not a real payment</span>
<h1>${esc(p.description)}</h1><p><code>${esc(p.id)}</code> · sequence: ${esc(p.sequenceType)} · status now: <strong>${esc(p.status)}</strong></p>
<div class="amt">€ ${esc(p.amount.value)}</div>
<form method="post" action="/api/emulator/checkout">
<input type="hidden" name="id" value="${esc(p.id)}">
<label>Payment method</label><select name="method">${methods.map((m) => `<option value="${m}" ${p.method === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
<label>Resulting status</label><select name="status">${statuses.map((s) => `<option value="${s}">${s}</option>`).join('')}</select>
<label>Webhook timing</label><select name="webhookDelay"><option value="0">before redirect (normal)</option><option value="4000">4 s after redirect (late webhook)</option><option value="20000">20 s after redirect</option></select>
<button type="submit">Continue</button>
</form>
<p style="margin-top:18px">This page stands in for Mollie's hosted checkout. In test mode Mollie shows a similar status selector; in live mode the customer pays for real.</p>
</main></body></html>`;
}
