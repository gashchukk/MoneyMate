import json
import os
import re

# ── Data: Monobank MCC list with ISO group metadata ───────────────────────────
_data_path = os.path.join(os.path.dirname(__file__), "..", "data", "mcc_with_groups.json")

with open(_data_path, "r", encoding="utf-8") as _f:
    _MCC_LIST = json.load(_f)


def _mcc_label_dict_from_item(item: dict) -> dict:
    """Prefer group.description (uk/en/ru); fall back to shortDescription if missing."""
    g = item.get("group") or {}
    desc = g.get("description") or {}
    uk = (desc.get("uk") or "").strip()
    en = (desc.get("en") or "").strip()
    if uk or en :
        return {"uk": uk, "en": en}
    sd = item.get("shortDescription") or {}
    return {
        "uk": (sd.get("uk") or "").strip(),
        "en": (sd.get("en") or "").strip(),
    }


# Per–4-digit MCC string → multilingual label (ISO group name, not merchant-specific short text).
MCC_MAP: dict[str, dict] = {
    item["mcc"]: _mcc_label_dict_from_item(item) for item in _MCC_LIST
}

# Map ISO group.type (from mcc_with_groups.json) → MoneyMate canonical category (English).
_GROUP_TYPE_TO_CATEGORY: dict[str, str] = {
    "AL": "Transport",   # Airlines
    "AS": "Other",       # Agricultural services
    "BS": "Other",       # Business services
    "CLS": "Shopping",   # Clothing stores
    "CR": "Transport",   # Car rental
    "CS": "Housing",     # Contract services / contractors
    "CV": "Transport",   # Cars & vehicles (dealers, fuel, etc.)
    "ES": "Entertainment",
    "GS": "Other",       # Government services
    "HR": "Housing",     # Hotels / resorts
    "MO": "Other",       # Membership orgs
    "MS": "Shopping",    # Miscellaneous / specialty retail
    "MTS": "Other",      # Mail / telephone order
    "NC": "Other",       # Not categorized
    "PFS": "Other",      # Professional services (medical/legal/education refined by ranges)
    "PS": "Other",       # Personal services
    "ROS": "Shopping",   # Retail outlet services
    "RS": "Transport",   # Repair services (mostly automotive)
    "SP": "Other",       # Service provider (includes transfers, restaurants — refined by ranges)
    "TS": "Transport",   # Transportation services
    "US": "Subscriptions",  # Utility / telecom-style
    "WSM": "Shopping",   # Wholesale / supply
}


def _build_mcc_category_lookup() -> dict[int, str]:
    """Derive per-code category from group.type, then apply ISO MCC range rules."""
    d: dict[int, str] = {}
    for item in _MCC_LIST:
        m = int(item["mcc"])
        gtype = (item.get("group") or {}).get("type") or ""
        d[m] = _GROUP_TYPE_TO_CATEGORY.get(gtype, "Other")

    def _apply_ranges() -> None:
        for m in range(3000, 3303):
            d[m] = "Transport"       # Airlines
        for m in range(3351, 3442):
            d[m] = "Transport"       # Car rental (ISO block)
        for m in range(3501, 3839):
            d[m] = "Housing"         # Hotels & lodging
        for m in range(5300, 5400):
            d[m] = "Shopping"        # Wholesale clubs / dept stores
        for m in range(5411, 5500):
            d[m] = "Groceries"
        for m in range(5600, 5700):
            d[m] = "Shopping"        # Apparel
        for m in range(5811, 5815):
            d[m] = "Food & Drink"    # Eating places
        for m in range(8011, 8100):
            d[m] = "Health"          # Medical (lawyers excluded below)
        d[8110] = "Other"
        d[8111] = "Other"
        for m in range(8211, 8300):
            d[m] = "Education"
        d[8351] = "Education"
        for m in (6211, 6236, 6760):
            d[m] = "Investment"
        for m in (
            4829, 6529, 6530, 6531, 6532, 6533, 6534,
            6535, 6536, 6537, 6538, 6539, 6540, 6611,
        ):
            d[m] = "Other"           # Card transfers / ambiguous money movement

    _apply_ranges()
    return d


