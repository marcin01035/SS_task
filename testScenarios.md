# 📋 Test Scenarios: Portfolio Rebalancing Engine

> **System:** Asset Management Rebalancing Engine (Charles River Development / Alpha Platform)
> **Target Account:** Account-ABC ($100,000 Total Assets, 100% Vested)

---

## 📑 Contents

1. [Key Assumptions](#-key-assumptions)
2. [Test Data Matrix](#-test-data-matrix)
3. [Test Priority Legend](#-test-priority-legend)
4. [Manual Test Scenarios](#-manual-test-scenarios)
   - [Critical Priority](#critical-priority)
   - [High Priority](#high-priority)
   - [Medium Priority](#medium-priority)
   - [Low Priority](#low-priority)
5. [Automated Test Scenarios](#-automated-test-scenarios-playwright--typescript)

---

## ⚠️ Key Assumptions

These assumptions define the expected behavior of the rebalancing engine wherever the requirements are ambiguous:

1. **Fractional vs. Whole Shares**
   * **Default (Fractional Mode):** Fractional shares are supported, rounded to **2 decimal places**.
   * **Institutional Mode (Whole Shares Only):** Buys round down (`Math.floor`), sells round up in magnitude (`Math.ceil`), with any leftover value kept as Cash.
2. **Trade Direction & Sign Convention**
   * Variance is calculated as: **Target Variance % = Current % − Target %**.
   * **Negative variance → BUY** (output share count is positive).
   * **Positive variance → SELL** (output share count is negative).
3. **Execution Parameters:** No transaction fees or taxes are applied, and market prices are treated as static during execution.
4. **Portfolio Constraints:** The sum of all `Current %` values must equal 100%, and the sum of all `Target %` values must equal 100%.

---

## 📐 Test Data Matrix

| Security | Target % | Current % | Target Variance % | Unit Price ($) | Output (Fractional) | Output (Whole Shares) | Residual Cash (Whole Mode) | Action |
|:---------|:--------:|:---------:|:-----------------:|:--------------:|:-------------------:|:---------------------:|:--------------------------:|:------:|
| **IBM**  |   20%    |    10%    |       -10%        |      $150      |     **+66.67**      |        **+66**        |          +$100.00          |  BUY   |
| **MSFT** |   20%    |    20%    |        0%         |      $90       |      **0.00**       |         **0**         |           $0.00            |  HOLD  |
| **ORCL** |   20%    |    30%    |       +10%        |      $220      |     **-45.45**      |        **-45**        |          -$100.00          |  SELL  |
| **AAPL** |   20%    |    20%    |        0%         |      $450      |      **0.00**       |         **0**         |           $0.00            |  HOLD  |
| **HD**   |   20%    |    20%    |        0%         |      $70       |      **0.00**       |         **0**         |           $0.00            |  HOLD  |

> **Residual Cash** = value the trade *would* have moved in Fractional Mode minus the value actually moved once rounded down/up to whole shares. Positive = leftover cash retained (buy spent less); negative = cash shortfall (sell generated less proceeds than planned).

---

## 🚦 Test Priority Legend

Every scenario below is tagged with one of four priority levels, and scenarios are ordered from **most to least important** within each tier (both in this document and in the automated suite, `tests/rebalancing.spec.ts`):

| Priority | Meaning |
|:--------:|:--------|
| 🔴 **Critical** | Directly validates the application's primary output requirement — correct buy/sell share counts — or a defect that would silently corrupt that output (e.g., a rejected trade computed as `NaN`). A failure here means the core deliverable is wrong or unsafe to ship. |
| 🟠 **High** | Validates a required guardrail (input validation, error handling) that prevents bad data from ever reaching the calculation. A failure here means invalid input could be accepted or a valid scenario incorrectly rejected. |
| 🟡 **Medium** | Validates a secondary/boundary behavior (precision, scaling, less common numeric ranges) that matters for robustness but is not on the primary happy-path. |
| 🟢 **Low** | Validates a documented assumption or a nuance/consistency check (e.g., rounding-mode differences, case sensitivity) that is useful to have codified but is unlikely to be hit in normal use. |

---

## 🧪 Manual Test Scenarios

### Critical Priority

#### `TC-MAN-001`: Baseline Portfolio Rebalancing 🔴 Critical
* **Pre-conditions:** Account-ABC balance = $100,000.
* **Steps:** Input holdings using `(Current % / Target % / Unit Price)`: IBM (10%/20%/$150), MSFT (20%/20%/$90), ORCL (30%/20%/$220), AAPL (20%/20%/$450), HD (20%/20%/$70). Run calculation.
* **Expected Result:**
  * IBM: Buy `+66.67` shares (or `+66` whole).
  * ORCL: Sell `-45.45` shares (or `-45` whole).
  * MSFT, AAPL, HD: `0` shares (no trade).

#### `TC-MAN-002`: Single Asset Rebalancing 🔴 Critical
* **Steps:** Account with 2 holdings: Security A (Current 80%, Target 50%, Price $100), Security B (Current 20%, Target 50%, Price $50). Total = $10,000.
* **Expected Result:** Security A = Sell `-30` shares (-$3,000). Security B = Buy `+60` shares (+$3,000).

#### `TC-MAN-003`: Zero Market Unit Price 🔴 Critical
* **Steps:** Set IBM `Unit Price` = `$0.00`. Trigger calculation.
* **Expected Result:** Application throws error: `"Invalid Unit Price for IBM: 0"`. Execution blocked.

#### `TC-MAN-004`: Value Conservation Across Trades 🔴 Critical
* **Steps:** Run the baseline portfolio (`TC-MAN-001`) in **Fractional Mode**. Sum the dollar value of all BUY trades and all SELL trades.
* **Expected Result:** Total BUY value equals total SELL value (both `$10,000`), confirming the rebalance neither creates nor destroys portfolio value.

#### `TC-MAN-005`: Position Liquidation (Selling to Zero) 🔴 Critical
* **Steps:** Set an asset's `Current %` = 20%, `Target %` = 0% (Price = $220, Total Assets = $100,000). Balance the rest of the portfolio so both totals still equal 100%.
* **Expected Result:** Engine calculates a full **SELL** trade for all held shares: `-90.91` fractional / `-90` whole shares.

#### `TC-MAN-006`: New Position Entry (Buying from Zero) 🔴 Critical
* **Steps:** Set an asset's `Current %` = 0%, `Target %` = 20% (Price = $150, Total Assets = $100,000). Balance the rest of the portfolio so both totals still equal 100%.
* **Expected Result:** Engine calculates a full **BUY** trade for the entire target allocation: `+133.33` fractional / `+133` whole shares.

#### `TC-MAN-007`: Total Reallocation (100% Shift) 🔴 Critical
* **Steps:** Two-security portfolio. Security A: `Current %` = 100% → `Target %` = 0%. Security B: `Current %` = 0% → `Target %` = 100%.
* **Expected Result:** Complete liquidation of Security A and full allocation to Security B, with no calculation errors (division-by-zero, overflow, etc.).

#### `TC-MAN-008`: Missing/Null Numerical Fields Validation 🔴 Critical
* **Steps:** Leave one numerical field (`Unit Price`, `Target %`, or `Current %`) as `undefined`/`null` for an asset row.
* **Expected Result:** Application throws a descriptive validation error (e.g., `"Invalid Unit Price for IBM: undefined"`) rather than silently propagating `NaN` into the calculated output.

#### `TC-MAN-009`: Non-Numeric Data Input Handling 🔴 Critical
* **Steps:** Provide a non-numeric string (e.g., `"ABC"` or `"N/A"`) in the `Unit Price` or an allocation `%` field.
* **Expected Result:** Application throws a type-mismatch validation error rather than computing a silent `NaN`/nonsensical output.

---

### High Priority

#### `TC-MAN-010`: Fully Balanced Portfolio 🟠 High
* **Pre-conditions:** Account-ABC balance = $100,000.
* **Steps:** Set `Current %` = 20% and `Target %` = 20% for all 5 securities. Run calculation.
* **Expected Result:** All securities return `0` shares (No trade generated).

#### `TC-MAN-011`: Target Allocation Mismatch 🟠 High
* **Steps:** Set holdings target percentages sum = 110% (e.g., IBM Target = 30%, others = 20%).
* **Expected Result:** Application throws validation error: `"Total Target % must equal 100%"`.

#### `TC-MAN-012`: Current Allocation Mismatch 🟠 High
* **Steps:** Set holdings current percentages sum = 95%.
* **Expected Result:** Application throws validation error: `"Total Current % must equal 100%"`.

#### `TC-MAN-013`: Negative Unit Price 🟠 High
* **Steps:** Set IBM `Unit Price` = `-$50.00`. Trigger calculation.
* **Expected Result:** Application throws error: `"Invalid Unit Price for IBM: -50"`. Execution blocked.

#### `TC-MAN-014`: Negative Total Asset Value 🟠 High
* **Steps:** Set `Total Asset` = `-$1,000.00`. Run calculation.
* **Expected Result:** Application throws validation error: `"Total Asset must not be negative"`. Execution blocked.

#### `TC-MAN-015`: Invalid Individual Percentage (Out of Range) 🟠 High
* **Steps:** Set IBM `Current %` = `-5%` and increase another holding so the sum still equals 100% (e.g., ORCL `Current %` = 35%).
* **Expected Result:** Application throws validation error: `"Current % for IBM must be between 0 and 100"`, even though the portfolio total is valid. Execution blocked.

#### `TC-MAN-016`: Empty Portfolio 🟠 High
* **Steps:** Run calculation with zero holdings configured.
* **Expected Result:** Application throws validation error: `"Portfolio must contain at least one security"`, rather than returning an empty result silently.

#### `TC-MAN-017`: Duplicate Ticker in Input 🟠 High
* **Steps:** Submit two holdings both using ticker `IBM` (e.g., IBM 10%/20%/$150 and a duplicate IBM row).
* **Expected Result:** Application throws validation error: `"Duplicate security ticker: IBM"`. Execution blocked.

#### `TC-MAN-018`: Empty Security Ticker Validation 🟠 High
* **Steps:** Provide valid numeric inputs (`Current %`, `Target %`, `Unit Price`) for a row, but leave the ticker blank (`""`) or whitespace-only (`"   "`).
* **Expected Result:** Application blocks execution with validation error: `"Security ticker cannot be empty"`.

#### `TC-MAN-019`: Non-Finite Numeric Values (Infinity) 🟠 High
* **Steps:** Set `Unit Price` or `Total Assets` to `Infinity` or `-Infinity`.
* **Expected Result:** Application throws a descriptive validation error rather than computing `Infinity`/`NaN` share counts.

---

### Medium Priority

#### `TC-MAN-020`: Penny Stocks (Sub-cent Prices) 🟡 Medium
* **Steps:** Set under-allocated security (-10% variance) Unit Price = `$0.0001` on a $100k account.
* **Expected Result:** Correctly outputs `+100,000,000` shares without overflow or float rounding errors.

#### `TC-MAN-021`: High-Value Share (Price Exceeds Rebalance Value) 🟡 Medium
* **Steps:** Set under-allocated security (-10% variance = $10,000 trade value) Unit Price = `$50,000` (e.g., Berkshire Hathaway).
* **Expected Result:**
  * **Fractional Mode:** Outputs `+0.20` shares.
  * **Whole Share Mode:** Outputs `0` shares (insufficient rebalance budget for 1 full share).

#### `TC-MAN-022`: Zero Total Asset Value 🟡 Medium
* **Steps:** Set `Total Asset` = `$0.00`. Run calculation.
* **Expected Result:** All output share counts equal `0`.

#### `TC-MAN-023`: Floating-Point Dust Variance 🟡 Medium
* **Steps:** Set a holding's `Current %` and `Target %` so the computed variance is a negligible floating-point artifact (e.g., `0.0000001%`) rather than exactly `0%`.
* **Expected Result:** Output rounds to `0` shares (treated as HOLD); no spurious BUY/SELL of a fractional cent is generated.

#### `TC-MAN-024`: Single-Security Portfolio (Already Balanced) 🟡 Medium
* **Steps:** Account holds one security at `Current % = 100%`, `Target % = 100%`, Price = `$100`. Run calculation.
* **Expected Result:** `0` shares traded; no error, despite the portfolio containing only one holding.

#### `TC-MAN-025`: Portfolio Asset Value Scaling 🟡 Medium
* **Steps:** Run the baseline scenario (IBM 10%→20%, ORCL 30%→20%, others unchanged) with `Total Assets` scaled to `$1,000,000` (10× the `TC-MAN-001` baseline).
* **Expected Result:** Output share counts scale linearly by exactly 10× compared to the $100K baseline (e.g., IBM `+666.7` vs. baseline `+66.67`).

#### `TC-MAN-026`: Negative Precision Configuration 🟡 Medium
* **Steps:** Set `RebalanceConfig.precision` = `-1` in fractional mode.
* **Expected Result:** Application throws a descriptive validation error (`"Invalid precision: -1..."`) instead of a native `RangeError` from `toFixed(-1)`.

---

### Low Priority

#### `TC-MAN-027`: Institutional Mode Residual Cash Tracking 🟢 Low
* **Steps:** Run the baseline portfolio (`TC-MAN-001`) in **Whole Share Mode**. After calculation, sum the residual cash impact across all trades (see [Test Data Matrix](#-test-data-matrix)).
* **Expected Result:** Ending Cash balance reflects the net residual (`+$100.00` from IBM, `-$100.00` from ORCL = `$0.00` net change), and is reported explicitly rather than silently dropped.

#### `TC-MAN-028`: Percentage Tolerance Boundary Probing 🟢 Low
* **Steps:** Set the portfolio's `Current %` sum to `100.0009%` (just inside the ±0.001 float tolerance), then separately to `100.0011%` (just outside it).
* **Expected Result:** `100.0009%` is **accepted** (treated as balanced); `100.0011%` is **rejected** with `"Total Current % must equal 100%"`.

#### `TC-MAN-029`: Case-Sensitive Duplicate Ticker Detection 🟢 Low
* **Steps:** Submit two holdings with tickers `"IBM"` and `"ibm"`.
* **Expected Result:** *(Documented assumption)* Ticker matching is **case-sensitive** — `"IBM"` and `"ibm"` are treated as two distinct securities, not a duplicate. No error is thrown.

#### `TC-MAN-030`: Fractional Mode (Precision 0) vs. Whole-Share Mode Rounding Difference 🟢 Low
* **Steps:** Run the baseline IBM position (raw shares = `66.666...`) once with `allowFractional: true, precision: 0`, and once with `allowFractional: false`.
* **Expected Result:** *(Documented assumption)* The two modes are **not equivalent** — fractional mode with `precision: 0` rounds to the *nearest* integer (`67`), while whole-share mode always rounds *toward zero* (`66`).

---

## 🤖 Automated Test Scenarios (Playwright / TypeScript)

> The automated tests are implemented as a real, runnable suite in **[`tests/rebalancing.spec.ts`](./tests/rebalancing.spec.ts)** (32 passing tests). Test titles and grouping mirror this document 1:1 by both `TC-MAN-xxx` ID and priority tier — the spec file has four `describe` blocks (`Critical Priority`, `High Priority`, `Medium Priority`, `Low Priority`) in the same order as this document, so the most important checks run and get reported first. Includes `TC-MAN-001b` (whole-share variant of the baseline case, grouped under Critical alongside `TC-MAN-001`) and `TC-MAN-019b` (a second Infinity check, for `totalAssets` rather than `unitPrice`, grouped under High alongside `TC-MAN-019`). Run with `npm test`. See the root **[`README.md`](./README.md)** for step-by-step instructions and **[`src/README.md`](./src/README.md)** for how the calculator code works.

