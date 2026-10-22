from docx import Document
doc = Document('docs/support-docs/MyTurn_Project_Report.docx')

reference = 'Full source code available in repository: firmware/myturn_desk/myturn_desk.ino, api/routes/*.py, api/schema.sql'

# Check Para 660
p = doc.paragraphs[660]
print('Para 660 text (first 80): %s' % p.text[:80])

# Update Para 660 with the reference
p.text = reference + ' ' + p.text

# Verify
for i, p in enumerate(doc.paragraphs):
    if reference in p.text:
        print('Para %d has the reference' % i)

print('Done')