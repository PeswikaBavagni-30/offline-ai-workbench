import os
from ollama import Client


OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434")

client = Client(host=OLLAMA_HOST)


def create_embedding(text):
    response = client.embeddings(
        model="nomic-embed-text",
        prompt=text
    )

    return response["embedding"]
