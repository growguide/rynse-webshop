/* RYNSE contact form */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const R = window.RYNSE; const form = $('[data-contact-form]'); if (!R || !form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('[data-form-error]', form), ok = $('[data-form-ok]', form); err.hidden = true; ok.hidden = true;
    let valid = true;
    for (const f of form.querySelectorAll('.field')) { const i = f.querySelector('input,textarea'); const v = i.checkValidity(); f.classList.toggle('has-error', !v); if (!v) valid = false; }
    if (!valid) return;
    const btn = $('button[type=submit]', form); btn.setAttribute('aria-busy', 'true');
    try { await R.api('/api/contact', { name: form.elements.name.value, email: form.elements.email.value, message: form.elements.message.value, website: form.elements.website.value }); ok.hidden = false; form.reset(); }
    catch (ex) { err.textContent = ex.message; err.hidden = false; } finally { btn.removeAttribute('aria-busy'); }
  });
})();
