from typing import List, Dict, Any
from app.providers.aa.base import AccountAggregatorProvider


SUPPORTED_MOCK_BANKS = {
    "hdfc": {
        "id": "acc_hdfc_01",
        "institution_name": "HDFC Bank",
        "bank_key": "hdfc",
        "account_type": "Savings Account",
        "account_number_masked": "•••• 4821",
        "balance": 0.0,
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
        "balance": 0.0,
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
        "balance": 0.0,
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
        "balance": 0.0,
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
        "balance": 0.0,
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
        "balance": 0.0,
        "currency": "INR",
        "provider": "mock_aa",
        "status": "connected",
    },
}


# The bank that carries the ledger-derived balance. There is one transaction ledger,
# so exactly one linked account reflects it; the others hold no balance of their own.
PRIMARY_BANK_KEY = "hdfc"


def ledger_derived_balance() -> float:
    """Closing cash balance implied by the transaction ledger (starting balance + net flow)."""
    from app.services.financial_intelligence.ledger import get_ledger_transactions, get_user_profile
    from app.services.financial_intelligence.ledger_metrics import derive_closing_balance

    profile = get_user_profile()
    transactions = get_ledger_transactions(historical_only=False)
    return derive_closing_balance(transactions, float(profile.get("starting_balance") or 0.0))


class MockAAProvider(AccountAggregatorProvider):
    async def create_consent(self, user_phone: str) -> Dict[str, Any]:
        return {
            "consent_id": f"consent_mock_{user_phone[-4:] if len(user_phone) >= 4 else '1234'}",
            "status": "APPROVED",
            "redirect_url": "https://sandbox.assay.finance/consent",
        }

    def _with_balance(self, bank: Dict[str, Any]) -> Dict[str, Any]:
        account = dict(bank)
        account["balance"] = ledger_derived_balance() if account.get("bank_key") == PRIMARY_BANK_KEY else 0.0
        return account

    async def fetch_accounts(self, consent_id: str) -> List[Dict[str, Any]]:
        return [self._with_balance(bank) for bank in SUPPORTED_MOCK_BANKS.values()]

    def get_bank_details(self, bank_key: str) -> Dict[str, Any]:
        key = bank_key.lower().strip()
        if key in SUPPORTED_MOCK_BANKS:
            return self._with_balance(SUPPORTED_MOCK_BANKS[key])
        for b_key, data in SUPPORTED_MOCK_BANKS.items():
            if b_key in key or key in b_key or data["institution_name"].lower() in key:
                return self._with_balance(data)
        return {
            "id": f"acc_{key}_custom",
            "institution_name": bank_key.title(),
            "bank_key": key,
            "account_type": "Savings Account",
            "account_number_masked": "•••• 1024",
            "balance": 0.0,
            "currency": "INR",
            "provider": "mock_aa",
            "status": "connected",
        }

    async def fetch_transactions(self, account_id: str, date_from: str = "", date_to: str = "") -> List[Dict[str, Any]]:
        """Transactions come from the ledger (merged by the transactions API), not from here.

        Returning an empty list avoids duplicating the ledger with fabricated rows.
        """
        return []
