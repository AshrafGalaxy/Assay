# Assay - Backend Service

FastAPI-powered Financial Intelligence Copilot API.

## Features
- **Deterministic Financial Engine**: Cash flow calculation, recurring obligations, affordability, and recommendations.
- **Account Aggregator Sandbox**: Mock AA provider & ingestion pipeline.
- **Copilot Query Engine**: LLM explanation wrapper for structured financial data.
- **OCR Ingestion**: Receipt & UPI screenshot endpoints.

## Core financial API

The financial API reads the **Assay Synthetic Personal Finance Dataset**
(generated CSVs under `data/synthetic_finance/`) via
`app/services/financial_intelligence/ledger.py`. Every endpoint below is
calculated from the same active synthetic user (historical months only), rather
than hardcoded demo rows.

- `GET /api/v1/transactions` — normalised transaction feed, with category and type filters
- `GET /api/v1/financial-health` — income, spend, savings rate, health score, and evidence signals
- `GET /api/v1/analytics/cash-flow` — observed monthly cash flow and current-month projection
- `GET /api/v1/analytics/obligations` — recurring debit detection
- `GET /api/v1/analytics/spending` — active-month category breakdown
- `GET /api/v1/recommendations` — explainable, rules-based saving opportunities
- `POST /api/v1/recommendations/{id}/simulate` — non-mutating what-if simulation

The financial calculations are isolated in `app/services/financial_intelligence`.
They take normalised transaction dictionaries, so replacing the synthetic ledger
with a CSV importer or Supabase query will not require changes to the logic.

## Local Setup

### OCR prerequisite

Receipt extraction uses the local Tesseract executable only; it does not use a
cloud OCR API or EasyOCR fallback. Install it before starting the backend:

```bash
# macOS
brew install tesseract

# Debian / Ubuntu
sudo apt-get install tesseract-ocr
```

Confirm it is available with `tesseract --version`.

### 1. Create and Activate Virtual Environment
```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### 4. Run the Dev Server
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Use `--host 0.0.0.0` so Expo Go / physical devices on your LAN can call the API.

- API Docs: `http://localhost:8000/api/v1/docs`
- Health Check: `http://localhost:8000/health`

## Synthetic finance dataset

Reproducible multi-user INR datasets for forecasting / planning evaluation live in
`app/services/financial_intelligence/synthetic_finance_generator.py`.

```bash
python -m app.services.financial_intelligence.synthetic_finance_generator
python -m app.services.financial_intelligence.synthetic_finance_generator --validate-only
pytest tests/test_synthetic_finance_generator.py -q
```

See [docs/SYNTHETIC_FINANCE_DATASET.md](docs/SYNTHETIC_FINANCE_DATASET.md) for schemas,
accounting rules, scenarios, and leakage guidance. The API ledger entrypoint is
`ledger.get_ledger_transactions()` (adapter + cached CSV load). Optional query
param `user_id` selects a synthetic `UserID`.

## Running Tests
```bash
pytest
```
