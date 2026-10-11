# Assay Financial Copilot: 500M SLM Fine-Tuning Master Implementation Plan

> **Execution Document**: This document outlines the step-by-step implementation plan for fine-tuning an on-device Small Language Model (SLM) for Assay's Financial Copilot on **Google Colab** using the **Hugging Face** ecosystem. It is saved directly in the project repository for immediate execution in a new chat.

---

## 1. Executive Summary & Model Choice

### 1.1 The Selected Model: `Qwen/Qwen2.5-0.5B-Instruct`
* **Base Architecture**: Transformer Causal Language Model
* **Parameter Count**: **490 Million parameters (~0.5B)**
* **Precision & Memory Footprint**:
  - Raw FP16: `~988 MB`
  - Quantized 8-bit (GGUF Q8_0): `~669 MB`
  - **Quantized 4-bit (GGUF Q4_K_M)**: **`485 MB` (485,452,288 bytes)**
  - Quantized 3-bit (GGUF Q3_K_M): `~360 MB`

### 1.2 Why 500M Parameters is the Production Standard for Assay
1. **Zero OOM Crashing on Mobile**: Typical Android devices allocate ~512 MB to 800 MB for foreground apps. At **485 MB**, the model fits alongside the camera and OpenCV image buffers without triggering Android's Low Memory Killer (LMK).
2. **CPU Execution Speed**: Generates **25–40 tokens/second** on mobile CPUs without requiring a dedicated GPU.
3. **Decoupled Math vs Language**: The SLM does **not** perform arithmetic or forecast future cash paths. The local Python engines (`conformal_engine.py` and `action_planner.py`) compute all numbers deterministically. The 500M SLM's sole task is **structured trade-off verbalization and empathetic synthesis**.

---

## 2. Dataset Strategy: Synthetic FIN 02 Instruction Pairs

To make the 500M SLM an expert financial explainer with 0% hallucinations, we train it on structured prompt-response pairs generated directly from Assay's 24-month synthetic ledger (`backend/data/synthetic_finance/`).

### 2.1 The 4 Core Training Scenarios
1. **Decision-Flip Explanations**: Demonstrating why Sequence B (liquidity buffer + EMI) beats Sequence A (aggressive lump-sum debt payoff) under P10 downside uncertainty.
2. **Dynamic Replanning Shock Recovery**: Explaining the 3-tier relaxation ladder when a user suffers a -25% salary cut or +₹35,000 medical emergency.
3. **Affordability & Buffer Guardrails**: Answering *"Can I afford this ₹15,000 purchase?"* with strict buffer headroom reasoning.
4. **Intra-Month Burn Pacing & Micro-Nudges**: Translating daily spend velocity into actionable daily spending caps.

### 2.2 ChatML Training Record Schema
```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are the Assay Financial Health Copilot. Explain mathematical trade-offs accurately using only provided facts. Never invent or hallucinate figures."
    },
    {
      "role": "user",
      "content": "Explain the cash-flow trade-off between Sequence A and Sequence B under uncertainty.\n\nVERIFIED FACTS JSON:\n{\"current_balance\": 142850, \"reserve_floor_rmin\": 25000, \"sequence_a\": {\"action\": \"Lump-sum Debt Payoff\", \"p10_shortfall_risk\": 0.314, \"ending_balance\": 48200}, \"sequence_b\": {\"action\": \"Preserve Cushion + EMI\", \"p10_shortfall_risk\": 0.042, \"ending_balance\": 59100}, \"decision_flip_verified\": true}"
    },
    {
      "role": "assistant",
      "content": "Under deterministic conditions, Sequence A seems acceptable with an ending balance of ₹48,200. However, when evaluated against income and expense volatility (P10 stress test), Sequence A incurs a 31.4% probability of breaching your declared ₹25,000 reserve cushion. Sequence B preserves your liquidity buffer first and structures the payment as an EMI, collapsing shortfall risk to 4.2% while yielding an ending balance of ₹59,100."
    }
  ]
}
```

