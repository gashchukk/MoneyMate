import os
import time
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

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID_WEB", "")

router = APIRouter(tags=["auth"])


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

    return {
        "access_token": create_access_token(user.id),
        "refresh_token": create_refresh_token(user.id),
        "token_type": "bearer",
    }


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
