from docx import Document
doc = Document('docs/support-docs/MyTurn_Project_Report.docx')

# Check for Figure 2 - use cases
print('=== Looking for Figure 2 (use cases) ===')
for i in range(95, 135):
    p = doc.paragraphs[i]
    text = p.text[:80]
    if 'use case' in text.lower() or 'Use case' in text:
        print(f'Para {i}: "{text}"')

print()

# Check for Figure 5 (wiring/circuit)
print('=== Looking for Figure 5 (wiring/circuit) ===')
for i in range(380, 420):
    p = doc.paragraphs[i]
    text = p.text[:80]
    if 'wiring' in text.lower() or 'circuit' in text.lower() or 'Figure 5' in text:
        print(f'Para {i}: "{text}"')