"""Reproducible synthetic personal-finance dataset generator for Assay.

Produces five coordinated CSV datasets (users, transactions, monthly_finances,
obligations, scenarios) for forecasting, scenario simulation, constrained
planning, and evaluation.

Accounting identity (INR, 2 d.p.):
  ClosingBalance = OpeningBalance + Income
                   - EssentialExpenses - DiscretionaryExpenses
                   - EMIPayment - SavingsContribution

SavingsContribution is planned savings capped by cash available after required
and discretionary outflows (never invents a positive transfer when cash < 0).
Negative closing balances are allowed (genuine shortfalls).

Future shocks never mutate historical months. Outcome / shock columns are for
evaluation only — see FEATURE_COLUMNS vs EVALUATION_COLUMNS.
"""

from __future__ import annotations

import argparse
import calendar
import json
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Schema / constants
# ---------------------------------------------------------------------------

CURRENCY = "INR"
MONEY_DECIMALS = 2

SCENARIO_STABLE = "stable_income"
SCENARIO_INCOME_REDUCTION = "income_reduction"
SCENARIO_UNEXPECTED_EXPENSE = "unexpected_essential_expense"
SCENARIO_INFEASIBLE_TARGET = "infeasible_savings_target"
SCENARIO_HIGH_UNCERTAINTY = "high_income_uncertainty"

MANDATORY_SCENARIOS: tuple[str, ...] = (
    SCENARIO_STABLE,
    SCENARIO_INCOME_REDUCTION,
    SCENARIO_UNEXPECTED_EXPENSE,
    SCENARIO_INFEASIBLE_TARGET,
    SCENARIO_HIGH_UNCERTAINTY,
)

PAYMENT_MODES = ("UPI", "Credit Card", "Debit Card", "Cash", "Net Banking", "Wallet")

# Align with Assay categorizer / engine category naming where possible.
ESSENTIAL_CATEGORIES = {
    "Housing & Rent": "Rent",
    "Groceries": "Groceries",
    "Utilities": "Utilities",
    "Transportation": "Transport Pass",
    "Healthcare": "Healthcare",
}
DISCRETIONARY_CATEGORIES = {
    "Food & Dining": "Dining",
    "Shopping": "Shopping",
    "Subscriptions": "Streaming",
    "Entertainment": "Entertainment",
}
INCOME_CATEGORY = "Salary"
EMI_CATEGORY = "Debt & EMI"
SAVINGS_CATEGORY = "Savings Transfer"

USER_COLUMNS = [
    "UserID", "Currency", "IncomeType", "BaseMonthlyIncome", "IncomeVolatility",
    "StartingBalance", "MinimumReserve", "MonthlyEMI", "SavingsTarget",
    "ScenarioID", "ScenarioType",
]
TRANSACTION_COLUMNS = [
    "TransactionID", "UserID", "ScenarioID", "TransactionDate", "Description",
    "Category", "TransactionType", "PaymentMode", "Amount", "IsRecurring",
]
MONTHLY_COLUMNS = [
    "UserID", "ScenarioID", "Month", "IsFutureOutcome", "OpeningBalance",
    "Income", "EssentialExpenses", "DiscretionaryExpenses", "EMIPayment",
    "PlannedSavings", "SavingsContribution", "ClosingBalance", "MinimumReserve",
    "CumulativeSavingsContributions", "ReserveViolated",
]
OBLIGATION_COLUMNS = [
    "ObligationID", "UserID", "ScenarioID", "ObligationType", "Category",
    "MonthlyAmount", "IsRecurring", "StartDate",
]
SCENARIO_COLUMNS = [
    "ScenarioID", "UserID", "ScenarioType", "ForecastStartMonth",
    "ForecastHorizonMonths", "ShockMonth", "IncomeReductionPct",
    "UnexpectedEssentialExpense", "SavingsTarget", "MinimumReserve",
    "InitialForecastBalance", "FinalActualBalance", "MinimumActualBalance",
    "ReserveViolated", "TargetFeasibleUnderRealizedSavings",
]

# Forecasting feature matrix must not include these evaluation / leakage fields.
EVALUATION_ONLY_MONTHLY = {"IsFutureOutcome", "ReserveViolated"}
EVALUATION_ONLY_SCENARIO = {
    "ShockMonth", "IncomeReductionPct", "UnexpectedEssentialExpense",
    "InitialForecastBalance", "FinalActualBalance", "MinimumActualBalance",
    "ReserveViolated", "TargetFeasibleUnderRealizedSavings",
}

DEFAULT_N_USERS = 500
DEFAULT_HISTORICAL_MONTHS = 30
DEFAULT_FORECAST_HORIZON = 6
DEFAULT_SEED = 42
DEFAULT_START_MONTH = "2023-01"
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parents[3] / "data" / "synthetic_finance"


class GeneratorConfigError(ValueError):
    """Invalid generator configuration."""


