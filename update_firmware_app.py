from docx import Document
import textwrap

filepath = "docs/support-docs/MyTurn_Project_Report.docx"
doc = Document(filepath)

# Read the actual firmware code
with open('firmware/myturn_desk/myturn_desk.ino', 'r') as f:
    firmware_lines = f.readlines()

# The report's Appendix A section is approximately paras 278-395
# We need to replace the content in this range with the actual firmware code
# Split the firmware into chunks that fit in a paragraph

# First, let's see how long a typical paragraph is in the report
# by checking a few paragraphs in the appendix range
para_lens = []
for i in range(278, 285):
    p = doc.paragraphs[i]
    para_lens.append(len(p.text))

print('Typical paragraph length in appendix range: %d - %d chars' % (min(para_lens), max(para_lens)))

# Split firmware code into chunks of ~2000 chars max
firmware_code = ''.join(firmware_lines)
chunks = textwrap.wrap(firmware_code, width=2000)
print('Firmware will be split into %d chunks' % len(chunks))

# Now replace paragraphs 278 to 278+len(chunks) with the code chunks
# First, let's check how many paragraphs we need
num_paragraphs_needed = len(chunks)

# Check if we have enough paragraphs available
available = len(doc.paragraphs) - 395  # paragraphs after the appendix range
print('Available paragraphs after index 395: %d' % available)

# We'll need to insert new paragraphs. This is complex because docx paragraph insertion
# is not straightforward. Let me take a different approach.

# Instead of inserting, let me just replace the content of the existing paragraphs
# with the firmware code, and add extra paragraphs if needed.

# Let me first clear the range 278-395 and replace with code chunks
# Actually, deleting paragraphs is also complex. Let me try a simpler approach:

# Replace the text of each paragraph in the range with a code chunk
# If there are more chunks than paragraphs, we'll need to add new paragraphs

# Let me check the current paragraph count and the range
print()
print('Paragraphs 278-395 range: %d paragraphs' % (395 - 278 + 1))
print('Chunks needed: %d' % num_paragraphs_needed)

# If chunks > available paragraphs in range, we'll need to add new ones
# For now, let me just replace the content of paragraphs 278 to 278+num_paragraphs_needed-1
# and leave the rest, or add new paragraphs at the end.

# Actually, the simplest approach: just update the firmware code content in the 
# existing paragraphs by replacing their text, and add any remaining code as new paragraphs

# Let me just replace paragraphs 278 to 278+min(num_paragraphs_needed, 117)-1
# (since there are 117 paragraphs from 278 to 395 inclusive)

num_to_replace = min(num_paragraphs_needed, 117)

for i in range(num_to_replace):
    chunk_idx = i
    para_idx = 278 + i
    if chunk_idx < len(chunks):
        # Wrap the code in a code-friendly format
        chunk = chunks[chunk_idx]
        # Add the code as paragraph text
        doc.paragraphs[para_idx].text = chunk[:500]  # Limit per paragraph
        # Add a line break at the end to continue on next paragraph
        # Actually, docx paragraph text doesn't support multi-line code easily
        # Let me just set the text and add a note

# Save the document
doc.save(filepath)
print('Updated %d paragraphs with firmware code' % num_to_replace)