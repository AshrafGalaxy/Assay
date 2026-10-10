# Assay Financial Intelligence Hub

## Product, UI, Financial Logic, and Edge-Case Specification

**Document purpose:** Define the user experience, financial
calculations, shared backend behavior, edge-case handling, and
acceptance criteria for Assay's Cash Flow Forecast and four connected
Financial Intelligence pages.

**Product principle:** Assay should explain where a user's finances are
heading, identify what could go wrong, explain why, and help the user
compare practical next actions. It must not present uncertain
predictions as facts or label a user financially safe based only on a
positive expected balance.

------------------------------------------------------------------------

## 1. Product Overview

Assay is a Financial Health Copilot that transforms financial history
into a forward-looking view of cash, obligations, risk, and possible
actions.

The experience is built around five user questions:

1.  **Where do I stand?** --- Current available cash, income, expenses,
    and debt.
2.  **Where am I heading?** --- Projected balances across 1, 3, and 6
    months.
3.  **Could I run short?** --- Potential inability to cover obligations
    or stay above the user's safety buffer.
4.  **Why might that happen?** --- A concise explanation grounded in
    records and calculations.
5.  **What can I do?** --- Compare alternatives in the What-If
    Simulator.

### Product principles

-   Keep the default UI minimal and easy to scan.
-   Show the most important financial status first.
-   Keep detailed calculations and secondary insights accessible on
    demand.
-   Distinguish observed facts, forecasts, hypothetical scenarios, and
    recommendations.
-   Use the same financial state and calculation engine across all
    connected pages.
-   Never fabricate numbers, model confidence, or feasibility results.
-   Do not silently relax a user's constraints to make a plan appear
    feasible.
-   Explain missing data, degraded forecasts, and uncertainty plainly.
-   Treat financial safety as a combination of cash availability,
    payment timing, obligations, buffer, and forecast uncertainty---not
    simply a positive closing balance.

------------------------------------------------------------------------

## 2. Shared Architecture and Responsibilities

Assay should use one shared financial state and one authoritative
financial calculation pipeline.

### 2.1 Data and ledger layer

Inputs may include:

-   Current account balances and available cash.
-   Historical transactions.
-   Income records, including irregular and one-time income.
-   Essential and discretionary expenses.
-   Recurring bills and known upcoming payments.
-   Debt balances, interest rates, minimum payments, EMIs, due dates,
    and remaining terms.
-   Savings goals and contributions.
-   User-declared safety buffer.
-   Confirmed future events and hypothetical events entered in the
    simulator.

Each input should retain its source, effective date, status, and
relevant confidence or completeness information.

The system must distinguish: - Confirmed transactions from pending
transactions. - Actual records from user-entered assumptions. -
Recurring income from one-time income. - Confirmed expenses from
possible expenses. - Transfers between the user's own accounts from
actual spending. - Refunds and reversals from new income.

### 2.2 ML forecasting layer

The ML layer estimates uncertain future values, such as variable income
and expenses. It may produce distributions or prediction intervals when
supported by the model and validation evidence.

It must not guess known contractual payments when reliable records
exist. Known obligations should be represented directly in the financial
state.

### 2.3 Deterministic financial engine

The financial engine is the authoritative source for: - Period-by-period
balances. - Obligations and cash availability. - Safety-buffer headroom
and breaches. - Debt and savings calculations. - Scenario comparisons. -
Constraint violations and infeasibility. - Shortfall estimates
calculated from valid simulated paths.

Critical financial arithmetic and hard constraints must not be delegated
to an LLM.

### 2.4 AI insight layer

The AI layer explains structured outputs in plain language. It may
identify important factors and suggest actions to explore, but must not
invent financial values, probability estimates, or calculation results.

Recommendations should state their assumptions and avoid implying
certainty where the underlying forecast is uncertain.

### 2.5 Shared pipeline

