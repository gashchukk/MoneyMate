import os
import time
import random
import smtplib
import logging
from email.mime.text import MIMEText
from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.orm import Session
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

import src.models as models
import src.schemas as schemas
from src.database import get_db
from src.auth import hash_password, verify_password
from src.security import create_access_token, create_refresh_token, decode_refresh_token, get_current_user
from src.rate_limit import limiter

logger = logging.getLogger(__name__)

RESET_CODE_TTL = 15 * 60  # 15 minutes


def _send_reset_email(to_email: str, code: str) -> None:
    gmail_user     = os.getenv("GMAIL_USER", "")
    gmail_password = os.getenv("GMAIL_APP_PASSWORD", "")

    if not gmail_user or not gmail_password:
        logger.error("GMAIL_USER / GMAIL_APP_PASSWORD env vars are not set")
        raise HTTPException(500, "Email service is not configured on the server.")

    body = (
        f"Your MoneyMate password reset code is:\n\n"
        f"  {code}\n\n"
        f"This code expires in 15 minutes. If you did not request a reset, ignore this email."
    )
    msg = MIMEText(body)
    msg["Subject"] = "MoneyMate — Password Reset Code"
    msg["From"]    = f"MoneyMate <{gmail_user}>"
    msg["To"]      = to_email
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
            smtp.login(gmail_user, gmail_password)
            smtp.send_message(msg)
    except Exception as e:
        logger.error("Failed to send reset email to %s: %s", to_email, e)
        raise HTTPException(500, f"Failed to send reset email: {e}")

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID_WEB", "")

router = APIRouter(tags=["auth"])


def _create_default_account(db: Session, user_id: int) -> None:
    """Create a default Cash account (UAH) for a newly registered user."""
    default_account = models.Account(
        user_id=user_id,
        name="Cash",
        type="cash",
        source="manual",
        external_account_id=None,
        balance=0.0,
        currency_code=980,  # UAH
        created_at=int(time.time()),
    )
    db.add(default_account)
    db.commit()


@router.post("/signup", response_model=schemas.UserResponse)
@limiter.limit("5/minute")
def signup(request: Request, user: schemas.UserCreate, db: Session = Depends(get_db)):
    if db.query(models.User).filter_by(email=user.email).first():
        raise HTTPException(400, "Email already registered")

    new_user = models.User(
        email=user.email,
        password_hash=hash_password(user.password),
        created_at=int(time.time()),
    )
    db.add(new_user)
    try:
        db.commit()
        db.refresh(new_user)
    except Exception:
        db.rollback()
        raise HTTPException(500, "Failed to create user")

    _create_default_account(db, new_user.id)
    return new_user


@router.post("/login", response_model=schemas.TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, user: schemas.UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter_by(email=user.email).first()
    if not db_user or not verify_password(user.password, db_user.password_hash):
        raise HTTPException(401, "Invalid credentials")

    return {
        "access_token": create_access_token(db_user.id),
        "refresh_token": create_refresh_token(db_user.id),
        "token_type": "bearer",
    }


@router.post("/refresh", response_model=schemas.TokenResponse)
def refresh(body: schemas.RefreshRequest):
    user_id = decode_refresh_token(body.refresh_token)
    return {
        "access_token": create_access_token(user_id),
        "refresh_token": create_refresh_token(user_id),
        "token_type": "bearer",
    }


@router.post("/auth/google", response_model=schemas.TokenResponse)
@limiter.limit("10/minute")
def google_auth(request: Request, body: schemas.GoogleAuthRequest, db: Session = Depends(get_db)):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(500, "Google auth is not configured on this server")
    try:
        id_info = google_id_token.verify_oauth2_token(
            body.id_token, google_requests.Request(), GOOGLE_CLIENT_ID
        )
    except ValueError as e:
        raise HTTPException(401, f"Invalid Google token: {e}")

    email = id_info.get("email")
    if not email:
        raise HTTPException(400, "No email returned from Google")

    user = db.query(models.User).filter_by(email=email).first()
    if not user:
        user = models.User(
            email=email,
            password_hash="",
            created_at=int(time.time()),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        _create_default_account(db, user.id)

    return {
        "access_token": create_access_token(user.id),
        "refresh_token": create_refresh_token(user.id),
        "token_type": "bearer",
    }


@router.post("/forgot-password")
@limiter.limit("5/minute")
def forgot_password(request: Request, body: schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter_by(email=body.email).first()
    # Always return 200 to avoid leaking which emails are registered
    if not user:
        return {"status": "ok"}

    # Invalidate any existing unused tokens for this email
    db.query(models.PasswordResetToken).filter_by(email=body.email, used=False).delete()
    db.commit()

    code = str(random.randint(100000, 999999))
    token = models.PasswordResetToken(
        email=body.email,
        code=code,
        expires_at=int(time.time()) + RESET_CODE_TTL,
        used=False,
    )
    db.add(token)
    db.commit()

    _send_reset_email(body.email, code)
    return {"status": "ok"}


@router.post("/reset-password")
@limiter.limit("10/minute")
def reset_password(request: Request, body: schemas.ResetPasswordRequest, db: Session = Depends(get_db)):
    if len(body.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    token = (
        db.query(models.PasswordResetToken)
        .filter_by(email=body.email, code=body.code, used=False)
        .order_by(models.PasswordResetToken.expires_at.desc())
        .first()
    )
    if not token:
        raise HTTPException(400, "Invalid or expired reset code")
    if int(time.time()) > token.expires_at:
        raise HTTPException(400, "Reset code has expired")

    user = db.query(models.User).filter_by(email=body.email).first()
    if not user:
        raise HTTPException(404, "User not found")

    user.password_hash = hash_password(body.new_password)
    token.used = True
    db.commit()
    return {"status": "ok"}


@router.delete("/users/me")
def delete_account(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    """Permanently delete the authenticated user and all their data."""
    db.query(models.ReceiptImage).filter_by(user_id=user_id).delete()
    db.query(models.Transaction).filter_by(user_id=user_id).delete()
    db.query(models.Account).filter_by(user_id=user_id).delete()
    db.query(models.UserCategory).filter_by(user_id=user_id).delete()
    db.query(models.User).filter_by(id=user_id).delete()
    db.commit()
    return {"status": "account deleted"}


@router.post("/change-password")
def change_password(
    body: schemas.ChangePasswordRequest,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    user = db.query(models.User).filter_by(id=user_id).first()
    if not user or not verify_password(body.current_password, user.password_hash):
        raise HTTPException(401, "Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"status": "password updated"}
