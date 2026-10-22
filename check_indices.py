from docx import Document
doc = Document('docs/support-docs/MyTurn_Project_Report.docx')

# Check for remaining [space for the image] placeholders
count = 0
for i, p in enumerate(doc.paragraphs):
    if '[space for the image' in p.text:
        count += 1
        print(f'Remaining para {i}: {p.text[:80]}')
print(f'Total [space for the image] placeholders: {count}')

# Show all paragraphs from 310 to 325
for i in range(310, 325):
    if i < len(doc.paragraphs):
        p = doc.paragraphs[i]
        text = p.text[:80].replace('\n', ' ')
        print(f'Para {i}: "{text}"')