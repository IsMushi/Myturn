from docx import Document
doc = Document('docs/support-docs/MyTurn_Project_Report.docx')

# Remove the two remaining placeholder paragraphs at indices 315 and 318
# Remove from bottom up to avoid index shifting
for idx in [318, 315]:
    if idx < len(doc.paragraphs):
        p = doc.paragraphs[idx]
        p_element = p._element
        p_element.getparent().remove(p_element)
        print(f'Removed placeholder paragraph at index {idx}')

doc.save('docs/support-docs/MyTurn_Project_Report.docx')
print('Remaining placeholders removed successfully')