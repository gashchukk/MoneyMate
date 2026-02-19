import time
import datetime
from fastapi import FastAPI, HTTPException, Depends
from sqlalchemy.orm import Session
from database import get_db, engine, Base
import models
import schemas
from auth import hash_password, verify_password
from security import create_token, get_current_user
import monobank

# create tables if not exists
Base.metadata.create_all(bind=engine)

app = FastAPI()

# ----------------------
# AUTH ROUTES
# ----------------------

@app.post("/signup", response_model=schemas.UserResponse)
def signup(user: schemas.UserCreate, db: Session = Depends(get_db)):

    existing = db.query(models.User).filter_by(email=user.email).first()
    if existing:
        raise HTTPException(400, "Email already registered")

    new_user = models.User(
        email=user.email,
        password_hash=hash_password(user.password),
        created_at=int(time.time())
    )

    db.add(new_user)
    try:
        db.commit()
        db.refresh(new_user)
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Failed to create user: {e}")

    return new_user


@app.post("/login")
def login(user: schemas.UserLogin, db: Session = Depends(get_db)):

    db_user = db.query(models.User).filter_by(email=user.email).first()
    if not db_user or not verify_password(user.password, db_user.password_hash):
        raise HTTPException(401, "Invalid credentials")

    token = create_token(db_user.id)
    return {"access_token": token, "token_type": "bearer"}


# ----------------------
# ACCOUNTS
# ----------------------

@app.post("/accounts", response_model=schemas.AccountResponse)
def create_account(account: schemas.AccountCreate,
                   db: Session = Depends(get_db),
                   user_id: int = Depends(get_current_user)):
    new_acc = models.Account(
        user_id=user_id,
        name=account.name,
        type=account.type,
        source="manual",
        external_account_id=None,
        balance=account.balance,
        currency_code=account.currency_code,
        created_at=int(time.time())
    )

    db.add(new_acc)
    db.commit()
    db.refresh(new_acc)
    return new_acc


@app.get("/accounts", response_model=list[schemas.AccountResponse])
def get_accounts(db: Session = Depends(get_db),
                 user_id: int = Depends(get_current_user)):
    return db.query(models.Account).filter_by(user_id=user_id).all()

@app.put("/accounts/{account_id}", response_model=schemas.AccountResponse)
def update_account(account_id: int,
                   account: schemas.AccountUpdate,
                   db: Session = Depends(get_db),
                   user_id: int = Depends(get_current_user)):

    acc = db.query(models.Account).filter(
        models.Account.id == account_id,
        models.Account.user_id == user_id
    ).first()

    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")

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

@app.delete("/accounts/{account_id}")
def delete_account(account_id: int,
                   db: Session = Depends(get_db),
                   user_id: int = Depends(get_current_user)):

    account = db.query(models.Account).filter_by(id=account_id, user_id=user_id).first()
    if not account:
        raise HTTPException(404, "Account not found")

    db.delete(account)
    db.commit()
    return {"status": "deleted"}


# ----------------------
# TRANSACTIONS
# ----------------------

@app.get("/transactions", response_model=list[schemas.Transaction])
def get_transactions(db: Session = Depends(get_db),
                     user_id: int = Depends(get_current_user)):
    return db.query(models.Transaction).filter_by(user_id=user_id).all()

@app.post("/transactions/manual", response_model=schemas.TransactionResponse)
def add_manual_transaction(
    transaction: schemas.TransactionCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    # Check if account exists and belongs to this user
    account = db.query(models.Account).filter_by(id=transaction.account_id, user_id=user_id).first()
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
        currency_code=transaction.currency_code if transaction.currency_code != None else account.currency_code,  # use account's currency
        source="manual",
        created_at=int(time.time())
    )

    account.balance += transaction.amount
    db.add(new_tx)
    db.commit()
    db.refresh(new_tx)
    db.refresh(account)

    return new_tx