1.  Validate and reconcile new data.
2.  Update the financial state without double-counting.
3.  Produce forecasts for uncertain future values.
4.  Calculate balances and obligations deterministically.
5.  Evaluate safety-buffer and other constraints.
6.  Estimate risk from valid forecast scenarios.
7.  Generate grounded explanations.
8.  Return the same versioned results to the relevant pages.

------------------------------------------------------------------------

## 3. Core Financial Definitions and Calculations

### 3.1 Cash balance

A basic period-level calculation is:

`Closing cash = Opening cash + Cash inflows - Cash outflows`

A more explicit representation is:

`B[t] = B[t-1] + I[t] - E[t] - D[t] + S[t]`

Where: - `B[t]` is closing cash for period `t`. - `I[t]` is income
received in the period. - `E[t]` is expenses paid in the period,
excluding debt payments if tracked separately. - `D[t]` is debt payments
not already included in `E[t]`. - `S[t]` is the net effect of additional
events, positive for inflows and negative for outflows.

**Accounting rule:** Never subtract an EMI twice. If total expenses
already include debt payments, do not subtract them again as `D[t]`.

A consolidated financial view should not treat a transfer between a
user's own accounts as an expense. The application should separately
identify spendable cash, total liquid funds, and any other balance
definitions used by the product.

### 3.2 Timing matters

Monthly aggregates can hide a shortfall that occurs before payday. Where
transaction dates and payment dates are available, calculate a daily or
event-level cash path for near-term obligations. Monthly views can
summarize the result but should not replace timing checks for imminent
payments.

### 3.3 Monthly surplus

`Monthly surplus = Income - Essential expenses - Mandatory debt payments - Discretionary spending`

Make clear whether planned savings contributions are already included.
Moving money to the user's own savings account is generally an
allocation, not a consolidated financial expense.

### 3.4 Safety buffer

Use **Safety Buffer** in user-facing wording instead of "minimum
reserve."

The safety buffer is the amount the user aims to keep available for
unexpected needs and financial resilience. It may be user-defined or
suggested using essential expenses, mandatory debt payments, income
stability, and user circumstances. Any suggested amount must explain its
basis and be editable.

`Buffer headroom = Projected available cash - Safety Buffer`

-   Positive headroom means projected cash is above the buffer.
-   Zero headroom means projected cash is at the threshold.
-   Negative headroom means the buffer is breached.

A positive headroom at the expected value does not guarantee safety
under uncertain outcomes.

### 3.5 Shortfall probability

For `N` valid simulated future paths, define a reserve-breach event as
at least one relevant period falling below the safety buffer:

`Estimated breach probability = Paths with at least one breach / N`

The selected horizon and event definition must be displayed or
documented. This is a model-based estimate under declared assumptions,
not a guarantee of the user's real-world outcome.

Do not invent probability percentages. If there are too few reliable
scenarios or insufficient validation, disclose that risk cannot be
estimated reliably.

### 3.6 Prediction ranges

Use prediction intervals or distributions only when supported by the
forecasting method. State the interval level and what it represents.
Evaluate interval coverage and width on held-out data. Do not call a
range a "confidence interval" unless that is statistically appropriate.

### 3.7 Safe-status policy

A user-facing status should consider: - Whether essential expenses and
mandatory payments can be covered. - Whether cash falls below the safety
buffer. - When a shortfall occurs, including payment timing. - The
estimated probability and severity of a breach. - Data completeness and
model reliability.

Example status labels: - **Looking good:** Expected cash stays above the
buffer and estimated risk is low under the declared policy. - **Keep an
eye on your cash:** The expected path may be acceptable, but some
plausible outcomes breach the buffer. - **Your cash may fall short:** A
breach or inability to cover obligations is projected.

Thresholds must be explicit and configurable for the product. Do not
present a prototype threshold as a universal financial rule. An imminent
confirmed payment shortfall may deserve higher priority than a
lower-probability event later in the horizon.

