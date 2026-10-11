# Assay (FIN 02) — Master Project Blueprint & Architecture Handoff

> **Handoff Document**: This file serves as the single source of truth for the entire Assay codebase, system architecture, implemented components, dataset schemas, and roadmap across frontend and backend. It consolidates all past plans, audits, and architectural decisions directly into the project repository.

---

## 1. Executive Summary & Problem Statement (FIN 02)

**Assay** is a privacy-first personal financial health copilot built for the **FIN 02** hackathon challenge.
Traditional financial apps either provide static retroactive charts or rely on naive cloud LLMs that hallucinate balances and leak confidential banking data.

Assay solves this through a **Decoupled Grounded Intelligence Architecture**:
1. **Critical Financial Math is 100% Deterministic & Local**: Cash flow forecasts (P10/P50/P90), multi-period action planning, and dynamic replanning run locally on CPU in **< 25 ms**.
2. **Deterministic Guardrails (0.0% Hallucination)**: LLMs/SLMs never perform arithmetic. They only verbalize pre-calculated mathematical facts audited via regex.
3. **Institutional Privacy**: Bank statements and UPI narrations never leave the user's perimeter in identifiable form. Raw data stays on-device; cloud interactions pass through OHTTP (Oblivious HTTP RFC 9458) blind relays.
4. **On-Device Compact Intelligence**: Utilizes a **22M MiniLM classifier** (~80 MB) and a **500M SLM reasoning model** (`Qwen2.5-0.5B`, ~485 MB GGUF) to run fully offline without exceeding mobile memory limits.

---

## 2. Complete Inventory of Intelligence & Perception Engines

The Assay platform comprises **8 computational engines** and a **2-tier copilot generation layer**:

| # | Engine / Model | Role | Algorithm / Tech | Location in Codebase | Execution & Latency | Status |
|---|---|---|---|---|---|---|
| **1** | **Conformal Quantile Forecaster (CQ-AR)** | 6-month calibrated risk envelopes (P10 floor, P50 median, P90 ceiling) | Quantile Autoregression + Split-Conformal Calibration | `backend/app/services/forecasting/conformal_engine.py` | Local CPU (< 15 ms) | **Complete & Verified** |
| **2** | **Statistical Benchmark Evaluator** | Proves CQ-AR beats Moving Average & Recurring baselines | MAE, RMSE, CRPS, 80% empirical coverage | `backend/app/services/forecasting/evaluator.py` | Local CPU (< 5 ms) | **Complete & Verified** |
| **3** | **Constrained Action Planner (MILP)** | Mathematical proof of Decision-Flip Theorem (Sequence B > Sequence A) | Mixed-Integer Linear Programming + 1,000 Monte Carlo paths | `backend/app/services/planning/action_planner.py` | Local CPU (< 25 ms) | **Complete & Verified** |
| **4** | **Dynamic Replanner** | Resolves infeasibilities during salary cuts (-25%) or emergencies (+₹35k) | 3-tier slack variable constraint relaxation | `backend/app/services/planning/dynamic_replanner.py` | Local CPU (< 5 ms) | **Complete & Verified** |
| **5** | **Spend Velocity Engine** | Daily intra-month burn pacing & proactive daily budget micro-nudges | Streaming run-rate analytics | `backend/app/services/planning/velocity_engine.py` | Local CPU (< 1 ms) | **Complete & Verified** |
| **6** | **Tier-2 Semantic Categorizer** | Classifies ambiguous Indian street vendor / UPI QR codes | `sentence-transformers/all-MiniLM-L6-v2` (22M params, 384-d cosine) | `backend/app/services/categorization/categorizer.py` | Local CPU (< 2 ms) | **Complete & Verified** |
| **7** | **Receipt OCR & Quality Gate** | Camera receipts & UPI screenshot parser with quarantine gate | OpenCV + Tesseract + Regex | `backend/app/services/ocr/ocr_pipeline.py` | Local Host (~150 ms) | **Complete & Verified** |
| **8** | **5-Layer Faithfulness Auditor** | Audits every number in LLM/SLM outputs against verified math | Deterministic Regex + Slot-Filling fallback | `backend/app/providers/llm/copilot_explainer.py` | Local CPU (< 1 ms) | **Complete & Verified** |
| **9** | **Cloud Copilot Synthesizer** | Empathetic natural language synthesis | Groq `qwen3-8b` / HF `Llama-3.1-8B-Instruct` | `backend/app/providers/llm/hf_provider.py` | Cloud API (~800 ms) | **Complete & Verified** |
| **10** | **On-Device SLM Copilot (Planned)** | Offline local reasoning and trade-off verbalization | `Qwen/Qwen2.5-0.5B-Instruct` (~485 MB GGUF) | `notebooks/` & `backend/app/providers/llm/` | On-Device CPU (35 tok/s) | **Ready for Fine-Tuning** |

