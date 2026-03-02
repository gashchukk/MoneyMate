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
2. [Architecture](#2-architecture)
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
| Auth | JWT (python-jose) | Secure token-based authentication |
| Storage | Expo SecureStore | Token storage on device |

---

## 2. Architecture

### 2.1 Repository Structure

```
moneymate/
├── backend/
│   ├── main.py                 # FastAPI app, all endpoints
│   ├── models.py               # SQLAlchemy ORM models
│   ├── schemas.py              # Pydantic request/response schemas
│   ├── database.py             # DB engine + session factory
│   ├── auth.py                 # JWT helpers (create/verify token)
│   ├── monobank.py             # Monobank API client wrapper
│   ├── receipt_parser.py       # Gemini-powered receipt parser
│   ├── mcc_mappings.json       # MCC code → category name mapping
│   └── requirements.txt
└── mobile/
    ├── app/
    │   ├── (tabs)/
    │   │   ├── index.tsx        # Transactions screen
    │   │   ├── analytics.tsx    # Analytics dashboard
    │   │   ├── scan.tsx         # Receipt scanner
    │   │   ├── accounts.tsx     # Accounts list
    │   │   └── settings.tsx     # Settings + Mono link/sync
    │   ├── account/[id].tsx     # Account detail + edit/delete
    │   ├── transaction/[id].tsx # Transaction detail + edit/delete
    │   └── auth.tsx             # Login / Register
    ├── components/
    │   ├── AppContext.tsx        # Global state (language, currency)
    │   ├── CreateAccountModal.tsx
    │   └── EditAccountModal.tsx
    └── constants/
        └── api.ts               # Base URL + apiFetch helper
```

### 2.2 Data Flow

```
Mobile App  ──►  REST API (FastAPI)  ──►  PostgreSQL

Receipt Photo  ──►  Google Vision OCR  ──►  Gemini LLM  ──►  Transaction + ReceiptImage rows

Monobank Approval  ──►  /mono/sync-accounts  ──►  /mono/sync-transactions  ──►  DB upsert
```

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

All endpoints except `/auth/*` require `Authorization: Bearer <token>` header.

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/register` | Create new user account |
| `POST` | `/auth/login` | Login, receive JWT access token |

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
GEMINI_API_KEY=your-gemini-api-key
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

#### Install and run

```bash
cd backend
pip install -r requirements.txt
alembic upgrade head          # run all migrations
uvicorn main:app --reload     # dev server on :8000
```

#### `requirements.txt` (key packages)

```
fastapi
uvicorn
sqlalchemy
psycopg2-binary
python-jose[cryptography]
passlib[bcrypt]
google-cloud-vision>=3.4.0
google-generativeai>=0.7.0
python-multipart
alembic
python-dotenv
```

---

### 5.2 Mobile App

**Prerequisites:** Node.js 18+, Expo CLI, iOS Simulator or Android emulator/device

#### Install and run

```bash
cd mobile
npm install
npx expo install expo-camera expo-image-picker expo-secure-store
npx expo start
```

#### `app.json` — permissions

```json
"plugins": [
  ["expo-camera",       { "cameraPermission": "MoneyMate needs camera to scan receipts." }],
  ["expo-image-picker", { "photosPermission": "MoneyMate needs photo access to upload receipts." }]
]
```

#### `constants/api.ts`

```typescript
import * as SecureStore from 'expo-secure-store';

export const API_BASE_URL = 'http://YOUR_LOCAL_IP:8000';

export async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = await SecureStore.getItemAsync('access_token');
  const res = await fetch(API_BASE_URL + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

> **Note:** Replace `YOUR_LOCAL_IP` with your machine's LAN IP (e.g. `192.168.1.x`). `localhost` won't work from a physical device.

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
MCC codes from Monobank are resolved to human-readable category names using `mcc_mappings.json`, loaded once at startup into a dict for O(1) lookups. The integer MCC is zero-padded to 4 digits before lookup to match the JSON keys (e.g. `742` → `"0742"`).

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
  → Gemini 2.0 Flash (structured prompt)
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
| **Monobank** | Derived from MCC code via `mcc_mappings.json` at sync time |
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
- [ ] Implement Monobank webhook for real-time transaction push (instead of manual sync)
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