------------------------------------------------------------------------

## 4. UI Language and Information Hierarchy

### 4.1 Preferred user-facing wording

  Technical or current wording   Preferred wording
  ------------------------------ --------------------------
  Projected Ending Cash          Expected Cash
  Minimum Reserve                Safety Buffer
  Reserve Risk                   Risk of Running Short
  Reserve Headroom               Money Above Buffer
  Expected Shortfall             Possible Cash Shortage
  Monthly Outflows               Monthly Spending & Bills
  Monthly Surplus                Money Left Each Month
  Projected Cash Balance         How Your Cash May Change
  Prediction Interval            Possible Cash Range
  Replanning                     Update My Plan
  Constraint Violation           Your Plan Has a Problem
  Infeasible Goal                Goal May Be Out of Reach
  Forecast Degraded              Forecast Is Limited
  Deterministic Baseline         Simple Estimate

Keep technical terms available in details or evidence views where
needed, but use plain language in primary UI copy.

### 4.2 Page hierarchy

The Cash Flow Forecast should answer these questions in order:

1.  **Financial status:** Expected cash and safety-buffer status.
2.  **Forecast:** Cash trajectory over 1, 3, or 6 months.
3.  **Key numbers:** Income, spending, debt obligations, and safety
    buffer.
4.  **Assay insight:** The most important supported explanation.
5.  **Next action:** Open What-If Simulator.
6.  **Detailed analysis:** Period-level breakdown, uncertainty,
    assumptions, and additional insights on demand.

Display only a small number of high-priority insights by default. Avoid
repeating the same warning in summary cards, insight cards, and risk
cards.

### 4.3 Visual design principles

-   Preserve Assay's warm off-white background, dark navy surfaces,
    restrained gold accents, and established typography.
-   Use consistent spacing, radii, and grid rules.
-   Make comparable cards equal in height and width within their row.
-   Allow content-driven height where text length differs.
-   Prevent text clipping, overlap, and horizontal overflow.
-   Keep charts responsive and labels fully visible.
-   Respect device safe areas and ensure bottom navigation does not
    obscure content.
-   Avoid excessive card nesting, oversized warning panels, redundant
    metadata, and arbitrary fixed heights.
-   Use green, amber, and red meaningfully and never use color alone to
    convey status.
-   Provide loading, empty, error, stale-data, and limited-data states.

------------------------------------------------------------------------

## 5. Page 1 --- Cash Flow Forecast

### Purpose

Show where the user's cash may be heading, whether obligations remain
coverable, and whether their safety buffer could be breached.

### Default content

1.  Title: **Cash Flow Forecast**
2.  Subtitle: "See what's ahead. Prepare before it happens."
3.  Horizon selector: **1 Month**, **3 Months**, **6 Months**
4.  Primary metrics:
    -   Expected Cash at the end of the selected horizon.
    -   Risk of Running Short, based on calculated evidence.
5.  Secondary metrics:
    -   Lowest expected balance.
    -   Monthly income.
    -   Monthly spending and bills.
    -   Safety buffer.
    -   Money above buffer, where useful.
6.  Cash trajectory chart:
    -   Observed history where useful.
    -   Expected future path.
    -   Possible cash range when validated.
    -   Safety-buffer line.
    -   Selectable period details.
7.  One primary Assay insight.
8.  Compact link to What-If Simulator.
9.  Expandable detailed analysis and assumptions.

### Horizon behavior

-   **1 Month:** Immediate liquidity, due dates, upcoming bills, and
    near-term shortfalls.
-   **3 Months:** Financial stability, recurring obligations, and
    savings capacity.
-   **6 Months:** Longer-term liquidity, savings progress, income
    uncertainty, and goal feasibility.

The backend should support at least six monthly periods for the
HackMatrix planning requirement. Shorter views should simply show a
shorter window of the same underlying state.

### Forecast insights

