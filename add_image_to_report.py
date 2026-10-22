import zipfile
import os
from docx import Document
from docx.shared import Inches, Pt
from docx.enum.text import WD_PARAGRAPH_ALIGNMENT

filepath = "docs/support-docs/MyTurn_Project_Report.docx"

# Load the document
doc = Document(filepath)

# Add a caption paragraph before the image
p = doc.add_paragraph()
run = p.add_run('Figure 2: MyTurn system architecture')
run.font.size = Pt(10)
run.font.italic = True
p.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER

# Use the MyTurn Service Desk Architecture Diagram.png which is 1.3MB
image_path = "docs/support-docs/assets/MyTurn Service Desk Architecture Diagram.png"

# Check if image exists
if os.path.exists(image_path):
    # Add the image
    doc.add_picture(image_path, width=Inches(6))
    
    # Add another caption
    p = doc.add_paragraph()
    run = p.add_run('*Figure 2: MyTurn system architecture for one service desk*')
    run.font.size = Pt(10)
    run.font.italic = True
    p.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER
    
    # Save the document
    doc.save(filepath)
    print("Image added successfully to report!")
else:
    print(f"Image not found at: {image_path}")
    # Try alternative
    alt_path = "docs/support-docs/assets/myturn-architecture.png"
    if os.path.exists(alt_path):
        print(f"Trying alternative: {alt_path}")
        # Add the alternative image
        p = doc.add_paragraph()
        run = p.add_run('Figure 2: MyTurn system architecture')
        run.font.size = Pt(10)
        run.font.italic = True
        p.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER
        doc.add_picture(alt_path, width=Inches(6))
        p = doc.add_paragraph()
        run = p.add_run('*Figure 2: MyTurn system architecture for one service desk*')
        run.font.size = Pt(10)
        run.font.italic = True
        p.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER
        doc.save(filepath)
        print("Alternative image added successfully!")