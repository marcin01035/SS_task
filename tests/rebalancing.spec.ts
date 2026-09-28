import { test, expect } from '@playwright/test';
import { RebalancingCalculator } from '../src/RebalancingCalculator';
import { SecurityPosition, RebalanceConfig } from '../src/rebalancing.types';

/**
 * Automated regression suite for the Portfolio Rebalancing Engine.
 *
 * This file is the coded, executable counterpart of the Manual Test Scenarios
 * documented in `testScenarios.md`. Test titles and grouping intentionally mirror
 * that document 1:1 (same TC-MAN-xxx IDs, same four priority tiers: Critical, High,
 * Medium, Low, ordered most- to least-important) so a reviewer can cross-reference
 * a manual scenario to its automated test directly by ID.
 *
 * These tests exercise pure calculation logic and do not require a browser page.
 */

const baselinePortfolio: SecurityPosition[] = [
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
function buildTwoSecurityPortfolio(subject: {
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

test.describe('Critical Priority', () => {
  test('TC-MAN-001: Baseline Portfolio Rebalancing (fractional mode)', () => {
    const config: RebalanceConfig = { totalAssets: 100000, allowFractional: true };
    const results = RebalancingCalculator.calculateRebalanceInstructions(baselinePortfolio, config);

    expect(results.find(r => r.ticker === 'IBM')!.sharesToTrade).toBe(66.67);
    expect(results.find(r => r.ticker === 'IBM')!.action).toBe('BUY');

    expect(results.find(r => r.ticker === 'ORCL')!.sharesToTrade).toBe(-45.45);
    expect(results.find(r => r.ticker === 'ORCL')!.action).toBe('SELL');

    for (const ticker of ['MSFT', 'AAPL', 'HD']) {
      expect(results.find(r => r.ticker === ticker)!.sharesToTrade).toBe(0);
      expect(results.find(r => r.ticker === ticker)!.action).toBe('HOLD');
    }
  });

  test('TC-MAN-001b: Baseline Portfolio Rebalancing (whole-share mode)', () => {
    const config: RebalanceConfig = { totalAssets: 100000, allowFractional: false };
    const results = RebalancingCalculator.calculateRebalanceInstructions(baselinePortfolio, config);

    expect(results.find(r => r.ticker === 'IBM')!.sharesToTrade).toBe(66);
    expect(results.find(r => r.ticker === 'ORCL')!.sharesToTrade).toBe(-45);
  });

  test('TC-MAN-002: Single Asset Rebalancing computes correct buy/sell shares', () => {
    const portfolio: SecurityPosition[] = [
      { ticker: 'A', targetPct: 50, currentPct: 80, targetVariancePct: 30, unitPrice: 100 },
      { ticker: 'B', targetPct: 50, currentPct: 20, targetVariancePct: -30, unitPrice: 50 },
    ];
    const config: RebalanceConfig = { totalAssets: 10000, allowFractional: true };
    const results = RebalancingCalculator.calculateRebalanceInstructions(portfolio, config);

    expect(results.find(r => r.ticker === 'A')!.sharesToTrade).toBe(-30);
    expect(results.find(r => r.ticker === 'B')!.sharesToTrade).toBe(60);
  });

  test('TC-MAN-003: Zero Market Unit Price is rejected', () => {
    const portfolio: SecurityPosition[] = [{ ticker: 'IBM', targetPct: 100, currentPct: 100, targetVariancePct: 0, unitPrice: 0 }];
    const config: RebalanceConfig = { totalAssets: 100000, allowFractional: true };

    expect(() => RebalancingCalculator.calculateRebalanceInstructions(portfolio, config)).toThrow(
      'Invalid Unit Price for IBM: 0'
    );
  });

  test('TC-MAN-004: Value Conservation Across Trades — total BUY value equals total SELL value', () => {
    const config: RebalanceConfig = { totalAssets: 100000, allowFractional: true };
    const results = RebalancingCalculator.calculateRebalanceInstructions(baselinePortfolio, config);

    const buyValue = results
      .filter(r => r.sharesToTrade > 0)
      .reduce((sum, r) => sum + r.tradeValue, 0);
    const sellValue = results
      .filter(r => r.sharesToTrade < 0)
      .reduce((sum, r) => sum + Math.abs(r.tradeValue), 0);

    expect(buyValue).toBeCloseTo(sellValue, 2);
    expect(buyValue).toBeCloseTo(10000, 2);
  });

  test('TC-MAN-005: Position Liquidation (selling to zero) computes full sell trade', () => {
    const portfolio = buildTwoSecurityPortfolio({ ticker: 'ORCL', currentPct: 20, targetPct: 0, unitPrice: 220 });
    const fractionalConfig: RebalanceConfig = { totalAssets: 100000, allowFractional: true };
    const wholeConfig: RebalanceConfig = { totalAssets: 100000, allowFractional: false };

    const fractionalResults = RebalancingCalculator.calculateRebalanceInstructions(portfolio, fractionalConfig);
    const wholeResults = RebalancingCalculator.calculateRebalanceInstructions(portfolio, wholeConfig);

    expect(fractionalResults.find(r => r.ticker === 'ORCL')!.sharesToTrade).toBe(-90.91);
    expect(wholeResults.find(r => r.ticker === 'ORCL')!.sharesToTrade).toBe(-90);
  });

  test('TC-MAN-006: New Position Entry (buying from zero) computes full buy trade', () => {
    const portfolio = buildTwoSecurityPortfolio({ ticker: 'IBM', currentPct: 0, targetPct: 20, unitPrice: 150 });
    const fractionalConfig: RebalanceConfig = { totalAssets: 100000, allowFractional: true };
    const wholeConfig: RebalanceConfig = { totalAssets: 100000, allowFractional: false };

    const fractionalResults = RebalancingCalculator.calculateRebalanceInstructions(portfolio, fractionalConfig);
    const wholeResults = RebalancingCalculator.calculateRebalanceInstructions(portfolio, wholeConfig);

    expect(fractionalResults.find(r => r.ticker === 'IBM')!.sharesToTrade).toBe(133.33);
    expect(wholeResults.find(r => r.ticker === 'IBM')!.sharesToTrade).toBe(133);
  });

  test('TC-MAN-007: Total Reallocation (100% shift) liquidates A and fully allocates B without errors', () => {
    const portfolio: SecurityPosition[] = [
      { ticker: 'A', currentPct: 100, targetPct: 0, targetVariancePct: 100, unitPrice: 50 },
      { ticker: 'B', currentPct: 0, targetPct: 100, targetVariancePct: -100, unitPrice: 25 },
    ];
    const config: RebalanceConfig = { totalAssets: 100000, allowFractional: true };

    const results = RebalancingCalculator.calculateRebalanceInstructions(portfolio, config);

    expect(results.find(r => r.ticker === 'A')!.sharesToTrade).toBe(-2000); // sells all $100,000 worth at $50/share
    expect(results.find(r => r.ticker === 'B')!.sharesToTrade).toBe(4000); // buys all $100,000 worth at $25/share
  });

  test('TC-MAN-008: Missing/undefined numerical field is rejected, not silently NaN', () => {
    const portfolio = [
      { ticker: 'IBM', currentPct: 100, targetPct: 100, targetVariancePct: 0, unitPrice: undefined },
    ] as unknown as SecurityPosition[];
    const config: RebalanceConfig = { totalAssets: 100000, allowFractional: true };

    expect(() => RebalancingCalculator.calculateRebalanceInstructions(portfolio, config)).toThrow(
      'Invalid Unit Price for IBM: undefined'
    );
  });

  test('TC-MAN-009: Non-numeric string data is rejected, not silently miscalculated', () => {
    const portfolio = [
      { ticker: 'IBM', currentPct: 100, targetPct: 100, targetVariancePct: 0, unitPrice: 'ABC' },
    ] as unknown as SecurityPosition[];
    const config: RebalanceConfig = { totalAssets: 100000, allowFractional: true };

    expect(() => RebalancingCalculator.calculateRebalanceInstructions(portfolio, config)).toThrow(
      'Invalid Unit Price for IBM: ABC'
    );
  });
});

test.describe('High Priority', () => {
  test('TC-MAN-010: Fully Balanced Portfolio yields zero trades for every security', () => {
    const balanced: SecurityPosition[] = baselinePortfolio.map(p => ({ ...p, currentPct: p.targetPct, targetVariancePct: 0 }));
    const config: RebalanceConfig = { totalAssets: 100000, allowFractional: true };
    const results = RebalancingCalculator.calculateRebalanceInstructions(balanced, config);

    for (const r of results) {
      expect(r.sharesToTrade).toBe(0);
      expect(r.action).toBe('HOLD');
    }
  });

  test('TC-MAN-011: Target Allocation Mismatch is rejected', () => {
    const portfolio: SecurityPosition[] = [
      { ticker: 'IBM', targetPct: 30, currentPct: 20, targetVariancePct: -10, unitPrice: 150 },
      { ticker: 'MSFT', targetPct: 20, currentPct: 20, targetVariancePct: 0, unitPrice: 90 },
      { ticker: 'ORCL', targetPct: 20, currentPct: 20, targetVariancePct: 0, unitPrice: 220 },
      { ticker: 'AAPL', targetPct: 20, currentPct: 20, targetVariancePct: 0, unitPrice: 450 },
      { ticker: 'HD', targetPct: 20, currentPct: 20, targetVariancePct: 0, unitPrice: 70 },
    ];
    const config: RebalanceConfig = { totalAssets: 100000, allowFractional: true };

    expect(() => RebalancingCalculator.calculateRebalanceInstructions(portfolio, config)).toThrow(
      'Total Target % must equal 100%'
    );
  });

  test('TC-MAN-012: Current Allocation Mismatch is rejected', () => {
    const portfolio: SecurityPosition[] = [
      { ticker: 'IBM', targetPct: 20, currentPct: 15, targetVariancePct: -5, unitPrice: 150 },
      { ticker: 'MSFT', targetPct: 20, currentPct: 20, targetVariancePct: 0, unitPrice: 90 },
      { ticker: 'ORCL', targetPct: 20, currentPct: 20, targetVariancePct: 0, unitPrice: 220 },
      { ticker: 'AAPL', targetPct: 20, currentPct: 20, targetVariancePct: 0, unitPrice: 450 },
      { ticker: 'HD', targetPct: 20, currentPct: 20, targetVariancePct: 0, unitPrice: 70 },
    ];
    const config: RebalanceConfig = { totalAssets: 100000, allowFractional: true };

    expect(() => RebalancingCalculator.calculateRebalanceInstructions(portfolio, config)).toThrow(
      'Total Current % must equal 100%'
    );
  });

  test('TC-MAN-013: Negative Unit Price is rejected', () => {
    const portfolio: SecurityPosition[] = [{ ticker: 'IBM', targetPct: 100, currentPct: 100, targetVariancePct: 0, unitPrice: -50 }];
    const config: RebalanceConfig = { totalAssets: 100000, allowFractional: true };

    expect(() => RebalancingCalculator.calculateRebalanceInstructions(portfolio, config)).toThrow(
      'Invalid Unit Price for IBM: -50'
    );
  });

  test('TC-MAN-014: Negative Total Asset Value is rejected', () => {
    const config: RebalanceConfig = { totalAssets: -1000, allowFractional: true };

    expect(() => RebalancingCalculator.calculateRebalanceInstructions(baselinePortfolio, config)).toThrow(
      'Total Asset must not be negative'
    );
  });

  test('TC-MAN-015: Invalid Individual Percentage (out of range) is rejected even if totals are valid', () => {
    const portfolio: SecurityPosition[] = [
      { ticker: 'IBM', targetPct: 20, currentPct: -5, targetVariancePct: -25, unitPrice: 150 },
      { ticker: 'MSFT', targetPct: 20, currentPct: 20, targetVariancePct: 0, unitPrice: 90 },
      { ticker: 'ORCL', targetPct: 20, currentPct: 35, targetVariancePct: 15, unitPrice: 220 },
      { ticker: 'AAPL', targetPct: 20, currentPct: 20, targetVariancePct: 0, unitPrice: 450 },
      { ticker: 'HD', targetPct: 20, currentPct: 30, targetVariancePct: 10, unitPrice: 70 },
    ];
    const config: RebalanceConfig = { totalAssets: 100000, allowFractional: true };

    expect(() => RebalancingCalculator.calculateRebalanceInstructions(portfolio, config)).toThrow(
      'Current % for IBM must be between 0 and 100'
    );
  });

  test('TC-MAN-016: Empty Portfolio is rejected', () => {
    const config: RebalanceConfig = { totalAssets: 100000, allowFractional: true };

    expect(() => RebalancingCalculator.calculateRebalanceInstructions([], config)).toThrow(
      'Portfolio must contain at least one security'
    );
  });

  test('TC-MAN-017: Duplicate Ticker in Input is rejected', () => {
    const portfolio: SecurityPosition[] = [
      { ticker: 'IBM', targetPct: 50, currentPct: 50, targetVariancePct: 0, unitPrice: 150 },
      { ticker: 'IBM', targetPct: 50, currentPct: 50, targetVariancePct: 0, unitPrice: 150 },
    ];
    const config: RebalanceConfig = { totalAssets: 100000, allowFractional: true };

    expect(() => RebalancingCalculator.calculateRebalanceInstructions(portfolio, config)).toThrow(
      'Duplicate security ticker: IBM'
    );
  });

  test('TC-MAN-018: Empty security ticker is rejected', () => {
    const portfolio: SecurityPosition[] = [
      { ticker: '   ', currentPct: 100, targetPct: 100, targetVariancePct: 0, unitPrice: 100 },
    ];
    const config: RebalanceConfig = { totalAssets: 100000, allowFractional: true };

    expect(() => RebalancingCalculator.calculateRebalanceInstructions(portfolio, config)).toThrow(
      'Security ticker cannot be empty'
    );
  });

  test('TC-MAN-019: Non-finite Infinity unit price is rejected', () => {
    const portfolio: SecurityPosition[] = [
      { ticker: 'IBM', currentPct: 100, targetPct: 100, targetVariancePct: 0, unitPrice: Infinity },
    ];
    const config: RebalanceConfig = { totalAssets: 100000, allowFractional: true };

    expect(() => RebalancingCalculator.calculateRebalanceInstructions(portfolio, config)).toThrow(
      'Invalid Unit Price for IBM: Infinity'
    );
  });

  test('TC-MAN-019b: Non-finite Infinity total assets is rejected', () => {
    const config: RebalanceConfig = { totalAssets: Infinity, allowFractional: true };

    expect(() => RebalancingCalculator.calculateRebalanceInstructions(baselinePortfolio, config)).toThrow(
      'Total Asset must be a finite number'
    );
  });
});

test.describe('Medium Priority', () => {
  test('TC-MAN-020: Penny Stocks (sub-cent prices) do not overflow', () => {
    const portfolio: SecurityPosition[] = [
      { ticker: 'PENNY', targetPct: 20, currentPct: 10, targetVariancePct: -10, unitPrice: 0.0001 },
      { ticker: 'MSFT', targetPct: 20, currentPct: 20, targetVariancePct: 0, unitPrice: 90 },
      { ticker: 'ORCL', targetPct: 20, currentPct: 30, targetVariancePct: 10, unitPrice: 220 },
      { ticker: 'AAPL', targetPct: 20, currentPct: 20, targetVariancePct: 0, unitPrice: 450 },
      { ticker: 'HD', targetPct: 20, currentPct: 20, targetVariancePct: 0, unitPrice: 70 },
    ];
    const config: RebalanceConfig = { totalAssets: 100000, allowFractional: true };
    const results = RebalancingCalculator.calculateRebalanceInstructions(portfolio, config);

    expect(results.find(r => r.ticker === 'PENNY')!.sharesToTrade).toBe(100000000);
  });

  test('TC-MAN-021: High-Value Share (price exceeds rebalance value)', () => {
    const portfolio: SecurityPosition[] = [
      { ticker: 'BRK', targetPct: 20, currentPct: 10, targetVariancePct: -10, unitPrice: 50000 },
      { ticker: 'MSFT', targetPct: 20, currentPct: 20, targetVariancePct: 0, unitPrice: 90 },
      { ticker: 'ORCL', targetPct: 20, currentPct: 30, targetVariancePct: 10, unitPrice: 220 },
      { ticker: 'AAPL', targetPct: 20, currentPct: 20, targetVariancePct: 0, unitPrice: 450 },
      { ticker: 'HD', targetPct: 20, currentPct: 20, targetVariancePct: 0, unitPrice: 70 },
    ];
    const fractionalConfig: RebalanceConfig = { totalAssets: 100000, allowFractional: true };
    const wholeConfig: RebalanceConfig = { totalAssets: 100000, allowFractional: false };

    const fractionalResults = RebalancingCalculator.calculateRebalanceInstructions(portfolio, fractionalConfig);
    const wholeResults = RebalancingCalculator.calculateRebalanceInstructions(portfolio, wholeConfig);

    expect(fractionalResults.find(r => r.ticker === 'BRK')!.sharesToTrade).toBe(0.2);
    expect(wholeResults.find(r => r.ticker === 'BRK')!.sharesToTrade).toBe(0);
  });

  test('TC-MAN-022: Zero Total Asset Value yields zero shares for every security', () => {
    const config: RebalanceConfig = { totalAssets: 0, allowFractional: true };
    const results = RebalancingCalculator.calculateRebalanceInstructions(baselinePortfolio, config);

    for (const r of results) {
      expect(r.sharesToTrade).toBe(0);
    }
  });

  test('TC-MAN-023: Floating-Point Dust Variance is treated as zero (HOLD)', () => {
    const portfolio: SecurityPosition[] = [
      { ticker: 'IBM', targetPct: 20, currentPct: 20.00000001, targetVariancePct: 0.00000001, unitPrice: 150 },
      { ticker: 'MSFT', targetPct: 20, currentPct: 19.99999999, targetVariancePct: -0.00000001, unitPrice: 90 },
      { ticker: 'ORCL', targetPct: 20, currentPct: 20, targetVariancePct: 0, unitPrice: 220 },
      { ticker: 'AAPL', targetPct: 20, currentPct: 20, targetVariancePct: 0, unitPrice: 450 },
      { ticker: 'HD', targetPct: 20, currentPct: 20, targetVariancePct: 0, unitPrice: 70 },
    ];
    const config: RebalanceConfig = { totalAssets: 100000, allowFractional: true, precision: 2 };
    const results = RebalancingCalculator.calculateRebalanceInstructions(portfolio, config);

    expect(results.find(r => r.ticker === 'IBM')!.sharesToTrade).toBe(0);
    expect(results.find(r => r.ticker === 'MSFT')!.sharesToTrade).toBe(0);
  });

  test('TC-MAN-024: Single-Security Portfolio (already balanced) requires no trade', () => {
    const portfolio: SecurityPosition[] = [{ ticker: 'ONLY', targetPct: 100, currentPct: 100, targetVariancePct: 0, unitPrice: 100 }];
    const config: RebalanceConfig = { totalAssets: 100000, allowFractional: true };
    const results = RebalancingCalculator.calculateRebalanceInstructions(portfolio, config);

    expect(results).toHaveLength(1);
    expect(results[0].sharesToTrade).toBe(0);
  });

  test('TC-MAN-025: Portfolio asset value scaling — 10x total assets scales shares linearly by 10x', () => {
    const baseConfig: RebalanceConfig = { totalAssets: 100000, allowFractional: true };
    const scaledConfig: RebalanceConfig = { totalAssets: 1000000, allowFractional: true };

    const baseResults = RebalancingCalculator.calculateRebalanceInstructions(baselinePortfolio, baseConfig);
    const scaledResults = RebalancingCalculator.calculateRebalanceInstructions(baselinePortfolio, scaledConfig);

    const baseIbm = baseResults.find(r => r.ticker === 'IBM')!.sharesToTrade;
    const scaledIbm = scaledResults.find(r => r.ticker === 'IBM')!.sharesToTrade;
    const baseOrcl = baseResults.find(r => r.ticker === 'ORCL')!.sharesToTrade;
    const scaledOrcl = scaledResults.find(r => r.ticker === 'ORCL')!.sharesToTrade;

    expect(scaledIbm).toBeCloseTo(baseIbm * 10, 0);
    expect(scaledOrcl).toBeCloseTo(baseOrcl * 10, 0);
  });

  test('TC-MAN-026: Negative precision configuration is rejected', () => {
    const portfolio: SecurityPosition[] = [
      { ticker: 'IBM', currentPct: 100, targetPct: 100, targetVariancePct: 0, unitPrice: 150 },
    ];
    const config: RebalanceConfig = { totalAssets: 100000, allowFractional: true, precision: -1 };

    expect(() => RebalancingCalculator.calculateRebalanceInstructions(portfolio, config)).toThrow(
      'Invalid precision: -1'
    );
  });
});

test.describe('Low Priority', () => {
  test('TC-MAN-027: Institutional Mode Residual Cash Tracking nets to zero across baseline trades', () => {
    const config: RebalanceConfig = { totalAssets: 100000, allowFractional: false };
    const results = RebalancingCalculator.calculateRebalanceInstructions(baselinePortfolio, config);

    // Residual cash per security = planned (fractional) trade value minus the value actually
    // moved once rounded to whole shares.
    const residualCash = results.reduce((sum, r) => {
      const actualValue = r.sharesToTrade * baselinePortfolio.find(p => p.ticker === r.ticker)!.unitPrice;
      return sum + (r.tradeValue - actualValue);
    }, 0);

    const ibm = results.find(r => r.ticker === 'IBM')!;
    const orcl = results.find(r => r.ticker === 'ORCL')!;
    const ibmResidual = ibm.tradeValue - ibm.sharesToTrade * 150;
    const orclResidual = orcl.tradeValue - orcl.sharesToTrade * 220;

    expect(ibmResidual).toBeCloseTo(100, 2);
    expect(orclResidual).toBeCloseTo(-100, 2);
    expect(residualCash).toBeCloseTo(0, 2); // net residual across the whole portfolio
  });

  test('TC-MAN-028: Percentage tolerance boundary — just inside vs. just outside ±0.001', () => {
    const insideTolerance: SecurityPosition[] = [
      { ticker: 'IBM', currentPct: 60.0005, targetPct: 60, targetVariancePct: 0.0005, unitPrice: 150 },
      { ticker: 'ORCL', currentPct: 40.0004, targetPct: 40, targetVariancePct: 0.0004, unitPrice: 220 },
    ];
    const outsideTolerance: SecurityPosition[] = [
      { ticker: 'IBM', currentPct: 60.0007, targetPct: 60, targetVariancePct: 0.0007, unitPrice: 150 },
      { ticker: 'ORCL', currentPct: 40.0006, targetPct: 40, targetVariancePct: 0.0006, unitPrice: 220 },
    ];
    const config: RebalanceConfig = { totalAssets: 100000, allowFractional: true };

    expect(() => RebalancingCalculator.calculateRebalanceInstructions(insideTolerance, config)).not.toThrow();
    expect(() => RebalancingCalculator.calculateRebalanceInstructions(outsideTolerance, config)).toThrow(
      'Total Current % must equal 100%'
    );
  });

  test('TC-MAN-029: Ticker duplicate detection is case-sensitive ("IBM" vs "ibm" is not a duplicate)', () => {
    const portfolio: SecurityPosition[] = [
      { ticker: 'IBM', currentPct: 50, targetPct: 50, targetVariancePct: 0, unitPrice: 150 },
      { ticker: 'ibm', currentPct: 50, targetPct: 50, targetVariancePct: 0, unitPrice: 150 },
    ];
    const config: RebalanceConfig = { totalAssets: 100000, allowFractional: true };

    expect(() => RebalancingCalculator.calculateRebalanceInstructions(portfolio, config)).not.toThrow();
  });

  test('TC-MAN-030: Fractional mode with precision 0 rounds to nearest, unlike whole-share mode (rounds toward zero)', () => {
    const fractionalPrecisionZeroConfig: RebalanceConfig = { totalAssets: 100000, allowFractional: true, precision: 0 };
    const wholeConfig: RebalanceConfig = { totalAssets: 100000, allowFractional: false };

    const fractionalResults = RebalancingCalculator.calculateRebalanceInstructions(baselinePortfolio, fractionalPrecisionZeroConfig);
    const wholeResults = RebalancingCalculator.calculateRebalanceInstructions(baselinePortfolio, wholeConfig);

    // raw IBM shares = 66.666...: nearest-rounding gives 67, toward-zero rounding gives 66.
    expect(fractionalResults.find(r => r.ticker === 'IBM')!.sharesToTrade).toBe(67);
    expect(wholeResults.find(r => r.ticker === 'IBM')!.sharesToTrade).toBe(66);
  });
});
