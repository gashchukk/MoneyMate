from pydantic import BaseModel, EmailStr
from typing import Optional

# ---------- USER SCHEMAS ----------
class UserCreate(BaseModel):
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: int
    email: EmailStr
    created_at: int

    class Config:
        from_attributes = True

# ---------- ACCOUNT SCHEMAS ----------
class AccountCreate(BaseModel):
    name: str
    type: str
    balance: float

class AccountResponse(BaseModel):
    id: int
    name: str
    type: str
    source: str
    external_account_id: Optional[str]
    balance: float
    currency_code: Optional[int]

    class Config:
        from_attributes = True

# ---------- TRANSACTION SCHEMAS ----------
class Transaction(BaseModel):
    id: int
    user_id: int
    account_id: int
    external_tx_id: Optional[str]
    time: int
    description: Optional[str]
    mcc: Optional[int]
    amount: float
    currency_code: int
    source: str
    created_at: int

    class Config:
        from_attributes = True

class TransactionCreate(BaseModel):
    account_id: int
    time: int  # unix timestamp in seconds
    description: str
    mcc: Optional[int] = None
    amount: float
    currency_code: Optional[int] = None

class TransactionResponse(BaseModel):
    id: int
    user_id: int
    account_id: int
    external_tx_id: Optional[str]
    time: int
    description: str
    mcc: Optional[int]
    amount: float
    currency_code: int
    source: str
    created_at: int

    class Config:
        from_attributes = True

