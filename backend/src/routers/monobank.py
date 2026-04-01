import os
import time
import logging
from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.orm import Session

import src.monobank as monobank
import src.models as models
from src.database import get_db
from src.security import get_current_user
from src.mcc import smart_categorize
from src.rate_limit import limiter

log = logging.getLogger(__name__)
router = APIRouter(prefix="/mono", tags=["monobank"])

# Set BACKEND_URL in .env so Monobank can reach the webhook, e.g. https://yourserver.com
_BACKEND_URL = os.getenv("BACKEND_URL", "").rstrip("/")


@router.post("/auth/request")
@limiter.limit("5/minute")
def auth_request(
    request: Request,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    webhook_url = f"{_BACKEND_URL}/mono/webhook/{user_id}" if _BACKEND_URL else None
    resp = monobank.mono_request_access(webhook_url=webhook_url)
    if resp.status_code != 200:
        raise HTTPException(502, resp.text)

    data = resp.json()
    token_request_id = data.get("tokenRequestId")
    if not token_request_id:
        raise HTTPException(500, "Monobank did not return a tokenRequestId")

    user = db.query(models.User).filter_by(id=user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    user.mono_integration_token = token_request_id
    db.commit()
    return data


@router.post("/webhook/{user_id}", include_in_schema=False)
async def mono_webhook(user_id: int, request: Request, db: Session = Depends(get_db)):
    """
    Called by Monobank servers when the user approves access.
    Automatically syncs accounts and recent transactions for that user.
    """
    try:
        body = await request.json()
    except Exception:
        log.info("mono_webhook[%s]: empty/invalid body (ping), returning ok", user_id)
        return {"status": "ok"}

    log.info("mono_webhook[%s]: body=%s", user_id, body)

    token_request_id = body.get("tokenRequestId") or body.get("requestId")
    status = body.get("status", "")

    if status and status.lower() not in ("approved", "processing"):
        log.info("mono_webhook[%s]: ignored status=%s", user_id, status)
        return {"status": "ignored"}

    user = db.query(models.User).filter_by(id=user_id).first()
    if not user:
        log.warning("mono_webhook[%s]: user not found", user_id)
        return {"status": "user not found"}

    # Use stored tokenRequestId if Monobank doesn't resend it in the webhook body
    request_id = token_request_id or user.mono_integration_token
    if not request_id:
        log.warning("mono_webhook[%s]: no request_id available", user_id)
        return {"status": "no request id"}

    # Persist token in case it came fresh
    if token_request_id and user.mono_integration_token != token_request_id:
        user.mono_integration_token = token_request_id
        db.commit()

    # Sync accounts
    info_resp = monobank.mono_client_info(request_id)
    log.info("mono_webhook[%s]: client_info status=%s", user_id, info_resp.status_code)
    if info_resp.status_code != 200:
        log.error("mono_webhook[%s]: client_info failed: %s %s", user_id, info_resp.status_code, info_resp.text)
        return {"status": "client_info_failed", "detail": info_resp.text}

    info = info_resp.json()
    synced_accounts = []
    for acc in info.get("accounts", []):
        existing = db.query(models.Account).filter_by(
            user_id=user_id,
            external_account_id=acc.get("id"),
        ).first()
        raw_balance = acc.get("balance")
        balance = raw_balance / 100 if raw_balance is not None else None
        raw_credit = acc.get("creditLimit")
        credit_limit = raw_credit / 100 if raw_credit else 0
        acc_type = acc.get("type") or "unknown"
        if existing:
            existing.balance = balance
            existing.credit_limit = credit_limit
            existing.currency_code = acc.get("currencyCode")
            existing.name = acc_type.capitalize() + " card"
            existing.type = acc_type
            synced_accounts.append(existing)
        else:
            new_acc = models.Account(
                user_id=user_id,
                name=acc_type.capitalize() + " card",
                type=acc_type,
                source="mono",
                external_account_id=acc.get("id"),
                balance=balance,
                credit_limit=credit_limit,
                currency_code=acc.get("currencyCode"),
                created_at=int(time.time()),
            )
            db.add(new_acc)
            synced_accounts.append(new_acc)
    db.commit()
    log.info("mono_webhook[%s]: synced %d accounts", user_id, len(synced_accounts))

    # Sync recent transactions (last 30 days) so history is populated immediately
    from_ts = int(time.time()) - 30 * 86400
    to_ts = int(time.time())
    for acc in db.query(models.Account).filter_by(user_id=user_id, source="mono").all():
        if not acc.external_account_id:
            continue
        stmt_resp = monobank.mono_statement(request_id, acc.external_account_id, str(from_ts), str(to_ts))
        if stmt_resp.status_code != 200:
            log.warning("mono_webhook[%s]: statement failed for acc %s: %s", user_id, acc.external_account_id, stmt_resp.status_code)
            continue
        tx_count = 0
        for tx in stmt_resp.json():
            amount = tx.get("amount", 0) / 100
            category = smart_categorize(tx.get("mcc"), amount, tx.get("description"))
            existing_tx = db.query(models.Transaction).filter_by(external_tx_id=tx["id"]).first()
            if existing_tx:
                continue
            db.add(models.Transaction(
                user_id=user_id,
                account_id=acc.id,
                external_tx_id=tx["id"],
                time=int(tx["time"]),
                description=tx.get("description"),
                mcc=tx.get("mcc"),
                amount=tx["amount"] / 100,
                currency_code=tx.get("currencyCode") or acc.currency_code,
                source="mono",
                category=category,
                created_at=int(time.time()),
            ))
            tx_count += 1
        db.commit()
        log.info("mono_webhook[%s]: synced %d transactions for acc %s", user_id, tx_count, acc.external_account_id)

    return {"status": "ok"}


@router.post("/corp/register-webhook")
@limiter.limit("5/minute")
def register_corp_webhook(
    request: Request,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    """Register the corporate transaction webhook with Monobank (one-time setup)."""
    if not _BACKEND_URL:
        raise HTTPException(500, "BACKEND_URL env var is not set")
    webhook_url = f"{_BACKEND_URL}/mono/corp/webhook"
    resp = monobank.mono_set_corp_webhook(webhook_url)
    if resp.status_code != 200:
        raise HTTPException(502, resp.text)
    return {"status": "webhook_registered", "webhook_url": webhook_url}


@router.post("/corp/webhook", include_in_schema=False)
async def mono_corp_transaction_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Called by Monobank whenever a new transaction occurs on any linked card.
    Also receives a verification ping on first registration (must return 200).
    """
    try:
        body = await request.json()
    except Exception:
        log.info("mono_corp_webhook: empty/invalid body (ping)")
        return {"status": "ok"}

    event_type = body.get("type")
    log.info("mono_corp_webhook: type=%s", event_type)

    # Ignore anything that isn't a transaction event
    if event_type != "StatementItem":
        return {"status": "ok"}

    data = body.get("data", {})
    external_account_id = data.get("account")
    item = data.get("statementItem", {})

    log.info("mono_corp_webhook: account=%s tx_id=%s amount=%s", external_account_id, item.get("id"), item.get("amount"))

    if not external_account_id or not item:
        log.warning("mono_corp_webhook: missing account or statementItem in payload")
        return {"status": "ignored"}

    # Find all accounts in our DB by Monobank account ID (multiple users may share the same card)
    accounts = db.query(models.Account).filter_by(
        external_account_id=external_account_id
    ).all()
    if not accounts:
        log.error("mono_corp_webhook: account not found for external_account_id=%s — accounts may not be synced yet", external_account_id)
        return {"status": "account not found"}
    account = accounts[0]  # used for balance update below

    tx_id = item.get("id")
    if not tx_id:
        log.warning("mono_corp_webhook: no tx id in statementItem")
        return {"status": "no tx id"}

    amount = item.get("amount", 0) / 100
    category = smart_categorize(item.get("mcc"), amount, item.get("description"))

    for acc in accounts:
        existing = db.query(models.Transaction).filter_by(
            external_tx_id=tx_id, account_id=acc.id
        ).first()
        if existing:
            existing.amount = amount
            existing.description = item.get("description")
            existing.mcc = item.get("mcc")
            existing.currency_code = item.get("currencyCode")
            if existing.category != "Transfer":
                existing.category = category
            log.info("mono_corp_webhook: updated existing tx %s for user %s", tx_id, acc.user_id)
        else:
            db.add(models.Transaction(
                user_id=acc.user_id,
                account_id=acc.id,
                external_tx_id=tx_id,
                time=int(item["time"]),
                description=item.get("description"),
                mcc=item.get("mcc"),
                amount=amount,
                currency_code=item.get("currencyCode") or acc.currency_code,
                source="mono",
                category=category,
                created_at=int(time.time()),
            ))
            log.info("mono_corp_webhook: created new tx %s amount=%s for user %s", tx_id, amount, acc.user_id)

        # Keep account balance in sync from webhook payload
        raw_balance = item.get("balance")
        if raw_balance is not None:
            acc.balance = raw_balance / 100

    db.commit()
    return {"status": "ok"}


@router.post("/sync-accounts")
def mono_sync_accounts(
    request_id: str,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    resp = monobank.mono_client_info(request_id)
    if resp.status_code != 200:
        raise HTTPException(502, resp.text)

    info = resp.json()
    for acc in info["accounts"]:
        existing = db.query(models.Account).filter_by(
            user_id=user_id,
            external_account_id=acc.get("id"),
        ).first()

        raw_balance = acc.get("balance")
        balance = raw_balance / 100 if raw_balance is not None else None
        raw_credit = acc.get("creditLimit")
        credit_limit = raw_credit / 100 if raw_credit else 0
        acc_type = acc.get("type") or "unknown"

        if existing:
            existing.balance = balance
            existing.credit_limit = credit_limit
            existing.currency_code = acc.get("currencyCode")
            existing.name = acc_type + "card"
            existing.type = acc_type
        else:
            db.add(models.Account(
                user_id=user_id,
                name=acc_type + "card",
                type=acc_type,
                source="mono",
                external_account_id=acc.get("id"),
                balance=balance,
                credit_limit=credit_limit,
                currency_code=acc.get("currencyCode"),
                created_at=int(time.time()),
            ))

    db.commit()
    return {"status": "accounts_synced"}


@router.post("/sync-transactions")
def mono_sync_transactions(
    request_id: str,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
    days: int = 30,
):
    accounts = (
        db.query(models.Account)
        .filter_by(user_id=user_id, source="mono")
        .all()
    )

    from_ts = int(time.time()) - days * 86400
    to_ts = int(time.time())

    for acc in accounts:
        resp = monobank.mono_statement(
            request_id, acc.external_account_id, str(from_ts), str(to_ts)
        )
        if resp.status_code != 200:
            continue

        mono_txs = resp.json()

        for tx in mono_txs:
            existing = db.query(models.Transaction).filter_by(
                external_tx_id=tx["id"], account_id=acc.id
            ).first()
            if existing:
                continue

            tx_amount = tx["amount"] / 100
            category = smart_categorize(tx.get("mcc"), tx_amount, tx.get("description"))
            db.add(models.Transaction(
                user_id=user_id,
                account_id=acc.id,
                external_tx_id=tx["id"],
                time=int(tx["time"]),
                description=tx.get("description"),
                mcc=tx.get("mcc"),
                amount=tx_amount,
                currency_code=tx.get("currencyCode") or acc.currency_code,
                source="mono",
                category=category,
                created_at=int(time.time()),
            ))

    db.commit()
    return {"status": "transactions_synced"}
