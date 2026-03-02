import requests
import base64
import time
import ecdsa
import hashlib

# Monobank open API for providers - get corp.info
# Docs - https://api.monobank.ua/docs/corporate.html#tag/Avtorizaciya-ta-nalashtuvannya-kompaniyi/paths/~1personal~1corp~1settings/get
# GET https://api.monobank.ua/personal/corp/settings

if __name__ == '__main__':
    resource = '/personal/corp/settings'
    url = f'https://api.monobank.ua{resource}'
    
    # Your service keyId
    # send a request to /personal/auth/registration/status
    key_id = open('key_id.txt').read().strip()

    # PRIVATE KEY
    pem_private_key = open('private.key').read()

    # get epoch timestamp [a floating point number => integer]
    timestamp = int(time.time())
    timestamp = str(timestamp)

    # Load key
    signing_key = ecdsa.SigningKey.from_pem(pem_private_key)

    # Get X-sign for request
    data = (timestamp + resource).encode('utf-8')
    sign = signing_key.sign(data, hashfunc=hashlib.sha256)
    sign_b64 = base64.b64encode(sign)

    headers = {
        "X-Key-Id": key_id,
        "X-Request-Id": "",
        "X-Time": timestamp,
        "X-Sign": sign_b64
    }

    response = requests.get(url, headers=headers)

    print(f"Response status code: {response.status_code}")
    print(response.json())