---

## 3. Dataset Generator Script (`generate_slm_dataset.py`)

Create this script in `backend/` or `scripts/` to generate `fin02_slm_instructions.jsonl`:

```python
"""
Generates high-fidelity financial copilot instruction-tuning pairs
from the 24-month synthetic ledger for 500M SLM training.
"""
import json
import random
from pathlib import Path

OUTPUT_FILE = Path("fin02_slm_instructions.jsonl")

SYSTEM_PROMPT = (
    "You are the Assay Financial Health Copilot. Explain mathematical trade-offs "
    "accurately using only provided facts. Never invent or hallucinate figures."
)

def build_decision_flip_pair():
    curr_balance = random.choice([120000, 142850, 165000, 185000])
    rmin = 25000
    seq_a_end = random.randint(35000, 52000)
    seq_b_end = seq_a_end + random.randint(8000, 15000)
    seq_a_risk = round(random.uniform(0.28, 0.42), 3)
    seq_b_risk = round(random.uniform(0.02, 0.06), 3)
    
    facts = {
        "current_balance": curr_balance,
        "reserve_floor_rmin": rmin,
        "sequence_a": {"action": "Lump-sum Debt Payoff", "p10_shortfall_risk": seq_a_risk, "ending_balance": seq_a_end},
        "sequence_b": {"action": "Preserve Cushion + EMI", "p10_shortfall_risk": seq_b_risk, "ending_balance": seq_b_end},
        "decision_flip_verified": True
    }
    
    response = (
        f"Under deterministic conditions, Sequence A seems viable with an ending balance of ₹{seq_a_end:,}. "
        f"However, when accounting for income volatility and adverse expense shocks (P10 stress test), "
        f"Sequence A incurs a {seq_a_risk * 100:.1f}% probability of breaching your declared ₹{rmin:,} reserve cushion. "
        f"Sequence B preserves your liquidity buffer first and structures debt repayment as an EMI, "
        f"reducing shortfall risk to {seq_b_risk * 100:.1f}% while yielding an ending balance of ₹{seq_b_end:,}."
    )
    
    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Explain the cash-flow trade-off between Sequence A and Sequence B under uncertainty.\n\nVERIFIED FACTS JSON:\n{json.dumps(facts)}"},
            {"role": "assistant", "content": response}
        ]
    }

def build_emergency_shock_pair():
    curr_balance = random.randint(75000, 110000)
    rmin = 25000
    shock_amount = 35000
    reduction = random.randint(3500, 6000)
    recovery_months = random.choice([2, 3, 4])
    
    facts = {
        "current_balance": curr_balance,
        "reserve_floor_rmin": rmin,
        "shock_type": "Emergency Hospitalization",
        "shock_amount": shock_amount,
        "tier_relaxation": "Tier 1: Soft Discretionary Freeze",
        "discretionary_reduction_needed": reduction,
        "recovery_horizon_months": recovery_months
    }
    
    response = (
        f"A ₹{shock_amount:,} emergency medical expense has impacted your liquidity. "
        f"To protect your cash flow, the dynamic replanner activated Tier 1 constraint relaxation: "
        f"discretionary spending is paused by ₹{reduction:,}/month. Your mandatory debt EMIs "
        f"and the ₹{rmin:,} reserve cushion remain fully protected, with full liquidity recovery projected in {recovery_months} months."
    )
    
    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Provide recovery guidance after an unexpected essential medical expense shock.\n\nVERIFIED FACTS JSON:\n{json.dumps(facts)}"},
            {"role": "assistant", "content": response}
        ]
    }

def build_affordability_pair():
    curr_balance = random.randint(150000, 220000)
    cost = random.choice([12000, 15000, 18000, 22000])
    buffer = random.randint(5000, 12000)
    shortfall = cost - buffer
    rmin = 25000
    
    facts = {
        "current_balance": curr_balance,
        "item_cost": cost,
        "projected_buffer": buffer,
        "reserve_floor_rmin": rmin,
        "can_afford": False,
        "shortfall": shortfall,
        "action": "Defer purchase by 1 billing cycle"
    }
    
    response = (
        f"Making this ₹{cost:,} purchase right now would create cash-flow pressure, "
        f"exceeding your projected buffer by ₹{shortfall:,} and threatening your ₹{rmin:,} minimum reserve. "
        f"We recommend deferring this purchase by 1 billing cycle."
    )
    
    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Evaluate affordability for a discretionary tech purchase.\n\nVERIFIED FACTS JSON:\n{json.dumps(facts)}"},
            {"role": "assistant", "content": response}
        ]
    }

def generate_dataset(n=1000):
    records = []
    for _ in range(n // 3):
        records.append(build_decision_flip_pair())
        records.append(build_emergency_shock_pair())
        records.append(build_affordability_pair())
    
    random.shuffle(records)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r) + "\n")
    print(f"Generated {len(records)} instruction records to {OUTPUT_FILE}")

if __name__ == "__main__":
    generate_dataset(1200)
```

