# Assay

Assay is a mobile-first **financial health copilot**. It turns income, spending, obligations, and receipts into clear, explainable next actions — not just another expense list.

> Docs and some specs also use the name **Spendify**. The Expo app package is `assay`.

```text
Financial data → Normalize → Categorize → Financial health
  → Prediction → Recommendation → Impact simulation → Action → Recalculate
```

Assay keeps four kinds of information distinct:

| Kind | Meaning |
|------|---------|
| **Observed** | Supported directly by the user’s data |
| **Predicted** | Calculated or estimated future outcomes |
| **Recommended** | An action Assay suggests considering |
| **Impact** | Expected change if an assumption is applied |

Financial math is **deterministic and backend-owned**. An LLM may explain results; it must not invent the numbers.

---

## Repository map

```text
assay/
├── frontend/          # Expo React Native app (primary mobile client)
├── backend/           # FastAPI financial intelligence + OCR API
├── supabase/          # SQL migrations / hosted DB schema (when used)
├── app/               # Legacy Expo screen prototypes (not the active app)
├── package.json       # Monorepo scripts (dev:frontend, dev:backend)
├── AGENTS.md          # Agent note: use Expo versioned docs
└── README.md          # This file
```

| Path | Purpose |
|------|---------|
| `frontend/` | Active Expo SDK 57 app users run in Expo Go / simulators |
| `backend/` | FastAPI service: health, transactions, OCR, recommendations, copilot |
| `supabase/` | Database migrations for Supabase-hosted Postgres |
| `app/` | Older / exploratory Expo Router screens kept for reference; **prefer `frontend/app/`** |
| Root `package.json` | Orchestrates `npm run dev:frontend` and `npm run dev:backend` |

---

## What we have built

Status of major product pieces as of the current codebase:

| Area | Status | Where it lives |
|------|--------|----------------|
| Mobile shell (tabs, navigation, theme) | **Built** | `frontend/app`, `frontend/components`, `frontend/constants` |
| Auth UI (login / signup / forgot) | **Built (UI)** | `frontend/app/auth` + `frontend/services/auth.ts` |
| Dashboard, insights, transactions UI | **Built** | `frontend/app/(tabs)/*` |
| Receipt / gallery upload → OCR → category | **Built** | `frontend` upload flow + `backend` OCR + categorizer |
| Device-safe API base URL | **Built** | `frontend/services/api.ts` + `frontend/.env` |
| Deterministic financial engine | **Built** | `backend/app/services/financial_intelligence/` |
| Synthetic finance dataset + API ledger | **Built** | `synthetic_finance_generator.py` → CSVs → `ledger.py` → financial-health / transactions / recommendations |
| Mock Account Aggregator provider | **Built** | `backend/app/providers/aa/` + connect UI |
| Copilot API (structured explain wrapper) | **Partial** | `backend/.../copilot.py` + LLM provider base; still uses placeholder balances |
| Settings, split, debt, simulator screens | **Built (mostly UI)** | `frontend/app/settings`, `split`, `debt`, `simulator`, `copilot` |
| Supabase schema / live user data | **In progress** | `supabase/migrations`, `backend/app/core/database.py` |
| Production bank AA | **Not built** | Interface exists; mock only |
| CSV / Kaggle importer | **Not built** | Planned data source for the engine |
| Docs folder / formal API markdown | **Missing in-repo** | Spec referenced historically; regenerate as needed |

---

## Frontend (`frontend/`)

**Stack:** Expo SDK 57 · React Native · TypeScript · Expo Router · Axios · React Query · Reanimated · Lucide

### Purpose

The client people open: scan receipts, browse money, review health signals, and confirm OCR results. It talks to the backend over `/api/v1`.

### Layout

