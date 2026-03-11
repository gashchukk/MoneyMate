from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

import src.models as models
import src.schemas as schemas
from src.database import get_db
from src.security import get_current_user

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[schemas.CategoryResponse])
def list_categories(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    return db.query(models.UserCategory).filter_by(user_id=user_id).all()


@router.post("", response_model=schemas.CategoryResponse)
def create_category(
    category: schemas.CategoryCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    existing = db.query(models.UserCategory).filter(
        models.UserCategory.user_id == user_id,
        models.UserCategory.label.ilike(category.label),
    ).first()
    if existing:
        raise HTTPException(400, "Category with this name already exists")

    new_cat = models.UserCategory(
        user_id=user_id,
        label=category.label,
        icon=category.icon,
        color=category.color,
    )
    db.add(new_cat)
    db.commit()
    db.refresh(new_cat)
    return new_cat


@router.delete("/{category_id}")
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    cat = db.query(models.UserCategory).filter_by(
        id=category_id, user_id=user_id
    ).first()
    if not cat:
        raise HTTPException(404, "Category not found")
    db.delete(cat)
    db.commit()
    return {"status": "deleted"}