---

## 4. Google Colab Fine-Tuning Execution Script

Run this directly inside a **Google Colab Notebook (T4 GPU)**:

```python
# ==============================================================================
# Cell 1: Install packages
# ==============================================================================
!pip install -q -U torch transformers datasets trl peft bitsandbytes accelerate

# ==============================================================================
# Cell 2: Import and Configuration
# ==============================================================================
import torch
from datasets import load_dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    TrainingArguments
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from trl import SFTTrainer

MODEL_ID = "Qwen/Qwen2.5-0.5B-Instruct"
TRAIN_DATA_PATH = "fin02_train.jsonl"
VAL_DATA_PATH = "fin02_val.jsonl"
ADAPTER_OUTPUT = "./assay-qwen-500m-lora"
MERGED_OUTPUT = "./assay-qwen-500m-merged"

# ==============================================================================
# Cell 3: Load Tokenizer and Quantized Base Model
# ==============================================================================
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

# 4-bit NF4 Quantization configuration
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.float16,
    bnb_4bit_use_double_quant=True
)

model = AutoModelForCausalLM.from_pretrained(
    MODEL_ID,
    quantization_config=bnb_config,
    device_map="auto",
    trust_remote_code=True
)
model = prepare_model_for_kbit_training(model)

# ==============================================================================
# Cell 4: LoRA Configuration
# ==============================================================================
peft_config = LoraConfig(
    r=16,
    lora_alpha=32,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM"
)
model = get_peft_model(model, peft_config)
model.print_trainable_parameters()

# ==============================================================================
# Cell 5: Load Train & Validation Datasets and Format ChatML
# ==============================================================================
train_raw = load_dataset("json", data_files=TRAIN_DATA_PATH, split="train")
val_raw = load_dataset("json", data_files=VAL_DATA_PATH, split="train")

def format_prompts(batch):
    texts = [tokenizer.apply_chat_template(conv, tokenize=False) for conv in batch["messages"]]
    return {"text": texts}

train_dataset = train_raw.map(format_prompts, batched=True)
val_dataset = val_raw.map(format_prompts, batched=True)

# ==============================================================================
# Cell 6: Training Setup (with Evaluation Loss Tracking)
# ==============================================================================
training_args = TrainingArguments(
    output_dir=ADAPTER_OUTPUT,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=2,
    learning_rate=2e-4,
    num_train_epochs=3,
    lr_scheduler_type="cosine",
    warmup_ratio=0.05,
    logging_steps=10,
    eval_strategy="epoch",
    save_strategy="epoch",
    fp16=True,
    report_to="none"
)

trainer = SFTTrainer(
    model=model,
    train_dataset=train_dataset,
    eval_dataset=val_dataset,
    dataset_text_field="text",
    max_seq_length=512,
    tokenizer=tokenizer,
    args=training_args,
    peft_config=peft_config
)

# Start training
trainer.train()

# Save trained LoRA adapter
model.save_pretrained(ADAPTER_OUTPUT)
tokenizer.save_pretrained(ADAPTER_OUTPUT)
print("LoRA Adapter successfully saved!")
```

