/**
 * Loyalty engine — pure functions, no UI, no DB.
 *
 * Rules (from the brief):
 *  - A subscriber earns a yearly increasing benefit for every full year the
 *    subscription has been *uninterrupted* and active.
 *  - The benefit exists only while the subscription is active.
 *  - Cancellation resets the loyalty status.
 *  - A new subscription later starts again at year 1.
 *
 * Percentages per level are configured centrally (LOYALTY_YEAR_n_DISCOUNT) and
 * may be null while undecided; null is treated as "no discount yet".
 */
import { loyalty } from '../config/commerce.js';

const DAY = 24 * 60 * 60 * 1000;

/** Whole years completed between two dates (calendar aware). */
export function fullYearsBetween(start, now = new Date()) {
  const s = new Date(start);
  const n = new Date(now);
  if (Number.isNaN(s.getTime()) || n < s) return 0;
  let years = n.getUTCFullYear() - s.getUTCFullYear();
  const anniversary = new Date(Date.UTC(s.getUTCFullYear() + years, s.getUTCMonth(), s.getUTCDate()));
  if (n < anniversary) years -= 1;
  return Math.max(0, years);
}

/** Loyalty level for a subscription record. Level 1 = first year. */
export function levelFor(sub, now = new Date()) {
  if (!sub || !loyalty.enabled) return 1;
  if (!sub.loyalty_start_date || ['canceled', 'completed'].includes(sub.status)) return 1;
  const years = fullYearsBetween(sub.loyalty_start_date, now);
  const maxLevel = loyalty.levels[loyalty.levels.length - 1].year;
  return Math.min(years + 1, maxLevel);
}

export function discountPctForLevel(level) {
  const lv = loyalty.levels.find((l) => l.year === level) || loyalty.levels[loyalty.levels.length - 1];
  return lv ? lv.discountPct : null;
}

/** Days until the next loyalty level (for the account page). */
export function daysToNextLevel(sub, now = new Date()) {
  if (!sub?.loyalty_start_date) return null;
  const level = levelFor(sub, now);
  const maxLevel = loyalty.levels[loyalty.levels.length - 1].year;
  if (level >= maxLevel) return null;
  const s = new Date(sub.loyalty_start_date);
  const next = new Date(Date.UTC(s.getUTCFullYear() + level, s.getUTCMonth(), s.getUTCDate()));
  return Math.max(0, Math.ceil((next - new Date(now)) / DAY));
}

/**
 * State transitions. Each returns the patch to apply to the subscription row
 * plus a history entry, so the caller (subscriptions.js) persists it in one update.
 */
export function onSubscriptionActivated(sub, at = new Date()) {
  // Starting a new streak only if there is none (re-activation after cancel = new subscription row anyway).
  const start = sub.loyalty_start_date || at.toISOString().slice(0, 10);
  return {
    patch: { loyalty_start_date: start, loyalty_level: levelFor({ ...sub, loyalty_start_date: start, status: 'active' }, at) },
    history: { event: 'activated', at: at.toISOString(), level: 1 },
  };
}

export function onSubscriptionRenewed(sub, at = new Date()) {
  const level = levelFor({ ...sub, status: 'active' }, at);
  return {
    patch: { loyalty_level: level },
    history: { event: 'renewed', at: at.toISOString(), level },
  };
}

export function onSubscriptionCanceled(sub, at = new Date(), reason = 'customer') {
  return {
    patch: { loyalty_start_date: null, loyalty_level: 1, status: 'canceled', canceled_at: at.toISOString(), cancel_reason: reason },
    history: { event: 'canceled', at: at.toISOString(), level: 1, reason },
  };
}

/** Public summary used by the account page / UI. */
export function summary(sub, now = new Date()) {
  const level = levelFor(sub, now);
  const pct = discountPctForLevel(level);
  return {
    enabled: loyalty.enabled,
    active: !!sub && sub.status === 'active' && !!sub.loyalty_start_date,
    level,
    label: (loyalty.levels.find((l) => l.year === level) || {}).label || `Year ${level}`,
    discountPct: pct,
    sinceDate: sub?.loyalty_start_date || null,
    daysToNextLevel: daysToNextLevel(sub, now),
    levels: loyalty.levels,
  };
}
