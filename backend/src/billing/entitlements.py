"""Server-side subscription checks (cached from RevenueCat)."""

from __future__ import annotations

import calendar
import time
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

import src.models as models

BASIC_RECEIPT_SCAN_LIMIT_PER_MONTH = 20


def utc_month_bounds(now_ts: int | None = None) -> tuple[int, int]:
    """Return [start, end) unix bounds for the current UTC calendar month."""
    now = datetime.fromtimestamp(now_ts or time.time(), tz=timezone.utc)
    start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    start_ts = int(start.timestamp())
    _, last_day = calendar.monthrange(now.year, now.month)
    end = datetime(now.year, now.month, last_day, 23, 59, 59, tzinfo=timezone.utc)
    end_ts = int(end.timestamp()) + 1
    return start_ts, end_ts


def user_has_premium(db: Session, user_id: int) -> bool:
    user = db.query(models.User).filter_by(id=user_id).first()
    if not user or user.premium_expires_at is None:
        return False
    return user.premium_expires_at > int(time.time())


def count_receipt_scans_this_month_utc(db: Session, user_id: int) -> int:
    start_ts, end_ts = utc_month_bounds()
    return (
        db.query(func.count(models.ReceiptImage.id))
        .filter(
            models.ReceiptImage.user_id == user_id,
            models.ReceiptImage.created_at >= start_ts,
            models.ReceiptImage.created_at < end_ts,
        )
        .scalar()
        or 0
    )


def basic_tier_scan_allowed(db: Session, user_id: int) -> bool:
    return count_receipt_scans_this_month_utc(db, user_id) < BASIC_RECEIPT_SCAN_LIMIT_PER_MONTH
