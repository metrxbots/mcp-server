/**
 * Microcents conversion regression tests.
 *
 * Pins the unit convention so the 100× bug fixed in v0.2.4 cannot silently come back.
 * Convention: 1 cent = 10,000 microcents → 1 dollar = 1,000,000 microcents.
 * Source of truth: apps/gateway/src/cost.ts (agentledger).
 */

import { describe, it, expect } from 'vitest';
import { formatMicrocents, formatCents, formatPct } from './formatters.js';

describe('formatMicrocents — unit convention', () => {
  it('1_000_000 microcents == $1.00', () => {
    expect(formatMicrocents(1_000_000)).toBe('$1.00');
  });

  it('50_000_000 microcents == $50.00 (matches preview monthly budget in agentledger)', () => {
    expect(formatMicrocents(50_000_000)).toBe('$50.00');
  });

  it('0 microcents == $0.00', () => {
    expect(formatMicrocents(0)).toBe('$0.00');
  });

  it('1 microcent rounds to $0.00', () => {
    expect(formatMicrocents(1)).toBe('$0.00');
  });

  it('does NOT use the 100_000_000 divisor (the bug fixed in 0.2.4)', () => {
    // Pre-fix, this returned '$0.01'. Post-fix it returns '$1.00'.
    expect(formatMicrocents(1_000_000)).not.toBe('$0.01');
  });
});

describe('formatCents', () => {
  it('100 cents == $1.00', () => {
    expect(formatCents(100)).toBe('$1.00');
  });
  it('4500 cents == $45.00', () => {
    expect(formatCents(4500)).toBe('$45.00');
  });
});

describe('formatPct', () => {
  it('0.25 -> "25.0%" by default', () => {
    expect(formatPct(0.25)).toBe('25.0%');
  });
  it('respects decimals arg', () => {
    expect(formatPct(0.1234, 2)).toBe('12.34%');
  });
});
