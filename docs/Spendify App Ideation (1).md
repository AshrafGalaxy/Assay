# Assay --- 15-Day Hackathon Roadmap

## Phase 0 --- Product Reframe

**Status: Completed** - Reframe Assay as a Financial Health Copilot. -
Define P0/P1/P2. - Make production AA access non-critical. - Define
sandbox/mock financial data. - Define
observed/predicted/recommended/impact distinction.

## Phase 1 --- Mobile Foundation

**Days 1--2** - Verify Expo and routing. - Verify theme and fonts. -
Verify reusable UI. - Build dashboard and Copilot shells. - Establish
API client.

**Deliverable:** navigable mobile app.

## Phase 2 --- Backend Foundation

**Days 2--3** - Create FastAPI project. - Configure PostgreSQL and
SQLAlchemy. - Add authentication. - Create
transaction/account/obligation models. - Add repository layer. - Add API
versioning.

**Deliverable:** persistent backend.

## Phase 3 --- Financial Data Ingestion

**Days 3--4** - Implement `MockAAProvider`. - Seed realistic financial
history. - Add accounts. - Import transactions. - Add income and
recurring obligations. - Add debt/EMI records where applicable.

**Deliverable:** realistic financial history without production AA
access.

## Phase 4 --- Transaction Intelligence

**Days 4--5** - Normalize transactions. - Merchant normalization. -
Categorization. - Transaction type classification. - Recurring
transaction detection. - Provenance/confidence.

**Deliverable:** clean structured dataset.

## Phase 5 --- Financial Health Engine

**Days 5--7** Implement: - income; - spending; - savings; - savings
rate; - fixed/variable spending; - discretionary spending; - recurring
obligations; - debt/EMI pressure; - category trends; - projected
month-end balance; - upcoming cash-flow pressure.

**Deliverable:** `/api/v1/financial-health`.

## Phase 6 --- Dashboard

**Days 7--8** Build: - financial-health summary; - income vs spending; -
savings rate; - upcoming obligations; - spending categories; - cash-flow
projection; - financial signals; - recommendation preview.

**Deliverable:** dashboard tells the financial story.

## Phase 7 --- Copilot

**Days 8--10** - Question input. - Intent extraction. - Financial
service retrieval. - Deterministic calculation. - LLM explanation. -
Session conversation history.

Required demo questions: - How much did I spend on food? - Why am I
saving less? - What recurring payments do I have? - Can I afford a
₹15,000 phone? - What will my balance look like next month? - Where can
I save ₹5,000?

**Deliverable:** grounded Copilot.

## Phase 8 --- Recommendations & Impact

**Days 10--12** - Detect actionable patterns. - Generate candidate
actions. - Calculate baseline. - Apply action assumption. - Calculate
projected impact. - Present confidence and limitations.

**Deliverable:** Assay moves from analysis to action.

## Phase 9 --- Receipt / UPI Ingestion

**Days 11--13** - Receipt upload. - OCR. - UPI screenshot parsing. -
Confirmation. - Feed extracted transaction into Financial Health Engine.

**Deliverable:** new data changes analysis.

## Phase 10 --- Demo Polish

**Days 13--14** - UI polish. - Loading/error/empty states. -
Confidence/provenance UI. - Recommendation cards. - Impact
visualization. - Demo dataset cleanup. - Core-flow testing.

## Phase 11 --- Final Demo & Pitch

**Day 15**

Demo: 1. Open Assay. 2. Show financial-health dashboard. 3. Ask why
savings changed. 4. Show evidence. 5. Ask about a ₹15,000 purchase. 6.
Show projection. 7. Ask where ₹5,000 can be saved. 8. Show
recommendation. 9. Show expected impact. 10. Add/import a new
transaction. 11. Show the analysis/recommendation changing.

## Explicitly Deferred

-   Production AA onboarding.
-   Full RAG infrastructure.
-   Custom ML model training.
-   Advanced investment analytics.
-   Automated payments.
-   Advanced Smart Split.
-   Large distributed infrastructure.
