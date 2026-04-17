"""RevenueCat REST API: sync subscriber entitlements into our User row."""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone
from typing import Any

import requests
from urllib.parse import quote
from sqlalchemy.orm import Session

import src.models as models

log = logging.getLogger(__name__)

REVENUECAT_API_BASE = "https://api.revenuecat.com/v1"
# Must match the entitlement identifier in RevenueCat (e.g. display name "MoneyMate Pro" → id moneymate_pro).
PREMIUM_ENTITLEMENT_ID = os.getenv("REVENUECAT_PREMIUM_ENTITLEMENT_ID", "moneymate_pro")
SECRET_KEY = os.getenv("REVENUECAT_SECRET_API_KEY", "")


def _parse_expires_to_unix(expires_date: str | None) -> int | None:
    """RevenueCat ISO8601 expires_date → unix end-of-access (inclusive-style)."""
    if not expires_date:
        return None
    s = expires_date.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except ValueError:
        log.warning("revenuecat: bad expires_date %r", expires_date)
        return None


def fetch_subscriber(app_user_id: str) -> dict[str, Any] | None:
    """
    Returns subscriber JSON, or None if customer has never existed (404).
    Raises RevenueCatError on auth/network/other HTTP errors so callers do not wipe state.
    """
    if not SECRET_KEY:
        log.warning("REVENUECAT_SECRET_API_KEY not set; cannot call RevenueCat API")
        raise RevenueCatError("REVENUECAT_SECRET_API_KEY not set")

    url = f"{REVENUECAT_API_BASE}/subscribers/{quote(app_user_id, safe='')}"
    r = requests.get(
        url,
        headers={"Authorization": f"Bearer {SECRET_KEY}"},
        timeout=30,
    )
    if r.status_code == 404:
        return None
    if not r.ok:
        log.warning("RevenueCat GET subscriber failed: %s %s", r.status_code, r.text[:500])
        raise RevenueCatError(f"HTTP {r.status_code}")
    return r.json()


class RevenueCatError(Exception):
    pass


def premium_expires_from_subscriber_payload(payload: dict[str, Any]) -> int | None:
    """Return unix expiry for premium entitlement, or None if not entitled."""
    subscriber = payload.get("subscriber") or {}
    entitlements = subscriber.get("entitlements") or {}
    ent = entitlements.get(PREMIUM_ENTITLEMENT_ID)
    if not ent:
        return None
    expires_date = ent.get("expires_date")
    # Lifetime / sandbox sometimes omit expiry — treat as active far future
    if expires_date is None:
        return 4102444800  # 2100-01-01 UTC
    unix = _parse_expires_to_unix(expires_date)
    if unix is None:
        return None
    return unix


def apply_subscriber_to_user(user: models.User, payload: dict[str, Any]) -> None:
    exp = premium_expires_from_subscriber_payload(payload)
    now = int(time.time())
    if exp is None or exp <= now:
        user.premium_expires_at = None
    else:
        user.premium_expires_at = exp
    user.billing_last_sync_at = now


def sync_app_user(db: Session, app_user_id: str) -> bool:
    """
    Fetch RevenueCat subscriber and update User by id == app_user_id.
    Returns False if user missing or invalid app_user_id.
    Raises RevenueCatError on API failure (caller should not clear entitlements).
    """
    try:
        uid = int(app_user_id)
    except ValueError:
        log.warning("revenuecat: non-numeric app_user_id %r", app_user_id)
        return False

    user = db.query(models.User).filter_by(id=uid).first()
    if not user:
        return False

    payload = fetch_subscriber(app_user_id)
    if payload is None:
        # No subscriber record in RevenueCat — not premium
        user.premium_expires_at = None
        user.billing_last_sync_at = int(time.time())
        db.commit()
        return True

    apply_subscriber_to_user(user, payload)
    db.commit()
    return True
