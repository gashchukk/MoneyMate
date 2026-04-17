-- Run once on existing Supabase/Postgres DB (SQLAlchemy create_all does not ALTER tables).
-- Safe to re-run if using IF NOT EXISTS patterns where supported; for plain ALTER, run once.

ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_expires_at INTEGER NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_last_sync_at INTEGER NULL;

CREATE INDEX IF NOT EXISTS ix_receipt_images_user_created ON receipt_images (user_id, created_at);

-- RevenueCat: set backend env REVENUECAT_PREMIUM_ENTITLEMENT_ID to match your entitlement id (default in code: moneymate_pro for "MoneyMate Pro").
