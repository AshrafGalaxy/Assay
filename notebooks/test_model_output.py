import os
import subprocess
import json
from pathlib import Path

bin_dir = Path("/content/llama_bin")
llama_cli = list(bin_dir.rglob("llama-cli"))[0]
os.chmod(str(llama_cli), 0o755)

model_path = "/content/assay-copilot-qwen0.5b-q4_k_m.gguf"

env = os.environ.copy()
lib_dirs = [str(p) for p in bin_dir.rglob("*") if p.is_dir()]
env["LD_LIBRARY_PATH"] = ":".join(lib_dirs + [env.get("LD_LIBRARY_PATH", "")])

def ask_slm(system_msg: str, user_msg: str) -> str:
    prompt = (
        f"<|im_start|>system\n{system_msg}<|im_end|>\n"
        f"<|im_start|>user\n{user_msg}<|im_end|>\n"
        f"<|im_start|>assistant\n"
    )
    res = subprocess.run(
        [
            str(llama_cli),
            "-m", model_path,
            "-p", prompt,
            "-n", "150",
            "--temp", "0.1",
            "-t", "2",
            "--no-display-prompt",
        ],
        env=env,
        capture_output=True,
        text=True,
    )
    return res.stdout.strip()

print("=" * 70)
print(">>> ASSAY COPILOT SLM - LIVE INFERENCE TEST")
print("=" * 70)

# TEST 1: Decision-Flip Theorem
facts_1 = {
    "current_balance": 142850,
    "reserve_floor_rmin": 25000,
    "sequence_a": {"action": "Lump-sum Debt Payoff", "p10_shortfall_risk": 0.314, "ending_balance": 48200},
    "sequence_b": {"action": "Preserve Cushion + EMI", "p10_shortfall_risk": 0.042, "ending_balance": 59100},
    "decision_flip_verified": True
}
sys_1 = "You are the Assay Financial Health Copilot. Explain mathematical trade-offs accurately using only provided facts. Never invent or hallucinate figures."
user_1 = f"Explain the cash-flow trade-off between Sequence A and Sequence B under uncertainty.\n\nVERIFIED FACTS JSON:\n{json.dumps(facts_1)}"

print("\n--- TEST 1: Decision-Flip Theorem ---")
print(f"USER: Explain the cash-flow trade-off between Sequence A and Sequence B under uncertainty.")
output_1 = ask_slm(sys_1, user_1)
print(f"\nASSAY SLM OUTPUT:\n{output_1}")

# TEST 2: Affordability Check
facts_2 = {
    "current_balance": 185000,
    "item_cost": 18000,
    "projected_buffer": 8000,
    "reserve_floor_rmin": 25000,
    "can_afford": False,
    "shortfall": 10000,
    "action": "Defer purchase by 1 billing cycle"
}
sys_2 = "You are the Assay Financial Health Copilot. Explain purchase affordability clearly. Never invent numbers."
user_2 = f"Can I afford to purchase this ₹18,000 gadget right now?\n\nVERIFIED FACTS JSON:\n{json.dumps(facts_2)}"

print("\n" + "=" * 70)
print("--- TEST 2: Affordability Check ---")
print(f"USER: Can I afford to purchase this ₹18,000 gadget right now?")
output_2 = ask_slm(sys_2, user_2)
print(f"\nASSAY SLM OUTPUT:\n{output_2}")

print("\n" + "=" * 70)
print(">>> TEST COMPLETED!")
print("=" * 70)
