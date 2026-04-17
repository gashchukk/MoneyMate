import os
import logging
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from src.database import engine, Base
import src.monobank as _monobank
from src.rate_limit import limiter
from src.routers.auth import router as auth_router
from src.routers.accounts import router as accounts_router
from src.routers.transactions import router as transactions_router
from src.routers.monobank import router as monobank_router
from src.routers.receipts import router as receipts_router
from src.routers.mcc import router as mcc_router
from src.routers.billing import router as billing_router
from src.routers.subscription import router as subscription_router
from src.routers.export import router as export_router

# Create any missing tables (idempotent). Errors are non-fatal on serverless.
try:
    Base.metadata.create_all(bind=engine)
except Exception as _e:
    logging.warning("create_all skipped: %s", _e)

# ── One-time data fix: MCC-based "Transfer" → re-categorise via current mapping
# Transactions auto-set to Transfer via the old MCC mapping (4829, 6529-6540,
# 6611) may include salary, P2P, etc. Re-run mcc_to_category so they get the
# correct canonical category. Transactions the user manually set to "Transfer"
# have mcc=NULL or an MCC that still maps to "Other", so they are unaffected.
try:
    from src.database import SessionLocal
    from src import models as _models
    from src.mcc import mcc_to_category as _mcc_cat
    _TRANSFER_MCCS = {4829, 6529, 6530, 6531, 6532, 6533, 6534,
                      6535, 6536, 6537, 6538, 6539, 6540, 6611}
    _db = SessionLocal()
    try:
        _rows = _db.query(_models.Transaction).filter(
            _models.Transaction.category == "Transfer",
            _models.Transaction.mcc.in_(list(_TRANSFER_MCCS)),
        ).all()
        for _tx in _rows:
            _tx.category = _mcc_cat(_tx.mcc)
        if _rows:
            _db.commit()
            logging.info("fix_transfer_mcc: re-categorised %d transaction(s)", len(_rows))
    finally:
        _db.close()
except Exception as _e:
    logging.warning("fix_transfer_mcc skipped: %s", _e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    backend_url = os.getenv("BACKEND_URL", "").rstrip("/")
    if backend_url:
        try:
            webhook_url = f"{backend_url}/mono/corp/webhook"
            resp = _monobank.mono_set_corp_webhook(webhook_url)
            if resp.status_code == 200:
                logging.info(f"Monobank corp webhook registered: {webhook_url}")
            else:
                logging.warning(f"Monobank corp webhook registration failed: {resp.status_code} {resp.text}")
        except Exception as e:
            logging.warning(f"Monobank corp webhook registration error: {e}")
    yield


app = FastAPI(title="MoneyMate API", version="1.0.0", lifespan=lifespan)

# ── Rate limiting ──────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── CORS ──────────────────────────────────────────────────────────────────────
# allow_credentials=True is incompatible with allow_origins=["*"] per the CORS spec.
# When ALLOWED_ORIGINS is set to specific origins, credentials are enabled.
# If unset or "*", wildcard is used without credentials (safe for development).
_raw_origins = os.getenv("ALLOWED_ORIGINS", "")
if _raw_origins and _raw_origins != "*":
    _allowed_origins = [o.strip() for o in _raw_origins.split(",")]
    _allow_credentials = True
else:
    _allowed_origins = ["*"]
    _allow_credentials = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(accounts_router)
app.include_router(transactions_router)
app.include_router(monobank_router)
app.include_router(receipts_router)
app.include_router(mcc_router)
app.include_router(billing_router)
app.include_router(subscription_router)
app.include_router(export_router)


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/", tags=["system"])
@app.get("/health", tags=["system"])
def health():
    return {"status": "ok"}
