from document_parser import extract_text
from chunker import create_chunks

text = extract_text("C:/Users/Bavagni/Downloads/report.pdf")

chunks = create_chunks(text)

print("Total chunks:", len(chunks))
print("\nFirst chunk:\n")
print(chunks[0])