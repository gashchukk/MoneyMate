from google.cloud import vision

# Initialize a client
client = vision.ImageAnnotatorClient()

# Load the image
image_path = 'test_silpo.jpg'
with open(image_path, 'rb') as image_file:
    content = image_file.read()

image = vision.Image(content=content)

# Perform text detection
response = client.text_detection(image=image)

# Get detected text
texts = response.text_annotations
for text in texts:
    print(text.description)

with open('test_silpo_google_cloud.txt', 'w', encoding='utf-8') as text_file:
    for text in texts:
        text_file.write(text.description + '\n')