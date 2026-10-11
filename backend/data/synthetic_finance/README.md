# Intentionally empty — synthetic ledger disabled (clean slate).
Generate only when needed:
  python -m app.services.financial_intelligence.synthetic_finance_generator
Then set SYNTHETIC_LEDGER_ENABLED=true in .env