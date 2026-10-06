// Picks the payment provider implementation. Everything above this module only
// talks to the generic client interface (createPayment, getPayment, ...).
import { payments } from '../../config/commerce.js';
import { createMollieClient } from './mollie.js';
import { createEmulatorClient } from './emulator.js';

let client = null;

export function paymentProvider() {
  if (client) return client;
  if (payments.provider === 'mollie') {
    client = createMollieClient();
  } else if (payments.provider === 'emulator') {
    if (process.env.VERCEL_ENV === 'production' && process.env.ALLOW_EMULATOR_IN_PRODUCTION !== 'true') {
      throw new Error('PAYMENT_PROVIDER=emulator is not allowed in production. Set PAYMENT_PROVIDER=mollie and MOLLIE_API_KEY.');
    }
    client = createEmulatorClient();
  } else {
    throw new Error(`Unknown PAYMENT_PROVIDER "${payments.provider}" (expected "mollie" or "emulator")`);
  }
  return client;
}

export function resetPaymentProvider() { client = null; }
export const isEmulator = () => payments.provider === 'emulator';
