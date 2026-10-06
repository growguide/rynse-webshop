// Server-side pricing. The browser only ever sends {mode, quantity}; every amount
// is computed here from src/config/commerce.js and snapshotted on the order.
import { product, shipping, subscription, loyalty, applyPct } from '../config/commerce.js';
import { HttpError } from './http.js';
import { discountPctForLevel } from './loyalty.js';

export const MODES = ['one_time', 'subscription'];

/**
 * @param {object} input
 * @param {'one_time'|'subscription'} input.mode
 * @param {number} input.quantity
 * @param {number} [input.loyaltyLevel]  current level for renewals (1 = first year)
 * @param {string} [input.country]
 */
export function quote({ mode, quantity, loyaltyLevel = 1, country = shipping.defaultCountry }) {
  if (!MODES.includes(mode)) throw new HttpError(400, 'Invalid purchase mode');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > product.maxQuantity) {
    throw new HttpError(400, `Quantity must be between 1 and ${product.maxQuantity}`);
  }
  if (!shipping.countries.includes(country)) throw new HttpError(400, 'We do not ship to this country yet');

  const unitPriceCents = product.priceCents;
  const subtotalCents = unitPriceCents * quantity;

  let discountCents = 0;
  let discountLabel = null;
  let discountPct = 0;
  if (mode === 'subscription' && subscription.enabled) {
    // Base subscription discount + loyalty level discount are both expressed as
    // percentages of the one-time price; the higher one applies (they do not stack),
    // so a loyalty tier always has to beat the base discount to mean something.
    const basePct = subscription.discountPct || 0;
    const loyaltyPct = loyalty.enabled ? discountPctForLevel(loyaltyLevel) || 0 : 0;
    discountPct = Math.max(basePct, loyaltyPct);
    if (discountPct > 0) {
      discountCents = subtotalCents - applyPct(subtotalCents, discountPct);
      discountLabel = loyaltyPct > basePct ? `Loyalty year ${loyaltyLevel} (${discountPct}%)` : `Subscriber price (${discountPct}%)`;
    }
  }

  const afterDiscount = subtotalCents - discountCents;
  let shippingCents = shipping.costCents;
  if (mode === 'subscription' && shipping.subscriptionShipsFree) shippingCents = 0;
  else if (afterDiscount >= shipping.freeShippingThresholdCents) shippingCents = 0;

  const totalCents = afterDiscount + shippingCents;
  // Prices are VAT-inclusive (consumer pricing); VAT portion for the invoice:
  const vatCents = Math.round(totalCents - totalCents / (1 + product.vatRatePct / 100));

  return {
    mode,
    quantity,
    currency: product.currency,
    unitPriceCents,
    subtotalCents,
    discountCents,
    discountPct,
    discountLabel,
    shippingCents,
    totalCents,
    vatCents,
    vatRatePct: product.vatRatePct,
    loyaltyLevel: mode === 'subscription' ? loyaltyLevel : null,
    interval: mode === 'subscription' ? subscription.interval : null,
    freeShippingThresholdCents: shipping.freeShippingThresholdCents,
    snapshot: {
      sku: product.sku,
      priceCents: product.priceCents,
      shippingCents: shipping.costCents,
      freeShippingThresholdCents: shipping.freeShippingThresholdCents,
      subscriptionDiscountPct: subscription.discountPct,
      loyaltyLevels: loyalty.levels,
      interval: subscription.interval,
      quotedAt: new Date().toISOString(),
    },
  };
}

/** Mollie wants amounts as decimal strings with two decimals. */
export const centsToMollie = (cents) => (cents / 100).toFixed(2);
export const mollieToCents = (value) => Math.round(Number.parseFloat(value) * 100);
