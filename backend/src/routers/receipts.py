import time
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from sqlalchemy.orm import Session
from google.cloud import vision as gvision

import src.models as models
import src.schemas as schemas
from src.database import get_db
from src.security import get_current_user
from src.receipt_parser import parse_receipt

router = APIRouter(prefix="/receipts", tags=["receipts"])

_vision_client: gvision.ImageAnnotatorClient | None = None


def get_vision_client() -> gvision.ImageAnnotatorClient:
    global _vision_client
    if _vision_client is None:
        _vision_client = gvision.ImageAnnotatorClient()
    return _vision_client


@router.post("/scan", response_model=schemas.ReceiptImageOut)
async def scan_receipt(
    file: UploadFile = File(...),
    account_id: int = Form(...),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    account = db.query(models.Account).filter_by(
        id=account_id, user_id=user_id
    ).first()
    if not account:
        raise HTTPException(404, "Account not found")

    contents = await file.read()

    client = get_vision_client()
    gv_image = gvision.Image(content=contents)
    response = client.text_detection(image=gv_image)
    if response.error.message:
        raise HTTPException(400, f"Vision API error: {response.error.message}")

    annotations = response.text_annotations
    raw_text = annotations[0].description if annotations else ""

    parsed = parse_receipt(raw_text)
    total = parsed.get("total")

    tx_id = None
    if total and total > 0:
        tx = models.Transaction(
            user_id=user_id,
            account_id=account_id,
            external_tx_id=None,
            time=parsed.get("time") or int(time.time()),
            description=parsed.get("description") or parsed.get("store") or file.filename,
            mcc=parsed.get("mcc", 5411),
            amount=-total,
            currency_code=parsed.get("currency_code", account.currency_code),
            source="receipt",
            category=parsed.get("category", "Groceries"),
            created_at=int(time.time()),
        )
        db.add(tx)
        db.flush()
        tx_id = tx.id
        account.balance = (account.balance or 0) - total

    receipt = models.ReceiptImage(
        user_id=user_id,
        transaction_id=tx_id,
        filename=file.filename,
        raw_text=raw_text,
        parsed_data=parsed,
        created_at=int(time.time()),
    )
    db.add(receipt)
    db.flush()
    db.commit()
    db.refresh(receipt)
    return receipt


@router.get("", response_model=list[schemas.ReceiptImageOut])
def list_receipts(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    return (
        db.query(models.ReceiptImage)
        .filter_by(user_id=user_id)
        .order_by(models.ReceiptImage.created_at.desc())
        .all()
    )


@router.get("/{receipt_id}", response_model=schemas.ReceiptImageOut)
def get_receipt(
    receipt_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    receipt = db.query(models.ReceiptImage).filter_by(
        id=receipt_id, user_id=user_id
    ).first()
    if not receipt:
        raise HTTPException(404, "Receipt not found")
    return receipt
