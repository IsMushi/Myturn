from docx import Document
doc = Document('docs/support-docs/MyTurn_Project_Report.docx')

print('=== Checking appendix paragraph locations ===')
print()

# Check various paragraph locations
ranges = [
    ('Appendix A firmware', 278, 395),
    ('Appendix B Flask routes', 397, 517),
    ('Appendix C DB schema', 517, 571),
    ('Appendix D test sheet', 659, 670),
]

for name, start, end in ranges:
    print('=== %s (paras %d-%d) ===' % (name, start, end))
    for i in range(start, min(end+1, len(doc.paragraphs))):
        p = doc.paragraphs[i]
        text = p.text[:60].replace('\n', ' ')
        if p.text.strip():
            print('  Para %d: "%s"' % (i, text))
    print()

# Also show the appendix markers we found earlier
print('=== Appendix markers ===')
for i, p in enumerate(doc.paragraphs):
    text = p.text.strip()
    if 'Appendix' in text:
        print('Para %d: "%s"' % (i, text[:80]))