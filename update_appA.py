from docx import Document
doc = Document('docs/support-docs/MyTurn_Project_Report.docx')

# Collect current appendix A content (para 278 to ~395)
current_appA = ''
for i in range(278, 396):
    p = doc.paragraphs[i]
    if p.text.strip():
        current_appA += p.text + '\n'

print('Current Appendix A size: %d chars' % len(current_appA))
print('Actual firmware size: %d chars' % len(open('firmware/myturn_desk/myturn_desk.ino').read()))

# Find Appendix A marker
for i, p in enumerate(doc.paragraphs):
    text = p.text.strip()
    if 'Appendix A' in text:
        print('Appendix A marker at Para %d: %s' % (i, text[:80]))