```text
frontend/
├── app/                 # Expo Router file-based screens
│   ├── (tabs)/          # Main tab bar: Dashboard, Upload, Transactions, Insights, Settings
│   ├── auth/            # Login, signup, forgot password
│   ├── connect/         # Account Aggregator onboarding (sandbox UX)
│   ├── copilot/         # Analysis & affordability flows
│   ├── debt/            # Debt / obligation views
│   ├── simulator/       # What-if / impact simulation UI
│   ├── split/           # Smart split flow
│   ├── transaction/     # Transaction detail
│   ├── settings/        # Profile, categories, privacy, accounts, etc.
│   ├── cashflow-detail/ # Cash-flow drill-down
│   └── ai/              # Copilot chat-style surface
├── components/          # Shared UI (auth, AA, dashboard, profile, design system)
├── constants/           # Theme, colors, typography, spacing, mock data, logos
├── services/            # API client, auth, AA state, upload/OCR, transactions
├── types/               # Domain TypeScript types (e.g. AA)
├── utils/               # Helpers
├── assets/              # Fonts, avatars, merchant/bank logos
├── .env.example         # EXPO_PUBLIC_* template (copy to .env)
└── package.json
```

### Tab screens (`app/(tabs)/`)

| Screen | Purpose |
|--------|---------|
| `index` | Financial dashboard home |
| `upload` | Gallery / camera receipt scan, OCR review, confirm transaction |
| `transactions` | Transaction list and filters |
| `insights` | Spending insights / analytics presentation |
| `settings` | Preferences and links into settings sub-screens |

### Services (`services/`)

| File | Purpose |
|------|---------|
| `api.ts` | Axios client; resolves `EXPO_PUBLIC_API_URL` or Expo LAN host (device-safe) |
| `upload.ts` | JPEG normalize → `POST /uploads/receipt` → confirm with category |
| `auth.ts` | Auth helpers for login / session |
| `aaState.ts` | Account Aggregator onboarding state |
| `transactions.ts` | Transaction fetch helpers |
| `avatarStorage.ts` | Local avatar persistence |

### Design system

- Tokens in `constants/theme.ts`, `colors.ts`, `typography.ts`, `spacing.ts`
- Shared primitives under `components/ui/` (cards, chips, gauges, charts, tab bar)
- Antic Didone for editorial titles; DM Sans for interface / financial figures

---

## Backend (`backend/`)

**Stack:** FastAPI · SQLAlchemy · Pydantic · OpenCV + Tesseract (local OCR) · Pytest

### Purpose

Own the truth for money math, OCR extraction, categorization, and API contracts the mobile app consumes.

### Layout

```text
backend/
├── app/
│   ├── main.py                 # FastAPI app, CORS, /health, mounts /api/v1
│   ├── core/                   # Config, DB engine, JWT security
│   ├── api/v1/
│   │   ├── router.py           # Registers all versioned routers
│   │   └── routes/             # HTTP endpoints (thin handlers)
│   ├── models/                 # SQLAlchemy: User, Account, Transaction
│   ├── schemas/                # Pydantic request/response models
│   ├── services/
│   │   ├── financial_intelligence/  # Pure finance calculations + demo ledger
│   │   ├── ocr/                     # Preprocess → Tesseract → receipt parse
│   │   └── categorization/          # Keyword category rules
│   ├── providers/
│   │   ├── aa/                 # Account Aggregator interface + mock
│   │   └── llm/                # LLM provider interface for explanations
│   └── utils/                  # Image upload validation
├── tests/                      # API, OCR, financial engine tests
├── requirements.txt
├── pyproject.toml
└── README.md                   # Backend-focused setup notes
```

### API routes (`app/api/v1/routes/`)

| Router | Purpose |
|--------|---------|
| `auth.py` | Register / login / refresh |
| `accounts.py` | Connected accounts + demo AA connect / sync |
| `transactions.py` | List / filter / create transactions (demo ledger aware) |
| `financial_health.py` | Health score, cash-flow, obligations, spending analytics |
| `recommendations.py` | Rules-based recommendations + what-if simulate |
| `copilot.py` | Natural-language question → structured affordability explanation |
| `uploads.py` | Receipt / UPI image upload, OCR pipeline, confirm → transaction |

Docs when the server is running: `http://localhost:8000/api/v1/docs`

### Financial intelligence (`services/financial_intelligence/`)

| Module | Purpose |
|--------|---------|
| `engine.py` | Pure functions: health, cash flow, obligations, spending, recommendations, simulate |
| `ledger.py` | Loads synthetic CSVs for API financial endpoints (historical months) |

