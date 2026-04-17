from sqlalchemy import Column, Index, Integer, String, Float, ForeignKey, Text, JSON, Boolean
from src.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(Integer, nullable=False)
    mono_integration_token = Column(String, nullable=True)
    # Premium: unix timestamp when entitlement ends; active if set and > now (see billing/entitlements.py)
    premium_expires_at = Column(Integer, nullable=True)
    billing_last_sync_at = Column(Integer, nullable=True)


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    source = Column(String, nullable=False)
    external_account_id = Column(String, nullable=True)
    balance = Column(Float, nullable=True)
    credit_limit = Column(Float, nullable=True, default=0)
    currency_code = Column(Integer, nullable=True)
    created_at = Column(Integer, nullable=False)


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    external_tx_id = Column(String, unique=True, nullable=True)
    time = Column(Integer, nullable=False, index=True)
    description = Column(String)
    mcc = Column(Integer, nullable=True)
    amount = Column(Float, nullable=False)
    currency_code = Column(Integer, nullable=False)
    source = Column(String, nullable=False)
    category = Column(String, nullable=True)
    created_at = Column(Integer, nullable=False)

    __table_args__ = (
        Index("ix_transactions_user_time", "user_id", "time"),
    )



class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id         = Column(Integer, primary_key=True, index=True)
    email      = Column(String, nullable=False, index=True)
    code       = Column(String, nullable=False)
    expires_at = Column(Integer, nullable=False)
    used       = Column(Boolean, nullable=False, default=False)


class ReceiptImage(Base):
    __tablename__ = "receipt_images"

    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=False)
    transaction_id  = Column(Integer, ForeignKey("transactions.id"), nullable=True)
    filename        = Column(String, nullable=True)
    raw_text        = Column(Text, nullable=True)          # full OCR dump
    parsed_data     = Column(JSON, nullable=True)          # structured JSON
    created_at      = Column(Integer, nullable=False)

    __table_args__ = (
        Index("ix_receipt_images_user_created", "user_id", "created_at"),
    )
