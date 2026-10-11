"""
24-Month Synthetic Ledger Generator (FIN 02 Addition 2).
Simulates a realistic 24-month personal financial history with:
- Fixed salary credits + quarterly performance bonuses
- Fixed obligations (Rent, Home Loan EMI)
- Stochastic living expenses (Groceries, seasonal utilities)
- Poisson-distributed emergency shocks (Medical bills, car repairs)
- Strict chronological splits:
  - M1 - M12: Training Set (12 months)
  - M13 - M18: Validation & Conformal Calibration Set (6 months)
  - M19 - M24: Out-of-Sample Test Evaluation Set (6 months)
"""

from typing import List, Tuple
from dataclasses import dataclass
import numpy as np


@dataclass
class PeriodLedger:
    period_id: int
    date_label: str
    salary: float
    variable_bonus: float
    total_income: float
    rent: float
    groceries: float
    utilities: float
    debt_emi: float
    total_essential: float
    discretionary: float
    net_cash_flow: float
    closing_balance: float
    is_shock: bool
    shock_amount: float
    savings: float = 0.0


class FinancialSynthesizer:
    """Deterministic, reproducible synthetic cash flow synthesizer for personal finance."""

    def __init__(self, seed: int = 42):
        self.seed = seed
        self.rng = np.random.default_rng(seed)

    def generate_24_months(self, initial_cash_balance: float = 65000.0) -> List[PeriodLedger]:
        """Generates 24 consecutive monthly ledger records preserving financial conservation laws."""
        ledger: List[PeriodLedger] = []
        running_balance = initial_cash_balance

        for t in range(1, 25):
            # 1. Deterministic Salary Credit (₹75,000 base)
            salary = 75000.0

            # 2. Variable Performance Bonus (Quarterly spike in months 3, 6, 9, 12, 15, 18, 21, 24)
            if t % 3 == 0:
                variable_bonus = float(self.rng.normal(12000.0, 2500.0))
                variable_bonus = max(4000.0, variable_bonus)
            else:
                # Occasional freelance / dividend inflow
                variable_bonus = float(self.rng.choice([0.0, 1500.0, 3000.0], p=[0.70, 0.20, 0.10]))

            total_income = round(salary + variable_bonus, 2)

            # 3. Non-Negotiable Essential Obligations
            rent = 22000.0
            debt_emi = 14500.0  # Fixed Home Loan EMI

            # Groceries (Log-Normal around ₹9,500)
            groceries = float(np.exp(self.rng.normal(np.log(9500.0), 0.08)))

            # Utilities (Seasonally higher in summer months: Apr-Jun -> periods 4-6, 16-18)
            month_of_year = ((t - 1) % 12) + 1
            if month_of_year in [4, 5, 6]:
                utilities = float(self.rng.normal(4800.0, 400.0))
            else:
                utilities = float(self.rng.normal(3200.0, 300.0))

            # 4. Emergency Shocks (Poisson process: ~15% chance per month)
            # Ensure planned shocks in test / validation periods for rigorous evaluation
            is_shock = False
            shock_amount = 0.0
            
            # Explicit ground-truth shocks to stress-test calibration:
            # Month 8: Minor car repair (₹18,500)
            # Month 16: Major medical emergency (₹35,000)
            # Month 21: Appliance failure (₹22,000)
            if t in [8, 16, 21] or (self.rng.random() < 0.10 and t not in [1, 2, 12, 13, 24]):
                is_shock = True
                if t == 16:
                    shock_amount = 35000.0
                elif t == 8:
                    shock_amount = 18500.0
                elif t == 21:
                    shock_amount = 22000.0
                else:
                    shock_amount = float(self.rng.uniform(15000.0, 30000.0))

            total_essential = round(rent + debt_emi + groceries + utilities + shock_amount, 2)

            # 5. Discretionary Spending (Dining, leisure, shopping)
            base_discretionary = float(self.rng.normal(16500.0, 2000.0))
            discretionary = round(max(6000.0, base_discretionary), 2)

            # 6. Cash Conservation
            net_cash_flow = round(total_income - total_essential - discretionary, 2)
            running_balance = round(running_balance + net_cash_flow, 2)

            # Year-Month Label
            year = 2024 + ((t - 1) // 12)
            month = ((t - 1) % 12) + 1
            date_label = f"{year}-{month:02d}"

            ledger.append(
                PeriodLedger(
                    period_id=t,
                    date_label=date_label,
                    salary=salary,
                    variable_bonus=variable_bonus,
                    total_income=total_income,
                    rent=rent,
                    groceries=round(groceries, 2),
                    utilities=round(utilities, 2),
                    debt_emi=debt_emi,
                    total_essential=total_essential,
                    discretionary=discretionary,
                    net_cash_flow=net_cash_flow,
                    closing_balance=running_balance,
                    is_shock=is_shock,
                    shock_amount=shock_amount,
                )
            )

        return ledger

    @staticmethod
    def get_splits(
        ledger: List[PeriodLedger],
    ) -> Tuple[List[PeriodLedger], List[PeriodLedger], List[PeriodLedger]]:
        """
        Partitions 24-month series chronologically:
        - Train Split: M1 to M12 (Index 0 to 11)
        - Validation & Calibration Split: M13 to M18 (Index 12 to 17)
        - Test Split: M19 to M24 (Index 18 to 23)
        """
        if len(ledger) < 24:
            raise ValueError(f"Ledger must contain at least 24 periods, got {len(ledger)}")

        train_split = ledger[0:12]
        val_split = ledger[12:18]
        test_split = ledger[18:24]
        return train_split, val_split, test_split
