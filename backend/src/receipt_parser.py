# receipt_parser.py
import os
import json
import time
import re
from typing import Optional
from google import genai

# ── Init Gemini ───────────────────────────────────────────────────────────────
API_KEY = os.getenv("GOOGLE_API_KEY")
MODEL = os.getenv("GENAI_MODEL", "gemini-2.0-flash-lite")

_client = genai.Client(api_key=API_KEY)

# ── Prompt ────────────────────────────────────────────────────────────────────
_SYSTEM_PROMPT = """
You are a receipt parser. You receive raw OCR text from a shopping receipt and must extract structured data.

Return ONLY a valid JSON object with NO markdown, NO explanation, NO code fences — raw JSON only.

Required fields:
{
  "store":         string or null,        // store/merchant name
  "date":          string or null,        // date in DD.MM.YYYY format
  "time":          integer or null,       // unix timestamp (seconds). Derive from date + time on receipt. If no time found, use noon (12:00) of that date. If no date at all, return null.
  "total":         float or null,         // final total amount paid (after discounts)
  "currency":      string,                // "UAH", "USD", "EUR", etc. Default "UAH" for Ukrainian receipts.
  "currency_code": integer,               // ISO 4217 numeric: UAH=980, USD=840, EUR=978
  "description":   string,               // short human-readable description, e.g. "Silpo — 12 items"
  "mcc":           integer,              // best-guess MCC code based on store type. Grocery=5411, Restaurant=5812, Pharmacy=5912, Fuel=5541, Clothing=5691, Electronics=5732, Transport=4111. Default 5411.
  "category":      string,               // one of: "Groceries", "Food & Drink", "Health", "Transport", "Shopping", "Entertainment", "Housing", "Other"
  "items": [                             // individual line items, empty array if none found
    {
      "name":        string,
      "quantity":    float,
      "unit_price":  float,
      "total_price": float
    }
  ],
  "discount":      float or null,        // total discount applied, positive number
  "raw_lines":     array of strings      // all non-empty lines from the receipt
}

Rules:
- total should be the FINAL amount paid, not subtotal before discount
- If you see ЗНИЖКА/DISCOUNT lines, subtract from subtotal to get total
- For mcc: use context clues (store name, item names) to pick the best code
- For category: match to the closest option from the allowed list
- Parse Ukrainian (Cyrillic) text correctly
- Strip trailing/leading whitespace from all strings
- Return null for any field you cannot confidently determine, If you are not sure about any field, return null for that field
"""


def parse_receipt(raw_text: str) -> dict:
    """
    Send raw OCR text to Gemini and return structured receipt data
    ready to map directly onto the Transaction model.
    """
    prompt = f"{_SYSTEM_PROMPT}\n\nReceipt OCR text:\n\"\"\"\n{raw_text}\n\"\"\""

    try:
        response = _client.models.generate_content(model=MODEL, contents=prompt)
        text = response.text.strip()

        # Strip accidental markdown fences if Gemini adds them despite instructions
        text = re.sub(r'^```(?:json)?\s*', '', text)
        text = re.sub(r'\s*```$', '', text)

        parsed = json.loads(text)
        if parsed.get("date"):
            derived = _date_to_timestamp(parsed["date"])
            if derived:
                parsed["time"] = derived

        # Only fall back to now if we have neither
        if not parsed.get("time"):
            parsed["time"] = int(time.time())
    except json.JSONDecodeError as e:
        return _fallback(raw_text, error=str(e))
    except Exception as e:
        return _fallback(raw_text, error=str(e))

    # ── Derive unix timestamp if Gemini didn't ─────────────────────────────
    if not parsed.get("time") and parsed.get("date"):
        parsed["time"] = _date_to_timestamp(parsed["date"])

    # ── Ensure required fields exist ───────────────────────────────────────
    parsed.setdefault("currency", "UAH")
    parsed.setdefault("currency_code", 980)
    parsed.setdefault("mcc", 5411)
    parsed.setdefault("category", "Groceries")
    parsed.setdefault("items", [])
    parsed.setdefault("raw_lines", [l.strip() for l in raw_text.splitlines() if l.strip()])

    return parsed


def _date_to_timestamp(date_str: str) -> Optional[int]:
    """Convert DD.MM.YYYY or DD/MM/YYYY to unix timestamp (noon UTC)."""
    import datetime
    for fmt in ("%d.%m.%Y", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            dt = datetime.datetime.strptime(date_str.strip(), fmt)
            dt = dt.replace(hour=12, minute=0, second=0, microsecond=0,
                            tzinfo=datetime.timezone.utc)
            return int(dt.timestamp())
        except ValueError:
            continue
    return None


def _fallback(raw_text: str, error: str = "") -> dict:
    """Return a minimal safe dict when Gemini parsing fails."""
    lines = [l.strip() for l in raw_text.splitlines() if l.strip()]
    return {
        "store":         None,
        "date":          None,
        "time":          int(time.time()),
        "total":         None,
        "currency":      "UAH",
        "currency_code": 980,
        "description":   "Receipt (parse failed)",
        "mcc":           5411,
        "category":      "Groceries",
        "items":         [],
        "discount":      None,
        "raw_lines":     lines,
        "_parse_error":  error,
    }
