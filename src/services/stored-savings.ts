/**
 * The org's stored savings estimate, read the one way every surface reads it
 * (savings definition v2, plan 2026-10-12 §4.2): GET /dashboard/suggestions
 * `total_savings_cents` = Σ of every agent's CURRENT stored monthly total.
 *
 * GET /dashboard has never returned an `optimization` block, so the tools that
 * read `summary.optimization?.total_savings_cents ?? 0` printed $0.00 for every
 * org. Missing is not zero: a null total carries the reason instead.
 */
import type { MetrxApiClient } from './api-client.js';
import type { FleetSuggestionsResult } from '../types.js';

export interface StoredSavingsRead {
  /** Monthly cents; null = no current estimate (render the reason, never $0). */
  total_cents: number | null;
  suggestion_count: number | null;
  reason: string | null;
}

export async function readStoredSavingsTotal(
  client: Pick<MetrxApiClient, 'get'>
): Promise<StoredSavingsRead> {
  const res = await client.get<FleetSuggestionsResult>('/dashboard/suggestions');
  if (res.error || !res.data) {
    return {
      total_cents: null,
      suggestion_count: null,
      reason: `savings could not be read (${res.error ?? 'empty response'})`,
    };
  }
  const d = res.data;
  const total =
    typeof d.total_savings_cents === 'number' && Number.isFinite(d.total_savings_cents)
      ? d.total_savings_cents
      : null;
  const count =
    typeof d.suggestion_count === 'number'
      ? d.suggestion_count
      : Array.isArray(d.suggestions)
        ? d.suggestions.length
        : null;
  let reason: string | null = null;
  if (total === null) {
    reason =
      (d.recalculating_agent_count ?? 0) > 0
        ? 'savings are being recalculated under the current definition'
        : 'no current savings estimate (no recent activity or no analysis yet)';
  }
  return { total_cents: total, suggestion_count: count, reason };
}
