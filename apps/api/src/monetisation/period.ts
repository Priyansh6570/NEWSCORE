import type { PlanInterval } from './plan.schema';

/**
 * The end of a billing period that starts at `from` and runs for one `interval`.
 * Uses calendar arithmetic (a month/year later on the same day), with JS Date
 * roll-over handling the short-month edge cases.
 */
export function periodEnd(from: Date, interval: PlanInterval): Date {
  const end = new Date(from);
  if (interval === 'month') end.setMonth(end.getMonth() + 1);
  else end.setFullYear(end.getFullYear() + 1);
  return end;
}
