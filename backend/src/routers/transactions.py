import time
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

import src.models as models
import src.schemas as schemas
from src.database import get_db
from src.security import get_current_user

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("", response_model=list[schemas.Transaction])
def get_transactions(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    return db.query(models.Transaction).filter_by(user_id=user_id).all()


@router.post("/manual", response_model=schemas.TransactionResponse)
def add_manual_transaction(
    transaction: schemas.TransactionCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    account = db.query(models.Account).filter_by(
        id=transaction.account_id, user_id=user_id
    ).first()
    if not account:
        raise HTTPException(404, "Account not found")

    new_tx = models.Transaction(
        user_id=user_id,
        account_id=transaction.account_id,
        external_tx_id=None,
        time=transaction.time,
        description=transaction.description,
        mcc=transaction.mcc,
        amount=transaction.amount,
        currency_code=(
            transaction.currency_code
            if transaction.currency_code is not None
            else account.currency_code
        ),
        source="manual",
        category=transaction.category,
        created_at=int(time.time()),
    )
    account.balance = (account.balance or 0) + transaction.amount
    db.add(new_tx)
    db.commit()
    db.refresh(new_tx)
    return new_tx


@router.put("/{transaction_id}", response_model=schemas.TransactionResponse)
def update_transaction(
    transaction_id: int,
    transaction: schemas.TransactionUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    tx = db.query(models.Transaction).filter_by(
        id=transaction_id, user_id=user_id
    ).first()
    if not tx:
        raise HTTPException(404, "Transaction not found")

    if transaction.description is not None:
        tx.description = transaction.description
    if transaction.amount is not None:
        old_amount = tx.amount
        account = db.query(models.Account).filter_by(
            id=tx.account_id, user_id=user_id
        ).first()
        if account:
            account.balance = (account.balance or 0) - old_amount + transaction.amount
        tx.amount = transaction.amount
    if transaction.mcc is not None:
        tx.mcc = transaction.mcc
    if transaction.currency_code is not None:
        tx.currency_code = transaction.currency_code
    if transaction.category is not None:
        tx.category = transaction.category
    if transaction.time is not None:
        tx.time = transaction.time
    if transaction.account_id is not None:
        account = db.query(models.Account).filter_by(
            id=transaction.account_id, user_id=user_id
        ).first()
        if not account:
            raise HTTPException(404, "Account not found")
        tx.account_id = transaction.account_id

    db.commit()
    db.refresh(tx)
    return tx


@router.delete("/{transaction_id}")
def delete_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    tx = db.query(models.Transaction).filter_by(
        id=transaction_id, user_id=user_id
    ).first()
    if not tx:
        raise HTTPException(404, "Transaction not found")

    account = db.query(models.Account).filter_by(
        id=tx.account_id, user_id=user_id
    ).first()
    if account:
        account.balance = (account.balance or 0) - tx.amount

    db.query(models.ReceiptImage).filter_by(transaction_id=tx.id).update({"transaction_id": None})
    db.delete(tx)
    db.commit()
    return {"status": "deleted"}
