import chromadb
client=chromadb.PersistentClient(path="chroma_db")
collection=client.get_or_create_collection(name="src_documents")
def add_chunk(chunk_id, text, embedding):
    collection.add(
        ids=[chunk_id],
        documents=[text],
        embeddings=[embedding]
    )
def search_chunks(query_embedding, n_results=3):
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=n_results
    )

    return results