import zipfile

filepath = "docs/support-docs/MyTurn_Project_Report.docx"
with zipfile.ZipFile(filepath, 'r') as z:
    # Read document.xml.rels
    if 'word/document.xml.rels' in z.namelist():
        rels_content = z.read('word/document.xml.rels').decode('utf-8', errors='replace')
        print("document.xml.rels:")
        print(rels_content)
    print()
    
    # Read _rels/.rels
    if '_rels/.rels' in z.namelist():
        main_rels = z.read('_rels/.rels').decode('utf-8', errors='replace')
        print("_rels/.rels:")
        print(main_rels)