Examples, only when supported by results: - "Your cash is expected to
grow." - "Your cash may fall below your safety buffer in Month 2." -
"Your starting cash is already below your safety buffer." - "Your
savings goal may be too ambitious for this timeline."

Each insight should identify the relevant period and explain the main
reason without repeating every metric.

------------------------------------------------------------------------

## 6. Page 2 --- Debt & Liabilities

### Purpose

Help users understand what they owe, the cost of debt, upcoming
repayments, and repayment options that do not jeopardize essential cash
needs.

### Key information

-   Total outstanding debt.
-   Monthly mandatory repayments.
-   Individual debts with balances, interest rates, minimum payments,
    due dates, and terms where available.
-   Repayment progress and estimated payoff dates where calculable.
-   Upcoming payment obligations.
-   A concise insight about the most material debt consideration.

### Repayment strategies

Support comparisons such as: - **Debt avalanche:** Direct additional
repayment toward the highest-interest debt after mandatory payments. -
**Debt snowball:** Direct additional repayment toward the smallest
balance, subject to the user's preferences and contractual terms. -
**Minimum payments only:** A baseline for comparison. - **Extra
repayment plan:** An explicit user-defined additional payment.

Show the trade-offs: estimated interest, payoff timeline, cash retained,
and safety-buffer risk.

### Edge cases

-   Missing or unknown interest rate.
-   Variable interest rate.
-   Missing EMI, minimum payment, due date, or loan term.
-   Zero-interest debt.
-   Promotional credit-card rates that expire.
-   Late or missed payments.
-   Debt balance inconsistent with transaction history.
-   Debt paid off before the end of the forecast.
-   Extra repayment not permitted or subject to fees.
-   Several debts with different due dates.
-   Minimum payments that consume too much available cash.
-   Proposed repayment that causes a safety-buffer breach.
-   Duplicate debt records.
-   A payment that appears in both transactions and a debt schedule.

Do not claim exact interest savings or payoff dates when required loan
terms are missing. Explain assumptions and use a limited estimate where
appropriate. Keep contractual minimum payments and hard constraints
intact.

------------------------------------------------------------------------

## 7. Page 3 --- What-If Simulator

### Purpose

Let users compare financial action sequences and see how decisions
affect future balances, debt, goals, and shortfall risk.

### Required planning capability

Plan across at least six monthly or eight weekly periods. For each
action plan, show: - Opening and closing cash by period. - Income and
expense assumptions. - Essential expenses and mandatory debt payments. -
Discretionary spending. - Savings contributions and additional debt
repayments. - Safety-buffer status by period. - Expected cash path and
uncertainty where supported. - Estimated shortfall risk. - Important
trade-offs and constraints.

Compare at least two action sequences, for example: - Plan A: Preserve
more cash and reduce flexible spending. - Plan B: Make larger extra debt
repayments.

### Editable scenario inputs

-   Income amount, timing, and whether a change is one-time or
    recurring.
-   Essential expense changes.
-   Discretionary spending changes.
-   One-off expenses or inflows.
-   Savings contributions and goals.
-   Additional debt repayments where permitted.
-   Safety buffer.
-   Forecast horizon.

### Replanning behavior

When an assumption changes: 1. Preserve the original plan as a
comparison baseline. 2. Apply the new assumption only to the relevant
periods. 3. Recalculate all affected balances and constraints. 4.
Recalculate shortfall risk using the updated scenario distribution when
available. 5. Explain which outputs changed and why. 6. Show
infeasibility rather than silently relaxing constraints.

### Edge cases

-   Income reduction or increase.
-   One-time bonus incorrectly treated as recurring income.
-   Unexpected essential expense.
-   Expense entered twice.
-   Event date before the current date.
-   Event overlaps with a recorded transaction.
-   User changes the safety buffer mid-scenario.
-   Negative cash balance.
-   Mandatory obligations exceed available resources.
-   Savings goal conflicts with debt payments or minimum cash.
-   Plan becomes infeasible in a later period.
-   User tries to reduce a contractual payment below its required
    amount.
