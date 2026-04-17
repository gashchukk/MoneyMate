"""Subscription status and manual sync with RevenueCat."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import src.models as models
import src.schemas as schemas
from src.database import get_db
from src.security import get_current_user
from src.billing.entitlements import (
    BASIC_RECEIPT_SCAN_LIMIT_PER_MONTH,
    count_receipt_scans_this_month_utc,
    user_has_premium,
)
from src.billing.revenuecat import RevenueCatError, sync_app_user

log = logging.getLogger(__name__)

router = APIRouter(prefix="/me", tags=["subscription"])


@router.get("/subscription", response_model=schemas.SubscriptionOut)
def get_subscription(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    premium = user_has_premium(db, user_id)
    used = count_receipt_scans_this_month_utc(db, user_id)
    user = db.query(models.User).filter_by(id=user_id).first()
    expires = user.premium_expires_at if user else None
    if premium:
        return schemas.SubscriptionOut(
            tier="premium",
            receipt_scans_used_this_month=used,
            receipt_scan_limit=None,
            premium_expires_at=expires,
        )
    return schemas.SubscriptionOut(
        tier="basic",
        receipt_scans_used_this_month=used,
        receipt_scan_limit=BASIC_RECEIPT_SCAN_LIMIT_PER_MONTH,
        premium_expires_at=None,
    )


@router.post("/subscription/sync")
def sync_subscription(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    """Call after purchase / restore so the backend picks up entitlements immediately."""
    try:
        ok = sync_app_user(db, str(user_id))
    except RevenueCatError as e:
        log.warning("subscription sync failed: %s", e)
        raise HTTPException(503, "Could not sync with RevenueCat") from e
    if not ok:
        raise HTTPException(404, "User not found")
    return get_subscription(db=db, user_id=user_id)
