from ollama import embeddings

def create_embedding(text):
    response = embeddings(
        model="nomic-embed-text",
        prompt=text
    )

    return response["embedding"]