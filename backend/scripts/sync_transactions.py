#!/usr/bin/env python3
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import time
from src.database import SessionLocal
from src.models import User, Account, Transaction
from src.monobank import mono_client_info, mono_statement
from src.mcc import mcc_to_category

def sync_all_users():
    db = SessionLocal()
    try:
        users = db.query(User).filter(User.mono_integration_token.isnot(None)).all()
        for user in users:
            request_id = user.mono_integration_token
            print(f"Syncing user {user.id} with request_id {request_id}")

            # Sync accounts: only update existing
            resp = mono_client_info(request_id)
            if resp.status_code == 200:
                info = resp.json()
                for acc in info["accounts"]:
                    existing = db.query(Account).filter_by(
                        user_id=user.id,
                        external_account_id=acc.get("id"),
                    ).first()
                    if existing:
                        raw_balance = acc.get("balance")
                        balance = raw_balance / 100 if raw_balance is not None else None
                        acc_type = acc.get("type") or "unknown"
                        existing.balance = balance
                        existing.currency_code = acc.get("currencyCode")
                        existing.name = acc_type + "card"
                        existing.type = acc_type
                        print(f"Updated account {existing.id}")
            else:
                print(f"Failed to sync accounts for user {user.id}: {resp.status_code}")

            # Sync transactions for existing accounts
            accounts = db.query(Account).filter_by(user_id=user.id, source="mono").all()
            from_ts = int(time.time()) - 30 * 86400  # last 30 days
            to_ts = int(time.time())

            for acc in accounts:
                resp = mono_statement(request_id, acc.external_account_id, str(from_ts), str(to_ts))
                if resp.status_code == 200:
                    mono_txs = resp.json()
                    mono_tx_ids = {tx["id"] for tx in mono_txs}

                    # Delete old txs not in new
                    db.query(Transaction).filter(
                        Transaction.account_id == acc.id,
                        Transaction.time >= from_ts,
                        Transaction.time <= to_ts,
                        Transaction.external_tx_id.notin_(mono_tx_ids),
                    ).delete(synchronize_session=False)

                    for tx in mono_txs:
                        category = mcc_to_category(tx.get("mcc"))
                        existing = db.query(Transaction).filter_by(
                            external_tx_id=tx["id"]
                        ).first()

                        if existing:
                            existing.amount = tx["amount"] / 100
                            existing.description = tx.get("description")
                            existing.mcc = tx.get("mcc")
                            existing.currency_code = tx.get("currencyCode")
                            existing.category = category
                        else:
                            db.add(Transaction(
                                user_id=user.id,
                                account_id=acc.id,
                                external_tx_id=tx["id"],
                                time=int(tx["time"]),
                                description=tx.get("description"),
                                mcc=tx.get("mcc"),
                                amount=tx["amount"] / 100,
                                currency_code=tx.get("currencyCode"),
                                source="mono",
                                category=category,
                                created_at=int(time.time()),
                            ))
                    print(f"Synced {len(mono_txs)} transactions for account {acc.id}")
                else:
                    print(f"Failed to sync transactions for account {acc.id}: {resp.status_code}")

        db.commit()
        print("Sync completed")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    sync_all_users()