_MCC_CATEGORY_MAP: dict[int, str] = _build_mcc_category_lookup()


def mcc_short_description(mcc: int | None) -> dict:
    """
    Return multilingual MCC label from ISO group.description: {"uk", "en", "ru"}.
    Falls back to shortDescription only when group.description is absent.
    """
    if mcc is None:
        return {}
    return MCC_MAP.get(str(mcc).zfill(4), {}) or {}


def mcc_to_category(mcc: int | None) -> str:
    """
    Map an MCC code to a MoneyMate canonical category (English label).
    Derived from mcc_with_groups.json (group.type) plus ISO MCC range rules.
    """
    if mcc is None:
        return "Other"
    return _MCC_CATEGORY_MAP.get(mcc, "Other")


# ── Description-based income classification ───────────────────────────────────
# Monobank reuses the same transfer MCCs (6529-6540, 4829, 6611) for salary,
# P2P, top-ups, freelance payments, etc.  Amount sign + description keywords
# let us split these into meaningful income categories automatically.

_TRANSFER_MCCS: frozenset[int] = frozenset({
    4829, 6529, 6530, 6531, 6532, 6533, 6534,
    6535, 6536, 6537, 6538, 6539, 6540, 6611,
})

_SALARY_RE = re.compile(
    r'зарплат|зп\b|salary|оклад|виплат|нарахуван|payroll|wages',
    re.IGNORECASE,
)
_FREELANCE_RE = re.compile(
    r'freelance|фріланс|контракт\b|contract|invoice|послуг|service fee|upwork|fiverr',
    re.IGNORECASE,
)
_BUSINESS_RE = re.compile(
    r'\bфоп\b|\bfop\b|\bтов\b|\bлтд\b|\bltd\b|\bllc\b|\binc\b|gmbh|s\.r\.o|business|підприємець',
    re.IGNORECASE,
)
_INVESTMENT_RE = re.compile(
    r'дивіденд|dividend|відсотк|interest|купон|coupon|bond|облігац',
    re.IGNORECASE,
)
_REFUND_RE = re.compile(
    r'повернен|refund|cashback|кешбек|компенсац|chargeback|поверт',
    re.IGNORECASE,
)
_GIFT_RE = re.compile(
    r'\bподарун|\bgift\b|birthday|день народження',
    re.IGNORECASE,
)


def smart_categorize(
    mcc: int | None,
    amount: float,
    description: str | None,
) -> str:
    """
    Categorize a transaction using MCC code, amount sign, and description text.

    For transfer MCCs (salary, P2P, top-ups all share the same code) we cannot
    rely on MCC alone.  We apply keyword matching on the description and use the
    amount sign to tell income from expense.
    """
    desc = description or ""

    # Non-transfer MCCs are unambiguous — delegate to the standard lookup.
    if mcc is not None and mcc not in _TRANSFER_MCCS:
        return mcc_to_category(mcc)

    # ── Income transactions (positive amount) ────────────────────────────────
    if amount > 0:
        if _SALARY_RE.search(desc):     return "Salary"
        if _BUSINESS_RE.search(desc):   return "Business"
        if _FREELANCE_RE.search(desc):  return "Freelance"
        if _INVESTMENT_RE.search(desc): return "Investment"
        if _REFUND_RE.search(desc):     return "Refund"
        if _GIFT_RE.search(desc):       return "Gift"
        # Positive transfer with no recognisable keyword → leave as Other so
        # the user can decide (salary from unknown employer, misc deposits, etc.)
        return "Other"

    # ── Expense / neutral transactions ───────────────────────────────────────
    if _REFUND_RE.search(desc):         return "Refund"
    return "Other"  # P2P send, top-up of another card, etc.