@app.put("/transactions/{transaction_id}", response_model=schemas.TransactionResponse)
def update_transaction(
    transaction_id: int,
    transaction: schemas.TransactionUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    tx = db.query(models.Transaction).filter_by(id=transaction_id, user_id=user_id).first()
    if not tx:
        raise HTTPException(404, "Transaction not found")

    tx.description = transaction.description
    tx.amount = transaction.amount
    tx.mcc = transaction.mcc
    tx.currency_code = transaction.currency_code

    db.commit()
    db.refresh(tx)
    return tx

@app.delete("/transactions/{transaction_id}")
def delete_transaction(transaction_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_current_user)):
    tx = db.query(models.Transaction).filter_by(id=transaction_id, user_id=user_id).first()
    if not tx:
        raise HTTPException(404, "Transaction not found")
    db.delete(tx)
    db.commit()
    return {"status": "deleted"}

# ----------------------
# MONO BANK INTEGRATION
# ----------------------

@app.post("/mono/auth/request")
def auth_request(db: Session = Depends(get_db),
                 user_id: int = Depends(get_current_user)):
    resp = monobank.mono_request_access()
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, resp.text)

    data = resp.json()
    token_request_id = data.get("tokenRequestId")
    if not token_request_id:
        raise HTTPException(500, "Mono did not return a tokenRequestId")

    # Update current user with token
    user = db.query(models.User).filter_by(id=user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    user.mono_integration_token = token_request_id
    db.commit()
    return data


@app.post("/mono/sync-accounts")
def mono_sync_accounts(request_id: str,
                       db: Session = Depends(get_db),
                       user_id: int = Depends(get_current_user)):
    resp = monobank.mono_client_info(request_id)
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, resp.text)

    info = resp.json()
    mono_account_ids = [acc.get("id") for acc in info["accounts"]]

    for acc in info["accounts"]:
        existing = db.query(models.Account).filter_by(
            user_id=user_id,
            external_account_id=acc.get("id")
        ).first()

        if existing:
            # Update balance and name in place
            existing.balance = acc.get("balance") / 100
            existing.currency_code = acc.get("currencyCode")
            existing.name = acc.get("type") + "card"
            existing.type = acc.get("type")
        else:
            # New account from Mono — add it
            db.add(models.Account(
                user_id=user_id,
                name=acc.get("type") + "card",
                type=acc.get("type"),
                source="mono",
                external_account_id=acc.get("id"),
                balance=acc.get("balance") / 100,
                currency_code=acc.get("currencyCode"),
                created_at=int(time.time())
            ))

    db.commit()
    return {"status": "accounts_synced"}


@app.post("/mono/sync-transactions")
def mono_sync_transactions(request_id: str,
                           db: Session = Depends(get_db),
                           user_id: int = Depends(get_current_user),
                           days: int = 30):
    accounts = db.query(models.Account)\
        .filter_by(user_id=user_id, source="mono")\
        .all()

    from_ts = int(time.time()) - days * 86400
    to_ts = int(time.time())

    for acc in accounts:
        resp = monobank.mono_statement(request_id, acc.external_account_id, str(from_ts), str(to_ts))
        if resp.status_code != 200:
            continue

        mono_txs = resp.json()
        mono_tx_ids = {tx["id"] for tx in mono_txs}

        # ── Delete stale transactions in this window ──────────────────────────
        # Remove any transaction for this account in the synced time window
        # that is NOT present in the latest Mono response.
        # This cleans up manual entries or outdated records within the window.
        db.query(models.Transaction).filter(
            models.Transaction.account_id == acc.id,
            models.Transaction.time >= from_ts,
            models.Transaction.time <= to_ts,
            models.Transaction.external_tx_id.notin_(mono_tx_ids)
        ).delete(synchronize_session=False)

        # ── Upsert Mono transactions ──────────────────────────────────────────
        for tx in mono_txs:
            existing = db.query(models.Transaction).filter_by(
                external_tx_id=tx["id"]
            ).first()

            if existing:
                # Update in case amount/description changed
                existing.amount = tx["amount"] / 100
                existing.description = tx.get("description")
                existing.mcc = tx.get("mcc")
                existing.currency_code = tx.get("currencyCode")
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
                    created_at=int(time.time())
                ))

    db.commit()
    return {"status": "transactions_synced"}