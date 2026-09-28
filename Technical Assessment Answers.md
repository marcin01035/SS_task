# Technical Assessment — Answers

> **Account:** ABC — $100,000 Total Assets (100% Vested)

---

## 1. Output — Number of Shares to Buy/Sell

**Formula:**
`Trade Value = (Target% − Current%) × Total Assets`
`Shares to Buy/Sell = Trade Value ÷ Unit Price`
(Negative variance → BUY; Positive variance → SELL)

| Security | Target% | Current% | Target Variance | Unit Price | Trade Value | Output – Shares to Buy/Sell | Action |
|:--------:|:-------:|:--------:|:---------------:|:----------:|:-----------:|:---------------------------:|:------:|
| **IBM**  |   20    |    10    |       -10       |    150     |  +$10,000   |         **+66.67**          |  BUY   |
| **MSFT** |   20    |    20    |        0        |     90     |     $0      |            **0**            |  HOLD  |
| **ORCL** |   20    |    30    |       +10       |    220     |  -$10,000   |         **-45.45**          |  SELL  |
| **AAPL** |   20    |    20    |        0        |    450     |     $0      |            **0**            |  HOLD  |
|  **HD**  |   20    |    20    |        0        |     70     |     $0      |            **0**            |  HOLD  |

*Example (IBM): Target Value = 20% × $100,000 = $20,000. Current Value = 10% × $100,000 = $10,000. Trade Value = $20,000 − $10,000 = $10,000. Shares = $10,000 ÷ $150 = 66.67 shares to **buy**.*

*Example (ORCL): Target Value = $20,000. Current Value = $30,000. Trade Value = -$10,000. Shares = -$10,000 ÷ $220 = -45.45 shares → **sell** 45.45 shares.*

---

## 2. What do you have to do to get to zero target variance?

To bring every security's target variance to **0%**, the account must **buy IBM and sell ORCL** so that current allocation matches target allocation for all five securities:

- **BUY 66.67 shares of IBM** (~$10,000) — raises IBM from 10% → 20% of the account.
- **SELL 45.45 shares of ORCL** (~$10,000) — lowers ORCL from 30% → 20% of the account.
- **MSFT, AAPL, HD** already sit at their 20% target, so **no trade is required** for these three.

Because the $10,000 raised by selling ORCL exactly funds the $10,000 needed to buy IBM, the rebalance is **self-funding** (net cash movement = $0) and results in each security holding exactly 20% of the $100,000 total assets — i.e., **zero target variance across the whole portfolio**.

---

## 3. Manual & Automated Test Cases

**Application under test:** `src/RebalancingCalculator.ts` (`RebalancingCalculator.calculateRebalanceInstructions`) — a pure TypeScript calculation engine that takes an account's securities (target %, current %, unit price) plus total assets, and outputs the number of shares to buy (+) / sell (−) per security.

### Approach
- **Manual test cases** (functional, boundary, and negative scenarios) and the underlying **assumptions** are documented in **[`testScenarios.md`](./testScenarios.md)**.
- **Automated test cases** are implemented as a real, runnable Playwright test suite: **[`tests/rebalancing.spec.ts`](./tests/rebalancing.spec.ts)** (32 tests, all passing). Test names/grouping mirror `testScenarios.md` 1:1 by `TC-MAN-xxx` ID **and by priority tier** — both files order scenarios **Critical → High → Medium → Low**, most important first. Playwright's test runner (`@playwright/test`) is used purely as a TypeScript test/assertion framework here — no browser page is needed since this validates calculation logic, not a UI.
- Run with: `npm test` (executes `playwright test tests/rebalancing.spec.ts --project=chromium`). CI (`.github/workflows/playwright.yml`) runs the same command on every push/PR — chromium only, since this suite tests calculation logic, not a UI, so multi-browser coverage adds no value.

### Key assumptions (see `testScenarios.md` for the full list)
1. Variance = Current % − Target %; negative → BUY, positive → SELL.
2. Fractional shares are rounded to 2 decimals by default (nearest, via `toFixed`); a whole-share mode is also supported (floor for buys, ceil-magnitude for sells — i.e., truncation toward zero, not nearest-rounding).
3. Current % and Target % must each sum to 100% across the portfolio (±0.001 float tolerance), or the calculation throws.
4. Every numeric input (`unitPrice`, `totalAssets`, `targetPct`, `currentPct`, `precision`) must be an actual finite number — `undefined`, non-numeric strings, `NaN`, and `Infinity`/`-Infinity` are all rejected with a descriptive error instead of silently producing `NaN` output. Unit price must additionally be `> 0`; total assets must be `≥ 0`; each individual % must be within 0–100; `precision` (if provided) must be `≥ 0`.
5. Tickers must be non-empty (after trimming whitespace) and unique; duplicate-ticker detection is **case-sensitive** (`"IBM"` and `"ibm"` are treated as different securities); the portfolio must not be empty.

### What the automated suite validates (32 tests)
- **Happy path:** baseline table output (IBM +66.67 buy, ORCL −45.45 sell, others 0), a fully-balanced portfolio (all zero), a generic two-asset swap, and whole-share rounding.
- **Value conservation:** total BUY $ value equals total SELL $ value.
- **Boundary/negative cases:** zero/negative unit price, mismatched Current %/Target % totals, negative total assets, out-of-range individual %, empty portfolio, duplicate tickers, sub-cent penny-stock prices, high-priced shares below one whole unit, floating-point "dust" variance, and negative-zero (`-0`) normalization.
- **Position lifecycle edge cases:** full liquidation (sell-to-zero), new position entry (buy-from-zero), a complete 100%-shift reallocation between two securities, and linear scaling of output shares when total assets scale 10x.
- **Input validation & data integrity:** empty/whitespace ticker, missing (`undefined`) numeric fields, non-numeric string values, the exact ±0.001 percentage-sum tolerance boundary (just inside vs. just outside), `Infinity` values for both unit price and total assets, and negative `precision` configuration.
- **Rounding & duplicate-detection nuances:** case-sensitive ticker duplicate detection, and the documented behavioral difference between fractional-mode-with-precision-0 (rounds to nearest) and whole-share mode (always truncates toward zero).

### Bug found & fixed during test development
Writing `TC-MAN-023` (dust variance) surfaced a real defect: for tiny negative variances, `toFixed()` produced `-0` instead of `0`, which is a distinct value in JS (`Object.is(-0, 0) === false`) and could render as "**-0 shares**" in a UI. Fixed in `RebalancingCalculator.calculateRebalanceInstruction` by normalizing `-0` to `0`. I also added the missing validations (negative total assets, out-of-range %, empty portfolio, duplicate ticker) — now centralized in `RebalanceValidator.validatePortfolio`, called once by `calculateRebalanceInstructions` — so the implementation matches the documented test cases. Noting this as an assumption since the original scaffold only validated unit price and the 100% totals.

### Second bug class found during a later review pass: silent `NaN` propagation
A follow-up review of the test suite (checking for basic input-validation gaps) found that guards like `unitPrice <= 0` silently pass through `undefined` or non-numeric strings (`undefined <= 0` evaluates to `false` in JS), letting them flow into the arithmetic and produce a silent `NaN` output instead of a clear error — a much worse failure mode than a thrown exception, since a UI could display "NaN shares" without anyone noticing the root cause. Fixed by adding explicit `typeof x !== 'number' || !Number.isFinite(x)` guards ahead of the range checks for every numeric input, plus an empty-ticker check and a `precision >= 0` guard (an unguarded negative `precision` would otherwise throw a raw native `RangeError` from `toFixed(-1)` instead of a descriptive message).

