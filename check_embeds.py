import zipfile

filepath = "docs/support-docs/MyTurn_Project_Report.docx"
with zipfile.ZipFile(filepath, 'r') as z:
    # Check part for rId8, rId16, etc.
    print("Checking relationships parts:")
    
    # Read document.xml.rels to get more details
    if 'word/document.xml.rels' in z.namelist():
        rels = z.read('word/document.xml.rels').decode('utf-8', errors='replace')
        print("document.xml.rels:")
        print(rels)
    
    # Check webSettings for images
    if 'word/webSettings.xml' in z.namelist():
        ws = z.read('word/webSettings.xml').decode('utf-8', errors='replace')
        print("\nwebSettings.xml:")
        print(ws[:2000])
    
    # Check footnotes/endnotes
    for name in ['word/footnotes.xml', 'word/endnotes.xml']:
        if name in z.namelist():
            content = z.read(name).decode('utf-8', errors='replace')
            print(f"\n{name} (first 500):")
            print(content[:500])
    
    # List all rId mappings - find where images are stored
    print("\n\nAll parts in docx:")
    for name in sorted(z.namelist()):
        if 'image' in name or 'media' in name or 'rel' in name or 'drawing' in name.lower():
            print(f"  {name}")