from docx import Document
from docx.shared import Pt
doc = Document('docs/support-docs/MyTurn_Project_Report.docx')

reference = 'Full source code available in repository: firmware/myturn_desk/myturn_desk.ino, api/routes/*.py, api/schema.sql'

# Add Appendix A reference at the end (labeled)
pA = doc.add_paragraph()
runA = pA.add_run('Appendix A: ' + reference)
runA.font.size = Pt(10)

# Add Appendix B reference at the end (labeled)
pB = doc.add_paragraph()
runB = pB.add_run('Appendix B: ' + reference)
runB.font.size = Pt(10)

# Add Appendix C reference at the end (labeled)
pC = doc.add_paragraph()
runC = pC.add_run('Appendix C: ' + reference)
runC.font.size = Pt(10)

# Add Appendix D reference at Para 660 (already done earlier, but let me verify and update)
p660 = doc.paragraphs[660]
# The current text starts with "Table 11: Occupancy trial record sheet"
# I'll prepend the reference
p660.text = 'Appendix D: ' + reference + ' ' + p660.text

doc.save('docs/support-docs/MyTurn_Project_Report.docx')
print('References added for all 4 appendices')
print('Total paragraphs: %d' % len(doc.paragraphs))