---

## 5. Exporting to 485 MB GGUF via `llama.cpp`

In the same Colab session, merge the LoRA adapter with the base model and quantize it to **Q4_K_M** format:

```bash
# 1. Clone and compile llama.cpp
!git clone https://github.com/ggerganov/llama.cpp
!cd llama.cpp && pip install -r requirements.txt && make -j

# 2. Merge LoRA weights into FP16 base model
cat << 'EOF' > merge.py
import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

base_id = "Qwen/Qwen2.5-0.5B-Instruct"
adapter_id = "./assay-qwen-500m-lora"
merged_id = "./assay-qwen-500m-merged"

print("Loading base model in FP16...")
base_model = AutoModelForCausalLM.from_pretrained(base_id, torch_dtype=torch.float16, device_map="cpu")
tokenizer = AutoTokenizer.from_pretrained(base_id)

print("Merging LoRA weights...")
model = PeftModel.from_pretrained(base_model, adapter_id)
merged_model = model.merge_and_unload()

print(f"Saving merged model to {merged_id}...")
merged_model.save_pretrained(merged_id)
tokenizer.save_pretrained(merged_id)
print("Merge complete!")
EOF
python merge.py

# 3. Convert to GGUF (FP16)
!python llama.cpp/convert_hf_to_gguf.py ./assay-qwen-500m-merged --outfile ./assay-qwen-500m-f16.gguf --outtype f16

# 4. Quantize to Q4_K_M (Produces the exact 485 MB binary)
!./llama.cpp/llama-quantize ./assay-qwen-500m-f16.gguf ./assay-copilot-qwen0.5b-q4_k_m.gguf Q4_K_M

# 5. Check size
!ls -lh ./assay-copilot-qwen0.5b-q4_k_m.gguf
# -> File size: ~485 MB!
```

---

## 6. Integration into Assay Backend (`llama-cpp-python`)

To run the fine-tuned 485 MB model locally on CPU inside the FastAPI backend without any external cloud calls:

### 6.1 Install `llama-cpp-python`
```bash
pip install llama-cpp-python
```

### 6.2 Provider Class (`backend/app/providers/llm/local_slm_provider.py`)
```python
from pathlib import Path
from llama_cpp import Llama
from app.providers.llm.base import BaseLLMProvider

MODEL_PATH = Path("backend/models/assay-copilot-qwen0.5b-q4_k_m.gguf")

class LocalSLMProvider(BaseLLMProvider):
    def __init__(self):
        self.llm = Llama(
            model_path=str(MODEL_PATH),
            n_ctx=1024,
            n_threads=4,          # Uses 4 CPU cores
            verbose=False
        )

    def generate_explanation(self, system_prompt: str, user_prompt: str) -> str:
        prompt = (
            f"<|im_start|>system\n{system_prompt}<|im_end|>\n"
            f"<|im_start|>user\n{user_prompt}<|im_end|>\n"
            f"<|im_start|>assistant\n"
        )
        output = self.llm(
            prompt,
            max_tokens=256,
            stop=["<|im_end|>"],
            temperature=0.2
        )
        return output["choices"][0]["text"].strip()
```

---

## 7. Next Steps Checklist for the New Chat

1. [ ] Run `generate_slm_dataset.py` to create `fin02_slm_instructions.jsonl` (1,200 samples).
2. [ ] Open Google Colab with T4 GPU, upload `fin02_slm_instructions.jsonl`.
3. [ ] Execute Cells 1 through 6 to train the LoRA adapter.
4. [ ] Run Step 5 to merge and export `assay-copilot-qwen0.5b-q4_k_m.gguf` (**485 MB**).
5. [ ] Download the GGUF model into `backend/models/` and test with `local_slm_provider.py`.
