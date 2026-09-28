from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_run_code_success():
    payload = {
        "code": "print('Offline AI Workbench execution test')\nprint(40 + 2)"
    }
    response = client.post("/run-code", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "42" in data["output"]
    assert data["returncode"] == 0
    assert "security_note" in data


def test_run_code_runtime_error():
    payload = {
        "code": "def divide(a, b):\n    return a / b\nprint(divide(10, 0))"
    }
    response = client.post("/run-code", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["returncode"] != 0
    assert "ZeroDivisionError" in data["error"]


def test_run_code_security_block():
    payload = {
        "code": "import ctypes\nprint('Dangerous access')"
    }
    response = client.post("/run-code", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data.get("security_blocked") is True
    assert "Security Warning" in data["error"]


def test_run_code_output_limit():
    payload = {
        "code": "for _ in range(1500):\n    print('A' * 50)"
    }
    response = client.post("/run-code", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert len(data["output"]) <= 12000
    assert "... [Output truncated: maximum limit exceeded]" in data["output"]
