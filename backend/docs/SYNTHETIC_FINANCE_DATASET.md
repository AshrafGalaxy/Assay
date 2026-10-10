# Assay Synthetic Personal Finance Dataset

Reproducible INR personal-finance datasets for forecasting, scenario simulation, constrained planning, and evaluation.

Generator module: `app/services/financial_intelligence/synthetic_finance_generator.py`  
Adapter to Assay engine transactions: `app/services/financial_intelligence/synthetic_adapter.py`

The API ledger is `ledger.py`. **By default the synthetic ledger is disabled**
(`SYNTHETIC_LEDGER_ENABLED=false`) for a clean slate — live routes return empty
synthetic lists so only manual / bank data appears. Set
`SYNTHETIC_LEDGER_ENABLED=true` and generate CSVs to re-enable demos / ML eval.
The old hardcoded `demo_ledger.py` has been removed.

## Commands

From the `backend/` directory (venv active):

```bash
# Generate + validate (defaults: 500 users, 30 historical months, 6 future, seed 42)
python -m app.services.financial_intelligence.synthetic_finance_generator

# Smaller / custom run
python -m app.services.financial_intelligence.synthetic_finance_generator \
  --n-users 50 --historical-months 12 --forecast-horizon 6 --seed 42 \
  --output-dir data/synthetic_finance

# Validate existing CSVs without regenerating
python -m app.services.financial_intelligence.synthetic_finance_generator \
  --validate-only --output-dir data/synthetic_finance

# Tests
pytest tests/test_synthetic_finance_generator.py tests/test_financial_engine.py -q
```

Exit status is nonzero when validation fails.

Default output directory: `backend/data/synthetic_finance/` (gitignored).

## Generated files

| File | Grain | Role |
|------|-------|------|
| `users.csv` | 1 / user | Profile + scenario assignment |
| `transactions.csv` | many / user-month | Income, essentials, discretionary, EMI, savings |
| `monthly_finances.csv` | 1 / user-month | Cash-flow ledger + reserve flags |
| `obligations.csv` | recurring schedule | Rent, groceries, utilities, transport, EMI |
| `scenarios.csv` | 1 / user | Shock metadata + outcome labels |
| `dataset_meta.json` | dataset | Evaluation-only column notes |

## Accounting rules

All amounts are INR, rounded to 2 decimal places.

```text
ClosingBalance = OpeningBalance + Income
               - EssentialExpenses
               - DiscretionaryExpenses
               - EMIPayment
               - SavingsContribution
```

- Next month `OpeningBalance` = previous `ClosingBalance`.
- Negative closing balances are allowed (shortfalls are not clamped).
- `SavingsContribution = min(PlannedSavings, max(0, cash_before_savings))` where  
  `cash_before_savings = Opening + Income - Essential - Discretionary - EMI`.
- EMI is recorded only as `debt_payment` / `Debt & EMI`, never also inside essential expenses.
- Savings transfers are not ordinary expenses; they are excluded from essential/discretionary totals.
- Transaction-type sums for a user-month must equal the monthly aggregates.

## Scenarios

Every dataset includes all five types (at least one user each):

1. **stable_income** — low income volatility, predictable bills.  
2. **income_reduction** — 25–35% income cut from a future shock month onward.  
3. **unexpected_essential_expense** — one-time healthcare/repair essential in a future month.  
4. **infeasible_savings_target** — target exceeds max savings feasible while paying required outflows and holding `MinimumReserve` (discretionary cut to zero in the feasibility check).  
5. **high_income_uncertainty** — materially higher `IncomeVolatility` and realized income variance than stable profiles.

Shocks are applied only when `IsFutureOutcome == True`. Historical months are never mutated by future shocks.

### `TargetFeasibleUnderRealizedSavings`

Despite the historical name, the flag is computed from **constraints**, not from whether the generator happened to post savings:

- Over the forecast horizon, with discretionary spending set to 0  
- Paying essential expenses + EMI each month  
- Keeping closing balance ≥ `MinimumReserve`  
- Maximize cumulative savings; compare to `SavingsTarget`

## Train / validation / leakage

| Available at prediction time | Evaluation / labels only |
|------------------------------|---------------------------|
| Historical `monthly_finances` rows (`IsFutureOutcome == False`) | Future monthly rows |
| Historical transactions | `ShockMonth`, shock magnitudes |
| User profile fields (income type, base income, volatility, EMI, reserve, target) | `FinalActualBalance`, `MinimumActualBalance`, `ReserveViolated` |
| Obligations schedule | `TargetFeasibleUnderRealizedSavings`, `InitialForecastBalance` (baseline comparator) |

`dataset_meta.json` lists evaluation-only columns. The adapter’s `historical_only=True` path drops post-forecast transactions for engine/feature use.

## Random seed

`numpy.random.default_rng(seed)` drives profile sampling, shock timing/amounts, payment modes, and within-month dates. The same seed and config reproduce identical DataFrames and CSV exports.

## Downstream consumption (future modules)

These modules are **not** implemented in this task; the datasets are shaped for them:

| Module | Planned use |
|--------|-------------|
| `forecasting.py` | Provider seam (`run_rate` / `ml`). Daily path: `GET /analytics/cash-flow/daily`. Monthly outlook: `GET /analytics/cash-flow/forecast?horizon_months=1|3|6` (engine run-rates + Monte Carlo shortfall; ML swap via `FORECAST_PROVIDER`). |
| `scenario_simulator.py` | Apply scenario metadata (`IncomeReductionPct`, unexpected expense) onto forecast paths |
| `action_planner.py` | Choose discretionary / savings actions subject to reserve + EMI constraints |
| `plan_evaluator.py` | Score plans using realized future outcomes and feasibility flags |
| `evaluation.py` | Aggregate metrics across the five scenario types |

Use `synthetic_adapter.transactions_frame_to_engine` when calling the existing `financial_intelligence.engine` helpers.

## Category mapping (Assay-aligned)

Essential: Housing & Rent, Groceries, Utilities, Transportation, Healthcare  
Discretionary: Food & Dining, Shopping, Subscriptions, Entertainment  
Other: Salary (income), Debt & EMI, Savings Transfer  

Payment modes: UPI, Credit Card, Debit Card, Cash, Net Banking, Wallet.