@dataclass(frozen=True)
class GeneratorConfig:
    n_users: int = DEFAULT_N_USERS
    start_month: str = DEFAULT_START_MONTH
    historical_months: int = DEFAULT_HISTORICAL_MONTHS
    forecast_horizon: int = DEFAULT_FORECAST_HORIZON
    seed: int = DEFAULT_SEED
    output_dir: Path = DEFAULT_OUTPUT_DIR

    def __post_init__(self) -> None:
        if self.n_users < len(MANDATORY_SCENARIOS):
            raise GeneratorConfigError(
                f"n_users must be >= {len(MANDATORY_SCENARIOS)} to cover all mandatory scenarios"
            )
        if self.historical_months < 1:
            raise GeneratorConfigError("historical_months must be >= 1")
        if self.forecast_horizon < 1:
            raise GeneratorConfigError("forecast_horizon must be >= 1")
        if self.seed < 0:
            raise GeneratorConfigError("seed must be >= 0")
        _parse_month(self.start_month)  # validates format


@dataclass
class UserProfile:
    user_id: str
    scenario_id: str
    scenario_type: str
    income_type: str
    base_income: float
    income_volatility: float
    starting_balance: float
    minimum_reserve: float
    monthly_emi: float
    savings_target: float
    planned_monthly_savings: float
    rent: float
    groceries: float
    utilities: float
    transport: float
    discretionary_base: float
    shock_offset: int | None  # months into forecast horizon [0, H)
    income_reduction_pct: float
    unexpected_expense: float


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _money(value: float) -> float:
    return round(float(value), MONEY_DECIMALS)


def _parse_month(value: str) -> date:
    try:
        year_s, month_s = value.split("-")
        year, month = int(year_s), int(month_s)
        if not 1 <= month <= 12:
            raise ValueError
        return date(year, month, 1)
    except Exception as exc:
        raise GeneratorConfigError(
            f"start_month must be YYYY-MM (got {value!r})"
        ) from exc


def _add_months(start: date, months: int) -> date:
    year = start.year + (start.month - 1 + months) // 12
    month = (start.month - 1 + months) % 12 + 1
    return date(year, month, 1)


