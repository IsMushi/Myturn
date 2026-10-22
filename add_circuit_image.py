import zipfile
import os
from docx import Document
from docx.shared import Inches, Pt
from docx.enum.text import WD_PARAGRAPH_ALIGNMENT

filepath = "docs/support-docs/MyTurn_Project_Report.docx"
doc = Document(filepath)

# Add circuit diagram section before Appendix A
# Add a paragraph with caption
p = doc.add_paragraph()
run = p.add_run('Figure 3: MyTurn circuit diagram with sensors')
run.font.size = Pt(10)
run.font.italic = True
p.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER

# Add the circuit diagram image - myturn-circuit.png shows ESP32 with ultrasonic and PIR sensors
image_path = "docs/support-docs/assets/myturn-circuit.png"

if os.path.exists(image_path):
    doc.add_picture(image_path, width=Inches(6))
    
    # Add caption
    p = doc.add_paragraph()
    run = p.add_run('*Figure 3: MyTurn circuit diagram with HC-SR04 ultrasonic and HC-SR501 PIR sensors*')
    run.font.size = Pt(10)
    run.font.italic = True
    p.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER
    
    doc.save(filepath)
    print("Circuit diagram image added to report!")
else:
    print(f"Image not found at: {image_path}")