import json
import os

_data_path = os.path.join(os.path.dirname(__file__), "..", "data", "mcc.json")

with open(_data_path, "r", encoding="utf-8") as _f:
    _MCC_LIST = json.load(_f)

MCC_MAP: dict[str, dict] = {
    item["mcc"]: item["shortDescription"] for item in _MCC_LIST
}


def mcc_to_category(mcc: int | None) -> str:
    if mcc is None:
        return "Other"
    return MCC_MAP.get(str(mcc).zfill(4), {}).get("en") or "Other"