def _month_label(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def _month_sequence(start: date, count: int) -> list[date]:
    return [_add_months(start, i) for i in range(count)]


def _day_in_month(rng: np.random.Generator, month: date, preferred: int | None = None) -> date:
    last = calendar.monthrange(month.year, month.month)[1]
    if preferred is not None:
        day = min(max(1, preferred), last)
    else:
        day = int(rng.integers(1, last + 1))
    return date(month.year, month.month, day)


def _assign_scenarios(n_users: int, rng: np.random.Generator) -> list[str]:
    assigned = list(MANDATORY_SCENARIOS)
    remainder = n_users - len(MANDATORY_SCENARIOS)
    if remainder > 0:
        assigned.extend(
            list(rng.choice(np.array(MANDATORY_SCENARIOS, dtype=object), size=remainder))
        )
    rng.shuffle(assigned)
    return [str(s) for s in assigned]


def _profile_for_scenario(
    *,
    user_index: int,
    scenario_type: str,
    forecast_horizon: int,
    rng: np.random.Generator,
) -> UserProfile:
    user_id = f"U{user_index:05d}"
    scenario_id = f"S{user_index:05d}"

    # Base heterogeneous INR profiles
    base_income = _money(float(rng.uniform(45000, 180000)))
    income_type = str(rng.choice(["salary", "salary", "freelance", "mixed"]))

    if scenario_type == SCENARIO_HIGH_UNCERTAINTY:
        income_volatility = float(rng.uniform(0.22, 0.38))
        income_type = "freelance"
    elif scenario_type == SCENARIO_STABLE:
        income_volatility = float(rng.uniform(0.01, 0.04))
        income_type = "salary"
    else:
        income_volatility = float(rng.uniform(0.03, 0.08))

    starting_balance = _money(float(rng.uniform(15000, 250000)))
    minimum_reserve = _money(max(10000.0, 0.4 * base_income * float(rng.uniform(0.6, 1.1))))

    # ~30% of users have no EMI (boundary case)
    monthly_emi = 0.0 if rng.random() < 0.30 else _money(float(rng.uniform(3000, min(25000, 0.25 * base_income))))

    rent = _money(float(rng.uniform(0.18, 0.32) * base_income))
    groceries = _money(float(rng.uniform(0.06, 0.12) * base_income))
    utilities = _money(float(rng.uniform(0.02, 0.05) * base_income))
    transport = _money(float(rng.uniform(0.02, 0.06) * base_income))
    discretionary_base = _money(float(rng.uniform(0.08, 0.18) * base_income))
    if rng.random() < 0.05:
        discretionary_base = 0.0  # boundary: zero discretionary

    planned_monthly_savings = _money(float(rng.uniform(0.05, 0.15) * base_income))
    # Cumulative target over the forecast horizon (reachable for most scenarios)
    savings_target = _money(planned_monthly_savings * forecast_horizon * float(rng.uniform(0.85, 1.15)))

    shock_offset: int | None = None
    income_reduction_pct = 0.0
    unexpected_expense = 0.0

    if scenario_type in {
        SCENARIO_INCOME_REDUCTION,
        SCENARIO_UNEXPECTED_EXPENSE,
        SCENARIO_INFEASIBLE_TARGET,
    }:
        shock_offset = int(rng.integers(0, forecast_horizon))

    if scenario_type == SCENARIO_INCOME_REDUCTION:
        income_reduction_pct = float(rng.uniform(0.25, 0.35))

    if scenario_type == SCENARIO_UNEXPECTED_EXPENSE:
        # Ensure a material essential shock; can exceed opening balance.
        unexpected_expense = _money(float(rng.uniform(0.35, 1.4) * base_income))

    if scenario_type == SCENARIO_INFEASIBLE_TARGET:
        # Tight cash after essentials + EMI leaves little room for savings while
        # holding the reserve — inflate target far beyond max feasible.
        essential = rent + groceries + utilities + transport
        planned_monthly_savings = _money(max(1000.0, 0.05 * base_income))
        # Feasibility uses Disc=0; still make target unreachable across horizon.
        optimistic_month = max(0.0, base_income - essential - monthly_emi)
        savings_target = _money(optimistic_month * forecast_horizon * float(rng.uniform(1.8, 2.6)) + minimum_reserve)
        # Keep starting balance modest so reserve + payments constrain savings.
        starting_balance = _money(min(starting_balance, minimum_reserve + float(rng.uniform(2000, 15000))))
        if shock_offset is None:
            shock_offset = int(rng.integers(0, forecast_horizon))

    if scenario_type == SCENARIO_STABLE:
        # Comfortable runway for baseline forecasting demos.
        starting_balance = _money(max(starting_balance, minimum_reserve + 2 * base_income * 0.2))

    return UserProfile(
        user_id=user_id,
        scenario_id=scenario_id,
        scenario_type=scenario_type,
        income_type=income_type,
        base_income=base_income,
        income_volatility=income_volatility,
        starting_balance=starting_balance,
        minimum_reserve=minimum_reserve,
        monthly_emi=monthly_emi,
        savings_target=savings_target,
        planned_monthly_savings=planned_monthly_savings,
        rent=rent,
        groceries=groceries,
        utilities=utilities,
        transport=transport,
        discretionary_base=discretionary_base,
        shock_offset=shock_offset,
        income_reduction_pct=income_reduction_pct,
        unexpected_expense=unexpected_expense,
    )


def _income_for_month(profile: UserProfile, rng: np.random.Generator, *, reduced: bool) -> float:
    noise = float(rng.normal(0.0, profile.income_volatility))
    factor = max(0.35, 1.0 + noise)
    income = profile.base_income * factor
    if reduced:
        income *= 1.0 - profile.income_reduction_pct
    return _money(max(1000.0, income))


def _essential_components(
    profile: UserProfile,
    rng: np.random.Generator,
    *,
    unexpected: float,
) -> dict[str, float]:
    jitter = lambda base: _money(max(0.0, base * float(rng.uniform(0.92, 1.08))))
    parts = {
        "Housing & Rent": jitter(profile.rent),
        "Groceries": jitter(profile.groceries),
        "Utilities": jitter(profile.utilities),
        "Transportation": jitter(profile.transport),
    }
    if unexpected > 0:
        parts["Healthcare"] = _money(unexpected)
    return parts


def _discretionary_components(profile: UserProfile, rng: np.random.Generator) -> dict[str, float]:
    if profile.discretionary_base <= 0:
        return {}
    weights = rng.dirichlet(np.ones(len(DISCRETIONARY_CATEGORIES)))
    total = _money(max(0.0, profile.discretionary_base * float(rng.uniform(0.85, 1.15))))
    keys = list(DISCRETIONARY_CATEGORIES.keys())
    parts: dict[str, float] = {}
    allocated = 0.0
    for i, key in enumerate(keys):
        if i == len(keys) - 1:
            amount = _money(max(0.0, total - allocated))
        else:
            amount = _money(total * float(weights[i]))
            allocated = _money(allocated + amount)
        if amount > 0:
            parts[key] = amount
    return parts


def _max_feasible_savings_path(
    *,
    opening: float,
    incomes: Sequence[float],
    essentials: Sequence[float],
    emis: Sequence[float],
    minimum_reserve: float,
) -> float:
    """Max cumulative savings if discretionary is cut to zero and reserve is held."""
    balance = opening
    cumulative = 0.0
    for income, essential, emi in zip(incomes, essentials, emis):
        # Pay required outflows; then save as much as possible while Closing >= reserve.
        after_required = balance + income - essential - emi
        max_save = max(0.0, after_required - minimum_reserve)
        cumulative = _money(cumulative + max_save)
        balance = _money(after_required - max_save)
    return cumulative


def _append_tx(
    rows: list[dict[str, Any]],
    *,
    tx_id: str,
    profile: UserProfile,
    tx_date: date,
    description: str,
    category: str,
    tx_type: str,
    payment_mode: str,
    amount: float,
    is_recurring: bool,
) -> None:
    if amount <= 0:
        return
    rows.append({
        "TransactionID": tx_id,
        "UserID": profile.user_id,
        "ScenarioID": profile.scenario_id,
        "TransactionDate": tx_date.isoformat(),
        "Description": description,
        "Category": category,
        "TransactionType": tx_type,
        "PaymentMode": payment_mode,
        "Amount": _money(amount),
        "IsRecurring": bool(is_recurring),
    })


# ---------------------------------------------------------------------------
# Core generation
# ---------------------------------------------------------------------------

def generate_dataset(config: GeneratorConfig) -> dict[str, pd.DataFrame]:
    """Generate the five coordinated datasets as DataFrames."""
    rng = np.random.default_rng(config.seed)
    start = _parse_month(config.start_month)
    total_months = config.historical_months + config.forecast_horizon
    months = _month_sequence(start, total_months)
    forecast_start = months[config.historical_months]
    scenario_types = _assign_scenarios(config.n_users, rng)

    user_rows: list[dict[str, Any]] = []
    tx_rows: list[dict[str, Any]] = []
    monthly_rows: list[dict[str, Any]] = []
    obligation_rows: list[dict[str, Any]] = []
    scenario_rows: list[dict[str, Any]] = []

    tx_counter = 0

    for user_index, scenario_type in enumerate(scenario_types, start=1):
        profile = _profile_for_scenario(
            user_index=user_index,
            scenario_type=scenario_type,
            forecast_horizon=config.forecast_horizon,
            rng=rng,
        )

        user_rows.append({
            "UserID": profile.user_id,
            "Currency": CURRENCY,
            "IncomeType": profile.income_type,
            "BaseMonthlyIncome": profile.base_income,
            "IncomeVolatility": round(profile.income_volatility, 6),
            "StartingBalance": profile.starting_balance,
            "MinimumReserve": profile.minimum_reserve,
            "MonthlyEMI": profile.monthly_emi,
            "SavingsTarget": profile.savings_target,
            "ScenarioID": profile.scenario_id,
            "ScenarioType": profile.scenario_type,
        })

        # Obligations (static schedule; amounts are typical monthly values)
        oblig_start = months[0].isoformat()
        obligation_defs = [
            ("Rent", "Housing & Rent", profile.rent),
            ("Groceries", "Groceries", profile.groceries),
            ("Utilities", "Utilities", profile.utilities),
            ("Transportation", "Transportation", profile.transport),
        ]
        if profile.monthly_emi > 0:
            obligation_defs.append(("EMI", EMI_CATEGORY, profile.monthly_emi))
        for idx, (otype, category, amount) in enumerate(obligation_defs, start=1):
            obligation_rows.append({
                "ObligationID": f"{profile.user_id}_OBL{idx:02d}",
                "UserID": profile.user_id,
                "ScenarioID": profile.scenario_id,
                "ObligationType": otype,
                "Category": category,
                "MonthlyAmount": _money(amount),
                "IsRecurring": True,
                "StartDate": oblig_start,
            })

        opening = profile.starting_balance
        cumulative_savings = 0.0
        future_closings: list[float] = []
        hist_incomes: list[float] = []
        hist_essentials: list[float] = []
        hist_disc: list[float] = []
        reserve_violated_any = False
        shock_month_label = ""
        forecast_opening: float | None = None

        for month_idx, month in enumerate(months):
            is_future = month_idx >= config.historical_months
            horizon_offset = month_idx - config.historical_months if is_future else None

            # Persist income reduction from the shock month through the horizon.
            reduced = (
                is_future
                and profile.scenario_type == SCENARIO_INCOME_REDUCTION
                and profile.shock_offset is not None
                and horizon_offset is not None
                and horizon_offset >= profile.shock_offset
            )

            unexpected = 0.0
            if (
                is_future
                and profile.scenario_type == SCENARIO_UNEXPECTED_EXPENSE
                and profile.shock_offset is not None
                and horizon_offset == profile.shock_offset
            ):
                unexpected = profile.unexpected_expense
                shock_month_label = _month_label(month)

            if (
                is_future
                and profile.scenario_type == SCENARIO_INCOME_REDUCTION
                and profile.shock_offset is not None
                and horizon_offset == profile.shock_offset
            ):
                shock_month_label = _month_label(month)

            income = _income_for_month(profile, rng, reduced=reduced)
            essential_parts = _essential_components(profile, rng, unexpected=unexpected)
            discretionary_parts = _discretionary_components(profile, rng)
            essential_total = _money(sum(essential_parts.values()))
            discretionary_total = _money(sum(discretionary_parts.values()))
            emi = _money(profile.monthly_emi)
            planned = _money(profile.planned_monthly_savings)

            cash_before_savings = _money(opening + income - essential_total - discretionary_total - emi)
            savings_contribution = _money(min(planned, max(0.0, cash_before_savings)))
            closing = _money(opening + income - essential_total - discretionary_total - emi - savings_contribution)
            cumulative_savings = _money(cumulative_savings + savings_contribution)
            reserve_violated = bool(closing < profile.minimum_reserve)
            reserve_violated_any = reserve_violated_any or (is_future and reserve_violated)

            month_label = _month_label(month)
            monthly_rows.append({
                "UserID": profile.user_id,
                "ScenarioID": profile.scenario_id,
                "Month": month_label,
                "IsFutureOutcome": bool(is_future),
                "OpeningBalance": _money(opening),
                "Income": income,
                "EssentialExpenses": essential_total,
                "DiscretionaryExpenses": discretionary_total,
                "EMIPayment": emi,
                "PlannedSavings": planned,
                "SavingsContribution": savings_contribution,
                "ClosingBalance": closing,
                "MinimumReserve": profile.minimum_reserve,
                "CumulativeSavingsContributions": cumulative_savings,
                "ReserveViolated": reserve_violated,
            })

            # Transactions that reconcile to monthly aggregates
            salary_day = _day_in_month(rng, month, preferred=1)
            tx_counter += 1
            _append_tx(
                tx_rows,
                tx_id=f"TX{tx_counter:08d}",
                profile=profile,
                tx_date=salary_day,
                description=f"{profile.income_type.title()} credit",
                category=INCOME_CATEGORY,
                tx_type="income",
                payment_mode="Net Banking",
                amount=income,
                is_recurring=True,
            )

            for category, amount in essential_parts.items():
                tx_counter += 1
                preferred = 3 if category == "Housing & Rent" else None
                _append_tx(
                    tx_rows,
                    tx_id=f"TX{tx_counter:08d}",
                    profile=profile,
                    tx_date=_day_in_month(rng, month, preferred=preferred),
                    description=ESSENTIAL_CATEGORIES.get(category, category),
                    category=category,
                    tx_type="essential_expense",
                    payment_mode=str(rng.choice(PAYMENT_MODES)),
                    amount=amount,
                    is_recurring=category != "Healthcare",
                )

            for category, amount in discretionary_parts.items():
                tx_counter += 1
                _append_tx(
                    tx_rows,
                    tx_id=f"TX{tx_counter:08d}",
                    profile=profile,
                    tx_date=_day_in_month(rng, month),
                    description=DISCRETIONARY_CATEGORIES.get(category, category),
                    category=category,
                    tx_type="discretionary_expense",
                    payment_mode=str(rng.choice(PAYMENT_MODES)),
                    amount=amount,
                    is_recurring=category == "Subscriptions",
                )

            if emi > 0:
                tx_counter += 1
                _append_tx(
                    tx_rows,
                    tx_id=f"TX{tx_counter:08d}",
                    profile=profile,
                    tx_date=_day_in_month(rng, month, preferred=5),
                    description="Loan EMI",
                    category=EMI_CATEGORY,
                    tx_type="debt_payment",
                    payment_mode="Net Banking",
                    amount=emi,
                    is_recurring=True,
                )

            if savings_contribution > 0:
                tx_counter += 1
                _append_tx(
                    tx_rows,
                    tx_id=f"TX{tx_counter:08d}",
                    profile=profile,
                    tx_date=_day_in_month(rng, month, preferred=28),
                    description="Savings transfer",
                    category=SAVINGS_CATEGORY,
                    tx_type="savings_transfer",
                    payment_mode="Net Banking",
                    amount=savings_contribution,
                    is_recurring=True,
                )

            if is_future:
                if forecast_opening is None:
                    forecast_opening = float(monthly_rows[-1]["OpeningBalance"])
                future_closings.append(closing)
            else:
                hist_incomes.append(income)
                hist_essentials.append(essential_total)
                hist_disc.append(discretionary_total)

            opening = closing

        # Initial forecast balance: naive projection without shock knowledge.
        mean_income = float(np.mean(hist_incomes)) if hist_incomes else profile.base_income
        mean_essential = float(np.mean(hist_essentials)) if hist_essentials else 0.0
        mean_disc = float(np.mean(hist_disc)) if hist_disc else 0.0
        bal = float(forecast_opening if forecast_opening is not None else profile.starting_balance)
        for _ in range(config.forecast_horizon):
            before_save = bal + mean_income - mean_essential - mean_disc - profile.monthly_emi
            save = min(profile.planned_monthly_savings, max(0.0, before_save))
            bal = _money(before_save - save)
        initial_forecast_balance = bal

        # Feasibility via constraints (Disc=0, hold reserve) — not merely realized totals.
        base_essential = _money(profile.rent + profile.groceries + profile.utilities + profile.transport)
        feas_incomes = [profile.base_income] * config.forecast_horizon
        feas_essentials = [base_essential] * config.forecast_horizon
        feas_emis = [profile.monthly_emi] * config.forecast_horizon
        max_feasible = _max_feasible_savings_path(
            opening=float(forecast_opening if forecast_opening is not None else profile.starting_balance),
            incomes=feas_incomes,
            essentials=feas_essentials,
            emis=feas_emis,
            minimum_reserve=profile.minimum_reserve,
        )
        target_feasible = bool(max_feasible + 1e-9 >= profile.savings_target)
        savings_target_value = profile.savings_target

        if profile.scenario_type == SCENARIO_INFEASIBLE_TARGET:
            target_feasible = False
            if max_feasible + 1e-9 >= profile.savings_target:
                savings_target_value = _money(max_feasible + max(50000.0, 0.5 * profile.base_income))
                user_rows[-1]["SavingsTarget"] = savings_target_value

        final_actual = future_closings[-1] if future_closings else opening
        min_actual = min(future_closings) if future_closings else opening

        scenario_rows.append({
            "ScenarioID": profile.scenario_id,
            "UserID": profile.user_id,
            "ScenarioType": profile.scenario_type,
            "ForecastStartMonth": _month_label(forecast_start),
            "ForecastHorizonMonths": config.forecast_horizon,
            "ShockMonth": shock_month_label,
            "IncomeReductionPct": round(profile.income_reduction_pct, 6),
            "UnexpectedEssentialExpense": _money(profile.unexpected_expense),
            "SavingsTarget": savings_target_value,
            "MinimumReserve": profile.minimum_reserve,
            "InitialForecastBalance": _money(initial_forecast_balance),
            "FinalActualBalance": _money(final_actual),
            "MinimumActualBalance": _money(min_actual),
            "ReserveViolated": bool(reserve_violated_any),
            "TargetFeasibleUnderRealizedSavings": bool(target_feasible),
        })

    users = pd.DataFrame(user_rows, columns=USER_COLUMNS)
    transactions = pd.DataFrame(tx_rows, columns=TRANSACTION_COLUMNS)
    monthly = pd.DataFrame(monthly_rows, columns=MONTHLY_COLUMNS)
    obligations = pd.DataFrame(obligation_rows, columns=OBLIGATION_COLUMNS)
    scenarios = pd.DataFrame(scenario_rows, columns=SCENARIO_COLUMNS)

    # Stable dtypes
    for frame, money_cols in (
        (users, ["BaseMonthlyIncome", "StartingBalance", "MinimumReserve", "MonthlyEMI", "SavingsTarget"]),
        (transactions, ["Amount"]),
        (monthly, [
            "OpeningBalance", "Income", "EssentialExpenses", "DiscretionaryExpenses",
            "EMIPayment", "PlannedSavings", "SavingsContribution", "ClosingBalance",
            "MinimumReserve", "CumulativeSavingsContributions",
        ]),
        (obligations, ["MonthlyAmount"]),
        (scenarios, [
            "IncomeReductionPct", "UnexpectedEssentialExpense", "SavingsTarget",
            "MinimumReserve", "InitialForecastBalance", "FinalActualBalance",
            "MinimumActualBalance",
        ]),
    ):
        for col in money_cols:
            frame[col] = frame[col].astype(float)

    transactions["IsRecurring"] = transactions["IsRecurring"].astype(bool)
    monthly["IsFutureOutcome"] = monthly["IsFutureOutcome"].astype(bool)
    monthly["ReserveViolated"] = monthly["ReserveViolated"].astype(bool)
    obligations["IsRecurring"] = obligations["IsRecurring"].astype(bool)
    scenarios["ReserveViolated"] = scenarios["ReserveViolated"].astype(bool)
    scenarios["TargetFeasibleUnderRealizedSavings"] = scenarios["TargetFeasibleUnderRealizedSavings"].astype(bool)
    scenarios["ForecastHorizonMonths"] = scenarios["ForecastHorizonMonths"].astype(int)

    return {
        "users": users,
        "transactions": transactions,
        "monthly_finances": monthly,
        "obligations": obligations,
        "scenarios": scenarios,
    }


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

@dataclass
class ValidationReport:
    ok: bool
    summary: dict[str, Any]
    errors: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {"ok": self.ok, "summary": self.summary, "errors": self.errors}


def validate_dataset(
    frames: Mapping[str, pd.DataFrame],
    *,
    config: GeneratorConfig | None = None,
    atol: float = 0.01,
) -> ValidationReport:
    errors: list[str] = []
    users = frames["users"]
    transactions = frames["transactions"]
    monthly = frames["monthly_finances"]
    obligations = frames["obligations"]
    scenarios = frames["scenarios"]

    for name, cols in (
        ("users", USER_COLUMNS),
        ("transactions", TRANSACTION_COLUMNS),
        ("monthly_finances", MONTHLY_COLUMNS),
        ("obligations", OBLIGATION_COLUMNS),
        ("scenarios", SCENARIO_COLUMNS),
    ):
        missing = [c for c in cols if c not in frames[name].columns]
        if missing:
            errors.append(f"{name}: missing columns {missing}")

    if config is not None:
        if len(users) != config.n_users:
            errors.append(f"expected {config.n_users} users, got {len(users)}")
        expected_months = config.historical_months + config.forecast_horizon
        counts = monthly.groupby("UserID").size()
        if not counts.empty and not (counts == expected_months).all():
            errors.append("not every user has the configured number of months")

    present_scenarios = set(users["ScenarioType"].unique())
    missing_sc = [s for s in MANDATORY_SCENARIOS if s not in present_scenarios]
    if missing_sc:
        errors.append(f"missing mandatory scenarios: {missing_sc}")

    if transactions["Amount"].lt(0).any():
        errors.append("negative transaction amounts found")
    if transactions["TransactionID"].duplicated().any():
        errors.append("duplicate TransactionIDs")

    # Valid dates
    try:
        parsed_dates = pd.to_datetime(transactions["TransactionDate"], format="%Y-%m-%d", errors="raise")
    except Exception as exc:
        errors.append(f"invalid TransactionDate values: {exc}")
        parsed_dates = None

    # Cash-flow identity + continuity
    m = monthly.copy()
    expected_closing = (
        m["OpeningBalance"] + m["Income"]
        - m["EssentialExpenses"] - m["DiscretionaryExpenses"]
        - m["EMIPayment"] - m["SavingsContribution"]
    ).round(MONEY_DECIMALS)
    if not np.allclose(m["ClosingBalance"].to_numpy(), expected_closing.to_numpy(), atol=atol):
        errors.append("monthly cash-flow identity failed")

    for user_id, group in m.sort_values("Month").groupby("UserID"):
        closings = group["ClosingBalance"].to_numpy()
        openings = group["OpeningBalance"].to_numpy()
        if len(openings) > 1 and not np.allclose(openings[1:], closings[:-1], atol=atol):
            errors.append(f"balance continuity broken for {user_id}")
            break
        computed_reserve = (group["ClosingBalance"] < group["MinimumReserve"]).to_numpy()
        if not np.array_equal(computed_reserve, group["ReserveViolated"].to_numpy()):
            errors.append(f"ReserveViolated mismatch for {user_id}")
            break

    # Transaction aggregates vs monthly (savings excluded from expenses)
    tx = transactions.copy()
    tx["Month"] = pd.to_datetime(tx["TransactionDate"]).dt.strftime("%Y-%m")
    income_sum = tx[tx["TransactionType"] == "income"].groupby(["UserID", "Month"])["Amount"].sum()
    essential_sum = tx[tx["TransactionType"] == "essential_expense"].groupby(["UserID", "Month"])["Amount"].sum()
    disc_sum = tx[tx["TransactionType"] == "discretionary_expense"].groupby(["UserID", "Month"])["Amount"].sum()
    emi_sum = tx[tx["TransactionType"] == "debt_payment"].groupby(["UserID", "Month"])["Amount"].sum()
    sav_sum = tx[tx["TransactionType"] == "savings_transfer"].groupby(["UserID", "Month"])["Amount"].sum()

    for _, row in m.iterrows():
        key = (row["UserID"], row["Month"])
        checks = (
            ("Income", income_sum),
            ("EssentialExpenses", essential_sum),
            ("DiscretionaryExpenses", disc_sum),
            ("EMIPayment", emi_sum),
            ("SavingsContribution", sav_sum),
        )
        for col, series in checks:
            got = float(series.get(key, 0.0))
            if abs(got - float(row[col])) > atol:
                errors.append(f"tx vs monthly mismatch {col} {key}: {got} != {row[col]}")
                if len(errors) > 25:
                    break
        if len(errors) > 25:
            errors.append("… further reconciliation errors truncated")
            break

    # Scenario quality checks
    for _, sc in scenarios.iterrows():
        st = sc["ScenarioType"]
        if st == SCENARIO_INCOME_REDUCTION:
            if not (0.25 - 1e-9 <= float(sc["IncomeReductionPct"]) <= 0.35 + 1e-9):
                errors.append(f"{sc['ScenarioID']}: income reduction not in 25–35%")
            if not sc["ShockMonth"]:
                errors.append(f"{sc['ScenarioID']}: missing ShockMonth for income reduction")
            else:
                # Historical months must not show the reduced income pattern check:
                # income in shock month < 0.9 * mean historical income for that user
                uid = sc["UserID"]
                hist = m[(m["UserID"] == uid) & (~m["IsFutureOutcome"])]
                shocked = m[(m["UserID"] == uid) & (m["Month"] == sc["ShockMonth"])]
                if not shocked.empty and not hist.empty:
                    if float(shocked.iloc[0]["Income"]) >= 0.9 * float(hist["Income"].mean()):
                        errors.append(f"{sc['ScenarioID']}: income shock not observable")
                # History unchanged by construction if ShockMonth is future
                if sc["ShockMonth"] < sc["ForecastStartMonth"]:
                    errors.append(f"{sc['ScenarioID']}: shock in historical period")

        if st == SCENARIO_UNEXPECTED_EXPENSE:
            if float(sc["UnexpectedEssentialExpense"]) <= 0:
                errors.append(f"{sc['ScenarioID']}: missing unexpected expense")
            if not sc["ShockMonth"] or sc["ShockMonth"] < sc["ForecastStartMonth"]:
                errors.append(f"{sc['ScenarioID']}: unexpected expense not in future")
            else:
                uid = sc["UserID"]
                shocked = m[(m["UserID"] == uid) & (m["Month"] == sc["ShockMonth"])]
                if shocked.empty or float(shocked.iloc[0]["EssentialExpenses"]) < float(sc["UnexpectedEssentialExpense"]) - atol:
                    errors.append(f"{sc['ScenarioID']}: unexpected expense not in essentials")

        if st == SCENARIO_INFEASIBLE_TARGET:
            if bool(sc["TargetFeasibleUnderRealizedSavings"]):
                errors.append(f"{sc['ScenarioID']}: infeasible target marked feasible")

    # High uncertainty vs stable volatility
    vol_stable = users.loc[users["ScenarioType"] == SCENARIO_STABLE, "IncomeVolatility"]
    vol_unc = users.loc[users["ScenarioType"] == SCENARIO_HIGH_UNCERTAINTY, "IncomeVolatility"]
    if not vol_stable.empty and not vol_unc.empty:
        if float(vol_unc.mean()) <= float(vol_stable.mean()):
            errors.append("high-uncertainty volatility not greater than stable")

    # Realized income variance check on monthly series
    def _income_std(scenario: str) -> float:
        ids = set(users.loc[users["ScenarioType"] == scenario, "UserID"])
        if not ids:
            return 0.0
        subset = m[m["UserID"].isin(ids) & (~m["IsFutureOutcome"])]
        return float(subset.groupby("UserID")["Income"].std().mean())

    if _income_std(SCENARIO_HIGH_UNCERTAINTY) <= _income_std(SCENARIO_STABLE):
        errors.append("realized historical income variance: uncertainty <= stable")

    summary = {
        "n_users": int(len(users)),
        "n_transactions": int(len(transactions)),
        "n_monthly_rows": int(len(monthly)),
        "n_obligations": int(len(obligations)),
        "n_scenarios": int(len(scenarios)),
        "scenario_counts": users["ScenarioType"].value_counts().to_dict(),
        "historical_months": int((~monthly["IsFutureOutcome"]).groupby(monthly["UserID"]).sum().max()) if len(monthly) else 0,
        "future_months": int(monthly["IsFutureOutcome"].groupby(monthly["UserID"]).sum().max()) if len(monthly) else 0,
        "cash_flow_ok": not any("cash-flow" in e for e in errors),
        "transaction_reconcile_ok": not any("tx vs monthly" in e for e in errors),
        "reserve_violation_months": int(monthly["ReserveViolated"].sum()) if len(monthly) else 0,
        "reserve_violation_scenarios": int(scenarios["ReserveViolated"].sum()) if len(scenarios) else 0,
        "target_feasible_true": int(scenarios["TargetFeasibleUnderRealizedSavings"].sum()) if len(scenarios) else 0,
        "target_feasible_false": int((~scenarios["TargetFeasibleUnderRealizedSavings"]).sum()) if len(scenarios) else 0,
        "seed": config.seed if config else None,
        "output_dir": str(config.output_dir) if config else None,
    }
    return ValidationReport(ok=len(errors) == 0, summary=summary, errors=errors)


# ---------------------------------------------------------------------------
# IO
# ---------------------------------------------------------------------------

def export_dataset(frames: Mapping[str, pd.DataFrame], output_dir: Path) -> dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, Path] = {}
    mapping = {
        "users": "users.csv",
        "transactions": "transactions.csv",
        "monthly_finances": "monthly_finances.csv",
        "obligations": "obligations.csv",
        "scenarios": "scenarios.csv",
    }
    for key, filename in mapping.items():
        path = output_dir / filename
        frames[key].to_csv(path, index=False)
        paths[key] = path
    meta = {
        "evaluation_only_monthly_columns": sorted(EVALUATION_ONLY_MONTHLY),
        "evaluation_only_scenario_columns": sorted(EVALUATION_ONLY_SCENARIO),
        "note": (
            "Do not include evaluation-only columns or future IsFutureOutcome rows "
            "in forecasting feature matrices. Shock fields are labels / metadata."
        ),
    }
    meta_path = output_dir / "dataset_meta.json"
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    paths["meta"] = meta_path
    return paths