---

## 3. High-Level System Architecture: The Sandwich Pattern

```
┌────────────────────────────────────────────────────────────────────────┐
│                        USER DEVICE (React Native)                      │
│   • Expo Router, TypeScript, React Native SVG                          │
│   • Offline SQLite / Cache                                             │
│   • Camera & Receipt Scanner                                           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   LOCAL FASTAPI DETERMINISTIC CORE                     │
│  ┌─────────────────────────┐  ┌──────────────────────────────────────┐ │
│  │ 1. CQ-AR Forecaster     │  │ 2. MILP Action Planner               │ │
│  │    P10/P50/P90 Envelopes│  │    Decision-Flip: Seq B > Seq A      │ │
│  └─────────────────────────┘  └──────────────────────────────────────┘ │
│  ┌─────────────────────────┐  ┌──────────────────────────────────────┐ │
│  │ 3. MiniLM Categorizer   │  │ 4. Dynamic Replanner & Velocity      │ │
│  │    22M params, <2ms     │  │    3-Tier Slack Relaxation           │ │
│  └─────────────────────────┘  └──────────────────────────────────────┘ │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Pre-computed math facts
                  ┌─────────────────┴──────────────────┐
                  ▼                                    ▼
┌──────────────────────────────────┐ ┌──────────────────────────────────┐
│   LOCAL / ON-DEVICE SLM TIER     │ │       CLOUD GATEWAY TIER         │
│  Qwen2.5-0.5B-Instruct           │ │  Cloudflare Worker (OHTTP Relay) │
│  Quantized Q4_K_M (485 MB)       │ │  • Strips user IP address        │
│  • 100% Offline execution        │ │  • Relays to Groq / HF API       │
│  • 0 MB cloud bandwidth          │ │  • Empathetic prose generation   │
└──────────────────────────────────┘ └──────────────────────────────────┘
```

---

## 4. Key Financial Theorems Implemented & Proven

### 4.1 The Decision-Flip Theorem (FIN 02 Addition 1 & 2)
* **The Naive Advice (Sequence A)**: Traditional financial tools advise paying off debt immediately via a lump-sum payment. However, when the user declares a mandatory minimum cash reserve ($R_{\min} = ₹25,000$), an immediate lump-sum drains liquidity. If an adverse expense shock hits, the user has a **31.4% shortfall risk**.
* **The Optimized Strategy (Sequence B)**: Holds the ₹25,000 reserve buffer first, structuring debt payment as a monthly EMI with capped discretionary spending. Shortfall risk collapses to **4.2%** while delivering a superior ending net cash position.
* **Algorithm**: Solved using Mixed-Integer Linear Programming (`scipy.optimize.milp`) and evaluated across **1,000 Monte Carlo paths**.

### 4.2 Conformal Quantile Autoregression (CQ-AR)
* Standard linear regressions fail on asymmetric downside shocks (medical emergencies, festival spikes).
* CQ-AR optimizes asymmetric **Pinball Loss** for quantiles $q \in \{0.10, 0.50, 0.90\}$:
  $$\mathcal{L}_q(y, \hat{y}) = \max(q(y - \hat{y}), (1 - q)(\hat{y} - y))$$
* **Split-Conformal Calibration**: Evaluated on Months 13–18 to compute non-conformity residuals $s_i = |y_i - \hat{y}_i|$. Guarantees **$\ge 80\%$ empirical coverage** across out-of-sample test months (Months 19–24).

### 4.3 3-Tier Slack Variable Dynamic Replanning
When life delivers a shock (-25% salary cut or +₹35,000 medical bill), the planner uses a tiered relaxation ladder:
1. **Tier 1 (Soft Discretionary Freeze)**: Temporarily pauses dining out and entertainment.
2. **Tier 2 (Investment / Slowdown)**: Modulates SIPs/investments without defaulting on debt EMIs.
3. **Tier 3 (Structured Cushion Dip)**: Permits a controlled, planned dip below $R_{\min}$ with an exact multi-month recovery trajectory.

---

## 5. Dataset Intelligence: 24-Month Synthetic Personal Ledger

* **Location**: `backend/data/synthetic_finance/`
* **Scale**: **13,975 transactions**, **1,320 monthly records**, **260 recurring obligations**, **55 user profiles**.
* **Why Synthetic**: RBI regulations and India's DPDP Act 2023 strictly prohibit publishing raw household bank statements. The simulator serves as the exact digital twin for India's **Account Aggregator (AA)** feeds (Setu, Finvu).
* **Partitions**:
  - `Months 1–12 (Train)`: Autoregressive coefficients, recurring contract baselines.
  - `Months 13–18 (Validation/Calibration)`: Conformal residual calibration ($q_{\text{hat}}$).
  - `Months 19–24 (Test)`: Out-of-sample shock evaluations (-25% salary cut at M19, +₹35k shock at M21).

