from docx import Document
doc = Document('docs/support-docs/MyTurn_Project_Report.docx')

# Check around Figure 8 - 'The desk during a test' (page 29)
print('=== Around Figure 8 (para ~350-380) ===')
for i in range(350, 380):
    p = doc.paragraphs[i]
    text = p.text[:100]
    if text.strip():
        print(f'Para {i}: "{text}"')

print()

# Check around Figure 9 - 'Occupancy trial results' (page 29)
print('=== Around Figure 9 (para ~380-410) ===')
for i in range(380, 420):
    p = doc.paragraphs[i]
    text = p.text[:100]
    if text.strip():
        print(f'Para {i}: "{text}"')