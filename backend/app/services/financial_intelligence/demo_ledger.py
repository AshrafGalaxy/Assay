"""A small, repeatable ledger used until the dataset import is connected."""

from typing import Any


def get_demo_transactions() -> list[dict[str, Any]]:
    """Return a three-month INR ledger with recurring and discretionary spend."""
    entries = [
        # July
        ("2026-07-01", 85000, "credit", "Salary", "TechCorp Solutions", True, True, False),
        ("2026-07-03", 25000, "debit", "Housing & Rent", "Landlord Rent Payment", True, True, False),
        ("2026-07-05", 1900, "debit", "Utilities", "Airtel Broadband", True, True, False),
        ("2026-07-12", 999, "debit", "Subscriptions", "Netflix", True, True, True),
        ("2026-07-15", 7600, "debit", "Food & Dining", "Swiggy", False, False, True),
        ("2026-07-18", 8100, "debit", "Groceries", "Blinkit", False, False, False),
        ("2026-07-22", 3200, "debit", "Transportation", "Uber", False, False, True),
        # August
        ("2026-08-01", 85000, "credit", "Salary", "TechCorp Solutions", True, True, False),
        ("2026-08-03", 25000, "debit", "Housing & Rent", "Landlord Rent Payment", True, True, False),
        ("2026-08-05", 1900, "debit", "Utilities", "Airtel Broadband", True, True, False),
        ("2026-08-12", 999, "debit", "Subscriptions", "Netflix", True, True, True),
        ("2026-08-16", 9800, "debit", "Food & Dining", "Zomato", False, False, True),
        ("2026-08-19", 8400, "debit", "Groceries", "Blinkit", False, False, False),
        ("2026-08-24", 3400, "debit", "Shopping", "Amazon", False, False, True),
        # September: intentionally incomplete, so the forecast has work to do.
        ("2026-09-01", 85000, "credit", "Salary", "TechCorp Solutions", True, True, False),
        ("2026-09-03", 25000, "debit", "Housing & Rent", "Landlord Rent Payment", True, True, False),
        ("2026-09-05", 1900, "debit", "Utilities", "Airtel Broadband", True, True, False),
        ("2026-09-12", 999, "debit", "Subscriptions", "Netflix", True, True, True),
        ("2026-09-14", 13400, "debit", "Food & Dining", "Swiggy", False, False, True),
        ("2026-09-17", 6200, "debit", "Groceries", "Blinkit", False, False, False),
        ("2026-09-19", 2800, "debit", "Transportation", "Uber", False, False, True),
    ]
    return [
        {
            "id": f"demo_tx_{index:03d}",
            "account_id": "demo_salary_account",
            "amount": amount,
            "type": transaction_type,
            "category": category,
            "merchant_name": merchant,
            "description": merchant,
            "transaction_date": transaction_date,
            "is_recurring": is_recurring,
            "is_fixed": is_fixed,
            "is_discretionary": is_discretionary,
            "source_type": "manual",
        }
        for index, (
            transaction_date,
            amount,
            transaction_type,
            category,
            merchant,
            is_recurring,
            is_fixed,
            is_discretionary,
        ) in enumerate(entries, start=1)
    ]
