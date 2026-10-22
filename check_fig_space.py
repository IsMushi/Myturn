from docx import Document
doc = Document('docs/support-docs/MyTurn_Project_Report.docx')

# Check paragraphs around where figures are referenced
# Focus on the main body sections where figures 1-10 should be

# Section 4.7 Results (around paras 245-280)
print('=== Section 4.7 Results (paras 245-280) ===')
for i in range(245, 285):
    p = doc.paragraphs[i]
    text = p.text[:120].replace('\n', ' ')
    if text.strip():
        print(f'Para {i}: "{text}"')
    else:
        print(f'Para {i}: [EMPTY]')

print()

# Section 4.4 Occupancy and Approach Detection (around paras 69-85)
print('=== Section 4.4 (paras 69-90) ===')
for i in range(69, 95):
    p = doc.paragraphs[i]
    text = p.text[:120].replace('\n', ' ')
    if text.strip():
        print(f'Para {i}: "{text}"')
    else:
        print(f'Para {i}: [EMPTY]')

print()

# Check for any paragraph that has image anchoring indicator
# Look at paragraph format/style
print('=== Paragraphs with image-relevant styles ===')
for i, p in enumerate(doc.paragraphs):
    # Check if paragraph has any formatting that suggests image
    # Like being centered, or having specific style
    style_name = p.style.name if p.style else 'None'
    text = p.text[:60].replace('\n', ' ')
    if len(text) > 5 and ('fig' in text.lower() or 'diagram' in text.lower() or 'image' in text.lower()):
        print(f'Para {i} ({style_name}): "{text}"')