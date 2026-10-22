from docx import Document
from docx.shared import Inches
import zipfile

filepath = "docs/support-docs/MyTurn_Project_Report.docx"
doc = Document(filepath)

# Check the zip for images
with zipfile.ZipFile(filepath, 'r') as z:
    media_files = [n for n in z.namelist() if 'media' in n]
    print(f"Images in docx: {media_files}")
    print()

# Check all paragraphs that have "Figure" in them
print("=== Paragraphs with 'Figure' ===")
for i, p in enumerate(doc.paragraphs):
    if 'Figure' in p.text:
        # Also check if there's an image inline
        # Look at the paragraph's inline shapes
        print(f'Para {i}: "{p.text[:100]}"')
        # Check runs for image references
        for run in p.runs:
            # runs can have image inline
            pass

print()

# Check document.xml for drawing/anchor elements that are figures
xml = z.read('word/document.xml').decode('utf-8', errors='replace')
import re
# Find all wp:anchor elements (inline/floating images)
anchors = re.findall(r'<wp:anchor[^>]*>.*?</wp:anchor>', xml, re.DOTALL)
print(f"\\nTotal wp:anchor elements: {len(anchors)}")

# Show first few anchors with their names
for i, a in enumerate(anchors[:10]):
    # Extract the name if present
    name_match = re.search(r'name="([^"]*)"', a)
    name = name_match.group(1) if name_match else "no name"
    print(f'Anchor {i+1}: name="{name}"')