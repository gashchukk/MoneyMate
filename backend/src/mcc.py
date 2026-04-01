import json
import os
import re

_data_path = os.path.join(os.path.dirname(__file__), "..", "data", "mcc.json")

with open(_data_path, "r", encoding="utf-8") as _f:
    _MCC_LIST = json.load(_f)

MCC_MAP: dict[str, dict] = {
    item["mcc"]: item["shortDescription"] for item in _MCC_LIST
}


def mcc_short_description(mcc: int | None) -> dict:
    """
    Return Monobank MCC shortDescription map: {"uk": str, "en": str, "ru": str}.
    """
    if mcc is None:
        return {}
    return MCC_MAP.get(str(mcc).zfill(4), {}) or {}


# Module-level lookup built from the full mcc.json dataset (1 088 codes).
# Large contiguous ISO blocks are handled as range checks in mcc_to_category();
# everything else is resolved here.
_MCC_CATEGORY_MAP: dict[int, str] = {
    # ── Agriculture / farming ─────────────────────────────────────────────────
    742: "Other", 743: "Other", 744: "Other", 763: "Other", 780: "Other",
    # ── Home contractors / renovation ─────────────────────────────────────────
    1520: "Housing", 1711: "Housing", 1731: "Housing",
    1740: "Housing", 1750: "Housing", 1761: "Housing",
    1771: "Housing", 1799: "Housing",
    # ── Printing / publishing ─────────────────────────────────────────────────
    2741: "Other", 2744: "Other", 2791: "Other", 2842: "Other",
    # ── 3882 is "Cashing" – not part of the hotels block ─────────────────────
    3882: "Other",
    # ── Transit & transport ───────────────────────────────────────────────────
    4011: "Transport", 4111: "Transport", 4112: "Transport",
    4119: "Health",     # Ambulance
    4121: "Transport",  # Taxi
    4131: "Transport",  # Bus
    4214: "Transport", 4215: "Transport",
    4225: "Other", 4304: "Other",
    4411: "Transport",  # Cruise lines
    4457: "Transport", 4468: "Transport",
    4511: "Transport",  # Airlines (individual range outside 3000-3302)
    4582: "Transport",
    4722: "Entertainment", 4723: "Entertainment",  # Tour operators
    4729: "Transport",
    4761: "Other",
    4784: "Transport",  # Toll roads
    4785: "Other", 4789: "Transport",
    # ── Telecom & subscriptions ───────────────────────────────────────────────
    4812: "Subscriptions", 4813: "Subscriptions",
    4814: "Subscriptions", 4815: "Subscriptions",
    4816: "Subscriptions", 4821: "Other",
    4829: "Other",   # Money transfer – could be salary, P2P, etc; user sets Transfer manually
    4899: "Subscriptions",
    4900: "Housing",    # Utilities
    # ── Auto parts / industrial ───────────────────────────────────────────────
    5013: "Transport",  # Auto parts wholesale
    5021: "Shopping", 5039: "Housing",
    5044: "Shopping", 5045: "Shopping",
    5046: "Shopping", 5047: "Health",
    5051: "Shopping", 5065: "Shopping",
    5072: "Shopping", 5074: "Housing",
    5085: "Shopping", 5094: "Shopping",
    5099: "Shopping",
    # ── Office / books / clothing / hardware ──────────────────────────────────
    5111: "Shopping", 5122: "Health",   # Drugs / pharma wholesale
    5131: "Shopping", 5137: "Shopping",
    5139: "Shopping", 5169: "Other",
    5172: "Transport",  # Petroleum products
    5192: "Shopping", 5193: "Shopping",
    5198: "Shopping", 5199: "Shopping",
    5200: "Shopping", 5211: "Shopping",
    5231: "Housing",    # Renovation/glass/paint contractors
    5251: "Shopping",
    5261: "Shopping", 5262: "Shopping",
    5271: "Housing",    # Mobile home dealers
    5292: "Other", 5295: "Other",
    5297: "Shopping", 5298: "Shopping", 5299: "Other",
    # ── Automotive dealers & services ─────────────────────────────────────────
    5511: "Transport", 5521: "Transport",
    5531: "Transport", 5532: "Transport",
    5533: "Transport", 5541: "Transport",
    5542: "Transport",
    5551: "Shopping",   # Boats (purchase)
    5552: "Transport",  # EV charging
    5561: "Transport", 5571: "Transport",
    5592: "Transport", 5598: "Transport", 5599: "Transport",
    # ── Home furnishing & electronics ─────────────────────────────────────────
    5712: "Shopping", 5713: "Shopping",
    5714: "Shopping", 5715: "Shopping",
    5718: "Shopping", 5719: "Shopping",
    5722: "Shopping", 5732: "Shopping",
    5733: "Shopping", 5734: "Shopping",
    5735: "Entertainment",  # Record shops
    # ── Digital goods & subscriptions ─────────────────────────────────────────
    5815: "Entertainment", 5816: "Entertainment",
    5817: "Subscriptions",  # Apps / in-app purchases
    5818: "Entertainment",
    # ── Specialty retail ──────────────────────────────────────────────────────
    5832: "Shopping",
    5912: "Health",     # Pharmacies / drug stores
    5921: "Shopping",
    5931: "Shopping", 5932: "Shopping", 5933: "Shopping",
    5935: "Shopping", 5937: "Shopping",
    5940: "Shopping",   # Bicycles
    5941: "Shopping",   # Sporting goods
    5942: "Shopping",   # Book stores
    5943: "Shopping", 5944: "Shopping", 5945: "Shopping",
    5946: "Shopping", 5947: "Shopping", 5948: "Shopping",
    5949: "Shopping", 5950: "Shopping",
    5960: "Other",      # Insurance
    5961: "Shopping",
    5962: "Entertainment",
    5963: "Shopping", 5964: "Shopping",
    5965: "Shopping", 5966: "Shopping",
    5967: "Other",
    5968: "Subscriptions",
    5969: "Shopping", 5970: "Shopping",
    5971: "Entertainment",  # Galleries
    5972: "Shopping", 5973: "Shopping", 5974: "Shopping",
    5975: "Health", 5976: "Health",
    5977: "Health",     # Cosmetics
    5978: "Shopping",
    5983: "Transport",  # Fuel dealers
    5992: "Shopping", 5993: "Shopping",
    5994: "Entertainment",  # Newspapers / magazines
    5995: "Shopping", 5996: "Shopping",
    5997: "Shopping", 5998: "Shopping", 5999: "Shopping",
    # ── Financial services ────────────────────────────────────────────────────
    6010: "Other", 6011: "Other", 6012: "Other",
    6022: "Other", 6023: "Other", 6025: "Other",
    6026: "Other", 6028: "Other",
    6050: "Other", 6051: "Other",
    6211: "Investment", 6236: "Investment",
    6300: "Other", 6381: "Other", 6399: "Other",
    6513: "Housing",    # Rental properties
    # 6529-6540 / 6611 are used by Monobank for card top-ups, P2P, salary, etc.
    # Keeping them as Other so they show in analytics.
    # Users can manually set Transfer only for true internal account moves.
    6529: "Other", 6530: "Other",
    6531: "Other", 6532: "Other", 6533: "Other",
    6534: "Other", 6535: "Other", 6536: "Other",
    6537: "Other", 6538: "Other", 6539: "Other",
    6540: "Other",
    6611: "Other", 6760: "Investment",
    # ── Hotels & accommodation (individual codes outside 3501-3838) ───────────
    7011: "Housing", 7012: "Housing",
    # ── Recreation / camping ──────────────────────────────────────────────────
    7032: "Entertainment", 7033: "Entertainment",
    # ── Laundry & dry cleaning ────────────────────────────────────────────────
    7210: "Other", 7211: "Other", 7216: "Other", 7217: "Other",
    # ── Personal & beauty services ────────────────────────────────────────────
    7221: "Other",
    7230: "Health",     # Beauty salons / barbers
    7251: "Shopping",
    7261: "Other",
    7272: "Other", 7273: "Other",
    7276: "Other", 7277: "Other",
    7278: "Shopping",
    7280: "Health",
    7295: "Other",
    7296: "Shopping",
    7297: "Health",     # Massage
    7298: "Health",     # Health & beauty spas
    7299: "Other",
    # ── Business services ─────────────────────────────────────────────────────
    7311: "Other", 7321: "Other", 7322: "Other",
    7332: "Other", 7333: "Other", 7338: "Other",
    7339: "Other", 7342: "Other", 7349: "Other",
    7361: "Other", 7372: "Other", 7375: "Other",
    7379: "Other", 7389: "Other", 7392: "Other",
    7393: "Other", 7394: "Other", 7395: "Other", 7399: "Other",
    # ── Automotive services ───────────────────────────────────────────────────
    7511: "Transport", 7512: "Transport", 7513: "Transport",
    7519: "Transport", 7523: "Transport", 7524: "Transport",
    7531: "Transport", 7534: "Transport", 7535: "Transport",
    7538: "Transport", 7542: "Transport", 7549: "Transport",
    # ── Repair services ───────────────────────────────────────────────────────
    7622: "Other", 7623: "Other", 7629: "Other",
    7631: "Other", 7641: "Other", 7692: "Other", 7699: "Other",
    # ── Entertainment & leisure ───────────────────────────────────────────────
    7800: "Entertainment", 7801: "Entertainment",
    7802: "Entertainment", 7829: "Entertainment",
    7832: "Entertainment", 7833: "Entertainment",
    7841: "Entertainment",
    7911: "Entertainment", 7922: "Entertainment",
    7929: "Entertainment", 7932: "Entertainment",
    7933: "Entertainment", 7941: "Entertainment",
    7991: "Entertainment", 7992: "Entertainment",
    7993: "Entertainment", 7994: "Entertainment",
    7995: "Entertainment", 7996: "Entertainment",
    7997: "Entertainment", 7998: "Entertainment",
    7999: "Entertainment",
    # ── Medical / healthcare ──────────────────────────────────────────────────
    8011: "Health", 8021: "Health", 8031: "Health",
    8041: "Health", 8042: "Health", 8043: "Health",
    8044: "Health", 8049: "Health", 8050: "Health",
    8062: "Health", 8071: "Health", 8099: "Health",
    # ── Legal ─────────────────────────────────────────────────────────────────
    8110: "Other", 8111: "Other",
    # ── Education ─────────────────────────────────────────────────────────────
    8211: "Education", 8220: "Education", 8241: "Education",
    8244: "Education", 8249: "Education", 8299: "Education",
    8351: "Education",
    # ── Non-profits / associations ────────────────────────────────────────────
    8398: "Other", 8641: "Other", 8651: "Other",
    8661: "Other", 8664: "Other",
    8675: "Transport",  # Auto clubs (AAA-style)
    8699: "Other",
    # ── Testing / professional services ──────────────────────────────────────
    8734: "Other", 8743: "Other",
    8911: "Other", 8931: "Other", 8999: "Other",
    # ── Government & civic ───────────────────────────────────────────────────
    9034: "Other", 9211: "Other", 9222: "Other",
    9223: "Other", 9311: "Other", 9399: "Other",
    9401: "Other", 9402: "Other", 9405: "Other",
    9406: "Entertainment",  # Government lottery
    9411: "Other",
    9700: "Other",      # Cashback
    9701: "Other", 9702: "Other",
    9751: "Other", 9752: "Other",
    9754: "Entertainment",  # Horse / dog racing
    9950: "Other", 9999: "Other",
}


def mcc_to_category(mcc: int | None) -> str:
    """
    Map an MCC code to a MoneyMate canonical category (English label).
    Covers all 1 088 MCC codes present in mcc.json; unmapped codes → "Other".
    """
    if mcc is None:
        return "Other"

    # Fast-path for large contiguous ISO blocks
    if 3000 <= mcc <= 3302: return "Transport"    # Airlines
    if 3351 <= mcc <= 3441: return "Transport"    # Car rentals
    if 3501 <= mcc <= 3838: return "Housing"      # Hotels & resorts
    if 5300 <= mcc <= 5399: return "Shopping"     # Wholesale / department stores
    if 5411 <= mcc <= 5499: return "Groceries"    # Grocery & food stores
    if 5600 <= mcc <= 5699: return "Shopping"     # Clothing & accessories
    if 5811 <= mcc <= 5814: return "Food & Drink" # Restaurants, cafes, bars, fast food

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
