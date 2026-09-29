import { SecurityPosition } from '../src/rebalancing.types';

/**
 * Shared test data for the Portfolio Rebalancing Engine automated suite
 * (`rebalancing.spec.ts`). Kept separate from the spec file so the test
 * bodies stay focused on behavior/assertions, while fixture setup lives here.
 */

/** The baseline 5-security portfolio used by most scenarios (Account-ABC, $100K, see testScenarios.md). */
export const baselinePortfolio: SecurityPosition[] = [
  { ticker: 'IBM', targetPct: 20, currentPct: 10, targetVariancePct: -10, unitPrice: 150 },
  { ticker: 'MSFT', targetPct: 20, currentPct: 20, targetVariancePct: 0, unitPrice: 90 },
  { ticker: 'ORCL', targetPct: 20, currentPct: 30, targetVariancePct: 10, unitPrice: 220 },
  { ticker: 'AAPL', targetPct: 20, currentPct: 20, targetVariancePct: 0, unitPrice: 450 },
  { ticker: 'HD', targetPct: 20, currentPct: 20, targetVariancePct: 0, unitPrice: 70 },
];

/**
 * Builds a valid 2-security portfolio where the "subject" security has the given
 * currentPct/targetPct, and a "filler" security absorbs the remainder so both the
 * Current % and Target % totals still sum to 100% (a portfolio-level requirement).
 * Used for single-security lifecycle scenarios (liquidation, new entry, etc.).
 */
export function buildTwoSecurityPortfolio(subject: {
  ticker: string;
  currentPct: number;
  targetPct: number;
  unitPrice: number;
}): SecurityPosition[] {
  return [
    {
      ticker: subject.ticker,
      currentPct: subject.currentPct,
      targetPct: subject.targetPct,
      targetVariancePct: subject.currentPct - subject.targetPct,
      unitPrice: subject.unitPrice,
    },
    {
      ticker: 'FILLER',
      currentPct: 100 - subject.currentPct,
      targetPct: 100 - subject.targetPct,
      targetVariancePct: (100 - subject.currentPct) - (100 - subject.targetPct),
      unitPrice: 100,
    },
  ];
}
