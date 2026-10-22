import zipfile

filepath = "docs/support-docs/MyTurn_Project_Report.docx"
with zipfile.ZipFile(filepath, 'r') as z:
    # Read document.xml fully
    xml_content = z.read('word/document.xml').decode('utf-8', errors='replace')
    print("document.xml - looking for image references:")
    
    # Find all image references
    import re
    # Find w:drawing or wp:anchor elements
    drawings = re.findall(r'<wp:anchor[^>]*>', xml_content)
    print(f"Found {len(drawings)} wp:anchor elements")
    
    # Find image URIs
    image_uris = re.findall(r'uri="([^"]+)"', xml_content)
    print(f"Found {len(image_uris)} uri references")
    
    # Print first 20 uri references
    print("\nUri references (first 20):")
    for uri in image_uris[:20]:
        print(f"  {uri}")
    
    # Check media folder
    print("\n\nMedia files in docx:")
    for name in z.namelist():
        if 'media' in name:
            print(f"  {name}")