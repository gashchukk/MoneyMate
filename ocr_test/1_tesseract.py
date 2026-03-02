import pytesseract
from PIL import Image

image = Image.open('test_silpo.jpg')
text = pytesseract.image_to_string(image, lang='tessdata/ukr')
with open('test_silpo.txt', 'w', encoding='utf-8') as text_file:
    text_file.write(text)
print(text)