# Assay --- Architecture Blueprint

## Architecture Goal

Assay is a mobile-first Financial Health Copilot. The system separates
ingestion, normalization, financial calculations, AI interpretation,
recommendations, and impact simulation.

**Core rule:** the LLM explains financial intelligence; it is not the
source of truth for financial calculations.

## System Overview

``` text
Assay Mobile (Expo)
        ↓ HTTPS
FastAPI
 ├── Ingestion Services
 │    ├── Mock AA Adapter
 │    └── OCR/Upload
 ├── Financial Intelligence
 │    ├── Analytics Engine
 │    ├── Forecasting
 │    ├── Recommendations
 │    └── Impact Simulation
 └── Copilot
      └── LLM Provider
        ↓
PostgreSQL
```

## Data Provider Strategy

Use an interface such as:

``` text
FinancialDataProvider
    ├── MockAAProvider       ← 15-day MVP
    └── ProductionAAProvider ← future
```

This prevents production ecosystem onboarding from blocking the
prototype.

## Processing Pipeline

1.  Ingest raw records.
2.  Normalize into one internal transaction schema.
3.  Categorize transactions.
4.  Enrich merchants, recurring payments, fixed/variable status,
    discretionary status, income, and debt/EMI signals.
5.  Calculate deterministic financial-health metrics.
6.  Forecast future cash flow.
7.  Generate candidate recommendations.
8.  Simulate recommendation impact.
9.  Use the Copilot to explain structured results.

## Intelligence Layers

``` text
Raw Data
 ↓
Normalization
 ↓
Classification
 ↓
Financial Metrics
 ↓
Risk/Opportunity Detection
 ↓
Prediction
 ↓
Recommendation
 ↓
Impact
 ↓
Copilot Explanation
```

## Backend Structure

``` text
backend/
├── app/
│   ├── main.py
│   ├── core/
│   ├── api/routes/
│   │   ├── auth.py
│   │   ├── accounts.py
│   │   ├── transactions.py
│   │   ├── analytics.py
│   │   ├── copilot.py
│   │   ├── recommendations.py
│   │   └── uploads.py
│   ├── models/
│   ├── schemas/
│   ├── repositories/
│   ├── services/
│   │   ├── ingestion/
│   │   ├── categorization/
│   │   ├── financial_health/
│   │   ├── forecasting/
│   │   ├── recommendations/
│   │   ├── impact/
│   │   └── copilot/
│   └── providers/
│       ├── aa/mock_provider.py
│       └── llm/
└── tests/
```

## Mobile Structure

``` text
app/
├── _layout.tsx
├── index.tsx
├── (tabs)/
│   ├── index.tsx
│   ├── analytics.tsx
│   ├── upload.tsx
│   ├── transactions.tsx
│   └── settings.tsx
├── copilot/index.tsx
├── transaction/[id].tsx
└── split/index.tsx

components/
├── ui/
├── dashboard/
├── analytics/
├── transactions/
├── copilot/
└── recommendations/
```

## Copilot Architecture

Never allow the LLM to directly query the database.

``` text
User Question
 ↓
Copilot API
 ↓
Intent / parameter extraction
 ↓
Financial service query
 ↓
Deterministic calculation
 ↓
Structured result
 ↓
LLM explanation
 ↓
Mobile UI
```

Example affordability query:

``` text
"Can I afford ₹15,000?"

LLM identifies intent and amount.
Financial engine calculates current and projected position.
API returns structured facts.
LLM explains the result and limitations.
```

## Recommendation Architecture

``` text
Financial State
 ↓
Rules / Analysis
 ↓
Candidate Actions
 ↓
Impact Simulation
 ↓
Recommendation
 ↓
Copilot Explanation
```

Every recommendation should remain explainable from structured facts.

## Core Information Contract

The system must preserve:

``` text
OBSERVED
What the data says.

PREDICTED
What the system estimates.

RECOMMENDED
What Assay suggests considering.

IMPACT
What the proposed action is expected to change.
```
