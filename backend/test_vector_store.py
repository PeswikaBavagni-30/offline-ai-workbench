from document_parser import extract_text
from chunker import create_chunks
from embedding import create_embedding
from vector_store import add_chunk

text = extract_text("C:/Users/Bavagni/Downloads/report.pdf")

chunks = create_chunks(text)

embedding = create_embedding(chunks[0])

for i, chunk in enumerate(chunks):
    embedding = create_embedding(chunk)
    add_chunk(f"chunk_{i}", chunk, embedding)

print("All chunks stored successfully!")