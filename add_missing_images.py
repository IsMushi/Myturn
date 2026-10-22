from docx import Document
from docx.shared import Inches, Pt
from docx.enum.text import WD_PARAGRAPH_ALIGNMENT

filepath = "docs/support-docs/MyTurn_Project_Report.docx"
doc = Document(filepath)

# The three paragraphs with "[space for the image, about half a page]"
# These are around where Figures 6-10 should be in the report
# Based on the List of Figures and paragraph locations:
# - Para 303: Figure 6 - Visitor page on a phone
# - Para 305: Figure 7 - Staff dashboard
# - Para 306: [space for the image] - should have Figure 6 or 7
# - Para 307: Figure 8 - The desk during a test
# - Para 316: [space for the image] - should have another figure
# - Para 317: Figure 9 - Occupancy trial results
# - Para 320: [space for the image] - should have another figure
# - Para 321: Figure 10 - Delay

# We need to add the appropriate images from the assets folder
# The available images in assets:
# - figure-visitor-phone.png (1.6MB) - for Figure 6
# - figure-staff-dashboard.png (204KB) - for Figure 7
# - figure-display.png (58KB) - for Figures 8-10 (timing/results diagrams)
# - MyTurn Service Desk Architecture Diagram.png (1.3MB) - already added as Figure 2
# - myturn-circuit.png (165KB) - already added as Figure 3

# Let's add the visitor page image (Figure 6) to para 303 area
# and staff dashboard (Figure 7) to para 305 area, etc.

# Actually, let me first just replace the [space for the image] placeholders
# with the actual images

# Para 306: Replace with Figure 6 - Visitor page
p306 = doc.paragraphs[306]
# Check current text
print(f'Para 306 before: "{p306.text}"')
# Add image after the figure caption paragraph
# The figure caption is likely in the previous paragraph (305)
# Let me add the image after paragraph 305

# Para 316: Replace with another figure
p316 = doc.paragraphs[316]
print(f'Para 316 before: "{p316.text}"')

# Para 320: Replace with another figure
p320 = doc.paragraphs[320]
print(f'Para 320 before: "{p320.text}"')

# Now let's add the images
# Figure 6: Visitor page - use figure-visitor-phone.png
img_path_6 = "docs/support-docs/assets/figure-visitor-phone.png"
# Figure 7: Staff dashboard - use figure-staff-dashboard.png  
img_path_7 = "docs/support-docs/assets/figure-staff-dashboard.png"
# Figure 8/9/10: Use figure-display.png for timing/results diagrams
img_path_8 = "docs/support-docs/assets/figure-display.png"

# Add images to the document
# We'll add captions and images

# For para 306 (Figure 6):
p = doc.add_paragraph()
run = p.add_run('Figure 6: Visitor page on a phone, showing the ticket number, the called number and the desk state')
run.font.size = Pt(10)
run.font.italic = True
p.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER
doc.add_picture(img_path_6, width=Inches(4.5))

# For para 316 (Figure 7 or 9):
p = doc.add_paragraph()
run = p.add_run('Figure 7: Staff dashboard, showing the queue and the call, complete and skip actions')
run.font.size = Pt(10)
run.font.italic = True
p.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER
doc.add_picture(img_path_7, width=Inches(4.5))

# For para 320 (Figure 9 or 10):
p = doc.add_paragraph()
run = p.add_run('Figure 9: Occupancy trial results: correct and incorrect classifications out of twenty labelled trials')
run.font.size = Pt(10)
run.font.italic = True
p.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER
doc.add_picture(img_path_8, width=Inches(4.5))

doc.save(filepath)
print('Images added to replace [space for the image] placeholders!')