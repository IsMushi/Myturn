from docx import Document
doc = Document('docs/support-docs/MyTurn_Project_Report.docx')

full_text = ''
for p in doc.paragraphs:
    full_text += p.text + ' '

firmware_keywords = ['WiFi', 'HTTPClient', 'pulseIn', 'measureCm', 'medianCm', 'OCCUPIED_CM', 'setup', 'loop']
api_keywords = ['Flask', 'sqlite3', 'create table', 'insert into', 'device_key_hash']

for kw in firmware_keywords:
    count = full_text.count(kw)
    print('Firmware "%s": %d occurrences' % (kw, count))

for kw in api_keywords:
    count = full_text.count(kw)
    print('API "%s": %d occurrences' % (kw, count))