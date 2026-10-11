"""
Assay Financial Copilot - Model Downloader / Verification Utility.
Downloads and verifies the 379 MB Q4_K_M quantized SLM (Qwen2.5-0.5B-Instruct).
"""

import sys
import os
import urllib.request
from pathlib import Path

MODEL_DIR = Path(__file__).resolve().parent / "models"
MODEL_FILE = MODEL_DIR / "assay-copilot-qwen0.5b-q4_k_m.gguf"
HF_URL = "https://huggingface.co/Ashraf01k/assay-copilot-qwen0.5b-q4_k_m/resolve/main/assay-copilot-qwen0.5b-q4_k_m.gguf"

def download_with_progress(url: str, output_path: Path):
    print(f"[Assay SLM] Downloading model from {url}...")
    def reporthook(block_num, block_size, total_size):
        downloaded = block_num * block_size
        if total_size > 0:
            percent = downloaded / total_size * 100
            mb_downloaded = downloaded / (1024 * 1024)
            mb_total = total_size / (1024 * 1024)
            sys.stdout.write(f"\r[Assay SLM] Download Progress: {mb_downloaded:.1f}/{mb_total:.1f} MB ({percent:.1f}%)")
            sys.stdout.flush()
    urllib.request.urlretrieve(url, output_path, reporthook)
    print("\n[Assay SLM] Download complete!")

def verify_or_download():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    if MODEL_FILE.exists():
        size = MODEL_FILE.stat().st_size
        print(f"[Assay SLM] Found local model binary: {MODEL_FILE}")
        print(f"[Assay SLM] File size: {size:,} bytes (~{size / (1024*1024):.2f} MB)")
        if size > 100_000_000:
            print("[Assay SLM] Verification SUCCESS: Local SLM is ready for offline CPU inference.")
            return True

    print(f"[Assay SLM] Model not found locally at {MODEL_FILE}")
    try:
        download_with_progress(HF_URL, MODEL_FILE)
        return True
    except Exception as e:
        print(f"[Assay SLM] Automated download failed: {e}")
        print(f"[Assay SLM] You can manually download from {HF_URL} and place it in {MODEL_FILE}")
        return False

if __name__ == "__main__":
    verify_or_download()
