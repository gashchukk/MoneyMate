import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is not set")

# Supabase/PostgreSQL connection pooling settings
# pool_size: persistent connections kept open
# max_overflow: extra connections allowed beyond pool_size under load
# pool_recycle: recycle connections after N seconds (avoids stale connection errors)
# pool_pre_ping: test connection health before using it from pool
engine = create_engine(
    DATABASE_URL,
    pool_size=2,
    max_overflow=5,
    pool_recycle=300,
    pool_pre_ping=True,
    pool_timeout=10,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
