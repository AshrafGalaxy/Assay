# Copy-Paste Prompt for Your New Chat

Copy and paste the exact block below into the new chat:

```markdown
I am working on **Assay (FIN 02)** — an enterprise-grade Personal Financial Health Copilot.

### 1. Context & Architecture (What is Already Built)
- **Local Deterministic Core (FastAPI)**:
  - `backend/app/services/forecasting/conformal_engine.py`: Conformal Quantile Forecaster (CQ-AR) computing P10/P50/P90 cash-flow envelopes (< 15ms).
  - `backend/app/services/planning/action_planner.py`: MILP Action Planner solving the Decision-Flip Theorem (Sequence B > Sequence A under uncertainty, < 25ms).
  - `backend/app/services/planning/dynamic_replanner.py`: 3-tier slack variable constraint relaxation for salary cuts and emergency shocks (< 5ms).
  - `backend/app/services/categorization/categorizer.py`: 22M MiniLM classifier (`all-MiniLM-L6-v2`, < 2ms).
  - `backend/app/providers/llm/copilot_explainer.py`: 5-layer regex faithfulness auditor guaranteeing 0.0% hallucinations.
- **Reference Docs in Repo**:
  - `ASSAY_PROJECT_MASTER_BLUEPRINT.md`: Full architecture, engine map, and file inventory.
  - `SLM_FINE_TUNING_IMPLEMENTATION_PLAN.md`: Complete step-by-step SLM training and GGUF export blueprint.

### 2. The Model We Decided To Fine-Tune
- **Target Model**: `Qwen/Qwen2.5-0.5B-Instruct` (490 Million parameters).
- **Why 500M Parameters?**:
  - In 4-bit quantized GGUF (`Q4_K_M`), its exact size is **485 MB** (`485,452,288 bytes`).
  - It fits within the memory limits of Android devices (e.g. Realme X7) alongside camera/OCR buffers without being killed by Android's Low Memory Killer (LMK).
  - Fast CPU generation (35–45 tokens/second).
  - The model does NOT do math (the local Python engines compute exact numbers). The SLM's sole task is **structured trade-off verbalization and empathetic explanation**.

### 3. The Dataset (Ready in Repo)
Derived directly from the 24-month synthetic ledger (13,975 rows across 55 user profiles):
- `backend/fin02_train.jsonl` (1,445 ChatML instruction records)
- `backend/fin02_val.jsonl` (155 ChatML validation records on held-out cohorts)
- Tasks covered:
  1. Affordability checks ("Can I afford X?")
  2. Decision-Flip proofs (Sequence B > Sequence A under P10 downside risk)
  3. Dynamic Replanning shock recovery (-25% salary cut & +₹35k medical emergency)
  4. 6-Month P10/P50/P90 cash-flow forecast explanations

### 4. What We Need to Do in This Chat
1. Guide me through running the fine-tuning in Google Colab using a free T4 GPU (or generate the complete downloadable `notebooks/assay_copilot_500m_slm_finetune.ipynb`).
2. Train using Hugging Face `trl` (`SFTTrainer`), `peft` (LoRA, $r=16, \alpha=32$), and `bitsandbytes` (4-bit NF4) on `fin02_train.jsonl` with evaluation tracking on `fin02_val.jsonl`.
3. Merge the LoRA adapter with the base model and convert/quantize to **`Q4_K_M` GGUF (~485 MB)** using `llama.cpp`.
4. Provide verification prompts to test that the model outputs 100% faithful numbers.
5. Help me integrate the exported 485 MB GGUF model into `backend/app/providers/llm/` for offline local inference.

Please review `SLM_FINE_TUNING_IMPLEMENTATION_PLAN.md` and let's get started with step 1.
```
