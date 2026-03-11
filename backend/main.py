import os
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from src.database import engine, Base
from src.rate_limit import limiter
from src.routers.auth import router as auth_router
from src.routers.accounts import router as accounts_router
from src.routers.transactions import router as transactions_router
from src.routers.monobank import router as monobank_router
from src.routers.receipts import router as receipts_router
from src.routers.categories import router as categories_router

# Create tables on startup (use Alembic for production migrations)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="MoneyMate API", version="1.0.0")

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
app.include_router(categories_router)


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["system"])
def health():
    return {"status": "ok"}
