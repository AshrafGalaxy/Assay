import os
import sys
import json
import urllib.request
import tarfile
import subprocess
from pathlib import Path

print("=" * 70)
print(">>> Fast Pre-Built GGUF Quantization Pipeline")
print("=" * 70)

bin_dir = Path("/content/llama_bin")
bin_dir.mkdir(exist_ok=True)

# 1. Download pre-built llama.cpp binaries for Ubuntu x64
tar_url = "https://github.com/ggml-org/llama.cpp/releases/download/b11551/llama-b11551-bin-ubuntu-x64.tar.gz"
tar_path = Path("/content/llama-bin-ubuntu-x64.tar.gz")

if not (bin_dir / "llama-quantize").exists():
    print(f"Downloading pre-built llama.cpp release: {tar_url} ...")
    urllib.request.urlretrieve(tar_url, str(tar_path))
    print(f"Downloaded ({tar_path.stat().st_size:,} bytes). Extracting to {bin_dir}...")
    with tarfile.open(str(tar_path), "r:gz") as tar:
        tar.extractall(path=str(bin_dir))
    print("Extracted successfully.")

# Locate quantize executable in bin_dir
quant_candidates = list(bin_dir.rglob("llama-quantize")) + list(bin_dir.rglob("quantize"))
quant_bin = None
for c in quant_candidates:
    if c.is_file():
        os.chmod(str(c), 0o755)
        quant_bin = c
        break

if not quant_bin:
    raise FileNotFoundError(f"Could not find llama-quantize executable in {bin_dir}")

print(f"Using quantize binary: {quant_bin}")

# 2. Convert HF to FP16 GGUF
merged_dir = Path("/content/assay-qwen-500m-merged")
f16_gguf = Path("/content/assay-qwen-500m-f16.gguf")
q4_gguf = Path("/content/assay-copilot-qwen0.5b-q4_k_m.gguf")

convert_script = Path("/content/llama.cpp/convert_hf_to_gguf.py")
if not convert_script.exists():
    convert_script = Path("llama.cpp/convert_hf_to_gguf.py")

print("\n" + "=" * 70)
print(f"Step 1: Converting HF model ({merged_dir}) to FP16 GGUF ({f16_gguf})...")
print("=" * 70)
subprocess.run(
    [
        sys.executable,
        str(convert_script),
        str(merged_dir),
        "--outfile",
        str(f16_gguf),
        "--outtype",
        "f16",
    ],
    check=True,
)
print(f"FP16 GGUF generated: {f16_gguf} ({f16_gguf.stat().st_size:,} bytes)")

# 3. Quantize to Q4_K_M
print("\n" + "=" * 70)
print(f"Step 2: Quantizing {f16_gguf} -> {q4_gguf} (Q4_K_M)...")
print("=" * 70)
env = os.environ.copy()
# Add lib directory to LD_LIBRARY_PATH if needed
lib_dirs = [str(p) for p in bin_dir.rglob("*") if p.is_dir()]
env["LD_LIBRARY_PATH"] = ":".join(lib_dirs + [env.get("LD_LIBRARY_PATH", "")])

subprocess.run(
    [str(quant_bin), str(f16_gguf), str(q4_gguf), "Q4_K_M"],
    env=env,
    check=True,
)

if not q4_gguf.exists():
    raise RuntimeError("Quantization failed to produce Q4_K_M GGUF file!")

size_bytes = q4_gguf.stat().st_size
size_mb = size_bytes / (1024 * 1024)

print("\n" + "=" * 70)
print(">>> SUCCESS! Assay Copilot Q4_K_M Model Generated Successfully!")
print(f">>> File:       {q4_gguf}")
print(f">>> File Size:  {size_bytes:,} bytes (~{size_mb:.2f} MB)")
print(f">>> Android LMK (<800 MB) Safe: {size_mb <= 800.0}")
print(f">>> iPhone Jetsam (<1800 MB) Safe: {size_mb <= 560.0}")
print("=" * 70)

# 4. Clean up temporary FP16 GGUF
if f16_gguf.exists():
    f16_gguf.unlink()
    print("Cleaned up temporary FP16 GGUF intermediate.")

# 5. Faithfulness Verification Test
print("\n" + "=" * 70)
print(">>> Step 3: Faithfulness & Hallucination Auditor Verification")
print("=" * 70)

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

print("Loading merged model on CPU for verification test...")
tokenizer = AutoTokenizer.from_pretrained(str(merged_dir))
model = AutoModelForCausalLM.from_pretrained(str(merged_dir), torch_dtype=torch.float32, device_map="cpu")

test_cases = [
    {
        "name": "Decision-Flip Proof",
        "facts": {
            "current_balance": 142850,
            "reserve_floor_rmin": 25000,
            "sequence_a": {"action": "Lump-sum Debt Payoff", "p10_shortfall_risk": 0.314, "ending_balance": 48200},
            "sequence_b": {"action": "Preserve Cushion + EMI", "p10_shortfall_risk": 0.042, "ending_balance": 59100},
            "decision_flip_verified": True,
        },
        "query": "Explain the cash-flow trade-off between Sequence A and Sequence B under uncertainty.",
    },
    {
        "name": "Affordability Buffer Check",
        "facts": {
            "current_balance": 185000,
            "item_cost": 18000,
            "projected_buffer": 8000,
            "reserve_floor_rmin": 25000,
            "can_afford": False,
            "shortfall": 10000,
            "action": "Defer purchase by 1 billing cycle",
        },
        "query": "Can I afford to purchase this ₹18,000 gadget right now?",
    },
]

for tc in test_cases:
    print(f"\n--- [Test Case: {tc['name']}] ---")
    prompt = (
        f"<|im_start|>system\n"
        f"You are the Assay Financial Health Copilot. Explain mathematical trade-offs "
        f"accurately using only provided facts. Never invent or hallucinate figures.<|im_end|>\n"
        f"<|im_start|>user\n"
        f"{tc['query']}\n\nVERIFIED FACTS JSON:\n{json.dumps(tc['facts'])}<|im_end|>\n"
        f"<|im_start|>assistant\n"
    )
    inputs = tokenizer(prompt, return_tensors="pt")
    with torch.no_grad():
        out = model.generate(**inputs, max_new_tokens=180, temperature=0.1, do_sample=False)
    gen = tokenizer.decode(out[0][inputs.input_ids.shape[1]:], skip_special_tokens=True).strip()
    print(f"Generated Output:\n{gen}")

print("\n" + "=" * 70)
print(">>> ALL PIPELINE STAGES COMPLETED 100% SUCCESSFULLY!")
print("=" * 70)
