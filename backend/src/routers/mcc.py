from fastapi import APIRouter

from src.mcc import mcc_short_description

router = APIRouter(prefix="/mcc", tags=["mcc"])


@router.get("/{mcc_code}")
def get_mcc(mcc_code: int):
    """
    Return MCC short description in multiple languages.
    """
    return {
        "mcc": str(mcc_code).zfill(4),
        "shortDescription": mcc_short_description(mcc_code),
    }