-   Invalid amounts or impossible dates.
-   ML service failure during scenario evaluation.
-   User changes inputs repeatedly before recalculation completes.
-   Results from an older request arrive after a newer scenario has been
    selected.

The UI should clearly identify the original plan and revised plan.
Prevent stale calculations from overwriting newer inputs.

### Infeasibility response

If all goals and constraints cannot be met, return: - The affected
period. - The shortfall amount or conflicting constraints. - Which
constraints are mandatory. - Which user goals could be relaxed. -
Explicit alternatives, such as lowering a savings target, extending a
timeline, reducing discretionary spending, or changing an optional extra
repayment.

Never silently relax contractual obligations, access rules, or the
safety constraints designated as hard requirements.

------------------------------------------------------------------------

## 8. Page 4 --- Affordability Check

### Purpose

Answer a concrete question such as "Can I afford this purchase?" by
calculating its effect on cash, obligations, and risk.

### Inputs

-   Purchase amount.
-   Payment date.
-   Payment type: one-time, EMI, or recurring expense.
-   EMI amount, term, rate, fees, and down payment where relevant.
-   Current available cash.
-   Income and expected payment timing.
-   Essential expenses and debt obligations.
-   Safety buffer.
-   Forecast uncertainty.

### Result states

-   **Looks affordable:** The purchase fits the forecast and the
    estimated risk remains within the declared policy.
-   **Affordable with caution:** The purchase reduces buffer headroom or
    increases shortfall risk.
-   **Your cash may fall short:** The purchase causes a projected
    shortfall or violates a hard constraint.
-   **Not enough information:** Required financial inputs are missing or
    unreliable.

### Edge cases

-   Purchase amount missing or invalid.
-   Zero or negative amount.
-   EMI lower than required fees or inconsistent with the loan terms.
-   Unknown interest rate or term.
-   Promotional EMI or deferred payment.
-   Down payment plus future EMI commitments.
-   Recurring subscription with an uncertain end date.
-   One-time payment occurs before the next income.
-   Purchase is refundable or partially refundable.
-   Existing purchase is already represented in the ledger.
-   User's balance is split across accounts.
-   Some cash is unavailable, pending, or restricted.
-   Affordability differs between expected and adverse scenarios.
-   The user has insufficient history for a reliable risk estimate.

Do not return a simplistic "yes" based only on current balance or
average monthly surplus. Show the expected impact, timing, safety-buffer
effect, and uncertainty. If evidence is incomplete, say so.

------------------------------------------------------------------------

## 9. Page 5 --- Copilot Intelligence

### Purpose

Explain the user's financial state, answer natural-language questions,
and provide traceable recommendations based on verified records and
calculated outputs.

### Recommended answer structure

Separate every material response into: 1. **What we know:** Observed
facts from transactions, account balances, and debt records. 2. **What
may happen:** Forecasts, possible ranges, and risk estimates. 3. **What
you can do:** Recommendations or scenarios to explore. 4. **Why this
answer:** Relevant inputs, calculation outputs, assumptions, and
limitations.

### Example

**Your cash may run short next month.**

-   What we know: Scheduled debt payments and essential bills account
    for a significant portion of recorded income.
-   What may happen: Under the current forecast, lower-than-expected
    income could push cash below the safety buffer.
-   What you can do: Compare a reserve-first plan with additional debt
    repayment in What-If Simulator.
-   Why: Link to the relevant forecast period, recorded obligations, and
    scenario calculation.

Only show the parts supported by available evidence.

### Edge cases

