from sqlalchemy import Column, Integer, String, Float, ForeignKey, Text, JSON
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(Integer, nullable=False)
    mono_integration_token = Column(String, nullable=True)  


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)  
    # "Cash", "Mono Black", "Privat Credit"
    type = Column(String, nullable=False)  
    # cash / credit_card / mono / savings
    source = Column(String, nullable=False)  
    # manual / mono
    external_account_id = Column(String, nullable=True)
    balance = Column(Float, nullable=True)
    # mono account id (NULL for manual)
    currency_code = Column(Integer, nullable=True)
    created_at = Column(Integer, nullable=False)

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    external_tx_id = Column(String, unique=True, nullable=True)  
    # mono tx id (NULL for manual)
    time = Column(Integer, nullable=False)  
    # unix timestamp (seconds)
    description = Column(String)
    mcc = Column(Integer, nullable=True)
    amount = Column(Float, nullable=False)
    currency_code = Column(Integer, nullable=False)
    source = Column(String, nullable=False)
    category = Column(String, nullable=False)  
    # manual / mono
    created_at = Column(Integer, nullable=False)


class ReceiptImage(Base):
    __tablename__ = "receipt_images"

    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=False)
    transaction_id  = Column(Integer, ForeignKey("transactions.id"), nullable=True)
    filename        = Column(String, nullable=True)
    raw_text        = Column(Text, nullable=True)          # full OCR dump
    parsed_data     = Column(JSON, nullable=True)          # structured JSON
    created_at      = Column(Integer, nullable=False)
