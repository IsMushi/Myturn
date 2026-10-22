from docx import Document
doc = Document('docs/support-docs/MyTurn_Project_Report.docx')

reference = 'Full source code available in repository: firmware/myturn_desk/myturn_desk.ino, api/routes/*.py, api/schema.sql'

# Check all paragraphs
for i, p in enumerate(doc.paragraphs):
    if reference in p.text:
        print('Para %d HAS the reference' % i)

# Also check Para 660 specifically
p660 = doc.paragraphs[660]
print()
print('Para 660 text starts with: "%s"' % p660.text[:60])
print('Para 660 full text (first 150): %s' % p660.text[:150])
"