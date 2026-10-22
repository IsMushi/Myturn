import zipfile
import os

filepath = "docs/support-docs/MyTurn_Project_Report.docx"
with zipfile.ZipFile(filepath, 'r') as z:
    # Read full document.xml
    xml_content = z.read('word/document.xml').decode('utf-8', errors='replace')
    
    # Print all text content (strip tags)
    print("=== Document text content ===")
    # Simple text extraction - remove XML tags
    import re
    text = re.sub(r'<[^>]+>', ' ', xml_content)
    text = re.sub(r'\s+', ' ', text)
    print(text[:5000])