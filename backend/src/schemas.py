from pydantic import BaseModel, EmailStr
from typing import Optional
from typing import Optional, Any
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
    currency_code : int

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


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    balance: Optional[float] = None
    currency_code: Optional[str] = None
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
    category: str
    created_at: int

    class Config:
        from_attributes = True

class TransactionCreate(BaseModel):
    account_id: int
    time: int  # unix timestamp in seconds
    description: str
    mcc: Optional[int] = None
    amount: float
    category: str
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
    category: str
    created_at: int

    class Config:
        from_attributes = True

class TransactionUpdate(BaseModel):
    description: Optional[str] = None
    amount: float
    account_id: int
    time: int
    mcc: Optional[int] = 0
    currency_code: Optional[int] = None

# ---------- RECEIPT SCAN SCHEMAS ----------


class ReceiptImageOut(BaseModel):
    id: int
    transaction_id: Optional[int]
    filename: Optional[str]
    raw_text: Optional[str]
    parsed_data: Optional[Any]
    created_at: int
    class Config: from_attributes = True