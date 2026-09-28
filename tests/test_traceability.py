from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_generate_traceability_validation():
    response = client.post("/generate-traceability", json={"requirements": "", "code": "", "tests": ""})
    assert response.status_code == 422


@patch("backend.main.chat")
def test_generate_traceability_valid_payload(mock_chat):
    mock_msg = MagicMock()
    mock_msg.content = "| REQ-001 | Add | add() | test_add() | Covered |"
    mock_chat.return_value.message = mock_msg

    payload = {
        "requirements": "REQ-001: The system must add two numbers.",
        "code": "def add(a, b): return a + b",
        "tests": "def test_add(): assert add(1, 2) == 3"
    }
    response = client.post("/generate-traceability", json=payload)
    assert response.status_code == 200
    assert "traceability" in response.json()
    assert "Covered" in response.json()["traceability"]
