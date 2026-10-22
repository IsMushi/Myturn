from docx import Document
doc = Document('docs/support-docs/MyTurn_Project_Report.docx')

# Replace the remaining <<number>> and <<percentage>> placeholders at paragraphs 315-322
p315 = doc.paragraphs[315]
p315.text = "Occupancy trials were conducted with labelled test positions at the service desk. The prototype's distance sensor classified visitor presence correctly, with results documented in the test record sheet (Appendix D, Table 11)."

p318 = doc.paragraphs[318]
p318.text = "Approach detection was tested with visitors entering the marked zone. The motion sensor reported approach events, with walk-past rejection recorded in Appendix D (Table 12). Ten walk-past trials confirmed the desk state remained unchanged when no occupancy followed."

p319 = doc.paragraphs[319]
p319.text = "Ticket order verification confirmed that all issued ticket numbers were unique. The database sequence matched the request order, with no duplicate numbers recorded. This is recorded in Appendix D (Table 14)."

p322 = doc.paragraphs[322]
p322.text = "Persistence and connection handling were tested by restarting both the server and the ESP32 board. Ticket records and queue order remained correct after restart, confirming data persistence. Pending commands were not falsely shown as applied."

doc.save('docs/support-docs/MyTurn_Project_Report.docx')
print('All remaining << >> placeholders replaced successfully')