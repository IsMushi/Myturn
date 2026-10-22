from docx import Document
doc = Document('docs/support-docs/MyTurn_Project_Report.docx')

reference_text = "Full source code available in repository: firmware/myturn_desk/myturn_desk.ino, api/routes/*.py, api/schema.sql"

# Appendix B: around paras 485-520
# Find paragraph with API routes content
for i in range(485, 520):
    p = doc.paragraphs[i]
    text = p.text[:80]
    if text.strip() and ('API' in text or 'route' in text.lower() or 'Flask' in text):
        print('Found API content at Para %d: "%s"' % (i, text))
        # Update the next paragraph
        if i + 1 < len(doc.paragraphs):
            p_next = doc.paragraphs[i + 1]
            p_next.text = reference_text + '\n' + p_next.text
            print('Updated para %d with Appendix B reference' % (i + 1))
            break

# Also add a general reference at the end
p = doc.add_paragraph()
run = p.add_run(reference_text)
run.font.size = Pt(10)

doc.save('docs/support-docs/MyTurn_Project_Report.docx')
print('Appendix B reference added')
print('Total paragraphs: %d' % len(doc.paragraphs))