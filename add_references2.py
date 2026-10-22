from docx import Document
from docx.shared import Pt
doc = Document('docs/support-docs/MyTurn_Project_Report.docx')

reference_text = "Full source code available in repository: firmware/myturn_desk/myturn_desk.ino, api/routes/*.py, api/schema.sql"

# Add reference paragraph at the end of the document
p = doc.add_paragraph()
run = p.add_run(reference_text)
run.font.size = Pt(10)

# Also try to add within Appendix A section
# Appendix A content is around paras 278-395
# Let me add the reference after the firmware sketch, before section 4.5
# Para 394 is "4.5 Implementation" - let me add the reference there

if len(doc.paragraphs) > 394:
    p = doc.paragraphs[394]
    # Insert the reference before the existing text
    # Actually, let me just add a new paragraph after paragraph 394
    # But easier: replace paragraph 395's text with the reference followed by original text
    
    if len(doc.paragraphs) > 395:
        p395 = doc.paragraphs[395]
        p395.text = reference_text + '\n' + p395.text
        print('Updated para 395 with Appendix A reference')

# Appendices B, C, D - let me find their end paragraphs
# Appendix B ends around 485-517
# Let me check para 516-520
for i in range(515, 525):
    if i < len(doc.paragraphs):
        p = doc.paragraphs[i]
        text = p.text[:50]
        if 'schema' in text.lower() or 'Database' in text or 'SQL' in text:
            # This is likely Appendix C area
            if len(doc.paragraphs) > i + 1:
                p_next = doc.paragraphs[i + 1]
                p_next.text = reference_text + '\n' + p_next.text
                print('Updated para %d with Appendix C reference' % (i + 1))
                break

# Appendix D - test record sheet, around paras 659+
# Let me check para 660+
for i in range(655, 670):
    if i < len(doc.paragraphs):
        p = doc.paragraphs[i]
        text = p.text[:50]
        if 'test' in text.lower() or 'record' in text.lower():
            if len(doc.paragraphs) > i + 1:
                p_next = doc.paragraphs[i + 1]
                p_next.text = reference_text + '\n' + p_next.text
                print('Updated para %d with Appendix D reference' % (i + 1))
                break

# Also add a general reference paragraph at the very end
p = doc.add_paragraph()
run = p.add_run(reference_text)
run.font.size = Pt(10)

doc.save('docs/support-docs/MyTurn_Project_Report.docx')
print('References added to appendices A, C, D')
print('Total paragraphs: %d' % len(doc.paragraphs))