from docx import Document
doc = Document('docs/support-docs/MyTurn_Project_Report.docx')

# Check for remaining [space for the image] placeholders
count = 0
for i, p in enumerate(doc.paragraphs):
    if '[space for the image' in p.text:
        count += 1
        print(f'Remaining para {i}: {p.text[:80]}')
print(f'Total [space for the image] placeholders: {count}')

# Show paragraphs around the figures
print()
for i in [303, 305, 307, 317, 321]:
    if i < len(doc.paragraphs):
        p = doc.paragraphs[i]
        print(f'Para {i}: "{p.text[:80]}"')