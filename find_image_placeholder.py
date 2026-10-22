from docx import Document
doc = Document('docs/support-docs/MyTurn_Project_Report.docx')

# Find paragraphs that are just empty or have image-related formatting
# Look for paragraphs with special content that might be image placeholders
for i, p in enumerate(doc.paragraphs):
    text = p.text.strip()
    # Check for paragraphs that might be image captions or placeholders
    if text and len(text) < 30:
        # Check if it looks like a caption
        if any(word in text.lower() for word in ['figure', 'table', 'image', 'diagram', 'photo']):
            print(f'Para {i}: "{text}"')

# Also check for tables that might have image cells or placeholders
print()
print('Tables:')
for t_idx, table in enumerate(doc.tables):
    print(f'Table {t_idx}: {len(table.rows)} rows x {len(table.columns)} cols')
    # Check first cell of first row
    if table.rows and table.rows[0].cells:
        cell_text = table.rows[0].cells[0].text.strip()
        if cell_text and len(cell_text) < 50:
            print(f'  First cell: "{cell_text}"')