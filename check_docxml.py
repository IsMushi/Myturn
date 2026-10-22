import zipfile
import re

filepath = "docs/support-docs/MyTurn_Project_Report.docx"
with zipfile.ZipFile(filepath, 'r') as z:
    xml_content = z.read('word/document.xml').decode('utf-8', errors='replace')
    
    # Find all drawing/anchor elements with their details
    print("=== wp:anchor elements ===")
    anchors = re.findall(r'<wp:anchor[^>]*>.*?</wp:anchor>', xml_content, re.DOTALL)
    for i, a in enumerate(anchors):
        print(f"\nAnchor {i+1}:")
        # Extract key attributes
        for attr in re.findall(r'(\w+)=["\']([^"\']*)["\']', a):
            print(f"  {attr[0]}: {attr[1]}")
    
    print("\n\n=== Image content part references ===")
    # Find w:drawing elements
    drawings = re.findall(r'<w:drawing[^>]*>.*?</w:drawing>', xml_content, re.DOTALL)
    print(f"Found {len(drawings)} w:drawing elements")
    
    print("\n\n=== w:picture elements ===")
    pictures = re.findall(r'<w:pict[^>]*>.*?</w:pict>', xml_content, re.DOTALL)
    print(f"Found {len(pictures)} w:pict elements")
    
    print("\n\n=== Relationships to images ===")
    # Check r:embed attributes
    embeds = re.findall(r'r:embed=["\']([^"\']*)["\']', xml_content)
    print(f"Found {len(embeds)} r:embed references: {embeds}")