-   User asks about data not present in the ledger.
-   Ambiguous question or unspecified time horizon.
-   Conflicting transaction or debt records.
-   Missing source attribution.
-   Forecast is stale.
-   ML or AI service is unavailable.
-   AI output contradicts deterministic calculations.
-   AI produces unsupported amounts or probabilities.
-   User asks for a guarantee about future finances.
-   Prompt injection or untrusted instructions embedded in imported
    transaction descriptions.
-   Sensitive financial information should not be unnecessarily
    repeated.
-   Recommendation could violate a contractual or hard constraint.
-   The model cannot distinguish an observed fact from an inference.

The AI must not be the final authority for financial calculations.
Validate output against structured results, and suppress or correct
unsupported claims. If the AI service fails, keep deterministic results
visible and provide a clear fallback explanation.

### Auditable recommendations

Where feasible, retain: - Relevant input identifiers and timestamps. -
Calculation or forecast version. - Model/API identity and version. -
Assumptions and parameters. - Resulting risk and balance metrics. -
Recommendation text and its supporting evidence.

Do not describe an answer as "audited" merely because it includes
explanatory text.

------------------------------------------------------------------------

## 10. Cross-Page Edge-Case and Fallback Policy

### 10.1 Income suddenly falls

Example: monthly income drops from ₹50,000 to ₹30,000.

-   Apply the change from its effective date.
-   Distinguish a one-time reduction from a recurring income change.
-   Recalculate all affected periods and payment-timing checks.
-   Reassess safety-buffer headroom and shortfall risk.
-   Preserve essential expenses and mandatory debt payments as
    obligations.
-   Evaluate changes to discretionary spending, voluntary savings, or
    optional extra repayments.
-   If essential obligations cannot be covered, report the exact
    conflict and affected period.

Do not assume the income will recover unless supported by an explicit
scenario or reliable input.

### 10.2 Income suddenly rises

Example: the user receives a ₹40,000 bonus.

-   Classify it as one-time unless recurring status is confirmed.
-   Add it to the correct period and date.
-   Recalculate cash and buffer headroom.
-   Evaluate savings or debt repayment options.
-   Do not increase future recurring income merely because a bonus
    arrived.
-   If income is expected but unconfirmed, treat it as a scenario rather
    than guaranteed cash.

### 10.3 Unexpected large essential expense

Example: a ₹35,000 repair bill.

-   Record it once and apply it on the due date.
-   Recalculate near-term cash and future monthly balances.
-   Identify whether it causes an immediate or later buffer breach.
-   Compare possible responses, but do not hide the shortfall.
-   If payment timing is unknown, show the assumption or ask the user to
    confirm it.

### 10.4 Confirmed versus hypothetical events

-   **Confirmed event:** Include in the updated forecast.
-   **Hypothetical event:** Include only in the selected scenario; do
    not alter the user's actual ledger.
-   **Possible future event:** Model as uncertainty only when the model
    has a defensible basis; otherwise allow the user to test it as a
    scenario.

### 10.5 ML service failure

Use a documented fallback hierarchy:

1.  Valid ML forecast and validated uncertainty estimates.
2.  A documented historical-average or recurring-payment baseline when
    sufficient data exists.
3.  User-provided assumptions plus known obligations when history is
    sparse.
4.  Known-value deterministic calculations when uncertain prediction is
    unavailable.
5.  Limited or unavailable forecast when evidence is insufficient.

A deterministic fallback can calculate consequences from known values;
it cannot replace missing knowledge of uncertain future income. Do not
display a normal-looking risk percentage if risk cannot be estimated
reliably.

### 10.6 Incomplete or inconsistent data

-   Flag missing income history, debt terms, payment dates, or opening
    balances.
-   Distinguish zero from unknown.
-   Avoid silently substituting zero for missing data.
-   Detect duplicate transactions and transfers between owned accounts.
-   Handle refunds and reversals according to their relationship to the
    original transaction.
-   Identify conflicting sources and apply a documented precedence rule.
-   Show which outputs are limited by missing data.

### 10.7 Forecast uncertainty and calibration

