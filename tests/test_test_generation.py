from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_run_pytest_execution_passed():
    code = """
def multiply(x, y):
    return x * y

def is_even(n):
    return n % 2 == 0
"""
    tests = """
from main import multiply, is_even

def test_multiply():
    assert multiply(3, 4) == 12

def test_is_even():
    assert is_even(6) is True
    assert is_even(7) is False
"""
    response = client.post("/run-tests", json={"code": code, "tests": tests})
    assert response.status_code == 200
    data = response.json()
    assert data["passed"] == 2
    assert data["failed"] == 0
    assert data["errors"] == 0
    assert data["returncode"] == 0


def test_run_pytest_execution_failed():
    code = """
def subtract(a, b):
    return a - b
"""
    tests = """
from main import subtract

def test_subtract_wrong():
    assert subtract(10, 5) == 999  # deliberate failure
"""
    response = client.post("/run-tests", json={"code": code, "tests": tests})
    assert response.status_code == 200
    data = response.json()
    assert data["failed"] == 1
    assert data["returncode"] != 0
    assert "assert 5 == 999" in data["output"]
