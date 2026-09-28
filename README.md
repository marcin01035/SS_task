# QA Guide — Portfolio Rebalancing Engine

Step-by-step guide for QA on how this project works, how to run it, and how to test it.

## 1. What this project is

A small calculation engine that answers the assessment question: *"given an account's target vs. current allocation for each security, how many shares do I need to buy/sell to reach zero target variance?"*

- **App under test:** `src/RebalancingCalculator.ts` + `src/RebalanceValidator.ts` (pure TypeScript, no UI/server).
- **Inputs:** a list of securities (`ticker`, `targetPct`, `currentPct`, `targetVariancePct`, `unitPrice`) + account `totalAssets`.
- **Output:** for each security, the number of shares to **buy** (+) / **sell** (−), plus a `BUY`/`SELL`/`HOLD` action.
- See **`Technical Assessment Answers.md`** for the worked example (Account ABC, $100K) and **`src/README.md`** for a line-by-line code walkthrough.

## 2. Prerequisites

- **Node.js** (LTS) and **npm** installed.
- Windows PowerShell (or any shell) with access to this repo.

## 3. One-time setup

```powershell
cd C:\Users\djgw34\IdeaProjects\SS_task
npm install
npx playwright install chromium   # downloads the chromium browser binary (Playwright runtime dependency; only chromium is used — this is a logic test suite, not a UI test)
```

## 4. Project structure (what to look at, in order)

| Path                               | What it is                                                                                              |
|------------------------------------|---------------------------------------------------------------------------------------------------------|
| `Technical Assessment QA.md`       | The original assessment prompt/question.                                                                |
| `Technical Assessment Answers.md`  | Written answers: share output table, "zero variance" explanation, testing approach summary.             |
| `src/rebalancing.types.ts`         | Input/output data shapes (`SecurityPosition`, `RebalanceConfig`, `RebalanceInstruction`).               |
| `src/RebalancingCalculator.ts`     | The engine itself — the code being tested.                                                              |
| `src/RebalanceValidator.ts`        | All input validation, called once by the engine before it calculates anything.                          |
| `testScenarios.md`                 | **Manual** test cases (functional + boundary/negative), assumptions, and test data matrix.              |
| `tests/rebalancing.spec.ts`        | **Automated** test cases (Playwright/TypeScript) — the coded, runnable version of the manual scenarios. |
| `tests/fixtures.ts`                | Shared test data (baseline portfolio, portfolio builder helper) used by `rebalancing.spec.ts`. |
| `.github/workflows/playwright.yml` | CI workflow — runs the automated suite (chromium only) on every push/PR.                                |
| `tsconfig.json` / `package.json`   | TypeScript + npm configuration.                                                                         |

## 5. Step-by-step: running the automated tests

1. Open a terminal in the repo root.
2. Run:
   ```powershell
   npm test
   ```
   This executes `playwright test tests/rebalancing.spec.ts --project=chromium` and prints pass/fail per test (32 tests). This is also exactly what CI (`.github/workflows/playwright.yml`) runs on every push/PR.
   ```
   Should report zero errors.
3. **View the HTML report** (generated after any run):
   ```powershell
   npx playwright show-report
   ```

## 6. Continuous Integration

`.github/workflows/playwright.yml` runs on every push/PR to `main`/`master`: installs dependencies, installs the chromium browser, and runs `npx playwright test --project=chromium` (single browser only — deliberate, since this suite tests calculation logic, not a UI, so multi-browser coverage adds no value). The HTML report is uploaded as a build artifact on every run.
