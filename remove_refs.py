from docx import Document
doc = Document('docs/support-docs/MyTurn_Project_Report.docx')

reference = 'Full source code available in repository: firmware/myturn_desk/myturn_desk.ino, api/routes/*.py, api/schema.sql'

# Remove existing reference paragraphs at wrong locations
# (Paragraphs 395, 660, 685, 686)
for idx in [686, 685, 660, 395]:
    if idx < len(doc.paragraphs):
        p = doc.paragraphs[idx]
        p_element = p._element
        p_element.getparent().remove(p_element)
        print('Removed reference paragraph at index %d' % idx)

doc.save('docs/support-docs/MyTurn_Project_Report.docx')
print('Removed old reference paragraphs')
print('Total paragraphs now: %d' % len(doc.paragraphs))