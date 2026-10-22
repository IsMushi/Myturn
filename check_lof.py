from docx import Document
doc = Document('docs/support-docs/MyTurn_Project_Report.docx')

# Check the List of Figures section
print('=== List of Figures (around para 140) ===')
for i in range(135, 155):
    p = doc.paragraphs[i]
    print(f'Para {i}: "{p.text[:100]}"')

print()

# Check around the results section for image placeholders
print('=== Results section (paras 220-235) ===')
for i in range(220, 245):
    p = doc.paragraphs[i]
    print(f'Para {i}: "{p.text[:100]}"')