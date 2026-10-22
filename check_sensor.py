from docx import Document
doc = Document('docs/support-docs/MyTurn_Project_Report.docx')

# Search for sensor-related content
sensor_keywords = ['sensor', 'HC-SR04', 'HC-SR501', 'ultrasonic', 'PIR', 'occupancy', 'approach']
found = []
for i, p in enumerate(doc.paragraphs):
    text = p.text.lower()
    for kw in sensor_keywords:
        if kw in text:
            found.append((i, p.text[:100]))
            break

print(f"Found {len(found)} sensor-related paragraphs")
for idx, text in found[:20]:
    print(f'Para {idx}: {text}')