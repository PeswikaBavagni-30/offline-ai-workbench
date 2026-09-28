import os
import shutil
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_full_project_lifecycle():
    project_name = "test_integration_project"
    project_dir = os.path.join("projects", project_name)

    # Clean up before test if existed
    if os.path.exists(project_dir):
        shutil.rmtree(project_dir)

    payload = {
        "project_name": project_name,
        "code": "def calculate(a, b):\n    return a + b\n",
        "tests": "from main import calculate\ndef test_add():\n    assert calculate(2, 3) == 5\n",
        "requirements": "REQ-001: System must add two numbers.\nREQ-002: System must return an integer.",
        "traceability": "| REQ-001 | Addition | calculate() | test_add() | Covered |",
        "analysis": "# Code Quality Report\nCode is clean and modular.",
        "documentation": "# Documentation\n`calculate(a, b)` sums two numbers.",
        "srs_filename": "srs_specification.pdf",
        "metadata": {
            "version": "1.0",
            "author": "Offline AI Workbench",
            "testResults": {"passed": 1, "failed": 0, "errors": 0, "execution_time": 0.05}
        }
    }

    # 1. Save project
    save_resp = client.post("/save-project", json=payload)
    assert save_resp.status_code == 200
    save_data = save_resp.json()
    assert "saved successfully" in save_data["message"]
    assert "main.py" in save_data["files"]
    assert "tests.py" in save_data["files"]
    assert "requirements.md" in save_data["files"]
    assert "requirements.txt" in save_data["files"]
    assert "traceability.md" in save_data["files"]
    assert "analysis.md" in save_data["files"]
    assert "documentation.md" in save_data["files"]
    assert "project.json" in save_data["files"]

    # 2. Check filesystem
    assert os.path.exists(os.path.join(project_dir, "main.py"))
    assert os.path.exists(os.path.join(project_dir, "tests.py"))
    assert os.path.exists(os.path.join(project_dir, "requirements.md"))
    assert os.path.exists(os.path.join(project_dir, "requirements.txt"))
    assert os.path.exists(os.path.join(project_dir, "traceability.md"))
    assert os.path.exists(os.path.join(project_dir, "analysis.md"))
    assert os.path.exists(os.path.join(project_dir, "documentation.md"))
    assert os.path.exists(os.path.join(project_dir, "project.json"))

    # 3. Load project
    load_resp = client.get(f"/projects/{project_name}")
    assert load_resp.status_code == 200
    loaded = load_resp.json()
    assert loaded["project_name"] == project_name
    assert "def calculate" in loaded["code"]
    assert "test_add" in loaded["tests"]
    assert "REQ-001" in loaded["requirements"]
    assert "traceability" in loaded and "Covered" in loaded["traceability"]
    assert "Code Quality Report" in loaded["analysis"]
    assert "calculate(a, b)" in loaded["documentation"]
    assert loaded["srs_filename"] == "srs_specification.pdf"
    assert loaded["metadata"]["version"] == "1.0"

    # 4. List projects
    list_resp = client.get("/projects")
    assert list_resp.status_code == 200
    assert project_name in list_resp.json()["projects"]

    # 5. Delete project
    del_resp = client.delete(f"/projects/{project_name}")
    assert del_resp.status_code == 200
    assert not os.path.exists(project_dir)
