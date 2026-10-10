from typing import List, Dict, Any
from app.providers.aa.base import AccountAggregatorProvider


SUPPORTED_MOCK_BANKS = {
    "hdfc": {
        "id": "acc_hdfc_01",
        "institution_name": "HDFC Bank",
        "bank_key": "hdfc",
        "account_type": "Savings Account",
        "account_number_masked": "•••• 4821",
        "balance": 42580.0,
        "currency": "INR",
        "provider": "mock_aa",
        "status": "connected",
    },
    "icici": {
        "id": "acc_icici_02",
        "institution_name": "ICICI Bank",
        "bank_key": "icici",
        "account_type": "Savings Account",
        "account_number_masked": "•••• 7712",
        "balance": 18240.0,
        "currency": "INR",
        "provider": "mock_aa",
        "status": "connected",
    },
    "sbi": {
        "id": "acc_sbi_03",
        "institution_name": "State Bank of India",
        "bank_key": "sbi",
        "account_type": "Savings Account",
        "account_number_masked": "•••• 9812",
        "balance": 18400.0,
        "currency": "INR",
        "provider": "mock_aa",
        "status": "connected",
    },
    "axis": {
        "id": "acc_axis_04",
        "institution_name": "Axis Bank",
        "bank_key": "axis",
        "account_type": "Current Account",
        "account_number_masked": "•••• 3044",
        "balance": 65200.0,
        "currency": "INR",
        "provider": "mock_aa",
        "status": "connected",
    },
    "kotak": {
        "id": "acc_kotak_05",
        "institution_name": "Kotak Mahindra Bank",
        "bank_key": "kotak",
        "account_type": "Savings Account",
        "account_number_masked": "•••• 5521",
        "balance": 89400.0,
        "currency": "INR",
        "provider": "mock_aa",
        "status": "connected",
    },
    "indusind": {
        "id": "acc_indusind_06",
        "institution_name": "IndusInd Bank",
        "bank_key": "indusind",
        "account_type": "Savings Account",
        "account_number_masked": "•••• 6310",
        "balance": 24150.0,
        "currency": "INR",
        "provider": "mock_aa",
        "status": "connected",
    },
}