The engine takes **normalised transaction dicts**. Swapping the data source should not require rewriting the math.

### OCR pipeline (`services/ocr/`)

```text
Image bytes
  → validate (JPEG/PNG/WEBP, size, dimensions)
  → OpenCV preprocess
  → Tesseract extract text + boxes
  → ReceiptParser (merchant, total, tax, date, payment, line items)
  → Categorizer (merchant + line items + raw text → category)
  → Review payload (no DB write until confirm)
```

| Module | Purpose |
|--------|---------|
| `preprocessing.py` | Non-destructive image cleanup for OCR |
| `tesseract_service.py` | Local Tesseract only (no cloud OCR) |
| `receipt_parser.py` | Deterministic field extraction |
| `ocr_pipeline.py` | Orchestrates the full receipt flow |
| `easyocr_service.py` | Legacy / unused by the live path |

### Categorization (`services/categorization/`)

Keyword rules map merchants and OCR text to categories such as Food & Dining, Groceries, Shopping, Healthcare, Transportation, Utilities, Entertainment, Services, Other.

### Providers

| Provider | Purpose |
|----------|---------|
| `providers/aa/` | Account Aggregator abstraction; `MockAAProvider` returns sandbox banks / txs |
| `providers/llm/` | Explanation layer over structured metrics (not the calculator) |

### Data layer

| Piece | Purpose |
|-------|---------|
| `core/config.py` | Settings from env (DB URL, secrets, CORS, schema mode) |
| `core/database.py` | Engine / sessions; SQLite fallback for local demos & tests |
| `models/` | `User`, `Account`, `Transaction` ORM models |
| `supabase/migrations/` | Hosted Postgres schema when using Supabase |

---

## Cross-cutting flows (built)

### Receipt from gallery

1. User picks an image in **Upload**
2. App converts to JPEG (`expo-image-manipulator`) and posts to `/uploads/receipt`
3. Backend OCR + parse + suggest category
4. User reviews / edits merchant, amount, category
5. Confirm creates a transaction (`source_type=receipt_ocr`)

### Financial snapshot (demo)

1. Client calls financial-health / cash-flow / obligations / spending
2. Routes load the synthetic ledger (or DB when wired)
3. `financial_intelligence.engine` returns explainable metrics and signals

### Device ↔ backend networking

- Prefer `EXPO_PUBLIC_API_URL` in `frontend/.env` when overriding
- Otherwise use Expo/Metro LAN host so **Expo Go / physical devices** work
- Backend must bind `--host 0.0.0.0` for LAN access

---

## Getting started

### Prerequisites

