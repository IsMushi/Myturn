from docx import Document
doc = Document('docs/support-docs/MyTurn_Project_Report.docx')

# Check for remaining [space for the image] placeholders
count = 0
for i, p in enumerate(doc.paragraphs):
    if '[space for the image' in p.text:
        count += 1
        print('Remaining para %d: %s' % (i, p.text[:80]))
print('Total [space for the image] placeholders: %d' % count)

# Check [number] placeholders
num_count = 0
for p in doc.paragraphs:
    if '[number]' in p.text:
        num_count += 1
print('[number] placeholders: %d' % num_count)

# Document stats
print('Document stats:')
print('Total paragraphs: %d' % len(doc.paragraphs))
print('Total tables: %d' % len(doc.tables))