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
        currency_code=None,
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
        time=datetime.datetime.fromtimestamp(transaction.time) if isinstance(transaction.time, int) else transaction.time,
        description=transaction.description,
        mcc=transaction.mcc,
        amount=transaction.amount,
        currency_code=transaction.currency_code if transaction.currency_code != None else account.currency_code,  # use account's currency
        source="manual",
        created_at=int(time.time())
    )
    db.add(new_tx)
    db.commit()
    db.refresh(new_tx)

    return new_tx
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


# @app.get("/mono/auth/status/{request_id}")
# def auth_status(request_id: str, db: Session = Depends(get_db)):
#     resp = monobank.mono_check_status(request_id)
#     account = db.query(models.Account).filter_by(external_account_id=request_id).first()
#     if not account:
#         raise HTTPException(404, "Integration not found")
#     if resp.status_code == 200:
#         account.type = "mono_granted"
#         db.commit()
#     return {"status_code": resp.status_code}


@app.post("/mono/sync-accounts")
def mono_sync_accounts(request_id: str,
                       db: Session = Depends(get_db),
                       user_id: int = Depends(get_current_user)):
    """
    Sync all Mono accounts for a user into Accounts table.
    request_id is provided after auth request.
    """
    resp = monobank.mono_client_info(request_id)
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, resp.text)

    info = resp.json()
    for acc in info["accounts"]:
        # Add new account
        db.add(models.Account(
            user_id=user_id,
            name=acc.get("type") + "card",
            type=acc.get("type"),
            source="mono",
            external_account_id=acc.get("id"),
            balance=acc.get("balance")/100,
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
    """
    Fetch and store transactions for all Mono accounts of a user.
    """
    accounts = db.query(models.Account)\
        .filter_by(user_id=user_id, source="mono")\
        .all()

    from_ts = str(int(time.time()) - days * 86400)
    to_ts = str(int(time.time()))

    for acc in accounts:
        resp = monobank.mono_statement(request_id, acc.external_account_id, from_ts, to_ts)
        if resp.status_code != 200:
            continue

        for tx in resp.json():
            exists = db.query(models.Transaction)\
                .filter_by(external_tx_id=tx["id"])\
                .first()
            if exists:
                continue

            db.add(models.Transaction(
                user_id=user_id,
                account_id=acc.id,
                external_tx_id=tx["id"],
                time=int(tx["time"]),  # keep as int timestamp
                description=tx.get("description"),
                mcc=tx.get("mcc"),
                amount=tx["amount"] / 100,
                currency_code=tx.get("currencyCode"),
                source="mono",
                created_at=int(time.time())
            ))

    db.commit()
    return {"status": "transactions_synced"}