class MockAAProvider(AccountAggregatorProvider):
    async def create_consent(self, user_phone: str) -> Dict[str, Any]:
        return {
            "consent_id": f"consent_mock_{user_phone[-4:] if len(user_phone) >= 4 else '1234'}",
            "status": "APPROVED",
            "redirect_url": "https://sandbox.assay.finance/consent",
        }

    async def fetch_accounts(self, consent_id: str) -> List[Dict[str, Any]]:
        return list(SUPPORTED_MOCK_BANKS.values())

    def get_bank_details(self, bank_key: str) -> Dict[str, Any]:
        key = bank_key.lower().strip()
        if key in SUPPORTED_MOCK_BANKS:
            return SUPPORTED_MOCK_BANKS[key]
        for b_key, data in SUPPORTED_MOCK_BANKS.items():
            if b_key in key or key in b_key or data["institution_name"].lower() in key:
                return data
        return {
            "id": f"acc_{key}_custom",
            "institution_name": bank_key.title(),
            "bank_key": key,
            "account_type": "Savings Account",
            "account_number_masked": "•••• 1024",
            "balance": 25000.0,
            "currency": "INR",
            "provider": "mock_aa",
            "status": "connected",
        }

    async def fetch_transactions(self, account_id: str, date_from: str = "", date_to: str = "") -> List[Dict[str, Any]]:
        # Return specific transaction sets for accounts
        if "icici" in account_id.lower():
            return [
                {
                    "id": f"tx_{account_id}_01",
                    "account_id": account_id,
                    "amount": 8200.0,
                    "type": "debit",
                    "category": "Food & Dining",
                    "merchant_name": "Social Dining & Cafe",
                    "description": "Weekend dinner bill",
                    "transaction_date": "2026-10-09T20:30:00Z",
                    "is_recurring": False,
                    "is_fixed": False,
                    "is_discretionary": True,
                    "source_type": "aa",
                    "payment_method": "UPI",
                },
                {
                    "id": f"tx_{account_id}_02",
                    "account_id": account_id,
                    "amount": 6450.0,
                    "type": "debit",
                    "category": "Shopping",
                    "merchant_name": "Zara Lifestyle",
                    "description": "Apparel and footwear",
                    "transaction_date": "2026-10-07T16:15:00Z",
                    "is_recurring": False,
                    "is_fixed": False,
                    "is_discretionary": True,
                    "source_type": "aa",
                    "payment_method": "Card",
                },
                {
                    "id": f"tx_{account_id}_03",
                    "account_id": account_id,
                    "amount": 3850.0,
                    "type": "debit",
                    "category": "Bills & Utilities",
                    "merchant_name": "Tata Power",
                    "description": "Electricity statement",
                    "transaction_date": "2026-10-04T11:00:00Z",
                    "is_recurring": True,
                    "is_fixed": True,
                    "is_discretionary": False,
                    "source_type": "aa",
                    "payment_method": "UPI",
                },
                {
                    "id": f"tx_{account_id}_04",
                    "account_id": account_id,
                    "amount": 10000.0,
                    "type": "credit",
                    "category": "Transfer",
                    "merchant_name": "Self Transfer from HDFC",
                    "description": "Internal transfer between own accounts",
                    "transaction_date": "2026-10-02T14:00:00Z",
                    "is_recurring": False,
                    "is_fixed": False,
                    "is_discretionary": False,
                    "source_type": "aa",
                    "payment_method": "Bank",
                    "is_internal_transfer": True,
                },
            ]

        # Default / HDFC transactions
        return [
            {
                "id": f"tx_{account_id}_h01",
                "account_id": account_id,
                "amount": 45000.0,
                "type": "credit",
                "category": "Salary",
                "merchant_name": "TechCorp Solutions",
                "description": "Monthly Salary Credit",
                "transaction_date": "2026-10-01T10:00:00Z",
                "is_recurring": True,
                "is_fixed": True,
                "is_discretionary": False,
                "source_type": "aa",
                "payment_method": "Bank",
            },
            {
                "id": f"tx_{account_id}_h02",
                "account_id": account_id,
                "amount": 15000.0,
                "type": "debit",
                "category": "Housing & Rent",
                "merchant_name": "Landlord Rent Payment",
                "description": "Apartment Rent",
                "transaction_date": "2026-10-03T11:30:00Z",
                "is_recurring": True,
                "is_fixed": True,
                "is_discretionary": False,
                "source_type": "aa",
                "payment_method": "Bank",
            },
            {
                "id": f"tx_{account_id}_h03",
                "account_id": account_id,
                "amount": 3400.0,
                "type": "debit",
                "category": "Food & Dining",
                "merchant_name": "Swiggy",
                "description": "Weekend dinner delivery",
                "transaction_date": "2026-10-05T20:15:00Z",
                "is_recurring": False,
                "is_fixed": False,
                "is_discretionary": True,
                "source_type": "aa",
                "payment_method": "UPI",
            },
            {
                "id": f"tx_{account_id}_h04",
                "account_id": account_id,
                "amount": 4200.0,
                "type": "debit",
                "category": "Groceries",
                "merchant_name": "Blinkit",
                "description": "Weekly household essentials",
                "transaction_date": "2026-10-08T18:45:00Z",
                "is_recurring": False,
                "is_fixed": False,
                "is_discretionary": False,
                "source_type": "aa",
                "payment_method": "UPI",
            },
            {
                "id": f"tx_{account_id}_h05",
                "account_id": account_id,
                "amount": 999.0,
                "type": "debit",
                "category": "Subscriptions",
                "merchant_name": "Netflix",
                "description": "Premium 4K plan renewal",
                "transaction_date": "2026-10-10T09:00:00Z",
                "is_recurring": True,
                "is_fixed": True,
                "is_discretionary": True,
                "source_type": "aa",
                "payment_method": "Card",
            },
        ]

