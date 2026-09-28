from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_debug_code_validation():
    response = client.post("/debug-code", json={"code": "", "error": ""})
    assert response.status_code == 422


@patch("backend.main.chat")
def test_debug_code_valid_payload(mock_chat):
    mock_msg = MagicMock()
    mock_msg.content = "BUG: Division by zero\nCAUSE: b is 0\nFIX: Check b != 0\nEXPLANATION: Added check"
    mock_chat.return_value.message = mock_msg

    payload = {
        "code": "def divide(a, b):\n    return a / b\n",
        "error": "ZeroDivisionError: division by zero"
    }
    response = client.post("/debug-code", json=payload)
    assert response.status_code == 200
    assert "debug" in response.json()
    assert "BUG:" in response.json()["debug"]
