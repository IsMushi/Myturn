from docx import Document
doc = Document('docs/support-docs/MyTurn_Project_Report.docx')

# Search for empty paragraphs that might be image placeholders
# especially around the figures listed in the LoF
print('=== Empty paragraphs near figure areas ===')
empty_count = 0
for i, p in enumerate(doc.paragraphs):
    text = p.text.strip()
    if not text:
        # Check if this is in a relevant area
        # Figures are discussed in various sections
        # LoF says Figure 1 is on page 18, Figure 2 on page 19, etc.
        # Let's check around the results section and appendices
        if 200 <= i <= 250 or 300 <= i <= 350 or 550 <= i <= 600:
            empty_count += 1
            if empty_count <= 15:
                print(f'Para {i}: (empty)')

print(f'\\nTotal empty paragraphs in relevant ranges: {empty_count}')

# Also check paragraphs with only a single word or very short text
print('\\n=== Short paragraphs (1-10 chars) ===')
short_count = 0
for i, p in enumerate(doc.paragraphs):
    text = p.text.strip()
    if text and len(text) <= 10:
        short_count += 1
        if short_count <= 20:
            print(f'Para {i}: "{text}"')
print(f'Total short paragraphs: {short_count}')