import struct
import os

filepath = "docs/support-docs/MyTurn_Project_Report.docx"
with open(filepath, "rb") as f:
    data = f.read()

print("File size:", len(data))
print("First 50 bytes hex:", data[:50].hex())
print()

# Check for common docx patterns
checks = [
    (b"document.xml", "document.xml"),
    (b"docProps", "docProps"),
    (b"[Content_Types]", "[Content_Types]"),
    (b"image", "image reference"),
    (b"png", "png"),
    (b"jpeg", "jpeg"),
    (b"gif", "gif"),
]
for pattern, desc in checks:
    count = data.lower().count(pattern.lower()) if isinstance(pattern, bytes) else 0
    print(f"Contains {desc}: {count} occurrences")

# List all files in word/media folder if it exists
media_dir = os.path.join(os.path.dirname(filepath), "word", "media")
if os.path.exists(media_dir):
    print("\nFiles in word/media:")
    for f in sorted(os.listdir(media_dir)):
        print(f"  {f} - {os.path.getsize(os.path.join(media_dir, f))} bytes")
else:
    print("\nNo word/media folder found")

# List relationships
rels_path = os.path.join(os.path.dirname(filepath), "word", "_rels", ".rels")
if os.path.exists(rels_path):
    print("\nRelationships:")
    with open(rels_path, "r") as f:
        print(f.read())