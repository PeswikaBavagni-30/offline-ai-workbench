import os
from ollama import Client

from backend.embedding import create_embedding
from backend.vector_store import search_chunks


OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434")

client = Client(host=OLLAMA_HOST)


def answer_question(question):
    query_embedding = create_embedding(question)

    results = search_chunks(query_embedding)

    context = "\n".join(results["documents"][0])

    prompt = f"""
Use the following SRS context to answer the question.

SRS Context:
{context}

Question:
{question}

Answer based only on the provided SRS context.
"""

    response = client.chat(
        model="qwen3:4b",
        options={
            "think": False
        },
        messages=[
            {
                "role": "user",
                "content": prompt
            }
        ]
    )

    return response.message.content
