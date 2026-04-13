# 💳 MoneyMate

> Personal Finance Tracker — React Native + FastAPI + AI Receipt Scanning

![Stack](https://img.shields.io/badge/Mobile-React%20Native%20%2F%20Expo-blue)
![Backend](https://img.shields.io/badge/Backend-FastAPI-green)
![AI](https://img.shields.io/badge/AI-Gemini%202.0%20Flash-orange)
![OCR](https://img.shields.io/badge/OCR-Google%20Vision-yellow)
![Banking](https://img.shields.io/badge/Bank-Monobank%20API-black)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture) — includes [technologies reference](#24-technologies-reference) and [algorithms and business logic](#25-algorithms-and-business-logic)
3. [Database Schema](#3-database-schema)
4. [API Reference](#4-api-reference)
5. [Setup & Installation](#5-setup--installation)
6. [Feature Deep-Dives](#6-feature-deep-dives)
7. [Known Limitations & TODOs](#7-known-limitations--todos)

---

## 1. Project Overview

MoneyMate is a full-stack personal finance management application built for Ukrainian users. It combines manual transaction tracking, automatic bank synchronisation via Monobank's Open API, and AI-powered receipt scanning using Google Vision OCR and Google Gemini to deliver a comprehensive view of personal finances.

### Key Features

- **Transaction management** — manual deposits, withdrawals, and transfers between accounts
- **Monobank integration** — one-tap sync of all accounts and up to 90 days of transactions
- **Receipt scanning** — photograph a receipt and let AI extract store, items, total, and category automatically
- **Analytics dashboard** — spending trends, category breakdowns, monthly comparisons, and per-account analysis
- **Multi-currency support** — UAH, USD, EUR, GBP with ISO 4217 numeric codes
- **Bilingual UI** — full English and Ukrainian localisation (i18n)
- **Category system** — built-in categories with inline custom category creation

### Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React Native + Expo Router | Cross-platform mobile app (iOS/Android) |
| Backend | FastAPI (Python) | REST API, auth, business logic |
| Database | PostgreSQL + SQLAlchemy | Persistent storage + ORM |
| OCR | Google Cloud Vision | Receipt text extraction |
| AI Parser | Google Gemini 2.0 Flash | Structured data extraction from OCR text |
| Banking | Monobank Open API | Account & transaction sync |
| Auth | PyJWT (HS256) + bcrypt | Access/refresh tokens; password hashing |
| Storage | Expo SecureStore | Token storage on device |
| Rate limiting | slowapi | Protects auth, receipt scan, Mono endpoints |

---

## 2. Architecture

### 2.1 Repository Structure

```
moneymate/
├── backend/
│   ├── main.py                 # FastAPI app entry, lifespan, middleware
│   ├── vercel.json             # Vercel serverless routing
│   ├── requirements.txt
│   ├── data/
│   │   └── mcc.json            # MCC metadata (descriptions); category rules in src/mcc.py
│   └── src/
│       ├── database.py         # Engine + session
│       ├── models.py           # SQLAlchemy ORM models
│       ├── schemas.py          # Pydantic request/response schemas
│       ├── auth.py             # bcrypt password hash/verify
│       ├── security.py         # JWT create/decode, get_current_user
│       ├── monobank.py         # Monobank API client (ECDSA-signed requests)
│       ├── receipt_parser.py  # Gemini receipt JSON extraction
│       ├── mcc.py              # MCC → category + smart_categorize heuristics
│       ├── rate_limit.py       # slowapi limiter
│       └── routers/            # auth, accounts, transactions, mono, receipts, mcc
└── frontend/
    ├── app/
    │   ├── (tabs)/             # index, analytics, scan, accounts, settings
    │   ├── account/[id].tsx
    │   ├── transaction/[id].tsx
    │   └── auth.tsx
    ├── components/
    └── constants/
        └── api.ts              # apiFetch + SecureStore + token refresh
```

### 2.2 Data Flow

```
Expo app  ──►  REST API (FastAPI)  ──►  PostgreSQL

Receipt photo  ──►  Google Vision OCR  ──►  Gemini LLM  ──►  Transaction + ReceiptImage rows

Monobank approval / webhooks  ──►  client-info + statements  ──►  accounts + transactions (dedup by external_tx_id)
```

### 2.3 Architecture diagram

```mermaid
flowchart LR
  subgraph client [Expo_RN_app]
    SecureStore[expo_secure_store]
    ApiFetch[apiFetch_JWT_refresh]
  end
  subgraph api [FastAPI_backend]
    Auth[JWT_bcrypt]
    Mono[Monobank_ECDSA_requests]
    Receipts[Vision_OCR_Gemini]
    MCC[mcc_to_category_smart_categorize]
  end
  subgraph external [External_services]
    PG[(PostgreSQL)]
    Vision[Google_Cloud_Vision]
    Gemini[Google_Gemini]
    MonoAPI[Monobank_API]
  end
  client --> api
  api --> PG
  Receipts --> Vision
  Receipts --> Gemini
  Mono --> MonoAPI
```

### 2.4 Technologies reference

| Technology / pattern | Why | Where |
|---|---|---|
| Expo, React Native, React 19 | Cross-platform mobile (iOS/Android; web via Expo) | `frontend/package.json` |
| Expo Router | File-based routing, tabs, auth flow | `frontend/app/` |
| TypeScript | Typed UI and API layer | `frontend/` |
| i18next, react-i18next | English / Ukrainian UI | `frontend/` |
| expo-secure-store | Store secrets off generic storage | `frontend/constants/api.ts` |
| `apiFetch` + refresh on 401 | Session continuity; logout on invalid refresh | `frontend/constants/api.ts` |
| expo-camera, expo-image-picker | Receipt capture / gallery | `frontend/package.json`, scan screen |
| react-native-gifted-charts, SVG | Analytics charts | `frontend/app/(tabs)/analytics.tsx` |
| Reanimated, gesture-handler, worklets | Animations and gestures | `frontend/package.json` |
| `useMemo`, filter/reduce/sort | Client-side analytics without extra API | `frontend/app/(tabs)/analytics.tsx`, `index.tsx` |
| FastAPI, Uvicorn | REST API + ASGI server | `backend/main.py`, `backend/requirements.txt` |
| SQLAlchemy, psycopg2, PostgreSQL | ORM and database | `backend/src/database.py`, `models.py` |
| Pydantic | Request/response validation | `backend/src/schemas.py` |
| PyJWT | Access and typed refresh tokens | `backend/src/security.py` |
| bcrypt | Password hashing | `backend/src/auth.py` |
| slowapi | Rate limits on sensitive routes | `backend/main.py`, `src/routers/` |
| python-multipart | Image uploads | `backend/src/routers/receipts.py` |
| requests | HTTP calls to Monobank | `backend/src/monobank.py` |
| ecdsa + SHA256 | Monobank `X-Sign` request signing | `backend/src/monobank.py` |
| google-cloud-vision, google-auth | OCR (`text_detection`) | `backend/src/routers/receipts.py` |
| google-genai | Gemini structured receipt parsing | `backend/src/receipt_parser.py` |
| python-dotenv | Local configuration | `backend/main.py` |
| Vercel `@vercel/python` | Optional deployment | `backend/vercel.json` |
| Railway | Optional deployment | `backend/railway.json`, `Procfile` |

### 2.5 Algorithms and business logic

| Logic | Why | Where |
|---|---|---|
| `mcc_to_category` — range checks + dict lookup | Map bank MCC codes to app categories in O(1)-style fashion | `backend/src/mcc.py`, data `backend/data/mcc.json` |
| `smart_categorize` — amount sign + regex keywords | Disambiguate Monobank “transfer” MCCs (salary vs P2P, etc.) | `backend/src/mcc.py`; used in `src/routers/monobank.py` |
| Gemini prompt + JSON cleanup + multi-format date parse | Turn noisy OCR text into a strict transaction-shaped object | `backend/src/receipt_parser.py` |
| Skip insert if `external_tx_id` exists | Idempotent sync and webhooks | `backend/src/routers/monobank.py` |
| Stored `account.balance` updated on every tx write | Fast balance reads; documented consistency rules | [Balance consistency rule](#31-balance-consistency-rule); receipt and transaction routers |
| Analytics time windows (month/year/custom/week) | Period filters for charts | `frontend/app/(tabs)/analytics.tsx` |
| Category aggregation: map → sum → sort desc | Pie slices and “top” lists | `frontend/app/(tabs)/analytics.tsx` |
| Group transactions by calendar day, sort by time | Feed ordering | `frontend/app/(tabs)/index.tsx`, `account/[id].tsx` |
| Timestamp `* 1000` when `time < 1e10` | Treat values as seconds vs milliseconds safely | `frontend/app/(tabs)/analytics.tsx` (and similar) |

---

## 3. Database Schema

### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `email` | VARCHAR | Unique, used for login |
| `hashed_password` | VARCHAR | bcrypt hash |
| `created_at` | INTEGER | Unix timestamp |

### `accounts`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `user_id` | INTEGER | FK → users |
| `name` | VARCHAR | Display name |
| `type` | VARCHAR | `black` / `white` / `platinum` / `iron` / `fop` / `yellow` / `eAid` |
| `source` | VARCHAR | `"manual"` or `"mono"` |
| `external_account_id` | VARCHAR | Monobank account ID (nullable) |
| `balance` | FLOAT | Current balance — kept in sync manually |
| `currency_code` | INTEGER | ISO 4217 numeric (980 = UAH) |
| `created_at` | INTEGER | Unix timestamp |

### `transactions`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `user_id` | INTEGER | FK → users |
| `account_id` | INTEGER | FK → accounts |
| `external_tx_id` | VARCHAR | Mono tx ID; NULL for manual/receipt |
| `time` | INTEGER | Unix timestamp of the transaction |
| `description` | VARCHAR | Human-readable label |
| `mcc` | INTEGER | Merchant Category Code |
| `amount` | FLOAT | Signed: negative = expense, positive = income |
| `currency_code` | INTEGER | ISO 4217 numeric |
| `source` | VARCHAR | `"manual"` \| `"mono"` \| `"receipt"` |
| `category` | VARCHAR | `Groceries` / `Food & Drink` / `Health` / `Transport` / etc. |
| `created_at` | INTEGER | Row creation timestamp |

### `receipt_images`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `user_id` | INTEGER | FK → users |
| `transaction_id` | INTEGER | FK → transactions (nullable if no total found) |
| `filename` | VARCHAR | Original upload filename |
| `raw_text` | TEXT | Full Google Vision OCR output |
| `parsed_data` | JSON | Gemini-structured receipt data |
| `created_at` | INTEGER | Unix timestamp |

### `receipt_items`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `receipt_id` | INTEGER | FK → receipt_images |
| `name` | VARCHAR | Item name from receipt |
| `quantity` | FLOAT | Number of units |
| `unit_price` | FLOAT | Price per unit |
| `total_price` | FLOAT | `quantity × unit_price` |

### 3.1 Balance Consistency Rule

`Account.balance` is a **stored field** — not computed from transactions on read. Every write that touches a transaction must also update the account balance:

| Operation | Balance effect |
|---|---|
| `POST /transactions/manual` | `balance += amount` (amount is signed) |
| `POST /receipts/scan` | `balance -= total` |
| `DELETE /transactions/{id}` | `balance -= amount` (reverse the original) |
| `PUT /transactions/{id}` | `balance = balance - old_amount + new_amount` |
| `POST /mono/sync-accounts` | Balance set directly from Monobank API — **skip the helper** |

---

## 4. API Reference

All endpoints except public auth routes (`/signup`, `/login`, `/refresh`, password reset, `/auth/google`, etc.) require `Authorization: Bearer <token>`.

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/signup` | Create new user account |
| `POST` | `/login` | Login; returns access + refresh tokens |
| `POST` | `/refresh` | Exchange refresh token for new token pair |
| `POST` | `/auth/google` | Sign in with Google (ID token) |

### Accounts

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/accounts` | List all accounts for current user |
| `POST` | `/accounts` | Create a manual account |
| `PUT` | `/accounts/{id}` | Update account name / type / balance |
| `DELETE` | `/accounts/{id}` | Delete account and its transactions |

### Transactions

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/transactions` | List all transactions for current user |
| `POST` | `/transactions/manual` | Create manual transaction |
| `PUT` | `/transactions/{id}` | Edit description or amount |
| `DELETE` | `/transactions/{id}` | Delete transaction, reverse balance |

### Monobank Sync

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/mono/auth/request` | Request Monobank OAuth access URL |
| `POST` | `/mono/sync-accounts?request_id=` | Upsert Monobank accounts into DB |
| `POST` | `/mono/sync-transactions?request_id=&days=30` | Upsert/delete transactions for date range |

### Receipt Scanning

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/receipts/scan` | Upload image → OCR → Gemini parse → create transaction |
| `GET` | `/receipts` | List all scanned receipts for user |
| `GET` | `/receipts/{id}` | Get single receipt with full `parsed_data` JSON |

---

## 5. Setup & Installation

### 5.1 Backend

**Prerequisites:** Python 3.11+, PostgreSQL 14+, Google Cloud service account JSON

#### Environment variables

Create a `.env` file in `backend/`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/moneymate
SECRET_KEY=your-jwt-secret-key
ALGORITHM=HS256
GOOGLE_API_KEY=your-gemini-api-key
GENAI_MODEL=gemini-2.0-flash-lite
MONOBANK_KEY_ID=your-monobank-key-id
# Monobank: PEM private key as env (use \n for newlines) or MONOBANK_PRIVATE_KEY_PATH
MONOBANK_PRIVATE_KEY="-----BEGIN EC PRIVATE KEY-----\n...\n-----END EC PRIVATE KEY-----\n"
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
# Optional (e.g. Vercel): JSON string for Vision — see src/routers/receipts.py
# GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account",...}
```

#### Install and run

```bash
cd backend
pip install -r requirements.txt
# Schema: main.py runs SQLAlchemy create_all on startup (no Alembic in this repo)
uvicorn main:app --reload     # dev server on :8000
```

#### `requirements.txt` (key packages)

See [`backend/requirements.txt`](backend/requirements.txt). Notable entries: `fastapi`, `uvicorn`, `sqlalchemy`, `psycopg2-binary`, `pydantic`, `PyJWT`, `bcrypt`, `requests`, `ecdsa`, `google-cloud-vision`, `google-genai`, `google-auth`, `python-multipart`, `slowapi`, `python-dotenv`.

---

### 5.2 Frontend (Expo app)

**Prerequisites:** Node.js 18+, Expo CLI, iOS Simulator or Android emulator/device

#### Install and run

```bash
cd frontend
npm install
npx expo start
```

#### `app.json` — permissions

```json
"plugins": [
  ["expo-camera",       { "cameraPermission": "MoneyMate needs camera to scan receipts." }],
  ["expo-image-picker", { "photosPermission": "MoneyMate needs photo access to upload receipts." }]
]
```

#### API base URL

Configure `EXPO_PUBLIC_API_URL` (or `expo.extra.apiUrl` in app config) to point at your backend, e.g. `http://YOUR_LOCAL_IP:8000`. The app uses [`frontend/constants/api.ts`](frontend/constants/api.ts) for `apiFetch`, which stores access/refresh tokens in SecureStore and retries once after `POST /refresh` on `401`.

---

## 6. Feature Deep-Dives

### 6.1 Monobank Sync

The sync is a full **upsert** strategy — not append-only.

**Accounts** (`/mono/sync-accounts`):
- Matched by `external_account_id`
- If found → update `balance`, `currency_code`, `name`, `type`
- If not found → insert new row

**Transactions** (`/mono/sync-transactions`):
- All transactions in the sync window that exist in DB but are **absent** from the Monobank response are deleted (cleans up manual entries or outdated records within the window)
- Existing Mono transactions are updated in case Monobank corrects amounts or descriptions
- Transactions outside the sync window are never touched

**MCC resolution:**  
Canonical spending categories use `mcc_to_category()` in `backend/src/mcc.py` (range rules + explicit map). For Monobank statements, `smart_categorize(mcc, amount, description)` refines ambiguous transfer MCCs using the amount sign and description keywords. Human-readable MCC labels come from `backend/data/mcc.json` via `mcc_short_description()` (keys are four-digit strings).

---

### 6.2 Receipt Scanning Pipeline

**Mobile app — 5 stages:**

1. **Camera** — live viewfinder with receipt frame guide, flash toggle, camera flip, gallery fallback
2. **Preview** — full-screen image review with Retake / Use Photo options
3. **Account selection** — bottom sheet with blurred receipt preview behind it
4. **Processing** — multipart upload to `/receipts/scan`, OCR + Gemini parse
5. **Result** — store name, total, itemised table, expandable raw OCR text

**Backend pipeline:**

```
Image bytes
  → Google Vision text_detection API
  → raw_text (full OCR string)
  → Gemini (default `gemini-2.0-flash-lite`, structured prompt)
  → parsed JSON: { store, date, time, total, currency_code, mcc, category, items[] }
  → Transaction row (if total > 0)
  → ReceiptImage row (always — stores raw_text + parsed_data for debugging)
  → ReceiptItem rows (one per line item)
  → account.balance -= total
```

**Timestamp handling:**  
The `time` field from Gemini is not trusted directly — it can return `0` or epoch values. `receipt_parser.py` always re-derives the unix timestamp from the date string using `datetime.strptime` with `tzinfo=datetime.timezone.utc` forced to noon UTC, avoiding timezone drift on the server.

---

### 6.3 Analytics Dashboard

Four tabs, all computed **client-side** from `/transactions` and `/accounts` — no extra endpoints needed.

| Tab | Contents |
|---|---|
| **Overview** | 7 stat cards (total spent, income, net flow, savings rate, avg expense, largest spend, transfers), income vs expenses proportion bar, 14-day daily spending chart, top 5 expenses, transaction type grid |
| **Categories** | Stacked proportion bar, category cards with amount + %, drill-down tap to list all transactions in that category |
| **Trends** | Monthly income & expense bar charts (6 months), month comparison table, weekday spending heatmap, 5 auto-computed insights |
| **Accounts** | Per-account received/spent/net stats, proportional flow bar, top 3 spending categories per account |

Period filter (`7D / 30D / 3M / 6M / 1Y / All`) recomputes all values instantly on selection.

---

### 6.4 Category System

Categories exist at three levels:

| Source | How assigned |
|---|---|
| **Monobank** | `smart_categorize` / `mcc_to_category` in `backend/src/mcc.py` at ingest time |
| **Manual transaction** | User picks from grid of defaults or creates a custom category inline |
| **Receipt scan** | Set by Gemini based on store name and item context |

Default categories: `Groceries`, `Food & Drink`, `Transport`, `Health`, `Shopping`, `Entertainment`, `Housing`, `Salary`, `Transfer`, `Other`

> **Note:** Custom categories created in the modal are currently session-only (React state). To persist them across sessions, add a `/categories` endpoint and load them on app start.

---

### 6.5 Transaction Detail & Edit

Every transaction row in the list is tappable and navigates to `/transaction/[id]`. The detail screen shows:

- Category icon + colour-coded amount hero
- Full details card (date, time, account, currency, source, MCC)
- Warning banner for Monobank transactions (edits may be overwritten on next sync)
- **Edit modal** — changes description and amount; preserves original sign (expense stays negative)
- **Delete** with confirmation alert — also reverses `account.balance`

---

## 7. Known Limitations & TODOs

### Current Limitations

- Custom categories are **session-only** — not persisted to the database
- **No currency conversion** — multi-currency totals in Analytics are not normalised
- Receipt parser accuracy depends on OCR quality — low-light or skewed photos may produce partial results
- Monobank sync window is capped at **31 days per request** by Monobank's rate limits
- No push notifications for large expenses or low balance warnings

### Suggested Next Steps

- [ ] Persist custom categories via a `/categories` CRUD endpoint
- [ ] Add currency conversion using NBU open exchange rate data
- [ ] Extend Monobank automation beyond current webhooks (e.g. richer corp event handling, UX)
- [ ] Add biometric lock (`expo-local-authentication`)
- [ ] Export transactions to CSV or PDF
- [ ] Budget feature — set monthly spend limits per category with alerts
- [ ] Recurring transaction detection and smart tagging
- [ ] Dark mode support

---

## License

MIT

---

*MoneyMate v1.0 — built with ❤️ and a lot of receipts*
