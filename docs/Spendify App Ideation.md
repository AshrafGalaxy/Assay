# Assay --- Product Requirements Document

## Vision

Assay is an AI-powered Financial Health Copilot that turns financial
history into clear, explainable actions.

Instead of only recording transactions, Assay builds a consolidated view
of income, expenses, recurring obligations, debt pressure, savings
behaviour, and cash-flow patterns. It answers natural-language financial
questions and shows the expected impact of recommended actions.

Core loop:
`Financial Data → Normalize → Categorize → Financial Health → Prediction → Recommendation → Impact → Action → Recalculate`

## Hackathon Alignment

The MVP directly targets: - consolidated financial-health view; -
spending patterns and recurring obligations; - debt pressure and future
cash-flow gaps; - natural-language financial questions; - personalised
recommendations; - expected impact of recommendations; - separation of
observed facts, predictions, and recommendations; -
confidence/limitations for incomplete information; - changing
recommendations as new data arrives.

## Product Problem

People have financial information spread across bank accounts, cards,
loans, UPI payments, receipts, and payment histories, but often lack a
unified understanding of what that information means.

## Target Users

-   College students
-   Young professionals
-   Working adults
-   Freelancers

## Primary User Journey

1.  User imports financial data through a demo AA/sandbox adapter or
    uploads a receipt/UPI screenshot.
2.  Assay normalizes and categorizes the data.
3.  The Financial Health Engine calculates financial metrics.
4.  The dashboard explains the current position and future pressure.
5.  The user asks a natural-language question.
6.  The Copilot retrieves structured financial facts.
7.  Backend services perform deterministic calculations.
8.  Assay provides a recommendation where appropriate.
9.  The Impact Engine simulates the expected effect.
10. New financial data causes the analysis to recalculate.

## P0 Features

### 1. Financial Data Ingestion

Use a **sandbox/mock AA data adapter** for the 15-day prototype.
Production AA access must not be a critical-path dependency.

The adapter should provide realistic: - accounts; - transactions; -
income; - recurring obligations; - loan/EMI information where
applicable.

Receipt and UPI uploads remain secondary ingestion paths.

### 2. Transaction Normalization

Normalize raw records into: - merchant/payee; - amount; - transaction
type; - date/time; - category; - payment source; - account/source; -
transaction reference; - confidence/provenance.

### 3. Smart Categorization

Categories include Food & Dining, Groceries, Transport, Shopping, Bills
& Utilities, Entertainment, Health, Education, Rent, EMI/Debt, Income,
and Other.

### 4. Financial Health Engine

Calculate: - total income; - total spending; - savings; - savings
rate; - fixed vs variable spending; - discretionary spending; -
recurring obligations; - debt/EMI pressure; - category trends; -
projected cash flow; - upcoming cash-flow pressure.

### 5. Financial Health Dashboard

Show: - income; - spending; - savings; - savings rate; - upcoming
obligations; - category trends; - projected month-end balance; -
financial signals; - recommendations; - recent transactions.

### 6. Natural-Language Copilot

Example questions: - How much did I spend on food this month? - Why am I
saving less than last month? - What recurring payments do I have? - Can
I afford a ₹15,000 phone this month? - Where can I save ₹5,000? - What
will my balance look like next month? - What happens if I reduce food
delivery by ₹2,000?

The LLM interprets questions and explains results. Financial
calculations come from backend services.

### 7. Recommendation Engine

Recommendations must be based on observed data.

Example: - Observed: food delivery increased by ₹2,400. -
Recommendation: reduce food delivery by ₹2,000/month. - Expected impact:
+₹2,000 monthly cash buffer and +₹24,000 annualized savings potential.

### 8. Impact Simulation

Represent every material action as:
`Current state → Assumption/action → Projected state → Difference`

### 9. Confidence & Provenance

Explicitly distinguish: - **Observed** --- directly supported by data. -
**Predicted** --- calculated/estimated future outcome. - **Recommended**
--- action Assay suggests considering. - **Impact** --- expected change
under an assumption.

### 10. Receipt / UPI OCR

Retain receipt and UPI screenshot parsing as supporting ingestion:
`Image → Pre-processing → OCR → Parser → Transaction → Categorization → Confirmation`

## P1

-   Receipt OCR
-   UPI screenshot parser
-   Improved recurring-payment detection
-   Advanced analytics and charts

## P2

-   Smart Split
-   RAG
-   Custom ML models
-   Production AA integration

## Non-Goals for 15 Days

-   Production AA onboarding
-   Direct bank login or screen scraping
-   Investment management
-   Automated payments
-   Full accounting
-   Complex tax filing
-   Large custom ML training pipeline

## Demo Data

Use a seeded realistic dataset containing: - salary/income; - rent; -
EMIs; - groceries; - food delivery; - transport; - subscriptions; -
shopping; - recurring small purchases; - an upcoming cash-flow pressure
scenario.

## Hackathon Success Criteria

A judge should be able to see:
`transactions → financial health → question → prediction → recommendation → impact → updated recommendation`
