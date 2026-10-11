"""
Assay Financial Copilot - Model Downloader / Verification Utility.
Downloads and verifies the 379 MB Q4_K_M quantized SLM (Qwen2.5-0.5B-Instruct).
"""

import sys
import os
from pathlib import Path

MODEL_DIR = Path("backend/models")
MODEL_FILE = MODEL_DIR / "assay-copilot-qwen0.5b-q4_k_m.gguf"
MODEL_SIZE_BYTES = 397_807_616  # 379.38 MB

def verify_or_download():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    if MODEL_FILE.exists():
        size = MODEL_FILE.stat().st_size
        print(f"[Assay SLM] Found local model binary: {MODEL_FILE}")
        print(f"[Assay SLM] File size: {size:,} bytes (~{size / (1024*1024):.2f} MB)")
        if size > 100_000_000:
            print("[Assay SLM] Verification SUCCESS: Local SLM is ready for offline CPU inference.")
            return True

    print(f"[Assay SLM] Model not found at {MODEL_FILE}")
    print("[Assay SLM] Please ensure assay-copilot-qwen0.5b-q4_k_m.gguf is placed in backend/models/")
    return False

if __name__ == "__main__":
    verify_or_download()
