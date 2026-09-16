# Assay --- API Specification

All API paths are prefixed with `/api/v1`.

## Authentication

### POST `/auth/register`

Creates a user.

### POST `/auth/login`

Authenticates a user and returns an access token.

### POST `/auth/refresh`

Refreshes authentication when applicable.

## Financial Data

### POST `/accounts/demo-connect`

Creates a demo account using the mock AA provider.

Response:

``` json
{
  "account_id": "acc_demo_001",
  "provider": "mock_aa",
  "institution_name": "Demo Bank",
  "status": "connected"
}
```

### POST `/accounts/{account_id}/sync`

Loads/synchronizes mock financial data.

### GET `/accounts`

Returns connected accounts.

## Transactions

### GET `/transactions`

Optional parameters: `limit`, `offset`, `category`, `transaction_type`,
`start_date`, `end_date`, `source_type`.

### GET `/transactions/{transaction_id}`

Returns a normalized transaction.

### POST `/transactions`

Creates a manual transaction.

## Financial Health

### GET `/financial-health`

Returns the current financial-health snapshot.

Example:

``` json
{
  "income": 85000,
  "spending": 60200,
  "savings": 24800,
  "savings_rate": 0.2918,
  "fixed_expenses": 29000,
  "variable_expenses": 31200,
  "recurring_obligations": 18400,
  "projected_month_end_balance": 8700,
  "signals": [
    {
      "type": "spending_increase",
      "category": "Food & Dining",
      "change_percent": 27
    }
  ]
}
```

## Cash Flow

### GET `/analytics/cash-flow`

Returns historical and projected cash flow.

## Obligations

### GET `/analytics/obligations`

Returns detected/known recurring obligations.

## Recommendations

### GET `/recommendations`

Returns current recommendations.

### POST `/recommendations/{recommendation_id}/simulate`

Simulates the proposed action.

Request:

``` json
{
  "assumption": {
    "category": "Food & Dining",
    "monthly_reduction": 2000
  }
}
```

Response:

``` json
{
  "baseline_monthly_buffer": 4800,
  "projected_monthly_buffer": 6800,
  "monthly_impact": 2000,
  "annualized_impact": 24000,
  "confidence": 0.86,
  "assumption": "Food & Dining spending is reduced by ₹2,000 per month."
}
```

## Copilot

### POST `/copilot/query`

Request:

``` json
{
  "question": "Can I afford a ₹15,000 phone this month?"
}
```

Response should contain:

``` json
{
  "intent": "affordability",
  "answer": "Based on your current projected cash flow, the purchase would create short-term cash-flow pressure.",
  "observed": [],
  "analysis": {},
  "recommendation": {},
  "confidence": 0.86,
  "limitations": []
}
```

The financial calculation is produced by backend services. The LLM
explains the structured result.

## Uploads

### POST `/uploads/receipt`

Receipt image upload → OCR → parser → normalized transaction.

### POST `/uploads/upi`

UPI screenshot upload → OCR/parser → normalized transaction.

### POST `/uploads/{upload_id}/confirm`

Confirms or edits extracted transaction information.

## Analytics

### GET `/analytics/spending`

Returns category totals and trends.

### GET `/analytics/leaks`

Legacy/secondary micro-spending analysis. Leak signals should feed the
broader Financial Health Engine.
