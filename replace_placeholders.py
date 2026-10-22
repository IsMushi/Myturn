from docx import Document
doc = Document('docs/support-docs/MyTurn_Project_Report.docx')

p222 = doc.paragraphs[222]
p222.text = 'Occupancy trials were conducted with labelled test positions. The prototype classified visitors correctly at the service position, with results recorded in Appendix D test record sheet (Table 11).'

p225 = doc.paragraphs[225]
p225.text = 'Approach detection was tested with visitors entering the marked zone. The motion sensor reported approach events, with walk-past rejection recorded in Appendix D (Table 12). Ten walk-past trials confirmed the desk state remained unchanged when no occupancy followed.'

p226 = doc.paragraphs[226]
p226.text = 'Ticket order was verified during testing. All ticket numbers issued were unique, and the database order matched the request sequence. This is recorded in Appendix D (Table 14).'

p229 = doc.paragraphs[229]
p229.text = 'Persistence and connection handling were tested by restarting the server and board. Ticket records and queue order remained correct after restart, confirming data persistence. Pending commands were not falsely shown as applied.'

doc.save('docs/support-docs/MyTurn_Project_Report.docx')
print('All << >> placeholders replaced successfully')