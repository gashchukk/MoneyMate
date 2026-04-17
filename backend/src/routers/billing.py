"""RevenueCat webhooks — keep server-side entitlements in sync."""

from __future__ import annotations

import logging
import os
import secrets
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from src.database import get_db
from src.billing.revenuecat import RevenueCatError, sync_app_user

log = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["billing"])

WEBHOOK_BEARER = os.getenv("REVENUECAT_WEBHOOK_BEARER", "")


def _verify_webhook(request: Request) -> None:
    if not WEBHOOK_BEARER:
        log.warning("REVENUECAT_WEBHOOK_BEARER unset — accepting webhooks without auth (dev only)")
        return
    auth = request.headers.get("Authorization") or ""
    expected = f"Bearer {WEBHOOK_BEARER}"
    if not secrets.compare_digest(auth.encode(), expected.encode()):
        raise HTTPException(401, "Unauthorized")


def _extract_app_user_id(body: dict[str, Any]) -> str | None:
    ev = body.get("event")
    if isinstance(ev, dict):
        uid = ev.get("app_user_id")
        if uid is not None:
            return str(uid)
        orig = ev.get("original_app_user_id")
        if orig is not None:
            return str(orig)
    # Some test payloads
    top = body.get("app_user_id")
    if top is not None:
        return str(top)
    return None


@router.post("/revenuecat-webhook")
async def revenuecat_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Configure this URL in RevenueCat → Project → Integrations → Webhooks.
    Optional Authorization: Bearer <REVENUECAT_WEBHOOK_BEARER> (same value in dashboard).
    """
    _verify_webhook(request)
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON")

    app_user_id = _extract_app_user_id(body)
    if not app_user_id:
        log.warning("revenuecat webhook: missing app_user_id in %s", body.keys())
        return {"ok": True, "skipped": True}

    try:
        sync_app_user(db, app_user_id)
    except RevenueCatError as e:
        log.exception("RevenueCat sync failed: %s", e)
        raise HTTPException(503, "RevenueCat unavailable") from e

    return {"ok": True}
