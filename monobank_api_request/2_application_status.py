import requests
import base64
import time
import ecdsa
import hashlib

# Monobank open API for providers - check reg.status
# Docs - https://api.monobank.ua/docs/corporate.html#tag/Avtorizaciya-ta-nalashtuvannya-kompaniyi/paths/~1personal~1auth~1registration~1status/post
# POST https://api.monobank.ua/personal/auth/registration/status

if __name__ == '__main__':
    resource = '/personal/auth/registration/status'
    url = f'https://api.monobank.ua{resource}'

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

    # PUBLIC KEY
    with open('public.key', 'rb') as public_key_file:
        public_key_encoded = base64.b64encode(public_key_file.read())

    request_data = {
        "pubkey": public_key_encoded.decode()
    }

    headers = {
        "X-Time": timestamp,
        "X-Sign": sign_b64
    }

    response = requests.post(url, headers=headers, json=request_data)
    response = response.json()
    print(response)
    if response['status'] == "Approved":
        with open('key_id.txt', 'w') as key_id_file:
            key_id_file.write(response['keyId'])
        print("Registration approved. Key ID saved to key_id.txt.")
    else:
        print("Registration not approved. Response:")
    print(f'Response status code: {response.status_code}')
    print(response)