def load_dataset(output_dir: Path) -> dict[str, pd.DataFrame]:
    return {
        "users": pd.read_csv(output_dir / "users.csv"),
        "transactions": pd.read_csv(output_dir / "transactions.csv"),
        "monthly_finances": pd.read_csv(output_dir / "monthly_finances.csv"),
        "obligations": pd.read_csv(output_dir / "obligations.csv"),
        "scenarios": pd.read_csv(output_dir / "scenarios.csv"),
    }


def generate_and_export(config: GeneratorConfig) -> tuple[dict[str, pd.DataFrame], ValidationReport, dict[str, Path]]:
    frames = generate_dataset(config)
    report = validate_dataset(frames, config=config)
    paths = export_dataset(frames, config.output_dir)
    return frames, report, paths


def print_report(report: ValidationReport) -> None:
    print(json.dumps(report.to_dict(), indent=2, default=str))


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Assay synthetic personal finance dataset generator")
    parser.add_argument("--n-users", type=int, default=DEFAULT_N_USERS)
    parser.add_argument("--start-month", type=str, default=DEFAULT_START_MONTH)
    parser.add_argument("--historical-months", type=int, default=DEFAULT_HISTORICAL_MONTHS)
    parser.add_argument("--forecast-horizon", type=int, default=DEFAULT_FORECAST_HORIZON)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Validate existing CSV files in --output-dir without regenerating",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_arg_parser().parse_args(argv)
    try:
        config = GeneratorConfig(
            n_users=args.n_users,
            start_month=args.start_month,
            historical_months=args.historical_months,
            forecast_horizon=args.forecast_horizon,
            seed=args.seed,
            output_dir=Path(args.output_dir),
        )
    except GeneratorConfigError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 2

    if args.validate_only:
        if not (config.output_dir / "users.csv").exists():
            print(f"No dataset found in {config.output_dir}", file=sys.stderr)
            return 2
        frames = load_dataset(config.output_dir)
        # Infer shape from files so --validate-only does not require repeating sizes.
        inferred = GeneratorConfig(
            n_users=len(frames["users"]),
            start_month=config.start_month,
            historical_months=int((~frames["monthly_finances"]["IsFutureOutcome"]).groupby(
                frames["monthly_finances"]["UserID"]
            ).sum().max()),
            forecast_horizon=int(frames["monthly_finances"]["IsFutureOutcome"].groupby(
                frames["monthly_finances"]["UserID"]
            ).sum().max()),
            seed=config.seed,
            output_dir=config.output_dir,
        )
        report = validate_dataset(frames, config=inferred)
        print_report(report)
        return 0 if report.ok else 1

    _, report, paths = generate_and_export(config)
    print(f"Wrote dataset to {config.output_dir}")
    for key, path in paths.items():
        print(f"  {key}: {path}")
    print_report(report)
    return 0 if report.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
