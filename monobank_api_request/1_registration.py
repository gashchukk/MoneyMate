import requests
import json
import base64
import time
import ecdsa
import hashlib

# Docs - https://api.monobank.ua/docs/corporate.html#tag/Avtorizaciya-ta-nalashtuvannya-kompaniyi

if __name__ == '__main__':
    resource = '/personal/auth/registration'
    url = f"https://api.monobank.ua{resource}"

    # openssl ecparam -genkey -name secp256k1 -rand /dev/urandom -out priv.key
    pem_private_key = open('private.key').read()

    # openssl ec -in priv.key -pubout > key.pub
    pem_public_key = open('public.key').read()

    timestamp = str(time.time()).split('.')[0]

    # Load key
    signing_key = ecdsa.SigningKey.from_pem(pem_private_key)

    # Get X-sign for request
    data = (timestamp + resource).encode('utf-8')
    sign = signing_key.sign(data, hashfunc=hashlib.sha256)
    sign_b64 = base64.b64encode(sign)

    # logo of your company
    with open('logo.jpg', "rb") as image_file:
        logo_encoded = base64.b64encode(image_file.read())

    # openssl ec -in priv.key -pubout > key.pub
    with open('public.key', "rb") as public_key_file:
        public_key_encoded = base64.b64encode(public_key_file.read())

    request_data = {
        "pubkey": public_key_encoded.decode(),
        "name": "MoneyMate",
        "description": "Система для трекінгу фінансів, з можливістю підключення до монобанку та OCR розпізнавання чеків",
        "contactPerson": "Bohdan Hashchuk",
        "phone": "380987393991",
        "email": "gashchuk2@gmail.com",
        "logo": logo_encoded.decode()
    }

    headers = {
        "X-Time": timestamp,
        "X-Sign": sign_b64,
        "Content-Type": "application/json"
    }

    response = requests.post(url, headers=headers, data=json.dumps(request_data))

    print(f"Response status code: {response.status_code}")
    print(response.json())