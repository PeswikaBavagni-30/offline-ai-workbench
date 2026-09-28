from embedding import create_embedding
from vector_store import search_chunks

question = "What is this system about?"

query_embedding = create_embedding(question)

results = search_chunks(query_embedding)

context = "\n".join(results["documents"][0])

print(context)