import time
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

import src.models as models
import src.schemas as schemas
from src.database import get_db
from src.auth import hash_password, verify_password
from src.security import create_token

router = APIRouter(tags=["auth"])


@router.post("/signup", response_model=schemas.UserResponse)
def signup(user: schemas.UserCreate, db: Session = Depends(get_db)):
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


@router.post("/login")
def login(user: schemas.UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter_by(email=user.email).first()
    if not db_user or not verify_password(user.password, db_user.password_hash):
        raise HTTPException(401, "Invalid credentials")

    token = create_token(db_user.id)
    return {"access_token": token, "token_type": "bearer"}
