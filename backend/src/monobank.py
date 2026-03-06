import os
import time
import base64
import hashlib
import requests
import ecdsa

KEY_ID = os.getenv("MONOBANK_KEY_ID")
PRIVATE_KEY_PEM = open("./data/private.key").read()
BASE_URL = "https://api.monobank.ua"

def sign_message(message: bytes) -> str:
    sk = ecdsa.SigningKey.from_pem(PRIVATE_KEY_PEM, hashfunc=hashlib.sha256)
    signature = sk.sign(message)
    return base64.b64encode(signature).decode('ascii')


def sign_path(path: str, x_time: str, request_id: str | None = None) -> str:
    msg = (x_time + request_id + path).encode() if request_id else (x_time + path).encode()
    return sign_message(msg)


def mono_request_access():
    path = "/personal/auth/request"
    x_time = str(int(time.time())).split('.')[0]

    headers = {
        "X-Key-Id": KEY_ID,
        "X-Time": x_time,
        "X-Sign": sign_path(path, x_time),
    }
    return requests.post(BASE_URL + path, headers=headers)


def mono_client_info(request_id: str):
    path = "/personal/client-info"
    x_time = str(int(time.time()))

    headers = {
        "X-Key-Id": KEY_ID,
        "X-Time": x_time,
        "X-Request-Id": request_id,
        "X-Sign": sign_path(path, x_time, request_id),
    }

    return requests.get(BASE_URL + path, headers=headers)


def mono_statement(request_id: str, account_id: str, from_ts: str, to_ts: str):
    path = f"/personal/statement/{account_id}/{from_ts}/{to_ts}"
    x_time = str(int(time.time()))

    headers = {
        "X-Key-Id": KEY_ID,
        "X-Time": x_time,
        "X-Request-Id": request_id,
        "X-Sign": sign_path(path, x_time, request_id),
    }

    return requests.get(BASE_URL + path, headers=headers)
