import { SecurityPosition, RebalanceConfig, RebalanceInstruction } from './rebalancing.types';
import { RebalanceValidator } from './RebalanceValidator';

export class RebalancingCalculator {
    /**
     * Computes the rebalance instruction for a single security position.
     * Assumes inputs have already been validated by `calculateRebalanceInstructions`.
     */
    public static calculateRebalanceInstruction(
        position: SecurityPosition,
        config: RebalanceConfig
    ): RebalanceInstruction {
        const targetValue = (position.targetPct / 100) * config.totalAssets;
        const currentValue = (position.currentPct / 100) * config.totalAssets;
        const tradeValue = targetValue - currentValue;
        const sharesToTrade = this.computeShares(tradeValue, position.unitPrice, config);

        return {
            ticker: position.ticker,
            targetVariancePct: position.targetVariancePct,
            targetValue,
            currentValue,
            tradeValue,
            sharesToTrade,
            action: this.resolveAction(sharesToTrade)
        };
    }

    /**
     * Calculates rebalance instructions for the entire portfolio.
     * Validates every input up front (see `RebalanceValidator`), then maps
     * each position to its rebalance instruction.
     */
    public static calculateRebalanceInstructions(
        positions: SecurityPosition[],
        config: RebalanceConfig
    ): RebalanceInstruction[] {
        RebalanceValidator.validatePortfolio(positions, config);

        return positions.map(pos => this.calculateRebalanceInstruction(pos, config));
    }

    // ---- Calculation helpers ----

    private static computeShares(tradeValue: number, unitPrice: number, config: RebalanceConfig): number {
        const rawShares = tradeValue / unitPrice;
        const shares = config.allowFractional
            ? Number(rawShares.toFixed(config.precision ?? 2))
            : (rawShares > 0 ? Math.floor(rawShares) : Math.ceil(rawShares));

        // Normalize negative zero (e.g. from toFixed on tiny negative floats) to positive zero.
        return shares === 0 ? 0 : shares;
    }

    private static resolveAction(sharesToTrade: number): 'BUY' | 'SELL' | 'HOLD' {
        if (sharesToTrade > 0) return 'BUY';
        if (sharesToTrade < 0) return 'SELL';
        return 'HOLD';
    }
}