-   Generate scenarios without leaking future outcomes into predictors.
-   Keep training, validation, and held-out test periods separate.
-   Compare against a simple historical-average or recurring-payment
    baseline.
-   Report forecast errors, interval coverage, and interval width.
-   Declare units, labels, thresholds, sample counts, and denominators.
-   Evaluate on later periods for time-series forecasts.
-   Document at least one failure or limitation.
-   Do not treat a small number of demo scenarios as a statistically
    sufficient benchmark.

### 10.8 Data freshness and concurrency

-   Display when the forecast was last updated.
-   Recompute or mark results stale after material financial changes.
-   Ensure the UI does not combine results from different ledger
    versions.
-   Prevent older asynchronous requests from overwriting newer scenario
    results.
-   Handle network timeouts and retries without duplicating events.
-   Make event processing idempotent so the same transaction or change
    is not applied twice.

### 10.9 Privacy and security

-   Apply least-privilege access to financial records.
-   Do not expose one user's data to another user.
-   Avoid logging full account identifiers or unnecessary transaction
    descriptions.
-   Keep secrets out of client code and logs.
-   Treat imported transaction descriptions and external text as
    untrusted data.
-   Explain the data used for an insight without revealing unrelated
    sensitive information.

------------------------------------------------------------------------

## 11. Shared API and Data-Contract Expectations

Inspect existing endpoints and schemas before introducing new ones.
Reuse existing services and make the smallest compatible extensions.

A forecast response should provide the fields needed by the UI, where
available:

-   Forecast ID/version and generation timestamp.
-   Ledger or financial-state version.
-   Horizon and period labels.
-   Opening and closing cash by period.
-   Income and expense forecasts.
-   Essential expenses and mandatory debt obligations.
-   Discretionary spending and savings allocations.
-   Safety buffer and headroom.
-   Expected path and prediction ranges.
-   Shortfall probability and event definition, when supported.
-   Risk flags and affected periods.
-   Data completeness and freshness indicators.
-   Fallback mode and limitations.
-   Structured insight inputs and supporting evidence.

A scenario response should additionally include: - Scenario ID and
assumptions. - Original-plan reference. - Period-level plan results. -
Constraint checks and violations. - Feasibility status. - Trade-offs
between action plans. - Forecast/risk method used. - Any model or
calculation errors.

Use typed frontend models that match actual backend contracts. Keep
financial calculations in the backend rather than duplicating them in UI
components.

------------------------------------------------------------------------

## 12. HackMatrix Demonstration Scenarios

At minimum, demonstrate these four required conditions end to end, and
add positive-change and service-failure cases where possible.

### Scenario 1: Stable income

-   Recurring income and obligations remain consistent.
-   Show the expected cash trajectory.
-   Compare the ML forecast against the baseline on held-out data.
-   Show the safety-buffer assessment.

### Scenario 2: Income reduction

-   Apply a confirmed or simulated reduction in income.
-   Recalculate all affected periods.
-   Show how shortfall risk changes.
-   Compare at least two feasible action sequences where possible.

### Scenario 3: Unexpected essential expense

-   Add a large one-time expense.
-   Show the payment's effect on the near-term cash path.
-   Detect any safety-buffer breach.
-   Explain the options and trade-offs.

### Scenario 4: Infeasible target

-   Set a savings or repayment goal that conflicts with current
    resources and hard constraints.
-   Show the conflicting period and quantified deficit.
-   Identify which goal can be relaxed.
-   Do not silently modify mandatory obligations or the safety buffer.

### Additional recommended scenarios

-   One-time bonus versus recurring salary increase.
-   Income drops while an EMI is due before payday.
-   Opening cash already below the safety buffer.
-   ML service unavailable.
-   Insufficient history to estimate uncertainty.
-   Duplicate event submission.
-   A forecast update arrives while a newer scenario is being
    calculated.

