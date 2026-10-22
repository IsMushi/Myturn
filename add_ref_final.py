from docx import Document
from docx.shared import Pt
doc = Document('docs/support-docs/MyTurn_Project_Report.docx')

reference = 'Full source code available in repository: firmware/myturn_desk/myturn_desk.ino, api/routes/*.py, api/schema.sql'

# Add Appendix A reference paragraph at end
p1 = doc.add_paragraph()
run1 = p1.add_run(reference)
run1.font.size = Pt(10)
print('Added Appendix A reference paragraph')

# Add Appendix B reference paragraph
p2 = doc.add_paragraph()
run2 = p2.add_run(reference)
run2.font.size = Pt(10)
print('Added Appendix B reference paragraph')

# Add Appendix C reference paragraph
p3 = doc.add_paragraph()
run3 = p3.add_run(reference)
run3.font.size = Pt(10)
print('Added Appendix C reference paragraph')

# Appendix D reference already at Para 660 (verified earlier)

doc.save('docs/support-docs/MyTurn_Project_Report.docx')
print('Added 3 reference paragraphs')
print('Total paragraphs: %d' % len(doc.paragraphs))