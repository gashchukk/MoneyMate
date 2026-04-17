from pydantic import BaseModel, EmailStr, model_validator
from typing import Optional, Any, Literal
from src.mcc import mcc_short_description

# ---------- USER ----------

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

    model_config = {"from_attributes": True}


class SubscriptionOut(BaseModel):
    tier: Literal["basic", "premium"]
    receipt_scans_used_this_month: int
    receipt_scan_limit: Optional[int] = None  # None when unlimited (premium)
    premium_expires_at: Optional[int] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


# ---------- ACCOUNT ----------

class AccountCreate(BaseModel):
    name: str
    type: str
    balance: float
    currency_code: int


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    balance: Optional[float] = None
    currency_code: Optional[int] = None


class AccountResponse(BaseModel):
    id: int
    name: str
    type: str
    source: str
    external_account_id: Optional[str] = None
    balance: Optional[float] = None
    credit_limit: Optional[float] = None
    currency_code: Optional[int] = None

    model_config = {"from_attributes": True}


# ---------- TRANSACTION ----------

class Transaction(BaseModel):
    id: int
    user_id: int
    account_id: int
    external_tx_id: Optional[str] = None
    time: int
    description: Optional[str] = None
    mcc: Optional[int] = None
    amount: float
    currency_code: int
    source: str
    category: Optional[str] = None
    created_at: int
    mcc_label_en: Optional[str] = None
    mcc_label_uk: Optional[str] = None

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def _fill_mcc_labels(self):
        if self.mcc:
            sd = mcc_short_description(self.mcc)
            self.mcc_label_en = sd.get("en") or None
            self.mcc_label_uk = sd.get("uk") or None
        return self


class TransactionCreate(BaseModel):
    account_id: int
    time: int
    description: str
    mcc: Optional[int] = None
    amount: float
    category: Optional[str] = "Other"
    currency_code: Optional[int] = None


class TransactionUpdate(BaseModel):
    description: Optional[str] = None
    amount: Optional[float] = None
    mcc: Optional[int] = None
    currency_code: Optional[int] = None
    category: Optional[str] = None
    time: Optional[int] = None
    account_id: Optional[int] = None


class TransactionResponse(BaseModel):
    id: int
    user_id: int
    account_id: int
    external_tx_id: Optional[str] = None
    time: int
    description: Optional[str] = None
    mcc: Optional[int] = None
    amount: float
    currency_code: int
    source: str
    category: Optional[str] = None
    created_at: int
    mcc_label_en: Optional[str] = None
    mcc_label_uk: Optional[str] = None

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def _fill_mcc_labels(self):
        if self.mcc:
            sd = mcc_short_description(self.mcc)
            self.mcc_label_en = sd.get("en") or None
            self.mcc_label_uk = sd.get("uk") or None
        return self



# ---------- GOOGLE AUTH ----------

class GoogleAuthRequest(BaseModel):
    id_token: str


# ---------- CHANGE PASSWORD ----------

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


# ---------- PASSWORD RESET ----------

class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str
    new_password: str


# ---------- RECEIPT ----------

class ReceiptImageOut(BaseModel):
    id: int
    transaction_id: Optional[int] = None
    filename: Optional[str] = None
    raw_text: Optional[str] = None
    parsed_data: Optional[Any] = None
    created_at: int

    model_config = {"from_attributes": True}
