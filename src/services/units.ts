/**
 * Money units for the hosted MCP — the ONE place a dollar factor lives here.
 *
 * `*_microcents` columns (`budget_configs.limit_microcents`,
 * `budget_spending_cache.spent_microcents`, `llm_events.cost_microcents`) hold
 * MICRO-DOLLARS despite the name: dollars = value / 1e6. The gateway compares a
 * budget limit to spend directly, so every writer must use this scale. Mirrors
 * apps/web/lib/budgets/units.ts.
 *
 * Until round 8 (2026-10-02) this package used a factor 100x too large ("one
 * dollar = a hundred million microcents"): set_budget stored limits at 100x the
 * requested dollars, and every limit, spend and cost it printed read 1/100 of the
 * truth (N4).
 */
export const MICRODOLLARS_PER_DOLLAR = 1_000_000;

export function dollarsToMicrodollars(dollars: number): number {
  return Math.round(dollars * MICRODOLLARS_PER_DOLLAR);
}

export function microdollarsToDollars(microdollars: number): number {
  return microdollars / MICRODOLLARS_PER_DOLLAR;
}