- Node.js 18+ and npm  
- Python 3.10+  
- [Tesseract](https://github.com/tesseract-ocr/tesseract) on the host (`brew install tesseract`)  
- Expo Go or iOS/Android simulator  

### Root scripts

```bash
npm run dev:frontend   # Expo app
npm run dev:backend    # FastAPI on 0.0.0.0:8000
npm run ios | android | web
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm start
```

Expo loads `EXPO_PUBLIC_*` from `.env` (not `_env`). For a phone on the same Wi‑Fi, leave `EXPO_PUBLIC_API_URL` unset (auto LAN) or set `http://YOUR_LAN_IP:8000/api/v1`.

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- Health: `http://localhost:8000/health`  
- OpenAPI: `http://localhost:8000/api/v1/docs`  
- Tests: `pytest`

### On-Device SLM (Small Language Model) Setup
Assay uses a fine-tuned, 4-bit quantized 379 MB SLM (`Qwen2.5-0.5B-Instruct` GGUF). Because GitHub restricts files larger than 100 MB, the `.gguf` binary is distributed via Hugging Face.

To download the model locally into your backend:
```bash
python backend/download_model.py
```
Or download directly:
- **Hugging Face Model Repo**: [Ashraf01k/assay-copilot-qwen0.5b-q4_k_m](https://huggingface.co/Ashraf01k/assay-copilot-qwen0.5b-q4_k_m)
- **Direct File Download**: [assay-copilot-qwen0.5b-q4_k_m.gguf (379 MB)](https://huggingface.co/Ashraf01k/assay-copilot-qwen0.5b-q4_k_m/resolve/main/assay-copilot-qwen0.5b-q4_k_m.gguf) → place in `backend/models/assay-copilot-qwen0.5b-q4_k_m.gguf`

> **Note for Expo / Mobile**: The mobile app (Expo) talks to the backend over HTTP (`/api/v1/copilot/explain`). Friends running Expo on their phone do NOT need to install or run the 400 MB C++ model directly inside Expo Go; the backend handles the SLM inference. Even if the SLM binary is not downloaded, the backend automatically falls back to Groq Cloud API or grounded deterministic reasoning with zero downtime.

---

## Development principles

- Keep important financial calculations **deterministic and backend-owned**
- Preserve **provenance / confidence** where the product defines them
- Keep external systems behind **provider interfaces** (AA, LLM)
- Never ship LLM or private API secrets in the mobile app
- Do not commit `.env` files or real financial PII
- Keep route handlers thin: validate → service → respond
- Prefer the smallest architecture that proves: data → understanding → prediction → recommendation → impact

---

## Further process — what we are going to build

Ordered from near-term product value to later platform work.

### Near term (finish the prototype loop)

1. **Wire dashboard / insights / transactions UI to live API responses** instead of remaining mock-only presentation where still hardcoded  
2. **Ground the copilot** in `financial_intelligence` outputs (remove placeholder balances in `copilot.py`)  
3. **Persist OCR confirms reliably** into the same store the financial engine reads (SQLite → Supabase)  
4. **Editable recent uploads** backed by `GET /transactions` filtered by `source_type=receipt_ocr`  
5. **Manual entry** via `POST /transactions` (replace local demo toast entries)  
6. **Improve receipt parser** merchant isolation (less noise from payment lines in merchant field)  
7. **Restore / add API + architecture docs** under `docs/` (OpenAPI export + short system design)

### Mid term (real data in, richer advice out)

8. **CSV / Kaggle (or statement) importer** feeding the same normalised transaction shape the engine already expects (synthetic generator: `backend/docs/SYNTHETIC_FINANCE_DATASET.md`)  
9. **Supabase repositories** replacing the file-backed synthetic ledger without rewriting engine math  
10. **Stronger recurring-obligation detection** and obligation-aware recommendations  
11. **Impact simulation UX** fully driven by `POST /recommendations/{id}/simulate`  
12. **UPI-specific parsing heuristics** (today UPI uses the receipt pipeline)  
13. **Confidence & provenance** surfaced clearly in the mobile UI  

### Later (production readiness)

14. **Production Account Aggregator** behind the existing AA provider interface  
15. **Auth end-to-end** (secure sessions, refresh, protected routes) with real user isolation  
16. **RAG / retrieval** for copilot over the user’s own structured facts only  
17. **Smart Split** and advanced analytics beyond the current screens  
18. **Custom ML models** only where rules are insufficient (categorization edge cases, anomaly detection)  
19. Retire or archive the root **`app/` legacy prototypes** once parity is confirmed in `frontend/`

### Explicitly out of scope for the prototype

- Production bank login / automated payments  
- Full investment management or tax filing  
- Cloud OCR as a hard dependency (local Tesseract is intentional)

---

## Technology summary

| Layer | Choices |
|-------|---------|
| Mobile | Expo 57, React Native, TypeScript, Expo Router |
| API | FastAPI, Pydantic, SQLAlchemy |
| Intelligence | Pure Python financial engine + keyword categorizer |
| OCR | OpenCV preprocess + local Tesseract |
| Data (prototype) | Synthetic ledger; SQLite / Supabase path started |
| Integrations | Mock AA provider; LLM provider interface for explanations |

---

## Related files

- `backend/README.md` — backend setup, OCR prerequisite, core financial endpoints  
- `frontend/.env.example` — public Expo env template  
- `AGENTS.md` — use [Expo versioned docs](https://docs.expo.dev/versions/v54.0.0/) when changing native modules (verify against the app’s actual SDK in `frontend/package.json`)
