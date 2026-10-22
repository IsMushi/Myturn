import os

filepath = "docs/support-docs/MyTurn_Project_Report.docx"

# List word directory structure
word_dir = os.path.join(os.path.dirname(filepath), "word")
if os.path.exists(word_dir):
    print("word/ directory contents:")
    for root, dirs, files in os.walk(word_dir):
        level = root.replace(word_dir, "").count(os.sep)
        indent = " " * 2 * level
        print(f"{indent}{os.path.basename(root)}/")
        subindent = " " * 2 * (level + 1)
        for file in files:
            print(f"{subindent}{file}")
    print()

# Check _rels
rels_dir = os.path.join(word_dir, "_rels")
if os.path.exists(rels_dir):
    print("_rels/ contents:")
    for f in os.listdir(rels_dir):
        print(f"  {f}")
    print()

# Check document.xml.rels
rels_path = os.path.join(word_dir, "document.xml.rels")
if os.path.exists(rels_path):
    print("document.xml.rels:")
    with open(rels_path, "r") as f:
        print(f.read())

# Check _rels/.rels
main_rels = os.path.join(rels_dir, ".rels") if os.path.exists(os.path.join(rels_dir, ".rels")) else None
if main_rels and os.path.exists(main_rels):
    print("_rels/.rels:")
    with open(main_rels, "r") as f:
        print(f.read())