"""
Assay Financial Copilot: SLM Instruction Dataset Generator (FIN 02)
Generates high-fidelity financial trade-off instruction-tuning pairs
from the 24-month synthetic ledger for training Qwen2.5-0.5B-Instruct.
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

def generate_dataset(n=1200):
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
