# Assay --- Design System

## Product Identity

**ASSAY** is an AI-powered personal financial-health and action
assistant.

Aesthetic: - Minimal - Quiet - Premium - Financial - Intelligent -
Trustworthy

The interface should feel like a financial analysis product, not just an
expense tracker.

## Design Principles

1.  Clarity over decoration.
2.  Evidence before advice.
3.  Clearly distinguish certainty.
4.  Make analytics lead to action.

## Color Tokens

  Token           Hex       Usage
  --------------- --------- -----------------------------
  primary         #111827   Primary text, dark surfaces
  background      #F7F7F5   App background
  surface         #FFFFFF   Cards and controls
  gold            #D6A928   Accent and selected states
  textSecondary   #6B7280   Supporting information
  border          #E7E7E3   Boundaries
  success         #16A34A   Positive states
  warning         #D97706   Warnings
  error           #DC2626   Alerts
  info            #2563EB   Informational states

## Typography

Editorial font: `Antic Didone` - page titles; - major product
statements; - major editorial headings.

Primary UI: `DM Sans` - financial values; - transaction names; -
categories; - buttons; - navigation; - charts; - descriptions.

Financial values must be bold, single-line, and never use the editorial
serif.

## Financial Information Hierarchy

``` text
Financial position
 ↓
Evidence
 ↓
Trend / prediction
 ↓
Recommendation
 ↓
Expected impact
```

## Recommendation Card

Every recommendation should contain: 1. title; 2. why it was identified;
3. proposed action; 4. expected impact; 5. confidence/limitation; 6.
optional action control.

Example:

``` text
Save ₹2,000/month on food delivery

WHY
Food delivery is ₹2,400 higher than your
previous monthly average.

ACTION
Reduce food delivery by ₹2,000 this month.

EXPECTED IMPACT
+₹2,000 monthly cash buffer
+₹24,000 annualized

CONFIDENCE
Based on 4 months of transaction history.
```

## Copilot UI

The Copilot should feel like a financial analysis interface.

Prefer:

``` text
Question
Answer
Observed
Analysis
Recommendation
Expected impact
```

over one long unstructured paragraph.

## Dashboard

P0 sections: 1. Financial Health Summary 2. Income vs Spending 3.
Savings Rate 4. Upcoming Obligations 5. Cash-flow Projection 6. Key
Financial Signals 7. Recommendations 8. Recent Transactions

Receipt upload and Smart Split should not dominate the dashboard.

## Layout

Use the 8-point grid: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48`

Primary horizontal padding: `24px` Card padding: `20–24px`

## Radius

-   small controls: 12
-   buttons/inputs: 16
-   cards: 20
-   hero cards: 24
-   bottom navigation: 28

## States

Every data-driven screen needs: - loading; - empty; - error; - partial
data; - success.

## Certainty Labels

**Observed:** ₹42,300 spent this month.

**Predicted:** Projected month-end balance: ₹6,100.

**Recommended:** Reduce discretionary spending by ₹1,500.

**Impact:** Projected monthly buffer increases by ₹1,500.