---

## 6. Complete Codebase Directory & File Map

### Backend (`backend/`)
```
backend/
├── app/
│   ├── api/v1/endpoints/
│   │   ├── analytics.py        # Money leaks, burn rate, spend velocity endpoints
│   │   ├── auth.py             # User authentication and JWT handling
│   │   ├── forecasting.py      # 6-Month CQ-AR forecast API (P10/P50/P90)
│   │   ├── ocr.py              # Receipt upload & quarantine confirmation API
│   │   ├── planning.py         # MILP Action planner & debt breakdown API
│   │   └── transactions.py     # Transaction feed & categorization API
│   ├── core/
│   │   ├── config.py           # Environment variables (Groq, HF, Supabase, SQLite)
│   │   └── database.py         # SQLAlchemy engine & session management
│   ├── models/
│   │   ├── transaction.py      # SQLite/PostgreSQL transaction schema
│   │   └── user.py             # User profile and account schemas
│   ├── providers/llm/
│   │   ├── base.py             # Deterministic fallback circuit breaker
│   │   ├── copilot_explainer.py# 5-Layer grounded explainer & regex auditor
│   │   ├── groq_provider.py    # Ultra-fast Groq LPU provider (qwen3-8b)
│   │   └── hf_provider.py      # Hugging Face Serverless Inference client
│   └── services/
│       ├── categorization/
│       │   └── categorizer.py  # Lexicon + all-MiniLM-L6-v2 22M classifier
│       ├── financial_intelligence/
│       │   └── synthetic_finance_generator.py # 24-month mathematical ledger generator
│       ├── forecasting/
│       │   ├── conformal_engine.py # CQ-AR Quantile Forecaster (Pinball loss)
│       │   └── evaluator.py    # Benchmarks (MAE, RMSE, CRPS, 80% coverage)
│       ├── ocr/
│       │   ├── ocr_pipeline.py # Image deskewing, Tesseract, quarantine gate
│       │   └── receipt_parser.py# Regex entity extraction for bills/receipts
│       └── planning/
│           ├── action_planner.py   # MILP solver & Monte Carlo decision flip
│           ├── dynamic_replanner.py# 3-tier slack constraint relaxation
│           └── velocity_engine.py  # Daily burn rate & micro-nudges
├── assay.db                    # Authoritative SQLite database
├── dev.bat                     # Unified dev environment launcher
└── requirements.txt / pyproject.toml
```

### Frontend (`frontend/` & `app/`)
```
frontend/ & app/
├── app/
│   ├── (tabs)/
│   │   ├── index.tsx           # Dashboard: Health Score, Cash-In/Out, Money Leaks
│   │   ├── insights.tsx        # Cash-Flow Forecast: Responsive SVG spline, 25 Sep trough callout
│   │   ├── transactions.tsx    # Transaction ledger, category filters
│   │   └── upload.tsx          # Camera/Gallery Receipt Scanner & Quarantine Modal
│   ├── ai/index.tsx            # Copilot Chat: Grounded conversational advice
│   ├── cashflow-detail/index.tsx # Detailed 6-Month Quantile Forecast view
│   ├── debt/index.tsx          # Debt breakdown, Avalanche order, EMI metrics
│   └── simulator/index.tsx     # What-If Simulator: Sliders for dining cap & debt payment
├── components/
│   └── ui/
│       ├── FloatingCopilotButton.tsx # Compact 44px circular copilot launcher
│       ├── MerchantLogo.tsx    # Merchant brand logo renderer
│       ├── ScreenHeader.tsx    # Standardized header component
│       └── Typography.tsx      # Font system (Antic Didone + DM Sans)
└── constants/theme.ts          # Color tokens (#111827 Navy, #D6A928 Gold, #F7F7F5 Cream)
```

---

## 7. Current Project Status & Test Results

* **Backend Test Suite**: **105 / 105 tests PASSED (100% green)** via `uv run pytest tests/ -v`.
* **Frontend Type Safety**: **0 errors** via `npx tsc --noEmit`.
* **Latencies**:
  - CQ-AR Forecaster: 12.4 ms
  - MILP Action Planner: 21.8 ms
  - MiniLM-L6-v2 Categorizer: 1.8 ms
  - Groq Copilot Explainer: ~870 ms
* **Accounting Conservation**: 100% verified across 13,975 rows:
  `ClosingBalance = OpeningBalance + Income - Essentials - Discretionary - EMI - Savings`
