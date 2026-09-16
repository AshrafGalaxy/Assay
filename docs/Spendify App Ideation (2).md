# Assay --- Development Journal

## Current Product Direction

Assay is now primarily a **Financial Health Copilot** for the hackathon
problem statement: **From Transactions to Action**.

The previous expense-tracking functionality remains useful, but it is
now an ingestion and intelligence foundation rather than the whole
product.

## Critical Path

``` text
Financial Data
 ↓
Normalization
 ↓
Categorization
 ↓
Financial Health Engine
 ↓
Cash-flow Forecast
 ↓
Copilot
 ↓
Recommendation
 ↓
Impact Simulation
```

## Existing Completed Work

-   Expo mobile application.
-   TypeScript.
-   Shared typography and component system.
-   Antic Didone for editorial/page titles.
-   DM Sans for primary financial UI.
-   Dashboard, Upload, Transactions, Insights, Settings and modal flows.
-   Shared cards, buttons, headers, chips, inputs and transaction rows.
-   FastAPI/PostgreSQL/SQLAlchemy architecture documented.

## Product Reframe

Previous: `Receipt/UPI → OCR → Categorization → Expense Dashboard`

New:
`Financial History → Financial Health → Prediction → Recommendation → Expected Impact → Action`

## AA Strategy

Production Account Aggregator integration must not block the 15-day
build.

Implement:

``` text
FinancialDataProvider
        ↓
MockAAProvider
```

The mock provider should return realistic account and transaction data.
A production provider can later implement the same interface.

## Current P0

1.  Mock/sandbox financial data
2.  Transaction normalization
3.  Categorization
4.  Financial Health Engine
5.  Cash-flow projection
6.  Dashboard
7.  Natural-language Copilot
8.  Recommendation Engine
9.  Impact Simulation
10. Confidence/provenance

## P1

1.  Receipt OCR
2.  UPI screenshot parser
3.  Improved recurring detection
4.  Advanced analytics

## P2

1.  Smart Split
2.  RAG
3.  Custom ML models
4.  Production AA integration

## Immediate Next Task

1.  Define database models.
2.  Create seeded financial dataset.
3.  Build transaction normalization.
4.  Implement deterministic financial calculations.
5.  Expose `/api/v1/financial-health`.
6.  Connect dashboard to live backend data.

## Session Log Template

``` text
## YYYY-MM-DD — Session Title

### Completed
- ...

### Files Changed
- ...

### Decisions
- ...

### Problems
- ...

### Next Task
- ...
```
