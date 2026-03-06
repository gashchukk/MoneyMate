import time
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

import src.models as models
import src.schemas as schemas
from src.database import get_db
from src.security import get_current_user

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.post("", response_model=schemas.AccountResponse)
def create_account(
    account: schemas.AccountCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    new_acc = models.Account(
        user_id=user_id,
        name=account.name,
        type=account.type,
        source="manual",
        external_account_id=None,
        balance=account.balance,
        currency_code=account.currency_code,
        created_at=int(time.time()),
    )
    db.add(new_acc)
    db.commit()
    db.refresh(new_acc)
    return new_acc


@router.get("", response_model=list[schemas.AccountResponse])
def get_accounts(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    return db.query(models.Account).filter_by(user_id=user_id).all()


@router.put("/{account_id}", response_model=schemas.AccountResponse)
def update_account(
    account_id: int,
    account: schemas.AccountUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    acc = db.query(models.Account).filter(
        models.Account.id == account_id,
        models.Account.user_id == user_id,
    ).first()
    if not acc:
        raise HTTPException(404, "Account not found")

    if account.name is not None:
        acc.name = account.name
    if account.type is not None:
        acc.type = account.type
    if account.balance is not None:
        acc.balance = account.balance
    if account.currency_code is not None:
        acc.currency_code = account.currency_code

    db.commit()
    db.refresh(acc)
    return acc


@router.delete("/{account_id}")
def delete_account(
    account_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    account = db.query(models.Account).filter_by(id=account_id, user_id=user_id).first()
    if not account:
        raise HTTPException(404, "Account not found")

    db.delete(account)
    db.commit()
    return {"status": "deleted"}
