"""CSV export of transactions (Premium only)."""

from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

import src.models as models
from src.database import get_db
from src.security import get_current_user
from src.billing.entitlements import user_has_premium

router = APIRouter(prefix="/export", tags=["export"])


@router.get("/transactions")
def export_transactions_csv(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    if not user_has_premium(db, user_id):
        raise HTTPException(
            status_code=403,
            detail={"code": "export_requires_premium"},
        )

    transactions = (
        db.query(models.Transaction)
        .filter_by(user_id=user_id)
        .order_by(models.Transaction.time.desc())
        .all()
    )
    accounts = db.query(models.Account).filter_by(user_id=user_id).all()
    account_names = {a.id: a.name for a in accounts}

    def row_iter():
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(
            [
                "id",
                "time",
                "description",
                "amount",
                "currency_code",
                "category",
                "source",
                "account",
                "mcc",
                "created_at",
            ]
        )
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate(0)

        for tx in transactions:
            writer.writerow(
                [
                    tx.id,
                    tx.time,
                    tx.description or "",
                    tx.amount,
                    tx.currency_code,
                    tx.category or "",
                    tx.source,
                    account_names.get(tx.account_id, ""),
                    tx.mcc if tx.mcc is not None else "",
                    tx.created_at,
                ]
            )
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate(0)

    headers = {
        "Content-Disposition": 'attachment; filename="moneymate-transactions.csv"',
    }
    return StreamingResponse(
        row_iter(),
        media_type="text/csv; charset=utf-8",
        headers=headers,
    )
