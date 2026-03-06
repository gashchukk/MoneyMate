import time
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

import src.monobank as monobank
import src.models as models
from src.database import get_db
from src.security import get_current_user
from src.mcc import mcc_to_category

router = APIRouter(prefix="/mono", tags=["monobank"])


@router.post("/auth/request")
def auth_request(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    resp = monobank.mono_request_access()
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, resp.text)

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


@router.post("/sync-accounts")
def mono_sync_accounts(
    request_id: str,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    resp = monobank.mono_client_info(request_id)
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, resp.text)

    info = resp.json()
    for acc in info["accounts"]:
        existing = db.query(models.Account).filter_by(
            user_id=user_id,
            external_account_id=acc.get("id"),
        ).first()

        raw_balance = acc.get("balance")
        balance = raw_balance / 100 if raw_balance is not None else None
        acc_type = acc.get("type") or "unknown"

        if existing:
            existing.balance = balance
            existing.currency_code = acc.get("currencyCode")
            existing.name = acc_type + "card"
            existing.type = acc_type
        # Removed: else add new account

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
        mono_tx_ids = {tx["id"] for tx in mono_txs}

        db.query(models.Transaction).filter(
            models.Transaction.account_id == acc.id,
            models.Transaction.time >= from_ts,
            models.Transaction.time <= to_ts,
            models.Transaction.external_tx_id.notin_(mono_tx_ids),
        ).delete(synchronize_session=False)

        for tx in mono_txs:
            category = mcc_to_category(tx.get("mcc"))
            existing = db.query(models.Transaction).filter_by(
                external_tx_id=tx["id"]
            ).first()

            if existing:
                existing.amount = tx["amount"] / 100
                existing.description = tx.get("description")
                existing.mcc = tx.get("mcc")
                existing.currency_code = tx.get("currencyCode")
                existing.category = category
            else:
                db.add(models.Transaction(
                    user_id=user_id,
                    account_id=acc.id,
                    external_tx_id=tx["id"],
                    time=int(tx["time"]),
                    description=tx.get("description"),
                    mcc=tx.get("mcc"),
                    amount=tx["amount"] / 100,
                    currency_code=tx.get("currencyCode"),
                    source="mono",
                    category=category,
                    created_at=int(time.time()),
                ))

    db.commit()
    return {"status": "transactions_synced"}
