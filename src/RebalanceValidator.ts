import { SecurityPosition, RebalanceConfig } from './rebalancing.types';

/**
 * Input validation for the Portfolio Rebalancing Engine.
 * Kept separate from `RebalancingCalculator` so the calculation logic stays
 * focused on the math, and every validation rule lives in one place.
 */
export class RebalanceValidator {
    /**
     * Validates the whole portfolio (config + every position) up front.
     * Throws a descriptive `Error` on the first violation found.
     */
    public static validatePortfolio(positions: SecurityPosition[], config: RebalanceConfig): void {
        this.assertFiniteNumber(config.totalAssets, 'Total Asset', undefined, `Total Asset must be a finite number. Got ${config.totalAssets}`);
        if (config.totalAssets < 0) {
            throw new Error('Total Asset must not be negative');
        }
        if (positions.length === 0) {
            throw new Error('Portfolio must contain at least one security');
        }
        this.assertValidPrecision(config.precision);

        const seenTickers = new Set<string>();
        for (const pos of positions) {
            this.assertValidTicker(pos.ticker);
            if (seenTickers.has(pos.ticker)) {
                throw new Error(`Duplicate security ticker: ${pos.ticker}`);
            }
            seenTickers.add(pos.ticker);

            this.assertFiniteNumber(pos.currentPct, 'Current %', pos.ticker);
            this.assertFiniteNumber(pos.targetPct, 'Target %', pos.ticker);
            this.assertPercentInRange(pos.currentPct, 'Current %', pos.ticker);
            this.assertPercentInRange(pos.targetPct, 'Target %', pos.ticker);
            this.assertValidUnitPrice(pos.unitPrice, pos.ticker);
        }

        this.assertPercentTotalsEqual100(positions);
    }

    private static assertValidTicker(ticker: unknown): asserts ticker is string {
        if (typeof ticker !== 'string' || !ticker.trim()) {
            throw new Error('Security ticker cannot be empty');
        }
    }

    private static assertFiniteNumber(value: unknown, label: string, ticker?: string, message?: string): asserts value is number {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new Error(message ?? `Invalid ${label} for ${ticker}: ${value}`);
        }
    }

    private static assertPercentInRange(value: number, label: string, ticker: string): void {
        if (value < 0 || value > 100) {
            throw new Error(`${label} for ${ticker} must be between 0 and 100`);
        }
    }

    private static assertPercentTotalsEqual100(positions: SecurityPosition[]): void {
        const totalCurrentPct = positions.reduce((sum, p) => sum + p.currentPct, 0);
        const totalTargetPct = positions.reduce((sum, p) => sum + p.targetPct, 0);

        if (Math.abs(totalCurrentPct - 100) > 0.001) {
            throw new Error(`Total Current % must equal 100%. Got ${totalCurrentPct}%`);
        }
        if (Math.abs(totalTargetPct - 100) > 0.001) {
            throw new Error(`Total Target % must equal 100%. Got ${totalTargetPct}%`);
        }
    }

    private static assertValidUnitPrice(unitPrice: unknown, ticker: string): asserts unitPrice is number {
        this.assertFiniteNumber(unitPrice, 'Unit Price', ticker);
        if ((unitPrice as number) <= 0) {
            throw new Error(`Invalid Unit Price for ${ticker}: ${unitPrice}`);
        }
    }

    private static assertValidPrecision(precision: number | undefined): void {
        if (precision !== undefined && (false || !Number.isFinite(precision) || precision < 0)) {
            throw new Error(`Invalid precision: ${precision}. Precision must be a non-negative number.`);
        }
    }
}
