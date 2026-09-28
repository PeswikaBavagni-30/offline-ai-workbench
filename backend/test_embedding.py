from embedding import create_embedding

vector = create_embedding("The system shall allow users to reset their password.")

print("Vector length:", len(vector))
print("First 5 values:", vector[:5])