For every scenario, retain inputs, assumptions, generated outputs,
expected outcomes, and replay logs.

------------------------------------------------------------------------

## 13. Acceptance Criteria

### UI and usability

-   [ ] Each page has one clear purpose and primary action.
-   [ ] Primary financial status is understandable within seconds.
-   [ ] Technical terminology is replaced with plain language in primary
    UI.
-   [ ] Redundant warnings and repeated figures are removed.
-   [ ] Cards are proportional and align consistently.
-   [ ] Long values and text do not overlap or clip.
-   [ ] Charts and labels fit mobile and larger layouts.
-   [ ] Bottom navigation respects safe areas and never obscures
    content.
-   [ ] Loading, empty, error, stale, and limited-data states are
    implemented.
-   [ ] Detailed analysis remains accessible without overwhelming the
    default view.

### Financial correctness

-   [ ] Balance calculations use consistent accounting definitions.
-   [ ] EMIs and transactions are never double-counted.
-   [ ] Transfers between owned accounts are not treated as consolidated
    spending.
-   [ ] Payment timing is considered for near-term shortfalls.
-   [ ] Safety-buffer headroom is calculated correctly.
-   [ ] Risk estimates have a declared method and horizon.
-   [ ] Unknown data is not silently treated as zero.
-   [ ] Hard constraints are enforced.
-   [ ] Infeasible plans are explicitly reported.
-   [ ] One-time events do not become recurring without confirmation.

### ML and AI integrity

-   [ ] Forecasts use real backend outputs rather than hardcoded UI
    values.
-   [ ] Uncertainty is represented and evaluated appropriately.
-   [ ] A simple baseline is evaluated on the same held-out inputs.
-   [ ] Future data does not leak into predictors.
-   [ ] AI insights are grounded in structured calculation results.
-   [ ] Facts, predictions, and recommendations are distinguished.
-   [ ] Fallback behavior is explicit and does not invent confidence.
-   [ ] At least one limitation or unsuccessful case is documented.

### Integration

-   [ ] All pages use the same financial state and calculation pipeline.
-   [ ] Material financial changes trigger updated results or mark them
    stale.
-   [ ] What-If scenarios do not modify the actual ledger unless
    explicitly confirmed.
-   [ ] Older asynchronous results cannot overwrite newer scenarios.
-   [ ] Tests cover the four required HackMatrix scenarios.
-   [ ] Setup instructions, model identity, dataset assumptions,
    evaluation splits, commands, and results are documented.

------------------------------------------------------------------------

## 14. Recommended Implementation Order

1.  **Establish financial data contracts and calculation correctness.**
2.  **Implement the shared period-level cash-flow engine and
    safety-buffer checks.**
3.  **Integrate probabilistic forecasting and baseline evaluation.**
4.  **Build What-If Simulator and explicit infeasibility handling.**
5.  **Connect Cash Flow Forecast to the same calculation pipeline.**
6.  **Build Affordability Check on the shared engine.**
7.  **Connect Debt & Liabilities to repayment schedules and scenario
    analysis.**
8.  **Build Copilot Intelligence using structured evidence and
    calculated outputs.**
9.  **Add edge-case tests, scenario replay, and UI regression checks.**
10. **Package reproducible evidence for HackMatrix judging.**

------------------------------------------------------------------------

## Final Product Principle

Assay should not simply tell users that their cash balance is going up
or down.

It should tell them:

-   **What is likely to happen.**
-   **What could go wrong and when.**
-   **Why the system believes that.**
-   **How reliable the estimate is.**
-   **Which actions could improve the outcome.**
-   **What trade-offs or constraints those actions create.**

ML predicts uncertain future values. The deterministic financial engine
calculates consequences and enforces constraints. The AI layer explains
the evidence. The What-If Simulator helps the user compare decisions.

The experience is successful when a user can understand their financial
position, recognize a potential problem, and compare a practical next
step without needing to understand the underlying mathematics.
