import zipfile
import os

filepath = "docs/support-docs/MyTurn_Project_Report.docx"
with zipfile.ZipFile(filepath, 'r') as z:
    print("Files in docx:")
    for name in z.namelist():
        print(f"  {name}")
    print()
    
    # Read document.xml
    if 'word/document.xml' in z.namelist():
        xml_content = z.read('word/document.xml').decode('utf-8', errors='replace')
        print("document.xml (first 3000 chars):")
        print(xml_content[:3000])